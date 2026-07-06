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
| **Named per-service exports dispatch** (a flag flip now routes the whole app) | `src/services/dbService.ts` | **done** |
| **Seam bypasses removed** — `GirviPage` + `InvoiceReceipt` now use `loans.getAllPayments`/`getPayments` + `items.getByIds` (no component imports raw `db`) | components | **done** |
| **Multi-firm one-DB-per-company** — `getSqlite()` opens `dbFileForCompany(activeCompanyId())` and schema-inits per file | `src/db/sqlite.ts`, `src/db/sqliteMigrate.ts` | **done** |
| `useLiveQuery` reactivity under SQLite (Dexie-only observable) | app-wide | pending (SQLite runtime concern) |
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
7. ~~**Route named exports**~~ — **done**: the public `itemsService`,
   `customersService`, … exports are now the DISPATCHED versions
   (`pick(<name>ServiceDexie, sqlite?.<name>Service)`), so a single flag flip
   routes both `dbService.*` and direct `import { customersService }` callers.
   The concrete Dexie impls live as `*ServiceDexie` consts. Seam bypasses now
   removed — `GirviPage` and `InvoiceReceipt` route through
   `loans.getAllPayments`/`getPayments` and `items.getByIds`, so no component
   imports the raw `db` handle. (systemDb/auth stays Dexie — separate follow-up.)

   **Known SQLite-runtime gap:** screens use Dexie's `useLiveQuery` for
   reactivity; SQLite has no equivalent observable, so under the flag reads won't
   auto-refresh on write. Addressing this (manual invalidation / React Query /
   a change signal) is part of desktop validation, not the data-layer port.
8. ~~**Validate on desktop-e2e CI**~~ — **set up**: the flag is now build-time
   (`VITE_SQLITE_CUTOVER=1`), and `.github/workflows/desktop-e2e.yml` builds the
   desktop binary with it ON and runs the smoke, which does a full sale round-trip
   (write via SQLite → read the customer back from a fresh mount). Login already
   exercises the SQLite system DB. **This job IS the gate** — its first real run
   confirms the `$1`/`?` dialect and the end-to-end SQLite path on the binary.
   (Can't run on the primary dev box — WDAC blocks `cargo install tauri-driver`.)
9. ~~**Multi-firm**: one `sqlite:jewel_erp_co<id>.db` per company~~ — **done**:
   `getSqlite()` resolves `dbFileForCompany(activeCompanyId())` (firm 1 =
   `jewel_erp.db`, others `jewel_erp_co<id>.db` — mirrors `dbNameForCompany`),
   caches a handle per firm, and applies the schema on first open via
   `ensureSchema` (dynamic `?raw` import of 0001_init.sql, split into statements).
   The Rust migration still covers `jewel_erp.db`; per-firm files are schema-init'd
   from JS (idempotent).
10. ~~**systemDb/auth**~~ — **done**: users + companies live in a shared
    `jewel_erp_system.db` (`getSystemSqlite`/`systemExecutor` in sqlite.ts).
    `authService` dispatches to `makeSqliteAuth(systemExecutor)` under the flag
    (src/services/sqliteAuth.ts — bootstrap/login/addUser/setActive/changePassword/
    company CRUD; crypto shared via src/services/passwordHash.ts, 9 tests).
    `gstHsnSummary` reads `companies` via the system executor. The migration routes
    business tables to the firm DB and users/companies to the system DB. Follow-up:
    it still copies only the ACTIVE firm's business data (all-firms migration).

## Guardrails

- The Dexie web path is the default and stays untouched — the 40 web/API/UI
  Playwright tests keep it green throughout.
- `sqliteRepo` and `sqlBuilder` are never imported by app code until a service
  actually flips, so `@tauri-apps/plugin-sql` stays out of the web bundle
  (verified: no `plugin-sql` in `dist/`).
