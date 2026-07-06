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
| **All atomic writers** (createInvoice, updateInvoice, loans.add/addPayment, karigar issue/receive, refining.create, schemes.addPayment, purchase.create) | `src/services/sqliteServices.ts` | **done + unit-tested** |
| **Read/report layer** (getDayBook, customerLedger, cashBook, gstr1, gstHsnSummary, getSchedule, sundryDebtors) + masters (suppliers, receipts, orders, schemes/accounts) | `src/services/sqliteServices.ts` | **done + unit-tested** |
| **dbService `isTauri()` dispatch** (behind `SQLITE_CUTOVER_ENABLED`, default off) | `src/services/dbService.ts`, `src/db/persistence.ts` | **wired** |
| **First-run migration trigger** (Dexie→SQLite, localStorage-guarded) | `src/App.tsx` | **wired** |
| Route the named per-service exports (or move callers to the `dbService` namespace) | components | pending |
| Multi-firm one-DB-per-company | `src/db/sqlite.ts` | pending |
| **Live desktop validation** (`$1` vs `?`, real sale/loan) | desktop-e2e CI | **the gate** |
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
3. ~~**Atomic writers** using `withTransaction`~~ — **done + tested**:
   `createInvoice`, `updateInvoice`, `loans.add`/`addPayment` (interest
   allocation + renewal capitalisation + close-only-when-fully-paid),
   `karigar.issueJob`/`receiveJob` (metal ledger), `refining.create` (melt +
   mint bullion via the non-transactional `addItemRaw`, no nested BEGIN),
   `schemes.addPayment` (dup-slot guard), `purchase.create`. Rollback-on-failure
   proven for the sale and loan paths.
4. ~~**Reports/ledger** (`reportsService`, `ledgerService`)~~ — **done + tested**:
   `getDayBook`, `customerLedger`, `cashBook`, `gstr1`, `gstHsnSummary` (reads the
   firm's HSN default from the SQLite `companies` table via `activeCompanyId()`),
   `sundryDebtors`, `getSchedule` keep the exact JS aggregation but read via a
   `queryRows` helper. **The SQLite service layer is now feature-complete.**
5. ~~**Flip**: `dbService` picks SQLite vs Dexie~~ — **wired** behind
   `SQLITE_CUTOVER_ENABLED` (src/db/persistence.ts, default `false`) AND
   `isTauri()`. `dbService.*` overlays the SQLite service over its Dexie
   counterpart (`{...dexie, ...sqlite}`) only when both are true; off → pure Dexie
   (114 web tests confirm no change). The SQLite layer covers every namespace
   method (spread keeps any un-ported helper as a safety net).
6. ~~**Wire the one-time bridge**~~ — **wired**: `App.tsx` runs
   `migrateIndexedDbToSqlite()` once on first Tauri launch when the flag is on
   (dynamic import, localStorage `jewel.sqliteMigrated` guard). No-op on web.
7. **Route named exports**: components that `import { customersService }` etc.
   directly still get Dexie. Either switch those to the `dbService` namespace or
   make the named exports dispatch too — the last wiring before the flip is total.
   (systemDb/auth stays Dexie; a separate follow-up.)
8. **Validate on desktop-e2e CI**: flip the flag, build the desktop app, extend
   the smoke to create a sale + loan and assert they persist to SQLite. Confirm
   the `$1`/`?` placeholder dialect here.
9. **Multi-firm**: one `sqlite:jewel_erp_co<id>.db` per company (sqlite.ts loads a
   fixed filename today).

## Guardrails

- The Dexie web path is the default and stays untouched — the 40 web/API/UI
  Playwright tests keep it green throughout.
- `sqliteRepo` and `sqlBuilder` are never imported by app code until a service
  actually flips, so `@tauri-apps/plugin-sql` stays out of the web bundle
  (verified: no `plugin-sql` in `dist/`).
