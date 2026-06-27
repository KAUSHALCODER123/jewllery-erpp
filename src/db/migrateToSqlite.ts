/**
 * One-time data bridge: copy everything from the Dexie/IndexedDB stores into the
 * Tauri SQLite database. Run this once after a user upgrades from the web/PWA
 * build to the desktop build so their existing data carries over.
 *
 * It preserves primary keys (INSERT OR REPLACE by id), converts booleans to 0/1
 * and serialises array/object columns (itemsPledged, order items) to JSON TEXT —
 * matching src-tauri/migrations/0001_init.sql. Safe to re-run (idempotent).
 *
 * Usage (only meaningful inside Tauri):
 *   import { migrateIndexedDbToSqlite } from "@/db/migrateToSqlite"
 *   if (isTauri()) await migrateIndexedDbToSqlite()
 */

import { db } from "./database"
import { systemDb } from "./systemDb"
import { isTauri, run } from "./sqlite"

interface TableSpec {
  /** SQLite table name. */
  table: string
  /** Async loader returning every row from the source (Dexie) table. */
  load: () => Promise<unknown[]>
  /** Columns stored as INTEGER booleans (true→1/false→0). */
  bools?: string[]
  /** Columns stored as JSON TEXT (arrays/objects). */
  json?: string[]
}

const businessSpecs = (): TableSpec[] => [
  { table: "items", load: () => db.items.toArray() },
  { table: "customers", load: () => db.customers.toArray() },
  { table: "sales_invoices", load: () => db.sales_invoices.toArray(), bools: ["interState"] },
  { table: "sales_items", load: () => db.sales_items.toArray() },
  { table: "urd_items", load: () => db.urd_items.toArray() },
  { table: "loans", load: () => db.loans.toArray(), bools: ["isClosed"], json: ["itemsPledged"] },
  { table: "loan_payments", load: () => db.loan_payments.toArray() },
  { table: "karigars", load: () => db.karigars.toArray() },
  { table: "karigar_jobs", load: () => db.karigar_jobs.toArray() },
  { table: "suppliers", load: () => db.suppliers.toArray() },
  { table: "purchase_invoices", load: () => db.purchase_invoices.toArray() },
  { table: "purchase_items", load: () => db.purchase_items.toArray() },
  { table: "schemes", load: () => db.schemes.toArray() },
  { table: "scheme_accounts", load: () => db.scheme_accounts.toArray() },
  { table: "scheme_payments", load: () => db.scheme_payments.toArray() },
  { table: "receipts", load: () => db.receipts.toArray() },
  { table: "orders", load: () => db.orders.toArray(), json: ["items"] },
  { table: "refinings", load: () => db.refinings.toArray() },
  { table: "counters", load: () => db.counters.toArray() },
]

const systemSpecs = (): TableSpec[] => [
  { table: "users", load: () => systemDb.users.toArray(), bools: ["active"] },
  {
    table: "companies",
    load: () => systemDb.companies.toArray(),
    bools: ["printShowLogo", "printShowHuid"],
  },
]

function coerce(value: unknown, key: string, spec: TableSpec): unknown {
  if (value === undefined) return null
  if (spec.bools?.includes(key)) return value ? 1 : 0
  if (spec.json?.includes(key)) return JSON.stringify(value ?? null)
  return value as unknown
}

async function copyTable(spec: TableSpec): Promise<number> {
  const rows = (await spec.load()) as Record<string, unknown>[]
  for (const row of rows) {
    const keys = Object.keys(row)
    if (keys.length === 0) continue
    const cols = keys.map((k) => `"${k}"`).join(", ")
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ")
    const values = keys.map((k) => coerce(row[k], k, spec))
    await run(
      `INSERT OR REPLACE INTO ${spec.table} (${cols}) VALUES (${placeholders})`,
      values,
    )
  }
  return rows.length
}

/**
 * Copy all Dexie data into SQLite. Returns per-table row counts. No-op (returns
 * an empty map) when not running under Tauri.
 */
export async function migrateIndexedDbToSqlite(): Promise<Record<string, number>> {
  if (!isTauri()) return {}
  const result: Record<string, number> = {}
  for (const spec of [...businessSpecs(), ...systemSpecs()]) {
    result[spec.table] = await copyTable(spec)
  }
  return result
}
