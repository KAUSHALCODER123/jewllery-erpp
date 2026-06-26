import { useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import type { MetalType } from "@/db/types"
import {
  purchaseService,
  suppliersService,
  itemsService,
  todayStr,
} from "@/services/dbService"
import type { PurchaseDraft } from "@/services/dbService"
import { formatAmount, wt } from "@/lib/format"
import { CATEGORIES, categoryByLabel } from "@/lib/constants"
import { GST_RATES } from "@/features/pos/calc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NumCell, TextCell } from "@/features/pos/GridCells"
import { SupplierFormDialog } from "./SupplierFormDialog"

interface Row {
  id: string
  description: string
  type: MetalType
  category: string
  purity: string
  grossWt: number
  netWt: number
  rate: number
  makingAmount: number
  /** Add this line to live inventory as a tagged, sellable item. */
  addToStock: boolean
}

const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r${Date.now()}${Math.floor(Math.random() * 1e6)}`

const newRow = (): Row => ({
  id: rid(),
  description: "",
  type: "gold",
  category: "Ring",
  purity: "22K",
  grossWt: 0,
  netWt: 0,
  rate: 0,
  makingAmount: 0,
  addToStock: true,
})

const rowAmount = (r: Row) => Number((r.rate * r.netWt + r.makingAmount).toFixed(2))

export function PurchaseFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const suppliers = useLiveQuery(() => suppliersService.getAll(), [], [])
  const [supplierId, setSupplierId] = useState("")
  const [billNo, setBillNo] = useState("")
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [gstRate, setGstRate] = useState(3)
  const [amountPaid, setAmountPaid] = useState(0)
  const [supOpen, setSupOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setSupplierId("")
      setBillNo("")
      setDate(todayStr())
      setRows([newRow()])
      setGstRate(3)
      setAmountPaid(0)
    }
  }, [open])

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const gross = rows.reduce((s, r) => s + rowAmount(r), 0)
  const cgst = Number(((gross * (gstRate / 2)) / 100).toFixed(2))
  const sgst = cgst
  const net = Number((gross + cgst + sgst).toFixed(2))
  const balance = Number((net - amountPaid).toFixed(2))

  const save = async () => {
    if (!supplierId) return toast.error("Select a supplier")
    const items = rows.filter((r) => r.description.trim() || r.grossWt > 0)
    if (items.length === 0) return toast.error("Add at least one item")

    const draft: PurchaseDraft = {
      invoice: {
        supplierId: Number(supplierId),
        billNo: billNo.trim() || undefined,
        date,
        totalGrossAmount: Number(gross.toFixed(2)),
        cgst,
        sgst,
        netAmount: net,
        amountPaid,
        balance,
      },
      items: items.map((r) => ({
        description: r.description || "Item",
        type: r.type,
        purity: r.purity,
        grossWt: r.grossWt,
        netWt: r.netWt,
        rate: r.rate,
        makingAmount: r.makingAmount,
        amount: rowAmount(r),
      })),
    }
    try {
      const saved = await purchaseService.create(draft)

      // Build live inventory from the flagged lines.
      const stockRows = items.filter((r) => r.addToStock)
      for (const r of stockRows) {
        await itemsService.add({
          name: r.description || "Item",
          type: r.type,
          category: r.category,
          purity: r.purity,
          grossWt: r.grossWt,
          stoneWt: Math.max(0, Number((r.grossWt - r.netWt).toFixed(3))),
          makingChargePerGm: r.netWt > 0 ? Number((r.makingAmount / r.netWt).toFixed(2)) : 0,
          quantity: 1,
          tagPrefix: categoryByLabel(r.category)?.prefix ?? "ITM",
        })
      }
      toast.success(
        `Saved ${saved.purchaseNo}${stockRows.length ? ` · ${stockRows.length} item(s) added to stock` : ""}`,
      )
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>New Purchase</DialogTitle>
          <DialogDescription>
            Record stock bought from a supplier. Ticked lines are added to live
            inventory as tagged, sellable items.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <div className="flex gap-1">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSupOpen(true)}
                  title="New supplier"
                >
                  <UserPlus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Bill No</Label>
              <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Items grid */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Items</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRows((rs) => [...rs, newRow()])}
              >
                <Plus className="size-4" /> Row
              </Button>
            </div>
            <div className="rounded-md border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
                    <th>Description</th>
                    <th className="w-32">Category</th>
                    <th className="w-16">Purity</th>
                    <th className="w-20 text-right">Gross</th>
                    <th className="w-20 text-right">Net</th>
                    <th className="w-24 text-right">Rate/g</th>
                    <th className="w-24 text-right">Making ₹</th>
                    <th className="w-28 text-right">Amount</th>
                    <th className="w-12 text-center" title="Add to stock">Stock</th>
                    <th className="w-7" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t [&>td]:px-1 [&>td]:py-0.5">
                      <td>
                        <TextCell
                          value={r.description}
                          onChange={(v) => update(r.id, { description: v })}
                          placeholder="e.g. Gold ring"
                        />
                      </td>
                      <td>
                        <Select
                          value={r.category}
                          onValueChange={(v) =>
                            update(r.id, {
                              category: v,
                              type: categoryByLabel(v)?.defaultType ?? r.type,
                            })
                          }
                        >
                          <SelectTrigger size="sm" className="h-8 w-full border-0 shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c.prefix} value={c.label}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <TextCell
                          value={r.purity}
                          onChange={(v) => update(r.id, { purity: v })}
                        />
                      </td>
                      <td>
                        <NumCell value={r.grossWt} onChange={(v) => update(r.id, { grossWt: v })} />
                      </td>
                      <td>
                        <NumCell value={r.netWt} onChange={(v) => update(r.id, { netWt: v })} />
                      </td>
                      <td>
                        <NumCell value={r.rate} step={1} onChange={(v) => update(r.id, { rate: v })} />
                      </td>
                      <td>
                        <NumCell
                          value={r.makingAmount}
                          step={1}
                          onChange={(v) => update(r.id, { makingAmount: v })}
                        />
                      </td>
                      <td className="px-2 text-right font-medium tabular">
                        {formatAmount(rowAmount(r))}
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={r.addToStock}
                          onChange={(e) => update(r.id, { addToStock: e.target.checked })}
                          aria-label="Add to stock"
                        />
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            setRows((rs) =>
                              rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs,
                            )
                          }
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove row"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-medium [&>td]:px-2 [&>td]:py-1">
                    <td colSpan={3} className="text-muted-foreground">Totals</td>
                    <td className="text-right tabular">
                      {wt(rows.reduce((s, r) => s + r.grossWt, 0))}
                    </td>
                    <td className="text-right tabular">
                      {wt(rows.reduce((s, r) => s + r.netWt, 0))}
                    </td>
                    <td colSpan={2} />
                    <td className="text-right tabular">{formatAmount(gross)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Tax + payment */}
          <div className="grid grid-cols-4 items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">GST</Label>
              <Select value={String(gstRate)} onValueChange={(v) => setGstRate(Number(v))}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((g) => (
                    <SelectItem key={g.value} value={String(g.value)}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amount Paid (₹)</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={amountPaid || ""}
                onChange={(e) =>
                  setAmountPaid(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Net</div>
              <div className="font-semibold tabular">{formatAmount(net)}</div>
            </div>
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Balance</div>
              <div className="font-semibold tabular text-destructive">
                {formatAmount(balance)}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Save Purchase</Button>
        </DialogFooter>
      </DialogContent>

      <SupplierFormDialog
        open={supOpen}
        onOpenChange={setSupOpen}
        onSaved={(s) => setSupplierId(String(s.id))}
      />
    </Dialog>
  )
}
