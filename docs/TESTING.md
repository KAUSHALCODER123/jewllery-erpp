# Testing — Jewel-ERP

The desktop app is a Tauri shell around the exact Vite/React web bundle, so
driving the app in **Playwright/Chromium** exercises the same UI and the same
IndexedDB-backed service layer that ships on the desktop.

## Layout

```
e2e/
  support/helpers.ts   Shared helpers (openApp, login, navTo, api bridge)
  logic/               Pure calculators — run in Node, no browser/DB
    calc.spec.ts         POS billing math (GST split, URD, discounts, TCS)
    interest.spec.ts     Girvi interest engine (months, accrual, capitalisation)
  api/                 Service layer driven through window.__jewel (real IndexedDB)
    services.spec.ts     auth, customers, inventory, sales, receipts, loans,
                         schemes, backup/restore
  ui/                  Full user flows through the DOM
    app.spec.ts          login gate, wrong-password, navigation across all modules
    customers.spec.ts    create-customer form flow + validation
    pos.spec.ts          billing screen smoke (tabs, checkout, save gating)
```

## Running

```bash
npm test            # everything (auto-starts the dev server on :5173)
npm run test:logic  # pure calculators only (fast)
npm run test:api    # service-layer tests
npm run test:ui     # DOM/user-flow tests
npm run test:headed # watch it drive a real browser
npm run test:report # open the last HTML report
```

Playwright's `webServer` config starts `npm run dev` automatically and reuses an
already-running dev server. Each test runs in a fresh, isolated browser context,
so IndexedDB starts empty and the app's first-run bootstrap re-creates the
default firm + `admin/admin` owner every time — no shared state to clean up.

## The test bridge (`window.__jewel`)

The app is fully offline — there is no HTTP API — so "API testing" means driving
the real service layer (`src/services/dbService.ts`) over IndexedDB. `src/testBridge.ts`
exposes `dbService`, `authService`, and the pure calculators on `window.__jewel`.
It is imported **only** under `import.meta.env.DEV` (see `src/main.tsx`), so it is
tree-shaken out of the production/desktop build — verified: `dist/` contains no
reference to `__jewel`.

Tests call it via the `api(page, fn)` helper in `e2e/support/helpers.ts`.
