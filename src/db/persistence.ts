/**
 * Persistence backend switch for the Dexie → SQLite cutover.
 *
 * The SQLite service layer (src/services/sqliteServices.ts) is complete and
 * unit-tested, but the live flip stays OFF until it is validated on a real
 * desktop build (placeholder dialect, a real sale/loan round-trip on the
 * desktop-e2e CI). Until then every runtime — web AND desktop — keeps using the
 * Dexie/IndexedDB path, so behaviour is unchanged.
 *
 * To validate the cutover on a desktop build: flip this to `true`, run the
 * desktop-e2e smoke, and confirm sales/loans persist to SQLite.
 */
export const SQLITE_CUTOVER_ENABLED = false
