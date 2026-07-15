import { useEffect, useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import { Plus, Trash2, UserPlus, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import type { MetalType, PaymentMode } from "@/db/types"
import {
  purchaseService,
  suppliersService,
  itemsService,
  todayStr,
} from "@/services/dbService"
import type { PurchaseDraft } from "@/services/dbService"
import { formatAmount, wt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CATEGORIES, categoryByLabel, PURCHASE_TYPES } from "@/lib/constants"
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
  stoneWt: number
  /** Extra fine metal charged as wastage, in % of net weight. */
  wastagePct: number
  rate: number
  makingPerGm: number
  stoneCost: number
  otherCharges: number
  discount: number
  huid: string
  addToStock: boolean
}

const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r${Date.now()}${Math.floor(Math.random() * 1e6)}`

const round2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2))
const round3 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(3))

/** Fineness % from a purity string like "22K", "916", "22K (916)". */
const finePct = (purity: string): number => {
  const paren = purity.match(/\((\d{3})\)/)
  if (paren) return Number(paren[1]) / 10
  const k = purity.match(/(\d{1,2})\s*K/i)
  if (k) return (Number(k[1]) / 24) * 100
  const n = Number(purity)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 0
}

const newRow = (metal: MetalType = "gold", rate = 0): Row => ({
  id: rid(),
  description: "",
  type: metal,
  category: "Ring",
  purity: "22K",
  grossWt: 0,
  stoneWt: 0,
  wastagePct: 0,
  rate,
  makingPerGm: 0,
  stoneCost: 0,
  otherCharges: 0,
  discount: 0,
  huid: "",
  addToStock: true,
})

const rowNet = (r: Row) => Math.max(0, round3(r.grossWt - r.stoneWt))
const rowMaking = (r: Row) => round2(rowNet(r) * r.makingPerGm)
/** Chargeable fine metal = net × (purity% + wastage%). Rate is applied to this. */
const rowFine = (r: Row) =>
  round3(rowNet(r) * ((finePct(r.purity) + Math.max(0, r.wastagePct || 0)) / 100))
const rowAmount = (r: Row) =>
  round2(rowFine(r) * r.rate + rowMaking(r) + r.stoneCost + r.otherCharges - r.discount)

export function PurchaseFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const suppliers = useLiveData(() => suppliersService.getAll(), [], [])
  const existing = useLiveData(() => purchaseService.getInvoices(), [], [])
  const [supplierId, setSupplierId] = useState("")
  const [purchaseType, setPurchaseType] = useState("jewellery")
  const [billNo, setBillNo] = useState("")
  const [date, setDate] = useState(todayStr())
  const [goldRate, setGoldRate] = useState(0)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash")
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [gstRate, setGstRate] = useState(3)
  const [amountPaid, setAmountPaid] = useState(0)
  const [markup, setMarkup] = useState(0)
  const [advOpen, setAdvOpen] = useState(false)
  const [supOpen, setSupOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setSupplierId("")
    setPurchaseType("jewellery")
    setBillNo("")
    setDate(todayStr())
    setGoldRate(0)
    setPaymentMode("cash")
    setRows([newRow()])
    setGstRate(3)
    setAmountPaid(0)
    setMarkup(0)
    setAdvOpen(false)
  }, [open])

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const onType = (v: string) => {
    setPurchaseType(v)
    const metal = PURCHASE_TYPES.find((t) => t.value === v)?.metal ?? "gold"
    setRows((rs) => rs.map((r) => ({ ...r, type: metal })))
  }
  const onGoldRate = (v: number) => {
    setGoldRate(v)
    setRows((rs) => rs.map((r) => ({ ...r, rate: r.rate === goldRate || r.rate === 0 ? v : r.rate })))
  }
  const metalForNew = PURCHASE_TYPES.find((t) => t.value === purchaseType)?.metal ?? "gold"

  const t = useMemo(() => {
    const gross = round2(rows.reduce((s, r) => s + rowAmount(r), 0))
    const cgst = round2((gross * (gstRate / 2)) / 100)
    const net = round2(gross + cgst * 2)
    const totalNet = round3(rows.reduce((s, r) => s + rowNet(r), 0))
    const totalPure = round3(rows.reduce((s, r) => s + rowFine(r), 0))
    const totalGrossWt = round3(rows.reduce((s, r) => s + r.grossWt, 0))
    const avgCostPerGram = totalNet > 0 ? round2(gross / totalNet) : 0
    const estSelling = round2(gross * (1 + markup / 100))
    const estProfit = round2(estSelling - gross)
    const margin = estSelling > 0 ? round2((estProfit / estSelling) * 100) : 0
    return { gross, cgst, net, totalNet, totalPure, totalGrossWt, avgCostPerGram, estSelling, estProfit, margin }
  }, [rows, gstRate, markup])

  const balance = round2(t.net - amountPaid)

  const save = async () => {
    if (!supplierId) return toast.error("Select a supplier")
    const items = rows.filter((r) => r.description.trim() || r.grossWt > 0)
    if (items.length === 0) return toast.error("Add at least one item")
    if (items.some((r) => r.grossWt < 0 || r.stoneWt < 0 || r.rate < 0 || r.makingPerGm < 0 || r.discount < 0))
      return toast.error("Weights and amounts can't be negative")
    if (billNo.trim()) {
      const dup = existing.some(
        (inv) =>
          inv.supplierId === Number(supplierId) &&
          (inv.billNo ?? "").trim().toLowerCase() === billNo.trim().toLowerCase(),
      )
      if (dup) return toast.error(`Invoice ${billNo} is already recorded for this supplier`)
    }
    const huids = items.map((r) => r.huid.trim().toUpperCase()).filter(Boolean)
    if (new Set(huids).size !== huids.length) return toast.error("Duplicate HUID in this purchase")

    const draft: PurchaseDraft = {
      invoice: {
        supplierId: Number(supplierId),
        billNo: billNo.trim() || undefined,
        date,
        purchaseType,
        paymentMode,
        goldRate: goldRate || undefined,
        totalGrossAmount: t.gross,
        cgst: t.cgst,
        sgst: t.cgst,
        netAmount: t.net,
        amountPaid,
        balance,
      },
      items: items.map((r) => ({
        description: r.description || "Item",
        type: r.type,
        category: r.category,
        purity: r.purity,
        grossWt: r.grossWt,
        stoneWt: r.stoneWt || undefined,
        netWt: rowNet(r),
        wastagePct: r.wastagePct || undefined,
        pureGoldWt: rowFine(r),
        rate: r.rate,
        makingAmount: rowMaking(r),
        stoneCost: r.stoneCost || undefined,
        otherCharges: r.otherCharges || undefined,
        discount: r.discount || undefined,
        costPerGram: rowNet(r) > 0 ? round2(rowAmount(r) / rowNet(r)) : 0,
        huid: r.huid.trim() || undefined,
        amount: rowAmount(r),
      })),
    }
    let saved
    try {
      saved = await purchaseService.create(draft)
    } catch (err) {
      toast.error(`Could not save purchase: ${(err as Error).message}`)
      return
    }

    // The purchase is now committed. Adding the ticked rows to stock is a
    // separate, best-effort step: one row failing must NOT abort the others or
    // masquerade as a purchase-save failure — otherwise the bill saves while the
    // items silently don't, with a misleading "could not save" error.
    // Silver is tracked by weight only (never tag-stocked); the purchase already
    // logged its weight to the metal ledger. Gold/other honour the Stock tick.
    const stockRows = items.filter((r) => r.addToStock && r.type !== "silver")
    let added = 0
    const failures: string[] = []
    for (const r of stockRows) {
      try {
        await itemsService.add({
          name: r.description || "Item",
          type: r.type,
          category: r.category,
          purity: r.purity,
          grossWt: r.grossWt,
          stoneWt: r.stoneWt,
          makingChargePerGm: r.makingPerGm,
          huid: r.huid.trim() || undefined,
          quantity: 1,
          tagPrefix: categoryByLabel(r.category)?.prefix ?? "ITM",
        })
        added++
      } catch (err) {
        failures.push(`${r.description || "Item"}: ${(err as Error).message}`)
      }
    }

    if (failures.length) {
      toast.error(
        `Saved ${saved.purchaseNo}, but ${failures.length} item(s) could not be added to stock — ${failures[0]}`,
      )
    } else {
      toast.success(
        `Saved ${saved.purchaseNo}${added ? ` · ${added} item(s) added to stock` : ""}`,
      )
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>New Purchase</DialogTitle>
          <DialogDescription>
            Net weight, pure gold, cost/gram and totals are calculated for you. Ticked lines
            are added to live inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {/* Header */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <div className="flex gap-1">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="flex-1 min-w-0">
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
                <Button variant="outline" size="icon" onClick={() => setSupOpen(true)} title="New supplier">
                  <UserPlus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Purchase Type</Label>
              <Select value={purchaseType} onValueChange={onType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURCHASE_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI / Bank</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Bill No</Label>
              <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Gold Rate ₹/g</Label>
              <Input
                type="number"
                min={0}
                className="tabular text-right"
                value={goldRate || ""}
                onChange={(e) => onGoldRate(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
              />
            </div>
          </div>

          {/* Items grid */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Items</Label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAdvOpen((v) => !v)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {advOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  Advanced
                </button>
                <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, newRow(metalForNew, goldRate)])}>
                  <Plus className="size-4" /> Row
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className={cn("w-full border-collapse text-sm", advOpen ? "min-w-[1320px]" : "min-w-[980px]")}>
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
                    <th>Description</th>
                    <th className="w-28">Category</th>
                    <th className="w-14">Purity</th>
                    <th className="w-16 text-right">Gross</th>
                    <th className="w-16 text-right">Stone</th>
                    <th className="w-16 text-right">Net</th>
                    <th className="w-16 text-right" title="Wastage % of net weight">Wastage%</th>
                    <th className="w-16 text-right" title="Fine metal = net × (purity% + wastage%)">Fine</th>
                    <th className="w-20 text-right" title="Rate per fine (pure) gram">Rate/g</th>
                    <th className="w-20 text-right">Making/g</th>
                    {advOpen && <th className="w-20 text-right">Stone ₹</th>}
                    {advOpen && <th className="w-20 text-right">Other ₹</th>}
                    {advOpen && <th className="w-20 text-right">Disc ₹</th>}
                    {advOpen && <th className="w-24">HUID</th>}
                    <th className="w-24 text-right">Amount</th>
                    <th className="w-12 text-center" title="Add to stock">Stock</th>
                    <th className="w-7" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t [&>td]:px-1 [&>td]:py-0.5">
                      <td>
                        <TextCell value={r.description} onChange={(v) => update(r.id, { description: v })} placeholder="e.g. Gold ring" />
                      </td>
                      <td>
                        <Select
                          value={r.category}
                          onValueChange={(v) => update(r.id, { category: v, type: categoryByLabel(v)?.defaultType ?? r.type })}
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
                        <TextCell value={r.purity} onChange={(v) => update(r.id, { purity: v })} />
                      </td>
                      <td>
                        <NumCell value={r.grossWt} onChange={(v) => update(r.id, { grossWt: v })} />
                      </td>
                      <td>
                        <NumCell value={r.stoneWt} onChange={(v) => update(r.id, { stoneWt: v })} />
                      </td>
                      <td className="px-2 text-right tabular text-muted-foreground">{wt(rowNet(r))}</td>
                      <td>
                        <NumCell value={r.wastagePct} step={0.1} onChange={(v) => update(r.id, { wastagePct: v })} />
                      </td>
                      <td className="px-2 text-right tabular text-muted-foreground">{wt(rowFine(r))}</td>
                      <td>
                        <NumCell value={r.rate} step={1} onChange={(v) => update(r.id, { rate: v })} />
                      </td>
                      <td>
                        <NumCell value={r.makingPerGm} step={1} onChange={(v) => update(r.id, { makingPerGm: v })} />
                      </td>
                      {advOpen && (
                        <td>
                          <NumCell value={r.stoneCost} step={1} onChange={(v) => update(r.id, { stoneCost: v })} />
                        </td>
                      )}
                      {advOpen && (
                        <td>
                          <NumCell value={r.otherCharges} step={1} onChange={(v) => update(r.id, { otherCharges: v })} />
                        </td>
                      )}
                      {advOpen && (
                        <td>
                          <NumCell value={r.discount} step={1} onChange={(v) => update(r.id, { discount: v })} />
                        </td>
                      )}
                      {advOpen && (
                        <td>
                          <TextCell value={r.huid} onChange={(v) => update(r.id, { huid: v })} placeholder="HUID" />
                        </td>
                      )}
                      <td className="px-2 text-right font-medium tabular">{formatAmount(rowAmount(r))}</td>
                      <td className="text-center">
                        {r.type === "silver" ? (
                          <span className="text-[10px] text-muted-foreground" title="Silver is tracked by weight — no barcode tag">By wt</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={r.addToStock}
                            onChange={(e) => update(r.id, { addToStock: e.target.checked })}
                            aria-label="Add to stock"
                            className="size-4 cursor-pointer accent-primary"
                          />
                        )}
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
            {/* Totals strip */}
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span>Gross <b className="text-foreground">{wt(t.totalGrossWt)} g</b></span>
              <span>Net <b className="text-foreground">{wt(t.totalNet)} g</b></span>
              <span>Fine metal <b className="text-foreground">{wt(t.totalPure)} g</b></span>
              <span>Avg cost/g <b className="text-foreground">₹{formatAmount(t.avgCostPerGram)}</b></span>
              {markup > 0 && (
                <span>Est. profit <b className="text-emerald-600">₹{formatAmount(t.estProfit)}</b> · margin {t.margin}%</span>
              )}
            </div>
          </div>

          {/* Tax + payment */}
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-5">
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
            {advOpen && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Est. markup %</Label>
                <Input
                  type="number"
                  min={0}
                  className="tabular text-right"
                  value={markup || ""}
                  onChange={(e) => setMarkup(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amount Paid (₹)</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={amountPaid || ""}
                onChange={(e) => setAmountPaid(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
              />
            </div>
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Net Payable</div>
              <div className="font-semibold tabular">{formatAmount(t.net)}</div>
            </div>
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Balance</div>
              <div
                className={cn(
                  "font-semibold tabular",
                  balance > 0 ? "text-destructive" : balance < 0 ? "text-emerald-600" : "text-muted-foreground",
                )}
              >
                {balance > 0 ? formatAmount(balance) : balance < 0 ? `${formatAmount(-balance)} Adv` : "Settled"}
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

      <SupplierFormDialog open={supOpen} onOpenChange={setSupOpen} onSaved={(s) => setSupplierId(String(s.id))} />
    </Dialog>
  )
}
