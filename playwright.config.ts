import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for Jewel-ERP.
 *
 * The desktop app is a Tauri shell around this exact Vite/React web bundle, so
 * driving the app in Chromium exercises the same UI and the same IndexedDB-backed
 * service layer that ships on the desktop. Tests are split into:
 *   e2e/logic — pure calculators (no browser needed, run in Node)
 *   e2e/api   — the service layer driven through window.__jewel (real IndexedDB)
 *   e2e/ui    — full user flows through the DOM
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Cap local workers: all tests share one Vite dev server + one IndexedDB
  // origin, so too much concurrency causes load-timeout flakiness.
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
