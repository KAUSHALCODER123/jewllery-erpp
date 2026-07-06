import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { dbFileForCompany } from "../../src/db/sqlite"
import { splitSqlStatements } from "../../src/db/sqlStatements"

/** Multi-firm SQLite: per-company DB file naming + schema-statement splitting. */

test("dbFileForCompany mirrors the Dexie per-firm naming", () => {
  // Firm 1 keeps the plain name; others are suffixed — same scheme as
  // dbNameForCompany() in database.ts, with a .db extension.
  expect(dbFileForCompany(1)).toBe("jewel_erp.db")
  expect(dbFileForCompany(2)).toBe("jewel_erp_co2.db")
  expect(dbFileForCompany(37)).toBe("jewel_erp_co37.db")
})

test.describe("splitSqlStatements", () => {
  test("splits a simple script and strips comments", () => {
    const sql = `
      -- a comment
      PRAGMA foreign_keys = ON;
      CREATE TABLE a (id INTEGER); -- trailing comment
      CREATE INDEX i ON a(id);
    `
    expect(splitSqlStatements(sql)).toEqual([
      "PRAGMA foreign_keys = ON",
      "CREATE TABLE a (id INTEGER)",
      "CREATE INDEX i ON a(id)",
    ])
  })

  test("splits the real migration into clean, comment-free statements", () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), "src-tauri/migrations/0001_init.sql"),
      "utf8",
    )
    const stmts = splitSqlStatements(sql)

    // 21 tables + PRAGMA + many indexes.
    expect(stmts.length).toBeGreaterThan(21)
    expect(stmts[0]).toBe("PRAGMA foreign_keys = ON")
    // No comments or empties survive.
    expect(stmts.every((s) => !s.includes("--") && s.trim().length > 0)).toBeTruthy()
    // Every table is its own CREATE TABLE statement.
    const tables = ["items", "customers", "sales_invoices", "loans", "loan_payments", "counters", "users", "companies"]
    for (const t of tables) {
      expect(
        stmts.some((s) => s.startsWith(`CREATE TABLE IF NOT EXISTS ${t}`)),
        `no standalone CREATE TABLE for ${t}`,
      ).toBeTruthy()
    }
  })
})
