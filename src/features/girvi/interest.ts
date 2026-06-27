import type { Loan, LoanPayment } from "@/db/types"

export interface LoanDuesBreakdown {
  days: number
  months: number
  interestAccrued: number
  interestPaid: number
  interestOutstanding: number
  principalPaid: number
  principalOutstanding: number
  totalDues: number
}

export function daysElapsed(fromIso: string, toIso: string): number {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 1
  const diffTime = to.getTime() - from.getTime()
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
}

/** Parse "YYYY-MM-DD" into integer parts (timezone-safe — no Date offset drift). */
function parseYmd(iso: string): { y: number; m: number; d: number } | null {
  const parts = iso.slice(0, 10).split("-").map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  return { y: parts[0], m: parts[1] - 1, d: parts[2] }
}

/**
 * Whole calendar months elapsed, rounding a partial month UP (min 1).
 * Jan 1 → Feb 1 = 1 month; Jan 1 → Feb 15 = 2; Jan 1 → Jan 31 = 1;
 * Jan 1 2024 → Jan 1 2025 = 12 (not 13 as a 30-day-block count would give).
 */
export function monthsElapsed(fromIso: string, toIso: string): number {
  const f = parseYmd(fromIso)
  const t = parseYmd(toIso)
  if (!f || !t) return 1
  let months = (t.y - f.y) * 12 + (t.m - f.m)
  if (t.d < f.d) months -= 1 // anniversary day-of-month not yet reached
  const isExactAnniversary = t.d === f.d && months >= 0
  const result = months + (isExactAnniversary ? 0 : 1)
  return Math.max(1, result)
}

export function calculateAccruedInterestForInterval(
  principal: number,
  ratePct: number,
  fromIso: string,
  toIso: string,
  mode: "monthly" | "daywise" = "monthly"
): number {
  if (principal <= 0) return 0
  if (mode === "daywise") {
    const days = daysElapsed(fromIso, toIso)
    return Number((principal * (ratePct / 30) * days / 100).toFixed(2))
  } else {
    const months = monthsElapsed(fromIso, toIso)
    return Number((principal * ratePct * months / 100).toFixed(2))
  }
}

export function computeLoanDues(
  loan: Loan,
  payments: LoanPayment[],
  asOfIso: string
): LoanDuesBreakdown {
  const mode = loan.interestMode || "monthly"
  const rate = loan.interestRate

  // Sort payments chronologically
  const sortedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date))

  let currentPrincipal = loan.loanAmount
  let lastDate = loan.date
  let totalInterestAccrued = 0
  let totalInterestPaid = 0
  let totalPrincipalPaid = 0

  for (const pay of sortedPayments) {
    // Accrue interest up to this payment date on current principal
    const acc = calculateAccruedInterestForInterval(currentPrincipal, rate, lastDate, pay.date, mode)
    totalInterestAccrued = Number((totalInterestAccrued + acc).toFixed(2))

    // In a payment: allocate amount to interest due first
    // Check if payment is towards interest / principal
    totalInterestPaid = Number((totalInterestPaid + pay.towardsInterest).toFixed(2))
    totalPrincipalPaid = Number((totalPrincipalPaid + pay.towardsPrincipal).toFixed(2))
    currentPrincipal = Number(Math.max(0, currentPrincipal - pay.towardsPrincipal).toFixed(2))

    lastDate = pay.date
  }

  // Accrue interest from lastDate to asOfIso
  const finalAcc = calculateAccruedInterestForInterval(currentPrincipal, rate, lastDate, asOfIso, mode)
  totalInterestAccrued = Number((totalInterestAccrued + finalAcc).toFixed(2))

  const interestOutstanding = Number(Math.max(0, totalInterestAccrued - totalInterestPaid).toFixed(2))
  const principalOutstanding = Number(Math.max(0, loan.loanAmount - totalPrincipalPaid).toFixed(2))
  const totalDues = Number((principalOutstanding + interestOutstanding).toFixed(2))

  const totalDays = daysElapsed(loan.date, asOfIso)
  const totalMonths = monthsElapsed(loan.date, asOfIso)

  return {
    days: totalDays,
    months: totalMonths,
    interestAccrued: totalInterestAccrued,
    interestPaid: totalInterestPaid,
    interestOutstanding,
    principalPaid: totalPrincipalPaid,
    principalOutstanding,
    totalDues,
  }
}

export interface LoanDues {
  months: number
  interest: number
  total: number
}

/** Simple monthly interest: principal × rate% × months. Backwards compatibility helper. */
export function computeDues(
  principal: number,
  monthlyRatePct: number,
  fromIso: string,
  asOfIso: string,
): LoanDues {
  const months = monthsElapsed(fromIso, asOfIso)
  const interest = Number(((principal * monthlyRatePct * months) / 100).toFixed(2))
  return { months, interest, total: Number((principal + interest).toFixed(2)) }
}
