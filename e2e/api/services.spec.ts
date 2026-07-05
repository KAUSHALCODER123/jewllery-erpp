import { test, expect } from "@playwright/test"
import { openApp, api } from "../support/helpers"

/**
 * Service-layer ("API") tests. There is no HTTP server — the app is offline and
 * every business rule lives in src/services/dbService.ts over IndexedDB. We drive
 * that real layer through the window.__jewel bridge, so these assert the exact
 * code the desktop app runs. Each test gets a fresh, empty IndexedDB.
 */

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test.describe("auth", () => {
  test("bootstrap creates the admin owner; login enforces the password", async ({ page }) => {
    const user = await api(page, (j) => j.auth.login("admin", "admin"))
    expect(user.username).toBe("admin")
    expect(user.role).toBe("owner")

    const err = await api(page, async (j) => {
      try {
        await j.auth.login("admin", "wrong")
        return "no-error"
      } catch (e) {
        return (e as Error).message
      }
    })
    expect(err).toMatch(/invalid/i)
  })

  test("a default firm exists to log into", async ({ page }) => {
    const companies = await api(page, (j) => j.auth.listCompanies())
    expect(companies.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe("customers", () => {
  test("add + read back + outstanding uses opening balance", async ({ page }) => {
    const created = await api(page, (j) =>
      j.db.customers.add({ name: "Asha Verma", mobile: "9812345678", openingBalance: 5000, loyaltyPoints: 0 }),
    )
    expect(created.id).toBeGreaterThan(0)

    const all = await api(page, (j) => j.db.customers.getAll())
    expect(all.map((c: any) => c.name)).toContain("Asha Verma")

    const outstanding = await api(page, (j, id) => j.db.customers.getOutstanding(id), created.id)
    expect(outstanding).toBe(5000)
  })
})

test.describe("inventory", () => {
  test("seeding stock produces in-stock items with minted tags", async ({ page }) => {
    const n = await api(page, (j) => j.seed.items())
    expect(n).toBeGreaterThan(0)

    const inStock = await api(page, (j) => j.db.items.getInStock())
    expect(inStock.length).toBe(n)
    // Net weight is derived (gross - stone) and every item carries a tag.
    for (const it of inStock.slice(0, 3)) {
      expect(it.tag).toBeTruthy()
      expect(it.netWt).toBeCloseTo(Number((it.grossWt - it.stoneWt).toFixed(3)), 3)
    }
  })

  test("search matches tag / name / huid", async ({ page }) => {
    await api(page, (j) => j.seed.items())
    const byName = await api(page, (j) => j.db.items.search("chain"))
    expect(byName.length).toBeGreaterThan(0)
    expect(byName.every((i: any) => /chain/i.test(i.name) || /chain/i.test(i.tag))).toBeTruthy()
  })
})

test.describe("sales", () => {
  test("createInvoice mints a number, marks stock sold, and feeds the day book", async ({ page }) => {
    const result = await api(page, async (j) => {
      const cust = await j.db.customers.add({ name: "Walk-in", mobile: "0000000000", openingBalance: 0, loyaltyPoints: 0 })
      const item = await j.db.items.add({
        name: "Test Ring", type: "gold", category: "Ring", purity: "22K (916)",
        grossWt: 10, stoneWt: 0, makingChargePerGm: 500,
      })
      const today = j.db.todayStr()
      const inv = await j.db.sales.createInvoice({
        invoice: {
          customerId: cust.id, date: today,
          totalGrossAmount: 65000, totalUrdAmount: 0,
          taxableAmount: 65000, cgst: 975, sgst: 975, netAmount: 66950,
          cashPaid: 66950, upiPaid: 0, balance: 0,
        },
        items: [{
          itemId: item.id, description: "Test Ring", netWt: 10, rate: 6000,
          makingAmount: 5000, finalAmount: 65000,
        }],
        urd: [],
      })
      const soldItem = await j.db.items.get(item.id)
      const day = await j.db.reports.getDayBook(today)
      return { invoiceNo: inv.invoiceNo, soldStatus: soldItem.status, day }
    })

    expect(result.invoiceNo).toMatch(/^INV\d+$/)
    expect(result.soldStatus).toBe("sold")
    expect(result.day.invoiceCount).toBe(1)
    expect(result.day.totalSales).toBe(65000)
    expect(result.day.totalTax).toBe(1950)
    expect(result.day.cashCollected).toBe(66950)
  })

  test("an unpaid balance raises the customer's outstanding", async ({ page }) => {
    const outstanding = await api(page, async (j) => {
      const cust = await j.db.customers.add({ name: "Credit Buyer", mobile: "9800000001", openingBalance: 0, loyaltyPoints: 0 })
      await j.db.sales.createInvoice({
        invoice: {
          customerId: cust.id, date: j.db.todayStr(),
          totalGrossAmount: 20000, totalUrdAmount: 0, taxableAmount: 20000,
          cgst: 300, sgst: 300, netAmount: 20600, cashPaid: 10000, upiPaid: 0, balance: 10600,
        },
        items: [{ description: "Chain", netWt: 5, rate: 4000, makingAmount: 0, finalAmount: 20000 }],
        urd: [],
      })
      return j.db.customers.getOutstanding(cust.id)
    })
    expect(outstanding).toBe(10600)
  })
})

test.describe("receipts (Udhari collection)", () => {
  test("a receipt reduces the customer's outstanding", async ({ page }) => {
    const after = await api(page, async (j) => {
      const cust = await j.db.customers.add({ name: "Debtor", mobile: "9800000002", openingBalance: 10000, loyaltyPoints: 0 })
      await j.db.receipts.add({ customerId: cust.id, date: j.db.todayStr(), amount: 4000, mode: "cash" })
      return j.db.customers.getOutstanding(cust.id)
    })
    expect(after).toBe(6000)
  })
})

test.describe("girvi loans", () => {
  test("a part payment lowers principal and keeps the loan open", async ({ page }) => {
    const res = await api(page, async (j) => {
      const cust = await j.db.customers.add({ name: "Borrower", mobile: "9800000003", openingBalance: 0, loyaltyPoints: 0 })
      const loan = await j.db.loans.add({
        customerId: cust.id, date: j.db.todayStr(), itemsPledged: [], grossWt: 20, netWt: 20,
        loanAmount: 100000, interestRate: 2, interestMode: "monthly",
      })
      await j.db.loans.addPayment(loan.id, { date: j.db.todayStr(), amount: 5000, type: "part" })
      const after = await j.db.loans.get(loan.id)
      return { loanNo: loan.loanNo, isClosed: after.isClosed, principal: after.principalOutstanding }
    })
    expect(res.loanNo).toMatch(/^GRV\d+$/)
    expect(res.isClosed).toBe(false)
    expect(res.principal).toBeLessThanOrEqual(100000)
  })
})

test.describe("gold schemes", () => {
  test("enrol + schedule spans the plan duration", async ({ page }) => {
    const res = await api(page, async (j) => {
      await j.seed.schemes()
      const schemes = await j.db.schemes.getSchemes()
      const cust = await j.db.customers.add({ name: "Saver", mobile: "9800000004", openingBalance: 0, loyaltyPoints: 0 })
      const acct = await j.db.schemes.enroll(schemes[0].id, cust.id, j.db.todayStr())
      await j.db.schemes.addPayment(acct.id, schemes[0].monthlyAmount, j.db.todayStr(), "cash", 1)
      const schedule = await j.db.schemes.getSchedule(acct.id)
      return {
        duration: schemes[0].durationMonths,
        rows: schedule.length,
        firstPaid: schedule[0].paid,
      }
    })
    expect(res.rows).toBe(res.duration)
    expect(res.firstPaid).toBe(true)
  })
})

test.describe("backup & restore", () => {
  test("export then import round-trips the business data", async ({ page }) => {
    const res = await api(page, async (j) => {
      await j.db.customers.add({ name: "Before Wipe", mobile: "9800000005", openingBalance: 0, loyaltyPoints: 0 })
      const backup = await j.db.maintenance.exportData({})
      await j.db.maintenance.clearAll()
      const afterClear = await j.db.customers.getAll()
      const report = await j.db.maintenance.importData(backup)
      const afterRestore = await j.db.customers.getAll()
      return {
        clearedCount: afterClear.length,
        restoredCount: afterRestore.length,
        rows: report.rows,
        name: afterRestore[0]?.name,
      }
    })
    expect(res.clearedCount).toBe(0)
    expect(res.restoredCount).toBe(1)
    expect(res.name).toBe("Before Wipe")
  })
})
