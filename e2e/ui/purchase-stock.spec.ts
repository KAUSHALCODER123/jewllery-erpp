import { test, expect } from "@playwright/test"
import { login, navTo, api } from "../support/helpers"

/**
 * PUR-03 — "ticked lines become stock". A purchase line with the "Stock" box
 * ticked (the default) must be persisted as a tagged, sellable Item Master
 * entry, with its HUID carried over, once the purchase is saved.
 */
test("purchase: a ticked line becomes a tagged stock item", async ({ page }) => {
  await login(page)

  await api(page, async (j) => {
    await j.db.suppliers.add({ name: "Repro Vendor", mobile: "9000000000" })
  })

  await navTo(page, "Purchase")
  await page.getByRole("button", { name: /new purchase/i }).first().click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "New Purchase" })).toBeVisible()

  await dialog.getByRole("combobox").first().click()
  await page.getByRole("option", { name: "Repro Vendor" }).click()

  await dialog.getByPlaceholder("e.g. Gold ring").fill("Repro Gold Ring")

  const row = dialog.locator("tbody tr").first()
  const rowNums = row.locator('input[type="number"]')
  await rowNums.nth(0).fill("10") // gross wt
  await rowNums.nth(2).fill("6000") // rate/g

  // The "Add as" toggle defaults to Tag — this is what routes the line to inventory.
  await expect(row.getByRole("switch", { name: /add to stock/i })).toHaveAttribute("aria-checked", "true")

  await dialog.getByRole("button", { name: /save purchase/i }).click()
  await expect(page.getByText(/added to stock/i)).toBeVisible({ timeout: 10_000 })

  // It shows in Item Master and persisted with a minted tag + in_stock status.
  await navTo(page, "Item Master")
  await expect(page.getByRole("cell", { name: "Repro Gold Ring" })).toBeVisible({
    timeout: 10_000,
  })

  const items = await api(page, (j) => j.db.items.search("Repro Gold Ring"))
  expect(items.length).toBe(1)
  expect(items[0].tag).toBeTruthy()
  expect(items[0].status).toBe("in_stock")
  expect(items[0].netWt).toBe(10)
})

/**
 * The inverse: an unticked line stays off the shelf — it's recorded on the bill
 * only (e.g. loose/bulk metal), never as an inventory item.
 */
test("purchase: an unticked line does NOT create a stock item", async ({ page }) => {
  await login(page)

  await api(page, async (j) => {
    await j.db.suppliers.add({ name: "Repro Vendor 2", mobile: "9000000001" })
  })

  await navTo(page, "Purchase")
  await page.getByRole("button", { name: /new purchase/i }).first().click()

  const dialog = page.getByRole("dialog")
  await dialog.getByRole("combobox").first().click()
  await page.getByRole("option", { name: "Repro Vendor 2" }).click()

  await dialog.getByPlaceholder("e.g. Gold ring").fill("Loose Bulk Gold")
  const row = dialog.locator("tbody tr").first()
  await row.locator('input[type="number"]').nth(0).fill("50")

  // Switch to Bulk (weight-wise) — this line should be billed but not shelved.
  const stock = row.getByRole("switch", { name: /add to stock/i })
  await stock.click()
  await expect(stock).toHaveAttribute("aria-checked", "false")

  await dialog.getByRole("button", { name: /save purchase/i }).click()
  await expect(page.getByText(/^Saved PUR/)).toBeVisible({ timeout: 10_000 })

  const items = await api(page, (j) => j.db.items.search("Loose Bulk Gold"))
  expect(items.length).toBe(0)
})
