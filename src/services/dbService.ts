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
import { computeMetalTally } from "@/features/reports/metalTally"
import { db, activeCompanyId, JewelDatabase, dbNameForCompany } from "@/db/database"
import { systemDb, type Company, type User } from "@/db/systemDb"
import { isTauri, systemExecutor } from "@/db/sqlite"
import { makeSqliteServices } from "@/services/sqliteServices"
import { SQLITE_CUTOVER_ENABLED } from "@/db/persistence"
import { assertAllowed } from "@/lib/permissions"
import type { UserRole } from "@/db/systemDb"
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
  BullionStock,
  InventoryLedger,
  MetalTally,
  OrderPayment,
  PurchasePayment,
  PurchaseReturn,
  Refining,
  Refiner,
  SalesInvoice,
  SalesItem,
  SalesReturn,
  SalesReturnItem,
  ReturnDisposition,
  AuditEntry,
  DailyMetalRate,
  CashVoucher,
  DayClosing,
  RepairJob,
  RepairHistory,
  RepairStatus,
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

const itemsServiceDexie = {
  getAll: (): Promise<Item[]> => db.items.orderBy("id").reverse().toArray(),

  getInStock: (): Promise<Item[]> =>
    db.items.where("status").anyOf("in_stock").or("id").above(0).toArray()
      .then((rows) => rows.filter((r) => (r.status ?? "in_stock") === "in_stock")),

  get: (id: number): Promise<Item | undefined> => db.items.get(id),

  getByTag: (tag: string): Promise<Item | undefined> =>
    db.items.where("tag").equals(tag).first(),

  getByIds: (ids: number[]): Promise<Item[]> =>
    ids.length ? db.items.where("id").anyOf(ids).toArray() : Promise.resolve([]),

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

  async update(id: number, patch: Partial<Item>, context?: { user?: string; role?: UserRole; reason?: string }): Promise<void> {
    const before = context ? await db.items.get(id) : undefined
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
    if(context&&before&&next.netWt!=null&&next.netWt!==before.netWt)await db.inventory_ledger.add({itemId:id,date:todayStr(),movement:next.netWt>before.netWt?"in":"out",weight:Math.abs(next.netWt-before.netWt),refType:"stock_adjustment",refId:id,refNo:before.tag,description:context.reason,createdBy:context.user,createdAt:nowIso()})
    if (context) await auditServiceDexie.add({ user: context.user, action: "stock_adjustment", entity: "item", entityId: id, reason: context.reason, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(await db.items.get(id)) })
  },

  async remove(id: number, actor?: { user?: string; role?: UserRole; reason?: string }): Promise<void> { assertAllowed(actor?.role, "permanent_delete"); const before=await db.items.get(id); await db.items.delete(id); await auditServiceDexie.add({user:actor?.user,action:"permanent_delete",entity:"item",entityId:id,reason:actor?.reason,beforeJson:JSON.stringify(before)}) },

  /** Case-insensitive search over tag / name / huid. */
  async search(term: string): Promise<Item[]> {
    const q = term.trim().toLowerCase()
    if (!q) return itemsServiceDexie.getAll()
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

const customersServiceDexie = {
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

  async remove(id: number, actor?: { user?: string; role?: UserRole; reason?: string }): Promise<void> { assertAllowed(actor?.role,"permanent_delete"); const before=await db.customers.get(id); await db.customers.delete(id); await auditServiceDexie.add({user:actor?.user,action:"permanent_delete",entity:"customer",entityId:id,reason:actor?.reason,beforeJson:JSON.stringify(before)}) },

  async search(term: string): Promise<Customer[]> {
    const q = term.trim().toLowerCase()
    if (!q) return customersServiceDexie.getAll()
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
    const invoiceBalance = invoices.filter((x) => !x.cancelled).reduce((sum, inv) => sum + inv.balance, 0)
    const receipts = await db.receipts
      .where("customerId")
      .equals(customerId)
      .toArray()
    const collected = receipts.reduce((sum, r) => sum + r.amount, 0)
    const returns = await db.sales_returns.where("customerId").equals(customerId).toArray()
    const returnCredit = returns.reduce((sum, r) => sum + r.totalAmount - r.refundAmount, 0)
    return Number(
      (customer.openingBalance + invoiceBalance - collected - returnCredit).toFixed(2),
    )
  },
}

/* ------------------------------------------------------------------ */
/* Receipts (Udhari / credit collection)                              */
/* ------------------------------------------------------------------ */

const receiptsServiceDexie = {
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
  audit?: { user?: string; reason?: string }
}

export interface SalesReturnDraft {
  invoiceId: number
  date: string
  reason: string
  refundMode?: PaymentMode
  refundAmount: number
  notes?: string
  createdBy?: string
  items: Array<{
    salesItemId: number
    netWt: number
    disposition: ReturnDisposition
  }>
}

const auditServiceDexie = {
  getAll: (): Promise<AuditEntry[]> => db.audit_log.orderBy("id").reverse().toArray(),
  add: (entry: Omit<AuditEntry, "id" | "createdAt">): Promise<number> =>
    db.audit_log.add({ ...entry, createdAt: nowIso() }),
}
export interface MetalStockRow{metal:string;purity:string;location:string;weight:number;fineWeight:number}
const round3=(n:number)=>Number(n.toFixed(3))
const pct=(p:string)=>{const m=p.match(/\((\d{3})\)/)||p.match(/(\d{3})/);if(m)return Number(m[1])/1000;const k=p.match(/(\d{1,2})K/i);return k?Number(k[1])/24:1}
const metalStockServiceDexie={async summary():Promise<MetalStockRow[]>{const [items,jobs,urd]=await Promise.all([db.items.toArray(),db.karigar_jobs.toArray(),db.urd_items.toArray()]);const map=new Map<string,MetalStockRow>();const add=(metal:string,purity:string,location:string,w:number)=>{const key=`${metal}|${purity}|${location}`,x=map.get(key)??{metal,purity,location,weight:0,fineWeight:0};x.weight=round3(x.weight+w);x.fineWeight=round3(x.fineWeight+w*pct(purity));map.set(key,x)};for(const i of items)if((i.status??"in_stock")!=="sold"&&i.status!=="melted")add(i.type,i.purity,i.status==="with_karigar"?"With karigar":"Shop stock",i.netWt);for(const j of jobs.filter(x=>x.status==="issued"))add("gold","Unspecified","With karigar",j.metalIssuedWt);for(const u of urd)add(u.type,u.purity||"Untested","URD awaiting refining",u.netWt);return[...map.values()].sort((a,b)=>`${a.metal}${a.purity}${a.location}`.localeCompare(`${b.metal}${b.purity}${b.location}`))}}

const operationsServiceDexie = {
  getRates: (date?: string): Promise<DailyMetalRate[]> => date ? db.daily_metal_rates.where("date").equals(date).reverse().sortBy("effectiveAt") : db.daily_metal_rates.orderBy("id").reverse().toArray(),
  getLatestRate: (): Promise<DailyMetalRate | undefined> => db.daily_metal_rates.orderBy("effectiveAt").last(),
  async addRate(input: Omit<DailyMetalRate, "id" | "effectiveAt" | "createdAt">): Promise<DailyMetalRate> {
    if ([input.gold24k, input.gold22k, input.gold18k, input.silver, input.oldGoldBuy22k].some((x) => x < 0)) throw new Error("Rates cannot be negative")
    const record = { ...input, effectiveAt: nowIso(), createdAt: nowIso() }
    const id = await db.daily_metal_rates.add(record)
    await auditServiceDexie.add({ user: input.createdBy, action: "set_metal_rates", entity: "daily_metal_rate", entityId: id, afterJson: JSON.stringify(record) })
    return { ...record, id }
  },
  /** Active vouchers only — blocked (voided) vouchers are hidden and excluded from cash math. */
  getVouchers: (date?: string): Promise<CashVoucher[]> => (date ? db.cash_vouchers.where("date").equals(date).toArray() : db.cash_vouchers.orderBy("id").reverse().toArray()).then((rows) => rows.filter((v) => !v.blocked)),
  /** Blocked vouchers for a day — surfaced only behind the owner "Show blocked" toggle. */
  getBlockedVouchers: (date?: string): Promise<CashVoucher[]> => (date ? db.cash_vouchers.where("date").equals(date).toArray() : db.cash_vouchers.orderBy("id").reverse().toArray()).then((rows) => rows.filter((v) => !!v.blocked)),
  /** Soft-block (never delete) a wrong voucher; excluded from day-close, kept for audit. */
  async blockVoucher(id: number, actor?: { user?: string; role?: UserRole; reason?: string }): Promise<void> { assertAllowed(actor?.role,"irreversible_stock"); const before=await db.cash_vouchers.get(id); await db.cash_vouchers.update(id,{blocked:true}); await auditServiceDexie.add({user:actor?.user,action:"block_voucher",entity:"cash_voucher",entityId:id,reason:actor?.reason,beforeJson:JSON.stringify(before)}) },
  async unblockVoucher(id: number, actor?: { user?: string; role?: UserRole }): Promise<void> { assertAllowed(actor?.role,"irreversible_stock"); await db.cash_vouchers.update(id,{blocked:false}); await auditServiceDexie.add({user:actor?.user,action:"unblock_voucher",entity:"cash_voucher",entityId:id}) },
  async addVoucher(input: Omit<CashVoucher, "id" | "voucherNo" | "createdAt">): Promise<CashVoucher> {
    if (!(input.amount > 0)) throw new Error("Amount must be greater than zero")
    return db.transaction("rw", [db.cash_vouchers, db.counters, db.audit_log], async () => {
      const { code: voucherNo } = await nextSequence(input.kind === "payment" ? "payment_voucher" : "receipt_voucher", { prefix: input.kind === "payment" ? "PV" : "RV" })
      const record = { ...input, voucherNo, createdAt: nowIso() }
      const id = await db.cash_vouchers.add(record)
      await db.audit_log.add({ createdAt: nowIso(), user: input.createdBy, action: `create_${input.kind}_voucher`, entity: "cash_voucher", entityId: id, afterJson: JSON.stringify(record) })
      return { ...record, id }
    })
  },
  getClosing: (date: string): Promise<DayClosing | undefined> => db.day_closings.where("date").equals(date).first(),
  async closeDay(input: { date: string; openingCash: number; physicalCash: number; notes?: string; closedBy?: string }): Promise<DayClosing> {
    const existing = await db.day_closings.where("date").equals(input.date).first()
    if (existing) throw new Error("This day is already closed")
    const [invoices, receipts, vouchers, purchases, loans, loanPayments] = await Promise.all([
      db.sales_invoices.where("date").equals(input.date).toArray(), db.receipts.where("date").equals(input.date).toArray(), db.cash_vouchers.where("date").equals(input.date).toArray(), db.purchase_invoices.where("date").equals(input.date).toArray(), db.loans.toArray(), db.loan_payments.where("date").equals(input.date).toArray(),
    ])
    const salesCash = invoices.reduce((s, x) => s + x.cashPaid, 0)
    const receiptCash = receipts.filter((x) => x.mode === "cash").reduce((s, x) => s + x.amount, 0)
    const voucherCash = vouchers.filter((x) => x.mode === "cash" && !x.blocked).reduce((s, x) => s + (x.kind === "receipt" ? x.amount : -x.amount), 0)
    const purchaseCash = purchases.filter((x) => (x.paymentMode ?? "cash") === "cash").reduce((s, x) => s + x.amountPaid, 0)
    const loanOut = loans.filter((x) => x.date === input.date && !x.blocked).reduce((s, x) => s + x.loanAmount, 0)
    const loanIn = loanPayments.reduce((s, x) => s + x.amount, 0)
    const expectedCash = round(input.openingCash + salesCash + receiptCash + voucherCash + loanIn - purchaseCash - loanOut)
    const record: DayClosing = { ...input, expectedCash, difference: round(input.physicalCash - expectedCash), closedAt: nowIso() }
    const id = await db.day_closings.add(record)
    await auditServiceDexie.add({ user: input.closedBy, action: "close_day", entity: "day_closing", entityId: id, afterJson: JSON.stringify(record) })
    return { ...record, id }
  },
}

const repairsServiceDexie={
 getAll:():Promise<RepairJob[]>=>db.repairs.orderBy("id").reverse().toArray(),
 getHistory:(repairId:number):Promise<RepairHistory[]>=>db.repair_history.where("repairId").equals(repairId).sortBy("at"),
 async add(input:Omit<RepairJob,"id"|"repairNo"|"status"|"createdAt"|"updatedAt">):Promise<RepairJob>{return db.transaction("rw",[db.repairs,db.repair_history,db.counters,db.audit_log],async()=>{const{code:repairNo}=await nextSequence("repair",{prefix:"REP"});const now=nowIso();const record:RepairJob={...input,repairNo,status:"received",createdAt:now,updatedAt:now};const id=await db.repairs.add(record);await db.repair_history.add({repairId:id,status:"received",at:now,by:input.createdBy});await db.audit_log.add({createdAt:now,user:input.createdBy,action:"repair_intake",entity:"repair",entityId:id,afterJson:JSON.stringify(record)});return{...record,id}})},
 async setStatus(id:number,status:RepairStatus,context:{user?:string;reason?:string;finalAmount?:number}):Promise<void>{return db.transaction("rw",[db.repairs,db.repair_history,db.audit_log],async()=>{const before=await db.repairs.get(id);if(!before)throw new Error("Repair not found");if(before.status==="delivered")throw new Error("Delivered repair cannot be changed");const now=nowIso();const patch:Partial<RepairJob>={status,updatedBy:context.user,updatedAt:now,...(context.finalAmount!=null?{finalAmount:context.finalAmount}:{}),...(status==="delivered"?{deliveredDate:todayStr()}: {})};await db.repairs.update(id,patch);await db.repair_history.add({repairId:id,status,at:now,by:context.user,reason:context.reason});await db.audit_log.add({createdAt:now,user:context.user,action:"repair_status",entity:"repair",entityId:id,reason:context.reason,beforeJson:JSON.stringify(before),afterJson:JSON.stringify({...before,...patch})})})},
 /** Issue extra metal for a repair to a karigar: raises a linked Karigar job
  * (debits their metal ledger + posts stock-out) and records the metal on the repair. */
 async assignKarigar(repairId:number,input:{karigarId:number;metalIssuedWt:number;metalRate:number;metalPurity?:string;wastageAllowed:number;user?:string}):Promise<void>{
  return db.transaction("rw",[db.repairs,db.repair_history,db.karigar_jobs,db.karigars,db.counters,db.inventory_ledger,db.audit_log],async()=>{
   const before=await db.repairs.get(repairId);if(!before)throw new Error("Repair not found")
   if(before.status==="delivered")throw new Error("Delivered repair cannot be changed")
   if(before.karigarJobId)throw new Error("Metal is already issued for this repair")
   if(!(input.metalIssuedWt>0))throw new Error("Metal weight must be greater than zero")
   const job=await karigarsServiceDexie.issueJob({karigarId:input.karigarId,issuedDate:todayStr(),metalIssuedWt:input.metalIssuedWt,wastageAllowed:input.wastageAllowed,description:`Repair ${before.repairNo}`,repairId})
   const now=nowIso(),status:RepairStatus=before.status==="received"?"in_progress":before.status
   const patch:Partial<RepairJob>={karigarId:input.karigarId,karigarJobId:job.id,metalAddedWt:input.metalIssuedWt,metalAddedPurity:input.metalPurity??before.purity,metalAddedRate:input.metalRate,status,updatedBy:input.user,updatedAt:now}
   await db.repairs.update(repairId,patch)
   await db.repair_history.add({repairId,status,at:now,by:input.user,reason:`Issued ${input.metalIssuedWt}g to karigar (${job.jobNo})`})
   await db.audit_log.add({createdAt:now,user:input.user,action:"repair_issue_metal",entity:"repair",entityId:repairId,beforeJson:JSON.stringify(before),afterJson:JSON.stringify({...before,...patch})})
  })
 },
 /** Receive the finished piece back from the karigar: credits their ledger + posts
  * stock-in via the linked job, returns any recovered scrap to stock, marks the repair ready. */
 async receiveFromKarigar(repairId:number,input:{finishedWt:number;wastageAllowed:number;metalRecoveredWt?:number;user?:string}):Promise<void>{
  return db.transaction("rw",[db.repairs,db.repair_history,db.karigar_jobs,db.karigars,db.inventory_ledger,db.audit_log],async()=>{
   const before=await db.repairs.get(repairId);if(!before)throw new Error("Repair not found")
   if(!before.karigarJobId)throw new Error("No metal was issued for this repair")
   if(before.status==="delivered")throw new Error("Delivered repair cannot be changed")
   await karigarsServiceDexie.receiveJob(before.karigarJobId,input.finishedWt,input.wastageAllowed)
   const now=nowIso(),recovered=input.metalRecoveredWt??0
   if(recovered>0)await db.inventory_ledger.add({date:todayStr(),movement:"in",weight:recovered,refType:"repair_scrap",refId:repairId,refNo:before.repairNo,description:`Scrap recovered — ${before.description}`,createdAt:now})
   const patch:Partial<RepairJob>={metalRecoveredWt:recovered||undefined,status:"ready",updatedBy:input.user,updatedAt:now}
   await db.repairs.update(repairId,patch)
   await db.repair_history.add({repairId,status:"ready",at:now,by:input.user,reason:`Received from karigar (finished ${input.finishedWt}g${recovered?`, scrap +${recovered}g`:""})`})
   await db.audit_log.add({createdAt:now,user:input.user,action:"repair_receive_metal",entity:"repair",entityId:repairId,beforeJson:JSON.stringify(before),afterJson:JSON.stringify({...before,...patch})})
  })
 }
}

const salesReturnsServiceDexie = {
  getAll: (): Promise<SalesReturn[]> => db.sales_returns.orderBy("id").reverse().toArray(),
  getByInvoice: (invoiceId: number): Promise<SalesReturn[]> =>
    db.sales_returns.where("invoiceId").equals(invoiceId).toArray(),
  async create(input: SalesReturnDraft): Promise<SalesReturn> {
    return db.transaction("rw", [db.sales_returns, db.sales_return_items, db.sales_invoices, db.sales_items, db.items, db.inventory_ledger, db.audit_log, db.counters], async () => {
      const invoice = await db.sales_invoices.get(input.invoiceId)
      if (!invoice) throw new Error("Invoice not found")
      if (!input.items.length) throw new Error("Select at least one item")
      const original = await db.sales_items.where("invoiceId").equals(input.invoiceId).toArray()
      const previous = await db.sales_returns.where("invoiceId").equals(input.invoiceId).toArray()
      const previousLines = (await Promise.all(previous.map((r) => db.sales_return_items.where("returnId").equals(r.id!).toArray()))).flat()
      const selected: SalesReturnItem[] = []
      let lineGross = 0
      for (const row of input.items) {
        const source = original.find((x) => x.id === row.salesItemId)
        if (!source) throw new Error("An invoice item no longer exists")
        if (previousLines.some((x) => x.salesItemId === source.id)) throw new Error(`${source.description} was already returned`)
        const ratio = source.netWt > 0 ? Math.min(1, row.netWt / source.netWt) : 1
        const amount = round(source.finalAmount * ratio)
        lineGross = round(lineGross + amount)
        selected.push({ returnId: 0, salesItemId: source.id!, itemId: source.itemId, description: source.description, netWt: row.netWt, taxableAmount: amount, disposition: row.disposition })
      }
      const grossBase = invoice.totalGrossAmount || 1
      const taxableAmount = round(lineGross / grossBase * invoice.taxableAmount)
      const cgst = round(lineGross / grossBase * invoice.cgst)
      const sgst = round(lineGross / grossBase * invoice.sgst)
      const igst = round(lineGross / grossBase * (invoice.igst ?? 0))
      const totalAmount = round(taxableAmount + cgst + sgst + igst)
      if (input.refundAmount < 0 || input.refundAmount > totalAmount) throw new Error("Refund cannot exceed credit-note total")
      const { code: returnNo } = await nextSequence("sales_return", { prefix: "CRN" })
      const record: SalesReturn = { returnNo, invoiceId: invoice.id!, customerId: invoice.customerId, date: input.date, reason: input.reason, taxableAmount, cgst, sgst, igst, totalAmount, refundMode: input.refundMode, refundAmount: input.refundAmount, customerCredit: round(totalAmount - input.refundAmount), notes: input.notes, createdBy: input.createdBy, createdAt: nowIso() }
      const returnId = await db.sales_returns.add(record)
      await db.sales_return_items.bulkAdd(selected.map((x) => ({ ...x, returnId })))
      for (const row of selected) {
        if (row.itemId) {
          const status = row.disposition === "restock" ? "in_stock" : row.disposition === "melt" || row.disposition === "scrap" ? "melted" : "with_karigar"
          await db.items.update(row.itemId, { status, updatedAt: nowIso() })
          await db.inventory_ledger.add({ itemId: row.itemId, date: input.date, movement: "in", weight: row.netWt, refType: "sales_return", refId: returnId, refNo: returnNo, description: `Sales return — ${row.description}`, createdAt: nowIso() })
        }
      }
      await db.audit_log.add({ createdAt: nowIso(), user: input.createdBy, action: "create_credit_note", entity: "sales_return", entityId: returnId, reason: input.reason, afterJson: JSON.stringify(record) })
      return { ...record, id: returnId }
    })
  },
}

const salesServiceDexie = {
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
      [db.sales_invoices, db.sales_items, db.urd_items, db.items, db.counters, db.customers, db.orders, db.audit_log, db.inventory_ledger],
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
        // Mark any tagged stock as sold; log a weight-OUT for every line (tagged AND
        // loose/untagged silver/nathani) so the metal weight tally stays correct.
        for (const li of draft.items) {
          if (li.itemId) await db.items.update(li.itemId, { status: "sold" })
          if (li.netWt > 0) await db.inventory_ledger.add({itemId:li.itemId,date:header.date,movement:"out",weight:li.netWt,metalType:li.metal,category:li.category,value:li.finalAmount,refType:"sale",refId:invoiceId,refNo:invoiceNo,description:li.description,createdAt:nowIso()})
        }
        for(const u of draft.urd)await db.inventory_ledger.add({date:header.date,movement:"in",weight:u.netWt,metalType:u.type,category:"Old Gold",value:u.amount,refType:"urd",refId:invoiceId,refNo:invoiceNo,description:u.description,createdAt:nowIso()})
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
        if (draft.audit?.reason) await db.audit_log.add({ createdAt: nowIso(), user: draft.audit.user, action: "discount_override", entity: "sales_invoice", entityId: invoiceId, reason: draft.audit.reason, afterJson: JSON.stringify(header) })
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
      [db.sales_invoices, db.sales_items, db.urd_items, db.items, db.audit_log],
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
        await db.audit_log.add({ createdAt: nowIso(), user: draft.audit?.user, action: "edit_invoice", entity: "sales_invoice", entityId: id, reason: draft.audit?.reason, beforeJson: JSON.stringify(existing), afterJson: JSON.stringify(await db.sales_invoices.get(id)) })
        return (await db.sales_invoices.get(id))!
      },
    )
  },
  async cancelInvoice(id: number, context: { user?: string; reason: string }): Promise<void> {
    if (!context.reason.trim()) throw new Error("A cancellation reason is required")
    await db.transaction("rw", [db.sales_invoices, db.sales_items, db.items, db.customers, db.audit_log,db.inventory_ledger], async () => {
      const before=await db.sales_invoices.get(id); if(!before)throw new Error("Invoice not found"); if(before.cancelled)throw new Error("Invoice is already cancelled")
      const lines=await db.sales_items.where("invoiceId").equals(id).toArray(); for(const x of lines)if(x.itemId){await db.items.update(x.itemId,{status:"in_stock",updatedAt:nowIso()});await db.inventory_ledger.add({itemId:x.itemId,date:todayStr(),movement:"in",weight:x.netWt,refType:"invoice_cancel",refId:id,refNo:before.invoiceNo,description:x.description,createdAt:nowIso()})}
      const delta=(before.pointsEarned??0)-(before.pointsRedeemed??0); if(delta){const c=await db.customers.get(before.customerId);if(c)await db.customers.update(c.id!,{loyaltyPoints:Math.max(0,c.loyaltyPoints-delta)})}
      const patch={cancelled:true,cancelReason:context.reason,cancelledAt:nowIso(),cancelledBy:context.user,balance:0}; await db.sales_invoices.update(id,patch)
      await db.audit_log.add({createdAt:nowIso(),user:context.user,action:"cancel_invoice",entity:"sales_invoice",entityId:id,reason:context.reason,beforeJson:JSON.stringify(before),afterJson:JSON.stringify({...before,...patch})})
    })
  },
}

/* ------------------------------------------------------------------ */
/* Loans (Girvi)                                                      */
/* ------------------------------------------------------------------ */

const loansServiceDexie = {
  /** Active loans only — blocked (voided) loans are hidden everywhere by default. */
  getAll: (): Promise<Loan[]> => db.loans.orderBy("id").filter((l) => !l.blocked).reverse().toArray(),

  /** Blocked loans — surfaced only behind the owner "Blocked" tab. */
  getBlocked: (): Promise<Loan[]> => db.loans.orderBy("id").filter((l) => !!l.blocked).reverse().toArray(),

  get: (id: number): Promise<Loan | undefined> => db.loans.get(id),

  getOpen: (): Promise<Loan[]> =>
    db.loans.filter((l) => !l.isClosed && !l.blocked).reverse().toArray(),

  /** Soft-block (never delete) a wrongly-entered loan; keep it for audit. */
  async block(id: number, actor?: { user?: string; role?: UserRole; reason?: string }): Promise<void> { assertAllowed(actor?.role,"irreversible_stock"); const before=await db.loans.get(id); await db.loans.update(id,{blocked:true}); await auditServiceDexie.add({user:actor?.user,action:"block_loan",entity:"loan",entityId:id,reason:actor?.reason,beforeJson:JSON.stringify(before)}) },

  async unblock(id: number, actor?: { user?: string; role?: UserRole }): Promise<void> { assertAllowed(actor?.role,"irreversible_stock"); await db.loans.update(id,{blocked:false}); await auditServiceDexie.add({user:actor?.user,action:"unblock_loan",entity:"loan",entityId:id}) },

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

  getAllPayments: (): Promise<LoanPayment[]> => db.loan_payments.toArray(),

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

      // Allocate payment: interest first, then principal (clamped to what's owed).
      const towardsInterest = round(Math.min(payment.amount, interestDue))
      const towardsPrincipal = round(
        Math.min(payment.amount - towardsInterest, dues.principalOutstanding),
      )

      // On RENEWAL, interest the customer did NOT pay in cash is capitalised — rolled
      // into principal so it compounds from here on. Part/closure never capitalise.
      const interestShortfall = round(Math.max(0, interestDue - towardsInterest))
      const capitalisedInterest =
        payment.type === "renewal" ? interestShortfall : 0

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

      const id = await db.loan_payments.add(record)

      // Recompute post-payment state via the dues engine so capitalisation is
      // reflected consistently in principal/interest outstanding.
      const postDues = computeLoanDues(
        loan,
        [...payments, { ...record, id }],
        payment.date,
      )

      // A loan only closes when BOTH principal and interest are cleared — even a
      // "closure" payment that falls short must keep the loan open (don't release
      // collateral on an underpayment). Capitalisation never closes a loan.
      const fullyPaid =
        postDues.principalOutstanding <= 0 && postDues.interestOutstanding <= 0

      const totalCollected = round(
        payments.reduce((s, p) => s + p.amount, 0) + payment.amount,
      )

      // Only overwrite closure fields when actually closing; otherwise leave them.
      await db.loans.update(loanId, {
        principalOutstanding: postDues.principalOutstanding,
        isClosed: fullyPaid,
        ...(fullyPaid
          ? { closedDate: payment.date, amountCollected: totalCollected }
          : {}),
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

const karigarsServiceDexie = {
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
    return db.transaction("rw", [db.karigar_jobs, db.karigars, db.counters,db.inventory_ledger], async () => {
      const { code: jobNo } = await nextSequence("karigar_job", { prefix: "JOB" })
      const record: KarigarJob = {
        ...input,
        jobNo,
        finishedWt: 0,
        status: "issued",
        createdAt: nowIso(),
      }
      const id = await db.karigar_jobs.add(record)
      await db.inventory_ledger.add({date:input.issuedDate,movement:"out",weight:input.metalIssuedWt,refType:"karigar_issue",refId:id,refNo:jobNo,description:input.description,createdAt:nowIso()})
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
    return db.transaction("rw", [db.karigar_jobs, db.karigars,db.inventory_ledger], async () => {
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
      await db.inventory_ledger.add({date:todayStr(),movement:"in",weight:finishedWt,refType:"karigar_receive",refId:jobId,refNo:job.jobNo,description:job.description,createdAt:nowIso()})
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

const reportsServiceDexie = {
  async getDayBook(date: string = todayStr()): Promise<DayBookSummary> {
    const invoices = (await db.sales_invoices.where("date").equals(date).toArray()).filter((x) => !x.cancelled)
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

const suppliersServiceDexie = {
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

  /** Amount still owed to a supplier = opening + unpaid purchase balances − on-account payments. */
  async getOutstanding(supplierId: number): Promise<number> {
    const supplier = await db.suppliers.get(supplierId)
    if (!supplier) return 0
    const purchases = await db.purchase_invoices.where("supplierId").equals(supplierId).toArray()
    const payments = await db.purchase_payments.where("supplierId").equals(supplierId).toArray()
    const onAccount = payments.filter((p) => !p.purchaseId).reduce((s, p) => s + p.amount, 0)
    return round(
      supplier.openingBalance + purchases.reduce((s, p) => s + p.balance, 0) - onAccount,
    )
  },
}

/* ------------------------------------------------------------------ */
/* Vendor payments (against a purchase or on account)                 */
/* ------------------------------------------------------------------ */

const purchasePaymentsServiceDexie = {
  getAll: (): Promise<PurchasePayment[]> => db.purchase_payments.toArray(),

  getBySupplier: (supplierId: number): Promise<PurchasePayment[]> =>
    db.purchase_payments.where("supplierId").equals(supplierId).sortBy("id"),

  getByPurchase: (purchaseId: number): Promise<PurchasePayment[]> =>
    db.purchase_payments.where("purchaseId").equals(purchaseId).toArray(),

  /** Record a vendor payment; if tied to a purchase, settle that invoice's balance. Atomic. */
  async add(input: Omit<PurchasePayment, "id" | "createdAt">): Promise<PurchasePayment> {
    return db.transaction("rw", [db.purchase_payments, db.purchase_invoices], async () => {
      const pay: PurchasePayment = { ...input, createdAt: nowIso() }
      const id = await db.purchase_payments.add(pay)
      if (input.purchaseId) {
        const inv = await db.purchase_invoices.get(input.purchaseId)
        if (inv) {
          const amountPaid = round(inv.amountPaid + input.amount)
          await db.purchase_invoices.update(input.purchaseId, {
            amountPaid,
            balance: round(inv.netAmount - amountPaid),
          })
        }
      }
      return { ...pay, id }
    })
  },
}

/* ------------------------------------------------------------------ */
/* Purchase returns (reduce payable + ledger reversal)                */
/* ------------------------------------------------------------------ */

const purchaseReturnsServiceDexie = {
  getAll: (): Promise<PurchaseReturn[]> => db.purchase_returns.orderBy("id").reverse().toArray(),

  getBySupplier: (supplierId: number): Promise<PurchaseReturn[]> =>
    db.purchase_returns.where("supplierId").equals(supplierId).toArray(),

  async create(input: Omit<PurchaseReturn, "id" | "returnNo" | "createdAt">): Promise<PurchaseReturn> {
    return db.transaction(
      "rw",
      [db.purchase_returns, db.purchase_invoices, db.inventory_ledger, db.counters],
      async () => {
        const { code: returnNo } = await nextSequence("purchase_return", { prefix: "RET" })
        const record: PurchaseReturn = { ...input, returnNo, createdAt: nowIso() }
        const id = await db.purchase_returns.add(record)
        if (input.purchaseId) {
          const inv = await db.purchase_invoices.get(input.purchaseId)
          if (inv) {
            const netAmount = round(Math.max(0, inv.netAmount - input.amount))
            await db.purchase_invoices.update(input.purchaseId, {
              netAmount,
              balance: round(Math.max(0, netAmount - inv.amountPaid)),
            })
          }
        }
        await db.inventory_ledger.add({
          date: input.date,
          refType: "purchase_return",
          refId: id,
          refNo: returnNo,
          movement: "out",
          weight: input.weight ?? 0,
          description: `Purchase return ${returnNo} — ${input.reason}`,
          createdBy: input.createdBy,
          createdAt: nowIso(),
        })
        return { ...record, id }
      },
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

const purchaseServiceDexie = {
  getInvoices: (): Promise<PurchaseInvoice[]> =>
    db.purchase_invoices.orderBy("id").reverse().toArray(),

  getInvoicesByDate: (date: string): Promise<PurchaseInvoice[]> =>
    db.purchase_invoices.where("date").equals(date).toArray(),

  getLineItems: (purchaseId: number): Promise<PurchaseItem[]> =>
    db.purchase_items.where("purchaseId").equals(purchaseId).toArray(),

  async create(draft: PurchaseDraft): Promise<PurchaseInvoice> {
    return db.transaction(
      "rw",
      [db.purchase_invoices, db.purchase_items, db.counters,db.inventory_ledger],
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
        for(const li of draft.items)await db.inventory_ledger.add({date:header.date,movement:"in",weight:li.netWt,metalType:li.type,category:li.category,value:li.amount,refType:"purchase",refId:purchaseId,refNo:purchaseNo,description:`${li.description} · ${li.purity}`,createdAt:nowIso()})
        return { ...header, id: purchaseId }
      },
    )
  },
}

/* ------------------------------------------------------------------ */
/* Metal Refining (Ghalai)                                            */
/* ------------------------------------------------------------------ */

/** Fineness % parsed from an output purity label like "24K (999)" → 99.9. */
const finePctFromPurity = (purity: string): number | undefined => {
  const paren = purity.match(/\((\d{3})\)/)
  if (paren) return Number((Number(paren[1]) / 10).toFixed(2))
  const k = purity.match(/(\d{1,2})\s*K/i)
  if (k) return Number(((Number(k[1]) / 24) * 100).toFixed(2))
  return undefined
}

const refiningServiceDexie = {
  getAll: (): Promise<Refining[]> => db.refinings.orderBy("id").reverse().toArray(),

  get: (id: number): Promise<Refining | undefined> => db.refinings.get(id),

  /** Inventory-ledger rows tied to a refining job (melt-out + produce-in + any reversal). */
  getLedger: (refiningId: number): Promise<InventoryLedger[]> =>
    db.inventory_ledger.where("refId").equals(refiningId).sortBy("id"),

  /** Bullion produced by a refining job. */
  getBullion: (refiningId: number): Promise<BullionStock[]> =>
    db.bullion_stock.where("refiningId").equals(refiningId).toArray(),

  /**
   * Record a refining job as one atomic transaction: consume the source scrap,
   * mint the refined bullion (a GB-numbered bullion lot linked to a sellable
   * stock item), and write the inventory-ledger + bullion-movement audit trail.
   * A mid-failure can never orphan a melted item or leave a stray bullion.
   */
  async create(
    input: Omit<Refining, "id" | "refiningNo" | "createdAt" | "outputItemId">,
    opts: { addToStock?: boolean; outputCategory?: string; outputName?: string } = {},
  ): Promise<Refining> {
    return db.transaction(
      "rw",
      [
        db.refinings,
        db.items,
        db.counters,
        db.bullion_stock,
        db.bullion_movement,
        db.inventory_ledger,
      ],
      async () => {
        const { code: refiningNo } = await nextSequence("refining", { prefix: "REF" })
        const today = input.date

        // 1) Header first, so ledger/movement rows can reference its id.
        const createdAt = nowIso()
        const status = input.status ?? "completed"
        const headerId = await db.refinings.add({
          ...input,
          refiningNo,
          status,
          createdAt,
        } as Refining)

        // 2) Consume the source scrap (if tracked) + ledger OUT.
        if (input.sourceItemId) {
          const src = await db.items.get(input.sourceItemId)
          await db.items.update(input.sourceItemId, { status: "melted" })
          await db.inventory_ledger.add({
            date: today,
            itemId: input.sourceItemId,
            refType: "refining",
            refId: headerId,
            refNo: refiningNo,
            movement: "out",
            weight: src?.grossWt ?? input.inputWt,
            description: `Melted for refining ${refiningNo}`,
            statusFrom: src?.status ?? "in_stock",
            statusTo: "melted",
            createdBy: input.createdBy,
            createdAt: nowIso(),
          })
        }

        // 3) Produce bullion: sellable item + GB bullion lot + movement + ledger IN.
        let outputItemId: number | undefined
        let bullionNo: string | undefined
        if (opts.addToStock !== false && input.outputWt > 0) {
          const created = await itemsServiceDexie.add({
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
          bullionNo = (await nextSequence("bullion", { prefix: "GB", pad: 6 })).code
          const bullionId = await db.bullion_stock.add({
            bullionNo,
            type: input.type,
            purity: input.outputPurity,
            finePct: finePctFromPurity(input.outputPurity),
            weight: input.outputWt,
            refiningId: headerId,
            itemId: outputItemId,
            status: "in_stock",
            createdDate: today,
            createdBy: input.createdBy,
            createdAt: nowIso(),
          })
          await db.bullion_movement.add({
            bullionId,
            date: today,
            type: "produced",
            weight: input.outputWt,
            refType: "refining",
            refId: headerId,
            note: refiningNo,
            createdAt: nowIso(),
          })
          await db.inventory_ledger.add({
            date: today,
            itemId: outputItemId,
            bullionId,
            refType: "refining",
            refId: headerId,
            refNo: refiningNo,
            movement: "in",
            weight: input.outputWt,
            description: `Refined bullion ${bullionNo}`,
            statusTo: "in_stock",
            createdBy: input.createdBy,
            createdAt: nowIso(),
          })
        }

        // 4) Backfill the header with the produced references.
        await db.refinings.update(headerId, { outputItemId, bullionNo })
        return { ...input, refiningNo, status, createdAt, outputItemId, bullionNo, id: headerId } as Refining
      },
    )
  },

  /**
   * Reverse a completed job (never a hard delete): restore the melted source,
   * void the produced bullion + its stock item, and write reversing ledger and
   * movement entries. Blocked if the bullion has already been sold.
   */
  async reverse(refiningId: number, opts: { by?: string } = {}): Promise<void> {
    return db.transaction(
      "rw",
      [
        db.refinings,
        db.items,
        db.bullion_stock,
        db.bullion_movement,
        db.inventory_ledger,
      ],
      async () => {
        const ref = await db.refinings.get(refiningId)
        if (!ref) throw new Error("Refining job not found")
        if (ref.status === "reversed") throw new Error("This job is already reversed")

        const today = todayStr()

        // Guard: a sold bullion cannot be cleanly reversed.
        if (ref.outputItemId) {
          const item = await db.items.get(ref.outputItemId)
          if (item?.status === "sold") {
            throw new Error("The refined bullion has already been sold — cannot reverse")
          }
        }

        // Restore the source scrap.
        if (ref.sourceItemId) {
          await db.items.update(ref.sourceItemId, { status: "in_stock" })
          await db.inventory_ledger.add({
            date: today,
            itemId: ref.sourceItemId,
            refType: "refining_reversal",
            refId: refiningId,
            refNo: ref.refiningNo,
            movement: "in",
            weight: ref.inputWt,
            description: `Reversal of ${ref.refiningNo} — scrap restored`,
            statusFrom: "melted",
            statusTo: "in_stock",
            createdBy: opts.by,
            createdAt: nowIso(),
          })
        }

        // Void the produced bullion + its stock item.
        const bullions = await db.bullion_stock.where("refiningId").equals(refiningId).toArray()
        for (const b of bullions) {
          if (b.itemId) {
            const it = await db.items.get(b.itemId)
            if (it && it.status !== "sold") await db.items.delete(b.itemId)
          }
          await db.bullion_stock.update(b.id!, { status: "reversed" })
          await db.bullion_movement.add({
            bullionId: b.id!,
            date: today,
            type: "reversed",
            weight: -b.weight,
            refType: "refining_reversal",
            refId: refiningId,
            note: ref.refiningNo,
            createdAt: nowIso(),
          })
          await db.inventory_ledger.add({
            date: today,
            itemId: b.itemId,
            bullionId: b.id,
            refType: "refining_reversal",
            refId: refiningId,
            refNo: ref.refiningNo,
            movement: "out",
            weight: b.weight,
            description: `Reversal of ${ref.refiningNo} — bullion ${b.bullionNo} voided`,
            statusFrom: "in_stock",
            statusTo: "reversed",
            createdBy: opts.by,
            createdAt: nowIso(),
          })
        }

        await db.refinings.update(refiningId, {
          status: "reversed",
          reversedAt: nowIso(),
          reversedBy: opts.by,
        })
      },
    )
  },
}

/* ------------------------------------------------------------------ */
/* Refiners (internal team / external refinery master)                */
/* ------------------------------------------------------------------ */

const refinersServiceDexie = {
  /** Active refiners only — blocked ones are hidden from the picker & list. */
  getAll: (): Promise<Refiner[]> => db.refiners.orderBy("name").filter((r) => !r.blocked).toArray(),

  /** Blocked refiners — surfaced only behind the owner "Show blocked" toggle. */
  getBlocked: (): Promise<Refiner[]> => db.refiners.orderBy("name").filter((r) => !!r.blocked).toArray(),

  get: (id: number): Promise<Refiner | undefined> => db.refiners.get(id),

  async add(input: Omit<Refiner, "id" | "createdAt" | "updatedAt">): Promise<Refiner> {
    const record: Refiner = { ...input, createdAt: nowIso(), updatedAt: nowIso() }
    const id = await db.refiners.add(record)
    return { ...record, id }
  },

  update: (id: number, patch: Partial<Refiner>): Promise<void> =>
    db.refiners.update(id, { ...patch, updatedAt: nowIso() }).then(() => undefined),

  /** Soft-block (never delete): hide from active use, keep the record for audit. */
  async block(id: number, actor?: { user?: string; role?: UserRole; reason?: string }): Promise<void> { assertAllowed(actor?.role,"irreversible_stock"); const before=await db.refiners.get(id); await db.refiners.update(id,{blocked:true,updatedAt:nowIso()}); await auditServiceDexie.add({user:actor?.user,action:"block_refiner",entity:"refiner",entityId:id,reason:actor?.reason,beforeJson:JSON.stringify(before)}) },

  async unblock(id: number, actor?: { user?: string; role?: UserRole }): Promise<void> { assertAllowed(actor?.role,"irreversible_stock"); await db.refiners.update(id,{blocked:false,updatedAt:nowIso()}); await auditServiceDexie.add({user:actor?.user,action:"unblock_refiner",entity:"refiner",entityId:id}) },
}

/* ------------------------------------------------------------------ */
/* Customer Orders (custom-jewellery booking)                         */
/* ------------------------------------------------------------------ */

const ordersServiceDexie = {
  getAll: (): Promise<Order[]> => db.orders.orderBy("id").reverse().toArray(),

  get: (id: number): Promise<Order | undefined> => db.orders.get(id),

  /** Orders still open (not delivered/cancelled) — for linking Karigar jobs. */
  getOpen: (): Promise<Order[]> =>
    db.orders
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .reverse()
      .toArray(),

  async add(
    input: Omit<Order, "id" | "orderNo" | "status" | "createdAt">,
    opts: { status?: OrderStatus } = {},
  ): Promise<Order> {
    const { code: orderNo } = await nextSequence("order", { prefix: "ORD" })
    const status: OrderStatus = opts.status ?? "confirmed"
    const now = nowIso()
    const statusHistory = input.statusHistory ?? [
      { status, at: now, by: input.salesperson ?? input.createdBy },
    ]
    const record: Order = { ...input, orderNo, status, statusHistory, createdAt: now }
    const id = await db.orders.add(record)
    return { ...record, id }
  },

  async setStatus(
    id: number,
    status: OrderStatus,
    opts: { by?: string; remarks?: string } = {},
  ): Promise<void> {
    const o = await db.orders.get(id)
    if (!o) return
    const entry = { status, at: nowIso(), by: opts.by, remarks: opts.remarks }
    await db.orders.update(id, { status, statusHistory: [...(o.statusHistory ?? []), entry] })
  },

  getPayments: (orderId: number): Promise<OrderPayment[]> =>
    db.order_payments.where("orderId").equals(orderId).sortBy("id"),

  /** Record an advance against an order: recompute the total advance and, on the
   *  first advance, auto-advance the status to "advance_received". Atomic. */
  async addPayment(
    orderId: number,
    input: { date: string; amount: number; mode: PaymentMode; notes?: string; by?: string },
  ): Promise<OrderPayment> {
    return db.transaction("rw", [db.orders, db.order_payments], async () => {
      const order = await db.orders.get(orderId)
      if (!order) throw new Error("Order not found")
      const pay: OrderPayment = {
        orderId,
        date: input.date,
        amount: input.amount,
        mode: input.mode,
        notes: input.notes,
        createdBy: input.by,
        createdAt: nowIso(),
      }
      const id = await db.order_payments.add(pay)
      const all = await db.order_payments.where("orderId").equals(orderId).toArray()
      const advanceReceived = round(all.reduce((s, p) => s + p.amount, 0))
      const patch: Partial<Order> = { advanceReceived }
      if (["draft", "confirmed", "booked"].includes(order.status)) {
        patch.status = "advance_received"
        patch.statusHistory = [
          ...(order.statusHistory ?? []),
          { status: "advance_received", at: nowIso(), by: input.by, remarks: `Advance ₹${input.amount}` },
        ]
      }
      await db.orders.update(orderId, patch)
      return { ...pay, id }
    })
  },

  update: (id: number, patch: Partial<Order>): Promise<void> =>
    db.orders.update(id, patch).then(() => undefined),
}

/* ------------------------------------------------------------------ */
/* Gold Saving Schemes                                                */
/* ------------------------------------------------------------------ */

const schemesServiceDexie = {
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

  /** All scheme payments across accounts (for dashboard pool totals). */
  getAllPayments: (): Promise<SchemePayment[]> => db.scheme_payments.toArray(),

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
      const existing = await db.scheme_payments
        .where("accountId")
        .equals(accountId)
        .toArray()
      const paidNos = new Set(existing.map((p) => p.installmentNo))

      // Guard against double-pay; when no installment is given, fill the lowest
      // unpaid slot (handles gaps instead of blindly using count + 1).
      let actualInstallmentNo: number
      if (installmentNo != null) {
        if (paidNos.has(installmentNo)) {
          throw new Error(`Installment ${installmentNo} is already paid`)
        }
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

const ledgerServiceDexie = {
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
    const returns = await db.sales_returns.where("customerId").equals(customerId).toArray()

    // Build a chronological event list, then run the balance forward.
    type Ev = Omit<LedgerEntry, "balance">
    const events: Ev[] = []
    for (const inv of invoices.filter((x) => !x.cancelled)) {
      events.push({
        date: inv.date,
        ref: inv.invoiceNo,
        particulars: "Sales Invoice",
        debit: inv.netAmount,
        credit: 0,
      })
      const paid = round(inv.cashPaid + inv.upiPaid + (inv.paymentDetails ?? []).reduce((s, p) => s + p.amount, 0))
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
    for (const r of returns) {
      events.push({ date: r.date, ref: r.returnNo, particulars: `Sales return — ${r.reason}`, debit: r.refundAmount, credit: r.totalAmount })
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
      const inflow = round(inv.cashPaid + inv.upiPaid + (inv.paymentDetails ?? []).reduce((s, p) => s + p.amount, 0))
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
    const loans = (await db.loans.toArray()).filter((l) => !l.blocked)
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
    const vouchers = (await db.cash_vouchers.where("date").equals(date).toArray()).filter((v) => !v.blocked)
    for (const v of vouchers) rows.push({ date, ref: v.voucherNo, particulars: `${v.category} (${v.mode})`, inflow: v.kind === "receipt" ? v.amount : 0, outflow: v.kind === "payment" ? v.amount : 0 })
    const totalIn = round(rows.reduce((s, r) => s + r.inflow, 0))
    const totalOut = round(rows.reduce((s, r) => s + r.outflow, 0))
    return { rows, totalIn, totalOut, net: round(totalIn - totalOut) }
  },

  /** Daily metal weight tally: per metal & category, opening/in/out/closing (g) + ₹. */
  async metalTally(date: string): Promise<MetalTally> {
    const rows = (await db.inventory_ledger.toArray()).filter((r) => r.metalType)
    return computeMetalTally(rows, date)
  },

  /** GSTR-1 rows for a month ("YYYY-MM"), classified B2B (has GSTIN) vs B2C. */
  async gstr1(month: string): Promise<Gstr1Row[]> {
    const invoices = (await db.sales_invoices.toArray()).filter((i) =>
      i.date.startsWith(month) && !i.cancelled,
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

    // Resolve per-line quantity from the linked stock item (defaults to 1).
    const lineItemIds = [
      ...new Set(salesItems.map((s) => s.itemId).filter((x): x is number => x != null)),
    ]
    const stockItems = lineItemIds.length
      ? await db.items.where("id").anyOf(lineItemIds).toArray()
      : []
    const qtyById = new Map(stockItems.map((s) => [s.id!, s.quantity ?? 1]))

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
        const lineQty = item.itemId != null ? qtyById.get(item.itemId) ?? 1 : 1

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
      const outstanding = await customersServiceDexie.getOutstanding(cust.id!)
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

/* ------------------------------------------------------------------ */
/* Backend dispatch (Dexie ⇄ SQLite)                                   */
/* ------------------------------------------------------------------ */

/**
 * True only when the cutover is explicitly enabled AND we are in the Tauri
 * desktop runtime. Stays false on web and until desktop validation flips the
 * flag, so `dbService` keeps using the Dexie implementations below unchanged.
 */
const usingSqlite = SQLITE_CUTOVER_ENABLED && isTauri()

// Construct the SQLite services only when actually dispatching to them
// (constructing is side-effect-free, but there's no reason to on web).
const sqlite = usingSqlite ? makeSqliteServices(undefined, systemExecutor) : null

/**
 * Overlay the SQLite service over its Dexie counterpart when the cutover is on.
 * The spread keeps any Dexie-only helper that has no SQLite port yet, so callers
 * never hit an undefined method; when off, returns the Dexie service untouched.
 */
const pick = <T>(dexie: T, sqliteSvc: unknown): T =>
  sqlite && sqliteSvc ? ({ ...dexie, ...(sqliteSvc as object) } as T) : dexie

/**
 * Public per-service exports. These are the DISPATCHED versions: components that
 * `import { customersService }` etc. get SQLite when the cutover is enabled under
 * Tauri, and Dexie otherwise — so a single flag flip switches the whole app, not
 * just the `dbService` namespace. (The concrete Dexie impls are the *Dexie consts
 * above; systemDb/auth and maintenance stay Dexie.)
 */
export const itemsService = pick(itemsServiceDexie, sqlite?.itemsService)
export const customersService = pick(customersServiceDexie, sqlite?.customersService)
export const salesService = pick(salesServiceDexie, sqlite?.salesService)
export const salesReturnsService = pick(salesReturnsServiceDexie, sqlite?.salesReturnsService)
export const auditService = pick(auditServiceDexie, sqlite?.auditService)
export const operationsService = pick(operationsServiceDexie, sqlite?.operationsService)
export const repairsService = pick(repairsServiceDexie, sqlite?.repairsService)
export const metalStockService=pick(metalStockServiceDexie,sqlite?.metalStockService)
export const loansService = pick(loansServiceDexie, sqlite?.loansService)
export const karigarsService = pick(karigarsServiceDexie, sqlite?.karigarsService)
export const ordersService = pick(ordersServiceDexie, sqlite?.ordersService)
export const refiningService = pick(refiningServiceDexie, sqlite?.refiningService)
export const refinersService = pick(refinersServiceDexie, sqlite?.refinersService)
export const suppliersService = pick(suppliersServiceDexie, sqlite?.suppliersService)
export const purchaseService = pick(purchaseServiceDexie, sqlite?.purchaseService)
export const purchasePaymentsService = pick(purchasePaymentsServiceDexie, sqlite?.purchasePaymentsService)
export const purchaseReturnsService = pick(purchaseReturnsServiceDexie, sqlite?.purchaseReturnsService)
export const schemesService = pick(schemesServiceDexie, sqlite?.schemesService)
export const receiptsService = pick(receiptsServiceDexie, sqlite?.receiptsService)
export const ledgerService = pick(ledgerServiceDexie, sqlite?.ledgerService)
export const reportsService = pick(reportsServiceDexie, sqlite?.reportsService)

/** Convenience namespace re-export so callers can `import { dbService }`. */
export const dbService = {
  items: itemsService,
  customers: customersService,
  sales: salesService,
  salesReturns: salesReturnsService,
  audit: auditService,
  operations: operationsService,
  repairs: repairsService,
  metalStock:metalStockService,
  loans: loansService,
  karigars: karigarsService,
  orders: ordersService,
  refining: refiningService,
  refiners: refinersService,
  suppliers: suppliersService,
  purchases: purchaseService,
  schemes: schemesService,
  receipts: receiptsService,
  ledger: ledgerService,
  reports: reportsService,
  maintenance: maintenanceService,
  nextSequence: sqlite ? sqlite.nextSequence : nextSequence,
  todayStr,
  addMonths,
  computeNetWt,
}

export default dbService
