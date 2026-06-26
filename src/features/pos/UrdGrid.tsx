import { Plus, Trash2 } from "lucide-react"
import { wt, formatAmount } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { usePosStore } from "./usePosStore"
import { urdAmount, urdNetWt } from "./calc"
import { NumCell, TextCell } from "./GridCells"

export function UrdGrid() {
  const urd = usePosStore((s) => s.urd)
  const addUrdLine = usePosStore((s) => s.addUrdLine)
  const updateUrdLine = usePosStore((s) => s.updateUrdLine)
  const removeUrdLine = usePosStore((s) => s.removeUrdLine)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Old gold / scrap received in exchange — its value is deducted from the
          bill total.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => addUrdLine()}
        >
          <Plus className="size-4" /> Add row
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
              <th>Description</th>
              <th className="w-24 text-right">Gross Wt (g)</th>
              <th className="w-20 text-right">Less %</th>
              <th className="w-24 text-right">Net Wt (g)</th>
              <th className="w-28 text-right">Rate/g</th>
              <th className="w-32 text-right">Amount ₹</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {urd.map((u) => (
              <tr key={u.id} className="border-b [&>td]:px-1 [&>td]:py-0.5 hover:bg-accent/20">
                <td>
                  <TextCell
                    value={u.description}
                    onChange={(v) => updateUrdLine(u.id, { description: v })}
                    placeholder="e.g. Old gold ring 22K"
                    aria-label="Description"
                  />
                </td>
                <td>
                  <NumCell
                    value={u.grossWt}
                    onChange={(v) => updateUrdLine(u.id, { grossWt: v })}
                    aria-label="Gross weight"
                  />
                </td>
                <td>
                  <NumCell
                    value={u.lessPct}
                    step={0.1}
                    onChange={(v) => updateUrdLine(u.id, { lessPct: v })}
                    aria-label="Less percent"
                  />
                </td>
                <td className="px-2 text-right text-muted-foreground tabular">
                  {wt(urdNetWt(u))}
                </td>
                <td>
                  <NumCell
                    value={u.rate}
                    step={1}
                    onChange={(v) => updateUrdLine(u.id, { rate: v })}
                    aria-label="Rate per gram"
                  />
                </td>
                <td className="px-2 text-right font-medium tabular">
                  {formatAmount(urdAmount(u))}
                </td>
                <td>
                  <button
                    onClick={() => removeUrdLine(u.id)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {urd.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">
                  No old gold. Add a row if the customer is exchanging scrap.
                </td>
              </tr>
            )}
          </tbody>
          {urd.length > 0 && (
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t-2 font-medium [&>td]:px-2 [&>td]:py-1.5">
                <td className="text-muted-foreground">{urd.length} row(s)</td>
                <td className="text-right tabular">
                  {wt(urd.reduce((s, u) => s + u.grossWt, 0))}
                </td>
                <td />
                <td className="text-right tabular">
                  {wt(urd.reduce((s, u) => s + urdNetWt(u), 0))}
                </td>
                <td />
                <td className="text-right tabular">
                  {formatAmount(urd.reduce((s, u) => s + urdAmount(u), 0))}
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
