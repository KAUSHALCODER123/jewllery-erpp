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
| **Per-table column-type map** | `src/db/sqliteSchema.ts` | **done** |
| **SQLite master services** (items, customers) + `nextSequence` | `src/services/sqliteServices.ts` | **done + unit-tested** |
| SQLite atomic writers + remaining services | `src/services/sqliteServices.ts` | in progress |
| dbService `isTauri()` dispatch (flip) | `src/services/dbService.ts` | **pending** (needs full set + live validation) |

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
   `?`). `sqlBuilder`/`sqliteServices` emit `$1…$n`; adjust in one place if
   needed. Verify with a one-line `SELECT $1` round-trip on a real desktop build.
2. ~~**Simple, non-atomic services** via `makeTableRepo`~~ — `items`, `customers`
   and `nextSequence` are **done + tested** in `sqliteServices.ts`
   (`makeSqliteServices(exec)`). Remaining masters (`suppliers`, `karigars`,
   `receipts`, `orders`, `schemes`, `purchases`, `refining`) follow the same
   pattern.
3. **Atomic writers** using `withTransaction`: `createInvoice`, `updateInvoice`,
   `addPayment`, `issueJob`/`receiveJob`, `refining.create`, `schemes.addPayment`.
   Port each Dexie `db.transaction(...)` to a `withTransaction(exec, ...)` block —
   `nextSequenceRaw(exec, …)` (no self-transaction) is ready to compose inside.
4. **Reports/ledger** (`reportsService`, `ledgerService`): keep the JS aggregation
   but read via repos (`getAll`/`where`) instead of `db.xxx` directly.
5. **Flip**: `dbService` picks SQLite vs Dexie via `isTauri()` — ALL services at
   once (mixed backends split-brain). Keep Dexie as the tested reference.
6. **Wire the one-time bridge**: on first Tauri launch, if SQLite is empty and
   Dexie has data, run `migrateIndexedDbToSqlite()` once (localStorage guard).
7. **Validate on desktop-e2e CI**: extend the smoke to create a sale + loan and
   assert they persist to SQLite.
8. **Multi-firm**: one `sqlite:jewel_erp_co<id>.db` per company.

## Guardrails

- The Dexie web path is the default and stays untouched — the 40 web/API/UI
  Playwright tests keep it green throughout.
- `sqliteRepo` and `sqlBuilder` are never imported by app code until a service
  actually flips, so `@tauri-apps/plugin-sql` stays out of the web bundle
  (verified: no `plugin-sql` in `dist/`).
