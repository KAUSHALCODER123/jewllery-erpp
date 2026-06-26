/**
 * Pure billing math for the POS. Kept side-effect free so the numbers are
 * trivially testable and identical wherever they are shown (grid, checkout,
 * printed invoice, saved invoice). Follows the spec formula:
 *
 *     taxable = salesTotal - urdTotal
 *     net     = taxable + CGST + SGST
 *     balance = net - (cash + upi)
 */

export interface SalesLine {
  /** Local row id (crypto.randomUUID). */
  id: string
  itemId?: number
  tag: string
  description: string
  netWt: number
  /** Metal rate per gram. */
  rate: number
  /** Making charge per gram. */
  makingPerGm: number
  /** HSN tax code. */
  hsn?: string
}

export interface UrdLine {
  id: string
  description: string
  grossWt: number
  /** Purity/impurity deduction percentage applied to gross. */
  lessPct: number
  /** Rate per gram paid for the old gold. */
  rate: number
}

const round = (n: number): number => Number((n || 0).toFixed(2))
const round3 = (n: number): number => Number((n || 0).toFixed(3))

/** Making amount for a sales line = makingPerGm × netWt. */
export const lineMakingAmount = (l: SalesLine): number =>
  round(l.makingPerGm * l.netWt)

/** Final amount for a sales line = rate × netWt + making. */
export const lineAmount = (l: SalesLine): number =>
  round(l.rate * l.netWt + lineMakingAmount(l))

/** Net weight of an old-gold line after the "less %" deduction. */
export const urdNetWt = (u: UrdLine): number =>
  round3(u.grossWt * (1 - (u.lessPct || 0) / 100))

/** Value credited for an old-gold line = netWt × rate. */
export const urdAmount = (u: UrdLine): number => round(urdNetWt(u) * u.rate)

export interface PosTotals {
  salesTotal: number
  salesNetWt: number
  urdTotal: number
  billDiscount: number
  makingDiscount: number
  loyaltyDiscount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  gstAmount: number
  tcs: number
  netAmount: number
  received: number
  advanceApplied: number
  balance: number
}

export interface BillOptions {
  billDiscount?: number
  makingDiscount?: number
  loyaltyDiscount?: number
  tcsPct?: number
  /** Inter-state sale → IGST (full rate) instead of CGST+SGST split. */
  interState?: boolean
  advanceApplied?: number
}

/**
 * Aggregate the whole bill. `gstRate` is the *total* GST percent (e.g. 3).
 * Intra-state splits it into CGST + SGST; inter-state charges it all as IGST.
 */
export function computeTotals(
  sales: SalesLine[],
  urd: UrdLine[],
  gstRate: number,
  cashPaid: number,
  upiPaid: number,
  opts: BillOptions = {},
): PosTotals {
  const billDiscount = Math.max(0, opts.billDiscount || 0)
  const makingDiscount = Math.max(0, opts.makingDiscount || 0)
  const loyaltyDiscount = Math.max(0, opts.loyaltyDiscount || 0)
  const tcsPct = Math.max(0, opts.tcsPct || 0)
  const advanceApplied = Math.max(0, opts.advanceApplied || 0)

  const salesTotal = round(sales.reduce((s, l) => s + lineAmount(l), 0))
  const salesNetWt = round3(sales.reduce((s, l) => s + l.netWt, 0))
  const urdTotal = round(urd.reduce((s, u) => s + urdAmount(u), 0))

  // Taxable = sales − old-gold − discounts. Never below zero.
  const taxable = round(
    Math.max(
      0,
      salesTotal - urdTotal - billDiscount - makingDiscount - loyaltyDiscount,
    ),
  )

  let cgst = 0
  let sgst = 0
  let igst = 0
  if (opts.interState) {
    igst = round((taxable * gstRate) / 100)
  } else {
    cgst = round((taxable * gstRate) / 2 / 100)
    sgst = round((taxable * gstRate) / 2 / 100)
  }
  const gstAmount = round(cgst + sgst + igst)
  const tcs = round((taxable * tcsPct) / 100)

  const netAmount = round(taxable + gstAmount + tcs)
  const received = round((cashPaid || 0) + (upiPaid || 0))
  const balance = round(netAmount - received - advanceApplied)

  return {
    salesTotal,
    salesNetWt,
    urdTotal,
    billDiscount,
    makingDiscount,
    loyaltyDiscount,
    taxable,
    cgst,
    sgst,
    igst,
    gstAmount,
    tcs,
    netAmount,
    received,
    advanceApplied,
    balance,
  }
}

/** GST rate options offered in the checkout dropdown. */
export const GST_RATES = [
  { label: "No GST (0%)", value: 0 },
  { label: "GST 1.5%", value: 1.5 },
  { label: "GST 3% (Gold/Silver)", value: 3 },
  { label: "GST 5%", value: 5 },
  { label: "GST 18%", value: 18 },
]
