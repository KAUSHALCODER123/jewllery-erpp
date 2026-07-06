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

// Mirrors dbNameForCompany() in database.ts so each firm's SQLite file lines up
// with its Dexie database: firm 1 = "jewel_erp", others = "jewel_erp_co<id>".
const ACTIVE_COMPANY_KEY = "jewel.activeCompanyId"
const activeCompanyId = (): number => {
  if (typeof localStorage === "undefined") return 1
  return Number(localStorage.getItem(ACTIVE_COMPANY_KEY) || "1") || 1
}

/** SQLite file name for a firm, e.g. "jewel_erp.db" / "jewel_erp_co2.db". */
export const dbFileForCompany = (id: number): string =>
  id === 1 ? "jewel_erp.db" : `jewel_erp_co${id}.db`

// One cached handle per firm — switching firms opens (and schema-inits) its own
// file. Keyed by company id so a mid-session switch binds to the right DB.
const _dbByCompany = new Map<number, Promise<SqlDatabase>>()

/**
 * Load (once per firm) and return the SQLite handle for the active company.
 * Applies the schema on first open (idempotent) so per-firm DB files — which the
 * Rust migration doesn't register — are created correctly. Throws outside Tauri.
 */
export async function getSqlite(): Promise<SqlDatabase> {
  if (!isTauri()) {
    throw new Error("getSqlite() called outside the Tauri desktop runtime")
  }
  const companyId = activeCompanyId()
  let promise = _dbByCompany.get(companyId)
  if (!promise) {
    promise = (async () => {
      // Dynamic imports keep the plugin + the ?raw schema out of the web bundle
      // (and out of the Node test transform).
      const mod = await import("@tauri-apps/plugin-sql")
      const Database = mod.default
      const db = (await Database.load(
        `sqlite:${dbFileForCompany(companyId)}`,
      )) as unknown as SqlDatabase
      const { ensureSchema } = await import("./sqliteMigrate")
      await ensureSchema(db)
      return db
    })()
    _dbByCompany.set(companyId, promise)
  }
  return promise
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
