# Native desktop E2E (`tauri-driver`)

The Playwright suite (`e2e/`) drives the **web bundle** in Chromium — the same
UI + IndexedDB service layer the desktop app ships. This harness goes one step
further and drives the **actual built binary**
(`src-tauri/target/release/jewel-erp.exe`) through its real WebView2 window, via
Tauri's `tauri-driver` + `selenium-webdriver`.

It is a **UI smoke** (login → dashboard → navigate). Production builds omit the
DEV-only `window.__jewel` bridge, so there is no service-layer access here — the
`e2e/api` Playwright tests cover that layer.

## Running on the primary dev box

This was long assumed to be blocked: the machine's WDAC policy blocks binaries
that **execute from the Temp dir**, and `cargo install tauri-driver` was thought
to trip it (`os error 4551`). In practice it does **not** — `cargo install`
compiles the crate and installs the finished binary to `~/.cargo/bin`
(`%USERPROFILE%\.cargo\bin`), which is outside Temp and runs fine. The WDAC block
only bites *prebuilt* binaries that download-and-run from Temp.

So the full harness **does** run locally once these are in place (all verified
working on the dev box):

1. `cargo install tauri-driver --locked` → `~/.cargo/bin/tauri-driver.exe`
2. `msedgedriver.exe` matching the installed WebView2 runtime (see Prerequisites),
   placed on `PATH` in a **non-Temp** dir — `~/.cargo/bin` works well
3. `selenium-webdriver` (now pinned as a devDep, so `npm install` covers it)

CI (`.github/workflows/desktop-e2e.yml`, windows-latest) remains the canonical
home, but local runs work too.

## Prerequisites (Windows)

1. **Release build** of the app:
   ```bash
   npm run build
   cd src-tauri && cargo build --release && cd ..
   ```
2. **tauri-driver**:
   ```bash
   cargo install tauri-driver --locked
   ```
3. **Microsoft Edge WebDriver** (`msedgedriver.exe`) matching the installed
   Edge WebView2 runtime — download from
   https://developer.microsoft.com/microsoft-edge/tools/webdriver/ and put it on
   `PATH`. (Tauri on Windows renders via WebView2, which is Edge/Chromium.)
4. **Node client** — `selenium-webdriver`, now pinned as a devDep, so a plain
   `npm install` installs it (no separate step needed).

## Run

```bash
npm run test:desktop
```

That launches `tauri-driver`, opens the packaged app, and asserts: the login
form renders, the first firm selects, `admin/admin` logs in, the dashboard shell
appears, Billing/POS routes, and a **sale round-trip** (add a line → walk-in
customer → full cash → Save & Print → invoice minted → customer read back from a
fresh Customers mount). Exit code is non-zero on any failed step.

### Validating the SQLite cutover

Build with `VITE_SQLITE_CUTOVER=1` to flip the app onto the SQLite backend
(`src/db/persistence.ts`), then run the same smoke — login exercises the SQLite
system DB (auth bootstrap + verify) and the sale round-trip writes an invoice via
SQLite and reads the customer back, proving persistence on the real binary:

```bash
VITE_SQLITE_CUTOVER=1 npm run build
cd src-tauri && cargo build --release && cd ..
npm run test:desktop
```

This is the **cutover validation gate** (`docs/SQLITE-CUTOVER.md`). Confirm the
`$1` vs `?` placeholder dialect here — if the plugin rejects `$1`, adjust
`sqlBuilder`/`sqliteServices` in one place. The CI job below runs exactly this.

> IndexedDB persists in the app's WebView2 user-data dir between runs, so the
> first run bootstraps `admin/admin` and later runs reuse it. To force a clean
> run, clear the app's user data (`%LOCALAPPDATA%\com.jewelerp.desktop`).

## CI

`.github/workflows/desktop-e2e.yml` builds on `windows-latest` and runs this
smoke on every push — that's the intended home for it, since the runner has no
WDAC restriction.
