-- Jewel-ERP initial SQLite schema.
-- Mirrors the Dexie/IndexedDB tables (src/db/types.ts + src/db/systemDb.ts).
-- Conventions: weights in grams (REAL), money in INR rupees (REAL), dates as
-- ISO-8601 TEXT, booleans as INTEGER (0/1), JSON blobs as TEXT.
-- NOTE: this baseline keeps business + system tables in one file (single firm).
-- Multi-firm isolation (one DB file per company) is a follow-up; see sqlite.ts.

PRAGMA foreign_keys = ON;

-- ---------- Inventory ----------
CREATE TABLE IF NOT EXISTS items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tag               TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  purity            TEXT NOT NULL,
  grossWt           REAL NOT NULL DEFAULT 0,
  stoneWt           REAL NOT NULL DEFAULT 0,
  netWt             REAL NOT NULL DEFAULT 0,
  makingChargePerGm REAL NOT NULL DEFAULT 0,
  huid              TEXT,
  hsn               TEXT,
  category          TEXT,
  quantity          INTEGER DEFAULT 1,
  status            TEXT DEFAULT 'in_stock',
  createdAt         TEXT,
  updatedAt         TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_huid ON items(huid);

-- ---------- Customers ----------
CREATE TABLE IF NOT EXISTS customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  mobile         TEXT NOT NULL,
  address        TEXT,
  city           TEXT,
  email          TEXT,
  pan            TEXT,
  aadhaar        TEXT,
  gstin          TEXT,
  birthDate      TEXT,
  anniversary    TEXT,
  openingBalance REAL NOT NULL DEFAULT 0,
  loyaltyPoints  REAL NOT NULL DEFAULT 0,
  createdAt      TEXT,
  updatedAt      TEXT
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_pan ON customers(pan);

-- ---------- Sales ----------
CREATE TABLE IF NOT EXISTS sales_invoices (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceNo        TEXT NOT NULL UNIQUE,
  customerId       INTEGER NOT NULL,
  date             TEXT NOT NULL,
  totalGrossAmount REAL NOT NULL DEFAULT 0,
  totalUrdAmount   REAL NOT NULL DEFAULT 0,
  billDiscount     REAL,
  makingDiscount   REAL,
  taxableAmount    REAL NOT NULL DEFAULT 0,
  cgst             REAL NOT NULL DEFAULT 0,
  sgst             REAL NOT NULL DEFAULT 0,
  igst             REAL,
  tcs              REAL,
  interState       INTEGER,
  salesman         TEXT,
  loyaltyDiscount  REAL,
  pointsEarned     REAL,
  pointsRedeemed   REAL,
  netAmount        REAL NOT NULL DEFAULT 0,
  cashPaid         REAL NOT NULL DEFAULT 0,
  upiPaid          REAL NOT NULL DEFAULT 0,
  balance          REAL NOT NULL DEFAULT 0,
  notes            TEXT,
  orderId          INTEGER,
  advanceApplied   REAL,
  createdAt        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sinv_customer ON sales_invoices(customerId);
CREATE INDEX IF NOT EXISTS idx_sinv_date ON sales_invoices(date);

CREATE TABLE IF NOT EXISTS sales_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceId    INTEGER NOT NULL,
  itemId       INTEGER,
  description  TEXT NOT NULL,
  netWt        REAL NOT NULL DEFAULT 0,
  rate         REAL NOT NULL DEFAULT 0,
  makingAmount REAL NOT NULL DEFAULT 0,
  hsn          TEXT,
  finalAmount  REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sitem_invoice ON sales_items(invoiceId);
CREATE INDEX IF NOT EXISTS idx_sitem_item ON sales_items(itemId);

CREATE TABLE IF NOT EXISTS urd_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceId   INTEGER NOT NULL,
  description TEXT NOT NULL,
  type        TEXT NOT NULL,
  purity      TEXT NOT NULL,
  grossWt     REAL NOT NULL DEFAULT 0,
  deductionWt REAL NOT NULL DEFAULT 0,
  netWt       REAL NOT NULL DEFAULT 0,
  rate        REAL NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_urd_invoice ON urd_items(invoiceId);

-- ---------- Girvi (gold loans) ----------
CREATE TABLE IF NOT EXISTS loans (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  loanNo                TEXT NOT NULL UNIQUE,
  customerId            INTEGER NOT NULL,
  date                  TEXT NOT NULL,
  itemsPledged          TEXT NOT NULL DEFAULT '[]',
  grossWt               REAL NOT NULL DEFAULT 0,
  netWt                 REAL NOT NULL DEFAULT 0,
  loanAmount            REAL NOT NULL DEFAULT 0,
  interestRate          REAL NOT NULL DEFAULT 0,
  collateralImage       TEXT,
  collateralThumbprint  TEXT,
  interestMode          TEXT,
  principalOutstanding  REAL,
  isClosed              INTEGER NOT NULL DEFAULT 0,
  closedDate            TEXT,
  amountCollected       REAL,
  createdAt             TEXT
);
CREATE INDEX IF NOT EXISTS idx_loans_customer ON loans(customerId);
CREATE INDEX IF NOT EXISTS idx_loans_date ON loans(date);
CREATE INDEX IF NOT EXISTS idx_loans_closed ON loans(isClosed);

CREATE TABLE IF NOT EXISTS loan_payments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  loanId              INTEGER NOT NULL,
  date                TEXT NOT NULL,
  amount              REAL NOT NULL DEFAULT 0,
  towardsInterest     REAL NOT NULL DEFAULT 0,
  towardsPrincipal    REAL NOT NULL DEFAULT 0,
  capitalisedInterest REAL,
  type                TEXT NOT NULL,
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_lpay_loan ON loan_payments(loanId);
CREATE INDEX IF NOT EXISTS idx_lpay_date ON loan_payments(date);
CREATE INDEX IF NOT EXISTS idx_lpay_type ON loan_payments(type);

-- ---------- Karigar (goldsmith) ----------
CREATE TABLE IF NOT EXISTS karigars (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  mobile         TEXT,
  metalBalanceWt REAL NOT NULL DEFAULT 0,
  createdAt      TEXT
);
CREATE INDEX IF NOT EXISTS idx_karigars_name ON karigars(name);

CREATE TABLE IF NOT EXISTS karigar_jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  jobNo          TEXT NOT NULL UNIQUE,
  karigarId      INTEGER NOT NULL,
  issuedDate     TEXT NOT NULL,
  metalIssuedWt  REAL NOT NULL DEFAULT 0,
  finishedWt     REAL NOT NULL DEFAULT 0,
  wastageAllowed REAL NOT NULL DEFAULT 0,
  description    TEXT,
  orderId        INTEGER,
  status         TEXT NOT NULL,
  receivedDate   TEXT,
  createdAt      TEXT
);
CREATE INDEX IF NOT EXISTS idx_kjob_karigar ON karigar_jobs(karigarId);
CREATE INDEX IF NOT EXISTS idx_kjob_status ON karigar_jobs(status);
CREATE INDEX IF NOT EXISTS idx_kjob_issued ON karigar_jobs(issuedDate);

-- ---------- Purchases / suppliers ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  mobile         TEXT,
  gstin          TEXT,
  address        TEXT,
  city           TEXT,
  openingBalance REAL NOT NULL DEFAULT 0,
  createdAt      TEXT,
  updatedAt      TEXT
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  purchaseNo       TEXT NOT NULL UNIQUE,
  billNo           TEXT,
  supplierId       INTEGER NOT NULL,
  date             TEXT NOT NULL,
  totalGrossAmount REAL NOT NULL DEFAULT 0,
  cgst             REAL NOT NULL DEFAULT 0,
  sgst             REAL NOT NULL DEFAULT 0,
  netAmount        REAL NOT NULL DEFAULT 0,
  amountPaid       REAL NOT NULL DEFAULT 0,
  balance          REAL NOT NULL DEFAULT 0,
  notes            TEXT,
  createdAt        TEXT
);
CREATE INDEX IF NOT EXISTS idx_pinv_supplier ON purchase_invoices(supplierId);
CREATE INDEX IF NOT EXISTS idx_pinv_date ON purchase_invoices(date);

CREATE TABLE IF NOT EXISTS purchase_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  purchaseId   INTEGER NOT NULL,
  description  TEXT NOT NULL,
  type         TEXT NOT NULL,
  purity       TEXT NOT NULL,
  grossWt      REAL NOT NULL DEFAULT 0,
  netWt        REAL NOT NULL DEFAULT 0,
  rate         REAL NOT NULL DEFAULT 0,
  makingAmount REAL NOT NULL DEFAULT 0,
  amount       REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pitem_purchase ON purchase_items(purchaseId);

-- ---------- Gold saving schemes ----------
CREATE TABLE IF NOT EXISTS schemes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  monthlyAmount  REAL NOT NULL DEFAULT 0,
  durationMonths INTEGER NOT NULL DEFAULT 0,
  bonusMonths    INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  createdAt      TEXT
);

CREATE TABLE IF NOT EXISTS scheme_accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  accountNo  TEXT NOT NULL UNIQUE,
  schemeId   INTEGER NOT NULL,
  customerId INTEGER NOT NULL,
  startDate  TEXT NOT NULL,
  status     TEXT NOT NULL,
  createdAt  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sacct_scheme ON scheme_accounts(schemeId);
CREATE INDEX IF NOT EXISTS idx_sacct_customer ON scheme_accounts(customerId);
CREATE INDEX IF NOT EXISTS idx_sacct_status ON scheme_accounts(status);

CREATE TABLE IF NOT EXISTS scheme_payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  accountId     INTEGER NOT NULL,
  installmentNo INTEGER NOT NULL,
  date          TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,
  mode          TEXT NOT NULL,
  dueDate       TEXT
);
CREATE INDEX IF NOT EXISTS idx_spay_account ON scheme_payments(accountId);
CREATE INDEX IF NOT EXISTS idx_spay_date ON scheme_payments(date);

-- ---------- Receipts (Udhari collection) ----------
CREATE TABLE IF NOT EXISTS receipts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  receiptNo  TEXT NOT NULL UNIQUE,
  customerId INTEGER NOT NULL,
  date       TEXT NOT NULL,
  amount     REAL NOT NULL DEFAULT 0,
  mode       TEXT NOT NULL,
  notes      TEXT,
  createdAt  TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipts_customer ON receipts(customerId);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);

-- ---------- Custom orders ----------
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  orderNo         TEXT NOT NULL UNIQUE,
  customerId      INTEGER NOT NULL,
  date            TEXT NOT NULL,
  deliveryDate    TEXT,
  items           TEXT NOT NULL DEFAULT '[]',
  estimatedAmount REAL NOT NULL DEFAULT 0,
  advanceReceived REAL NOT NULL DEFAULT 0,
  advanceMode     TEXT NOT NULL,
  status          TEXT NOT NULL,
  notes           TEXT,
  invoiceId       INTEGER,
  createdAt       TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customerId);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

-- ---------- Metal refining (Ghalai) ----------
CREATE TABLE IF NOT EXISTS refinings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  refiningNo      TEXT NOT NULL UNIQUE,
  date            TEXT NOT NULL,
  refinerName     TEXT,
  sourceItemId    INTEGER,
  description     TEXT NOT NULL,
  type            TEXT NOT NULL,
  inputWt         REAL NOT NULL DEFAULT 0,
  inputFinePct    REAL NOT NULL DEFAULT 0,
  refiningLossPct REAL NOT NULL DEFAULT 0,
  outputWt        REAL NOT NULL DEFAULT 0,
  outputPurity    TEXT NOT NULL,
  outputItemId    INTEGER,
  notes           TEXT,
  createdAt       TEXT
);
CREATE INDEX IF NOT EXISTS idx_refinings_date ON refinings(date);

-- ---------- Document-number counters ----------
CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- ---------- System (global, shared across firms) ----------
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  salt         TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  createdAt    TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  address             TEXT,
  city                TEXT,
  gstin               TEXT,
  phone               TEXT,
  createdAt           TEXT,
  printPaperSize      TEXT,
  printShowLogo       INTEGER,
  printLogoUrl        TEXT,
  printBankName       TEXT,
  printBankAccountNo  TEXT,
  printBankIfsc       TEXT,
  printBankBranch     TEXT,
  printTermsText      TEXT,
  printShowHuid       INTEGER,
  printAccentColor    TEXT,
  defaultGstRate      REAL,
  defaultHsnCode      TEXT,
  loyaltyEarnPerGram  REAL,
  loyaltyRupeesPerPoint REAL,
  templateInvoice     TEXT,
  templateDues        TEXT,
  templateGirvi       TEXT,
  templateScheme      TEXT
);
