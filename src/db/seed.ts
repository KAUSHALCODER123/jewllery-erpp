import { categoryByLabel } from "@/lib/constants"
import {
  customersService,
  itemsService,
  suppliersService,
  schemesService,
} from "@/services/dbService"

/**
 * Dummy stock + customers so the POS (Phase 3) has something to bill against.
 * Idempotent: only seeds when the relevant table is empty.
 */

interface SeedItem {
  name: string
  category: string
  purity: string
  grossWt: number
  stoneWt: number
  makingChargePerGm: number
  huid?: string
}

const SEED_ITEMS: SeedItem[] = [
  { name: "Ladies Gold Ring (Floral)", category: "Ring", purity: "22K (916)", grossWt: 4.21, stoneWt: 0.35, makingChargePerGm: 550, huid: "AZ4D21" },
  { name: "Gents Gold Ring (Plain)", category: "Ring", purity: "22K (916)", grossWt: 6.8, stoneWt: 0, makingChargePerGm: 480, huid: "BX9K07" },
  { name: "Diamond Engagement Ring", category: "Ring", purity: "18K (750)", grossWt: 3.15, stoneWt: 0.6, makingChargePerGm: 900, huid: "CM2P58" },
  { name: "Rope Chain 20in", category: "Chain", purity: "22K (916)", grossWt: 18.5, stoneWt: 0, makingChargePerGm: 420, huid: "DH7Q31" },
  { name: "Box Chain 24in", category: "Chain", purity: "22K (916)", grossWt: 24.2, stoneWt: 0, makingChargePerGm: 400 },
  { name: "Antique Temple Necklace", category: "Necklace", purity: "22K (916)", grossWt: 42.6, stoneWt: 3.2, makingChargePerGm: 750, huid: "EK5R92" },
  { name: "Choker Necklace (CZ)", category: "Necklace", purity: "18K (750)", grossWt: 28.9, stoneWt: 4.1, makingChargePerGm: 820 },
  { name: "Kada Bangle (Pair)", category: "Bangle", purity: "22K (916)", grossWt: 35.4, stoneWt: 0, makingChargePerGm: 500, huid: "FN8T14" },
  { name: "Daily Wear Bangles (2pc)", category: "Bangle", purity: "22K (916)", grossWt: 21.7, stoneWt: 0, makingChargePerGm: 460 },
  { name: "Tennis Bracelet", category: "Bracelet", purity: "18K (750)", grossWt: 9.3, stoneWt: 1.8, makingChargePerGm: 880 },
  { name: "Jhumka Earrings", category: "Earring", purity: "22K (916)", grossWt: 7.6, stoneWt: 0.5, makingChargePerGm: 620, huid: "GP3W76" },
  { name: "Stud Earrings (Solitaire)", category: "Earring", purity: "18K (750)", grossWt: 2.1, stoneWt: 0.4, makingChargePerGm: 950 },
  { name: "Lakshmi Pendant", category: "Pendant", purity: "22K (916)", grossWt: 5.4, stoneWt: 0, makingChargePerGm: 700, huid: "HQ6Y29" },
  { name: "Diamond Mangalsutra", category: "Mangalsutra", purity: "18K (750)", grossWt: 12.8, stoneWt: 1.1, makingChargePerGm: 840, huid: "JR1Z63" },
  { name: "Nose Pin (Small)", category: "Nose Pin", purity: "18K (750)", grossWt: 0.45, stoneWt: 0.05, makingChargePerGm: 1200 },
  { name: "Silver Payal (Pair)", category: "Anklet (Payal)", purity: "925 (Sterling)", grossWt: 48.5, stoneWt: 0, makingChargePerGm: 95 },
  { name: "Silver Pooja Coin 10g", category: "Silver Coin", purity: "999 (Fine)", grossWt: 10.0, stoneWt: 0, makingChargePerGm: 35 },
  { name: "Silver Glass Set", category: "Silver Utensil", purity: "900", grossWt: 210.0, stoneWt: 0, makingChargePerGm: 28 },
]

interface SeedCustomer {
  name: string
  mobile: string
  city: string
  openingBalance: number
  loyaltyPoints: number
  pan?: string
  address?: string
}

const SEED_CUSTOMERS: SeedCustomer[] = [
  { name: "Rajesh Sharma", mobile: "9876543210", city: "Pune", openingBalance: 25000, loyaltyPoints: 120, pan: "ABCDE1234F", address: "12 MG Road" },
  { name: "Priya Deshmukh", mobile: "9823011223", city: "Nashik", openingBalance: 0, loyaltyPoints: 340 },
  { name: "Amit Patel", mobile: "9900112233", city: "Surat", openingBalance: 48000, loyaltyPoints: 0, pan: "PQRSX6789K", address: "Ring Road" },
  { name: "Sunita Verma", mobile: "9765004321", city: "Pune", openingBalance: -15000, loyaltyPoints: 75 },
  { name: "Mohammed Iqbal", mobile: "9112233445", city: "Mumbai", openingBalance: 0, loyaltyPoints: 200 },
  { name: "Lakshmi Iyer", mobile: "9445566778", city: "Pune", openingBalance: 5200, loyaltyPoints: 90 },
]

/** Seed items if the inventory is empty. Returns number of items added. */
export async function seedItemsIfEmpty(): Promise<number> {
  if ((await itemsService.count()) > 0) return 0
  for (const it of SEED_ITEMS) {
    const cat = categoryByLabel(it.category)
    await itemsService.add({
      name: it.name,
      type: cat?.defaultType ?? "gold",
      category: it.category,
      purity: it.purity,
      grossWt: it.grossWt,
      stoneWt: it.stoneWt,
      makingChargePerGm: it.makingChargePerGm,
      huid: it.huid,
      quantity: 1,
      tagPrefix: cat?.prefix ?? "ITM",
    })
  }
  return SEED_ITEMS.length
}

/** Seed customers if the customer table is empty. Returns number added. */
export async function seedCustomersIfEmpty(): Promise<number> {
  if ((await customersService.getAll()).length > 0) return 0
  for (const c of SEED_CUSTOMERS) {
    await customersService.add({
      name: c.name,
      mobile: c.mobile,
      city: c.city,
      address: c.address,
      pan: c.pan,
      openingBalance: c.openingBalance,
      loyaltyPoints: c.loyaltyPoints,
    })
  }
  return SEED_CUSTOMERS.length
}

/** Seed a couple of suppliers if none exist. */
export async function seedSuppliersIfEmpty(): Promise<number> {
  if ((await suppliersService.getAll()).length > 0) return 0
  const rows = [
    { name: "Mumbai Bullion Co.", mobile: "9820011223", city: "Mumbai", gstin: "27AAACM1234A1Z5", openingBalance: 0 },
    { name: "Rajkot Gold Refinery", mobile: "9898011224", city: "Rajkot", gstin: "24AAACR5678B1Z3", openingBalance: 120000 },
  ]
  for (const r of rows) await suppliersService.add(r)
  return rows.length
}

/** Seed a default gold scheme plan if none exist. */
export async function seedSchemesIfEmpty(): Promise<number> {
  if ((await schemesService.getSchemes()).length > 0) return 0
  const plans = [
    { name: "Dhanvarsha 11+1", monthlyAmount: 5000, durationMonths: 11, bonusMonths: 1 },
    { name: "Suvarna 11+1 (₹2000)", monthlyAmount: 2000, durationMonths: 11, bonusMonths: 1 },
  ]
  for (const p of plans) await schemesService.addScheme(p)
  return plans.length
}

export async function seedAllIfEmpty(): Promise<{ items: number; customers: number }> {
  const items = await seedItemsIfEmpty()
  const customers = await seedCustomersIfEmpty()
  await seedSuppliersIfEmpty()
  await seedSchemesIfEmpty()
  return { items, customers }
}
