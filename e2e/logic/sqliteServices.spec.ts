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

test("itemsService.getByIds builds an IN clause (and short-circuits empty)", async () => {
  const { exec, calls } = fakeExecutor([{ match: /WHERE id IN/, rows: [{ id: 1, tag: "A" }, { id: 2, tag: "B" }] }])
  const { itemsService } = makeSqliteServices(exec)
  const rows = await itemsService.getByIds([1, 2])
  expect(rows).toHaveLength(2)
  expect(calls[0].sql).toContain("WHERE id IN ($1, $2)")
  expect(calls[0].params).toEqual([1, 2])
  // Empty input never hits the DB.
  const before = calls.length
  expect(await itemsService.getByIds([])).toEqual([])
  expect(calls.length).toBe(before)
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
  // Phase 3: the atomic audit trail — bullion lot + movement + inventory ledger.
  expect(runs.some((s) => s.includes('INSERT INTO "bullion_stock"'))).toBeTruthy()
  expect(runs.some((s) => s.includes('INSERT INTO "bullion_movement"'))).toBeTruthy()
  expect(runs.some((s) => s.includes('INSERT INTO "inventory_ledger"'))).toBeTruthy()
})

test("refining.reverse restores the source and voids the produced bullion", async () => {
  const { exec, calls } = fakeExecutor([
    {
      match: /FROM "refinings" WHERE "id"/,
      rows: [{ id: 1, refiningNo: "REF0001", status: "completed", sourceItemId: 3, outputItemId: 5, inputWt: 10 }],
    },
    { match: /FROM "items" WHERE "id"/, rows: [{ id: 5, status: "in_stock" }] },
    { match: /FROM "bullion_stock" WHERE "refiningId"/, rows: [{ id: 7, itemId: 5, weight: 9, bullionNo: "GB000001" }] },
  ])
  const { refiningService } = makeSqliteServices(exec)
  await refiningService.reverse(1, { by: "admin" })
  const runs = calls.filter((c) => c.kind === "run").map((c) => c.sql)
  expect(runs.some((s) => s.startsWith('UPDATE "items"'))).toBeTruthy() // source restored
  expect(runs.some((s) => s.startsWith('DELETE FROM "items"'))).toBeTruthy() // bullion item removed
  expect(runs.some((s) => s.startsWith('UPDATE "bullion_stock"'))).toBeTruthy() // bullion voided
  expect(runs.some((s) => s.includes('INSERT INTO "inventory_ledger"'))).toBeTruthy()
  const refUpdate = calls.find((c) => c.sql.startsWith('UPDATE "refinings"'))!
  expect(refUpdate.params).toContain("reversed")
})

test("refining.reverse refuses when the bullion was already sold", async () => {
  const { exec, calls } = fakeExecutor([
    { match: /FROM "refinings" WHERE "id"/, rows: [{ id: 1, refiningNo: "REF0001", status: "completed", outputItemId: 5, inputWt: 10 }] },
    { match: /FROM "items" WHERE "id"/, rows: [{ id: 5, status: "sold" }] },
  ])
  const { refiningService } = makeSqliteServices(exec)
  await expect(refiningService.reverse(1)).rejects.toThrow(/already been sold/i)
  expect(sqlList(calls)).toContain("ROLLBACK")
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

test("buyOldGold adds scrap to loose stock (ledger IN) and books a cash payout voucher", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 0 }] }], 20)
  const { operationsService } = makeSqliteServices(exec)
  const res = await operationsService.buyOldGold({
    date: "2026-07-16",
    party: "Walk-in",
    mode: "cash",
    lines: [{ description: "Old chain", type: "gold", netWt: 20, purity: "22K (916)", fineWt: 18.32, rate: 6000, amount: 109920 }],
  })
  expect(res.voucherNo).toBe("PV0001")
  expect(res.total).toBe(109920)
  const sqls = sqlList(calls)
  expect(sqls[0]).toBe("BEGIN")
  expect(sqls[sqls.length - 1]).toBe("COMMIT")
  // scrap → loose metal IN
  const led = calls.filter((c) => /INSERT INTO "inventory_ledger"/.test(c.sql))
  expect(led.length).toBe(1)
  expect(led[0].params).toContain("old_gold_purchase")
  // cash payout → a payment voucher (feeds the Day Book)
  expect(calls.some((c) => /INSERT INTO "cash_vouchers"/.test(c.sql) && c.params.includes("Old Gold Purchase"))).toBeTruthy()
})

test("purchase.create logs Material Out scrap as a metal ledger OUT (metal-to-metal)", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 0 }] }], 12)
  const { purchaseService } = makeSqliteServices(exec)
  await purchaseService.create({
    invoice: { supplierId: 1, date: "2026-07-16", totalGrossAmount: 100000, cgst: 0, sgst: 0, netAmount: 100000, materialOutValue: 40000, materialOutFineWt: 366.4, amountPaid: 60000, balance: 0 },
    items: [{ description: "Raw gold", type: "gold", purity: "24K", grossWt: 500, netWt: 500, rate: 200, makingAmount: 0, amount: 100000 }],
    materialOut: [{ description: "Old scrap", type: "gold", grossWt: 400, netWt: 400, purity: "22K (916)", fineWt: 366.4, rate: 100, amount: 36640 }],
  } as never)
  // the scrap becomes an inventory_ledger OUT row with refType material_out
  const ledgerInserts = calls.filter((c) => /INSERT INTO "inventory_ledger"/.test(c.sql))
  expect(ledgerInserts.length).toBe(2) // purchase IN + material OUT
  expect(ledgerInserts.some((c) => c.params.includes("material_out"))).toBeTruthy()
  expect(ledgerInserts.some((c) => c.params.includes("out"))).toBeTruthy()
})

test("salesService.getFull returns header + lines + urd (or null)", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM "sales_invoices" WHERE "id"/, rows: [{ id: 5, invoiceNo: "INV5" }] },
    { match: /FROM "sales_items" WHERE "invoiceId"/, rows: [{ id: 1, invoiceId: 5, description: "Ring" }] },
    { match: /FROM "urd_items" WHERE "invoiceId"/, rows: [{ id: 1, invoiceId: 5, description: "Old gold" }] },
  ])
  const { salesService } = makeSqliteServices(exec)
  const full = await salesService.getFull(5)
  expect(full?.invoice.invoiceNo).toBe("INV5")
  expect(full?.items).toHaveLength(1)
  expect(full?.urd).toHaveLength(1)

  const { exec: exec2 } = fakeExecutor([{ match: /FROM "sales_invoices" WHERE "id"/, rows: [] }])
  expect(await makeSqliteServices(exec2).salesService.getFull(99)).toBeNull()
})

test("loansService.getOpen filters out closed loans", async () => {
  const { exec, calls } = fakeExecutor([{ match: /FROM "loans"/, rows: [] }])
  const { loansService } = makeSqliteServices(exec)
  await loansService.getOpen()
  expect(calls[0].sql).toContain("COALESCE(isClosed, 0) = 0")
})

/* ---- soft-block (block instead of delete): refiners / loans / vouchers ---- */

test("getAll excludes blocked records; getBlocked selects only them", async () => {
  for (const svc of ["refiners", "loans", "cash_vouchers"] as const) {
    const all = fakeExecutor([{ match: new RegExp(`FROM "${svc}"`), rows: [] }])
    const s = makeSqliteServices(all.exec)
    if (svc === "refiners") { await s.refinersService.getAll(); await s.refinersService.getBlocked() }
    else if (svc === "loans") { await s.loansService.getAll(); await s.loansService.getBlocked() }
    else { await s.operationsService.getVouchers("2026-07-15"); await s.operationsService.getBlockedVouchers("2026-07-15") }
    expect(all.calls[0].sql, `${svc} getAll`).toContain("COALESCE(blocked,0)=0")
    expect(all.calls[1].sql, `${svc} getBlocked`).toContain("COALESCE(blocked,0)=1")
  }
})

test("block sets blocked=1 and writes an audit row (loan example)", async () => {
  const { exec, calls } = fakeExecutor([
    { match: /FROM "loans" WHERE "id"/, rows: [{ id: 7, loanNo: "GRV0007" }] },
  ])
  const { loansService } = makeSqliteServices(exec)
  await loansService.block(7, { user: "Owner", role: "owner", reason: "duplicate entry" })
  const update = calls.find((c) => /UPDATE "loans"/.test(c.sql))
  expect(update, "loan update ran").toBeTruthy()
  expect(update!.params).toContain(1) // blocked coerced true -> 1
  expect(calls.some((c) => /INSERT INTO "audit_log"/.test(c.sql) && c.params.includes("block_loan"))).toBeTruthy()
})

test("block is refused for a staff role (irreversible_stock gate)", async () => {
  const { exec } = fakeExecutor([{ match: /FROM "refiners"/, rows: [{ id: 1, name: "X" }] }])
  const { refinersService } = makeSqliteServices(exec)
  await expect(refinersService.block(1, { user: "S", role: "staff", reason: "x" })).rejects.toThrow(/restricted/)
})

test("day-close voucher cash excludes blocked vouchers", async () => {
  const { exec, calls } = fakeExecutor([
    { match: /FROM "day_closings"/, rows: [] },
    { match: /SUM\(cashPaid\)/, rows: [{ n: 0 }] },
    { match: /FROM cash_vouchers/, rows: [{ n: 0 }] },
  ])
  const { operationsService } = makeSqliteServices(exec)
  await operationsService.closeDay({ date: "2026-07-15", openingCash: 0, physicalCash: 0 })
  const voucherSum = calls.find((c) => /FROM cash_vouchers WHERE/.test(c.sql))
  expect(voucherSum!.sql).toContain("COALESCE(blocked,0)=0")
})

/* ---- read / report layer ---- */

test("reportsService.getDayBook aggregates the day's invoices", async () => {
  const { exec } = fakeExecutor([
    {
      match: /FROM "sales_invoices"/,
      rows: [
        { totalGrossAmount: 65000, totalUrdAmount: 0, cgst: 975, sgst: 975, igst: 0, cashPaid: 66950, upiPaid: 0, balance: 0 },
        { totalGrossAmount: 20000, totalUrdAmount: 5000, cgst: 300, sgst: 300, igst: 0, cashPaid: 10000, upiPaid: 0, balance: 10600 },
      ],
    },
  ])
  const { reportsService } = makeSqliteServices(exec)
  const day = await reportsService.getDayBook("2026-07-05")
  expect(day.invoiceCount).toBe(2)
  expect(day.totalSales).toBe(85000)
  expect(day.totalUrdPurchase).toBe(5000)
  expect(day.totalTax).toBe(2550) // 975+975+300+300
  expect(day.cashCollected).toBe(76950)
  expect(day.outstandingCreated).toBe(10600)
})

test("ledgerService.customerLedger runs a chronological running balance", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM "customers" WHERE "id"/, rows: [{ id: 1, openingBalance: 1000, createdAt: "2026-01-01T00:00:00Z" }] },
    { match: /FROM "sales_invoices" WHERE customerId/, rows: [{ date: "2026-02-01", invoiceNo: "INV1", netAmount: 5000, cashPaid: 2000, upiPaid: 0 }] },
    { match: /FROM "receipts" WHERE customerId/, rows: [{ date: "2026-03-01", receiptNo: "RCP1", mode: "cash", amount: 1500 }] },
  ])
  const { ledgerService } = makeSqliteServices(exec)
  const led = await ledgerService.customerLedger(1)
  expect(led.opening).toBe(1000)
  // 1000 + 5000 (invoice) - 2000 (paid w/ bill) - 1500 (receipt) = 2500
  expect(led.closing).toBe(2500)
  expect(led.rows[0].particulars).toBe("Opening Balance")
})

test("ledgerService.cashBook sums inflows and outflows for the day", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM "sales_invoices"/, rows: [{ invoiceNo: "INV1", cashPaid: 10000, upiPaid: 5000 }] },
    { match: /FROM "receipts"/, rows: [{ receiptNo: "RCP1", amount: 2000 }] },
    { match: /FROM "orders"/, rows: [{ orderNo: "ORD1", advanceReceived: 3000 }] },
    { match: /FROM "loans"/, rows: [{ loanNo: "GRV1", date: "2026-07-05", loanAmount: 50000, isClosed: 0 }] },
    { match: /FROM "purchase_invoices"/, rows: [{ purchaseNo: "PUR1", amountPaid: 8000 }] },
  ])
  const { ledgerService } = makeSqliteServices(exec)
  const cb = await ledgerService.cashBook("2026-07-05")
  expect(cb.totalIn).toBe(20000) // 15000 sale + 2000 receipt + 3000 advance
  expect(cb.totalOut).toBe(58000) // 50000 loan disbursed + 8000 purchase
  expect(cb.net).toBe(-38000)
})

test("ledgerService.gstr1 classifies B2B (has GSTIN) vs B2C", async () => {
  const { exec } = fakeExecutor([
    {
      match: /FROM "sales_invoices" WHERE date LIKE/,
      rows: [
        { invoiceNo: "INV1", date: "2026-07-02", customerId: 1, taxableAmount: 1000, cgst: 15, sgst: 15, igst: 0, netAmount: 1030 },
        { invoiceNo: "INV2", date: "2026-07-01", customerId: 2, taxableAmount: 2000, cgst: 30, sgst: 30, igst: 0, netAmount: 2060 },
      ],
    },
    { match: /FROM "customers"/, rows: [
      { id: 1, name: "GST Co", gstin: "27ABCDE1234F1Z5" },
      { id: 2, name: "Retail", gstin: "" },
    ] },
  ])
  const { ledgerService } = makeSqliteServices(exec)
  const rows = await ledgerService.gstr1("2026-07")
  expect(rows[0].date).toBe("2026-07-01") // sorted
  const byNo = Object.fromEntries(rows.map((r) => [r.invoiceNo, r.type]))
  expect(byNo.INV1).toBe("B2B")
  expect(byNo.INV2).toBe("B2C")
})

test("schemesService.getSchedule spans the plan and flags paid slots", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM "scheme_accounts" WHERE "id"/, rows: [{ id: 1, schemeId: 9, startDate: "2026-01-10" }] },
    { match: /FROM "schemes" WHERE "id"/, rows: [{ id: 9, durationMonths: 11, monthlyAmount: 5000 }] },
    { match: /FROM "scheme_payments" WHERE "accountId"/, rows: [{ id: 1, installmentNo: 1, date: "2026-01-10", mode: "cash" }] },
  ])
  const { schemesService } = makeSqliteServices(exec)
  const sched = await schemesService.getSchedule(1)
  expect(sched).toHaveLength(11)
  expect(sched[0].paid).toBe(true)
  expect(sched[1].paid).toBe(false)
  expect(sched[1].dueDate).toBe("2026-02-10")
})

test("ledgerService.gstHsnSummary splits tax by line value and rolls up by HSN", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM companies WHERE id/, rows: [{ defaultHsnCode: "7113" }] },
    {
      match: /FROM "sales_invoices" WHERE date LIKE/,
      rows: [{ id: 1, date: "2026-07-05", totalGrossAmount: 100000, taxableAmount: 100000, cgst: 1500, sgst: 1500, igst: 0 }],
    },
    {
      match: /FROM sales_items WHERE invoiceId IN/,
      rows: [
        { invoiceId: 1, itemId: 10, hsn: "7113", finalAmount: 60000, netWt: 6 },
        { invoiceId: 1, itemId: 11, hsn: "7114", finalAmount: 40000, netWt: 4 },
      ],
    },
    { match: /FROM items WHERE id IN/, rows: [{ id: 10, quantity: 1 }, { id: 11, quantity: 2 }] },
  ])
  const { ledgerService } = makeSqliteServices(exec)
  const summary = await ledgerService.gstHsnSummary("2026-07")
  const byHsn = Object.fromEntries(summary.map((r) => [r.hsn, r]))

  // 7113 line = 60% of the bill → 60000 taxable, 900 CGST, qty 1, 6g.
  expect(byHsn["7113"].taxableValue).toBe(60000)
  expect(byHsn["7113"].cgst).toBe(900)
  expect(byHsn["7113"].qty).toBe(1)
  expect(byHsn["7113"].netWt).toBe(6)
  // 7114 line = 40% → 40000 taxable, 600 CGST, qty 2 (from stock), 4g.
  expect(byHsn["7114"].taxableValue).toBe(40000)
  expect(byHsn["7114"].cgst).toBe(600)
  expect(byHsn["7114"].qty).toBe(2)
})

test("ledgerService.gstHsnSummary returns [] for a month with no invoices", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM companies WHERE id/, rows: [{ defaultHsnCode: "7113" }] },
    { match: /FROM "sales_invoices" WHERE date LIKE/, rows: [] },
  ])
  const { ledgerService } = makeSqliteServices(exec)
  expect(await ledgerService.gstHsnSummary("2026-01")).toEqual([])
})

test("suppliersService.getOutstanding = opening + unpaid purchase balances", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM "suppliers" WHERE "id"/, rows: [{ id: 1, openingBalance: 2000 }] },
    { match: /FROM purchase_invoices WHERE supplierId/, rows: [{ s: 7000 }] },
  ])
  const { suppliersService } = makeSqliteServices(exec)
  expect(await suppliersService.getOutstanding(1)).toBe(9000)
})

test("ordersService.getOpen filters out delivered/cancelled", async () => {
  const { exec, calls } = fakeExecutor([{ match: /FROM "orders"/, rows: [] }])
  const { ordersService } = makeSqliteServices(exec)
  await ordersService.getOpen()
  expect(calls[0].sql).toContain("status NOT IN ('delivered','cancelled')")
})

test("receiptsService.add mints RCP number transactionally", async () => {
  const { exec, calls } = fakeExecutor([{ match: /SELECT value FROM counters/, rows: [{ value: 0 }] }], 4)
  const { receiptsService } = makeSqliteServices(exec)
  const r = await receiptsService.add({ customerId: 1, date: "2026-07-05", amount: 500, mode: "cash" } as never)
  expect(r.receiptNo).toBe("RCP0001")
  expect(r.id).toBe(4)
  const sqls = sqlList(calls)
  expect(sqls[0]).toBe("BEGIN")
  expect(sqls[sqls.length - 1]).toBe("COMMIT")
})

/* ---- tag gold from loose weight (buy by weight, tag later) ---- */

test("goldLooseBalances returns only positive gold pools, largest first", async () => {
  const { exec } = fakeExecutor([
    { match: /FROM inventory_ledger WHERE metalType='gold' GROUP BY/, rows: [
      { category: "Bullion", w: 100 }, { category: "Scrap", w: -2 }, { category: "Ring", w: 12.5 },
    ] },
  ])
  const { itemsService } = makeSqliteServices(exec)
  expect(await itemsService.goldLooseBalances()).toEqual([
    { category: "Bullion", weight: 100 },
    { category: "Ring", weight: 12.5 },
  ])
})

test("tagFromLooseGold refuses pieces exceeding available loose gold", async () => {
  const { exec } = fakeExecutor([
    { match: /WHERE metalType='gold' AND category/, rows: [{ w: 5 }] }, // only 5 g available
  ])
  const { itemsService } = makeSqliteServices(exec)
  await expect(
    itemsService.tagFromLooseGold({
      sourceCategory: "Bullion",
      pieces: [{ category: "Ring", purity: "22K (916)", grossWt: 8, tagPrefix: "RIN" }],
    }),
  ).rejects.toThrow(/Only 5 g loose gold/)
})

test("tagFromLooseGold mints a tag and moves weight loose→category atomically", async () => {
  const { exec, calls } = fakeExecutor(
    [
      { match: /WHERE metalType='gold' AND category/, rows: [{ w: 100 }] },
      { match: /SELECT value FROM counters/, rows: [{ value: 6 }] },
    ],
    42,
  )
  const { itemsService } = makeSqliteServices(exec)
  const res = await itemsService.tagFromLooseGold({
    sourceCategory: "Bullion",
    user: "Owner",
    pieces: [{ category: "Ring", purity: "22K (916)", grossWt: 8.2, stoneWt: 0, makingChargePerGm: 500, tagPrefix: "RIN" }],
  })
  expect(res.tags).toEqual(["RIN0007"]) // counter 6 → 7
  expect(res.totalNet).toBe(8.2)
  const sqls = sqlList(calls)
  expect(sqls[0]).toBe("BEGIN")
  expect(sqls[sqls.length - 1]).toBe("COMMIT")
  expect(calls.some((c) => /INSERT INTO "items"/.test(c.sql))).toBeTruthy()
  const ledger = calls.filter((c) => /INSERT INTO "inventory_ledger"/.test(c.sql))
  expect(ledger.length).toBe(2) // one out of Bullion, one in as Ring
})
