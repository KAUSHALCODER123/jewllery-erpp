/**
 * Receipt layout model — the persisted shape the drag-and-drop Receipt Designer
 * produces and the printed invoice (InvoiceReceipt) consumes.
 *
 * A layout is an ordered list of blocks. Each block maps to a section of the
 * receipt; the designer reorders / toggles / styles them, and the renderer walks
 * the list top-to-bottom. Stored as a JSON string on `Company.receiptLayout`, so
 * it travels with the firm's data (and its backup). Absent/invalid → defaults.
 */

export type ReceiptBlockType =
  | "header"
  | "customer"
  | "items"
  | "urd"
  | "totals"
  | "barcode"
  | "footer"
  | "text"

export type ReceiptAlign = "left" | "center" | "right"
export type ReceiptFontSize = "xs" | "sm" | "base" | "lg"

export interface ReceiptBlock {
  /** Stable id (used as React key + drag id). */
  id: string
  type: ReceiptBlockType
  enabled: boolean
  align?: ReceiptAlign
  fontSize?: ReceiptFontSize
  bold?: boolean
  /** Content for the free-form "text" block. */
  text?: string
}

export type ReceiptLayout = ReceiptBlock[]

/** Static metadata per block type — label, description, and whether it repeats. */
export const BLOCK_META: Record<
  ReceiptBlockType,
  { label: string; desc: string; repeatable?: boolean }
> = {
  header: { label: "Shop Header", desc: "Logo, shop name, address, GSTIN & invoice no." },
  customer: { label: "Customer", desc: "Bill-to name, mobile, address, GSTIN" },
  items: { label: "Items Table", desc: "Sold jewellery lines — weight, rate, amount" },
  urd: { label: "Old Gold (URD)", desc: "Exchanged old-gold lines (auto-hidden if none)" },
  totals: { label: "Totals & Tax", desc: "Sub-total, GST, net payable, cash/UPI, balance" },
  barcode: { label: "Invoice Barcode", desc: "Scannable Code128 of the invoice number" },
  footer: { label: "Footer / Terms", desc: "Thank-you note or terms & conditions" },
  text: { label: "Custom Text", desc: "Your own free-text line", repeatable: true },
}

/** Order of the standard (non-repeatable) blocks in a fresh layout. */
const STANDARD_ORDER: ReceiptBlockType[] = [
  "header",
  "customer",
  "items",
  "urd",
  "totals",
  "barcode",
  "footer",
]

export function defaultReceiptLayout(): ReceiptLayout {
  return [
    { id: "b-header", type: "header", enabled: true, align: "left" },
    { id: "b-customer", type: "customer", enabled: true, align: "left" },
    { id: "b-items", type: "items", enabled: true },
    { id: "b-urd", type: "urd", enabled: true },
    { id: "b-totals", type: "totals", enabled: true },
    { id: "b-barcode", type: "barcode", enabled: false, align: "center" },
    { id: "b-footer", type: "footer", enabled: true, align: "center" },
  ]
}

/**
 * Parse a stored layout, tolerating anything. Guarantees every standard block
 * type is present exactly once (appending any missing ones as disabled) so a
 * layout saved before a new block type existed still gains it — while preserving
 * the user's order and any repeatable "text" blocks.
 */
export function parseReceiptLayout(raw?: string | null): ReceiptLayout {
  if (!raw) return defaultReceiptLayout()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultReceiptLayout()
  }
  if (!Array.isArray(parsed)) return defaultReceiptLayout()

  const clean: ReceiptLayout = []
  const seen = new Set<ReceiptBlockType>()
  for (const b of parsed) {
    if (!b || typeof b !== "object") continue
    const type = (b as ReceiptBlock).type
    if (!type || !(type in BLOCK_META)) continue
    if (!BLOCK_META[type].repeatable && seen.has(type)) continue
    seen.add(type)
    clean.push({
      id: typeof (b as ReceiptBlock).id === "string" ? (b as ReceiptBlock).id : `b-${type}-${clean.length}`,
      type,
      enabled: (b as ReceiptBlock).enabled !== false,
      align: (b as ReceiptBlock).align,
      fontSize: (b as ReceiptBlock).fontSize,
      bold: (b as ReceiptBlock).bold,
      text: (b as ReceiptBlock).text,
    })
  }
  // Append any standard block the saved layout didn't have (forward-compat),
  // disabled so it doesn't silently change an existing receipt.
  for (const type of STANDARD_ORDER) {
    if (!seen.has(type)) {
      clean.push({ id: `b-${type}`, type, enabled: false })
    }
  }
  return clean.length ? clean : defaultReceiptLayout()
}

export function serializeReceiptLayout(layout: ReceiptLayout): string {
  return JSON.stringify(layout)
}

/** Tailwind text-size class for a block's font-size option. */
export function fontSizeClass(size?: ReceiptFontSize): string {
  switch (size) {
    case "xs":
      return "text-[10px]"
    case "sm":
      return "text-[11px]"
    case "lg":
      return "text-[15px]"
    case "base":
    default:
      return "text-[13px]"
  }
}

/** Tailwind text-align class for a block's alignment option. */
export function alignClass(align?: ReceiptAlign): string {
  switch (align) {
    case "center":
      return "text-center"
    case "right":
      return "text-right"
    case "left":
    default:
      return "text-left"
  }
}

let idSeq = 0
/** Mint a unique id for a newly added block (no Date.now/random — SSR/test safe). */
export function newBlockId(type: ReceiptBlockType): string {
  idSeq += 1
  return `b-${type}-${idSeq}`
}
