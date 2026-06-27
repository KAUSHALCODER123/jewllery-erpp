# Desktop build (Tauri v2 + SQLite)

Jewel-ERP ships as a Windows desktop app: the existing React UI runs in a WebView2
window, with **SQLite** (via `tauri-plugin-sql`) as the local database instead of
IndexedDB. The scaffold lives in `src-tauri/`.

## TL;DR — build the .exe
```bash
npm install
npm run build                 # produce the web assets in dist/
cd src-tauri
cargo build --release         # -> src-tauri/target/release/jewel-erp.exe
```
Run it: double-click `src-tauri/target/release/jewel-erp.exe` (standalone, no install).
For live development: `npm run tauri:dev` *(see WDAC caveat below — may be blocked)*.

## ⚠️ WDAC / Application Control caveat (this build machine)
This machine runs a **Windows Application Control (WDAC) policy that blocks executing
unsigned binaries from the user Temp directory** (`%LOCALAPPDATA%\Temp\…`). It is
**path-scoped to Temp**, not a blanket ban on unsigned local binaries. Consequences:

- ✅ **`cargo build` inside `src-tauri/` works** — proc-macro DLLs and build scripts
  compile/run in-place under `src-tauri/target/…`, which is allowlisted. This is the
  reliable path and produces a fully functional `jewel-erp.exe`.
- ❌ **`npm run tauri` / `cargo tauri` / `cargo install tauri-cli` may fail** — the
  Tauri CLI loads/builds native helpers via Temp, which WDAC rejects
  (`os error 4551`). So the `.msi`/NSIS **installer** bundling step (which the CLI
  drives) is blocked here.
- (Same policy is why the web build is pinned to **Vite 7**, not 8's rolldown.)

### To produce a distributable installer (.msi / NSIS)
Build on a machine or CI **without** the Temp-dir WDAC restriction (or get the
toolchain signed/allowlisted by IT), then:
```bash
npm run tauri:build           # -> src-tauri/target/release/bundle/...
```

## How data works in the desktop app
- `src/db/sqlite.ts` — runtime seam: `isTauri()` detects the desktop shell and
  lazily loads `@tauri-apps/plugin-sql` (dynamic import, so it never enters the web
  bundle). Web builds keep using Dexie/IndexedDB unchanged.
- `src-tauri/migrations/0001_init.sql` — full schema (all 21 tables incl.
  `loan_payments.capitalisedInterest`); applied by `tauri-plugin-sql` on first launch.
- `src/db/migrateToSqlite.ts` — one-time Dexie → SQLite data bridge (preserves ids,
  serialises JSON, converts booleans).

## Remaining work for a true SQLite desktop release
`dbService.ts` still calls **Dexie**. The per-service cutover to the SQLite seam is
staged but not done — it's money-sensitive (billing / loan-interest math), so do it
incrementally **with `tauri:dev` running** and verify each service (POS totals,
Girvi interest/capitalisation, GST reports) against the web/Dexie behaviour before
switching it over.
