/**
 * System database — global, shared across all firms/companies.
 *
 * This is deliberately separate from the per-company business database (see
 * database.ts). Users and the list of companies live here so that switching the
 * active firm (which swaps the business DB) never loses your login or firm list.
 */

import Dexie, { type Table } from "dexie"
import type { ReceiptLang } from "@/lib/receiptI18n"

export type UserRole = "owner" | "manager" | "staff"

export interface User {
  id?: number
  username: string
  name: string
  role: UserRole
  /** Hex SHA-256 of `${salt}:${password}`. Never store the raw password. */
  passwordHash: string
  salt: string
  active: boolean
  createdAt?: string
}

/** A firm / branch. Its fields also populate printed invoice & Pavati headers. */
export interface Company {
  id?: number
  name: string
  address?: string
  city?: string
  gstin?: string
  phone?: string
  createdAt?: string
  // Print settings
  printPaperSize?: "A4" | "A5" | "80mm"
  printShowLogo?: boolean
  printLogoUrl?: string
  printBankName?: string
  printBankAccountNo?: string
  printBankIfsc?: string
  printBankBranch?: string
  printTermsText?: string
  printShowHuid?: boolean
  printAccentColor?: string
  /** Language for printed receipt labels (invoice/Pavati). Defaults to English. */
  receiptLanguage?: ReceiptLang
  // Default constants & rates
  defaultGstRate?: number
  defaultHsnCode?: string
  loyaltyEarnPerGram?: number
  loyaltyRupeesPerPoint?: number
  /** Max points a customer may hold (0 / unset = no limit). */
  loyaltyMaxPoints?: number
  discountDirectLimit?: number
  discountReasonLimit?: number
  // WhatsApp notification templates
  templateInvoice?: string
  templateDues?: string
  templateGirvi?: string
  templateScheme?: string
  /** JSON-encoded printed-receipt layout (see features/receipt-designer/layout.ts). */
  receiptLayout?: string
  /** JSON-encoded receipt visual theme (accent/font/header/border; see theme.ts). */
  receiptTheme?: string
}

export class SystemDatabase extends Dexie {
  users!: Table<User, number>
  companies!: Table<Company, number>

  constructor() {
    super("jewel_erp_system")
    this.version(1).stores({
      users: "++id, &username, role",
      companies: "++id, name",
    })
    this.version(2).stores({ users: "++id, &username, role", companies: "++id, name" }).upgrade(async (tx) => {
      await tx.table("users").toCollection().modify((u) => { if (u.role === "cashier") u.role = "staff" })
    })
  }
}

export const systemDb = new SystemDatabase()
