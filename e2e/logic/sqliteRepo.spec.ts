import { test, expect } from "@playwright/test"
import { makeTableRepo, withTransaction, type SqlExecutor } from "../../src/db/sqliteRepo"

/**
 * Repository-orchestration tests. A recording fake stands in for the Tauri SQL
 * plugin, so we verify the exact SQL/params the repo issues and its transaction
 * control flow — all in Node, no desktop runtime.
 */

interface Call {
  kind: "run" | "query"
  sql: string
  params: unknown[]
}

function fakeExecutor(opts: { rows?: unknown[]; lastInsertId?: number } = {}) {
  const calls: Call[] = []
  const exec: SqlExecutor = {
    async run(sql, params = []) {
      calls.push({ kind: "run", sql, params })
      return { rowsAffected: 1, lastInsertId: opts.lastInsertId ?? 42 }
    },
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ kind: "query", sql, params })
      return (opts.rows ?? []) as T[]
    },
  }
  return { exec, calls }
}

const loanTypes = { bools: ["isClosed"], json: ["itemsPledged"] } as const

test("add() inserts coerced values and returns the row with the new id", async () => {
  const { exec, calls } = fakeExecutor({ lastInsertId: 7 })
  const repo = makeTableRepo("loans", loanTypes, exec)

  const created = await repo.add({ loanNo: "GRV1", isClosed: false, itemsPledged: [{ x: 1 }] })

  expect(created).toMatchObject({ id: 7, loanNo: "GRV1", isClosed: false })
  expect(calls[0].kind).toBe("run")
  expect(calls[0].sql).toContain('INSERT INTO "loans"')
  expect(calls[0].params).toEqual(["GRV1", 0, '[{"x":1}]'])
})

test("get() decodes booleans and JSON back to domain shapes", async () => {
  const { exec, calls } = fakeExecutor({
    rows: [{ id: 1, loanNo: "GRV1", isClosed: 1, itemsPledged: '[{"x":1}]' }],
  })
  const repo = makeTableRepo("loans", loanTypes, exec)

  const loan = await repo.get(1)
  expect(loan).toEqual({ id: 1, loanNo: "GRV1", isClosed: true, itemsPledged: [{ x: 1 }] })
  expect(calls[0].sql).toBe('SELECT * FROM "loans" WHERE "id" = $1')
  expect(calls[0].params).toEqual([1])
})

test("getAll() applies ordering", async () => {
  const { exec, calls } = fakeExecutor({ rows: [] })
  const repo = makeTableRepo("sales_invoices", {}, exec)
  await repo.getAll(["id", "DESC"])
  expect(calls[0].sql).toBe('SELECT * FROM "sales_invoices" ORDER BY "id" DESC')
})

test("where() filters by equality", async () => {
  const { exec, calls } = fakeExecutor({ rows: [] })
  const repo = makeTableRepo("receipts", {}, exec)
  await repo.where({ customerId: 5 } as never)
  expect(calls[0].sql).toBe('SELECT * FROM "receipts" WHERE "customerId" = $1')
  expect(calls[0].params).toEqual([5])
})

test("update() and remove() issue the right statements", async () => {
  const { exec, calls } = fakeExecutor()
  const repo = makeTableRepo("items", {}, exec)
  await repo.update(3, { status: "sold" })
  await repo.remove(3)
  expect(calls[0].sql).toBe('UPDATE "items" SET "status" = $1 WHERE "id" = $2')
  expect(calls[0].params).toEqual(["sold", 3])
  expect(calls[1].sql).toBe('DELETE FROM "items" WHERE "id" = $1')
})

test("count() reads the COUNT aggregate", async () => {
  const { exec, calls } = fakeExecutor({ rows: [{ n: 12 }] })
  const repo = makeTableRepo("customers", {}, exec)
  expect(await repo.count()).toBe(12)
  expect(calls[0].sql).toContain('COUNT(*)')
})

test.describe("withTransaction", () => {
  test("commits on success", async () => {
    const { exec, calls } = fakeExecutor()
    const result = await withTransaction(exec, async () => {
      await exec.run("INSERT INTO x DEFAULT VALUES")
      return "done"
    })
    expect(result).toBe("done")
    expect(calls.map((c) => c.sql)).toEqual([
      "BEGIN",
      "INSERT INTO x DEFAULT VALUES",
      "COMMIT",
    ])
  })

  test("rolls back and rethrows on failure", async () => {
    const { exec, calls } = fakeExecutor()
    await expect(
      withTransaction(exec, async () => {
        await exec.run("INSERT INTO x DEFAULT VALUES")
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(calls.map((c) => c.sql)).toEqual([
      "BEGIN",
      "INSERT INTO x DEFAULT VALUES",
      "ROLLBACK",
    ])
  })
})
