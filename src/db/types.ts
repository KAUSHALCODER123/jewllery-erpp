/**
 * Domain types for Jewel-ERP.
 *
 * These interfaces describe the persisted shape of every table. They are kept
 * deliberately free of any Dexie/IndexedDB specifics so that the same types can
 * back a SQLite store after the Electron/Tauri migration (Phase 2 of the
 * platform roadmap). Only `dbService.ts` knows which engine is in use.
 *
 * Conventions
 *  - All weights are stored in grams (number).
 *  - All monetary amounts are stored in INR (number, rupees — not paise).
 *  - All dates are stored as ISO-8601 strings ("YYYY-MM-DD" for day-level,
 *    full ISO for timestamps) so they sort lexicographically and survive a
 *    JSON/SQLite round-trip without timezone drift.
 *  - `id` is an auto-incrementing primary key; it is optional on insert.
 */

export type MetalType = "gold" | "silver" | "platinum" | "other"

export type PaymentMode = "cash" | "upi" | "card" | "cheque" | "credit"
export interface SalePaymentDetail {
  mode: "card" | "bank" | "cheque"
  amount: number
  reference?: string
}

/** A single piece of stock / jewellery item in the inventory. */
export interface Item {
  id?: number
  /** Human-scannable barcode tag, e.g. "RIN0001". Unique. */
  tag: string
  name: string
  type: MetalType
  /** Purity in karat/percent terms, e.g. "22K", "916", "92.5". */
  purity: string
  grossWt: number
  stoneWt: number
  /** Derived: grossWt - stoneWt. Persisted for fast querying. */
  netWt: number
  makingChargePerGm: number
  /** Hallmark Unique ID (mandatory for hallmarked gold in India). */
  huid?: string
  /** Harmonized System of Nomenclature code for tax reporting. */
  hsn?: string
  /** Optional category for filtering (Ring, Chain, Bangle...). */
  category?: string
  /** Quantity / pieces. Defaults to 1 for unique pieces. */
  quantity?: number
  /** Stock status — sold items are excluded from the active inventory grid. */
  status?: "in_stock" | "sold" | "melted" | "with_karigar"
  createdAt?: string
  updatedAt?: string
}

/** A customer / party. Balance is tracked separately via ledger entries. */
export interface Customer {
  id?: number
  name: string
  mobile: string
  address?: string
  city?: string
  email?: string
  /** PAN — required by law for cash jewellery sales above a threshold. */
  pan?: string
  aadhaar?: string
  /** GSTIN, for B2B customers. */
  gstin?: string
  /** ISO date strings — drive birthday / anniversary marketing reminders. */
  birthDate?: string
  anniversary?: string
  /** Positive = customer owes us (Udhari). Negative = advance with us. */
  openingBalance: number
  loyaltyPoints: number
  createdAt?: string
  updatedAt?: string
}

/** Header row of a sale. Line items live in `sales_items`. */
export interface SalesInvoice {
  id?: number
  /** Human-facing invoice number, e.g. "INV0001". */
  invoiceNo: string
  customerId: number
  /** ISO date string ("YYYY-MM-DD"). */
  date: string
  /** Sum of all new-item line amounts (before tax). */
  totalGrossAmount: number
  /** Value of old gold / scrap taken in part-exchange (URD). Subtracted. */
  totalUrdAmount: number
  /** Flat discount on the bill value (before tax). */
  billDiscount?: number
  /** Discount specifically on making charges (before tax). */
  makingDiscount?: number
  /** Taxable value after URD + discounts. */
  taxableAmount: number
  cgst: number
  sgst: number
  /** Integrated GST — non-zero only for inter-state (vs CGST+SGST). */
  igst?: number
  /** Tax Collected at Source amount. */
  tcs?: number
  /** True when the sale is inter-state (IGST applies instead of CGST/SGST). */
  interState?: boolean
  /** Salesperson who made the sale. */
  salesman?: string
  /** Discount funded by redeeming loyalty points (before tax). */
  loyaltyDiscount?: number
  /** Loyalty points earned on / redeemed against this sale. */
  pointsEarned?: number
  pointsRedeemed?: number
  /** Grand total payable = taxableAmount + GST + TCS. */
  netAmount: number
  cashPaid: number
  upiPaid: number
  /** Additional structured payments; cash/UPI remain first-class for compatibility. */
  paymentDetails?: SalePaymentDetail[]
  /** netAmount - (cashPaid + upiPaid). Positive => customer still owes. */
  balance: number
  notes?: string
  orderId?: number
  advanceApplied?: number
  createdAt?: string
  cancelled?: boolean
  cancelReason?: string
  cancelledAt?: string
  cancelledBy?: string
}

/** A single new-jewellery line on a sales invoice. */
export interface SalesItem {
  id?: number
  invoiceId: number
  itemId?: number
  /** Snapshot of the item description at time of sale. */
  description: string
  netWt: number
  /** Metal rate per gram applied to this line. */
  rate: number
  makingAmount: number
  /** Harmonized System of Nomenclature code for tax reporting. */
  hsn?: string
  /** rate * netWt + makingAmount (line total before tax). */
  finalAmount: number
}

export type ReturnDisposition = "restock" | "repair" | "melt" | "scrap"

/** Numbered GST credit note raised against an immutable sales invoice. */
export interface SalesReturn {
  id?: number
  returnNo: string
  invoiceId: number
  customerId: number
  date: string
  reason: string
  taxableAmount: number
  cgst: number
  sgst: number
  igst: number
  totalAmount: number
  refundMode?: PaymentMode
  refundAmount: number
  customerCredit: number
  notes?: string
  createdBy?: string
  createdAt?: string
}

export interface SalesReturnItem {
  id?: number
  returnId: number
  salesItemId: number
  itemId?: number
  description: string
  netWt: number
  taxableAmount: number
  disposition: ReturnDisposition
}

/** Append-only record of sensitive business mutations. */
export interface AuditEntry {
  id?: number
  createdAt: string
  user?: string
  action: string
  entity: string
  entityId?: number
  reason?: string
  beforeJson?: string
  afterJson?: string
}

export interface DailyMetalRate {
  id?: number
  date: string
  effectiveAt: string
  gold24k: number
  gold22k: number
  gold18k: number
  silver: number
  oldGoldBuy22k: number
  notes?: string
  createdBy?: string
  createdAt?: string
}

export interface CashVoucher {
  id?: number
  voucherNo: string
  date: string
  kind: "payment" | "receipt"
  category: string
  mode: Exclude<PaymentMode, "credit">
  amount: number
  party?: string
  reference?: string
  notes?: string
  createdBy?: string
  createdAt?: string
}

export interface DayClosing {
  id?: number
  date: string
  openingCash: number
  expectedCash: number
  physicalCash: number
  difference: number
  notes?: string
  closedBy?: string
  closedAt: string
}

export type RepairStatus = "received" | "in_progress" | "ready" | "delivered" | "cancelled"
export interface RepairJob {
  id?: number; repairNo:string; customerId:number; receivedDate:string; promisedDate?:string
  description:string; condition?:string; grossWt?:number; purity?:string; image?:string
  estimatedAmount:number; advanceAmount:number; finalAmount?:number; workNotes?:string
  status:RepairStatus; deliveredDate?:string; createdBy?:string; updatedBy?:string
  createdAt?:string; updatedAt?:string
  /** Goldsmith assigned to do the repair, and the metal-issue job raised for them. */
  karigarId?:number; karigarJobId?:number
  /** Extra metal supplied for the repair (added to the piece) + its billing rate ₹/g. */
  metalAddedWt?:number; metalAddedPurity?:string; metalAddedRate?:number
  /** Scrap metal cut off during the repair and recovered back into shop stock. */
  metalRecoveredWt?:number
}
export interface RepairHistory { id?:number; repairId:number; status:RepairStatus; at:string; by?:string; reason?:string }

/** A single old-gold / scrap line received in part-exchange on an invoice. */
export interface UrdItem {
  id?: number
  invoiceId: number
  description: string
  type: MetalType
  purity: string
  grossWt: number
  /** Deduction for impurities/melting. */
  deductionWt: number
  netWt: number
  rate: number
  /** rate * netWt (value credited to the customer). */
  amount: number
}

/** A pledged item inside a Girvi (gold loan), stored as JSON on the loan. */
export interface PledgedItem {
  description: string
  grossWt: number
  netWt: number
  purity: string
  estimatedValue: number
}

/** Girvi — a gold loan against pledged collateral. */
export interface Loan {
  id?: number
  /** Human-facing loan/Pavati number, e.g. "GRV0001". */
  loanNo: string
  customerId: number
  /** ISO date string. */
  date: string
  itemsPledged: PledgedItem[]
  grossWt: number
  netWt: number
  loanAmount: number
  /** Monthly interest rate in percent, e.g. 2 for 2%/month. */
  interestRate: number
  /** Base64 data-URL of the collateral photo (offline-friendly). */
  collateralImage?: string
  /** Base64 data-URL of the borrower thumbprint (offline-friendly). */
  collateralThumbprint?: string
  /** Interest calculation mode: ceil-month vs day-wise accrual. */
  interestMode?: "monthly" | "daywise"
  /** Current remaining principal amount on the loan. */
  principalOutstanding?: number
  isClosed: boolean
  closedDate?: string
  /** Interest + principal collected at closure. */
  amountCollected?: number
  createdAt?: string
}

export interface LoanPayment {
  id?: number
  loanId: number
  date: string
  amount: number
  towardsInterest: number
  towardsPrincipal: number
  /** Interest rolled into principal at a renewal (compounding). Not a cash receipt. */
  capitalisedInterest?: number
  type: "part" | "renewal" | "closure"
  notes?: string
}

/** A goldsmith / craftsman who receives metal and returns finished pieces. */
export interface Karigar {
  id?: number
  name: string
  mobile?: string
  /** Running metal balance owed by the karigar to the shop, in grams. */
  metalBalanceWt: number
  createdAt?: string
}

export type KarigarJobStatus = "issued" | "received" | "closed"

/** A metal-issue / finished-goods job tracked against a karigar. */
export interface KarigarJob {
  id?: number
  jobNo: string
  karigarId: number
  /** ISO date string of issue. */
  issuedDate: string
  /** Raw metal weight handed to the karigar (debit on their ledger). */
  metalIssuedWt: number
  /** Weight of the finished item returned. */
  finishedWt: number
  /** Allowed wastage percentage used to reconcile the metal ledger. */
  wastageAllowed: number
  /** Description of the work / item ordered. */
  description?: string
  /** Optional link to the customer order this job fulfils. */
  orderId?: number
  /** Optional link to the repair this job supplies metal for. */
  repairId?: number
  status: KarigarJobStatus
  receivedDate?: string
  createdAt?: string
}

/** A vendor / wholesaler the shop buys stock from. */
export interface Supplier {
  id?: number
  name: string
  mobile?: string
  email?: string
  gstin?: string
  pan?: string
  address?: string
  city?: string
  state?: string
  bankName?: string
  bankAccount?: string
  bankIfsc?: string
  /** Max credit the shop is comfortable owing this vendor. */
  creditLimit?: number
  /** Free-text terms, e.g. "30 days", "on delivery". */
  paymentTerms?: string
  /** 0–5 vendor rating. */
  rating?: number
  status?: "active" | "inactive"
  notes?: string
  /** Positive = shop owes the supplier. */
  openingBalance: number
  createdAt?: string
  updatedAt?: string
}

/** A return of purchased goods to a vendor (reduces payable + stock). */
export interface PurchaseReturn {
  id?: number
  returnNo: string
  purchaseId?: number
  supplierId: number
  date: string
  amount: number
  weight?: number
  reason: string
  notes?: string
  createdBy?: string
  createdAt?: string
}

/** A payment made to a vendor — against a specific purchase or on account. */
export interface PurchasePayment {
  id?: number
  supplierId: number
  /** The purchase this payment settles; absent = on-account payment. */
  purchaseId?: number
  date: string
  amount: number
  mode: PaymentMode
  notes?: string
  createdBy?: string
  createdAt?: string
}

/** Header of a purchase from a supplier. */
export interface PurchaseInvoice {
  id?: number
  purchaseNo: string
  /** Supplier's own bill number. */
  billNo?: string
  supplierId: number
  date: string
  totalGrossAmount: number
  cgst: number
  sgst: number
  netAmount: number
  amountPaid: number
  /** netAmount - amountPaid. Positive => shop still owes the supplier. */
  balance: number
  /** Kind of purchase (jewellery, bullion, silver, old gold…). */
  purchaseType?: string
  /** How the payment was / will be made. */
  paymentMode?: PaymentMode
  /** Day's gold rate the lines were priced at (₹/g). */
  goldRate?: number
  notes?: string
  createdAt?: string
}

/** A single purchased-item line. */
export interface PurchaseItem {
  id?: number
  purchaseId: number
  description: string
  type: MetalType
  purity: string
  grossWt: number
  /** Stone/other weight deducted from gross to get net metal weight. */
  stoneWt?: number
  netWt: number
  /** Pure metal content = netWt × fineness(purity). */
  pureGoldWt?: number
  rate: number
  makingAmount: number
  stoneCost?: number
  otherCharges?: number
  discount?: number
  /** Landed cost per gram of net weight. */
  costPerGram?: number
  huid?: string
  hallmark?: string
  /** rate × netWt + making + stone + other − discount (line total before tax). */
  amount: number
}

/** A gold saving scheme definition (template). */
export interface Scheme {
  id?: number
  code: string
  name: string
  /** Fixed monthly installment amount. */
  monthlyAmount: number
  /** Number of installments the customer pays. */
  durationMonths: number
  /** Bonus the shop adds at maturity, expressed in extra installments. */
  bonusMonths: number
  notes?: string
  createdAt?: string
}

export type SchemeAccountStatus = "active" | "matured" | "redeemed"

/** A customer's enrolment in a scheme. */
export interface SchemeAccount {
  id?: number
  accountNo: string
  schemeId: number
  customerId: number
  startDate: string
  status: SchemeAccountStatus
  createdAt?: string
}

/** A single installment paid into a scheme account. */
export interface SchemePayment {
  id?: number
  accountId: number
  installmentNo: number
  date: string
  amount: number
  mode: PaymentMode
  dueDate?: string
}

export interface SchemeScheduleRow {
  installmentNo: number
  dueDate: string
  amount: number
  paid: boolean
  paidOn?: string
  mode?: PaymentMode
  paymentId?: number
}

/** A single design line on a custom order. */
export interface OrderItem {
  description: string
  purity: string
  grossWt: number
  netWt: number
  makingPerGm: number
  notes?: string
  /** Optional type-specific measurements / details (progressive disclosure). */
  size?: string
  length?: string
  stoneDetails?: string
  engraving?: string
}

/** Kind of order — drives which fields matter and how it's fulfilled. */
export type OrderType =
  | "custom"
  | "ready_stock"
  | "repair"
  | "alteration"
  | "bridal"
  | "exchange"
  | "consignment"

/**
 * The full booking → delivery workflow. Legacy "booked" is kept as an alias for
 * "confirmed" so orders created before the Phase-1 redesign still render.
 */
export type OrderStatus =
  | "draft"
  | "confirmed"
  | "advance_received"
  | "gold_reserved"
  | "assigned_workshop"
  | "in_production"
  | "stone_setting"
  | "polishing"
  | "quality_check"
  | "ready"
  | "invoiced"
  | "delivered"
  | "cancelled"
  | "booked"

/** One entry in an order's status timeline (who moved it, when, why). */
export interface OrderStatusEntry {
  status: OrderStatus
  at: string
  by?: string
  remarks?: string
}

/** A customer's jewellery order, booked before production/delivery. */
export interface Order {
  id?: number
  orderNo: string
  customerId: number
  date: string
  deliveryDate?: string
  orderType?: OrderType
  salesperson?: string
  priority?: "normal" | "urgent"
  items: OrderItem[]
  /** Quoted estimate for the finished order (incl. GST) — the headline total. */
  estimatedAmount: number
  /** Pricing breakdown (auto-calculated; optional for legacy rows). */
  goldRate?: number
  goldValue?: number
  makingCharges?: number
  stoneCharges?: number
  otherCharges?: number
  discount?: number
  gstRate?: number
  gstAmount?: number
  goldCostRate?: number
  estimatedProfit?: number
  advanceReceived: number
  advanceMode: PaymentMode
  status: OrderStatus
  /** Visual-timeline backing store — appended on every status change. */
  statusHistory?: OrderStatusEntry[]
  notes?: string
  invoiceId?: number
  createdBy?: string
  createdAt?: string
}

/** An advance payment received against a specific order (many per order). */
export interface OrderPayment {
  id?: number
  orderId: number
  date: string
  amount: number
  mode: PaymentMode
  notes?: string
  createdBy?: string
  createdAt?: string
}

/**
 * A standalone payment received from a customer against their running balance
 * (Udhari collection) — not tied to a specific invoice. Reduces what they owe.
 */
export interface Receipt {
  id?: number
  receiptNo: string
  customerId: number
  date: string
  amount: number
  mode: PaymentMode
  notes?: string
  createdAt?: string
}

/**
 * A metal refining (Ghalai) job: scrap/old metal is melted into pure bullion.
 * Consumes the scrap (marked melted) and produces a refined-metal stock item.
 */
export interface Refining {
  id?: number
  refiningNo: string
  date: string
  refinerName?: string
  /** Source stock item that was melted (optional — may be untracked scrap). */
  sourceItemId?: number
  description: string
  type: MetalType
  /** Input gross weight sent for refining. */
  inputWt: number
  /** Karat label the input fineness was picked from (e.g. "22K"), if any. */
  inputKarat?: string
  /** Fineness of the input metal as a percentage (e.g. 91.6 for 22K). */
  inputFinePct: number
  /** Pure metal content of the input = inputWt × inputFinePct/100. */
  pureGoldWt?: number
  /** Extra loss during melting, percent. */
  refiningLossPct: number
  /** Weight lost in refining = pureGoldWt × refiningLossPct/100. */
  lossWt?: number
  /** Actual pure metal weight received back (= pureGoldWt − lossWt). */
  outputWt: number
  /** Recovery % of the job = outputWt ÷ inputWt × 100. */
  recoveryPct?: number
  /** Purity of the output (e.g. "24K (999)"). */
  outputPurity: string
  /** Kind of scrap refined (old jewellery, casting scrap, polishing dust…). */
  scrapType?: string
  /** Refiner (internal team or external refinery) who processed the job. */
  refinerId?: number
  /** Refining-charge basis and its computed cost (accounting). */
  chargeType?: "per_gram" | "flat" | "percentage"
  chargeRate?: number
  chargeAmount?: number
  chargeGstPct?: number
  chargeGstAmount?: number
  totalCharge?: number
  /** The refined-bullion stock item created from this job. */
  outputItemId?: number
  /** Bullion number (GB000001) produced by this job. */
  bullionNo?: string
  /** Lifecycle: a reversed job is kept for audit but its movements are undone. */
  status?: "completed" | "reversed"
  /** When the job was reversed, and by whom (audit trail). */
  reversedAt?: string
  reversedBy?: string
  /** Name of the user who recorded the job (audit trail). */
  createdBy?: string
  notes?: string
  createdAt?: string
}

/**
 * A refiner — either an internal melting team or an external refinery — used by
 * the Refining module. Stores default charges so picking a refiner pre-fills the
 * charge basis on a new job.
 */
export interface Refiner {
  id?: number
  name: string
  /** "internal" (own workshop) or "external" (outside refinery). */
  kind: "internal" | "external"
  contact?: string
  address?: string
  /** Default charge basis applied when this refiner is chosen. */
  chargeType?: "per_gram" | "flat" | "percentage"
  chargeRate?: number
  /** Default GST % on the refining charge. */
  gstPct?: number
  notes?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * A refined-bullion bar/lot produced by the Refining module. Numbered GB000001…
 * It links to a sellable `items` row (so bullion is usable at the counter and in
 * karigar issues) while carrying its own provenance back to the refining batch.
 */
export interface BullionStock {
  id?: number
  bullionNo: string
  type: MetalType
  purity: string
  finePct?: number
  /** Current weight in grams. */
  weight: number
  /** Refining batch that produced this bullion. */
  refiningId?: number
  /** Linked sellable stock item (POS/karigar integration). */
  itemId?: number
  status: "in_stock" | "consumed" | "sold" | "reversed"
  /** Date the bullion was produced (ISO day). */
  createdDate: string
  createdBy?: string
  createdAt?: string
}

/** A weight movement on a bullion lot (produced / consumed / sold / reversed). */
export interface BullionMovement {
  id?: number
  bullionId: number
  date: string
  type: "produced" | "consumed" | "sold" | "adjusted" | "reversed"
  /** Signed grams: + adds, − removes. */
  weight: number
  /** Source of the movement, e.g. "refining", "refining_reversal", "sale". */
  refType?: string
  refId?: number
  note?: string
  createdAt?: string
}

/**
 * Unified inventory movement log — the single audit trail of stock/bullion
 * weight moving in or out, written by refining today (and other modules later).
 */
export interface InventoryLedger {
  id?: number
  date: string
  /** Affected stock item, if any. */
  itemId?: number
  /** Affected bullion lot, if any. */
  bullionId?: number
  /** e.g. "refining", "refining_reversal". */
  refType: string
  refId?: number
  /** Human-readable reference (e.g. REF0001). */
  refNo?: string
  movement: "in" | "out"
  /** Grams (always positive; direction is in `movement`). */
  weight: number
  description?: string
  statusFrom?: string
  statusTo?: string
  createdBy?: string
  createdAt?: string
}

/** Named monotonic counters used to mint sequential document numbers. */
export interface Counter {
  /** e.g. "item:RIN", "invoice", "loan", "karigar_job". */
  key: string
  value: number
}
