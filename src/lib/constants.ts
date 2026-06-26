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

/** Loyalty programme rules (configurable defaults). */
export const LOYALTY_EARN_PER_GRAM = 1 // points earned per gram of net weight sold
export const LOYALTY_RUPEES_PER_POINT = 1 // ₹ discount value of one point on redemption

export const ITEM_STATUS: Record<string, { label: string; tone: string }> = {
  in_stock: { label: "In Stock", tone: "bg-emerald-100 text-emerald-800" },
  sold: { label: "Sold", tone: "bg-muted text-muted-foreground" },
  melted: { label: "Melted", tone: "bg-orange-100 text-orange-800" },
  with_karigar: { label: "With Karigar", tone: "bg-blue-100 text-blue-800" },
}
