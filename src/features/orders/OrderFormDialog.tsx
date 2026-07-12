import { useEffect, useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { OrderItem, OrderType, PaymentMode } from "@/db/types"
import { ordersService, customersService, todayStr } from "@/services/dbService"
import { ORDER_TYPES } from "@/lib/constants"
import { GST_RATES } from "@/features/pos/calc"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

const newRow = (): Row => ({ id: rid(), description: "", purity: "22K", grossWt: 0, netWt: 0, makingPerGm: 0 })
const round2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2))

export function OrderFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const user = useSession((s) => s.user)
  const customers = useLiveData(() => customersService.getAll(), [], [])

  const [customerId, setCustomerId] = useState<number | null>(null)
  const [orderType, setOrderType] = useState<OrderType>("custom")
  const [date, setDate] = useState(todayStr())
  const [deliveryDate, setDeliveryDate] = useState("")
  const [salesperson, setSalesperson] = useState("")
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [goldRate, setGoldRate] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [gstRate, setGstRate] = useState(3)
  const [advance, setAdvance] = useState(0)
  const [advanceMode, setAdvanceMode] = useState<PaymentMode>("cash")
  const [notes, setNotes] = useState("")
  // Advanced
  const [advOpen, setAdvOpen] = useState(false)
  const [stoneCharges, setStoneCharges] = useState(0)
  const [otherCharges, setOtherCharges] = useState(0)
  const [goldCostRate, setGoldCostRate] = useState(0)
  const [priority, setPriority] = useState<"normal" | "urgent">("normal")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCustomerId(null)
    setOrderType("custom")
    setDate(todayStr())
    setDeliveryDate("")
    setSalesperson(user?.name ?? "")
    setRows([newRow()])
    setGoldRate(0)
    setDiscount(0)
    setGstRate(3)
    setAdvance(0)
    setAdvanceMode("cash")
    setNotes("")
    setAdvOpen(false)
    setStoneCharges(0)
    setOtherCharges(0)
    setGoldCostRate(0)
    setPriority("normal")
  }, [open, user?.name])

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  )

  // ---- Live pricing ----
  const p = useMemo(() => {
    const totalNet = rows.reduce((s, r) => s + r.netWt, 0)
    const goldValue = round2(totalNet * goldRate)
    const makingCharges = round2(rows.reduce((s, r) => s + r.netWt * r.makingPerGm, 0))
    const subtotal = round2(goldValue + makingCharges + stoneCharges + otherCharges - discount)
    const gstAmount = round2(Math.max(0, subtotal) * (gstRate / 100))
    const estimatedTotal = round2(subtotal + gstAmount)
    const balance = round2(estimatedTotal - advance)
    const goldCost = round2(totalNet * goldCostRate)
    const estimatedProfit =
      goldCostRate > 0
        ? round2(goldValue - goldCost + makingCharges - discount)
        : round2(makingCharges - discount)
    const margin = estimatedTotal > 0 ? round2((estimatedProfit / estimatedTotal) * 100) : 0
    return { totalNet, goldValue, makingCharges, subtotal, gstAmount, estimatedTotal, balance, estimatedProfit, margin }
  }, [rows, goldRate, discount, gstRate, advance, stoneCharges, otherCharges, goldCostRate])

  const save = async (asDraft: boolean) => {
    if (customerId == null) return toast.error("Select a customer")
    const items = rows.filter((r) => r.description.trim() || r.grossWt > 0)
    if (items.length === 0) return toast.error("Add at least one item")
    if (deliveryDate && deliveryDate < todayStr()) return toast.error("Delivery date can't be in the past")
    if (advance < 0 || discount < 0 || goldRate < 0) return toast.error("Amounts can't be negative")

    setSaving(true)
    try {
      const order = await ordersService.add(
        {
          customerId,
          orderType,
          date,
          deliveryDate: deliveryDate || undefined,
          salesperson: salesperson.trim() || undefined,
          priority,
          items: items.map(({ id: _id, ...rest }) => rest),
          estimatedAmount: p.estimatedTotal,
          goldRate,
          goldValue: p.goldValue,
          makingCharges: p.makingCharges,
          stoneCharges,
          otherCharges,
          discount,
          gstRate,
          gstAmount: p.gstAmount,
          goldCostRate: goldCostRate || undefined,
          estimatedProfit: p.estimatedProfit,
          advanceReceived: advance,
          advanceMode,
          notes: notes || undefined,
          createdBy: user?.name,
        },
        { status: asDraft ? "draft" : "confirmed" },
      )
      toast.success(`Order ${order.orderNo} ${asDraft ? "saved as draft" : "booked"}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>New Order</DialogTitle>
          <DialogDescription>
            Book a jewellery order — pricing, balance and profit are calculated for you.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {/* Customer + type */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Customer</Label>
              <CustomerCombobox value={customerId} onChange={setCustomerId} className="w-full" />
              {customer && (
                <p className="text-[11px] text-muted-foreground">
                  {customer.mobile}
                  {customer.city ? ` · ${customer.city}` : ""} · {customer.loyaltyPoints} pts
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Order Type</Label>
              <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Order Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Delivery Date</Label>
              <Input type="date" min={todayStr()} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Salesperson</Label>
              <Input value={salesperson} onChange={(e) => setSalesperson(e.target.value)} placeholder="optional" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Items</Label>
              <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
                <Plus className="size-4" /> Row
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] border-collapse text-sm">
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
                        <TextCell value={r.description} onChange={(v) => update(r.id, { description: v })} placeholder="e.g. Custom gold necklace" />
                      </td>
                      <td>
                        <TextCell value={r.purity} onChange={(v) => update(r.id, { purity: v })} />
                      </td>
                      <td>
                        <NumCell value={r.grossWt} onChange={(v) => update(r.id, r.netWt === r.grossWt || r.netWt === 0 ? { grossWt: v, netWt: v } : { grossWt: v })} />
                      </td>
                      <td>
                        <NumCell value={r.netWt} onChange={(v) => update(r.id, { netWt: v })} />
                      </td>
                      <td>
                        <NumCell value={r.makingPerGm} step={1} onChange={(v) => update(r.id, { makingPerGm: v })} />
                      </td>
                      <td>
                        <button
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove row"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing inputs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <PriceField label="Gold Rate ₹/g" value={goldRate} onChange={setGoldRate} step={1} />
            <PriceField label="Discount ₹" value={discount} onChange={setDiscount} step={1} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">GST %</Label>
              <Select value={String(gstRate)} onValueChange={(v) => setGstRate(Number(v))}>
                <SelectTrigger size="sm" className="w-full">
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
            <PriceField label="Advance ₹" value={advance} onChange={setAdvance} step={1} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Adv. Mode</Label>
              <Select value={advanceMode} onValueChange={(v) => setAdvanceMode(v as PaymentMode)}>
                <SelectTrigger size="sm" className="w-full">
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
          </div>

          {/* Live summary */}
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
            <SumRow label="Gold Value" value={p.goldValue} />
            <SumRow label="Making Charges" value={p.makingCharges} />
            {stoneCharges > 0 && <SumRow label="Stone Charges" value={stoneCharges} />}
            {otherCharges > 0 && <SumRow label="Other Charges" value={otherCharges} />}
            {discount > 0 && <SumRow label="Discount" value={-discount} />}
            <SumRow label={`GST (${gstRate}%)`} value={p.gstAmount} />
            <div className="flex items-center justify-between border-t pt-1.5 font-semibold sm:col-span-2">
              <span>Estimated Total</span>
              <span className="tabular text-base">₹{formatAmount(p.estimatedTotal)}</span>
            </div>
            <SumRow label="Advance" value={advance} />
            <div className="flex items-center justify-between font-medium">
              <span className="text-muted-foreground">Balance</span>
              <span className={cn("tabular", p.balance > 0 ? "text-destructive" : "text-emerald-600")}>
                ₹{formatAmount(p.balance)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground sm:col-span-2">
              <span>Est. profit ₹{formatAmount(p.estimatedProfit)} · margin {p.margin}%</span>
            </div>
          </div>

          {/* Advanced */}
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setAdvOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {advOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              Advanced options
            </button>
            {advOpen && (
              <div className="grid grid-cols-2 gap-3 border-t p-3 sm:grid-cols-4">
                <PriceField label="Stone Charges ₹" value={stoneCharges} onChange={setStoneCharges} step={1} />
                <PriceField label="Other Charges ₹" value={otherCharges} onChange={setOtherCharges} step={1} />
                <PriceField label="Gold Cost ₹/g" value={goldCostRate} onChange={setGoldCostRate} step={1} hint="for accurate margin" />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as "normal" | "urgent")}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Remarks */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Remarks / instructions</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="measurements, design notes, customer preferences…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => void save(true)} disabled={saving}>
            Save as Draft
          </Button>
          <Button onClick={() => void save(false)} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Book Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PriceField({
  label,
  value,
  onChange,
  step = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        min={0}
        className="tabular text-right"
        value={value || ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">₹{formatAmount(value)}</span>
    </div>
  )
}
