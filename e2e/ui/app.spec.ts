import { test, expect } from "@playwright/test"
import { openApp, login, passwordField, loginFormReady, navTo } from "../support/helpers"

/** Full-app UI smoke: login gate + navigation across every module. */

test("login gate: the app shows the login form before authenticating", async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole("heading", { name: "Jewel-ERP" })).toBeVisible()
  await expect(passwordField(page)).toBeVisible()
  await expect(page.getByRole("button", { name: /login/i })).toBeVisible()
})

test("wrong password is rejected", async ({ page }) => {
  await openApp(page)
  await loginFormReady(page)
  await passwordField(page).fill("nope")
  await page.getByRole("button", { name: /login/i }).click()
  await expect(page.getByText(/invalid username or password/i)).toBeVisible()
  // Still on the login screen.
  await expect(passwordField(page)).toBeVisible()
})

test("admin/admin logs in and lands on the dashboard", async ({ page }) => {
  await login(page)
  await expect(page.getByRole("link", { name: "Billing / POS" })).toBeVisible()
  await expect(page.getByText(/FY \d{4}-\d{2,4}/)).toBeVisible()
})

const ROUTES: { link: string; path: string }[] = [
  { link: "Billing / POS", path: "/billing" },
  { link: "Item Master", path: "/inventory" },
  { link: "Stock Audit", path: "/audit" },
  { link: "Customers", path: "/customers" },
  { link: "Receipt (Udhari)", path: "/receipt" },
  { link: "Purchase", path: "/purchase" },
  { link: "Old Gold Purchase", path: "/old-purchase" },
  { link: "Refining (Ghalai)", path: "/refining" },
  { link: "Gold Schemes", path: "/schemes" },
  { link: "Order Booking", path: "/orders" },
  { link: "Girvi (Loans)", path: "/girvi" },
  { link: "Karigar", path: "/karigar" },
  { link: "Day Book", path: "/daybook" },
  { link: "Reports & GST", path: "/reports" },
  { link: "Settings", path: "/settings" },
]

test("every module route loads without crashing", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))

  await login(page)
  for (const { link, path } of ROUTES) {
    await navTo(page, link)
    await expect(page).toHaveURL(new RegExp(path.replace("/", "\\/") + "$"))
    // The sidebar stays mounted, proving the shell survived the route change.
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible()
  }
  expect(errors, `page errors: ${errors.join("\n")}`).toEqual([])
})
