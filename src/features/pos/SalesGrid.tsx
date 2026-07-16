import { useRef, useState, useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Barcode, Plus, Trash2, Search } from "lucide-react"
import { toast } from "sonner"
import { itemsService } from "@/services/dbService"
import type { Item } from "@/db/types"
import { wt, formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CATEGORIES, PURITY_OPTIONS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem as SelectOption,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePosStore } from "./usePosStore"
import { lineAmount, lineMakingAmount, lineNetWt, type SalesLine } from "./calc"
import { NumCell, TextCell } from "./GridCells"

/**
 * Sales entry, split into Gold (tagged, per-piece) and Silver (by-weight) tabs —
 * different flows, but both add lines to the SAME invoice (checkout sums all).
 */
export function SalesGrid() {
  const sales = usePosStore((s) => s.sales)
  const [tab, setTab] = useState<"gold" | "silver">("gold")

  const goldLines = sales.filter((l) => (l.metal ?? "gold") !== "silver")
  const silverLines = sales.filter((l) => l.metal === "silver")

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "gold" | "silver")}>
          <TabsList>
            <TabsTrigger value="gold">
              Gold {goldLines.length > 0 && <Count n={goldLines.length} />}
            </TabsTrigger>
            <TabsTrigger value="silver">
              Silver {silverLines.length > 0 && <Count n={silverLines.length} />}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === "gold" ? <GoldTab lines={goldLines} /> : <SilverTab lines={silverLines} />}
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1.5 rounded bg-primary/15 px-1 text-[10px] text-primary">{n}</span>
}

/* ------------------------------- Gold tab -------------------------------- */
/* Tagged, per-piece: scan a barcode / search stock, or add an untagged row.   */

function GoldTab({ lines }: { lines: SalesLine[] }) {
  const addFromItem = usePosStore((s) => s.addFromItem)
  const addSalesLine = usePosStore((s) => s.addSalesLine)
  const updateSalesLine = usePosStore((s) => s.updateSalesLine)
  const removeSalesLine = usePosStore((s) => s.removeSalesLine)

  const [scan, setScan] = useState("")
  const scanRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [matches, setMatches] = useState<Item[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setMatches([])
      return
    }
    let cancelled = false
    void itemsService.search(q).then((rows) => {
      if (cancelled) return
      setMatches(rows.filter((r) => (r.status ?? "in_stock") === "in_stock").slice(0, 8))
      setActive(0)
    })
    return () => {
      cancelled = true
    }
  }, [query])

  const pick = (item: Item) => {
    addFromItem(item)
    setQuery("")
    setMatches([])
    scanRef.current?.focus()
  }

  const handleSearchKey = (e: ReactKeyboardEvent) => {
    if (!matches.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => (a + 1) % matches.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => (a - 1 + matches.length) % matches.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      pick(matches[active])
    } else if (e.key === "Escape") {
      setMatches([])
    }
  }

  useEffect(() => {
    scanRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F10") {
        e.preventDefault()
        scanRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleScan = async () => {
    const tag = scan.trim().toUpperCase()
    if (!tag) return
    const item = await itemsService.getByTag(tag)
    if (!item) {
      toast.error(`No item with tag ${tag}`)
      return
    }
    if (item.status === "sold") toast.warning(`${tag} is marked sold — adding anyway`)
    addFromItem(item)
    setScan("")
    scanRef.current?.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scan / search bar */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative w-64">
          <Barcode className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void handleScan()
              }
            }}
            placeholder="Scan / type barcode tag, Enter…"
            aria-label="Barcode scan"
            className="pl-8 uppercase"
            autoFocus
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void handleScan()}>
          Add
        </Button>
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Search item by name / tag / HUID…"
            aria-label="Search item"
            className="pl-8"
          />
          {matches.length > 0 && (
            <ul className="absolute left-0 top-full z-30 mt-1 max-h-72 w-80 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
              {matches.map((it, idx) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(it)
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent",
                      idx === active && "bg-accent",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{it.name}</span>{" "}
                      <span className="text-xs text-muted-foreground">{it.tag}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {wt(it.netWt)}g · {it.purity}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => addSalesLine({ metal: "gold", category: "Other" })}
          title="Add a blank line for an untagged gold item"
        >
          <Plus className="size-4" /> Blank row
        </Button>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
              <th className="w-24">Tag</th>
              <th>Description</th>
              <th className="w-24">Category</th>
              <th className="w-24 text-right">Net Wt (g)</th>
              <th className="w-28 text-right">Rate/g</th>
              <th className="w-28 text-right">Making/g</th>
              <th className="w-28 text-right">Making ₹</th>
              <th className="w-32 text-right">Amount ₹</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b [&>td]:px-1 [&>td]:py-0.5 hover:bg-accent/20">
                <td className="font-medium">
                  <TextCell value={l.tag} onChange={(v) => updateSalesLine(l.id, { tag: v.toUpperCase() })} placeholder="—" aria-label="Tag" />
                </td>
                <td>
                  <TextCell value={l.description} onChange={(v) => updateSalesLine(l.id, { description: v })} placeholder="Item description" aria-label="Description" />
                </td>
                <td>
                  <Select value={l.category ?? "Other"} onValueChange={(v) => updateSalesLine(l.id, { category: v })}>
                    <SelectTrigger size="sm" className="h-8 w-full border-0 shadow-none" aria-label="Category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter((c) => c.defaultType === "gold").map((c) => (
                        <SelectOption key={c.prefix} value={c.label}>{c.label}</SelectOption>
                      ))}
                      <SelectOption value="Nathani">Nathani</SelectOption>
                      <SelectOption value="Other">Other</SelectOption>
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <NumCell value={l.netWt} onChange={(v) => updateSalesLine(l.id, { netWt: v })} aria-label="Net weight" />
                </td>
                <td>
                  <NumCell value={l.rate} step={1} onChange={(v) => updateSalesLine(l.id, { rate: v })} aria-label="Rate per gram" />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSalesLine(l.id, { makingMode: l.makingMode === "per_piece" ? "per_gram" : "per_piece" })}
                      className="shrink-0 rounded border px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                      title="Toggle making: per gram / per piece (flat)"
                    >
                      {l.makingMode === "per_piece" ? "/pc" : "/g"}
                    </button>
                    <NumCell value={l.makingPerGm} step={1} onChange={(v) => updateSalesLine(l.id, { makingPerGm: v })} aria-label={l.makingMode === "per_piece" ? "Making per piece" : "Making per gram"} />
                  </div>
                </td>
                <td className="px-2 text-right text-muted-foreground tabular">{formatAmount(lineMakingAmount(l))}</td>
                <td className="px-2 text-right font-medium tabular">{formatAmount(lineAmount(l))}</td>
                <td>
                  <button onClick={() => removeSalesLine(l.id)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove line">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground">
                  Scan a gold barcode or add a blank row.
                </td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t-2 font-medium [&>td]:px-2 [&>td]:py-1.5">
                <td colSpan={3} className="text-muted-foreground">{lines.length} gold item(s)</td>
                <td className="text-right tabular">{wt(lines.reduce((s, l) => s + lineNetWt(l), 0))}</td>
                <td colSpan={2} />
                <td className="text-right text-muted-foreground tabular">{formatAmount(lines.reduce((s, l) => s + lineMakingAmount(l), 0))}</td>
                <td className="text-right tabular">{formatAmount(lines.reduce((s, l) => s + lineAmount(l), 0))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

/* ------------------------------ Silver tab ------------------------------- */
/* By-weight, no barcode: gross → less → net, purity, wastage, rate, making.   */

function SilverTab({ lines }: { lines: SalesLine[] }) {
  const addSalesLine = usePosStore((s) => s.addSalesLine)
  const updateSalesLine = usePosStore((s) => s.updateSalesLine)
  const removeSalesLine = usePosStore((s) => s.removeSalesLine)

  const addSilver = () =>
    addSalesLine({
      byWeight: true,
      metal: "silver",
      category: "Other",
      purity: PURITY_OPTIONS.silver[1] ?? "925 (Sterling)",
      description: "Silver jewellery",
      grossWt: 0,
      lessWt: 0,
      wastagePct: 0,
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button size="sm" onClick={addSilver}>
          <Plus className="size-4" /> Add silver piece
        </Button>
        <span className="text-xs text-muted-foreground">Sold by weight — no barcode tag needed.</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[840px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
              <th>Description</th>
              <th className="w-28">Purity</th>
              <th className="w-20 text-right">Gross (g)</th>
              <th className="w-20 text-right">Less (g)</th>
              <th className="w-20 text-right">Net (g)</th>
              <th className="w-20 text-right">Wastage%</th>
              <th className="w-24 text-right">Rate/g</th>
              <th className="w-24 text-right">Making/g</th>
              <th className="w-28 text-right">Amount ₹</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b [&>td]:px-1 [&>td]:py-0.5 hover:bg-accent/20">
                <td>
                  <TextCell value={l.description} onChange={(v) => updateSalesLine(l.id, { description: v })} placeholder="e.g. Payal" aria-label="Description" />
                </td>
                <td>
                  <Select value={l.purity ?? ""} onValueChange={(v) => updateSalesLine(l.id, { purity: v })}>
                    <SelectTrigger size="sm" className="h-8 w-full border-0 shadow-none" aria-label="Purity">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {PURITY_OPTIONS.silver.map((p) => (
                        <SelectOption key={p} value={p}>{p}</SelectOption>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <NumCell value={l.grossWt ?? 0} onChange={(v) => updateSalesLine(l.id, { grossWt: v })} aria-label="Gross weight" />
                </td>
                <td>
                  <NumCell value={l.lessWt ?? 0} onChange={(v) => updateSalesLine(l.id, { lessWt: v })} aria-label="Less weight" />
                </td>
                <td className="px-2 text-right tabular text-muted-foreground">{wt(lineNetWt(l))}</td>
                <td>
                  <NumCell value={l.wastagePct ?? 0} step={0.1} onChange={(v) => updateSalesLine(l.id, { wastagePct: v })} aria-label="Wastage percent" />
                </td>
                <td>
                  <NumCell value={l.rate} step={1} onChange={(v) => updateSalesLine(l.id, { rate: v })} aria-label="Rate per gram" />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSalesLine(l.id, { makingMode: l.makingMode === "per_piece" ? "per_gram" : "per_piece" })}
                      className="shrink-0 rounded border px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                      title="Toggle making: per gram / per piece (flat)"
                    >
                      {l.makingMode === "per_piece" ? "/pc" : "/g"}
                    </button>
                    <NumCell value={l.makingPerGm} step={1} onChange={(v) => updateSalesLine(l.id, { makingPerGm: v })} aria-label={l.makingMode === "per_piece" ? "Making per piece" : "Making per gram"} />
                  </div>
                </td>
                <td className="px-2 text-right font-medium tabular">{formatAmount(lineAmount(l))}</td>
                <td>
                  <button onClick={() => removeSalesLine(l.id)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove line">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-muted-foreground">
                  Add a silver piece to bill it by weight.
                </td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t-2 font-medium [&>td]:px-2 [&>td]:py-1.5">
                <td colSpan={4} className="text-muted-foreground">{lines.length} silver piece(s)</td>
                <td className="text-right tabular">{wt(lines.reduce((s, l) => s + lineNetWt(l), 0))}</td>
                <td colSpan={3} />
                <td className="text-right tabular">{formatAmount(lines.reduce((s, l) => s + lineAmount(l), 0))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
