import { test, expect } from "@playwright/test"
import { login, navTo, api } from "../support/helpers"

/**
 * UI flow: add a stock item through the Item Master form. Category/Metal/Purity
 * default sensibly (Ring / gold / 22K), so a name + gross weight is the minimum;
 * the tag is minted and net weight derived on save.
 */
test("add an item through the New Item dialog", async ({ page }) => {
  await login(page)
  await navTo(page, "Item Master")
  await expect(page).toHaveURL(/\/inventory$/)

  await page.getByRole("button", { name: /new item/i }).first().click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "New Item" })).toBeVisible()

  await dialog.getByLabel("Item Name").fill("Gold Bangle Test")
  await dialog.getByLabel("Gross Wt (g)").fill("12.5")
  await dialog.getByLabel("Stone Wt (g)").fill("0.5")
  await dialog.getByRole("button", { name: /add item/i }).click()

  // Toast + row confirm the write; the derived net weight (12.000 g) shows.
  await expect(page.getByText(/added gold bangle test/i)).toBeVisible()
  await expect(page.getByRole("cell", { name: "Gold Bangle Test" })).toBeVisible()

  // The item persisted with a minted tag and derived net weight.
  const items = await api(page, (j) => j.db.items.search("Gold Bangle Test"))
  expect(items.length).toBe(1)
  expect(items[0].netWt).toBe(12)
  expect(items[0].tag).toBeTruthy()
  expect(items[0].status).toBe("in_stock")
})
