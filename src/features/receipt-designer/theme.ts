/**
 * Receipt visual theme — colour + style on top of the block layout (layout.ts).
 * Persisted as JSON on `Company.receiptTheme`; the accent is mirrored onto
 * `Company.printAccentColor` on save so existing accent code keeps working.
 * Presets ("templates") are ready-made theme combinations the shop can one-click.
 */

export type ReceiptFont = "sans" | "serif" | "mono"
export type ReceiptHeader = "plain" | "band"
export type ReceiptBorder = "none" | "line" | "box"

export interface ReceiptTheme {
  /** Accent colour (hex). Used for rules, the invoice label, totals & the header band. */
  accent: string
  font: ReceiptFont
  /** plain = simple rule under the header; band = accent-coloured header bar. */
  header: ReceiptHeader
  /** none = borderless; line = accent top rule; box = full accent border. */
  border: ReceiptBorder
}

export interface ReceiptTemplate {
  id: string
  name: string
  theme: ReceiptTheme
}

export function defaultReceiptTheme(): ReceiptTheme {
  return { accent: "#111827", font: "sans", header: "plain", border: "line" }
}

/** Ready-made templates the shop can apply in one click. */
export const RECEIPT_TEMPLATES: ReceiptTemplate[] = [
  { id: "classic", name: "Classic", theme: { accent: "#111827", font: "serif", header: "plain", border: "line" } },
  { id: "royal-gold", name: "Royal Gold", theme: { accent: "#B45309", font: "serif", header: "band", border: "box" } },
  { id: "emerald", name: "Emerald", theme: { accent: "#047857", font: "sans", header: "band", border: "line" } },
  { id: "ruby", name: "Ruby", theme: { accent: "#9F1239", font: "serif", header: "plain", border: "box" } },
  { id: "sapphire", name: "Sapphire", theme: { accent: "#1D4ED8", font: "sans", header: "band", border: "line" } },
  { id: "minimal", name: "Minimal", theme: { accent: "#111827", font: "sans", header: "plain", border: "none" } },
]

export const RECEIPT_FONTS: { value: ReceiptFont; label: string }[] = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
]

/** Tailwind font-family class for a theme font. */
export function receiptFontClass(font: ReceiptFont): string {
  return font === "serif" ? "font-serif" : font === "mono" ? "font-mono" : "font-sans"
}

export function parseReceiptTheme(raw?: string | null): ReceiptTheme {
  const d = defaultReceiptTheme()
  if (!raw) return d
  try {
    const p = JSON.parse(raw) as Partial<ReceiptTheme>
    return {
      accent: typeof p.accent === "string" ? p.accent : d.accent,
      font: p.font === "serif" || p.font === "mono" ? p.font : "sans",
      header: p.header === "band" ? "band" : "plain",
      border: p.border === "none" || p.border === "box" ? p.border : "line",
    }
  } catch {
    return d
  }
}

export function serializeReceiptTheme(theme: ReceiptTheme): string {
  return JSON.stringify(theme)
}

/** Which template (if any) exactly matches a theme — for highlighting the picker. */
export function matchTemplateId(theme: ReceiptTheme): string | null {
  const hit = RECEIPT_TEMPLATES.find(
    (t) =>
      t.theme.accent.toLowerCase() === theme.accent.toLowerCase() &&
      t.theme.font === theme.font &&
      t.theme.header === theme.header &&
      t.theme.border === theme.border,
  )
  return hit?.id ?? null
}
