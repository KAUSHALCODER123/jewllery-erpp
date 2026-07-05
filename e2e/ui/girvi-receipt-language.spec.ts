import { test, expect } from "@playwright/test"
import { openApp, login, navTo, api } from "../support/helpers"

/**
 * The girvi Pavati (pledge receipt) prints in the firm's configured language.
 * Seeds a firm language + a loan up front, then opens the Pavati from the Girvi
 * list and asserts Marathi labels render instead of the English defaults.
 */
test("the Girvi Pavati prints in the firm's language (Marathi)", async ({ page }) => {
  await openApp(page)
  await api(page, async (j) => {
    const companies = await j.auth.listCompanies()
    await j.auth.updateCompany(companies[0].id, { receiptLanguage: "mr" })
    const cust = await j.db.customers.add({
      name: "Pavati Borrower", mobile: "9800000009", openingBalance: 0, loyaltyPoints: 0,
    })
    await j.db.loans.add({
      customerId: cust.id,
      date: j.db.todayStr(),
      itemsPledged: [{ description: "Gold Kada", grossWt: 20, netWt: 20, purity: "22K", estimatedValue: 100000 }],
      grossWt: 20,
      netWt: 20,
      loanAmount: 50000,
      interestRate: 2,
      interestMode: "monthly",
    })
  })

  await login(page)
  await navTo(page, "Girvi (Loans)")
  await expect(page.getByRole("cell", { name: "Pavati Borrower" })).toBeVisible()

  // Open the printable Pavati (the row's Receipt-icon button, title "View Pavati").
  await page.getByRole("button", { name: "View Pavati" }).first().click()

  const printArea = page.locator(".print-area")
  await expect(printArea.getByText("गिरवी पावती")).toBeVisible() // GIRVI PAVATI
  await expect(printArea.getByText("कर्जदार:")).toBeVisible() // Borrower:
  await expect(printArea.getByText("कर्ज रक्कम")).toBeVisible() // Loan Amount
  await expect(printArea.getByText("GIRVI PAVATI")).toHaveCount(0)
})
