/** Display formatters. All money is INR, all weights are grams. */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

const inrPlain = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

/** ₹1,23,456.00 */
export const formatINR = (n: number | null | undefined): string =>
  inr.format(Number(n ?? 0))

/** 1,23,456.00 (no symbol) — for dense table cells. */
export const formatAmount = (n: number | null | undefined): string =>
  inrPlain.format(Number(n ?? 0))

/** 12.340 g */
export const formatWt = (n: number | null | undefined): string =>
  `${Number(n ?? 0).toFixed(3)} g`

/** Bare 3-dp weight for table cells. */
export const wt = (n: number | null | undefined): string =>
  Number(n ?? 0).toFixed(3)

/** 26 Jun 2026 from an ISO date string. */
export const formatDate = (iso?: string): string => {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
