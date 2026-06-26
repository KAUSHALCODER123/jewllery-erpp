# Gap Analysis — Jewel-ERP vs. Manabh Jewellery ERP (competitor)

Source of truth: the competitor SOP (every workflow in their demo) + high-res frame
review. Legend for **Status**:
- ✅ **Have** — built and working in Jewel-ERP today.
- 🟡 **Partial** — exists but missing sub-features the competitor has.
- ❌ **Missing** — not built yet.
- ⭐ **Beat** — where we can clearly exceed the competitor.

---

## Phase 1 — Inventory & Stock

| Competitor feature (SOP) | Status | Gap / action to match & beat |
|---|---|---|
| 1.1 Item Master | ✅ Have | We have name/type/group/purity/gross-stone-net/making/HUID/auto-tag. **Missing sub-features:** Item Type, Item Group, **Design** as their own masters with inline "N" (add-new) buttons; **WeightWise vs PieceWise**; **UOM** (gram/piece); **item image**; "Don't view list" toggle. |
| 1.1 Barcode generation & **thermal sticker print** | ❌ Missing | We mint the tag string but don't **render or print a scannable barcode**. Need: `jsbarcode` label + print-CSS sticker sheet. |
| 1.1 **Multiple Barcode** batch entry | ❌ Missing | Their "Barcode Creation" grid bulk-tags opening stock (Tag/Gross/Net/Purity/Black-beads/Stone/FinalWt/Mkg/Hallmark/HUID/GST, Fine wt, F6 attachment). |
| 1.1 **Stock Transfer Loose ↔ Barcode** | ❌ Missing | Convert loose lot stock into tagged pieces and back. |
| 1.2 Purchase Inward | 🟡 Partial | We record purchases + supplier balance. **Gap:** purchase does **not yet push items into live inventory/stock ledger**; no RTGS/bank settle distinction beyond "amount paid". |
| 1.3 **Metal Refining (Ghalai/melting)** | ❌ Missing | Convert scrap (e.g. 50 g 22K) → pure bullion (45.8 g 24K) with purity-loss %, auto-update stock. Entire **Refinery In/Out** module absent. |
| Live **stock ledger / valuation** (metal-wise balances) | ❌ Missing | Running gold/silver gram balances per purity; needed by Day Book & audit. |

## Phase 2 — POS & Retail Billing

| Competitor feature (SOP) | Status | Gap / action |
|---|---|---|
| 2.1 Unified Sales (new + URD + GST + split pay + print) | ✅ Have | Core flow built. |
| 2.1 **Walk-in quick customer** (type name, skip KYC) | 🟡 Partial | We require selecting a saved customer. Add inline "quick/cash customer". |
| 2.1 **Auto SMS / WhatsApp receipt** | ❌ Missing | Competitor auto-sends bill. We print only. Add WhatsApp share link + (later) SMS. |
| 2.1 Billing sub-fields | 🟡 Partial | Missing: **Salesman**, bill **Prefix/Series**, **State (IGST vs CGST/SGST)**, Manual bill no, **GST-Not-Required** toggle, **Bill Discount**, **Making Discount**, **Adjusted Amount/Change**, **TCS**, **Retail mode**, **Modify existing bill**, per-line Hallmark charges, Black-beads weight. |
| 2.2 **Udhari (credit) Collection — Receipt screen** | ❌ Missing | Dedicated "customer pays down old debt" voucher that reduces their ledger + prints receipt. We have no standalone receipt/payment-in screen. |

## Phase 3 — Manufacturing & Custom Work

| Competitor feature (SOP) | Status | Gap / action |
|---|---|---|
| 3.1 **Customer Order Booking** | ❌ Missing | Custom order with design notes, expected wt/purity, **advance**, delivery date, Order No. |
| 3.2 Karigar material tracking | ✅ Have | Issue/receive + wastage reconcile built. |
| 3.2 Karigar sub-features | 🟡 Partial | Link job to **Order No**; capture **stone wt** on receipt; **Wastage/Gm** option (we have only %). |

## Phase 4 — Financial Services

| Competitor feature (SOP) | Status | Gap / action |
|---|---|---|
| 4.1 Girvi (gold loan) | ✅ Have | Loan, collateral photo, pledged items, interest, Pavati, close-with-interest. |
| 4.1 Girvi sub-features | 🟡 Partial | **Thumbprint** capture; **Daywise** interest setting; **partial repayment + renewal** receipts (we only do full close). |
| 4.2 Gold Saving Scheme | ✅ Have | Plans, enroll, installments, maturity value. |
| 4.2 Scheme sub-features | 🟡 Partial | Auto **due-date grid** at enrollment; **tick current month's due** UI; **chit receipt** print. |

## Phase 5 — Accounting, Compliance & Auditing

| Competitor feature (SOP) | Status | Gap / action |
|---|---|---|
| 5.1 **Physical Stock Audit** (scan → green/red reconcile) | ❌ Missing | Scan tags; matched = green, missing = red (flags theft/misplacement). High-value, great demo. |
| 5.2 Day Book | ✅ Have | KPIs + invoice list built. |
| 5.2 Day Book sub-features | 🟡 Partial | Add **Karigar metal flow** and **cash-drawer vs bank** split. |
| 5.2 **Sundry Debtors** report (+ mobiles for follow-up) | 🟡 Partial | We show outstanding in Customers; add a dedicated debtors list with one-tap WhatsApp follow-up. |
| 5.2 Customer Ledger | ✅ Have | Party ledger built. |
| 5.2 Ledger **PDF + WhatsApp send** | ❌ Missing | One-click send statement to customer. |
| 5.3 GST Export (B2B/B2C) | ✅ Have | GSTR-1 B2B/B2C + CSV export. |
| 5.3 GST sub-features | 🟡 Partial | Add **HSN-code summary**; Excel/Word export. |

## Phase 6 — System Admin & Quality of Life

| Competitor feature (SOP) | Status | Gap / action |
|---|---|---|
| **Authentication / Login** (user + password) | ❌ Missing | **Biggest miss.** No login at all today. Need users + roles (owner/cashier), session, password. |
| **Multi-Firm / Multi-Branch + Financial Year** select | ❌ Missing | Choose company + FY at login; isolate data per firm/year. |
| **Loyalty Points** automation (earn per gram, redeem as discount) | ❌ Missing | Field exists; no earn/redeem logic. |
| **Invoice Format Customization** (Report Builder) | ❌ Missing | Drag-drop logo/colors/spacing. (We'll do configurable templates, not a full designer.) |
| **Regional Languages** on printed receipts (Marathi/Hindi/Gujarati) | ❌ Missing | We chose English-first/i18n-ready; add bilingual receipt headers. |
| **Database Backup** (USB / Google Drive) | ❌ Missing | We have no export/import yet. Add JSON/SQLite backup + restore. |

---

## Where Jewel-ERP can BEAT them (⭐ differentiators)

1. ⭐ **One unified app** — competitor splits retail and Girvi into two separate
   products with separate customer data. We share one customer/ledger across POS,
   Girvi, schemes, karigar, accounting.
2. ⭐ **Modern, dense-but-clean UI** + dark mode vs their dated WinForms (with the
   "Activate Windows" watermark visible in their own demo).
3. ⭐ **Keyboard-first POS**, live reactive data, real dashboards/charts.
4. ⭐ **Native WhatsApp/PDF** sharing baked in, not bolted on.
5. ⭐ **Offline-first → optional cloud sync / multi-device** (their backup is manual).
6. ⭐ **Stronger data integrity** (TypeScript + Zod validated ledgers).
7. ⭐ **Slicker Stock Audit** — live green/red scan reconciliation with running counts.

---

## Recommended gap-closing roadmap (priority order)

**P0 — credibility blockers (a shop won't trust it without these)**
1. **Authentication + users/roles** (login, owner/cashier) — *currently missing entirely.*
2. **Multi-firm + Financial Year** selection at login.
3. **Barcode generation + thermal label printing** (the "B" in their barcoding).
4. **Receipt / Udhari collection** voucher (pay down debt → reduces ledger).
5. **Backup & restore** (JSON now; SQLite under Tauri later).

**P1 — close the daily-workflow gaps**
6. POS depth: walk-in customer, Salesman, discounts (bill + making), TCS, IGST, Modify bill, WhatsApp send.
7. **Customer Order Booking** + link Karigar jobs to orders.
8. Purchase → **update live inventory/stock ledger** + **metal stock balances**.
9. **Loyalty points** earn/redeem.

**P2 — depth & compliance polish**
10. **Physical Stock Audit** (scan/reconcile, green/red). ⭐ demo-winner.
11. **Metal Refining (Ghalai)** module.
12. Scheme due-date grid + chit receipt; Girvi partial/renewal + Daywise interest.
13. GST **HSN summary** + Excel; Sundry Debtors report; ledger PDF→WhatsApp.
14. **Regional-language** receipts; configurable invoice templates.

**Platform (parallel track):** Tauri + SQLite packaging (agreed Phase 7).
