import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { OrderItem, PaymentMode } from "@/db/types"
import { ordersService, todayStr } from "@/services/dbService"
import { formatAmount, wt } from "@/lib/format"
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
import { CustomerCombobox } from "@/components/CustomerCombobox"
import { NumCell, TextCell } from "@/features/pos/GridCells"

interface Row extends OrderItem {
  id: string
}

const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `o${Date.now()}${Math.floor(Math.random() * 1e6)}`

const newRow = (): Row => ({
  id: rid(),
  description: "",
  purity: "22K",
  grossWt: 0,
  netWt: 0,
  makingPerGm: 0,
})

export function OrderFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [date, setDate] = useState(todayStr())
  const [deliveryDate, setDeliveryDate] = useState("")
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [estimatedAmount, setEstimatedAmount] = useState(0)
  const [advance, setAdvance] = useState(0)
  const [advanceMode, setAdvanceMode] = useState<PaymentMode>("cash")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setCustomerId(null)
      setDate(todayStr())
      setDeliveryDate("")
      setRows([newRow()])
      setEstimatedAmount(0)
      setAdvance(0)
      setAdvanceMode("cash")
      setNotes("")
    }
  }, [open])

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const save = async () => {
    if (customerId == null) return toast.error("Select a customer")
    const items = rows.filter((r) => r.description.trim() || r.grossWt > 0)
    if (items.length === 0) return toast.error("Add at least one design line")
    setSaving(true)
    try {
      const order = await ordersService.add({
        customerId,
        date,
        deliveryDate: deliveryDate || undefined,
        items: items.map(({ id: _id, ...rest }) => rest),
        estimatedAmount,
        advanceReceived: advance,
        advanceMode,
        notes: notes || undefined,
      })
      toast.success(`Order ${order.orderNo} booked`)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not book order: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const balance = Number((estimatedAmount - advance).toFixed(2))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Order Booking</DialogTitle>
          <DialogDescription>
            Book a custom-jewellery order with an advance and delivery date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Customer</Label>
              <CustomerCombobox value={customerId} onChange={setCustomerId} className="w-full" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Order Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Delivery Date</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          {/* Design items */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Design Items</Label>
              <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
                <Plus className="size-4" /> Row
              </Button>
            </div>
            <div className="rounded-md border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
                    <th>Description</th>
                    <th className="w-16">Purity</th>
                    <th className="w-20 text-right">Gross</th>
                    <th className="w-20 text-right">Net</th>
                    <th className="w-24 text-right">Making/g</th>
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
                          placeholder="e.g. Custom gold necklace"
                        />
                      </td>
                      <td>
                        <TextCell value={r.purity} onChange={(v) => update(r.id, { purity: v })} />
                      </td>
                      <td>
                        <NumCell value={r.grossWt} onChange={(v) => update(r.id, { grossWt: v })} />
                      </td>
                      <td>
                        <NumCell value={r.netWt} onChange={(v) => update(r.id, { netWt: v })} />
                      </td>
                      <td>
                        <NumCell
                          value={r.makingPerGm}
                          step={1}
                          onChange={(v) => update(r.id, { makingPerGm: v })}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))
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
                    <td colSpan={2} className="text-muted-foreground">Totals</td>
                    <td className="text-right tabular">
                      {wt(rows.reduce((s, r) => s + r.grossWt, 0))}
                    </td>
                    <td className="text-right tabular">
                      {wt(rows.reduce((s, r) => s + r.netWt, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Money */}
          <div className="grid grid-cols-4 items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estimated ₹</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={estimatedAmount || ""}
                onChange={(e) =>
                  setEstimatedAmount(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Advance ₹</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={advance || ""}
                onChange={(e) =>
                  setAdvance(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Adv. Mode</Label>
              <Select value={advanceMode} onValueChange={(v) => setAdvanceMode(v as PaymentMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pb-2 text-right text-sm">
              <span className="text-muted-foreground">Balance: </span>
              <span className="font-semibold tabular">{formatAmount(balance)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="design notes, customer preferences…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Book Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
