import type { MetalType } from "@/db/types"

/** Jewellery categories and their sequential barcode tag prefixes. */
export interface CategoryDef {
  label: string
  /** Barcode prefix, e.g. "RIN" => RIN0001. */
  prefix: string
  /** Default metal a category is usually made of. */
  defaultType: MetalType
}

export const CATEGORIES: CategoryDef[] = [
  { label: "Ring", prefix: "RIN", defaultType: "gold" },
  { label: "Chain", prefix: "CHN", defaultType: "gold" },
  { label: "Necklace", prefix: "NCK", defaultType: "gold" },
  { label: "Bangle", prefix: "BNG", defaultType: "gold" },
  { label: "Bracelet", prefix: "BRC", defaultType: "gold" },
  { label: "Earring", prefix: "EAR", defaultType: "gold" },
  { label: "Pendant", prefix: "PND", defaultType: "gold" },
  { label: "Nose Pin", prefix: "NOS", defaultType: "gold" },
  { label: "Mangalsutra", prefix: "MNG", defaultType: "gold" },
  { label: "Anklet (Payal)", prefix: "PAY", defaultType: "silver" },
  { label: "Silver Coin", prefix: "SLC", defaultType: "silver" },
  { label: "Silver Utensil", prefix: "SLU", defaultType: "silver" },
  { label: "Other", prefix: "OTH", defaultType: "gold" },
]

export const categoryByLabel = (label: string): CategoryDef | undefined =>
  CATEGORIES.find((c) => c.label === label)

export const METAL_TYPES: { label: string; value: MetalType }[] = [
  { label: "Gold", value: "gold" },
  { label: "Silver", value: "silver" },
  { label: "Platinum", value: "platinum" },
  { label: "Other", value: "other" },
]

/** Common Indian purity options by metal. */
export const PURITY_OPTIONS: Record<MetalType, string[]> = {
  gold: ["24K (999)", "23K (958)", "22K (916)", "20K (833)", "18K (750)", "14K (585)"],
  silver: ["999 (Fine)", "925 (Sterling)", "900", "835"],
  platinum: ["950 PT", "900 PT", "850 PT"],
  other: ["—"],
}

/**
 * Standard gold karats and their fineness %, used by the Refining module to
 * auto-populate input fineness from a chosen karat (no manual % typing).
 */
export interface KaratDef {
  karat: string
  label: string
  finePct: number
}

export const GOLD_KARATS: KaratDef[] = [
  { karat: "24K", label: "24K · 99.9%", finePct: 99.9 },
  { karat: "23K", label: "23K · 95.8%", finePct: 95.8 },
  { karat: "22K", label: "22K · 91.6%", finePct: 91.6 },
  { karat: "21K", label: "21K · 87.5%", finePct: 87.5 },
  { karat: "20K", label: "20K · 83.3%", finePct: 83.3 },
  { karat: "18K", label: "18K · 75.0%", finePct: 75.0 },
  { karat: "14K", label: "14K · 58.5%", finePct: 58.5 },
]

export const karatByLabel = (karat: string): KaratDef | undefined =>
  GOLD_KARATS.find((k) => k.karat === karat)

/** Kinds of scrap a jewellery shop sends for refining (searchable/filterable). */
export const SCRAP_TYPES: string[] = [
  "Old Jewellery",
  "Broken Jewellery",
  "Casting Scrap",
  "Polishing Dust",
  "Gold Filing",
  "Gold Sweeps",
  "Customer Exchange",
  "Returned Jewellery",
]

/** How a refiner charges for a job. */
export const REFINING_CHARGE_TYPES: { value: string; label: string; unit: string }[] = [
  { value: "none", label: "No charge", unit: "" },
  { value: "per_gram", label: "Per gram", unit: "₹/g" },
  { value: "flat", label: "Flat", unit: "₹" },
  { value: "percentage", label: "Percentage", unit: "%" },
]

/** Loyalty programme rules (configurable defaults). */
export const LOYALTY_EARN_PER_GRAM = 1 // points earned per gram of net weight sold
export const LOYALTY_RUPEES_PER_POINT = 1 // ₹ discount value of one point on redemption

export const ITEM_STATUS: Record<string, { label: string; tone: string }> = {
  in_stock: { label: "In Stock", tone: "bg-emerald-100 text-emerald-800" },
  sold: { label: "Sold", tone: "bg-muted text-muted-foreground" },
  melted: { label: "Melted", tone: "bg-orange-100 text-orange-800" },
  with_karigar: { label: "With Karigar", tone: "bg-blue-100 text-blue-800" },
}
