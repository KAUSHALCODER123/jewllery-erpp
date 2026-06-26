/**
 * dbService — the single abstraction layer over the persistence engine.
 *
 * Every screen, store and hook in the app MUST go through this module. It is the
 * only place that imports the concrete Dexie database. When we move to
 * Electron/Tauri we replace the bodies of these functions with SQLite calls and
 * the rest of the application is unaffected, because the *signatures* below are
 * the contract.
 *
 * Design rules:
 *  - Functions are async and return plain domain objects (never Dexie tables).
 *  - Multi-row writes are wrapped in transactions for atomicity.
 *  - Derived values (netWt, balances, sequence numbers) are computed here so the
 *    UI never has to know the rules.
 */

import { computeLoanDues } from "@/features/girvi/interest"
import { db, activeCompanyId, JewelDatabase, dbNameForCompany } from "@/db/database"
import { systemDb, type Company, type User } from "@/db/systemDb"
import type {
  Counter,
  Customer,
  Item,
  Karigar,
  KarigarJob,
  Loan,
  LoanPayment,
  Order,
  OrderStatus,
  PaymentMode,
  PurchaseInvoice,
  PurchaseItem,
  Receipt,
  Refining,
  SalesInvoice,
  SalesItem,
  Scheme,
  SchemeAccount,
  SchemePayment,
  SchemeScheduleRow,
  Supplier,
  UrdItem,
} from "@/db/types"

/* ------------------------------------------------------------------ */
/* Time helpers                                                        */
/* ------------------------------------------------------------------ */

const nowIso = () => new Date().toISOString()
/** Local calendar day as "YYYY-MM-DD" (used for Day Book grouping). */
export const todayStr = (): string => {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

/** Timezone-neutral month adder. Handles short month rollovers (e.g., Jan 31 + 1 mo = Feb 28). */
export const addMonths = (dateStr: string, months: number): string => {
  const parts = dateStr.split("-")
  if (parts.length !== 3) return dateStr
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1 // 0-indexed
  const day = parseInt(parts[2], 10)
  
  const d = new Date(year, month + months, day)
  const expectedMonth = (month + months) % 12
  const actualMonth = d.getMonth()
  if (actualMonth !== expectedMonth && actualMonth !== (expectedMonth < 0 ? expectedMonth + 12 : expectedMonth)) {
    d.setDate(0)
  }
  
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const rDay = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${rDay}`
}

/* ------------------------------------------------------------------ */
/* Sequential document numbers (barcodes, invoice/loan/job numbers)   */
/* ------------------------------------------------------------------ */

/**
 * Atomically increment a named counter and return the next number.
 * Pass a `prefix`/`pad` to get a formatted code like "RIN0001".
 */
export async function nextSequence(
  key: string,
  opts: { prefix?: string; pad?: number } = {},
): Promise<{ value: number; code: string }> {
  const { prefix = "", pad = 4 } = opts
  return db.transaction("rw", db.counters, async () => {
    const current = (await db.counters.get(key))?.value ?? 0
    const value = current + 1
    await db.counters.put({ key, value } satisfies Counter)
    return { value, code: `${prefix}${String(value).padStart(pad, "0")}` }
  })
}

/* ------------------------------------------------------------------ */
/* Items / inventory                                                  */
/* ------------------------------------------------------------------ */

/** Compute net weight from gross/stone. Central rule, used everywhere. */
export const computeNetWt = (grossWt: number, stoneWt: number): number =>
  Math.max(0, Number((grossWt - stoneWt).toFixed(3)))

export const itemsService = {
  getAll: (): Promise<Item[]> => db.items.orderBy("id").reverse().toArray(),

  getInStock: (): Promise<Item[]> =>
    db.items.where("status").anyOf("in_stock").or("id").above(0).toArray()
      .then((rows) => rows.filter((r) => (r.status ?? "in_stock") === "in_stock")),

  get: (id: number): Promise<Item | undefined> => db.items.get(id),

  getByTag: (tag: string): Promise<Item | undefined> =>
    db.items.where("tag").equals(tag).first(),

  /**
   * Insert an item. netWt is recomputed; a sequential tag is minted from the
   * category code (e.g. "RIN") when no tag is supplied.
   */
  async add(
    input: Omit<Item, "id" | "netWt" | "tag" | "createdAt" | "updatedAt"> & {
      tag?: string
      tagPrefix?: string
    },
  ): Promise<Item> {
    const { tag, tagPrefix, ...rest } = input
    const finalTag =
      tag ?? (await nextSequence(`item:${tagPrefix ?? "ITM"}`, { prefix: tagPrefix ?? "ITM" })).code
    const record: Item = {
      ...rest,
      tag: finalTag,
      netWt: computeNetWt(rest.grossWt, rest.stoneWt),
      status: rest.status ?? "in_stock",
      quantity: rest.quantity ?? 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    const id = await db.items.add(record)
    return { ...record, id }
  },

  async update(id: number, patch: Partial<Item>): Promise<void> {
    const next: Partial<Item> = { ...patch, updatedAt: nowIso() }
    if (patch.grossWt != null || patch.stoneWt != null) {
      const existing = await db.items.get(id)
      if (existing) {
        next.netWt = computeNetWt(
          patch.grossWt ?? existing.grossWt,
          patch.stoneWt ?? existing.stoneWt,
        )
      }
    }
    await db.items.update(id, next)
  },

  remove: (id: number): Promise<void> => db.items.delete(id),

  /** Case-insensitive search over tag / name / huid. */
  async search(term: string): Promise<Item[]> {
    const q = term.trim().toLowerCase()
    if (!q) return itemsService.getAll()
    const all = await db.items.toArray()
    return all.filter(
      (i) =>
        i.tag.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.huid?.toLowerCase().includes(q) ?? false),
    )
  },

  count: (): Promise<number> => db.items.count(),
}

/* ------------------------------------------------------------------ */
/* Customers                                                          */
/* ------------------------------------------------------------------ */

export const customersService = {
  getAll: (): Promise<Customer[]> => db.customers.orderBy("name").toArray(),

  get: (id: number): Promise<Customer | undefined> => db.customers.get(id),

  async add(input: Omit<Customer, "id" | "createdAt" | "updatedAt">): Promise<Customer> {
    const record: Customer = {
      ...input,
      loyaltyPoints: input.loyaltyPoints ?? 0,
      openingBalance: input.openingBalance ?? 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    const id = await db.customers.add(record)
    return { ...record, id }
  },

  update: (id: number, patch: Partial<Customer>): Promise<void> =>
    db.customers.update(id, { ...patch, updatedAt: nowIso() }).then(() => undefined),

  remove: (id: number): Promise<void> => db.customers.delete(id),

  async search(term: string): Promise<Customer[]> {
    const q = term.trim().toLowerCase()
    if (!q) return customersService.getAll()
    const all = await db.customers.toArray()
    return all.filter(
      (c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q),
    )
  },

  /**
   * Outstanding balance = opening balance + unpaid invoice balances − standalone
   * receipts collected. Positive means the customer owes the shop (Udhari, shown
   * in red in the UI).
   */
  async getOutstanding(customerId: number): Promise<number> {
    const customer = await db.customers.get(customerId)
    if (!customer) return 0
    const invoices = await db.sales_invoices
      .where("customerId")
      .equals(customerId)
      .toArray()
    const invoiceBalance = invoices.reduce((sum, inv) => sum + inv.balance, 0)
    const receipts = await db.receipts
      .where("customerId")
      .equals(customerId)
      .toArray()
    const collected = receipts.reduce((sum, r) => sum + r.amount, 0)
    return Number(
      (customer.openingBalance + invoiceBalance - collected).toFixed(2),
    )
  },
}

/* ------------------------------------------------------------------ */
/* Receipts (Udhari / credit collection)                              */
/* ------------------------------------------------------------------ */

export const receiptsService = {
  getAll: (): Promise<Receipt[]> =>
    db.receipts.orderBy("id").reverse().toArray(),

  getByCustomer: (customerId: number): Promise<Receipt[]> =>
    db.receipts.where("customerId").equals(customerId).toArray(),

  getByDate: (date: string): Promise<Receipt[]> =>
    db.receipts.where("date").equals(date).toArray(),

  async add(input: Omit<Receipt, "id" | "receiptNo" | "createdAt">): Promise<Receipt> {
    return db.transaction("rw", [db.receipts, db.counters], async () => {
      const { code: receiptNo } = await nextSequence("receipt", { prefix: "RCP" })
      const record: Receipt = { ...input, receiptNo, createdAt: nowIso() }
      const id = await db.receipts.add(record)
      return { ...record, id }
    })
  },
}

/* ------------------------------------------------------------------ */
/* Sales (invoices + line items + URD, atomic)                        */
/* ------------------------------------------------------------------ */

export interface SaleDraft {
  invoice: Omit<SalesInvoice, "id" | "invoiceNo" | "createdAt">
  items: Omit<SalesItem, "id" | "invoiceId">[]
  urd: Omit<UrdItem, "id" | "invoiceId">[]
}

export const salesService = {
  getInvoices: (): Promise<SalesInvoice[]> =>
    db.sales_invoices.orderBy("id").reverse().toArray(),

  getInvoice: (id: number): Promise<SalesInvoice | undefined> =>
    db.sales_invoices.get(id),

  getInvoicesByDate: (date: string): Promise<SalesInvoice[]> =>
    db.sales_invoices.where("date").equals(date).toArray(),

  getLineItems: (invoiceId: number): Promise<SalesItem[]> =>
    db.sales_items.where("invoiceId").equals(invoiceId).toArray(),

  getUrdItems: (invoiceId: number): Promise<UrdItem[]> =>
    db.urd_items.where("invoiceId").equals(invoiceId).toArray(),

  /**
   * Persist a complete sale atomically: invoice header, new-item lines,
   * old-gold (URD) lines, mark sold stock, and mint the invoice number.
   */
  async createInvoice(draft: SaleDraft): Promise<SalesInvoice> {
    return db.transaction(
      "rw",
      [db.sales_invoices, db.sales_items, db.urd_items, db.items, db.counters, db.customers, db.orders],
      async () => {
        const { code: invoiceNo } = await nextSequence("invoice", { prefix: "INV" })
        const header: SalesInvoice = {
          ...draft.invoice,
          invoiceNo,
          createdAt: nowIso(),
        }
        const invoiceId = await db.sales_invoices.add(header)

        await db.sales_items.bulkAdd(
          draft.items.map((li) => ({ ...li, invoiceId })),
        )
        if (draft.urd.length) {
          await db.urd_items.bulkAdd(
            draft.urd.map((u) => ({ ...u, invoiceId })),
          )
        }
        // Mark any tagged stock as sold.
        for (const li of draft.items) {
          if (li.itemId) await db.items.update(li.itemId, { status: "sold" })
        }
        // Apply loyalty points (earned − redeemed) to the customer.
        const delta = (header.pointsEarned ?? 0) - (header.pointsRedeemed ?? 0)
        if (delta !== 0) {
          const customer = await db.customers.get(header.customerId)
          if (customer) {
            await db.customers.update(header.customerId, {
              loyaltyPoints: Math.max(0, customer.loyaltyPoints + delta),
            })
          }
        }
        // If this sale resolves a booked custom order, mark it as delivered.
        if (header.orderId) {
          await db.orders.update(header.orderId, {
            status: "delivered",
            invoiceId,
          })
        }
        return { ...header, id: invoiceId }
      },
    )
  },

  /** Fetch a complete invoice (header + lines + URD) for editing. */
  async getFull(id: number): Promise<{
    invoice: SalesInvoice
    items: SalesItem[]
    urd: UrdItem[]
  } | null> {
    const invoice = await db.sales_invoices.get(id)
    if (!invoice) return null
    const [items, urd] = await Promise.all([
      db.sales_items.where("invoiceId").equals(id).toArray(),
      db.urd_items.where("invoiceId").equals(id).toArray(),
    ])
    return { invoice, items, urd }
  },

  /**
   * Update an existing invoice: rewrite its lines/URD and header, keeping the
   * original invoice number & date-of-record. Restores previously-sold tagged
   * stock, then re-marks the new line items as sold.
   */
  async updateInvoice(id: number, draft: SaleDraft): Promise<SalesInvoice> {
    return db.transaction(
      "rw",
      [db.sales_invoices, db.sales_items, db.urd_items, db.items],
      async () => {
        const existing = await db.sales_invoices.get(id)
        if (!existing) throw new Error("Invoice not found")

        // Restore stock from the old lines, then clear old lines/URD.
        const oldItems = await db.sales_items.where("invoiceId").equals(id).toArray()
        for (const li of oldItems) {
          if (li.itemId) await db.items.update(li.itemId, { status: "in_stock" })
        }
        await db.sales_items.where("invoiceId").equals(id).delete()
        await db.urd_items.where("invoiceId").equals(id).delete()

        // Apply new header fields (keep invoiceNo, createdAt and original date).
        await db.sales_invoices.update(id, { ...draft.invoice, date: existing.date })

        await db.sales_items.bulkAdd(
          draft.items.map((li) => ({ ...li, invoiceId: id })),
        )
        if (draft.urd.length) {
          await db.urd_items.bulkAdd(draft.urd.map((u) => ({ ...u, invoiceId: id })))
        }
        for (const li of draft.items) {
          if (li.itemId) await db.items.update(li.itemId, { status: "sold" })
        }
        return (await db.sales_invoices.get(id))!
      },
    )
  },
}

/* ------------------------------------------------------------------ */
/* Loans (Girvi)                                                      */
/* ------------------------------------------------------------------ */

export const loansService = {
  getAll: (): Promise<Loan[]> => db.loans.orderBy("id").reverse().toArray(),

  get: (id: number): Promise<Loan | undefined> => db.loans.get(id),

  getOpen: (): Promise<Loan[]> =>
    db.loans.filter((l) => !l.isClosed).reverse().toArray(),

  async add(input: Omit<Loan, "id" | "loanNo" | "createdAt" | "isClosed" | "principalOutstanding">): Promise<Loan> {
    const { code: loanNo } = await nextSequence("loan", { prefix: "GRV" })
    const record: Loan = {
      ...input,
      loanNo,
      isClosed: false,
      principalOutstanding: input.loanAmount,
      createdAt: nowIso()
    }
    const id = await db.loans.add(record)
    return { ...record, id }
  },

  update: (id: number, patch: Partial<Loan>): Promise<void> =>
    db.loans.update(id, patch).then(() => undefined),

  getPayments: (loanId: number): Promise<LoanPayment[]> =>
    db.loan_payments.where("loanId").equals(loanId).toArray(),

  async addPayment(
    loanId: number,
    payment: {
      date: string
      amount: number
      type: "part" | "renewal" | "closure"
      notes?: string
    }
  ): Promise<LoanPayment> {
    return db.transaction("rw", [db.loans, db.loan_payments], async () => {
      const loan = await db.loans.get(loanId)
      if (!loan) throw new Error("Loan not found")

      const payments = await db.loan_payments.where("loanId").equals(loanId).toArray()

      // Calculate dues up to the payment date
      const dues = computeLoanDues(loan, payments, payment.date)

      // Interest outstanding before this payment
      const interestDue = dues.interestOutstanding

      // Allocate payment
      const towardsInterest = Math.min(payment.amount, interestDue)
      const towardsPrincipal = payment.amount - towardsInterest

      const newPrincipal = Math.max(0, dues.principalOutstanding - towardsPrincipal)
      const isClosure = payment.type === "closure" || newPrincipal <= 0

      const record: LoanPayment = {
        loanId,
        date: payment.date,
        amount: payment.amount,
        towardsInterest,
        towardsPrincipal,
        type: payment.type,
        notes: payment.notes,
      }

      const id = await db.loan_payments.add(record)

      // Update loan status and outstanding
      await db.loans.update(loanId, {
        principalOutstanding: newPrincipal,
        isClosed: isClosure,
        closedDate: isClosure ? payment.date : undefined,
        amountCollected: isClosure ? payment.amount : undefined,
      })

      return { ...record, id }
    })
  },

  close: (id: number, amountCollected: number): Promise<void> =>
    db.loans
      .update(id, { isClosed: true, closedDate: todayStr(), amountCollected })
      .then(() => undefined),
}

/* ------------------------------------------------------------------ */
/* Karigars (goldsmiths) + jobs                                       */
/* ------------------------------------------------------------------ */

export const karigarsService = {
  getAll: (): Promise<Karigar[]> => db.karigars.orderBy("name").toArray(),

  get: (id: number): Promise<Karigar | undefined> => db.karigars.get(id),

  async add(input: Omit<Karigar, "id" | "createdAt" | "metalBalanceWt"> & {
    metalBalanceWt?: number
  }): Promise<Karigar> {
    const record: Karigar = {
      ...input,
      metalBalanceWt: input.metalBalanceWt ?? 0,
      createdAt: nowIso(),
    }
    const id = await db.karigars.add(record)
    return { ...record, id }
  },

  getJobs: (): Promise<KarigarJob[]> =>
    db.karigar_jobs.orderBy("id").reverse().toArray(),

  getJobsByKarigar: (karigarId: number): Promise<KarigarJob[]> =>
    db.karigar_jobs.where("karigarId").equals(karigarId).toArray(),

  /** Issue raw metal to a karigar (debits their metal ledger). */
  async issueJob(
    input: Omit<
      KarigarJob,
      "id" | "jobNo" | "status" | "finishedWt" | "createdAt"
    >,
  ): Promise<KarigarJob> {
    return db.transaction("rw", [db.karigar_jobs, db.karigars, db.counters], async () => {
      const { code: jobNo } = await nextSequence("karigar_job", { prefix: "JOB" })
      const record: KarigarJob = {
        ...input,
        jobNo,
        finishedWt: 0,
        status: "issued",
        createdAt: nowIso(),
      }
      const id = await db.karigar_jobs.add(record)
      const karigar = await db.karigars.get(input.karigarId)
      if (karigar) {
        await db.karigars.update(input.karigarId, {
          metalBalanceWt: Number(
            (karigar.metalBalanceWt + input.metalIssuedWt).toFixed(3),
          ),
        })
      }
      return { ...record, id }
    })
  },

  /**
   * Receive a finished item. Credits the karigar ledger by the finished weight
   * plus the allowed wastage, reconciling the issued metal.
   */
  async receiveJob(
    jobId: number,
    finishedWt: number,
    wastageAllowed: number,
  ): Promise<void> {
    return db.transaction("rw", [db.karigar_jobs, db.karigars], async () => {
      const job = await db.karigar_jobs.get(jobId)
      if (!job) return
      const wastageWt = (job.metalIssuedWt * wastageAllowed) / 100
      const credited = finishedWt + wastageWt
      await db.karigar_jobs.update(jobId, {
        finishedWt,
        wastageAllowed,
        status: "received",
        receivedDate: todayStr(),
      })
      const karigar = await db.karigars.get(job.karigarId)
      if (karigar) {
        await db.karigars.update(job.karigarId, {
          metalBalanceWt: Number(
            (karigar.metalBalanceWt - credited).toFixed(3),
          ),
        })
      }
    })
  },
}

/* ------------------------------------------------------------------ */
/* Day Book aggregation                                               */
/* ------------------------------------------------------------------ */

export interface DayBookSummary {
  date: string
  invoiceCount: number
  totalSales: number
  totalUrdPurchase: number
  totalTax: number
  cashCollected: number
  upiCollected: number
  outstandingCreated: number
}

export const reportsService = {
  async getDayBook(date: string = todayStr()): Promise<DayBookSummary> {
    const invoices = await db.sales_invoices.where("date").equals(date).toArray()
    return {
      date,
      invoiceCount: invoices.length,
      totalSales: round(invoices.reduce((s, i) => s + i.totalGrossAmount, 0)),
      totalUrdPurchase: round(invoices.reduce((s, i) => s + i.totalUrdAmount, 0)),
      totalTax: round(invoices.reduce((s, i) => s + i.cgst + i.sgst + (i.igst ?? 0), 0)),
      cashCollected: round(invoices.reduce((s, i) => s + i.cashPaid, 0)),
      upiCollected: round(invoices.reduce((s, i) => s + i.upiPaid, 0)),
      outstandingCreated: round(invoices.reduce((s, i) => s + i.balance, 0)),
    }
  },
}

const round = (n: number): number => Number(n.toFixed(2))

/* ------------------------------------------------------------------ */
/* Suppliers                                                          */
/* ------------------------------------------------------------------ */

export const suppliersService = {
  getAll: (): Promise<Supplier[]> => db.suppliers.orderBy("name").toArray(),
  get: (id: number): Promise<Supplier | undefined> => db.suppliers.get(id),

  async add(input: Omit<Supplier, "id" | "createdAt" | "updatedAt">): Promise<Supplier> {
    const record: Supplier = {
      ...input,
      openingBalance: input.openingBalance ?? 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    const id = await db.suppliers.add(record)
    return { ...record, id }
  },

  update: (id: number, patch: Partial<Supplier>): Promise<void> =>
    db.suppliers.update(id, { ...patch, updatedAt: nowIso() }).then(() => undefined),

  remove: (id: number): Promise<void> => db.suppliers.delete(id),

  /** Amount still owed to a supplier = opening + unpaid purchase balances. */
  async getOutstanding(supplierId: number): Promise<number> {
    const supplier = await db.suppliers.get(supplierId)
    if (!supplier) return 0
    const purchases = await db.purchase_invoices
      .where("supplierId")
      .equals(supplierId)
      .toArray()
    return round(
      supplier.openingBalance + purchases.reduce((s, p) => s + p.balance, 0),
    )
  },
}

/* ------------------------------------------------------------------ */
/* Purchases (invoice + line items, atomic)                           */
/* ------------------------------------------------------------------ */

export interface PurchaseDraft {
  invoice: Omit<PurchaseInvoice, "id" | "purchaseNo" | "createdAt">
  items: Omit<PurchaseItem, "id" | "purchaseId">[]
}

export const purchaseService = {
  getInvoices: (): Promise<PurchaseInvoice[]> =>
    db.purchase_invoices.orderBy("id").reverse().toArray(),

  getInvoicesByDate: (date: string): Promise<PurchaseInvoice[]> =>
    db.purchase_invoices.where("date").equals(date).toArray(),

  getLineItems: (purchaseId: number): Promise<PurchaseItem[]> =>
    db.purchase_items.where("purchaseId").equals(purchaseId).toArray(),

  async create(draft: PurchaseDraft): Promise<PurchaseInvoice> {
    return db.transaction(
      "rw",
      [db.purchase_invoices, db.purchase_items, db.counters],
      async () => {
        const { code: purchaseNo } = await nextSequence("purchase", { prefix: "PUR" })
        const header: PurchaseInvoice = {
          ...draft.invoice,
          purchaseNo,
          createdAt: nowIso(),
        }
        const purchaseId = await db.purchase_invoices.add(header)
        await db.purchase_items.bulkAdd(
          draft.items.map((li) => ({ ...li, purchaseId })),
        )
        return { ...header, id: purchaseId }
      },
    )
  },
}

/* ------------------------------------------------------------------ */
/* Metal Refining (Ghalai)                                            */
/* ------------------------------------------------------------------ */

export const refiningService = {
  getAll: (): Promise<Refining[]> => db.refinings.orderBy("id").reverse().toArray(),

  /**
   * Record a refining job: mint a number, mark the source scrap item melted,
   * and (optionally) create the refined-bullion output as a new stock item.
   */
  async create(
    input: Omit<Refining, "id" | "refiningNo" | "createdAt" | "outputItemId">,
    opts: { addToStock?: boolean; outputCategory?: string; outputName?: string } = {},
  ): Promise<Refining> {
    const { code: refiningNo } = await nextSequence("refining", { prefix: "REF" })
    let outputItemId: number | undefined

    if (input.sourceItemId) {
      await db.items.update(input.sourceItemId, { status: "melted" })
    }
    if (opts.addToStock !== false && input.outputWt > 0) {
      const created = await itemsService.add({
        name: opts.outputName ?? `Refined ${input.type} ${input.outputPurity}`,
        type: input.type,
        category: opts.outputCategory ?? "Other",
        purity: input.outputPurity,
        grossWt: input.outputWt,
        stoneWt: 0,
        makingChargePerGm: 0,
        quantity: 1,
        tagPrefix: "BUL",
      })
      outputItemId = created.id
    }

    const record: Refining = { ...input, refiningNo, outputItemId, createdAt: nowIso() }
    const id = await db.refinings.add(record)
    return { ...record, id }
  },
}

/* ------------------------------------------------------------------ */
/* Customer Orders (custom-jewellery booking)                         */
/* ------------------------------------------------------------------ */

export const ordersService = {
  getAll: (): Promise<Order[]> => db.orders.orderBy("id").reverse().toArray(),

  get: (id: number): Promise<Order | undefined> => db.orders.get(id),

  /** Orders still open (not delivered/cancelled) — for linking Karigar jobs. */
  getOpen: (): Promise<Order[]> =>
    db.orders
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .reverse()
      .toArray(),

  async add(input: Omit<Order, "id" | "orderNo" | "status" | "createdAt">): Promise<Order> {
    const { code: orderNo } = await nextSequence("order", { prefix: "ORD" })
    const record: Order = { ...input, orderNo, status: "booked", createdAt: nowIso() }
    const id = await db.orders.add(record)
    return { ...record, id }
  },

  setStatus: (id: number, status: OrderStatus): Promise<void> =>
    db.orders.update(id, { status }).then(() => undefined),

  update: (id: number, patch: Partial<Order>): Promise<void> =>
    db.orders.update(id, patch).then(() => undefined),
}

/* ------------------------------------------------------------------ */
/* Gold Saving Schemes                                                */
/* ------------------------------------------------------------------ */

export const schemesService = {
  getSchemes: (): Promise<Scheme[]> => db.schemes.orderBy("name").toArray(),
  getScheme: (id: number): Promise<Scheme | undefined> => db.schemes.get(id),

  async addScheme(input: Omit<Scheme, "id" | "code" | "createdAt"> & { code?: string }): Promise<Scheme> {
    const code = input.code ?? (await nextSequence("scheme", { prefix: "SCH", pad: 3 })).code
    const record: Scheme = { ...input, code, createdAt: nowIso() }
    const id = await db.schemes.add(record)
    return { ...record, id }
  },

  getAccounts: (): Promise<SchemeAccount[]> =>
    db.scheme_accounts.orderBy("id").reverse().toArray(),

  getAccount: (id: number): Promise<SchemeAccount | undefined> =>
    db.scheme_accounts.get(id),

  /** Enrol a customer into a scheme. */
  async enroll(schemeId: number, customerId: number, startDate: string): Promise<SchemeAccount> {
    const { code: accountNo } = await nextSequence("scheme_acct", { prefix: "GSA" })
    const record: SchemeAccount = {
      accountNo,
      schemeId,
      customerId,
      startDate,
      status: "active",
      createdAt: nowIso(),
    }
    const id = await db.scheme_accounts.add(record)
    return { ...record, id }
  },

  getPayments: (accountId: number): Promise<SchemePayment[]> =>
    db.scheme_payments.where("accountId").equals(accountId).sortBy("installmentNo"),

  async getSchedule(accountId: number): Promise<SchemeScheduleRow[]> {
    const account = await db.scheme_accounts.get(accountId)
    if (!account) return []
    const scheme = await db.schemes.get(account.schemeId)
    if (!scheme) return []

    const payments = await db.scheme_payments
      .where("accountId")
      .equals(accountId)
      .toArray()

    const schedule: SchemeScheduleRow[] = []

    for (let n = 1; n <= scheme.durationMonths; n++) {
      const dueDate = addMonths(account.startDate, n - 1)
      const pay = payments.find((p) => p.installmentNo === n)

      schedule.push({
        installmentNo: n,
        dueDate,
        amount: scheme.monthlyAmount,
        paid: !!pay,
        paidOn: pay?.date,
        mode: pay?.mode,
        paymentId: pay?.id,
      })
    }

    return schedule
  },

  async addPayment(
    accountId: number,
    amount: number,
    date: string,
    mode: PaymentMode = "cash",
    installmentNo?: number,
    dueDate?: string,
  ): Promise<SchemePayment> {
    return db.transaction("rw", db.scheme_payments, async () => {
      const actualInstallmentNo = installmentNo ?? (await db.scheme_payments
        .where("accountId")
        .equals(accountId)
        .count() + 1)
      const record: SchemePayment = {
        accountId,
        installmentNo: actualInstallmentNo,
        amount,
        date,
        mode,
        dueDate,
      }
      const id = await db.scheme_payments.add(record)
      return { ...record, id }
    })
  },

  setStatus: (accountId: number, status: SchemeAccount["status"]): Promise<void> =>
    db.scheme_accounts.update(accountId, { status }).then(() => undefined),
}

/* ------------------------------------------------------------------ */
/* Ledgers & GST reports (derived, simplified accounting)             */
/* ------------------------------------------------------------------ */

export interface LedgerEntry {
  date: string
  ref: string
  particulars: string
  debit: number
  credit: number
  balance: number
}

export interface CashBookRow {
  date: string
  ref: string
  particulars: string
  inflow: number
  outflow: number
}

export interface Gstr1Row {
  invoiceNo: string
  date: string
  party: string
  gstin: string
  taxable: number
  cgst: number
  sgst: number
  igst: number
  total: number
  type: "B2B" | "B2C"
}

export const ledgerService = {
  /**
   * Party (customer) ledger: opening balance, each invoice as a debit (sale)
   * with the payment received as a credit, running to a closing balance.
   */
  async customerLedger(customerId: number): Promise<{
    opening: number
    rows: LedgerEntry[]
    closing: number
  }> {
    const customer = await db.customers.get(customerId)
    const opening = customer?.openingBalance ?? 0
    const invoices = await db.sales_invoices
      .where("customerId")
      .equals(customerId)
      .toArray()
    const receipts = await db.receipts
      .where("customerId")
      .equals(customerId)
      .toArray()

    // Build a chronological event list, then run the balance forward.
    type Ev = Omit<LedgerEntry, "balance">
    const events: Ev[] = []
    for (const inv of invoices) {
      events.push({
        date: inv.date,
        ref: inv.invoiceNo,
        particulars: "Sales Invoice",
        debit: inv.netAmount,
        credit: 0,
      })
      const paid = round(inv.cashPaid + inv.upiPaid)
      if (paid > 0) {
        events.push({
          date: inv.date,
          ref: inv.invoiceNo,
          particulars: "Paid with bill",
          debit: 0,
          credit: paid,
        })
      }
    }
    for (const r of receipts) {
      events.push({
        date: r.date,
        ref: r.receiptNo,
        particulars: `Receipt (${r.mode})`,
        debit: 0,
        credit: r.amount,
      })
    }
    events.sort((a, b) => a.date.localeCompare(b.date))

    let balance = opening
    const rows: LedgerEntry[] = []
    if (opening !== 0) {
      rows.push({
        date: customer?.createdAt?.slice(0, 10) ?? "",
        ref: "—",
        particulars: "Opening Balance",
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0,
        balance,
      })
    }
    for (const ev of events) {
      balance = round(balance + ev.debit - ev.credit)
      rows.push({ ...ev, balance })
    }
    return { opening, rows, closing: balance }
  },

  /** Cash & bank book for a day: money in/out across sales, loans, purchases. */
  async cashBook(date: string): Promise<{
    rows: CashBookRow[]
    totalIn: number
    totalOut: number
    net: number
  }> {
    const rows: CashBookRow[] = []
    const invoices = await db.sales_invoices.where("date").equals(date).toArray()
    for (const inv of invoices) {
      const inflow = round(inv.cashPaid + inv.upiPaid)
      if (inflow > 0) {
        rows.push({
          date,
          ref: inv.invoiceNo,
          particulars: "Sale receipt",
          inflow,
          outflow: 0,
        })
      }
    }
    const receipts = await db.receipts.where("date").equals(date).toArray()
    for (const r of receipts) {
      rows.push({
        date,
        ref: r.receiptNo,
        particulars: "Udhari collection",
        inflow: r.amount,
        outflow: 0,
      })
    }
    const orders = await db.orders.where("date").equals(date).toArray()
    for (const o of orders) {
      if (o.advanceReceived > 0) {
        rows.push({
          date,
          ref: o.orderNo,
          particulars: "Order advance",
          inflow: o.advanceReceived,
          outflow: 0,
        })
      }
    }
    const loans = await db.loans.toArray()
    for (const l of loans) {
      if (l.date === date) {
        rows.push({
          date,
          ref: l.loanNo,
          particulars: "Loan disbursed (Girvi)",
          inflow: 0,
          outflow: l.loanAmount,
        })
      }
      if (l.isClosed && l.closedDate === date && l.amountCollected) {
        rows.push({
          date,
          ref: l.loanNo,
          particulars: "Loan redeemed",
          inflow: l.amountCollected,
          outflow: 0,
        })
      }
    }
    const purchases = await db.purchase_invoices.where("date").equals(date).toArray()
    for (const p of purchases) {
      if (p.amountPaid > 0) {
        rows.push({
          date,
          ref: p.purchaseNo,
          particulars: "Purchase payment",
          inflow: 0,
          outflow: p.amountPaid,
        })
      }
    }
    const totalIn = round(rows.reduce((s, r) => s + r.inflow, 0))
    const totalOut = round(rows.reduce((s, r) => s + r.outflow, 0))
    return { rows, totalIn, totalOut, net: round(totalIn - totalOut) }
  },

  /** GSTR-1 rows for a month ("YYYY-MM"), classified B2B (has GSTIN) vs B2C. */
  async gstr1(month: string): Promise<Gstr1Row[]> {
    const invoices = (await db.sales_invoices.toArray()).filter((i) =>
      i.date.startsWith(month),
    )
    const customers = await db.customers.toArray()
    const cmap = new Map(customers.map((c) => [c.id!, c]))
    return invoices
      .map((inv) => {
        const c = cmap.get(inv.customerId)
        const gstin = c?.gstin ?? ""
        return {
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          party: c?.name ?? "—",
          gstin,
          taxable: inv.taxableAmount,
          cgst: inv.cgst,
          sgst: inv.sgst,
          igst: inv.igst ?? 0,
          total: inv.netAmount,
          type: gstin ? ("B2B" as const) : ("B2C" as const),
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  async gstHsnSummary(month: string): Promise<{
    hsn: string
    description: string
    taxableValue: number
    cgst: number
    sgst: number
    igst: number
    qty: number
    netWt: number
  }[]> {
    const company = await systemDb.companies.get(activeCompanyId())
    const defaultHsn = company?.defaultHsnCode || "7113"

    const invoices = (await db.sales_invoices.toArray()).filter((i) =>
      i.date.startsWith(month),
    )
    const invoiceIds = invoices.map((i) => i.id!)
    const salesItems = await db.sales_items.where("invoiceId").anyOf(invoiceIds).toArray()

    const summaryMap = new Map<string, {
      hsn: string
      description: string
      taxableValue: number
      cgst: number
      sgst: number
      igst: number
      qty: number
      netWt: number
    }>()

    for (const inv of invoices) {
      const items = salesItems.filter((item) => item.invoiceId === inv.id)
      const totalGross = inv.totalGrossAmount || 1

      for (const item of items) {
        const hsn = item.hsn || defaultHsn
        const prop = item.finalAmount / totalGross

        const lineTaxable = round(prop * inv.taxableAmount)
        const lineCgst = round(prop * inv.cgst)
        const lineSgst = round(prop * inv.sgst)
        const lineIgst = round(prop * (inv.igst || 0))
        const lineNetWt = item.netWt || 0
        const lineQty = 1

        const existing = summaryMap.get(hsn)
        if (existing) {
          existing.taxableValue = round(existing.taxableValue + lineTaxable)
          existing.cgst = round(existing.cgst + lineCgst)
          existing.sgst = round(existing.sgst + lineSgst)
          existing.igst = round(existing.igst + lineIgst)
          existing.qty += lineQty
          existing.netWt = Number((existing.netWt + lineNetWt).toFixed(3))
        } else {
          summaryMap.set(hsn, {
            hsn,
            description: item.description || "Gold/Silver Jewellery",
            taxableValue: lineTaxable,
            cgst: lineCgst,
            sgst: lineSgst,
            igst: lineIgst,
            qty: lineQty,
            netWt: lineNetWt,
          })
        }
      }
    }

    return Array.from(summaryMap.values())
  },

  async sundryDebtors(): Promise<{
    id: number
    name: string
    mobile: string
    outstanding: number
    lastTxnDate: string
  }[]> {
    const customers = await db.customers.toArray()
    const debtors = []

    for (const cust of customers) {
      const outstanding = await customersService.getOutstanding(cust.id!)
      if (outstanding > 0) {
        const invoices = await db.sales_invoices.where("customerId").equals(cust.id!).toArray()
        const receipts = await db.receipts.where("customerId").equals(cust.id!).toArray()

        let lastTxnDate = "—"
        const dates = [
          ...invoices.map((i) => i.date),
          ...receipts.map((r) => r.date),
        ].filter(Boolean)

        if (dates.length > 0) {
          dates.sort()
          lastTxnDate = dates[dates.length - 1]
        }

        debtors.push({
          id: cust.id!,
          name: cust.name,
          mobile: cust.mobile,
          outstanding,
          lastTxnDate,
        })
      }
    }

    return debtors.sort((a, b) => b.outstanding - a.outstanding)
  },
}

/* ------------------------------------------------------------------ */
/* Maintenance                                                        */
/* ------------------------------------------------------------------ */

export interface BackupFile {
  app: "jewel-erp"
  version: number
  scope?: "system" | "company"
  exportedAt: string
  company?: string
  companyProfile?: Company
  financialYear?: string
  tables?: Record<string, unknown[]>
  system?: {
    companies: Company[]
    users: User[]
  }
  companiesData?: {
    companyId: number
    tables: Record<string, unknown[]>
  }[]
}

export const maintenanceService = {
  /** Wipe every table (used by "reset demo data"). */
  async clearAll(): Promise<void> {
    await db.transaction("rw", db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()))
    })
  },

  /** Dump the active company's business database. */
  async exportCompany(companyId: number, financialYear?: string): Promise<BackupFile> {
    const company = await systemDb.companies.get(companyId)
    const tables: Record<string, unknown[]> = {}
    for (const t of db.tables) {
      tables[t.name] = await t.toArray()
    }
    return {
      app: "jewel-erp",
      version: db.verno,
      scope: "company",
      exportedAt: new Date().toISOString(),
      company: company?.name,
      companyProfile: company,
      financialYear,
      tables,
    }
  },

  /** Export the entire system: all companies, users, and business databases. */
  async exportSystem(meta: { financialYear?: string } = {}): Promise<BackupFile> {
    const companies = await systemDb.companies.toArray()
    const users = await systemDb.users.toArray()
    const companiesData: { companyId: number; tables: Record<string, unknown[]> }[] = []

    for (const co of companies) {
      const tempDb = new JewelDatabase(dbNameForCompany(co.id!))
      await tempDb.open()
      const tables: Record<string, unknown[]> = {}
      for (const t of tempDb.tables) {
        tables[t.name] = await t.toArray()
      }
      tempDb.close()
      companiesData.push({
        companyId: co.id!,
        tables,
      })
    }

    return {
      app: "jewel-erp",
      version: db.verno,
      scope: "system",
      exportedAt: new Date().toISOString(),
      financialYear: meta.financialYear,
      system: {
        companies,
        users,
      },
      companiesData,
    }
  },

  /** Restore a single company database and profile. */
  async importCompany(backup: BackupFile, targetCompanyId: number): Promise<{ tables: number; rows: number }> {
    if (backup?.app !== "jewel-erp" || !backup.tables) {
      throw new Error("Not a valid Jewel-ERP backup file")
    }
    let rows = 0
    let tableCount = 0
    await db.transaction("rw", db.tables, async () => {
      for (const t of db.tables) {
        const data = backup.tables?.[t.name]
        if (!Array.isArray(data)) continue
        await t.clear()
        if (data.length) await t.bulkPut(data as never[])
        rows += data.length
        tableCount++
      }
    })

    if (backup.companyProfile) {
      const { id, createdAt, ...profilePatch } = backup.companyProfile
      await systemDb.companies.update(targetCompanyId, profilePatch)
    }

    return { tables: tableCount, rows }
  },

  /** Restore the entire system database and all company databases. */
  async importSystem(backup: BackupFile): Promise<{ companies: number; users: number; records: number }> {
    if (
      backup?.app !== "jewel-erp" ||
      backup.scope !== "system" ||
      !backup.system ||
      !backup.companiesData
    ) {
      throw new Error("Not a valid Jewel-ERP system backup file")
    }

    const { companies, users } = backup.system

    await systemDb.transaction("rw", [systemDb.companies, systemDb.users], async () => {
      await systemDb.companies.clear()
      await systemDb.users.clear()
      if (companies.length) await systemDb.companies.bulkPut(companies)
      if (users.length) await systemDb.users.bulkPut(users)
    })

    let totalRecords = 0
    for (const entry of backup.companiesData) {
      const tempDb = new JewelDatabase(dbNameForCompany(entry.companyId))
      await tempDb.open()
      await tempDb.transaction("rw", tempDb.tables, async () => {
        for (const t of tempDb.tables) {
          const data = entry.tables[t.name]
          if (!Array.isArray(data)) continue
          await t.clear()
          if (data.length) await t.bulkPut(data as never[])
          totalRecords += data.length
        }
      })
      tempDb.close()
    }

    return {
      companies: companies.length,
      users: users.length,
      records: totalRecords,
    }
  },

  /** Dump the active firm's entire business database into a plain object (legacy). */
  async exportData(meta: { company?: string; financialYear?: string } = {}): Promise<BackupFile> {
    return this.exportCompany(activeCompanyId(), meta.financialYear)
  },

  /** Restore a backup into the active firm (legacy). */
  async importData(backup: BackupFile): Promise<{ tables: number; rows: number }> {
    return this.importCompany(backup, activeCompanyId())
  },
}

/** Convenience namespace re-export so callers can `import { dbService }`. */
export const dbService = {
  items: itemsService,
  customers: customersService,
  sales: salesService,
  loans: loansService,
  karigars: karigarsService,
  orders: ordersService,
  refining: refiningService,
  suppliers: suppliersService,
  purchases: purchaseService,
  schemes: schemesService,
  receipts: receiptsService,
  ledger: ledgerService,
  reports: reportsService,
  maintenance: maintenanceService,
  nextSequence,
  todayStr,
  addMonths,
  computeNetWt,
}

export default dbService
