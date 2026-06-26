/**
 * System database — global, shared across all firms/companies.
 *
 * This is deliberately separate from the per-company business database (see
 * database.ts). Users and the list of companies live here so that switching the
 * active firm (which swaps the business DB) never loses your login or firm list.
 */

import Dexie, { type Table } from "dexie"

export type UserRole = "owner" | "manager" | "cashier"

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
  // Default constants & rates
  defaultGstRate?: number
  defaultHsnCode?: string
  loyaltyEarnPerGram?: number
  loyaltyRupeesPerPoint?: number
  // WhatsApp notification templates
  templateInvoice?: string
  templateDues?: string
  templateGirvi?: string
  templateScheme?: string
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
  }
}

export const systemDb = new SystemDatabase()
