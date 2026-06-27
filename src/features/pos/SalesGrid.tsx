import { useRef, useState, useEffect } from "react"
import { Barcode, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { itemsService } from "@/services/dbService"
import { wt, formatAmount } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePosStore } from "./usePosStore"
import { lineAmount, lineMakingAmount } from "./calc"
import { NumCell, TextCell } from "./GridCells"

export function SalesGrid() {
  const sales = usePosStore((s) => s.sales)
  const addFromItem = usePosStore((s) => s.addFromItem)
  const addSalesLine = usePosStore((s) => s.addSalesLine)
  const updateSalesLine = usePosStore((s) => s.updateSalesLine)
  const removeSalesLine = usePosStore((s) => s.removeSalesLine)

  const [scan, setScan] = useState("")
  const scanRef = useRef<HTMLInputElement>(null)

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
    if (item.status === "sold") {
      toast.warning(`${tag} is marked sold — adding anyway`)
    }
    addFromItem(item)
    setScan("")
    scanRef.current?.focus()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barcode scan bar */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative w-72">
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
            placeholder="Scan / type barcode tag, press Enter…"
            aria-label="Barcode scan"
            className="pl-8 uppercase"
            autoFocus
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void handleScan()}>
          Add
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => addSalesLine()}
          title="Add a blank line for an untagged item"
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
              <th className="w-24 text-right">Net Wt (g)</th>
              <th className="w-28 text-right">Rate/g</th>
              <th className="w-28 text-right">Making/g</th>
              <th className="w-28 text-right">Making ₹</th>
              <th className="w-32 text-right">Amount ₹</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sales.map((l) => (
              <tr key={l.id} className="border-b [&>td]:px-1 [&>td]:py-0.5 hover:bg-accent/20">
                <td className="font-medium">
                  <TextCell
                    value={l.tag}
                    onChange={(v) => updateSalesLine(l.id, { tag: v.toUpperCase() })}
                    placeholder="—"
                    aria-label="Tag"
                  />
                </td>
                <td>
                  <TextCell
                    value={l.description}
                    onChange={(v) => updateSalesLine(l.id, { description: v })}
                    placeholder="Item description"
                    aria-label="Description"
                  />
                </td>
                <td>
                  <NumCell
                    value={l.netWt}
                    onChange={(v) => updateSalesLine(l.id, { netWt: v })}
                    aria-label="Net weight"
                  />
                </td>
                <td>
                  <NumCell
                    value={l.rate}
                    step={1}
                    onChange={(v) => updateSalesLine(l.id, { rate: v })}
                    aria-label="Rate per gram"
                  />
                </td>
                <td>
                  <NumCell
                    value={l.makingPerGm}
                    step={1}
                    onChange={(v) => updateSalesLine(l.id, { makingPerGm: v })}
                    aria-label="Making per gram"
                  />
                </td>
                <td className="px-2 text-right text-muted-foreground tabular">
                  {formatAmount(lineMakingAmount(l))}
                </td>
                <td className="px-2 text-right font-medium tabular">
                  {formatAmount(lineAmount(l))}
                </td>
                <td>
                  <button
                    onClick={() => removeSalesLine(l.id)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-muted-foreground">
                  Scan a barcode or add a blank row to start billing.
                </td>
              </tr>
            )}
          </tbody>
          {sales.length > 0 && (
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t-2 font-medium [&>td]:px-2 [&>td]:py-1.5">
                <td colSpan={2} className="text-muted-foreground">
                  {sales.length} item(s)
                </td>
                <td className="text-right tabular">
                  {wt(sales.reduce((s, l) => s + l.netWt, 0))}
                </td>
                <td colSpan={2} />
                <td className="text-right text-muted-foreground tabular">
                  {formatAmount(sales.reduce((s, l) => s + lineMakingAmount(l), 0))}
                </td>
                <td className="text-right tabular">
                  {formatAmount(sales.reduce((s, l) => s + lineAmount(l), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
