import { test, expect } from "@playwright/test"
import { login, navTo, api } from "../support/helpers"

/**
 * UI flow: create a Girvi (gold loan) against a pledged item. Money-sensitive —
 * verifies the minted loan number, the persisted principal, and that it lands in
 * the "open loans" list. The pledged-item grid cells have no aria labels, so the
 * description is targeted by placeholder and the amount by its label-scoped input.
 */
test("create a gold loan and see it in the open-loans list", async ({ page }) => {
  // Seed a borrower up front — the loan form's customer picker lists existing
  // customers (no walk-in quick-add here).
  await login(page)
  await api(page, (j) =>
    j.db.customers.add({ name: "Girvi Borrower", mobile: "9811122233", openingBalance: 0, loyaltyPoints: 0 }),
  )

  await navTo(page, "Girvi (Loans)")
  await expect(page).toHaveURL(/\/girvi$/)
  await page.getByRole("button", { name: /new loan/i }).first().click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: /new girvi/i })).toBeVisible()

  // Pick the borrower.
  await dialog.getByRole("combobox").first().click()
  await page.getByRole("option", { name: /girvi borrower/i }).click()

  // One pledged item (description satisfies the "at least one item" guard).
  await dialog.getByPlaceholder(/gold bangle/i).fill("Gold Kada 22K")

  // Loan terms: amount + rate. Inputs sit under bare labels, so scope by label.
  await dialog.locator('div:has(> label:text-is("Loan Amount (₹)")) input').fill("50000")
  await dialog.locator('div:has(> label:text-is("Interest (% / month)")) input').fill("2")

  await dialog.getByRole("button", { name: /create loan/i }).click()

  // Toast confirms the minted number; the row shows in the open-loans table.
  await expect(page.getByText(/loan GRV\d+ created/i)).toBeVisible()
  await expect(page.getByRole("cell", { name: "Girvi Borrower" })).toBeVisible()

  // Persisted correctly: open, full principal outstanding.
  const loans = await api(page, (j) => j.db.loans.getAll())
  expect(loans.length).toBe(1)
  expect(loans[0].loanNo).toMatch(/^GRV\d+$/)
  expect(loans[0].loanAmount).toBe(50000)
  expect(loans[0].principalOutstanding).toBe(50000)
  expect(loans[0].isClosed).toBe(false)
})
