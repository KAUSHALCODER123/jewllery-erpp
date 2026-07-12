# Receipt Designer — Context

**Purpose:** A drag-and-drop editor that lets a shop customise its printed invoice/receipt — reorder sections, toggle them on/off, restyle them (alignment, font size, bold), add free-text lines, and set the shop logo. The layout is persisted as JSON on the company profile and consumed by the real printed invoice (`pos/InvoiceReceipt.tsx`) and the designer's own live preview.

## Key files
| File | Responsibility |
|------|----------------|
| `ReceiptDesignerPage.tsx` | Route entry (`/receipt-designer`). Two-pane UI: left = block palette/editor (`BlockRow` per block + "Add text"), right = `ReceiptPreview` rendered from sample data. Owns layout state, drag-reorder, logo upload, and Save/Reset. |
| `layout.ts` | The persisted data model + all pure helpers: `ReceiptBlock`/`ReceiptLayout` types, `BLOCK_META`, `defaultReceiptLayout`, `parseReceiptLayout` (tolerant), `serializeReceiptLayout`, `fontSizeClass`, `alignClass`, `newBlockId`. Shared with `InvoiceReceipt.tsx`. |

## Data model & entities
- **`ReceiptBlock`** — `{ id, type, enabled, align?, fontSize?, bold?, text? }`.
  - `type` (`ReceiptBlockType`): `header | customer | items | urd | totals | barcode | footer | text`.
  - `align`: `left | center | right`; `fontSize`: `xs | sm | base | lg`; `text`: content for the free-form `text` block only.
- **`ReceiptLayout`** = ordered `ReceiptBlock[]`. The renderer walks it top-to-bottom.
- **`BLOCK_META`** — per-type `{ label, desc, repeatable? }`. Only `text` is `repeatable`.
- **`STANDARD_ORDER`** — canonical order of the 7 non-repeatable blocks used to append any missing ones.
- Persisted as a **JSON string on `Company.receiptLayout`**. Logo lives separately on `Company.printLogoUrl` + `Company.printShowLogo` (shared with Settings → Print & Rates and the real invoice); the terms text is `Company.printTermsText`; language is `Company.receiptLanguage`.

## Services & data flow
- No dedicated "receipt service." Persistence goes through **`authService.updateCompany(id, patch)`** (companies live in the system DB, not the per-firm Dexie tables).
- Save (`ReceiptDesignerPage.save`): `serializeReceiptLayout(layout)` → patch `{ receiptLayout, printLogoUrl, printShowLogo }` → `authService.updateCompany` → `useSession().setCompanyProfile({ ...company, ...patch })` to update the in-memory profile immediately.
- Read: `parseReceiptLayout(company?.receiptLayout)` on mount (also called by `InvoiceReceipt.tsx`). Tolerant parser: bad JSON / non-array / unknown types → falls back to defaults; dedupes non-repeatable types; **appends any missing standard block as `enabled: false`** (forward-compat so old saved layouts gain new block types without silently changing the receipt).
- Company profile comes from `useSession` (Zustand store), not `useLiveData`.

## User-facing flows
1. **Reorder** — HTML5 drag/drop on `BlockRow` (`dragId` state + `reorder(targetId)` splice).
2. **Toggle** — eye icon flips `enabled`.
3. **Style** — alignment (all styleable blocks), font size (only `text` + `footer`), bold. Styleable = `text | footer | header | customer | barcode`.
4. **Custom text** — "Add text" appends a repeatable `text` block (editable inline, deletable). Only `text` blocks show a delete button.
5. **Logo** — upload (≤2 MB, read as data URL), show/hide toggle, remove; only surfaced on the `header` block row.
6. **Save / Reset** — Reset loads `defaultReceiptLayout()` (must Save to apply).
7. **Live preview** — `ReceiptPreview` renders a 148mm sample receipt with representative sample items/URD/totals so ordering/toggles/styles are visible before saving.

## Cross-feature connections
- **POS invoice** (`pos/InvoiceReceipt.tsx`) is the real consumer: imports `parseReceiptLayout`, `alignClass`, `fontSizeClass`, `ReceiptBlockType` from this folder's `layout.ts` and renders the same block order. The designer's preview intentionally mirrors that renderer.
- **Company profile / Settings** — shares logo (`printLogoUrl`/`printShowLogo`) and terms (`printTermsText`) fields with Settings → Print & Rates.
- **i18n** — `receiptT(company?.receiptLanguage)` from `@/lib/receiptI18n` localises receipt labels.
- **Barcode** — `@/components/Barcode` renders the Code128 invoice barcode block.
- **Session store** — `useSession` provides `company` and `setCompanyProfile`.

## Gotchas & notes
- **Font-size override hack:** inner elements (footer `<p>`, custom-text `<p>`, etc.) carry hardcoded sizes, so a plain `text-[Npx]` wrapper is overridden. `fontSizeClass` therefore also emits `[&_*]:!text-[Npx]` to force the size onto every descendant with `!important`. Classes are spelled out as literals so Tailwind's JIT can see them — don't template-build them.
- **Font size only applies to `text` and `footer`** in both the editor UI (the size buttons) and the renderer's class logic, even though other blocks are "styleable" for alignment/bold.
- **Two different "styleable" scopes:** `BlockRow`'s `styleable` set (text/footer/header/customer/barcode) governs alignment+bold controls; the font-size buttons and the preview's `fontSizeClass` application are narrower (`text`/`footer` only).
- **Logo is not part of the layout JSON** — it lives on separate company fields, so it's saved alongside the layout but travels/edits independently.
- `newBlockId` uses a module-level counter (no `Date.now`/random) so it is SSR/test-safe. Default layout uses fixed ids (`b-header`, …).
- **URD ("Old Gold") block auto-hides** when the sale has no exchange line (real invoice); in the preview it always shows sample URD data.
- `parseReceiptLayout` treats `enabled !== false` as enabled (missing → enabled), but appended missing standard blocks are explicitly disabled.
- Barcode block ships **disabled by default** in `defaultReceiptLayout()`.
