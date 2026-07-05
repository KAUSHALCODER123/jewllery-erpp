import { test, expect } from "@playwright/test"
import {
  monthsElapsed,
  daysElapsed,
  calculateAccruedInterestForInterval,
  computeLoanDues,
  computeDues,
} from "../../src/features/girvi/interest"
import type { Loan, LoanPayment } from "../../src/db/types"

/** Pure Girvi (gold-loan) interest engine — no browser required. */

const loan = (over: Partial<Loan> = {}): Loan => ({
  id: 1,
  loanNo: "GRV0001",
  customerId: 1,
  date: "2024-01-01",
  loanAmount: 100000,
  interestRate: 2, // 2% per month
  interestMode: "monthly",
  isClosed: false,
  principalOutstanding: 100000,
  createdAt: "2024-01-01T00:00:00.000Z",
  ...over,
}) as Loan

test.describe("calendar month counting", () => {
  test("exact anniversaries do not over-count", () => {
    expect(monthsElapsed("2024-01-01", "2024-02-01")).toBe(1)
    expect(monthsElapsed("2024-01-01", "2025-01-01")).toBe(12)
  })
  test("partial months round up, minimum one", () => {
    expect(monthsElapsed("2024-01-01", "2024-02-15")).toBe(2)
    expect(monthsElapsed("2024-01-01", "2024-01-31")).toBe(1)
    expect(monthsElapsed("2024-01-01", "2024-01-01")).toBe(1)
  })
  test("daysElapsed is at least one and ceils partials", () => {
    expect(daysElapsed("2024-01-01", "2024-01-11")).toBe(10)
    expect(daysElapsed("2024-01-01", "2024-01-01")).toBe(1)
  })
})

test.describe("accrual", () => {
  test("monthly accrual = principal * rate% * months", () => {
    expect(
      calculateAccruedInterestForInterval(100000, 2, "2024-01-01", "2024-04-01", "monthly"),
    ).toBe(6000) // 3 months * 2%
  })
  test("daywise accrual pro-rates over 30-day months", () => {
    expect(
      calculateAccruedInterestForInterval(100000, 3, "2024-01-01", "2024-01-31", "daywise"),
    ).toBe(3000) // 3% / 30 * 30 days
  })
})

test.describe("computeLoanDues", () => {
  test("no payments: interest accrues on full principal", () => {
    const d = computeLoanDues(loan(), [], "2024-04-01")
    expect(d.months).toBe(3)
    expect(d.interestAccrued).toBe(6000)
    expect(d.principalOutstanding).toBe(100000)
    expect(d.interestOutstanding).toBe(6000)
    expect(d.totalDues).toBe(106000)
  })

  test("a part payment clears interest first, then principal", () => {
    const pays: LoanPayment[] = [
      {
        id: 1,
        loanId: 1,
        date: "2024-04-01",
        amount: 10000,
        towardsInterest: 6000,
        towardsPrincipal: 4000,
        type: "part",
      },
    ]
    const d = computeLoanDues(loan(), pays, "2024-04-01")
    expect(d.principalPaid).toBe(4000)
    expect(d.principalOutstanding).toBe(96000)
    // The 6000 accrued at the payment date is fully cleared by the cash. The
    // dues engine floors each interval at one month, so as-of the payment date a
    // fresh month already accrues on the reduced principal (96000 * 2% = 1920).
    expect(d.interestOutstanding).toBe(1920)
  })

  test("renewal capitalises unpaid interest so it compounds", () => {
    // At renewal the customer pays nothing; 6000 interest rolls into principal.
    const pays: LoanPayment[] = [
      {
        id: 1,
        loanId: 1,
        date: "2024-04-01",
        amount: 0,
        towardsInterest: 0,
        towardsPrincipal: 0,
        type: "renewal",
        capitalisedInterest: 6000,
      },
    ]
    const d = computeLoanDues(loan(), pays, "2024-05-01")
    // Principal compounds to 106000; one further month at 2% = 2120.
    expect(d.principalOutstanding).toBe(106000)
    expect(d.interestCapitalised).toBe(6000)
    expect(d.interestAccrued).toBe(8120) // 6000 + 2120
    expect(d.interestOutstanding).toBe(2120)
  })
})

test("computeDues backwards-compat helper", () => {
  const d = computeDues(100000, 2, "2024-01-01", "2024-03-01")
  expect(d.months).toBe(2)
  expect(d.interest).toBe(4000)
  expect(d.total).toBe(104000)
})
