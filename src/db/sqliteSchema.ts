/**
 * Per-table column-type metadata for the SQLite persistence path — the single
 * source of truth for which columns are INTEGER booleans or JSON TEXT, matching
 * src-tauri/migrations/0001_init.sql. Repos and services import this so coercion
 * (write) and decoding (read) stay consistent across the cutover.
 */

import type { ColumnTypes } from "./sqlBuilder"

export const TABLE_TYPES: Record<string, ColumnTypes> = {
  items: {},
  customers: {},
  sales_invoices: { bools: ["interState"] },
  sales_items: {},
  urd_items: {},
  loans: { bools: ["isClosed"], json: ["itemsPledged"] },
  loan_payments: {},
  karigars: {},
  karigar_jobs: {},
  suppliers: {},
  purchase_invoices: {},
  purchase_items: {},
  schemes: {},
  scheme_accounts: {},
  scheme_payments: {},
  receipts: {},
  orders: { json: ["items", "statusHistory"] },
  order_payments: {},
  refinings: {},
  refiners: {},
  bullion_stock: {},
  bullion_movement: {},
  inventory_ledger: {},
  counters: {},
  // system DB
  users: { bools: ["active"] },
  companies: { bools: ["printShowLogo", "printShowHuid"] },
}

/** Convenience accessor with an empty-types fallback. */
export const typesFor = (table: string): ColumnTypes => TABLE_TYPES[table] ?? {}
