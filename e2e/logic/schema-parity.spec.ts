import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Schema-parity guard for the Dexie → SQLite cutover.
 *
 * The #1 silent cutover bug is a column the app writes that is missing from the
 * SQLite schema — the INSERT then fails only at runtime, on the desktop, on a
 * real sale. This test parses src-tauri/migrations/0001_init.sql and asserts the
 * money-critical tables carry every field the app persists (from src/db/types.ts
 * and systemDb.ts). Update the expected sets here when a domain field is added.
 */

const sql = readFileSync(
  path.resolve(process.cwd(), "src-tauri/migrations/0001_init.sql"),
  "utf8",
)

/** Parse `CREATE TABLE name ( ... )` blocks into { table: Set<column> }. */
function parseSchema(ddl: string): Record<string, Set<string>> {
  const tables: Record<string, Set<string>> = {}
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(ddl))) {
    const [, name, body] = m
    const cols = new Set<string>()
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim()
      if (!line || line.startsWith("--")) continue
      // Skip table-level constraints; a column line starts with an identifier.
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue
      const col = line.match(/^(\w+)\s+/)
      if (col) cols.add(col[1])
    }
    tables[name] = cols
  }
  return tables
}

const schema = parseSchema(sql)

/** Every column the app actually writes, per table (from the TS types). */
const REQUIRED: Record<string, string[]> = {
  items: [
    "id", "tag", "name", "type", "purity", "grossWt", "stoneWt", "netWt",
    "makingChargePerGm", "huid", "hsn", "category", "quantity", "status",
    "createdAt", "updatedAt",
  ],
  customers: [
    "id", "name", "mobile", "address", "city", "email", "pan", "aadhaar",
    "gstin", "birthDate", "anniversary", "openingBalance", "loyaltyPoints",
    "createdAt", "updatedAt",
  ],
  sales_invoices: [
    "id", "invoiceNo", "customerId", "date", "totalGrossAmount", "totalUrdAmount",
    "billDiscount", "makingDiscount", "taxableAmount", "cgst", "sgst", "igst",
    "tcs", "interState", "salesman", "loyaltyDiscount", "pointsEarned",
    "pointsRedeemed", "netAmount", "cashPaid", "upiPaid", "balance", "notes",
    "orderId", "advanceApplied", "createdAt",
  ],
  sales_items: ["id", "invoiceId", "itemId", "description", "netWt", "rate", "makingAmount", "hsn", "finalAmount"],
  urd_items: ["id", "invoiceId", "description", "type", "purity", "grossWt", "deductionWt", "netWt", "rate", "amount"],
  loans: [
    "id", "loanNo", "customerId", "date", "itemsPledged", "grossWt", "netWt",
    "loanAmount", "interestRate", "collateralImage", "collateralThumbprint",
    "interestMode", "principalOutstanding", "isClosed", "closedDate",
    "amountCollected", "createdAt",
  ],
  loan_payments: ["id", "loanId", "date", "amount", "towardsInterest", "towardsPrincipal", "capitalisedInterest", "type", "notes"],
  receipts: ["id", "receiptNo", "customerId", "date", "amount", "mode", "notes", "createdAt"],
  scheme_payments: ["id", "accountId", "installmentNo", "date", "amount", "mode", "dueDate"],
  orders: [
    "id", "orderNo", "customerId", "date", "deliveryDate", "items",
    "estimatedAmount", "advanceReceived", "advanceMode", "status", "notes",
    "invoiceId", "createdAt",
  ],
  counters: ["key", "value"],
  users: ["id", "username", "name", "role", "passwordHash", "salt", "active", "createdAt"],
}

test.describe("SQLite schema covers every persisted field", () => {
  for (const [table, columns] of Object.entries(REQUIRED)) {
    test(`${table} has all app columns`, () => {
      expect(schema[table], `table ${table} missing from migration`).toBeTruthy()
      const missing = columns.filter((c) => !schema[table].has(c))
      expect(missing, `${table} is missing columns: ${missing.join(", ")}`).toEqual([])
    })
  }
})

test("every table the migration bridge copies exists in the schema", () => {
  // Table list mirrors migrateToSqlite.ts businessSpecs + systemSpecs.
  const bridged = [
    "items", "customers", "sales_invoices", "sales_items", "urd_items", "loans",
    "loan_payments", "karigars", "karigar_jobs", "suppliers", "purchase_invoices",
    "purchase_items", "schemes", "scheme_accounts", "scheme_payments", "receipts",
    "orders", "order_payments", "refinings", "refiners", "bullion_stock",
    "bullion_movement", "inventory_ledger", "counters", "users", "companies",
  ]
  const missing = bridged.filter((t) => !schema[t])
  expect(missing, `tables bridged but not in schema: ${missing.join(", ")}`).toEqual([])
})
