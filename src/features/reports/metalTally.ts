/**
 * Pure aggregation for the Daily Metal Weight Tally. Kept side-effect free (like
 * calc.ts) so the numbers are identical on Dexie and SQLite and trivially tested.
 *
 * It reads unified inventory-ledger movements (each carrying a metal, an optional
 * category and a ₹ value) and, for one day, produces per-metal / per-category:
 *   opening (net weight before the day) · in · out · closing · in₹ · out₹
 */
import type { InventoryLedger, MetalTally, MetalTallyGroup, MetalTallyRow, MetalType } from "@/db/types"

const w3 = (n: number): number => Number((n || 0).toFixed(3))
const r2 = (n: number): number => Number((n || 0).toFixed(2))

export type TallyMovement = Pick<
  InventoryLedger,
  "date" | "movement" | "weight" | "metalType" | "category" | "value"
>

interface Acc {
  opening: number
  inWt: number
  outWt: number
  inValue: number
  outValue: number
}
const emptyAcc = (): Acc => ({ opening: 0, inWt: 0, outWt: 0, inValue: 0, outValue: 0 })

/** Aggregate ledger movements into the tally for `date` ("YYYY-MM-DD"). */
export function computeMetalTally(rows: TallyMovement[], date: string): MetalTally {
  // metal -> category -> accumulator
  const byMetal = new Map<MetalType, Map<string, Acc>>()

  for (const r of rows) {
    if (!r.metalType) continue // internal movements (karigar/refining) aren't metal-tallied
    if (r.date > date) continue // future movements don't affect this day
    const cats = byMetal.get(r.metalType) ?? new Map<string, Acc>()
    byMetal.set(r.metalType, cats)
    const cat = (r.category && r.category.trim()) || "Uncategorized"
    const acc = cats.get(cat) ?? emptyAcc()
    cats.set(cat, acc)

    const weight = r.weight || 0
    const value = r.value || 0
    if (r.date < date) {
      // Everything before today rolls into the opening balance.
      acc.opening += r.movement === "in" ? weight : -weight
    } else {
      // Movements on the day itself.
      if (r.movement === "in") {
        acc.inWt += weight
        acc.inValue += value
      } else {
        acc.outWt += weight
        acc.outValue += value
      }
    }
  }

  const groups: MetalTallyGroup[] = []
  for (const [metal, cats] of byMetal) {
    const categories: MetalTallyRow[] = []
    const tot = emptyAcc()
    for (const [category, a] of cats) {
      const closing = a.opening + a.inWt - a.outWt
      categories.push({
        category,
        opening: w3(a.opening),
        inWt: w3(a.inWt),
        outWt: w3(a.outWt),
        closing: w3(closing),
        inValue: r2(a.inValue),
        outValue: r2(a.outValue),
      })
      tot.opening += a.opening
      tot.inWt += a.inWt
      tot.outWt += a.outWt
      tot.inValue += a.inValue
      tot.outValue += a.outValue
    }
    // Categories: biggest closing stock first, stable by name.
    categories.sort((x, y) => y.closing - x.closing || x.category.localeCompare(y.category))
    groups.push({
      metal,
      categories,
      opening: w3(tot.opening),
      inWt: w3(tot.inWt),
      outWt: w3(tot.outWt),
      closing: w3(tot.opening + tot.inWt - tot.outWt),
      inValue: r2(tot.inValue),
      outValue: r2(tot.outValue),
    })
  }
  // Metals in a stable, familiar order: gold, silver, then the rest.
  const order: Record<string, number> = { gold: 0, silver: 1, platinum: 2, other: 3 }
  groups.sort((a, b) => (order[a.metal] ?? 9) - (order[b.metal] ?? 9))

  return { date, groups }
}
