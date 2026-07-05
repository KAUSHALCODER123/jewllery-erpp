import { test, expect } from "@playwright/test"
import {
  computeTotals,
  lineAmount,
  lineMakingAmount,
  urdNetWt,
  urdAmount,
  type SalesLine,
  type UrdLine,
} from "../../src/features/pos/calc"

/** Pure POS billing math — no browser required. */

const sale = (over: Partial<SalesLine> = {}): SalesLine => ({
  id: "l1",
  tag: "RIN0001",
  description: "Ring",
  netWt: 10,
  rate: 6000,
  makingPerGm: 500,
  ...over,
})

const urd = (over: Partial<UrdLine> = {}): UrdLine => ({
  id: "u1",
  description: "Old gold",
  grossWt: 10,
  lessPct: 10,
  rate: 5000,
  ...over,
})

test.describe("POS line math", () => {
  test("line making + line amount", () => {
    const l = sale()
    expect(lineMakingAmount(l)).toBe(5000) // 500 * 10
    expect(lineAmount(l)).toBe(65000) // 6000*10 + 5000
  })

  test("urd net weight applies less %", () => {
    expect(urdNetWt(urd())).toBe(9) // 10 * (1 - 0.10)
    expect(urdAmount(urd())).toBe(45000) // 9 * 5000
  })
})

test.describe("computeTotals", () => {
  test("intra-state splits GST into equal CGST + SGST", () => {
    const t = computeTotals([sale()], [], 3, 0, 0)
    expect(t.salesTotal).toBe(65000)
    expect(t.taxable).toBe(65000)
    expect(t.cgst).toBe(975) // 65000 * 1.5%
    expect(t.sgst).toBe(975)
    expect(t.igst).toBe(0)
    expect(t.gstAmount).toBe(1950)
    expect(t.netAmount).toBe(66950)
    expect(t.balance).toBe(66950)
  })

  test("inter-state charges the whole rate as IGST", () => {
    const t = computeTotals([sale()], [], 3, 0, 0, { interState: true })
    expect(t.cgst).toBe(0)
    expect(t.sgst).toBe(0)
    expect(t.igst).toBe(1950) // 65000 * 3%
    expect(t.netAmount).toBe(66950)
  })

  test("old gold reduces the taxable base", () => {
    const t = computeTotals([sale()], [urd()], 3, 0, 0)
    // taxable = 65000 - 45000 = 20000
    expect(t.urdTotal).toBe(45000)
    expect(t.taxable).toBe(20000)
    expect(t.cgst).toBe(300)
    expect(t.netAmount).toBe(20600)
  })

  test("discounts + loyalty stack before tax; taxable never negative", () => {
    const t = computeTotals([sale()], [], 3, 0, 0, {
      billDiscount: 1000,
      makingDiscount: 500,
      loyaltyDiscount: 500,
    })
    expect(t.taxable).toBe(63000) // 65000 - 2000
    const over = computeTotals([sale()], [], 3, 0, 0, { billDiscount: 999999 })
    expect(over.taxable).toBe(0)
    expect(over.netAmount).toBe(0)
  })

  test("TCS is added on top of tax; balance nets payments", () => {
    const t = computeTotals([sale()], [], 3, 40000, 10000, { tcsPct: 1 })
    expect(t.tcs).toBe(650) // 65000 * 1%
    expect(t.netAmount).toBe(67600) // 65000 + 1950 + 650
    expect(t.received).toBe(50000)
    expect(t.balance).toBe(17600)
  })

  test("advance applied further reduces the balance", () => {
    const t = computeTotals([sale()], [], 0, 0, 0, { advanceApplied: 5000 })
    expect(t.netAmount).toBe(65000)
    expect(t.advanceApplied).toBe(5000)
    expect(t.balance).toBe(60000)
  })

  test("empty bill is all zeros", () => {
    const t = computeTotals([], [], 3, 0, 0)
    expect(t.salesTotal).toBe(0)
    expect(t.netAmount).toBe(0)
    expect(t.balance).toBe(0)
  })
})
