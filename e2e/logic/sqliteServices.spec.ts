import { test, expect } from "@playwright/test"
import { makeSqliteServices, nextSequenceRaw } from "../../src/services/sqliteServices"
import type { SqlExecutor } from "../../src/db/sqliteRepo"

/**
 * SQLite master-service tests. A recording fake stands in for the Tauri SQL
 * plugin so we verify the SQL/params + transaction control flow each service
 * issues — no desktop runtime. `rowsBySql` lets a test script canned results
 * per matching SQL fragment.
 */

interface Call {
  kind: "run" | "query"
  sql: string
  params: unknown[]
}

function fakeExecutor(rowsBySql: { match: RegExp; rows: unknown[] }[] = [], lastInsertId = 1) {
  const calls: Call[] = []
  const exec: SqlExecutor = {
    async run(sql, params = []) {
      calls.push({ kind: "run", sql, params })
      return { rowsAffected: 1, lastInsertId }
    },
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ kind: "query", sql, params })
      const hit = rowsBySql.find((r) => r.match.test(sql))
      return (hit?.rows ?? []) as T[]
    },
  }
  return { exec, calls }
}

const sqlList = (calls: Call[]) => calls.map((c) => c.sql)

test("nextSequenceRaw reads then upserts the counter and formats the code", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 4 }] }])
  const seq = await nextSequenceRaw(exec, "invoice", { prefix: "INV" })
  expect(seq).toEqual({ value: 5, code: "INV0005" })
  expect(calls[0].sql).toContain("SELECT value FROM counters")
  expect(calls[1].sql).toContain("ON CONFLICT(key) DO UPDATE")
  expect(calls[1].params).toEqual(["invoice", 5])
})

test("nextSequence starts at 1 when the counter row is absent", async () => {
  const { exec } = fakeExecutor()
  const { itemsService } = makeSqliteServices(exec)
  // add() mints a tag via the counter — no existing row → value 1.
  const item = await itemsService.add({
    name: "Ring", type: "gold", category: "Ring", purity: "22K",
    grossWt: 10, stoneWt: 0, makingChargePerGm: 500, tagPrefix: "RIN",
  } as never)
  expect(item.tag).toBe("RIN0001")
})

test("itemsService.add mints a tag, derives netWt, and is transactional", async () => {
  const { exec, calls } = fakeExecutor([], 7)
  const { itemsService } = makeSqliteServices(exec)

  const item = await itemsService.add({
    name: "Bangle", type: "gold", category: "Bangle", purity: "22K",
    grossWt: 12.5, stoneWt: 0.5, makingChargePerGm: 400, tagPrefix: "BAN",
  } as never)

  expect(item.id).toBe(7)
  expect(item.tag).toBe("BAN0001")
  expect(item.netWt).toBe(12) // 12.5 - 0.5
  expect(item.status).toBe("in_stock")
  // Wrapped in a transaction: BEGIN … COMMIT with the item INSERT inside.
  const sqls = sqlList(calls)
  expect(sqls[0]).toBe("BEGIN")
  expect(sqls[sqls.length - 1]).toBe("COMMIT")
  expect(sqls.some((s) => s.includes('INSERT INTO "items"'))).toBeTruthy()
})

test("itemsService.update recomputes netWt when a weight changes", async () => {
  const { exec, calls } = fakeExecutor([
    { match: /SELECT \* FROM "items" WHERE "id"/, rows: [{ id: 1, grossWt: 10, stoneWt: 0, netWt: 10 }] },
  ])
  const { itemsService } = makeSqliteServices(exec)
  await itemsService.update(1, { stoneWt: 2 })
  const update = calls.find((c) => c.sql.startsWith("UPDATE"))!
  // netWt recomputed to 8 and included in the UPDATE params.
  expect(update.params).toContain(8)
})

test("itemsService.getInStock filters on status", async () => {
  const { exec, calls } = fakeExecutor([{ match: /FROM items WHERE COALESCE/, rows: [] }])
  const { itemsService } = makeSqliteServices(exec)
  await itemsService.getInStock()
  expect(calls[0].sql).toContain("COALESCE(status, 'in_stock') = 'in_stock'")
})

test("itemsService.search builds a case-insensitive LIKE across tag/name/huid", async () => {
  const { exec, calls } = fakeExecutor([{ match: /LIKE/, rows: [] }])
  const { itemsService } = makeSqliteServices(exec)
  await itemsService.search("Chain")
  expect(calls[0].sql).toMatch(/lower\(tag\) LIKE \$1 OR lower\(name\) LIKE \$1/)
  expect(calls[0].params).toEqual(["%chain%"])
})

test("customersService.add defaults loyalty + opening balance", async () => {
  const { exec, calls } = fakeExecutor([], 3)
  const { customersService } = makeSqliteServices(exec)
  const c = await customersService.add({ name: "Asha", mobile: "98" } as never)
  expect(c.id).toBe(3)
  const insert = calls.find((x) => x.sql.includes('INSERT INTO "customers"'))!
  // loyaltyPoints (0) and openingBalance (0) are persisted.
  expect(insert.params).toContain(0)
})

test("customersService.getOutstanding = opening + invoice balances − receipts", async () => {
  const { exec } = fakeExecutor([
    { match: /SELECT \* FROM "customers" WHERE "id"/, rows: [{ id: 1, openingBalance: 5000 }] },
    { match: /FROM sales_invoices WHERE customerId/, rows: [{ s: 3000 }] },
    { match: /FROM receipts WHERE customerId/, rows: [{ s: 2000 }] },
  ])
  const { customersService } = makeSqliteServices(exec)
  expect(await customersService.getOutstanding(1)).toBe(6000) // 5000 + 3000 - 2000
})

/* ---- atomic createInvoice ---- */

type Draft = Parameters<ReturnType<typeof makeSqliteServices>["salesService"]["createInvoice"]>[0]

const draft = (over: Partial<Draft["invoice"]> = {}, items: Draft["items"] = [], urd: Draft["urd"] = []): Draft => ({
  invoice: {
    customerId: 1, date: "2026-07-05",
    totalGrossAmount: 65000, totalUrdAmount: 0, taxableAmount: 65000,
    cgst: 975, sgst: 975, netAmount: 66950, cashPaid: 66950, upiPaid: 0, balance: 0,
    ...over,
  } as Draft["invoice"],
  items,
  urd,
})

test("createInvoice runs the whole sale in one transaction (happy path)", async () => {
  const { exec, calls } = fakeExecutor(
    [
      { match: /SELECT value FROM counters/, rows: [{ value: 0 }] },
      { match: /SELECT \* FROM "customers" WHERE "id"/, rows: [{ id: 1, loyaltyPoints: 5 }] },
    ],
    100,
  )
  const { salesService } = makeSqliteServices(exec)

  const inv = await salesService.createInvoice(
    draft(
      { pointsEarned: 10, pointsRedeemed: 0, orderId: 7 },
      [{ itemId: 42, description: "Ring", netWt: 10, rate: 6000, makingAmount: 5000, finalAmount: 65000 }],
      [{ description: "Old gold", type: "gold", purity: "22K", grossWt: 5, deductionWt: 0, netWt: 5, rate: 5000, amount: 25000 }],
    ),
  )

  expect(inv.invoiceNo).toBe("INV0001")
  expect(inv.id).toBe(100)

  const sqls = sqlList(calls)
  // Ordered, all within BEGIN…COMMIT.
  expect(sqls[0]).toBe("BEGIN")
  expect(sqls[sqls.length - 1]).toBe("COMMIT")
  const idx = (frag: string) => sqls.findIndex((s) => s.includes(frag))
  expect(idx("SELECT value FROM counters")).toBeGreaterThan(0)
  expect(idx('INSERT INTO "sales_invoices"')).toBeGreaterThan(idx("ON CONFLICT(key)"))
  expect(idx('INSERT INTO "sales_items"')).toBeGreaterThan(idx('INSERT INTO "sales_invoices"'))
  expect(idx('INSERT INTO "urd_items"')).toBeGreaterThan(idx('INSERT INTO "sales_items"'))
  expect(idx('UPDATE "items"')).toBeGreaterThan(0) // stock marked sold
  expect(idx('UPDATE "customers"')).toBeGreaterThan(0) // loyalty applied
  expect(idx('UPDATE "orders"')).toBeGreaterThan(0) // order fulfilled

  // Loyalty delta 10 applied on top of existing 5 → 15.
  const custUpdate = calls.find((c) => c.sql.startsWith('UPDATE "customers"'))!
  expect(custUpdate.params).toContain(15)
  // The order is marked delivered with the new invoice id.
  const orderUpdate = calls.find((c) => c.sql.startsWith('UPDATE "orders"'))!
  expect(orderUpdate.params).toContain("delivered")
  expect(orderUpdate.params).toContain(100)
})

test("createInvoice rolls back and rethrows if a line insert fails", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 0 }] }], 100)
  // Make the sales_items insert blow up.
  const origRun = exec.run
  exec.run = async (sql, params) => {
    if (sql.includes('INSERT INTO "sales_items"')) throw new Error("disk full")
    return origRun(sql, params)
  }
  const { salesService } = makeSqliteServices(exec)

  await expect(
    salesService.createInvoice(
      draft({}, [{ itemId: 1, description: "Ring", netWt: 10, rate: 6000, makingAmount: 5000, finalAmount: 65000 }]),
    ),
  ).rejects.toThrow("disk full")

  const sqls = sqlList(calls)
  expect(sqls).toContain("ROLLBACK")
  expect(sqls).not.toContain("COMMIT")
})

test("createInvoice skips loyalty/order/urd steps when not applicable", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 0 }] }], 100)
  const { salesService } = makeSqliteServices(exec)

  await salesService.createInvoice(
    draft({ pointsEarned: 0, pointsRedeemed: 0 }, [
      { description: "Untagged item", netWt: 2, rate: 6000, makingAmount: 0, finalAmount: 12000 },
    ]),
  )

  const sqls = sqlList(calls)
  expect(sqls.some((s) => s.includes('INSERT INTO "urd_items"'))).toBeFalsy()
  expect(sqls.some((s) => s.startsWith('UPDATE "customers"'))).toBeFalsy() // no loyalty delta
  expect(sqls.some((s) => s.startsWith('UPDATE "orders"'))).toBeFalsy() // no order
  expect(sqls.some((s) => s.startsWith('UPDATE "items"'))).toBeFalsy() // untagged, no itemId
})

/* ---- updateInvoice ---- */

test("updateInvoice restores old stock, clears lines, and re-marks sold", async () => {
  const { exec, calls } = fakeExecutor([
    { match: /FROM "sales_invoices" WHERE "id"/, rows: [{ id: 5, invoiceNo: "INV0001", date: "2026-01-01" }] },
    { match: /FROM "sales_items" WHERE "invoiceId"/, rows: [{ id: 1, itemId: 42, invoiceId: 5 }] },
  ])
  const { salesService } = makeSqliteServices(exec)

  await salesService.updateInvoice(
    5,
    draft({}, [{ itemId: 99, description: "New Ring", netWt: 8, rate: 6000, makingAmount: 4000, finalAmount: 52000 }]),
  )

  const runs = calls.filter((c) => c.kind === "run")
  const sqls = runs.map((c) => c.sql)
  // Old tagged item restored to stock, then new one marked sold.
  const itemUpdates = runs.filter((c) => c.sql.startsWith('UPDATE "items"'))
  expect(itemUpdates.some((c) => c.params.includes("in_stock") && c.params.includes(42))).toBeTruthy()
  expect(itemUpdates.some((c) => c.params.includes("sold") && c.params.includes(99))).toBeTruthy()
  expect(sqls).toContain('DELETE FROM "sales_items" WHERE "invoiceId" = $1')
  expect(sqls).toContain('DELETE FROM "urd_items" WHERE "invoiceId" = $1')
  expect(sqls.some((s) => s.startsWith('UPDATE "sales_invoices"'))).toBeTruthy()
})

/* ---- loans.addPayment (interest allocation + capitalisation + closure) ---- */

const loanRows = (over: Record<string, unknown> = {}) => [
  {
    id: 1, loanNo: "GRV0001", customerId: 1, date: "2024-01-01",
    itemsPledged: "[]", grossWt: 20, netWt: 20, loanAmount: 100000, interestRate: 2,
    interestMode: "monthly", isClosed: 0, principalOutstanding: 100000, ...over,
  },
]

function loanExecutor(payments: unknown[] = [], lastInsertId = 50, loanOver = {}) {
  return fakeExecutor(
    [
      { match: /FROM "loans" WHERE "id"/, rows: loanRows(loanOver) },
      { match: /FROM "loan_payments" WHERE "loanId"/, rows: payments },
    ],
    lastInsertId,
  )
}

test("addPayment: a part payment clears interest first, then principal", async () => {
  const { exec, calls } = loanExecutor()
  const { loansService } = makeSqliteServices(exec)
  // 3 months @2% on 100000 = 6000 interest outstanding on 2024-04-01.
  const rec = await loansService.addPayment(1, { date: "2024-04-01", amount: 10000, type: "part" })

  expect(rec.towardsInterest).toBe(6000)
  expect(rec.towardsPrincipal).toBe(4000)
  expect(rec.capitalisedInterest).toBeUndefined()
  const loanUpdate = calls.find((c) => c.sql.startsWith('UPDATE "loans"'))!
  expect(loanUpdate.params).toContain(96000) // principal reduced
  expect(loanUpdate.params).toContain(0) // isClosed false → 0 (still open)
})

test("addPayment: a renewal capitalises unpaid interest and never closes", async () => {
  const { exec, calls } = loanExecutor()
  const { loansService } = makeSqliteServices(exec)
  const rec = await loansService.addPayment(1, { date: "2024-04-01", amount: 0, type: "renewal" })

  expect(rec.capitalisedInterest).toBe(6000) // unpaid interest rolled into principal
  const loanUpdate = calls.find((c) => c.sql.startsWith('UPDATE "loans"'))!
  expect(loanUpdate.params).toContain(106000) // principal compounded
  expect(loanUpdate.params).toContain(0) // renewal never closes
})

test("addPayment: full payment closes the loan (principal + interest cleared)", async () => {
  const { exec, calls } = loanExecutor()
  const { loansService } = makeSqliteServices(exec)
  // 6000 interest + 100000 principal = 106000 fully settles.
  await loansService.addPayment(1, { date: "2024-04-01", amount: 106000, type: "closure" })

  const loanUpdate = calls.find((c) => c.sql.startsWith('UPDATE "loans"'))!
  expect(loanUpdate.params).toContain(1) // isClosed true → 1
  expect(loanUpdate.params).toContain("2024-04-01") // closedDate
})

test("addPayment throws (and rolls back) when the loan is missing", async () => {
  const { exec, calls } = fakeExecutor([{ match: /FROM "loans" WHERE "id"/, rows: [] }])
  const { loansService } = makeSqliteServices(exec)
  await expect(loansService.addPayment(99, { date: "2024-04-01", amount: 1, type: "part" })).rejects.toThrow(/not found/i)
  expect(sqlList(calls)).toContain("ROLLBACK")
})

/* ---- karigar / refining / schemes / purchase ---- */

test("issueJob mints a job number and debits the karigar's metal ledger", async () => {
  const { exec, calls } = fakeExecutor([{ match: /FROM "karigars" WHERE "id"/, rows: [{ id: 1, metalBalanceWt: 10 }] }], 20)
  const { karigarsService } = makeSqliteServices(exec)
  const job = await karigarsService.issueJob({ karigarId: 1, issuedDate: "2026-01-01", metalIssuedWt: 5, description: "chain" } as never)
  expect(job.jobNo).toBe("JOB0001")
  expect(job.status).toBe("issued")
  const kUpdate = calls.find((c) => c.sql.startsWith('UPDATE "karigars"'))!
  expect(kUpdate.params).toContain(15) // 10 + 5
})

test("receiveJob credits finished weight plus wastage back", async () => {
  const { exec, calls } = fakeExecutor([
    { match: /FROM "karigar_jobs" WHERE "id"/, rows: [{ id: 1, karigarId: 1, metalIssuedWt: 10 }] },
    { match: /FROM "karigars" WHERE "id"/, rows: [{ id: 1, metalBalanceWt: 10 }] },
  ])
  const { karigarsService } = makeSqliteServices(exec)
  await karigarsService.receiveJob(1, 9, 5) // credited = 9 + (10*5/100) = 9.5
  const kUpdate = calls.find((c) => c.sql.startsWith('UPDATE "karigars"'))!
  expect(kUpdate.params).toContain(0.5) // 10 - 9.5
})

test("refining.create melts the source and mints refined bullion stock", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 0 }] }], 5)
  const { refiningService } = makeSqliteServices(exec)
  const ref = await refiningService.create({
    sourceItemId: 3, date: "2026-01-01", description: "scrap", type: "gold",
    inputWt: 10, inputFinePct: 90, refiningLossPct: 2, outputWt: 9, outputPurity: "24K (995)",
  } as never)
  expect(ref.refiningNo).toBe("REF0001")
  const runs = calls.filter((c) => c.kind === "run").map((c) => c.sql)
  expect(runs.some((s) => s.startsWith('UPDATE "items"'))).toBeTruthy() // source melted
  expect(runs.some((s) => s.includes('INSERT INTO "items"'))).toBeTruthy() // bullion minted
  expect(runs.some((s) => s.includes('INSERT INTO "refinings"'))).toBeTruthy()
})

test("schemes.addPayment guards against double-paying a slot", async () => {
  const { exec } = fakeExecutor([{ match: /FROM "scheme_payments" WHERE "accountId"/, rows: [{ installmentNo: 1 }] }])
  const { schemesService } = makeSqliteServices(exec)
  await expect(schemesService.addPayment(1, 1000, "2026-01-01", "cash", 1)).rejects.toThrow(/already paid/i)
})

test("schemes.addPayment fills the lowest unpaid slot when none is given", async () => {
  const { exec, calls } = fakeExecutor([{ match: /FROM "scheme_payments" WHERE "accountId"/, rows: [{ installmentNo: 1 }] }], 8)
  const { schemesService } = makeSqliteServices(exec)
  const pay = await schemesService.addPayment(1, 1000, "2026-01-01")
  expect(pay.installmentNo).toBe(2)
  const insert = calls.find((c) => c.sql.includes('INSERT INTO "scheme_payments"'))!
  expect(insert.params).toContain(2)
})

test("purchase.create mints a number and inserts header + lines atomically", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 0 }] }], 11)
  const { purchaseService } = makeSqliteServices(exec)
  const inv = await purchaseService.create({
    invoice: { supplierId: 1, date: "2026-01-01", totalGrossAmount: 50000, cgst: 0, sgst: 0, netAmount: 50000, amountPaid: 50000, balance: 0 },
    items: [{ description: "Gold bar", type: "gold", purity: "24K", grossWt: 10, netWt: 10, rate: 5000, makingAmount: 0, amount: 50000 }],
  } as never)
  expect(inv.purchaseNo).toBe("PUR0001")
  const sqls = sqlList(calls)
  expect(sqls[0]).toBe("BEGIN")
  expect(sqls[sqls.length - 1]).toBe("COMMIT")
  expect(sqls.some((s) => s.includes('INSERT INTO "purchase_invoices"'))).toBeTruthy()
  expect(sqls.some((s) => s.includes('INSERT INTO "purchase_items"'))).toBeTruthy()
})
