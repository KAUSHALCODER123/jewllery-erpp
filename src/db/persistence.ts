/**
 * Persistence backend switch for the Dexie → SQLite cutover.
 *
 * The SQLite service layer (src/services/sqliteServices.ts) is complete and
 * unit-tested, but the live flip stays OFF until it is validated on a real
 * desktop build (placeholder dialect, a real sale/loan round-trip on the
 * desktop-e2e CI). Until then every runtime — web AND desktop — keeps using the
 * Dexie/IndexedDB path, so behaviour is unchanged.
 *
 * To validate the cutover on a desktop build: set `VITE_SQLITE_CUTOVER=1` before
 * `npm run build` (the desktop-e2e CI does this), run the smoke, and confirm
 * sales/loans persist to SQLite. Unset → `false`, so web + default desktop builds
 * keep using Dexie.
 *
 * NOTE: this module is only imported by the app runtime (dbService/authService,
 * which the browser test suites load via Vite where `import.meta.env` exists);
 * the Node logic tests never import it.
 */
export const SQLITE_CUTOVER_ENABLED = import.meta.env.VITE_SQLITE_CUTOVER === "1"
