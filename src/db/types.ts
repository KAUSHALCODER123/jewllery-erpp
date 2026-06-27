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
  /** netAmount - (cashPaid + upiPaid). Positive => customer still owes. */
  balance: number
  notes?: string
  orderId?: number
  advanceApplied?: number
  createdAt?: string
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
  status: KarigarJobStatus
  receivedDate?: string
  createdAt?: string
}

/** A vendor / wholesaler the shop buys stock from. */
export interface Supplier {
  id?: number
  name: string
  mobile?: string
  gstin?: string
  address?: string
  city?: string
  /** Positive = shop owes the supplier. */
  openingBalance: number
  createdAt?: string
  updatedAt?: string
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
  netWt: number
  rate: number
  makingAmount: number
  /** rate × netWt + making (line total before tax). */
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
}

export type OrderStatus =
  | "booked"
  | "in_production"
  | "ready"
  | "delivered"
  | "cancelled"

/** A customer's custom-jewellery order, booked before production. */
export interface Order {
  id?: number
  orderNo: string
  customerId: number
  date: string
  deliveryDate?: string
  items: OrderItem[]
  /** Quoted estimate for the finished order. */
  estimatedAmount: number
  advanceReceived: number
  advanceMode: PaymentMode
  status: OrderStatus
  notes?: string
  invoiceId?: number
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
  /** Fineness of the input metal as a percentage (e.g. 91.6 for 22K). */
  inputFinePct: number
  /** Extra loss during melting, percent. */
  refiningLossPct: number
  /** Actual pure metal weight received back. */
  outputWt: number
  /** Purity of the output (e.g. "24K (999)"). */
  outputPurity: string
  /** The refined-bullion stock item created from this job. */
  outputItemId?: number
  notes?: string
  createdAt?: string
}

/** Named monotonic counters used to mint sequential document numbers. */
export interface Counter {
  /** e.g. "item:RIN", "invoice", "loan", "karigar_job". */
  key: string
  value: number
}
