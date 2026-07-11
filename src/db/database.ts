/**
 * Dexie (IndexedDB) database definition for Jewel-ERP.
 *
 * IMPORTANT ARCHITECTURE NOTE
 * ---------------------------
 * Nothing in the app should import this file directly except `dbService.ts`.
 * All feature code talks to the database through the service layer, so that the
 * underlying engine (IndexedDB today, SQLite under Electron/Tauri tomorrow) can
 * be swapped without touching a single screen or store.
 */

import Dexie, { type Table } from "dexie"
import type {
  BullionStock,
  BullionMovement,
  Counter,
  Customer,
  InventoryLedger,
  Item,
  Karigar,
  KarigarJob,
  Loan,
  Order,
  OrderPayment,
  PurchaseInvoice,
  PurchaseItem,
  PurchasePayment,
  Receipt,
  Refining,
  Refiner,
  SalesInvoice,
  SalesItem,
  Scheme,
  SchemeAccount,
  SchemePayment,
  LoanPayment,
  Supplier,
  UrdItem,
} from "./types"

export class JewelDatabase extends Dexie {
  items!: Table<Item, number>
  customers!: Table<Customer, number>
  sales_invoices!: Table<SalesInvoice, number>
  sales_items!: Table<SalesItem, number>
  urd_items!: Table<UrdItem, number>
  loans!: Table<Loan, number>
  karigars!: Table<Karigar, number>
  karigar_jobs!: Table<KarigarJob, number>
  counters!: Table<Counter, string>
  // Phase 6 tables
  suppliers!: Table<Supplier, number>
  purchase_invoices!: Table<PurchaseInvoice, number>
  purchase_items!: Table<PurchaseItem, number>
  schemes!: Table<Scheme, number>
  scheme_accounts!: Table<SchemeAccount, number>
  scheme_payments!: Table<SchemePayment, number>
  receipts!: Table<Receipt, number>
  orders!: Table<Order, number>
  refinings!: Table<Refining, number>
  loan_payments!: Table<LoanPayment, number>
  refiners!: Table<Refiner, number>
  bullion_stock!: Table<BullionStock, number>
  bullion_movement!: Table<BullionMovement, number>
  inventory_ledger!: Table<InventoryLedger, number>
  order_payments!: Table<OrderPayment, number>
  purchase_payments!: Table<PurchasePayment, number>

  constructor(name: string) {
    super(name)

    // Only INDEXED fields are listed here (Dexie indexes, not full columns).
    // `++id` = auto-incrementing primary key. `&tag` = unique index.
    this.version(1).stores({
      items: "++id, &tag, name, type, category, status, huid",
      customers: "++id, name, mobile, pan",
      sales_invoices: "++id, &invoiceNo, customerId, date",
      sales_items: "++id, invoiceId, itemId",
      urd_items: "++id, invoiceId",
      loans: "++id, &loanNo, customerId, date, isClosed",
      karigars: "++id, name, mobile",
      karigar_jobs: "++id, &jobNo, karigarId, status, issuedDate",
      counters: "&key",
    })

    // v2: purchases, suppliers and gold saving schemes (Phase 6). Existing
    // tables are carried forward untouched by Dexie's upgrade mechanism.
    this.version(2).stores({
      suppliers: "++id, name, mobile, gstin",
      purchase_invoices: "++id, &purchaseNo, supplierId, date",
      purchase_items: "++id, purchaseId",
      schemes: "++id, &code, name",
      scheme_accounts: "++id, &accountNo, schemeId, customerId, status",
      scheme_payments: "++id, accountId, date",
    })

    // v3: standalone customer receipts (Udhari collection).
    this.version(3).stores({
      receipts: "++id, &receiptNo, customerId, date",
    })

    // v4: custom-order booking.
    this.version(4).stores({
      orders: "++id, &orderNo, customerId, status, date",
    })

    // v5: metal refining (Ghalai).
    this.version(5).stores({
      refinings: "++id, &refiningNo, date",
    })

    // v6: loan payments (Girvi depth)
    this.version(6).stores({
      loan_payments: "++id, loanId, date, type",
    })

    // v7: refiner master (Refining module — Phase 2).
    this.version(7).stores({
      refiners: "++id, name, kind",
    })

    // v8: bullion + inventory ledger (Refining module — Phase 3).
    this.version(8).stores({
      bullion_stock: "++id, &bullionNo, type, purity, status, refiningId, itemId",
      bullion_movement: "++id, bullionId, date, type, refId",
      inventory_ledger: "++id, itemId, bullionId, date, refType, refId",
    })

    // v9: per-order advance payments (Order Booking — Phase 2).
    this.version(9).stores({
      order_payments: "++id, orderId, date",
    })

    // v10: vendor payments (Purchase — Phase 2).
    this.version(10).stores({
      purchase_payments: "++id, supplierId, purchaseId, date",
    })
  }
}

/**
 * Multi-firm support: each company gets its own business database so firms are
 * fully isolated (separate stock, invoices, ledgers, document numbering).
 * Company 1 keeps the original "jewel_erp" name so existing data is preserved.
 * The active company id is read from localStorage at startup; switching firms
 * sets it and reloads the app so this singleton re-initialises on the new DB.
 */
export const ACTIVE_COMPANY_KEY = "jewel.activeCompanyId"

export const activeCompanyId = (): number => {
  if (typeof localStorage === "undefined") return 1
  return Number(localStorage.getItem(ACTIVE_COMPANY_KEY) || "1") || 1
}

export const dbNameForCompany = (id: number): string =>
  id === 1 ? "jewel_erp" : `jewel_erp_co${id}`

/** Switch the active firm and reload so the singleton rebinds to its DB. */
export const switchCompany = (id: number): void => {
  localStorage.setItem(ACTIVE_COMPANY_KEY, String(id))
  window.location.reload()
}

/** Singleton database handle (internal to the data layer). */
export const db = new JewelDatabase(dbNameForCompany(activeCompanyId()))
