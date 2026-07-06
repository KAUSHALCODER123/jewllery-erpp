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

/** Create every table/index if missing. Idempotent. */
export async function ensureSchema(db: Executable): Promise<void> {
  for (const stmt of splitSqlStatements(schemaSql)) {
    await db.execute(stmt)
  }
}
