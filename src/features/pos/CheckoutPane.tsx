import { useEffect, useMemo, useRef } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Printer, Save, RotateCcw, Star } from "lucide-react"
import { toast } from "sonner"
import type { SaleDraft } from "@/services/dbService"
import { salesService, customersService, todayStr } from "@/services/dbService"
import { formatAmount, formatINR } from "@/lib/format"
import { LOYALTY_EARN_PER_GRAM, LOYALTY_RUPEES_PER_POINT } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePosStore } from "./usePosStore"
import {
  GST_RATES,
  computeTotals,
  lineAmount,
  lineMakingAmount,
  urdAmount,
  urdNetWt,
} from "./calc"
import type { PrintPayload } from "./InvoiceReceipt"

export function CheckoutPane({
  onSaved,
}: {
  onSaved: (payload: PrintPayload) => void
}) {
  const store = usePosStore()
  const {
    customerId,
    sales,
    urd,
    gstRate,
    cashPaid,
    upiPaid,
    billDiscount,
    makingDiscount,
    tcsPct,
    interState,
    salesman,
    loyaltyRedeem,
    setGstRate,
    setCashPaid,
    setUpiPaid,
    setBillDiscount,
    setMakingDiscount,
    setTcsPct,
    setInterState,
    setSalesman,
    setLoyaltyRedeem,
  } = store

  const isEdit = !!store.editingInvoiceId

  // Selected customer's loyalty balance (for redemption + display).
  const customer = useLiveQuery(
    () => (customerId ? customersService.get(customerId) : Promise.resolve(undefined)),
    [customerId],
    undefined,
  )
  const availablePoints = customer?.loyaltyPoints ?? 0
  const cappedRedeem = Math.min(Math.max(0, loyaltyRedeem), availablePoints)
  // Don't re-award/redeem when editing an existing bill.
  const loyaltyDiscount = isEdit ? 0 : cappedRedeem * LOYALTY_RUPEES_PER_POINT

  const totals = useMemo(
    () =>
      computeTotals(sales, urd, gstRate, cashPaid, upiPaid, {
        billDiscount,
        makingDiscount,
        loyaltyDiscount,
        tcsPct,
        interState,
        advanceApplied: store.advanceApplied,
      }),
    [sales, urd, gstRate, cashPaid, upiPaid, billDiscount, makingDiscount, loyaltyDiscount, tcsPct, interState, store.advanceApplied],
  )

  const pointsEarned = isEdit
    ? 0
    : Math.round(totals.salesNetWt * LOYALTY_EARN_PER_GRAM)

  const canSave = customerId != null && sales.length > 0

  // F12 = Save & Print (keyboard-first billing).
  const saveRef = useRef<() => void>(() => {})
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const handleSave = async () => {
    if (customerId == null) {
      toast.error("Select a customer first")
      return
    }
    if (sales.length === 0) {
      toast.error("Add at least one item to the bill")
      return
    }

    const draft: SaleDraft = {
      invoice: {
        customerId,
        date: todayStr(),
        totalGrossAmount: totals.salesTotal,
        totalUrdAmount: totals.urdTotal,
        billDiscount: totals.billDiscount,
        makingDiscount: totals.makingDiscount,
        taxableAmount: totals.taxable,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        tcs: totals.tcs,
        interState,
        salesman: salesman || undefined,
        loyaltyDiscount: totals.loyaltyDiscount,
        pointsEarned,
        pointsRedeemed: isEdit ? 0 : cappedRedeem,
        netAmount: totals.netAmount,
        cashPaid,
        upiPaid,
        balance: totals.balance,
        notes: store.notes || undefined,
        orderId: store.orderId || undefined,
        advanceApplied: store.advanceApplied || undefined,
      },
      items: sales.map((l) => ({
        itemId: l.itemId,
        description: l.description || l.tag || "Item",
        netWt: l.netWt,
        rate: l.rate,
        makingAmount: lineMakingAmount(l),
        hsn: l.hsn || "7113",
        finalAmount: lineAmount(l),
      })),
      urd: urd.map((u) => ({
        description: u.description || "Old gold",
        type: "gold" as const,
        purity: "—",
        grossWt: u.grossWt,
        deductionWt: Number((u.grossWt - urdNetWt(u)).toFixed(3)),
        netWt: urdNetWt(u),
        rate: u.rate,
        amount: urdAmount(u),
      })),
    }

    try {
      const saved = store.editingInvoiceId
        ? await salesService.updateInvoice(store.editingInvoiceId, draft)
        : await salesService.createInvoice(draft)
      toast.success(
        `${store.editingInvoiceId ? "Updated" : "Saved"} ${saved.invoiceNo} · ${formatINR(totals.netAmount)}`,
      )
      onSaved({ invoice: saved, items: draft.items, urd: draft.urd, totals })
      store.reset()
    } catch (err) {
      toast.error(`Could not save bill: ${(err as Error).message}`)
    }
  }

  // Keep the F12 handler pointed at the latest save closure.
  saveRef.current = () => {
    if (canSave) void handleSave()
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <div className="border-b px-4 py-2">
        <h2 className="text-sm font-semibold">Checkout</h2>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {/* Salesman */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Salesman</Label>
          <Input
            value={salesman}
            onChange={(e) => setSalesman(e.target.value)}
            placeholder="optional"
            className="h-8"
          />
        </div>

        {/* Discounts */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bill Disc. ₹</Label>
            <Input
              type="number"
              className="h-8 tabular text-right"
              value={billDiscount || ""}
              onChange={(e) =>
                setBillDiscount(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Making Disc. ₹</Label>
            <Input
              type="number"
              className="h-8 tabular text-right"
              value={makingDiscount || ""}
              onChange={(e) =>
                setMakingDiscount(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
              }
            />
          </div>
        </div>

        {/* Totals breakdown */}
        <div className="space-y-1.5 text-sm">
          <Row label="Sales Total" value={totals.salesTotal} />
          <Row
            label="Less: Old Gold (URD)"
            value={-totals.urdTotal}
            muted={totals.urdTotal === 0}
            negative={totals.urdTotal > 0}
          />
          {totals.billDiscount > 0 && (
            <Row label="Less: Bill Discount" value={-totals.billDiscount} negative />
          )}
          {totals.makingDiscount > 0 && (
            <Row label="Less: Making Discount" value={-totals.makingDiscount} negative />
          )}
          {totals.loyaltyDiscount > 0 && (
            <Row label="Less: Loyalty Redeemed" value={-totals.loyaltyDiscount} negative />
          )}
          <div className="my-1 border-t" />
          <Row label="Taxable" value={totals.taxable} />
        </div>

        {/* GST */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">GST</Label>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={interState}
                onChange={(e) => setInterState(e.target.checked)}
              />
              Inter-state (IGST)
            </label>
          </div>
          <Select
            value={String(gstRate)}
            onValueChange={(v) => setGstRate(Number(v))}
          >
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
          <div className="space-y-1 text-sm">
            {interState ? (
              <Row label={`IGST (${gstRate}%)`} value={totals.igst} small />
            ) : (
              <>
                <Row label={`CGST (${gstRate / 2}%)`} value={totals.cgst} small />
                <Row label={`SGST (${gstRate / 2}%)`} value={totals.sgst} small />
              </>
            )}
          </div>
        </div>

        {/* TCS */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">TCS %</Label>
          <Input
            type="number"
            step="0.1"
            className="h-8 w-20 tabular text-right"
            value={tcsPct || ""}
            onChange={(e) =>
              setTcsPct(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
            }
          />
          {totals.tcs > 0 && (
            <span className="ml-auto text-sm tabular">{formatAmount(totals.tcs)}</span>
          )}
        </div>

        {/* Loyalty */}
        {customerId != null && !isEdit && (
          <div className="space-y-1.5 rounded-md border border-dashed p-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Star className="size-3.5 text-primary" />
              <span>Loyalty: {availablePoints} pts available</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Redeem</Label>
              <Input
                type="number"
                className="h-8 w-24 tabular text-right"
                value={loyaltyRedeem || ""}
                max={availablePoints}
                onChange={(e) =>
                  setLoyaltyRedeem(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))
                }
                disabled={availablePoints === 0}
              />
              <button
                className="text-[11px] text-primary hover:underline disabled:opacity-40"
                disabled={availablePoints === 0}
                onClick={() => setLoyaltyRedeem(availablePoints)}
              >
                max
              </button>
              {cappedRedeem > 0 && (
                <span className="ml-auto text-xs tabular text-emerald-600">
                  −{formatAmount(loyaltyDiscount)}
                </span>
              )}
            </div>
            {pointsEarned > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Earns <span className="font-medium text-primary">+{pointsEarned} pts</span> on this sale
              </p>
            )}
          </div>
        )}

        {store.advanceApplied > 0 && (
          <div className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
            <span className="font-medium">Order Advance Adjusted</span>
            <span className="font-bold tabular">
              −{formatAmount(store.advanceApplied)}
            </span>
          </div>
        )}

        {/* Net payable */}
        <div className="rounded-md bg-primary/10 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Net Payable
            </span>
            <span className="text-lg font-bold tabular text-primary">
              {formatINR(totals.netAmount)}
            </span>
          </div>
        </div>

        {/* Payments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Cash Received</Label>
            <button
              className="text-[11px] text-primary hover:underline"
              onClick={() => {
                setCashPaid(Math.max(0, totals.netAmount - upiPaid - store.advanceApplied))
              }}
            >
              full
            </button>
          </div>
          <Input
            type="number"
            className="tabular text-right"
            value={cashPaid || ""}
            onChange={(e) =>
              setCashPaid(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
            }
          />
          <Label className="text-xs text-muted-foreground">UPI Received</Label>
          <Input
            type="number"
            className="tabular text-right"
            value={upiPaid || ""}
            onChange={(e) =>
              setUpiPaid(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
            }
          />
        </div>

        {/* Balance */}
        <div
          className={cn(
            "flex items-center justify-between rounded-md px-3 py-2",
            totals.balance > 0
              ? "bg-destructive/10 text-destructive"
              : totals.balance < 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-muted text-muted-foreground",
          )}
        >
          <span className="text-xs font-medium">
            {totals.balance > 0
              ? "Balance Due"
              : totals.balance < 0
                ? "Change / Advance"
                : "Settled"}
          </span>
          <span className="text-base font-bold tabular">
            {formatAmount(Math.abs(totals.balance))}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t p-3">
        <Button
          className="w-full"
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          <Save className="size-4" />{" "}
          {store.editingInvoiceId ? "Update & Print" : "Save & Print"}
          <kbd className="ml-auto rounded bg-primary-foreground/20 px-1 text-[10px]">
            F12
          </kbd>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            <Printer className="size-4" /> Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => store.reset()}
          >
            <RotateCcw className="size-4" /> Clear
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  muted,
  negative,
  small,
}: {
  label: string
  value: number
  muted?: boolean
  negative?: boolean
  small?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between",
        small && "text-xs",
        muted && "text-muted-foreground",
      )}
    >
      <span className={cn(!small && "text-muted-foreground")}>{label}</span>
      <span className={cn("tabular", negative && "text-destructive")}>
        {formatAmount(value)}
      </span>
    </div>
  )
}
