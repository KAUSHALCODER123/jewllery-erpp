# Dexie → SQLite cutover (status + plan)

The web build persists through Dexie/IndexedDB. Under Tauri the same app can
persist to SQLite via `tauri-plugin-sql`. This is the staged migration of
`src/services/dbService.ts` from Dexie to SQLite, behind the `isTauri()` seam.

> The desktop app already runs today on Dexie (WebView2 ships IndexedDB), so
> SQLite is an enhancement (real embedded DB, file-level backup, SQL reporting),
> not a prerequisite for shipping.

## What exists

| Piece | File | State |
|---|---|---|
| Runtime detection + query helpers | `src/db/sqlite.ts` | done (scaffold) |
| Full schema (21 tables) | `src-tauri/migrations/0001_init.sql` | done |
| Dexie → SQLite data bridge | `src/db/migrateToSqlite.ts` | done (scaffold) |
| **Pure SQL builder** (insert/update/select/delete + coercion) | `src/db/sqlBuilder.ts` | **done + unit-tested** |
| **Generic table repository + `withTransaction`** | `src/db/sqliteRepo.ts` | **done + unit-tested** |
| **Schema-parity guard** | `e2e/logic/schema-parity.spec.ts` | **done** |
| dbService per-service cutover | `src/services/dbService.ts` | **pending** |

`sqlBuilder` and `sqliteRepo` are verified in Node (`e2e/logic/`) with a fake
executor — the SQL generation and transaction control flow are tested without a
live Tauri runtime. The schema-parity test asserts every column the app writes
exists in the migration, catching the classic "INSERT fails only on the desktop"
drift.

## Why the cutover isn't flipped yet

The money-sensitive flows (`salesService.createInvoice` — 6 tables in one
transaction; `loansService.addPayment` — interest allocation + capitalisation)
must be **executed against a real SQLite** before being trusted. The Tauri SQL
plugin (`sqlx`) only runs inside the desktop app, which cannot be built with the
tooling on the primary dev box (WDAC blocks `cargo install`; see DESKTOP-E2E.md).
Flipping blind is the exact risk prior sessions deferred for.

## Remaining steps (in order)

1. **Confirm the placeholder dialect** the plugin expects for SQLite (`$1` vs
   `?`). `sqlBuilder` currently emits `$1…$n`; adjust in one place if needed.
   Verify with a one-line `SELECT $1` round-trip on a real desktop build.
2. **Cut over the simple, non-atomic services first** via `makeTableRepo`:
   `counters`/`nextSequence`, `items`, `customers`, `suppliers`, `karigars`,
   `receipts`. Each `dbService` method gains an `isTauri()` branch delegating to
   its repo; the Dexie branch stays as the tested reference.
3. **Cut over the atomic writers** using `withTransaction`: `createInvoice`,
   `updateInvoice`, `addPayment`, `issueJob`/`receiveJob`, `refining.create`,
   `schemes.addPayment`. Port each Dexie `db.transaction(...)` to a
   `withTransaction(exec, ...)` block of repo calls.
4. **Wire the one-time bridge**: on first Tauri launch, if the SQLite DB is empty
   and Dexie has data, run `migrateIndexedDbToSqlite()` once (guard with a
   `localStorage` flag) so existing web users carry their data over.
5. **Validate on the desktop-e2e CI** (`.github/workflows/desktop-e2e.yml`):
   extend the smoke to create a sale + loan and assert they persist to SQLite.
6. **Multi-firm**: the current schema is single-file; mirror the Dexie
   `dbNameForCompany()` scheme with one `sqlite:jewel_erp_co<id>.db` per firm.

## Guardrails

- The Dexie web path is the default and stays untouched — the 40 web/API/UI
  Playwright tests keep it green throughout.
- `sqliteRepo` and `sqlBuilder` are never imported by app code until a service
  actually flips, so `@tauri-apps/plugin-sql` stays out of the web bundle
  (verified: no `plugin-sql` in `dist/`).
