import { test, expect } from "@playwright/test"
import { makeSqliteAuth } from "../../src/services/sqliteAuth"
import { hashPassword } from "../../src/services/passwordHash"
import type { SqlExecutor } from "../../src/db/sqliteRepo"

/**
 * SQLite auth (shared system DB) tests. A recording fake stands in for the
 * system-DB executor; real Web Crypto hashing runs (Node's globalThis.crypto).
 */

interface Call { kind: "run" | "query"; sql: string; params: unknown[] }

function fakeExecutor(rows: { match: RegExp; rows: unknown[] }[] = [], lastInsertId = 1) {
  const calls: Call[] = []
  const exec: SqlExecutor = {
    async run(sql, params = []) {
      calls.push({ kind: "run", sql, params })
      return { rowsAffected: 1, lastInsertId }
    },
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ kind: "query", sql, params })
      return ((rows.find((r) => r.match.test(sql))?.rows ?? []) as T[])
    },
  }
  return { exec, calls }
}

const sqls = (calls: Call[]) => calls.map((c) => c.sql)
const countRows = (n: number) => ({ match: /COUNT\(\*\)/, rows: [{ n }] })

test("bootstrap seeds a default firm + admin when the system DB is empty", async () => {
  // Both count() calls hit the same COUNT regex; return 0 then 0.
  const seq: number[] = [0, 0]
  let i = 0
  const { exec, calls } = fakeExecutor()
  exec.query = async <T>(sql: string) => {
    if (/COUNT\(\*\)/.test(sql)) return [{ n: seq[i++] ?? 1 }] as T[]
    return [] as T[]
  }
  const auth = makeSqliteAuth(exec)
  await auth.bootstrap()
  const s = sqls(calls)
  expect(s.some((x) => x.includes('INSERT INTO "companies"'))).toBeTruthy()
  expect(s.some((x) => x.includes('INSERT INTO "users"'))).toBeTruthy()
})

test("bootstrap is memoised (one run for concurrent callers)", async () => {
  const { exec, calls } = fakeExecutor([countRows(0)])
  const auth = makeSqliteAuth(exec)
  await Promise.all([auth.bootstrap(), auth.bootstrap(), auth.bootstrap()])
  // Only one company INSERT despite three bootstrap() calls.
  expect(calls.filter((c) => c.sql.includes('INSERT INTO "companies"')).length).toBe(1)
})

test("bootstrap skips seeding when data already exists", async () => {
  const { exec, calls } = fakeExecutor([countRows(1)])
  await makeSqliteAuth(exec).bootstrap()
  expect(calls.some((c) => c.kind === "run" && c.sql.startsWith("INSERT"))).toBeFalsy()
})

test.describe("login", () => {
  const userRow = async (over: Record<string, unknown> = {}) => {
    const salt = "deadbeef"
    return {
      id: 1, username: "admin", name: "Owner", role: "owner", salt,
      passwordHash: await hashPassword("admin", salt), active: 1, ...over,
    }
  }

  test("succeeds with the correct password", async () => {
    const { exec } = fakeExecutor([{ match: /FROM users WHERE lower\(username\)/, rows: [await userRow()] }])
    const user = await makeSqliteAuth(exec).login("admin", "admin")
    expect(user).toMatchObject({ id: 1, username: "admin", role: "owner" })
  })

  test("rejects a wrong password", async () => {
    const { exec } = fakeExecutor([{ match: /FROM users WHERE lower\(username\)/, rows: [await userRow()] }])
    await expect(makeSqliteAuth(exec).login("admin", "nope")).rejects.toThrow(/invalid/i)
  })

  test("rejects a disabled account", async () => {
    const { exec } = fakeExecutor([{ match: /FROM users WHERE lower\(username\)/, rows: [await userRow({ active: 0 })] }])
    await expect(makeSqliteAuth(exec).login("admin", "admin")).rejects.toThrow(/disabled/i)
  })

  test("rejects an unknown username", async () => {
    const { exec } = fakeExecutor([{ match: /FROM users/, rows: [] }])
    await expect(makeSqliteAuth(exec).login("ghost", "x")).rejects.toThrow(/invalid/i)
  })
})

test("addUser rejects a duplicate username (case-insensitive)", async () => {
  const { exec } = fakeExecutor([{ match: /FROM users WHERE lower\(username\)/, rows: [{ id: 1, username: "admin" }] }])
  await expect(
    makeSqliteAuth(exec).addUser({ username: "ADMIN", name: "x", role: "cashier", password: "p" }),
  ).rejects.toThrow(/already exists/i)
})

test("listCompanies reads ordered rows", async () => {
  const { exec, calls } = fakeExecutor([{ match: /FROM "companies"/, rows: [{ id: 1, name: "Shop" }] }])
  const cos = await makeSqliteAuth(exec).listCompanies()
  expect(cos).toHaveLength(1)
  expect(calls[0].sql).toContain('ORDER BY "id" ASC')
})
