# Native desktop E2E (`tauri-driver`)

The Playwright suite (`e2e/`) drives the **web bundle** in Chromium — the same
UI + IndexedDB service layer the desktop app ships. This harness goes one step
further and drives the **actual built binary**
(`src-tauri/target/release/jewel-erp.exe`) through its real WebView2 window, via
Tauri's `tauri-driver` + `selenium-webdriver`.

It is a **UI smoke** (login → dashboard → navigate). Production builds omit the
DEV-only `window.__jewel` bridge, so there is no service-layer access here — the
`e2e/api` Playwright tests cover that layer.

## Why it doesn't run on the primary dev box

This machine's WDAC policy blocks binaries that load/execute from the Temp dir,
so `cargo install tauri-driver` fails (`os error 4551`). Run this harness on an
**unrestricted Windows machine or CI** (see the workflow below). The release
binary itself builds fine in place (`cargo build --release`), so only the
`tauri-driver` tooling is gated.

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
4. **Node client**:
   ```bash
   npm i -D selenium-webdriver
   ```

## Run

```bash
npm run test:desktop
```

That launches `tauri-driver`, opens the packaged app, and asserts: the login
form renders, the first firm selects, `admin/admin` logs in, the dashboard shell
appears, and Billing/POS routes. Exit code is non-zero on any failed step.

> IndexedDB persists in the app's WebView2 user-data dir between runs, so the
> first run bootstraps `admin/admin` and later runs reuse it. To force a clean
> run, clear the app's user data (`%LOCALAPPDATA%\com.jewelerp.desktop`).

## CI

`.github/workflows/desktop-e2e.yml` builds on `windows-latest` and runs this
smoke on every push — that's the intended home for it, since the runner has no
WDAC restriction.
