# Jewel-ERP — Competitive Analysis & Build Plan

**Benchmark analysed:** *Manabh Jewellery ERP* + *Manabh Moneylending ERP*
(Windows desktop demo, ~22 min, 720p). This document maps every feature seen
in the demo, identifies where the benchmark is weak, and lays out how Jewel-ERP
beats it.

---

## 1. What the benchmark actually is

Two **separate** Windows desktop products (legacy VB/WinForms-style UI):

1. **Manabh Jewellery ERP** — retail jewellery shop management.
2. **Manabh Moneylending ERP** — pawn-broking / Girvi (gold loan) management.

Both are offline desktop apps, multi-company, with a financial-year login,
Marathi/Hindi support, and manual USB / Google-Drive backup.

### 1.1 Feature inventory (everything observed in the demo)

| Area | Features seen in the demo |
|------|---------------------------|
| **Login / company** | Multi-company select, financial-year select, user + password |
| **Masters** | Item Master (name, type, group, design, HUID, opening stock, weight type, purity, LCM), Customer Master (name, mobile, address, email, city, birthdate, anniversary, Aadhaar, PAN, GST, loyalty points, opening balance, gold/silver/cash account groups), Account Master, Supplier Master |
| **Barcode / stock** | Multiple Barcode Setting, Stock Transfer (Loose ↔ Barcode), Barcode Printing grid (Tag, GrossWt, NetWt, Purity, Block, StoneWt, WastageWt, Making Charges, GST) |
| **Sales / POS** | Sales Bill + **URD Purchase (old-gold exchange)** + "Account cum Stock Display" in one screen; cash/credit/UPI, bank + cheque, advance received, making discount, item-wise GST, TCS, old-gold deduction, live net balance |
| **Purchase** | Supplier purchase entry with the same dense weight/making/GST grid |
| **Refinery** | Refinery In / Out (metal sent for refining) |
| **Orders** | New Order Booking with advance + delivery date |
| **Karigar (goldsmith)** | Issue Order to Karigar, Receive Order from Karigar — metal weight ledger + wastage reconciliation |
| **Printing / sharing** | Tax Invoice (HSN + CGST/SGST split, amount-in-words, bank details, terms), **Report Builder** (drag-drop invoice/receipt designer), Marathi receipts, print / WhatsApp / SMS / Email |
| **Accounting** | Debtors/Creditors, Journal, **GSTR-1 / B2B / B2C**, TDS, Cash Book, Bank Book, Sales/Purchase Book, **Day Book**, Trial Balance, Trading & P&L, **Balance Sheet**, party ledgers |
| **Gold Saving Schemes** | Scheme creation, assign-to-customer, monthly installment receipts (Received/Pending), maturity & bonus calc |
| **Day Book** | One screen aggregating sales, purchase, URD, receipts, cash/credit, opening/closing, GST-inclusive toggle |
| **Backup** | Default location / USB drive / Google Drive |
| **Moneylending (Girvi)** | Pawn entry with **customer photo + collateral**, interest (monthly / compound), redeem date, renewal & partial-payment receipts, redemption, statutory Form-12 / yearly statement, area-wise search, profit report, late/overdue report, loan counter |
| **Localisation** | Marathi / Hindi throughout, INR-native, India GST/HUID/PAN/Aadhaar aware |

---

## 2. Where the benchmark is weak (our openings)

1. **Dated UI** — grey WinForms, cramped, inconsistent fonts, unthemed; an
   "Activate Windows" watermark is visible in the demo. No dark mode, no touch,
   no responsive layout.
2. **Two disjoint products** — retail and moneylending are separate installs
   with separate data. A shop doing both must double-enter customers.
3. **Desktop-locked & install-heavy** — no web access, no multi-device, fragile
   manual backup.
4. **Weak data integrity** — legacy stacks rarely enforce typed/validated
   ledgers; weight/purity/amount errors are easy.
5. **Old reporting** — static report builder, no live dashboards or charts.
6. **No modern sharing UX** beyond bolted-on WhatsApp/SMS.

---

## 3. How Jewel-ERP wins (strategy)

| Benchmark weakness | Jewel-ERP advantage |
|--------------------|---------------------|
| Dated WinForms UI | shadcn/ui + Tailwind v4, **gold #D4AF37 / copper #C87D65** theme, dense *and* clean, dark mode |
| Two separate apps | **One unified app**: POS + URD + Karigar + Girvi + Schemes + Accounting share one customer/ledger |
| Desktop-only | **Offline-first** web app today → wrap as **Tauri/Electron desktop** later; same code can run multi-device |
| Fragile data | **TypeScript + Zod** validation on every weight/purity/amount; atomic Dexie transactions |
| Static reports | **Live reactive** data (`useLiveQuery`), real dashboards + charts |
| Manual backup | Structured export/import now; cloud-sync seam ready via `dbService` |
| Keyboard not first-class | **Keyboard-first POS** (F-keys, barcode scan, tab-indexed billing) |

**Architectural keystone:** every DB call already goes through `dbService.ts`,
so IndexedDB → SQLite (Tauri) is a swap of one file, not a rewrite.

---

## 4. Build roadmap (extends the original 5-phase plan)

The original brief had 5 phases / 4 core modules. The benchmark shows we need
more to truly "beat" it. Revised roadmap:

### ✅ Phase 1 — Foundation *(DONE)*
Vite + React 19 + TS, Tailwind v4 (gold/copper theme), shadcn/ui, Dexie schema
for all tables, `dbService.ts` abstraction, app shell + routing, React Query.
*(Note: pinned to Vite 7 — Vite 8's rolldown native binary is blocked by this
machine's Application Control policy.)*

### Phase 2 — Item Master & Customers
Dense Item Master form (auto `netWt = grossWt − stoneWt`, sequential barcode
`RIN0001`, HUID, purity, making/gm), inventory data-table with search/filter,
Customer Master with outstanding-balance display. Seed dummy stock.

### Phase 3 — Unified POS / Billing *(highest priority)*
Three-pane single window: customer top-bar with red "Udhari" pending amount;
left ledger with **Tab 1 New Sales** (barcode auto-fill) + **Tab 2 URD/old-gold**
(auto-subtracts); right checkout (GST 3%, cash/UPI split, live net balance,
Save & Print). Keyboard-driven.

### Phase 4 — Girvi (Gold Loan) & Karigar
Girvi: customer lookup, collateral photo capture (base64), pledged-items grid,
principal + monthly interest, **Pavati** receipt, renewal/partial-payment,
redemption. Karigar: issue metal (debit) → receive finished + wastage % to
balance the metal ledger.

### Phase 5 — Day Book & Dashboards
Day-Book aggregation (sales / URD / cash collected for the day) + live KPI
dashboard with charts.

### Phase 6+ — Beat-the-benchmark extras (new)
- **Gold Saving Schemes** (installment plans + maturity).
- **GST-compliant invoicing**: HSN, CGST/SGST/IGST, amount-in-words, GSTR-1
  export; WhatsApp/PDF share.
- **Purchase + Supplier** module; **Order Booking** with advance/delivery.
- **Lightweight accounting**: party ledgers, Cash/Bank Book, Trial Balance.
- **Backup/restore**: JSON export-import now; cloud-sync seam later.
- **Multi-language** (English / Hindi / Marathi) via i18n.
- **Tauri desktop packaging** (Phase 2 platform goal) with SQLite.

---

## 5. Locked decisions (agreed)

1. **Accounting depth → Simplified.** Party ledgers + Day Book + Cash/Bank book
   + GST tax invoice & GSTR-1 export. No full double-entry (Trial Balance / P&L /
   Balance Sheet) — shops use Tally for final books. Data model stays open so
   double-entry *could* be layered later.
2. **Platform → Web first, Tauri later.** Build & iterate on the Dexie web app;
   wrap in Tauri + SQLite once features are stable. `dbService.ts` is the swap seam.
3. **Language → English first, i18n-ready.** All UI strings routed through an i18n
   layer from the start so Hindi/Marathi (incl. Marathi receipts) can be added
   without rework.

## 6. Finalised build sequence

1. ✅ Phase 1 — Foundation (done)
2. Phase 2 — Masters: Item + Customer (+ seed dummy stock)
3. Phase 3 — Unified POS (Sales + URD + checkout), keyboard-first, TanStack Table grid
4. Phase 4 — Day Book + live dashboard
5. Phase 5 — Girvi + Karigar (unified, sharing customers/ledger)
6. Phase 6 — Beat-extras: GST invoice/GSTR-1, Gold Saving Schemes, Purchase/Supplier, simplified ledgers
7. Phase 7 — Tauri desktop + SQLite

**Cross-cutting how:** TanStack Table for editable billing grid; HTML + print-CSS
for invoices/Pavati (→ browser PDF) + WhatsApp share; `jsbarcode` for barcodes;
Zod + `dbService` rules for ledger integrity; i18n wrapper on all strings.

## 7. Immediate next step
Proceed to **Phase 2 (Item Master + Customer Master)** on the user's go-ahead.
