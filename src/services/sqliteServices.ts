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
import type { PurchaseDraft, SaleDraft } from "@/services/dbService"
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

/** Build the SQLite master-data services bound to an executor. */
export function makeSqliteServices(exec: SqlExecutor = tauriExecutor) {
  const itemsRepo = makeTableRepo("items", typesFor("items"), exec)
  const customersRepo = makeTableRepo("customers", typesFor("customers"), exec)
  const salesRepo = makeTableRepo("sales_invoices", typesFor("sales_invoices"), exec)
  const salesItemsRepo = makeTableRepo("sales_items", typesFor("sales_items"), exec)
  const urdRepo = makeTableRepo("urd_items", typesFor("urd_items"), exec)
  const ordersRepo = makeTableRepo("orders", typesFor("orders"), exec)
  const loansRepo = makeTableRepo("loans", typesFor("loans"), exec)
  const loanPaymentsRepo = makeTableRepo("loan_payments", typesFor("loan_payments"), exec)
  const karigarsRepo = makeTableRepo("karigars", typesFor("karigars"), exec)
  const karigarJobsRepo = makeTableRepo("karigar_jobs", typesFor("karigar_jobs"), exec)
  const refiningsRepo = makeTableRepo("refinings", typesFor("refinings"), exec)
  const purchaseRepo = makeTableRepo("purchase_invoices", typesFor("purchase_invoices"), exec)
  const purchaseItemsRepo = makeTableRepo("purchase_items", typesFor("purchase_items"), exec)
  const schemePaymentsRepo = makeTableRepo("scheme_payments", typesFor("scheme_payments"), exec)

  /** DELETE every row of `table` matching one equality column (used by cascade rewrites). */
  const deleteWhere = (table: string, col: string, val: unknown) =>
    exec.run(`DELETE FROM "${table}" WHERE "${col}" = $1`, [val])

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

    getLineItems: (invoiceId: number) =>
      salesItemsRepo.where({ invoiceId } as never) as unknown as Promise<SalesItem[]>,

    getUrdItems: (invoiceId: number) =>
      urdRepo.where({ invoiceId } as never) as unknown as Promise<UrdItem[]>,

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
    getPayments: (loanId: number) =>
      loanPaymentsRepo.where({ loanId } as never) as unknown as Promise<LoanPayment[]>,
    update: (id: number, patch: Partial<Loan>) => loansRepo.update(id, patch),

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

    /** Melt a source scrap item and (optionally) mint the refined-bullion output. */
    async create(
      input: Omit<Refining, "id" | "refiningNo" | "createdAt" | "outputItemId">,
      opts: { addToStock?: boolean; outputCategory?: string; outputName?: string } = {},
    ): Promise<Refining> {
      return withTransaction(exec, async () => {
        const { code: refiningNo } = await nextSequenceRaw(exec, "refining", { prefix: "REF" })
        let outputItemId: number | undefined

        if (input.sourceItemId) {
          await itemsRepo.update(input.sourceItemId, { status: "melted" })
        }
        if (opts.addToStock !== false && input.outputWt > 0) {
          const created = await addItemRaw({
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

        const record: Omit<Refining, "id"> = { ...input, refiningNo, outputItemId, createdAt: nowIso() }
        return (await refiningsRepo.add(record as never)) as unknown as Refining
      })
    },
  }

  const schemesService = {
    getPayments: (accountId: number) =>
      schemePaymentsRepo.where({ accountId } as never) as unknown as Promise<SchemePayment[]>,

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

  return {
    nextSequence,
    itemsService,
    customersService,
    salesService,
    loansService,
    karigarsService,
    refiningService,
    schemesService,
    purchaseService,
  }
}
