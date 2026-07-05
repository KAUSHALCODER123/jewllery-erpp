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
