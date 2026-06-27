/**
 * SQLite access for the Tauri desktop build.
 *
 * Architecture
 * ------------
 * The web build persists through Dexie/IndexedDB (see database.ts). Under Tauri
 * the same screens can instead persist to SQLite via `tauri-plugin-sql`. This
 * module is the seam: it detects the Tauri runtime, lazily loads the SQLite
 * database (schema applied by the Rust migration in src-tauri/migrations), and
 * exposes thin typed query helpers.
 *
 * The plugin is imported dynamically so it is NEVER pulled into the web bundle
 * and never evaluated outside Tauri (where `window.__TAURI_INTERNALS__` is
 * absent). Feature code should keep talking to `dbService.ts`; the per-service
 * cutover from Dexie to these helpers is staged.
 */

// Minimal shape of the @tauri-apps/plugin-sql Database we rely on.
interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>
  select<T>(query: string, bindValues?: unknown[]): Promise<T>
  close(): Promise<boolean>
}

/** True when running inside the Tauri desktop shell (vs a normal browser). */
export const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)

let _dbPromise: Promise<SqlDatabase> | null = null

/**
 * Load (once) and return the SQLite handle. Throws if called outside Tauri so
 * callers must guard with `isTauri()` first.
 */
export async function getSqlite(): Promise<SqlDatabase> {
  if (!isTauri()) {
    throw new Error("getSqlite() called outside the Tauri desktop runtime")
  }
  if (!_dbPromise) {
    _dbPromise = (async () => {
      // Dynamic import keeps the plugin out of the web bundle.
      const mod = await import("@tauri-apps/plugin-sql")
      const Database = mod.default
      return (await Database.load("sqlite:jewel_erp.db")) as unknown as SqlDatabase
    })()
  }
  return _dbPromise
}

/** Run a write (INSERT/UPDATE/DELETE/DDL). Returns rows affected + last id. */
export async function run(
  sql: string,
  params: unknown[] = [],
): Promise<{ rowsAffected: number; lastInsertId?: number }> {
  const db = await getSqlite()
  return db.execute(sql, params)
}

/** Run a read query and get typed rows. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getSqlite()
  return db.select<T[]>(sql, params)
}

/** Convenience: first row or undefined. */
export async function queryOne<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(sql, params)
  return rows[0]
}
