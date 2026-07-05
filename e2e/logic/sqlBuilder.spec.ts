import { test, expect } from "@playwright/test"
import {
  coerceValue,
  decodeValue,
  buildInsert,
  buildUpdate,
  buildSelectById,
  buildSelectWhere,
  buildDelete,
  decodeRow,
} from "../../src/db/sqlBuilder"

/**
 * Pure SQL-builder tests for the SQLite (Tauri) persistence path. No browser or
 * live database — this verifies the parameterised SQL + bind values the cutover
 * will feed to @tauri-apps/plugin-sql.
 */

const loanTypes = { bools: ["isClosed"], json: ["itemsPledged"] } as const

test.describe("value coercion", () => {
  test("booleans → 0/1, undefined/null → null, JSON stringified", () => {
    expect(coerceValue(true, "isClosed", loanTypes)).toBe(1)
    expect(coerceValue(false, "isClosed", loanTypes)).toBe(0)
    expect(coerceValue(undefined, "anything")).toBeNull()
    expect(coerceValue(null, "anything")).toBeNull()
    expect(coerceValue([{ description: "ring" }], "itemsPledged", loanTypes)).toBe(
      '[{"description":"ring"}]',
    )
    expect(coerceValue(42, "loanAmount")).toBe(42)
  })

  test("decode is the inverse of coerce", () => {
    expect(decodeValue(1, "isClosed", loanTypes)).toBe(true)
    expect(decodeValue(0, "isClosed", loanTypes)).toBe(false)
    expect(decodeValue('[{"description":"ring"}]', "itemsPledged", loanTypes)).toEqual([
      { description: "ring" },
    ])
    expect(decodeValue("plain", "notes")).toBe("plain")
  })
})

test.describe("buildInsert", () => {
  test("parameterises columns and skips undefined (lets SQLite default id)", () => {
    const { sql, params } = buildInsert(
      "customers",
      { id: undefined, name: "Asha", mobile: "98", openingBalance: 5000 },
    )
    expect(sql).toBe(
      'INSERT INTO "customers" ("name", "mobile", "openingBalance") VALUES ($1, $2, $3)',
    )
    expect(params).toEqual(["Asha", "98", 5000])
  })

  test("applies bool + json coercion", () => {
    const { sql, params } = buildInsert(
      "loans",
      { loanNo: "GRV1", isClosed: false, itemsPledged: [{ description: "kada" }] },
      loanTypes,
    )
    expect(sql).toContain('INSERT INTO "loans"')
    expect(params).toEqual(["GRV1", 0, '[{"description":"kada"}]'])
  })

  test("throws when there is nothing to insert", () => {
    expect(() => buildInsert("items", { id: undefined })).toThrow(/no columns/i)
  })
})

test.describe("buildUpdate", () => {
  test("sets columns and binds the id last", () => {
    const { sql, params } = buildUpdate("items", 7, { status: "sold", updatedAt: "2026-01-01" })
    expect(sql).toBe('UPDATE "items" SET "status" = $1, "updatedAt" = $2 WHERE "id" = $3')
    expect(params).toEqual(["sold", "2026-01-01", 7])
  })

  test("ignores an id inside the patch and coerces booleans", () => {
    const { sql, params } = buildUpdate("loans", 3, { id: 999, isClosed: true }, loanTypes)
    expect(sql).toBe('UPDATE "loans" SET "isClosed" = $1 WHERE "id" = $2')
    expect(params).toEqual([1, 3])
  })

  test("throws on an empty patch", () => {
    expect(() => buildUpdate("items", 1, {})).toThrow(/no columns/i)
  })
})

test.describe("select / delete", () => {
  test("buildSelectById", () => {
    expect(buildSelectById("items", 5)).toEqual({
      sql: 'SELECT * FROM "items" WHERE "id" = $1',
      params: [5],
    })
  })

  test("buildSelectWhere with filter + order", () => {
    const { sql, params } = buildSelectWhere(
      "sales_invoices",
      { customerId: 2 },
      ["date", "DESC"],
    )
    expect(sql).toBe('SELECT * FROM "sales_invoices" WHERE "customerId" = $1 ORDER BY "date" DESC')
    expect(params).toEqual([2])
  })

  test("buildSelectWhere with no filter lists all", () => {
    expect(buildSelectWhere("customers").sql).toBe('SELECT * FROM "customers"')
  })

  test("buildDelete", () => {
    expect(buildDelete("receipts", 9)).toEqual({
      sql: 'DELETE FROM "receipts" WHERE "id" = $1',
      params: [9],
    })
  })
})

test("decodeRow round-trips a full loan row", () => {
  const stored = {
    id: 1,
    loanNo: "GRV1",
    isClosed: 1,
    itemsPledged: '[{"description":"kada","netWt":10}]',
    loanAmount: 100000,
  }
  expect(decodeRow(stored, loanTypes)).toEqual({
    id: 1,
    loanNo: "GRV1",
    isClosed: true,
    itemsPledged: [{ description: "kada", netWt: 10 }],
    loanAmount: 100000,
  })
})
