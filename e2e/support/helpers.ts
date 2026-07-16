import { expect, type Page } from "@playwright/test"

/**
 * Shared helpers for the browser-backed suites (api + ui).
 *
 * Each Playwright test runs in a fresh, isolated browser context, so IndexedDB
 * starts empty — the app's first-run bootstrap re-creates the default firm and
 * the admin/admin owner every time. No cross-test state to clean up.
 */

/** Open the app and wait until the DEV test bridge (window.__jewel) is ready. */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/")
  await page.waitForFunction(
    () => (window as unknown as { __jewel?: { ready?: boolean } }).__jewel?.ready === true,
    undefined,
    { timeout: 20_000 },
  )
}

/**
 * Password field on the login screen. The login form uses bare Label/Input
 * (not the shadcn Form wiring), so the label isn't programmatically associated —
 * target the field by its input type instead.
 */
export const passwordField = (page: Page) => page.locator('input[type="password"]')

/**
 * Ensure a firm is chosen before submitting. The firm list loads async; rather
 * than race the auto-select, explicitly open the picker and choose the first
 * firm (what a real user does). Without a firm the handler bails with
 * "Select a company".
 */
export async function loginFormReady(page: Page): Promise<void> {
  const firm = page.getByRole("combobox").first()
  await firm.click()
  await page.getByRole("option").first().click()
  await expect(firm).not.toContainText("Select firm")
}

/** Log in through the UI with the bootstrap owner (admin/admin) and land on the dashboard. */
export async function login(page: Page): Promise<void> {
  await openApp(page)
  await loginFormReady(page)
  await passwordField(page).fill("admin")
  await page.getByRole("button", { name: /login/i }).click()
  // Sidebar nav proves we're past the login gate.
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible()
}

/**
 * Click a sidebar nav link by its label. Links with a keyboard hint render the
 * shortcut inside the anchor (e.g. "Billing / POS" + kbd "F2"), so the
 * accessible name is "Billing / POS F2" — match by substring, not exactly.
 */
export async function navTo(page: Page, label: string): Promise<void> {
  // Prefer an exact match (so "Purchase" doesn't also hit "Old Gold Purchase");
  // fall back to substring for links whose accessible name carries an F-key hint.
  const exact = page.getByRole("link", { name: label, exact: true })
  const link = (await exact.count()) ? exact.first() : page.getByRole("link", { name: label }).first()
  await link.click()
}

/**
 * Run code against the app's service layer inside the page. `fn` receives the
 * `window.__jewel` bridge and returns any JSON-serialisable value.
 */
export function api<R, A = undefined>(
  page: Page,
  fn: (jewel: JewelBridge, arg: A) => R | Promise<R>,
  arg?: A,
): Promise<R> {
  return page.evaluate(
    ({ fnStr, a }) => {
      const jewel = (window as unknown as { __jewel: JewelBridge }).__jewel
      // eslint-disable-next-line no-new-func
      const f = new Function("return (" + fnStr + ")")() as (
        j: JewelBridge,
        x: unknown,
      ) => unknown
      return Promise.resolve(f(jewel, a))
    },
    { fnStr: fn.toString(), a: arg ?? null },
  ) as Promise<R>
}

/** Minimal structural type of the bridge (see src/testBridge.ts). */
export interface JewelBridge {
  db: any
  auth: any
  calc: any
  interest: any
  format: any
  seed: {
    all: () => Promise<{ items: number; customers: number }>
    items: () => Promise<number>
    customers: () => Promise<number>
    suppliers: () => Promise<number>
    schemes: () => Promise<number>
  }
  activeCompanyId: () => number
  resetBusinessDb: () => Promise<void>
  resetSystemDb: () => Promise<void>
  ready: true
}
