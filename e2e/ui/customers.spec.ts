import { test, expect } from "@playwright/test"
import { login, navTo } from "../support/helpers"

/** UI flow: create a customer through the form and see it in the table. */

test("create a customer through the New Customer dialog", async ({ page }) => {
  await login(page)
  await navTo(page, "Customers")
  await expect(page).toHaveURL(/\/customers$/)

  await page.getByRole("button", { name: /new customer/i }).first().click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "New Customer" })).toBeVisible()

  await dialog.getByLabel("Name").fill("Meera Iyer")
  await dialog.getByLabel("Mobile").fill("9876543210")
  await dialog.getByLabel("City").fill("Chennai")
  await dialog.getByRole("button", { name: /add customer/i }).click()

  // Toast confirms the write, and the row appears in the table.
  await expect(page.getByText(/added meera iyer/i)).toBeVisible()
  await expect(page.getByRole("cell", { name: "Meera Iyer" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "9876543210" })).toBeVisible()
})

test("the customer form validates a required name", async ({ page }) => {
  await login(page)
  await navTo(page, "Customers")
  await page.getByRole("button", { name: /new customer/i }).first().click()

  const dialog = page.getByRole("dialog")
  // Submit empty → the dialog stays open (validation blocks the write).
  await dialog.getByRole("button", { name: /add customer/i }).click()
  await expect(dialog.getByRole("heading", { name: "New Customer" })).toBeVisible()
})
