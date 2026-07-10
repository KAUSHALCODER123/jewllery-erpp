import { useMemo, useState } from "react"
import {
  GripVertical,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Save,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import { useSession } from "@/stores/useSession"
import { authService } from "@/services/authService"
import { receiptT } from "@/lib/receiptI18n"
import { formatAmount } from "@/lib/format"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Barcode } from "@/components/Barcode"
import { cn } from "@/lib/utils"
import {
  BLOCK_META,
  alignClass,
  defaultReceiptLayout,
  fontSizeClass,
  newBlockId,
  parseReceiptLayout,
  serializeReceiptLayout,
  type ReceiptAlign,
  type ReceiptBlock,
  type ReceiptBlockType,
  type ReceiptFontSize,
  type ReceiptLayout,
} from "./layout"

const FONT_SIZES: { value: ReceiptFontSize; label: string }[] = [
  { value: "xs", label: "XS" },
  { value: "sm", label: "S" },
  { value: "base", label: "M" },
  { value: "lg", label: "L" },
]

export function ReceiptDesignerPage() {
  const company = useSession((s) => s.company)
  const setCompanyProfile = useSession((s) => s.setCompanyProfile)

  const [layout, setLayout] = useState<ReceiptLayout>(() =>
    parseReceiptLayout(company?.receiptLayout),
  )
  const [dragId, setDragId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const patchBlock = (id: string, patch: Partial<ReceiptBlock>) =>
    setLayout((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  const toggle = (id: string) =>
    setLayout((prev) => prev.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)))

  const removeBlock = (id: string) =>
    setLayout((prev) => prev.filter((b) => b.id !== id))

  const addText = () =>
    setLayout((prev) => [
      ...prev,
      {
        id: newBlockId("text"),
        type: "text" as ReceiptBlockType,
        enabled: true,
        align: "center" as ReceiptAlign,
        text: "Your custom line — e.g. Exchange within 7 days.",
      },
    ])

  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    setLayout((prev) => {
      const from = prev.findIndex((b) => b.id === dragId)
      const to = prev.findIndex((b) => b.id === targetId)
      if (from < 0 || to < 0) return prev
      const next = prev.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const save = async () => {
    if (!company?.id) return
    setSaving(true)
    try {
      const receiptLayout = serializeReceiptLayout(layout)
      await authService.updateCompany(company.id, { receiptLayout })
      setCompanyProfile({ ...company, receiptLayout })
      toast.success("Receipt layout saved")
    } catch (err) {
      toast.error(`Failed to save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const resetDefault = () => {
    setLayout(defaultReceiptLayout())
    toast.info("Reset to the default layout (save to apply)")
  }

  return (
    <>
      <PageHeader
        title="Receipt Designer"
        subtitle="Drag to reorder · toggle sections on/off · style each block — then Save"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={resetDefault}>
              <RotateCcw className="size-4" /> Reset
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="size-4" /> {saving ? "Saving…" : "Save layout"}
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* ---- Block palette / editor ---- */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Receipt blocks
            </p>
            <Button variant="outline" size="xs" onClick={addText}>
              <Plus className="size-3.5" /> Add text
            </Button>
          </div>

          {layout.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              dragging={dragId === block.id}
              onDragStart={() => setDragId(block.id)}
              onDragEnter={() => reorder(block.id)}
              onDragEnd={() => setDragId(null)}
              onToggle={() => toggle(block.id)}
              onPatch={(patch) => patchBlock(block.id, patch)}
              onRemove={block.type === "text" ? () => removeBlock(block.id) : undefined}
            />
          ))}

          <p className="pt-1 text-[11px] text-muted-foreground">
            Tip: the "Old Gold (URD)" block only prints when the sale has an
            exchange line. Alignment & font size apply to text-style blocks.
          </p>
        </div>

        {/* ---- Live preview ---- */}
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live preview
          </p>
          <div className="flex justify-center rounded-lg border bg-muted/30 p-4">
            <ReceiptPreview layout={layout} />
          </div>
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* One editable block row in the palette.                                     */
/* -------------------------------------------------------------------------- */

function BlockRow({
  block,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onToggle,
  onPatch,
  onRemove,
}: {
  block: ReceiptBlock
  dragging: boolean
  onDragStart: () => void
  onDragEnter: () => void
  onDragEnd: () => void
  onToggle: () => void
  onPatch: (patch: Partial<ReceiptBlock>) => void
  onRemove?: () => void
}) {
  const meta = BLOCK_META[block.type]
  const styleable = block.type === "text" || block.type === "footer" || block.type === "header" || block.type === "customer" || block.type === "barcode"

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-lg border bg-card p-2.5 shadow-2xs transition-opacity",
        dragging && "opacity-40",
        !block.enabled && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", !block.enabled && "text-muted-foreground line-through")}>
            {meta.label}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{meta.desc}</p>
        </div>
        {onRemove && (
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onRemove} title="Delete block">
            <Trash2 className="size-3.5" />
          </Button>
        )}
        <Button
          variant={block.enabled ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          onClick={onToggle}
          title={block.enabled ? "Hide from receipt" : "Show on receipt"}
        >
          {block.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </Button>
      </div>

      {/* Custom-text content */}
      {block.type === "text" && (
        <Input
          value={block.text ?? ""}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder="Text to print…"
          className="mt-2 h-8 text-xs"
        />
      )}

      {/* Style controls */}
      {block.enabled && styleable && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
          <div className="flex overflow-hidden rounded-md border">
            {([
              ["left", AlignLeft],
              ["center", AlignCenter],
              ["right", AlignRight],
            ] as const).map(([a, Icon]) => (
              <button
                key={a}
                type="button"
                onClick={() => onPatch({ align: a })}
                className={cn(
                  "flex size-7 items-center justify-center transition-colors",
                  (block.align ?? "left") === a
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent",
                )}
                title={`Align ${a}`}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>

          <div className="flex overflow-hidden rounded-md border">
            {FONT_SIZES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => onPatch({ fontSize: f.value })}
                className={cn(
                  "flex h-7 w-6 items-center justify-center text-[10px] font-medium transition-colors",
                  (block.fontSize ?? "base") === f.value
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent",
                )}
                title={`Font size ${f.label}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onPatch({ bold: !block.bold })}
            className={cn(
              "flex size-7 items-center justify-center rounded-md border transition-colors",
              block.bold ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
            title="Bold"
          >
            <Bold className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Live preview — a sample receipt rendered from the current layout.          */
/* Uses representative sample data so the shop sees ordering/toggles/styles.   */
/* -------------------------------------------------------------------------- */

function ReceiptPreview({ layout }: { layout: ReceiptLayout }) {
  const company = useSession((s) => s.company)
  const t = receiptT(company?.receiptLanguage)

  const SHOP = {
    name: company?.name ?? "Jewellery Shop",
    address: [company?.address, company?.city].filter(Boolean).join(", ") || "Sample address, City",
    gstin: company?.gstin || "27ABCDE1234F1Z5",
    phone: company?.phone || "98765 43210",
  }

  const sampleItems = useMemo(
    () => [
      { description: "Gold Ring 22K", hsn: "7113", netWt: 5.2, rate: 6000, making: 1200, amount: 32400 },
      { description: "Gold Chain 22K", hsn: "7113", netWt: 12.5, rate: 6000, making: 3000, amount: 78000 },
    ],
    [],
  )
  const sampleUrd = useMemo(
    () => [{ description: "Old Gold 20K", netWt: 8.0, rate: 5500, amount: 44000 }],
    [],
  )

  const sections: Record<ReceiptBlockType, React.ReactNode> = {
    header: (
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <h1 className="text-lg font-bold">{SHOP.name}</h1>
          <p className="text-[10px] leading-tight">{SHOP.address}</p>
          <p className="text-[10px] leading-tight">GSTIN: {SHOP.gstin} · Ph: {SHOP.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{t("taxInvoice")}</p>
          <p className="text-[10px] leading-tight">{t("no")}: INV0001</p>
          <p className="text-[10px] leading-tight">{t("date")}: 10-07-2026</p>
        </div>
      </div>
    ),
    customer: (
      <div className="border-b border-black/30 py-2">
        <p className="text-[11px] font-semibold">{t("billTo")}</p>
        <p className="font-medium">Ramesh Kumar</p>
        <p className="text-[11px]">98765 43210 · MG Road, Pune</p>
      </div>
    ),
    items: (
      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-black [&>th]:py-1 [&>th]:text-left">
            <th>#</th>
            <th>{t("description")}</th>
            <th className="text-right">{t("netWt")}</th>
            <th className="text-right">{t("rate")}</th>
            <th className="text-right">{t("making")}</th>
            <th className="text-right">{t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {sampleItems.map((it, i) => (
            <tr key={i} className="border-b border-black/15 [&>td]:py-0.5">
              <td>{i + 1}</td>
              <td>{it.description}</td>
              <td className="text-right tabular">{it.netWt.toFixed(3)}</td>
              <td className="text-right tabular">{formatAmount(it.rate)}</td>
              <td className="text-right tabular">{formatAmount(it.making)}</td>
              <td className="text-right tabular">{formatAmount(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    urd: (
      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-black/40 [&>th]:py-1 [&>th]:text-left">
            <th>{t("oldGoldUrd")}</th>
            <th className="text-right">{t("netWt")}</th>
            <th className="text-right">{t("rate")}</th>
            <th className="text-right">{t("lessAmount")}</th>
          </tr>
        </thead>
        <tbody>
          {sampleUrd.map((u, i) => (
            <tr key={i} className="[&>td]:py-0.5">
              <td>{u.description}</td>
              <td className="text-right tabular">{u.netWt.toFixed(3)}</td>
              <td className="text-right tabular">{formatAmount(u.rate)}</td>
              <td className="text-right tabular">-{formatAmount(u.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    totals: (
      <div className="mt-4 ml-auto w-1/2 space-y-0.5 text-[11px]">
        <PreviewLine label={t("salesTotal")} value={110400} />
        <PreviewLine label={t("lessOldGold")} value={-44000} />
        <PreviewLine label={t("taxable")} value={66400} />
        <PreviewLine label="CGST" value={996} />
        <PreviewLine label="SGST" value={996} />
        <div className="mt-1 flex justify-between border-t border-black pt-1 font-bold">
          <span>{t("netPayable")}</span>
          <span className="tabular">{formatAmount(68392)}</span>
        </div>
        <PreviewLine label={t("cash")} value={68392} />
        <div className="flex justify-between border-t border-dashed pt-0.5 font-semibold">
          <span>{t("balance")}</span>
          <span className="tabular">{formatAmount(0)}</span>
        </div>
      </div>
    ),
    barcode: (
      <div className="mt-3 flex justify-center">
        <Barcode value="INV0001" height={32} />
      </div>
    ),
    footer: (
      <p className="mt-6 border-t pt-2 text-[10px] text-black/60">
        {company?.printTermsText || t("thankYou")}
      </p>
    ),
    text: null,
  }

  return (
    <div className="w-[148mm] max-w-full border-t-[4px] border-black bg-white p-6 text-[12px] text-black shadow-xl">
      {layout
        .filter((b) => b.enabled)
        .map((block) => {
          const node =
            block.type === "text"
              ? block.text
                ? <p className="whitespace-pre-line">{block.text}</p>
                : null
              : sections[block.type]
          if (!node) return null
          return (
            <div
              key={block.id}
              className={cn(
                alignClass(block.align),
                (block.type === "text" || block.type === "footer") && fontSizeClass(block.fontSize),
                block.bold && "font-bold",
              )}
            >
              {node}
            </div>
          )
        })}
    </div>
  )
}

function PreviewLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular">{formatAmount(value)}</span>
    </div>
  )
}
