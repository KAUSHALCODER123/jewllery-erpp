import { test, expect } from "@playwright/test"
import { computeMetalTally, type TallyMovement } from "@/features/reports/metalTally"

/** Ledger movements across three days, gold + silver, several categories. */
const ROWS: TallyMovement[] = [
  // --- before the tally day (roll into opening) ---
  { date: "2026-07-13", movement: "in", weight: 100, metalType: "silver", category: "Other", value: 8000 },
  { date: "2026-07-13", movement: "in", weight: 10, metalType: "gold", category: "Ring", value: 60000 },
  { date: "2026-07-14", movement: "out", weight: 30, metalType: "silver", category: "Other", value: 2700 },
  // --- the tally day itself (2026-07-15) ---
  { date: "2026-07-15", movement: "in", weight: 250, metalType: "silver", category: "Other", value: 20000 },
  { date: "2026-07-15", movement: "out", weight: 40, metalType: "silver", category: "Other", value: 3600 },
  { date: "2026-07-15", movement: "out", weight: 5, metalType: "gold", category: "Ring", value: 32000 },
  { date: "2026-07-15", movement: "in", weight: 8, metalType: "gold", category: "Old Gold", value: 46000 },
  { date: "2026-07-15", movement: "out", weight: 2.5, metalType: "gold", category: "Nathani", value: 16000 },
  // --- future (must be ignored) ---
  { date: "2026-07-16", movement: "in", weight: 999, metalType: "silver", category: "Other", value: 1 },
  // --- internal movement with no metal (must be ignored) ---
  { date: "2026-07-15", movement: "out", weight: 5, category: "x", value: 0 },
]

test("silver tally: opening/in/out/closing weight for the day", () => {
  const t = computeMetalTally(ROWS, "2026-07-15")
  const silver = t.groups.find((g) => g.metal === "silver")!
  expect(silver).toBeTruthy()
  // opening = 100 in − 30 out (both before the 15th) = 70
  expect(silver.opening).toBe(70)
  expect(silver.inWt).toBe(250)
  expect(silver.outWt).toBe(40)
  // closing = 70 + 250 − 40 = 280
  expect(silver.closing).toBe(280)
  expect(silver.inValue).toBe(20000)
  expect(silver.outValue).toBe(3600)
})

test("gold tally breaks down by category incl. old gold & nathani", () => {
  const t = computeMetalTally(ROWS, "2026-07-15")
  const gold = t.groups.find((g) => g.metal === "gold")!
  const cats = Object.fromEntries(gold.categories.map((c) => [c.category, c]))
  expect(cats["Ring"].opening).toBe(10)
  expect(cats["Ring"].outWt).toBe(5)
  expect(cats["Ring"].closing).toBe(5)
  expect(cats["Old Gold"].inWt).toBe(8) // URD intake shows as its own category
  expect(cats["Nathani"].outWt).toBe(2.5) // loose small-gold sold by weight
  // group totals: opening 10, in 8, out 7.5 → closing 10.5
  expect(gold.opening).toBe(10)
  expect(gold.inWt).toBe(8)
  expect(gold.outWt).toBe(7.5)
  expect(gold.closing).toBe(10.5)
})

test("future movements and metal-less internal movements are excluded", () => {
  const t = computeMetalTally(ROWS, "2026-07-15")
  const silver = t.groups.find((g) => g.metal === "silver")!
  // the +999 on the 16th must not leak into the 15th's closing
  expect(silver.closing).toBe(280)
  // only gold + silver groups (the metal-less row is dropped)
  expect(t.groups.map((g) => g.metal).sort()).toEqual(["gold", "silver"])
})

test("gold is listed before silver", () => {
  const t = computeMetalTally(ROWS, "2026-07-15")
  expect(t.groups[0].metal).toBe("gold")
  expect(t.groups[1].metal).toBe("silver")
})
