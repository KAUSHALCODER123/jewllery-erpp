/**
 * Applies the SQLite schema to a database handle.
 *
 * The Rust side (src-tauri/src/lib.rs) registers the migration only for the
 * default `jewel_erp.db`. For multi-firm we open one DB file PER company at
 * runtime, and those files have no registered migration — so we apply the schema
 * from JS on first open. The DDL is idempotent (`CREATE TABLE/INDEX IF NOT
 * EXISTS`), so re-applying (including over the Rust-migrated default DB) is safe.
 *
 * This module is imported DYNAMICALLY (only inside getSqlite, under Tauri) so the
 * Vite `?raw` import never reaches the Node/esbuild test transform.
 */
// Single source of truth: the same file the Rust migration embeds.
import schemaSql from "../../src-tauri/migrations/0001_init.sql?raw"
import { splitSqlStatements } from "./sqlStatements"

interface Executable {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>
}

/**
 * Additive column upgrades for DBs created before a column existed. SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, so each runs in its own try/catch — a fresh DB (whose
 * CREATE already has the column) throws "duplicate column name", which we ignore.
 * Only append here; never drop/rename (that would need a table rebuild).
 */
const COLUMN_UPGRADES: string[] = [
  "ALTER TABLE repairs ADD COLUMN karigarId INTEGER",
  "ALTER TABLE repairs ADD COLUMN karigarJobId INTEGER",
  "ALTER TABLE repairs ADD COLUMN metalAddedWt REAL",
  "ALTER TABLE repairs ADD COLUMN metalAddedPurity TEXT",
  "ALTER TABLE repairs ADD COLUMN metalAddedRate REAL",
  "ALTER TABLE repairs ADD COLUMN metalRecoveredWt REAL",
  "ALTER TABLE karigar_jobs ADD COLUMN repairId INTEGER",
  "ALTER TABLE companies ADD COLUMN receiptTheme TEXT",
]

/** Create every table/index if missing, then apply additive column upgrades. Idempotent. */
export async function ensureSchema(db: Executable): Promise<void> {
  for (const stmt of splitSqlStatements(schemaSql)) {
    await db.execute(stmt)
  }
  for (const stmt of COLUMN_UPGRADES) {
    try {
      await db.execute(stmt)
    } catch {
      /* column already exists (fresh DB) — ignore */
    }
  }
}
