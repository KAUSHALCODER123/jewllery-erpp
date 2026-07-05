import { test, expect } from "@playwright/test"
import { login, navTo, api } from "../support/helpers"

/**
 * End-to-end POS sale driven entirely through the DOM: add a line to the sales
 * grid, create a walk-in customer, take cash, and Save & Print — then assert the
 * printed invoice overlay AND that the sale actually persisted to the DB.
 */
test("bill a walk-in customer through the UI and persist the invoice", async ({ page }) => {
  await login(page)
  await navTo(page, "Billing / POS")
  await expect(page).toHaveURL(/\/billing$/)

  // 1) Add a blank line and fill the editable grid cells.
  await page.getByRole("button", { name: /blank row/i }).click()
  await page.getByRole("textbox", { name: "Description" }).fill("Gold Coin 10g")
  await page.getByRole("spinbutton", { name: "Net weight" }).fill("10")
  await page.getByRole("spinbutton", { name: "Rate per gram" }).fill("6000")
  await page.getByRole("spinbutton", { name: "Making per gram" }).fill("500")

  // Line amount = 6000*10 + 500*10 = 65,000 shows in the grid.
  await expect(page.getByText("65,000.00").first()).toBeVisible()

  // 2) Create + select a walk-in customer from the picker.
  await page.getByText(/select customer/i).click()
  await page.getByPlaceholder(/search, or type a new name/i).fill("Ramesh Walk-in")
  await page.getByText(/add .*ramesh walk-in.* as walk-in customer/i).click()
  // The picker now displays the selected walk-in customer.
  await expect(page.getByText("Ramesh Walk-in").first()).toBeVisible()

  // 3) Net payable (65,000 + 3% GST = 66,950) then take full cash.
  await expect(page.getByText("₹66,950.00")).toBeVisible()
  await page.getByRole("button", { name: "full", exact: true }).click()
  await expect(page.getByText("Settled")).toBeVisible()

  // 4) Save & Print → the invoice overlay appears with a minted number.
  await page.getByRole("button", { name: /save & print/i }).click()
  await expect(page.getByText(/^Invoice INV\d+$/)).toBeVisible()

  // 5) The sale is really in the database with the right totals.
  const invoices = await api(page, (j) => j.db.sales.getInvoices())
  expect(invoices.length).toBe(1)
  expect(invoices[0].netAmount).toBe(66950)
  expect(invoices[0].balance).toBe(0)
  expect(invoices[0].invoiceNo).toMatch(/^INV\d+$/)

  // Close the receipt overlay.
  await page.getByRole("button", { name: /close/i }).click()
  await expect(page.getByText(/^Invoice INV\d+$/)).toBeHidden()
})
