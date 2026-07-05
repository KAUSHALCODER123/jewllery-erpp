/**
 * Pure SQL builders for the SQLite (Tauri) persistence path.
 *
 * These functions turn plain domain rows into parameterised SQL strings +
 * bind-value arrays for `@tauri-apps/plugin-sql`. They are the reusable core of
 * the Dexie→SQLite service cutover: side-effect-free and fully unit-testable in
 * Node, so the money-sensitive query generation can be verified WITHOUT a live
 * Tauri runtime.
 *
 * Column conventions match src-tauri/migrations/0001_init.sql and the coercion
 * in migrateToSqlite.ts: booleans persist as INTEGER 0/1, arrays/objects as JSON
 * TEXT, and `undefined` becomes SQL NULL.
 */

export interface ColumnTypes {
  /** Columns stored as INTEGER booleans (true→1 / false→0). */
  bools?: readonly string[]
  /** Columns stored as JSON TEXT (arrays/objects). */
  json?: readonly string[]
}

export interface BuiltQuery {
  sql: string
  params: unknown[]
}

/** Coerce one JS value to its SQLite storage form. */
export function coerceValue(value: unknown, key: string, types: ColumnTypes = {}): unknown {
  if (value === undefined || value === null) return null
  if (types.bools?.includes(key)) return value ? 1 : 0
  if (types.json?.includes(key)) return JSON.stringify(value)
  return value
}

/** Restore one SQLite value to its JS form (inverse of coerceValue). */
export function decodeValue(value: unknown, key: string, types: ColumnTypes = {}): unknown {
  if (types.bools?.includes(key)) return value === 1 || value === true
  if (types.json?.includes(key)) {
    if (value == null) return undefined
    try {
      return JSON.parse(value as string)
    } catch {
      return value
    }
  }
  return value
}

const quoteId = (id: string): string => `"${id.replace(/"/g, '""')}"`

/**
 * INSERT one row. `undefined`/omitted columns are skipped so SQLite applies its
 * own DEFAULT / AUTOINCREMENT (e.g. an unset `id`).
 */
export function buildInsert(
  table: string,
  row: Record<string, unknown>,
  types: ColumnTypes = {},
): BuiltQuery {
  const keys = Object.keys(row).filter((k) => row[k] !== undefined)
  if (keys.length === 0) {
    throw new Error(`buildInsert: no columns to insert into ${table}`)
  }
  const cols = keys.map(quoteId).join(", ")
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ")
  const params = keys.map((k) => coerceValue(row[k], k, types))
  return {
    sql: `INSERT INTO ${quoteId(table)} (${cols}) VALUES (${placeholders})`,
    params,
  }
}

/** UPDATE a row by integer primary key. Throws if the patch is empty. */
export function buildUpdate(
  table: string,
  id: number,
  patch: Record<string, unknown>,
  types: ColumnTypes = {},
  idColumn = "id",
): BuiltQuery {
  const keys = Object.keys(patch).filter((k) => k !== idColumn)
  if (keys.length === 0) {
    throw new Error(`buildUpdate: no columns to update in ${table}`)
  }
  const assignments = keys.map((k, i) => `${quoteId(k)} = $${i + 1}`).join(", ")
  const params = keys.map((k) => coerceValue(patch[k], k, types))
  params.push(id)
  return {
    sql: `UPDATE ${quoteId(table)} SET ${assignments} WHERE ${quoteId(idColumn)} = $${keys.length + 1}`,
    params,
  }
}

/** SELECT * by primary key. */
export function buildSelectById(table: string, id: number, idColumn = "id"): BuiltQuery {
  return {
    sql: `SELECT * FROM ${quoteId(table)} WHERE ${quoteId(idColumn)} = $1`,
    params: [id],
  }
}

/**
 * SELECT * with an equality filter (ANDed), optional ORDER BY.
 * `order` is `[column, "ASC"|"DESC"]`.
 */
export function buildSelectWhere(
  table: string,
  filters: Record<string, unknown> = {},
  order?: [string, "ASC" | "DESC"],
  types: ColumnTypes = {},
): BuiltQuery {
  const keys = Object.keys(filters).filter((k) => filters[k] !== undefined)
  const where = keys.length
    ? " WHERE " + keys.map((k, i) => `${quoteId(k)} = $${i + 1}`).join(" AND ")
    : ""
  const params = keys.map((k) => coerceValue(filters[k], k, types))
  const orderBy = order ? ` ORDER BY ${quoteId(order[0])} ${order[1]}` : ""
  return { sql: `SELECT * FROM ${quoteId(table)}${where}${orderBy}`, params }
}

/** DELETE a row by primary key. */
export function buildDelete(table: string, id: number, idColumn = "id"): BuiltQuery {
  return {
    sql: `DELETE FROM ${quoteId(table)} WHERE ${quoteId(idColumn)} = $1`,
    params: [id],
  }
}

/** Decode a full SQLite row (JSON parse + 0/1→bool) back to a domain object. */
export function decodeRow<T = Record<string, unknown>>(
  row: Record<string, unknown>,
  types: ColumnTypes = {},
): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = decodeValue(v, k, types)
  return out as T
}
