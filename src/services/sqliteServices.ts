/**
 * SQLite implementations of the master-data + sequence services, mirroring the
 * Dexie versions in dbService.ts. Built on makeTableRepo / withTransaction and an
 * injectable executor so every method is unit-testable in Node with a fake — the
 * SQL each service issues is verified without a live Tauri runtime.
 *
 * NOT yet wired into dbService: a live cutover must flip ALL services together
 * (mixing SQLite + Dexie tables in one runtime would split-brain the data). See
 * docs/SQLITE-CUTOVER.md. This is the tested implementation the flip will use.
 */

import type {
  Customer,
  Item,
  Karigar,
  KarigarJob,
  Loan,
  LoanPayment,
  PaymentMode,
  PurchaseInvoice,
  Refining,
  SalesInvoice,
  SalesItem,
  SchemePayment,
  UrdItem,
} from "@/db/types"
import type {
  CashBookRow,
  DayBookSummary,
  Gstr1Row,
  LedgerEntry,
  PurchaseDraft,
  SaleDraft,
} from "@/services/dbService"
import type {
  BullionStock,
  InventoryLedger,
  Order,
  OrderPayment,
  Receipt,
  Refiner,
  Scheme,
  SchemeAccount,
  SchemeScheduleRow,
  Supplier,
} from "@/db/types"
import { computeLoanDues } from "@/features/girvi/interest"
import { makeTableRepo, withTransaction, tauriExecutor, type SqlExecutor } from "@/db/sqliteRepo"
import { decodeRow } from "@/db/sqlBuilder"
import { typesFor } from "@/db/sqliteSchema"

const nowIso = () => new Date().toISOString()
const round = (n: number): number => Number(n.toFixed(2))
const round3 = (n: number): number => Number(n.toFixed(3))
const computeNetWt = (grossWt: number, stoneWt: number): number =>
  Math.max(0, Number((grossWt - stoneWt).toFixed(3)))
const todayStr = (): string => {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}
const activeCompanyId = (): number => {
  if (typeof localStorage === "undefined") return 1
  return Number(localStorage.getItem("jewel.activeCompanyId") || "1") || 1
}

/** Timezone-neutral month adder (mirrors dbService.addMonths). */
const addMonths = (dateStr: string, months: number): string => {
  const parts = dateStr.split("-")
  if (parts.length !== 3) return dateStr
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
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

/**
 * Increment a named counter and return the next value + formatted code. NOTE:
 * this does NOT open its own transaction — callers that need atomicity (item tag
 * minting, invoice numbering) wrap it in `withTransaction`, exactly like the
 * Dexie version runs inside `db.transaction`.
 */
export async function nextSequenceRaw(
  exec: SqlExecutor,
  key: string,
  opts: { prefix?: string; pad?: number } = {},
): Promise<{ value: number; code: string }> {
  const { prefix = "", pad = 4 } = opts
  const rows = await exec.query<{ value: number }>(
    'SELECT value FROM counters WHERE key = $1',
    [key],
  )
  const current = rows[0]?.value ?? 0
  const value = current + 1
  await exec.run(
    'INSERT INTO counters (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, value],
  )
  return { value, code: `${prefix}${String(value).padStart(pad, "0")}` }
}

/** Fineness % parsed from an output purity label like "24K (999)" → 99.9. */
const finePctFromPurity = (purity: string): number | undefined => {
  const paren = purity.match(/\((\d{3})\)/)
  if (paren) return Number((Number(paren[1]) / 10).toFixed(2))
  const k = purity.match(/(\d{1,2})\s*K/i)
  if (k) return Number(((Number(k[1]) / 24) * 100).toFixed(2))
  return undefined
}

/**
 * Build the SQLite services bound to an executor. `systemExec` targets the
 * shared system DB (companies/users) — companies live there, not in the
 * per-firm business DB — and defaults to `exec` so unit tests can mock both on
 * one fake.
 */
export function makeSqliteServices(exec: SqlExecutor = tauriExecutor, systemExec: SqlExecutor = exec) {
  const itemsRepo = makeTableRepo("items", typesFor("items"), exec)
  const customersRepo = makeTableRepo("customers", typesFor("customers"), exec)
  const salesRepo = makeTableRepo("sales_invoices", typesFor("sales_invoices"), exec)
  const salesItemsRepo = makeTableRepo("sales_items", typesFor("sales_items"), exec)
  const urdRepo = makeTableRepo("urd_items", typesFor("urd_items"), exec)
  const ordersRepo = makeTableRepo("orders", typesFor("orders"), exec)
  const orderPaymentsRepo = makeTableRepo("order_payments", typesFor("order_payments"), exec)
  const loansRepo = makeTableRepo("loans", typesFor("loans"), exec)
  const loanPaymentsRepo = makeTableRepo("loan_payments", typesFor("loan_payments"), exec)
  const karigarsRepo = makeTableRepo("karigars", typesFor("karigars"), exec)
  const karigarJobsRepo = makeTableRepo("karigar_jobs", typesFor("karigar_jobs"), exec)
  const refiningsRepo = makeTableRepo("refinings", typesFor("refinings"), exec)
  const refinersRepo = makeTableRepo("refiners", typesFor("refiners"), exec)
  const bullionStockRepo = makeTableRepo("bullion_stock", typesFor("bullion_stock"), exec)
  const bullionMovementRepo = makeTableRepo("bullion_movement", typesFor("bullion_movement"), exec)
  const inventoryLedgerRepo = makeTableRepo("inventory_ledger", typesFor("inventory_ledger"), exec)
  const purchaseRepo = makeTableRepo("purchase_invoices", typesFor("purchase_invoices"), exec)
  const purchaseItemsRepo = makeTableRepo("purchase_items", typesFor("purchase_items"), exec)
  const schemePaymentsRepo = makeTableRepo("scheme_payments", typesFor("scheme_payments"), exec)
  const schemeAccountsRepo = makeTableRepo("scheme_accounts", typesFor("scheme_accounts"), exec)
  const schemesRepo = makeTableRepo("schemes", typesFor("schemes"), exec)
  const suppliersRepo = makeTableRepo("suppliers", typesFor("suppliers"), exec)
  const receiptsRepo = makeTableRepo("receipts", typesFor("receipts"), exec)

  /** DELETE every row of `table` matching one equality column (used by cascade rewrites). */
  const deleteWhere = (table: string, col: string, val: unknown) =>
    exec.run(`DELETE FROM "${table}" WHERE "${col}" = $1`, [val])

  /** SELECT rows (optionally filtered) and decode them per the table's column types. */
  const queryRows = async <T = Record<string, unknown>>(
    table: string,
    whereSql = "",
    params: unknown[] = [],
  ): Promise<T[]> => {
    const rows = await exec.query<Record<string, unknown>>(
      `SELECT * FROM "${table}"${whereSql}`,
      params,
    )
    return rows.map((r) => decodeRow<T>(r, typesFor(table)))
  }

  /**
   * Insert an item WITHOUT its own transaction — the shared core of
   * itemsService.add (which wraps it) and refining.create (which is already
   * inside a transaction). SQLite has no nested BEGIN, so callers own the tx.
   */
  const addItemRaw = async (
    input: Omit<Item, "id" | "netWt" | "tag" | "createdAt" | "updatedAt"> & {
      tag?: string
      tagPrefix?: string
    },
  ): Promise<Item> => {
    const { tag, tagPrefix, ...rest } = input
    const finalTag =
      tag ??
      (await nextSequenceRaw(exec, `item:${tagPrefix ?? "ITM"}`, { prefix: tagPrefix ?? "ITM" })).code
    const record: Omit<Item, "id"> = {
      ...rest,
      tag: finalTag,
      netWt: computeNetWt(rest.grossWt, rest.stoneWt),
      status: rest.status ?? "in_stock",
      quantity: rest.quantity ?? 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    return (await itemsRepo.add(record)) as unknown as Item
  }

  const nextSequence = (key: string, opts?: { prefix?: string; pad?: number }) =>
    withTransaction(exec, () => nextSequenceRaw(exec, key, opts))

  const itemsService = {
    getAll: () => itemsRepo.getAll(["id", "DESC"]) as unknown as Promise<Item[]>,

    get: (id: number) => itemsRepo.get(id) as unknown as Promise<Item | undefined>,

    async getInStock(): Promise<Item[]> {
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM items WHERE COALESCE(status, 'in_stock') = 'in_stock' ORDER BY id DESC",
      )
      return rows.map((r) => decodeRow<Item>(r, typesFor("items")))
    },

    async getByTag(tag: string): Promise<Item | undefined> {
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM items WHERE tag = $1 LIMIT 1",
        [tag],
      )
      return rows[0] ? decodeRow<Item>(rows[0], typesFor("items")) : undefined
    },

    async getByIds(ids: number[]): Promise<Item[]> {
      if (!ids.length) return []
      const ph = ids.map((_, i) => `$${i + 1}`).join(", ")
      const rows = await exec.query<Record<string, unknown>>(
        `SELECT * FROM items WHERE id IN (${ph})`,
        ids,
      )
      return rows.map((r) => decodeRow<Item>(r, typesFor("items")))
    },

    add: (
      input: Omit<Item, "id" | "netWt" | "tag" | "createdAt" | "updatedAt"> & {
        tag?: string
        tagPrefix?: string
      },
    ): Promise<Item> => withTransaction(exec, () => addItemRaw(input)),

    async update(id: number, patch: Partial<Item>): Promise<void> {
      const next: Partial<Item> = { ...patch, updatedAt: nowIso() }
      if (patch.grossWt != null || patch.stoneWt != null) {
        const existing = (await itemsRepo.get(id)) as unknown as Item | undefined
        if (existing) {
          next.netWt = computeNetWt(
            patch.grossWt ?? existing.grossWt,
            patch.stoneWt ?? existing.stoneWt,
          )
        }
      }
      await itemsRepo.update(id, next)
    },

    remove: (id: number) => itemsRepo.remove(id),

    async search(term: string): Promise<Item[]> {
      const q = term.trim().toLowerCase()
      if (!q) return itemsService.getAll()
      const like = `%${q}%`
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM items WHERE lower(tag) LIKE $1 OR lower(name) LIKE $1 OR lower(COALESCE(huid,'')) LIKE $1 ORDER BY id DESC",
        [like],
      )
      return rows.map((r) => decodeRow<Item>(r, typesFor("items")))
    },

    count: () => itemsRepo.count(),
  }

  const customersService = {
    getAll: () => customersRepo.getAll(["name", "ASC"]) as unknown as Promise<Customer[]>,

    get: (id: number) => customersRepo.get(id) as unknown as Promise<Customer | undefined>,

    async add(input: Omit<Customer, "id" | "createdAt" | "updatedAt">): Promise<Customer> {
      const record: Omit<Customer, "id"> = {
        ...input,
        loyaltyPoints: input.loyaltyPoints ?? 0,
        openingBalance: input.openingBalance ?? 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      return (await customersRepo.add(record)) as unknown as Customer
    },

    update: (id: number, patch: Partial<Customer>) =>
      customersRepo.update(id, { ...patch, updatedAt: nowIso() }),

    remove: (id: number) => customersRepo.remove(id),

    async search(term: string): Promise<Customer[]> {
      const q = term.trim().toLowerCase()
      if (!q) return customersService.getAll()
      const like = `%${q}%`
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM customers WHERE lower(name) LIKE $1 OR mobile LIKE $1 ORDER BY name ASC",
        [like],
      )
      return rows.map((r) => decodeRow<Customer>(r, typesFor("customers")))
    },

    /** Outstanding = openingBalance + unpaid invoice balances − receipts collected. */
    async getOutstanding(customerId: number): Promise<number> {
      const cust = (await customersRepo.get(customerId)) as unknown as Customer | undefined
      if (!cust) return 0
      const inv = await exec.query<{ s: number }>(
        "SELECT COALESCE(SUM(balance), 0) AS s FROM sales_invoices WHERE customerId = $1",
        [customerId],
      )
      const rec = await exec.query<{ s: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM receipts WHERE customerId = $1",
        [customerId],
      )
      return round(cust.openingBalance + (inv[0]?.s ?? 0) - (rec[0]?.s ?? 0))
    },
  }

  const salesService = {
    getInvoices: () =>
      salesRepo.getAll(["id", "DESC"]) as unknown as Promise<SalesInvoice[]>,

    getInvoice: (id: number) =>
      salesRepo.get(id) as unknown as Promise<SalesInvoice | undefined>,

    getInvoicesByDate: (date: string) =>
      salesRepo.where({ date } as never) as unknown as Promise<SalesInvoice[]>,

    getLineItems: (invoiceId: number) =>
      salesItemsRepo.where({ invoiceId } as never) as unknown as Promise<SalesItem[]>,

    getUrdItems: (invoiceId: number) =>
      urdRepo.where({ invoiceId } as never) as unknown as Promise<UrdItem[]>,

    /** Fetch a complete invoice (header + lines + URD) for editing. */
    async getFull(id: number): Promise<{ invoice: SalesInvoice; items: SalesItem[]; urd: UrdItem[] } | null> {
      const invoice = (await salesRepo.get(id)) as unknown as SalesInvoice | undefined
      if (!invoice) return null
      const [items, urd] = await Promise.all([
        salesItemsRepo.where({ invoiceId: id } as never),
        urdRepo.where({ invoiceId: id } as never),
      ])
      return { invoice, items: items as unknown as SalesItem[], urd: urd as unknown as UrdItem[] }
    },

    /**
     * Persist a complete sale atomically — the SQLite port of the Dexie
     * createInvoice. All writes (invoice number, header, item lines, URD lines,
     * marking sold stock, loyalty delta, order fulfilment) run inside one
     * transaction so a mid-failure rolls the whole sale back.
     */
    async createInvoice(draft: SaleDraft): Promise<SalesInvoice> {
      return withTransaction(exec, async () => {
        const { code: invoiceNo } = await nextSequenceRaw(exec, "invoice", { prefix: "INV" })
        const header: Omit<SalesInvoice, "id"> = {
          ...draft.invoice,
          invoiceNo,
          createdAt: nowIso(),
        }
        const created = (await salesRepo.add(header as never)) as { id: number }
        const invoiceId = created.id

        for (const li of draft.items) {
          await salesItemsRepo.add({ ...li, invoiceId } as never)
        }
        for (const u of draft.urd) {
          await urdRepo.add({ ...u, invoiceId } as never)
        }

        // Mark any tagged stock as sold.
        for (const li of draft.items) {
          if (li.itemId) await itemsRepo.update(li.itemId, { status: "sold" })
        }

        // Apply loyalty points (earned − redeemed) to the customer.
        const delta = (header.pointsEarned ?? 0) - (header.pointsRedeemed ?? 0)
        if (delta !== 0) {
          const customer = (await customersRepo.get(header.customerId)) as unknown as
            | Customer
            | undefined
          if (customer) {
            await customersRepo.update(header.customerId, {
              loyaltyPoints: Math.max(0, (customer.loyaltyPoints ?? 0) + delta),
            })
          }
        }

        // Fulfil a linked custom order.
        if (header.orderId) {
          await ordersRepo.update(header.orderId, { status: "delivered", invoiceId })
        }

        return { ...header, id: invoiceId } as SalesInvoice
      })
    },

    /** Rewrite an existing invoice atomically: restore old stock, rewrite lines. */
    async updateInvoice(id: number, draft: SaleDraft): Promise<SalesInvoice> {
      return withTransaction(exec, async () => {
        const existing = (await salesRepo.get(id)) as unknown as SalesInvoice | undefined
        if (!existing) throw new Error("Invoice not found")

        const oldItems = (await salesItemsRepo.where({ invoiceId: id } as never)) as unknown as SalesItem[]
        for (const li of oldItems) {
          if (li.itemId) await itemsRepo.update(li.itemId, { status: "in_stock" })
        }
        await deleteWhere("sales_items", "invoiceId", id)
        await deleteWhere("urd_items", "invoiceId", id)

        // Keep invoiceNo, createdAt and the original date.
        await salesRepo.update(id, { ...draft.invoice, date: existing.date } as never)

        for (const li of draft.items) await salesItemsRepo.add({ ...li, invoiceId: id } as never)
        for (const u of draft.urd) await urdRepo.add({ ...u, invoiceId: id } as never)
        for (const li of draft.items) {
          if (li.itemId) await itemsRepo.update(li.itemId, { status: "sold" })
        }
        return (await salesRepo.get(id)) as unknown as SalesInvoice
      })
    },
  }

  const loansService = {
    getAll: () => loansRepo.getAll(["id", "DESC"]) as unknown as Promise<Loan[]>,
    get: (id: number) => loansRepo.get(id) as unknown as Promise<Loan | undefined>,
    getOpen: () => queryRows<Loan>("loans", " WHERE COALESCE(isClosed, 0) = 0 ORDER BY id DESC"),
    getPayments: (loanId: number) =>
      loanPaymentsRepo.where({ loanId } as never) as unknown as Promise<LoanPayment[]>,
    getAllPayments: () => loanPaymentsRepo.getAll() as unknown as Promise<LoanPayment[]>,
    update: (id: number, patch: Partial<Loan>) => loansRepo.update(id, patch),
    close: (id: number, amountCollected: number) =>
      loansRepo.update(id, { isClosed: true, closedDate: todayStr(), amountCollected } as never),

    async add(
      input: Omit<Loan, "id" | "loanNo" | "createdAt" | "isClosed" | "principalOutstanding">,
    ): Promise<Loan> {
      return withTransaction(exec, async () => {
        const { code: loanNo } = await nextSequenceRaw(exec, "loan", { prefix: "GRV" })
        const record: Omit<Loan, "id"> = {
          ...input,
          loanNo,
          isClosed: false,
          principalOutstanding: input.loanAmount,
          createdAt: nowIso(),
        }
        return (await loansRepo.add(record as never)) as unknown as Loan
      })
    },

    /**
     * Record a loan payment atomically. Allocates cash to interest first then
     * principal; on a renewal the unpaid interest is capitalised (compounds).
     * Recomputes dues via the same pure engine as the Dexie path, and only
     * closes the loan when both principal and interest reach zero.
     */
    async addPayment(
      loanId: number,
      payment: { date: string; amount: number; type: "part" | "renewal" | "closure"; notes?: string },
    ): Promise<LoanPayment> {
      return withTransaction(exec, async () => {
        const loan = (await loansRepo.get(loanId)) as unknown as Loan | undefined
        if (!loan) throw new Error("Loan not found")
        const payments = (await loanPaymentsRepo.where({ loanId } as never)) as unknown as LoanPayment[]

        const dues = computeLoanDues(loan, payments, payment.date)
        const interestDue = dues.interestOutstanding
        const towardsInterest = round(Math.min(payment.amount, interestDue))
        const towardsPrincipal = round(Math.min(payment.amount - towardsInterest, dues.principalOutstanding))
        const interestShortfall = round(Math.max(0, interestDue - towardsInterest))
        const capitalisedInterest = payment.type === "renewal" ? interestShortfall : 0

        const record: LoanPayment = {
          loanId,
          date: payment.date,
          amount: payment.amount,
          towardsInterest,
          towardsPrincipal,
          type: payment.type,
          notes: payment.notes,
          ...(capitalisedInterest > 0 ? { capitalisedInterest } : {}),
        }
        const created = (await loanPaymentsRepo.add(record as never)) as { id: number }
        const id = created.id

        const postDues = computeLoanDues(loan, [...payments, { ...record, id }], payment.date)
        const fullyPaid =
          postDues.principalOutstanding <= 0 && postDues.interestOutstanding <= 0
        const totalCollected = round(
          payments.reduce((s, p) => s + p.amount, 0) + payment.amount,
        )

        await loansRepo.update(loanId, {
          principalOutstanding: postDues.principalOutstanding,
          isClosed: fullyPaid,
          ...(fullyPaid ? { closedDate: payment.date, amountCollected: totalCollected } : {}),
        })
        return { ...record, id }
      })
    },
  }

  const karigarsService = {
    getAll: () => karigarsRepo.getAll(["name", "ASC"]) as unknown as Promise<Karigar[]>,
    get: (id: number) => karigarsRepo.get(id) as unknown as Promise<Karigar | undefined>,
    getJobs: () => karigarJobsRepo.getAll(["id", "DESC"]) as unknown as Promise<KarigarJob[]>,
    getJobsByKarigar: (karigarId: number) =>
      karigarJobsRepo.where({ karigarId } as never) as unknown as Promise<KarigarJob[]>,

    async add(
      input: Omit<Karigar, "id" | "createdAt" | "metalBalanceWt"> & { metalBalanceWt?: number },
    ): Promise<Karigar> {
      const record: Omit<Karigar, "id"> = {
        ...input,
        metalBalanceWt: input.metalBalanceWt ?? 0,
        createdAt: nowIso(),
      }
      return (await karigarsRepo.add(record as never)) as unknown as Karigar
    },

    /** Issue raw metal — mint a job number and debit the karigar's metal ledger. */
    async issueJob(
      input: Omit<KarigarJob, "id" | "jobNo" | "status" | "finishedWt" | "createdAt">,
    ): Promise<KarigarJob> {
      return withTransaction(exec, async () => {
        const { code: jobNo } = await nextSequenceRaw(exec, "karigar_job", { prefix: "JOB" })
        const record: Omit<KarigarJob, "id"> = {
          ...input,
          jobNo,
          finishedWt: 0,
          status: "issued",
          createdAt: nowIso(),
        }
        const created = (await karigarJobsRepo.add(record as never)) as unknown as KarigarJob
        const karigar = (await karigarsRepo.get(input.karigarId)) as unknown as Karigar | undefined
        if (karigar) {
          await karigarsRepo.update(input.karigarId, {
            metalBalanceWt: round3(karigar.metalBalanceWt + input.metalIssuedWt),
          })
        }
        return created
      })
    },

    /** Receive a finished piece — credit the karigar by finished weight + wastage. */
    async receiveJob(jobId: number, finishedWt: number, wastageAllowed: number): Promise<void> {
      return withTransaction(exec, async () => {
        const job = (await karigarJobsRepo.get(jobId)) as unknown as KarigarJob | undefined
        if (!job) return
        const wastageWt = (job.metalIssuedWt * wastageAllowed) / 100
        const credited = finishedWt + wastageWt
        await karigarJobsRepo.update(jobId, {
          finishedWt,
          wastageAllowed,
          status: "received",
          receivedDate: todayStr(),
        })
        const karigar = (await karigarsRepo.get(job.karigarId)) as unknown as Karigar | undefined
        if (karigar) {
          await karigarsRepo.update(job.karigarId, {
            metalBalanceWt: round3(karigar.metalBalanceWt - credited),
          })
        }
      })
    },
  }

  const refiningService = {
    getAll: () => refiningsRepo.getAll(["id", "DESC"]) as unknown as Promise<Refining[]>,
    get: (id: number) => refiningsRepo.get(id) as unknown as Promise<Refining | undefined>,
    getLedger: (refiningId: number) =>
      inventoryLedgerRepo.where({ refId: refiningId } as never) as unknown as Promise<InventoryLedger[]>,
    getBullion: (refiningId: number) =>
      bullionStockRepo.where({ refiningId } as never) as unknown as Promise<BullionStock[]>,

    /**
     * Atomic refining: consume the source scrap, mint the GB-numbered bullion
     * (linked to a sellable item), and write the inventory-ledger + bullion
     * movement audit trail. Mirrors the Dexie implementation.
     */
    async create(
      input: Omit<Refining, "id" | "refiningNo" | "createdAt" | "outputItemId">,
      opts: { addToStock?: boolean; outputCategory?: string; outputName?: string } = {},
    ): Promise<Refining> {
      return withTransaction(exec, async () => {
        const { code: refiningNo } = await nextSequenceRaw(exec, "refining", { prefix: "REF" })
        const today = input.date
        const createdAt = nowIso()
        const status = input.status ?? "completed"
        const header = (await refiningsRepo.add({
          ...input,
          refiningNo,
          status,
          createdAt,
        } as never)) as { id: number }
        const headerId = header.id

        if (input.sourceItemId) {
          const src = (await itemsRepo.get(input.sourceItemId)) as unknown as
            | { grossWt?: number; status?: string }
            | undefined
          await itemsRepo.update(input.sourceItemId, { status: "melted" })
          await inventoryLedgerRepo.add({
            date: today, itemId: input.sourceItemId, refType: "refining", refId: headerId,
            refNo: refiningNo, movement: "out", weight: src?.grossWt ?? input.inputWt,
            description: `Melted for refining ${refiningNo}`, statusFrom: src?.status ?? "in_stock",
            statusTo: "melted", createdBy: input.createdBy, createdAt: nowIso(),
          } as never)
        }

        let outputItemId: number | undefined
        let bullionNo: string | undefined
        if (opts.addToStock !== false && input.outputWt > 0) {
          const created = await addItemRaw({
            name: opts.outputName ?? `Refined ${input.type} ${input.outputPurity}`,
            type: input.type, category: opts.outputCategory ?? "Other", purity: input.outputPurity,
            grossWt: input.outputWt, stoneWt: 0, makingChargePerGm: 0, quantity: 1, tagPrefix: "BUL",
          })
          outputItemId = created.id
          bullionNo = (await nextSequenceRaw(exec, "bullion", { prefix: "GB", pad: 6 })).code
          const bullion = (await bullionStockRepo.add({
            bullionNo, type: input.type, purity: input.outputPurity,
            finePct: finePctFromPurity(input.outputPurity), weight: input.outputWt,
            refiningId: headerId, itemId: outputItemId, status: "in_stock",
            createdDate: today, createdBy: input.createdBy, createdAt: nowIso(),
          } as never)) as { id: number }
          await bullionMovementRepo.add({
            bullionId: bullion.id, date: today, type: "produced", weight: input.outputWt,
            refType: "refining", refId: headerId, note: refiningNo, createdAt: nowIso(),
          } as never)
          await inventoryLedgerRepo.add({
            date: today, itemId: outputItemId, bullionId: bullion.id, refType: "refining",
            refId: headerId, refNo: refiningNo, movement: "in", weight: input.outputWt,
            description: `Refined bullion ${bullionNo}`, statusTo: "in_stock",
            createdBy: input.createdBy, createdAt: nowIso(),
          } as never)
        }

        await refiningsRepo.update(headerId, { outputItemId, bullionNo })
        return { ...input, refiningNo, status, createdAt, outputItemId, bullionNo, id: headerId } as unknown as Refining
      })
    },

    /** Reverse a completed job (never a hard delete). Mirrors the Dexie logic. */
    async reverse(refiningId: number, opts: { by?: string } = {}): Promise<void> {
      await withTransaction(exec, async () => {
        const ref = (await refiningsRepo.get(refiningId)) as unknown as Refining | undefined
        if (!ref) throw new Error("Refining job not found")
        if (ref.status === "reversed") throw new Error("This job is already reversed")
        const today = nowIso().slice(0, 10)

        if (ref.outputItemId) {
          const item = (await itemsRepo.get(ref.outputItemId)) as unknown as { status?: string } | undefined
          if (item?.status === "sold") {
            throw new Error("The refined bullion has already been sold — cannot reverse")
          }
        }

        if (ref.sourceItemId) {
          await itemsRepo.update(ref.sourceItemId, { status: "in_stock" })
          await inventoryLedgerRepo.add({
            date: today, itemId: ref.sourceItemId, refType: "refining_reversal", refId: refiningId,
            refNo: ref.refiningNo, movement: "in", weight: ref.inputWt,
            description: `Reversal of ${ref.refiningNo} — scrap restored`, statusFrom: "melted",
            statusTo: "in_stock", createdBy: opts.by, createdAt: nowIso(),
          } as never)
        }

        const bullions = (await bullionStockRepo.where({ refiningId } as never)) as unknown as BullionStock[]
        for (const b of bullions) {
          if (b.itemId) {
            const it = (await itemsRepo.get(b.itemId)) as unknown as { status?: string } | undefined
            if (it && it.status !== "sold") await itemsRepo.remove(b.itemId)
          }
          await bullionStockRepo.update(b.id!, { status: "reversed" })
          await bullionMovementRepo.add({
            bullionId: b.id, date: today, type: "reversed", weight: -b.weight,
            refType: "refining_reversal", refId: refiningId, note: ref.refiningNo, createdAt: nowIso(),
          } as never)
          await inventoryLedgerRepo.add({
            date: today, itemId: b.itemId, bullionId: b.id, refType: "refining_reversal", refId: refiningId,
            refNo: ref.refiningNo, movement: "out", weight: b.weight,
            description: `Reversal of ${ref.refiningNo} — bullion ${b.bullionNo} voided`,
            statusFrom: "in_stock", statusTo: "reversed", createdBy: opts.by, createdAt: nowIso(),
          } as never)
        }

        await refiningsRepo.update(refiningId, {
          status: "reversed", reversedAt: nowIso(), reversedBy: opts.by,
        })
      })
    },
  }

  const schemesService = {
    getSchemes: () => schemesRepo.getAll(["name", "ASC"]) as unknown as Promise<Scheme[]>,
    getScheme: (id: number) => schemesRepo.get(id) as unknown as Promise<Scheme | undefined>,
    getAccounts: () =>
      schemeAccountsRepo.getAll(["id", "DESC"]) as unknown as Promise<SchemeAccount[]>,
    getAccount: (id: number) =>
      schemeAccountsRepo.get(id) as unknown as Promise<SchemeAccount | undefined>,
    getPayments: (accountId: number) =>
      schemePaymentsRepo.where({ accountId } as never) as unknown as Promise<SchemePayment[]>,
    getAllPayments: () => schemePaymentsRepo.getAll() as unknown as Promise<SchemePayment[]>,
    setStatus: (accountId: number, status: SchemeAccount["status"]) =>
      schemeAccountsRepo.update(accountId, { status } as never),

    async addScheme(input: Omit<Scheme, "id" | "code" | "createdAt"> & { code?: string }): Promise<Scheme> {
      return withTransaction(exec, async () => {
        const code = input.code ?? (await nextSequenceRaw(exec, "scheme", { prefix: "SCH", pad: 3 })).code
        const record: Omit<Scheme, "id"> = { ...input, code, createdAt: nowIso() }
        return (await schemesRepo.add(record as never)) as unknown as Scheme
      })
    },

    async enroll(schemeId: number, customerId: number, startDate: string): Promise<SchemeAccount> {
      return withTransaction(exec, async () => {
        const { code: accountNo } = await nextSequenceRaw(exec, "scheme_acct", { prefix: "GSA" })
        const record: Omit<SchemeAccount, "id"> = {
          accountNo,
          schemeId,
          customerId,
          startDate,
          status: "active",
          createdAt: nowIso(),
        }
        return (await schemeAccountsRepo.add(record as never)) as unknown as SchemeAccount
      })
    },

    /** Build the instalment schedule from the scheme term + recorded payments. */
    async getSchedule(accountId: number): Promise<SchemeScheduleRow[]> {
      const account = (await schemeAccountsRepo.get(accountId)) as unknown as SchemeAccount | undefined
      if (!account) return []
      const scheme = (await schemesRepo.get(account.schemeId)) as unknown as Scheme | undefined
      if (!scheme) return []
      const payments = (await schemePaymentsRepo.where({ accountId } as never)) as unknown as SchemePayment[]

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

    /** Record a scheme instalment, guarding against double-pay of a slot. */
    async addPayment(
      accountId: number,
      amount: number,
      date: string,
      mode: PaymentMode = "cash",
      installmentNo?: number,
      dueDate?: string,
    ): Promise<SchemePayment> {
      return withTransaction(exec, async () => {
        const existing = (await schemePaymentsRepo.where({ accountId } as never)) as unknown as SchemePayment[]
        const paidNos = new Set(existing.map((p) => p.installmentNo))

        let actualInstallmentNo: number
        if (installmentNo != null) {
          if (paidNos.has(installmentNo)) throw new Error(`Installment ${installmentNo} is already paid`)
          actualInstallmentNo = installmentNo
        } else {
          let n = 1
          while (paidNos.has(n)) n++
          actualInstallmentNo = n
        }

        const record: SchemePayment = {
          accountId,
          installmentNo: actualInstallmentNo,
          amount,
          date,
          mode,
          dueDate,
        }
        return (await schemePaymentsRepo.add(record as never)) as unknown as SchemePayment
      })
    },
  }

  const purchaseService = {
    getInvoices: () =>
      purchaseRepo.getAll(["id", "DESC"]) as unknown as Promise<PurchaseInvoice[]>,
    getInvoicesByDate: (date: string) =>
      purchaseRepo.where({ date } as never) as unknown as Promise<PurchaseInvoice[]>,
    getLineItems: (purchaseId: number) =>
      purchaseItemsRepo.where({ purchaseId } as never),

    /** Persist a purchase invoice + its line items atomically. */
    async create(draft: PurchaseDraft): Promise<PurchaseInvoice> {
      return withTransaction(exec, async () => {
        const { code: purchaseNo } = await nextSequenceRaw(exec, "purchase", { prefix: "PUR" })
        const header: Omit<PurchaseInvoice, "id"> = {
          ...draft.invoice,
          purchaseNo,
          createdAt: nowIso(),
        }
        const created = (await purchaseRepo.add(header as never)) as { id: number }
        const purchaseId = created.id
        for (const li of draft.items) await purchaseItemsRepo.add({ ...li, purchaseId } as never)
        return { ...header, id: purchaseId } as PurchaseInvoice
      })
    },
  }

  const refinersService = {
    getAll: () => refinersRepo.getAll(["name", "ASC"]) as unknown as Promise<Refiner[]>,
    get: (id: number) => refinersRepo.get(id) as unknown as Promise<Refiner | undefined>,
    remove: (id: number) => refinersRepo.remove(id),
    update: (id: number, patch: Partial<Refiner>) =>
      refinersRepo.update(id, { ...patch, updatedAt: nowIso() }),
    async add(input: Omit<Refiner, "id" | "createdAt" | "updatedAt">): Promise<Refiner> {
      const record: Omit<Refiner, "id"> = { ...input, createdAt: nowIso(), updatedAt: nowIso() }
      return (await refinersRepo.add(record as never)) as unknown as Refiner
    },
  }

  const suppliersService = {
    getAll: () => suppliersRepo.getAll(["name", "ASC"]) as unknown as Promise<Supplier[]>,
    get: (id: number) => suppliersRepo.get(id) as unknown as Promise<Supplier | undefined>,
    remove: (id: number) => suppliersRepo.remove(id),
    update: (id: number, patch: Partial<Supplier>) =>
      suppliersRepo.update(id, { ...patch, updatedAt: nowIso() }),
    async add(input: Omit<Supplier, "id" | "createdAt" | "updatedAt">): Promise<Supplier> {
      const record: Omit<Supplier, "id"> = {
        ...input,
        openingBalance: input.openingBalance ?? 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      return (await suppliersRepo.add(record as never)) as unknown as Supplier
    },
    async getOutstanding(supplierId: number): Promise<number> {
      const supplier = (await suppliersRepo.get(supplierId)) as unknown as Supplier | undefined
      if (!supplier) return 0
      const rows = await exec.query<{ s: number }>(
        "SELECT COALESCE(SUM(balance), 0) AS s FROM purchase_invoices WHERE supplierId = $1",
        [supplierId],
      )
      return round(supplier.openingBalance + (rows[0]?.s ?? 0))
    },
  }

  const receiptsService = {
    getAll: () => receiptsRepo.getAll(["id", "DESC"]) as unknown as Promise<Receipt[]>,
    getByCustomer: (customerId: number) =>
      receiptsRepo.where({ customerId } as never) as unknown as Promise<Receipt[]>,
    getByDate: (date: string) =>
      receiptsRepo.where({ date } as never) as unknown as Promise<Receipt[]>,
    async add(input: Omit<Receipt, "id" | "receiptNo" | "createdAt">): Promise<Receipt> {
      return withTransaction(exec, async () => {
        const { code: receiptNo } = await nextSequenceRaw(exec, "receipt", { prefix: "RCP" })
        const record: Omit<Receipt, "id"> = { ...input, receiptNo, createdAt: nowIso() }
        return (await receiptsRepo.add(record as never)) as unknown as Receipt
      })
    },
  }

  const ordersService = {
    getAll: () => ordersRepo.getAll(["id", "DESC"]) as unknown as Promise<Order[]>,
    get: (id: number) => ordersRepo.get(id) as unknown as Promise<Order | undefined>,
    async setStatus(id: number, status: Order["status"], opts: { by?: string; remarks?: string } = {}) {
      const o = (await ordersRepo.get(id)) as unknown as Order | undefined
      const entry = { status, at: nowIso(), by: opts.by, remarks: opts.remarks }
      const statusHistory = [...(o?.statusHistory ?? []), entry]
      await ordersRepo.update(id, { status, statusHistory } as never)
    },
    getPayments: (orderId: number) =>
      orderPaymentsRepo.where({ orderId } as never) as unknown as Promise<OrderPayment[]>,
    async addPayment(
      orderId: number,
      input: { date: string; amount: number; mode: OrderPayment["mode"]; notes?: string; by?: string },
    ): Promise<OrderPayment> {
      return withTransaction(exec, async () => {
        const order = (await ordersRepo.get(orderId)) as unknown as Order | undefined
        if (!order) throw new Error("Order not found")
        const pay = {
          orderId, date: input.date, amount: input.amount, mode: input.mode,
          notes: input.notes, createdBy: input.by, createdAt: nowIso(),
        }
        const created = (await orderPaymentsRepo.add(pay as never)) as { id: number }
        const all = (await orderPaymentsRepo.where({ orderId } as never)) as unknown as OrderPayment[]
        const advanceReceived = round(all.reduce((s, p) => s + p.amount, 0))
        const patch: Partial<Order> = { advanceReceived }
        if (["draft", "confirmed", "booked"].includes(order.status)) {
          patch.status = "advance_received"
          patch.statusHistory = [
            ...(order.statusHistory ?? []),
            { status: "advance_received", at: nowIso(), by: input.by, remarks: `Advance ₹${input.amount}` },
          ]
        }
        await ordersRepo.update(orderId, patch as never)
        return { ...pay, id: created.id } as unknown as OrderPayment
      })
    },
    update: (id: number, patch: Partial<Order>) => ordersRepo.update(id, patch as never),
    async getOpen(): Promise<Order[]> {
      const rows = await queryRows<Order>(
        "orders",
        " WHERE status NOT IN ('delivered','cancelled') ORDER BY id DESC",
      )
      return rows
    },
    async add(
      input: Omit<Order, "id" | "orderNo" | "status" | "createdAt">,
      opts: { status?: Order["status"] } = {},
    ): Promise<Order> {
      return withTransaction(exec, async () => {
        const { code: orderNo } = await nextSequenceRaw(exec, "order", { prefix: "ORD" })
        const now = nowIso()
        const status = opts.status ?? "confirmed"
        const statusHistory = input.statusHistory ?? [
          { status, at: now, by: input.salesperson ?? input.createdBy },
        ]
        const record: Omit<Order, "id"> = { ...input, orderNo, status, statusHistory, createdAt: now }
        return (await ordersRepo.add(record as never)) as unknown as Order
      })
    },
  }

  /* ------------------------------------------------------------------ */
  /* Reports & ledgers (derived — same JS aggregation, reads via SQL)   */
  /* ------------------------------------------------------------------ */

  const reportsService = {
    async getDayBook(date: string = todayStr()): Promise<DayBookSummary> {
      const invoices = await queryRows<Record<string, number>>(
        "sales_invoices",
        " WHERE date = $1",
        [date],
      )
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

  const ledgerService = {
    async customerLedger(customerId: number) {
      const customer = (await customersRepo.get(customerId)) as unknown as Customer | undefined
      const opening = customer?.openingBalance ?? 0
      const invoices = await queryRows<any>(
        "sales_invoices",
        " WHERE customerId = $1",
        [customerId],
      )
      const receipts = await queryRows<any>(
        "receipts",
        " WHERE customerId = $1",
        [customerId],
      )

      type Ev = Omit<LedgerEntry, "balance">
      const events: Ev[] = []
      for (const inv of invoices) {
        events.push({ date: inv.date, ref: inv.invoiceNo, particulars: "Sales Invoice", debit: inv.netAmount, credit: 0 })
        const paid = round(inv.cashPaid + inv.upiPaid)
        if (paid > 0) {
          events.push({ date: inv.date, ref: inv.invoiceNo, particulars: "Paid with bill", debit: 0, credit: paid })
        }
      }
      for (const r of receipts) {
        events.push({ date: r.date, ref: r.receiptNo, particulars: `Receipt (${r.mode})`, debit: 0, credit: r.amount })
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

    async cashBook(date: string): Promise<{ rows: CashBookRow[]; totalIn: number; totalOut: number; net: number }> {
      const rows: CashBookRow[] = []
      const invoices = await queryRows<any>("sales_invoices", " WHERE date = $1", [date])
      for (const inv of invoices) {
        const inflow = round(inv.cashPaid + inv.upiPaid)
        if (inflow > 0) rows.push({ date, ref: inv.invoiceNo, particulars: "Sale receipt", inflow, outflow: 0 })
      }
      const receipts = await queryRows<any>("receipts", " WHERE date = $1", [date])
      for (const r of receipts) rows.push({ date, ref: r.receiptNo, particulars: "Udhari collection", inflow: r.amount, outflow: 0 })
      const orders = await queryRows<any>("orders", " WHERE date = $1", [date])
      for (const o of orders) {
        if (o.advanceReceived > 0) rows.push({ date, ref: o.orderNo, particulars: "Order advance", inflow: o.advanceReceived, outflow: 0 })
      }
      const loans = await queryRows<any>("loans", "")
      for (const l of loans) {
        if (l.date === date) rows.push({ date, ref: l.loanNo, particulars: "Loan disbursed (Girvi)", inflow: 0, outflow: l.loanAmount })
        if (l.isClosed && l.closedDate === date && l.amountCollected) {
          rows.push({ date, ref: l.loanNo, particulars: "Loan redeemed", inflow: l.amountCollected, outflow: 0 })
        }
      }
      const purchases = await queryRows<any>("purchase_invoices", " WHERE date = $1", [date])
      for (const p of purchases) {
        if (p.amountPaid > 0) rows.push({ date, ref: p.purchaseNo, particulars: "Purchase payment", inflow: 0, outflow: p.amountPaid })
      }
      const totalIn = round(rows.reduce((s, r) => s + r.inflow, 0))
      const totalOut = round(rows.reduce((s, r) => s + r.outflow, 0))
      return { rows, totalIn, totalOut, net: round(totalIn - totalOut) }
    },

    async gstr1(month: string): Promise<Gstr1Row[]> {
      const invoices = await queryRows<any>(
        "sales_invoices",
        " WHERE date LIKE $1",
        [`${month}%`],
      )
      const customers = (await customersRepo.getAll()) as unknown as Customer[]
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

    async sundryDebtors() {
      const customers = (await customersRepo.getAll()) as unknown as Customer[]
      const debtors: { id: number; name: string; mobile: string; outstanding: number; lastTxnDate: string }[] = []
      for (const cust of customers) {
        const outstanding = await customersService.getOutstanding(cust.id!)
        if (outstanding > 0) {
          const invoices = await queryRows<{ date: string }>("sales_invoices", " WHERE customerId = $1", [cust.id])
          const receipts = await queryRows<{ date: string }>("receipts", " WHERE customerId = $1", [cust.id])
          const dates = [...invoices.map((i) => i.date), ...receipts.map((r) => r.date)].filter(Boolean)
          let lastTxnDate = "—"
          if (dates.length) {
            dates.sort()
            lastTxnDate = dates[dates.length - 1]
          }
          debtors.push({ id: cust.id!, name: cust.name, mobile: cust.mobile, outstanding, lastTxnDate })
        }
      }
      return debtors.sort((a, b) => b.outstanding - a.outstanding)
    },

    /**
     * GST HSN-wise summary for a month. Each invoice's tax is split across its
     * line items in proportion to their line value, then rolled up by HSN code
     * (falling back to the firm's default HSN). Mirrors the Dexie aggregation.
     */
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
      const companyRows = await systemExec.query<{ defaultHsnCode?: string }>(
        "SELECT defaultHsnCode FROM companies WHERE id = $1",
        [activeCompanyId()],
      )
      const defaultHsn = companyRows[0]?.defaultHsnCode || "7113"

      const invoices = await queryRows<any>("sales_invoices", " WHERE date LIKE $1", [`${month}%`])
      if (!invoices.length) return []

      const invoiceIds = invoices.map((i) => i.id)
      const invPh = invoiceIds.map((_, i) => `$${i + 1}`).join(", ")
      const salesItems = await exec.query<any>(
        `SELECT * FROM sales_items WHERE invoiceId IN (${invPh})`,
        invoiceIds,
      )

      const lineItemIds = [...new Set(salesItems.map((s) => s.itemId).filter((x): x is number => x != null))]
      const qtyById = new Map<number, number>()
      if (lineItemIds.length) {
        const idPh = lineItemIds.map((_, i) => `$${i + 1}`).join(", ")
        const stockItems = await exec.query<{ id: number; quantity?: number }>(
          `SELECT id, quantity FROM items WHERE id IN (${idPh})`,
          lineItemIds,
        )
        for (const s of stockItems) qtyById.set(s.id, s.quantity ?? 1)
      }

      const summaryMap = new Map<
        string,
        { hsn: string; description: string; taxableValue: number; cgst: number; sgst: number; igst: number; qty: number; netWt: number }
      >()
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
          const lineQty = item.itemId != null ? qtyById.get(item.itemId) ?? 1 : 1

          const existing = summaryMap.get(hsn)
          if (existing) {
            existing.taxableValue = round(existing.taxableValue + lineTaxable)
            existing.cgst = round(existing.cgst + lineCgst)
            existing.sgst = round(existing.sgst + lineSgst)
            existing.igst = round(existing.igst + lineIgst)
            existing.qty += lineQty
            existing.netWt = round3(existing.netWt + lineNetWt)
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
  }

  return {
    nextSequence,
    itemsService,
    customersService,
    salesService,
    loansService,
    karigarsService,
    refiningService,
    refinersService,
    schemesService,
    purchaseService,
    suppliersService,
    receiptsService,
    ordersService,
    reportsService,
    ledgerService,
  }
}
