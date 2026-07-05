import { test, expect } from "@playwright/test"
import { login, navTo } from "../support/helpers"

/**
 * POS UI smoke. The editable billing grid is exercised in depth by the service
 * tests (createInvoice); here we confirm the screen mounts with its ledger tabs,
 * checkout pane, and customer picker, and that Save is gated until a bill exists.
 */

test("the billing screen renders its tabs, checkout and customer picker", async ({ page }) => {
  await login(page)
  await navTo(page, "Billing / POS")
  await expect(page).toHaveURL(/\/billing$/)

  await expect(page.getByRole("tab", { name: /new sales/i })).toBeVisible()
  await expect(page.getByRole("tab", { name: /urd purchase/i })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible()
  // Customer picker (cmdk combobox) shows its placeholder until one is chosen.
  await expect(page.getByText(/select customer/i)).toBeVisible()

  // Save & Print is disabled on an empty bill (no customer, no lines).
  await expect(page.getByRole("button", { name: /save & print/i })).toBeDisabled()
})

test("switching to the URD (old gold) tab works", async ({ page }) => {
  await login(page)
  await navTo(page, "Billing / POS")
  await page.getByRole("tab", { name: /urd purchase/i }).click()
  await expect(page.getByRole("tab", { name: /urd purchase/i })).toHaveAttribute(
    "data-state",
    "active",
  )
})
