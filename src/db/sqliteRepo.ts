/**
 * Generic SQLite table repository — the layer dbService will delegate to under
 * Tauri once the per-service cutover flips (guarded by isTauri()). It builds on
 * the pure sqlBuilder and a small executor interface so its orchestration
 * (CRUD + atomic transactions) is unit-testable in Node with a fake executor,
 * even though the real @tauri-apps/plugin-sql only exists inside the desktop app.
 *
 * The Dexie web path stays the default and untouched; this is additive.
 */

import {
  buildInsert,
  buildUpdate,
  buildSelectById,
  buildSelectWhere,
  buildDelete,
  decodeRow,
  type ColumnTypes,
} from "./sqlBuilder"
import { run as sqliteRun, query as sqliteQuery } from "./sqlite"

/** The minimal DB surface a repo needs — satisfied by sqlite.ts and by test fakes. */
export interface SqlExecutor {
  run(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
}

/** The real executor, backed by the Tauri SQL plugin (see sqlite.ts). */
export const tauriExecutor: SqlExecutor = { run: sqliteRun, query: sqliteQuery }

export interface TableRepo<T extends Record<string, unknown>> {
  getAll(order?: [string, "ASC" | "DESC"]): Promise<T[]>
  get(id: number): Promise<T | undefined>
  where(filters: Partial<T>, order?: [string, "ASC" | "DESC"]): Promise<T[]>
  add(row: Partial<T>): Promise<T>
  update(id: number, patch: Partial<T>): Promise<void>
  remove(id: number): Promise<void>
  count(): Promise<number>
}

/**
 * Build a repository for one table. `types` names the bool/JSON columns so rows
 * are coerced on write and decoded on read consistently with the schema.
 */
export function makeTableRepo<T extends Record<string, unknown>>(
  table: string,
  types: ColumnTypes = {},
  exec: SqlExecutor = tauriExecutor,
  idColumn = "id",
): TableRepo<T> {
  const decode = (rows: Record<string, unknown>[]): T[] =>
    rows.map((r) => decodeRow<T>(r, types))

  return {
    async getAll(order) {
      const { sql, params } = buildSelectWhere(table, {}, order, types)
      return decode(await exec.query<Record<string, unknown>>(sql, params))
    },

    async get(id) {
      const { sql, params } = buildSelectById(table, id, idColumn)
      const rows = await exec.query<Record<string, unknown>>(sql, params)
      return rows[0] ? decodeRow<T>(rows[0], types) : undefined
    },

    async where(filters, order) {
      const { sql, params } = buildSelectWhere(
        table,
        filters as Record<string, unknown>,
        order,
        types,
      )
      return decode(await exec.query<Record<string, unknown>>(sql, params))
    },

    async add(row) {
      const { sql, params } = buildInsert(table, row as Record<string, unknown>, types)
      const res = await exec.run(sql, params)
      const id = res.lastInsertId
      return { ...(row as T), ...(id != null ? { [idColumn]: id } : {}) } as T
    },

    async update(id, patch) {
      const { sql, params } = buildUpdate(
        table,
        id,
        patch as Record<string, unknown>,
        types,
        idColumn,
      )
      await exec.run(sql, params)
    },

    async remove(id) {
      const { sql, params } = buildDelete(table, id, idColumn)
      await exec.run(sql, params)
    },

    async count() {
      const rows = await exec.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM "${table.replace(/"/g, '""')}"`,
      )
      return rows[0]?.n ?? 0
    },
  }
}

/**
 * Run `fn` inside a SQLite transaction: BEGIN, then COMMIT on success or
 * ROLLBACK (and rethrow) on any error. This is how the money-sensitive
 * multi-table writes (createInvoice, addPayment) stay atomic under SQLite.
 */
export async function withTransaction<R>(
  exec: SqlExecutor,
  fn: () => Promise<R>,
): Promise<R> {
  await exec.run("BEGIN")
  try {
    const result = await fn()
    await exec.run("COMMIT")
    return result
  } catch (err) {
    try {
      await exec.run("ROLLBACK")
    } catch {
      /* ignore rollback failure; surface the original error */
    }
    throw err
  }
}
