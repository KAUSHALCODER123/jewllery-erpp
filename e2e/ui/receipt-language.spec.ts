import { test, expect } from "@playwright/test"
import { openApp, login, navTo, api } from "../support/helpers"

/**
 * End-to-end regional-language receipt: set the firm's receipt language to Hindi
 * (persisted on the company profile), then bill a sale and confirm the printed
 * invoice renders its labels in Hindi. The language is read from the active
 * company in the session, so it must be set before login.
 */
test("a sale receipt prints in the firm's configured language (Hindi)", async ({ page }) => {
  // Set receiptLanguage on the default firm before logging in.
  await openApp(page)
  await api(page, async (j) => {
    const companies = await j.auth.listCompanies()
    await j.auth.updateCompany(companies[0].id, { receiptLanguage: "hi" })
  })

  await login(page)
  await navTo(page, "Billing / POS")

  // Minimal bill.
  await page.getByRole("button", { name: /blank row/i }).click()
  await page.getByRole("textbox", { name: "Description" }).fill("Gold Coin")
  await page.getByRole("spinbutton", { name: "Net weight" }).fill("10")
  await page.getByRole("spinbutton", { name: "Rate per gram" }).fill("6000")

  await page.getByText(/select customer/i).click()
  await page.getByPlaceholder(/search, or type a new name/i).fill("Hindi Buyer")
  await page.getByText(/add .*hindi buyer.* as walk-in customer/i).click()

  await page.getByRole("button", { name: "full", exact: true }).click()
  await page.getByRole("button", { name: /save & print/i }).click()

  // The printed invoice shows Hindi labels (कर बीजक = TAX INVOICE, ग्राहक: = Bill To,
  // कुल देय = Net Payable) instead of the English defaults.
  const printArea = page.locator(".print-area")
  await expect(printArea.getByText("कर बीजक")).toBeVisible()
  await expect(printArea.getByText("ग्राहक:")).toBeVisible()
  await expect(printArea.getByText("कुल देय")).toBeVisible()
  // English headline must be gone.
  await expect(printArea.getByText("TAX INVOICE")).toHaveCount(0)
})

test("defaults to English when no language is configured", async ({ page }) => {
  await login(page)
  await navTo(page, "Billing / POS")

  await page.getByRole("button", { name: /blank row/i }).click()
  await page.getByRole("textbox", { name: "Description" }).fill("Gold Coin")
  await page.getByRole("spinbutton", { name: "Net weight" }).fill("5")
  await page.getByRole("spinbutton", { name: "Rate per gram" }).fill("6000")

  await page.getByText(/select customer/i).click()
  await page.getByPlaceholder(/search, or type a new name/i).fill("English Buyer")
  await page.getByText(/add .*english buyer.* as walk-in customer/i).click()

  await page.getByRole("button", { name: "full", exact: true }).click()
  await page.getByRole("button", { name: /save & print/i }).click()

  await expect(page.locator(".print-area").getByText("TAX INVOICE")).toBeVisible()
})
