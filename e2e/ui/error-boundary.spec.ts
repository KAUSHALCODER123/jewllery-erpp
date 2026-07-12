import { test, expect } from "@playwright/test"
import { login } from "../support/helpers"

/**
 * The app-wide ErrorBoundary (src/components/ErrorBoundary.tsx) is the safety net
 * that keeps a single page crash — or a failed lazy-chunk load after a desktop
 * update — from white-screening the whole shop. Here we reproduce the
 * "new build shipped, old chunk 404s" case and assert the recovery panel shows.
 */
test("a failed page-chunk load shows the recovery panel, not a white screen", async ({ page }) => {
  await login(page)

  // Make the lazily-imported Reports page fail to load.
  await page.route(/ReportsPage/, (r) => r.abort())
  await page.goto("/reports")

  await expect(page.getByText(/reload/i).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: /reload app/i })).toBeVisible()
})
