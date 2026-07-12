/**
 * Native desktop smoke test — drives the REAL built Tauri binary
 * (src-tauri/target/release/jewel-erp.exe) through WebView2 via `tauri-driver`
 * + selenium-webdriver. Unlike the Playwright suite (which runs the web bundle
 * in Chromium), this exercises the shipped desktop app itself.
 *
 * Prereqs (see docs/DESKTOP-E2E.md): a release build, `cargo install tauri-driver`,
 * Microsoft Edge WebDriver (msedgedriver) matching the installed WebView2, and
 * `npm i -D selenium-webdriver`. This runs on an unrestricted machine or CI —
 * on the primary dev box, WDAC blocks `cargo install` (installs via Temp).
 *
 * NOTE: production builds omit the DEV-only window.__jewel bridge, so this is a
 * pure UI smoke — no service-layer access. Run:  node e2e-desktop/desktop.smoke.mjs
 *
 * When built with VITE_SQLITE_CUTOVER=1 (the desktop-e2e CI does this), this also
 * validates the SQLite cutover end-to-end on the real binary: login exercises the
 * SQLite system DB (auth bootstrap + verify), and the sale round-trip below writes
 * an invoice via SQLite then reads the walk-in customer back from a fresh page
 * mount — proving persistence, not just an in-memory write.
 */
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Builder, By, until, Key } from "selenium-webdriver"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const application = path.resolve(
  __dirname,
  "..",
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "jewel-erp.exe" : "jewel-erp",
)

const TAURI_DRIVER_URL = "http://127.0.0.1:4444/"
const TIMEOUT = 20_000

let tauriDriver
let driver
const failures = []

async function step(name, fn) {
  try {
    await fn()
    console.log(`  ok   ${name}`)
  } catch (err) {
    failures.push(name)
    console.error(`  FAIL ${name}: ${err.message}`)
  }
}

async function main() {
  console.log(`Driving desktop binary:\n  ${application}\n`)

  // Start the tauri-driver WebDriver intermediary.
  tauriDriver = spawn("tauri-driver", [], {
    stdio: [null, process.stdout, process.stderr],
    shell: process.platform === "win32",
  })

  // Give tauri-driver a moment to bind its port.
  await new Promise((r) => setTimeout(r, 2000))

  driver = await new Builder()
    .withCapabilities({
      browserName: "wry",
      "tauri:options": { application },
    })
    .usingServer(TAURI_DRIVER_URL)
    .build()

  await step("login form renders", async () => {
    await driver.wait(until.elementLocated(By.css('input[type="password"]')), TIMEOUT)
  })

  await step("select the first firm", async () => {
    // Radix Select trigger (first combobox) → first option.
    const trigger = await driver.wait(
      until.elementLocated(By.css('[role="combobox"]')),
      TIMEOUT,
    )
    await trigger.click()
    const option = await driver.wait(
      until.elementLocated(By.css('[role="option"]')),
      TIMEOUT,
    )
    await option.click()
  })

  await step("log in with admin/admin", async () => {
    const pw = await driver.findElement(By.css('input[type="password"]'))
    await pw.sendKeys("admin")
    // Submit the form (Enter) — avoids matching the icon inside the button.
    await pw.sendKeys(Key.ENTER)
  })

  await step("dashboard shell appears after login", async () => {
    await driver.wait(
      until.elementLocated(By.xpath('//a[contains(., "Dashboard")]')),
      TIMEOUT,
    )
  })

  await step("navigate to Billing / POS", async () => {
    const billing = await driver.findElement(
      By.xpath('//a[contains(., "Billing / POS")]'),
    )
    await billing.click()
    await driver.wait(
      until.elementLocated(By.xpath('//*[contains(text(), "Checkout")]')),
      TIMEOUT,
    )
  })

  // ---- Sale round-trip (validates the SQLite write+read path on desktop) ----
  const SALE_CUSTOMER = "Desktop SQLite Buyer"

  await step("add a sales line to the grid", async () => {
    await (await driver.findElement(By.xpath('//button[contains(., "Blank row")]'))).click()
    const desc = await driver.wait(
      until.elementLocated(By.css('input[aria-label="Description"]')),
      TIMEOUT,
    )
    await desc.sendKeys("Gold Coin 10g")
    // NumCell selects-all on focus, so sendKeys replaces the "0" placeholder.
    await (await driver.findElement(By.css('input[aria-label="Net weight"]'))).sendKeys("10")
    await (await driver.findElement(By.css('input[aria-label="Rate per gram"]'))).sendKeys("6000")
  })

  await step("create + select a walk-in customer", async () => {
    await (await driver.findElement(By.xpath('//*[contains(text(), "Select customer")]'))).click()
    // Target the customer picker's search specifically — the billing grid now has
    // its own "Search item…" box, so a loose placeholder*="Search" would match that.
    const input = await driver.wait(
      until.elementLocated(By.css('input[placeholder*="type a new name"]')),
      TIMEOUT,
    )
    await input.sendKeys(SALE_CUSTOMER)
    // The label is "Add “<name>” as walk-in customer" — the {query} interpolation
    // splits it across text nodes, so match the option's full string value (.)
    // rather than its first text node (text()).
    const addItem = await driver.wait(
      until.elementLocated(
        By.xpath('//*[@role="option" and contains(., "as walk-in customer")]'),
      ),
      TIMEOUT,
    )
    await addItem.click()
  })

  await step("take full cash and Save & Print", async () => {
    // The success toast from adding the walk-in customer floats bottom-right over
    // the pay buttons and can intercept the click — wait for toasts to clear.
    await driver.wait(
      async () => (await driver.findElements(By.css("[data-sonner-toast]"))).length === 0,
      TIMEOUT,
    )
    await (await driver.findElement(By.xpath('//button[normalize-space()="full"]'))).click()
    await (await driver.findElement(By.xpath('//button[contains(., "Save & Print")]'))).click()
  })

  await step("SQLite round-trip: invoice minted, then customer read back", async () => {
    // createInvoice minted an INV number from the (SQLite) counter and printed it.
    // Heading is "Invoice {invoiceNo}" — the interpolation splits it across text
    // nodes, so match the span's string value (.) not its first text node.
    await driver.wait(
      until.elementLocated(By.xpath('//span[contains(., "Invoice INV")]')),
      TIMEOUT,
    )
    // Close the receipt and open Customers — a fresh mount re-reads from SQLite,
    // so seeing the walk-in customer proves the write persisted.
    await (await driver.findElement(By.xpath('//button[contains(., "Close")]'))).click()
    await (await driver.findElement(By.xpath('//a[contains(., "Customers")]'))).click()
    await driver.wait(
      until.elementLocated(By.xpath(`//*[contains(text(), "${SALE_CUSTOMER}")]`)),
      TIMEOUT,
    )
  })
}

async function cleanup() {
  try {
    if (driver) await driver.quit()
  } catch {
    /* ignore */
  }
  if (tauriDriver) tauriDriver.kill()
}

main()
  .catch((err) => {
    console.error(`Fatal: ${err.stack || err.message}`)
    failures.push("harness")
  })
  .finally(async () => {
    await cleanup()
    if (failures.length) {
      console.error(`\n${failures.length} step(s) failed: ${failures.join(", ")}`)
      process.exit(1)
    }
    console.log("\nAll desktop smoke steps passed.")
    process.exit(0)
  })
