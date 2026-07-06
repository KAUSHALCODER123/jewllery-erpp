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

import { bumpDataVersion } from "./dataVersion"

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

/** True for row-mutating statements — those that should notify live queries. */
const isMutation = (sql: string): boolean => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)

/** Run a write (INSERT/UPDATE/DELETE/DDL). Returns rows affected + last id. */
export async function run(
  sql: string,
  params: unknown[] = [],
): Promise<{ rowsAffected: number; lastInsertId?: number }> {
  const db = await getSqlite()
  const res = await db.execute(sql, params)
  if (isMutation(sql)) bumpDataVersion()
  return res
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

/* ------------------------------------------------------------------ */
/* System database (global — users + companies, shared across firms)   */
/* ------------------------------------------------------------------ */

/** System-DB file: one shared file, mirroring the Dexie "jewel_erp_system". */
export const SYSTEM_DB_FILE = "jewel_erp_system.db"

let _systemDbPromise: Promise<SqlDatabase> | null = null

/** Load (once) the shared system SQLite DB (users + companies). Tauri only. */
export async function getSystemSqlite(): Promise<SqlDatabase> {
  if (!isTauri()) {
    throw new Error("getSystemSqlite() called outside the Tauri desktop runtime")
  }
  if (!_systemDbPromise) {
    _systemDbPromise = (async () => {
      const mod = await import("@tauri-apps/plugin-sql")
      const Database = mod.default
      const db = (await Database.load(`sqlite:${SYSTEM_DB_FILE}`)) as unknown as SqlDatabase
      const { ensureSchema } = await import("./sqliteMigrate")
      await ensureSchema(db)
      return db
    })()
  }
  return _systemDbPromise
}

/** An executor bound to the shared system DB (for auth + company reads). */
export const systemExecutor = {
  run: async (sql: string, params: unknown[] = []) => {
    const res = await (await getSystemSqlite()).execute(sql, params)
    if (isMutation(sql)) bumpDataVersion()
    return res
  },
  query: async <T>(sql: string, params: unknown[] = []) => (await getSystemSqlite()).select<T[]>(sql, params),
}
