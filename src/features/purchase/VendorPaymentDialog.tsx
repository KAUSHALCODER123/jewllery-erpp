import { useEffect, useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import { toast } from "sonner"
import type { PaymentMode, Supplier } from "@/db/types"
import { purchasePaymentsService, purchaseService, todayStr } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { useSession } from "@/stores/useSession"
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

export function VendorPaymentDialog({
  vendor,
  onOpenChange,
}: {
  vendor: Supplier | null
  onOpenChange: (o: boolean) => void
}) {
  const user = useSession((s) => s.user)
  const invoices = useLiveData(() => purchaseService.getInvoices(), [], [])
  const [amount, setAmount] = useState(0)
  const [mode, setMode] = useState<PaymentMode>("cash")
  const [date, setDate] = useState(todayStr())
  const [purchaseId, setPurchaseId] = useState("onaccount")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const unpaid = useMemo(
    () => invoices.filter((p) => p.supplierId === vendor?.id && p.balance > 0),
    [invoices, vendor?.id],
  )

  useEffect(() => {
    if (!vendor) return
    setAmount(0)
    setMode("cash")
    setDate(todayStr())
    setPurchaseId("onaccount")
    setNotes("")
  }, [vendor])

  if (!vendor) return null

  const save = async () => {
    if (!(amount > 0)) return toast.error("Enter an amount greater than zero")
    setSaving(true)
    try {
      await purchasePaymentsService.add({
        supplierId: vendor.id!,
        purchaseId: purchaseId === "onaccount" ? undefined : Number(purchaseId),
        date,
        amount,
        mode,
        notes: notes || undefined,
        createdBy: user?.name,
      })
      toast.success(`Paid ₹${formatAmount(amount)} to ${vendor.name}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!vendor} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay Vendor — {vendor.name}</DialogTitle>
          <DialogDescription>Record a payment against a bill or on account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Against</Label>
            <Select value={purchaseId} onValueChange={setPurchaseId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="onaccount">On account (no specific bill)</SelectItem>
                {unpaid.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.purchaseNo} · {formatDate(p.date)} · bal ₹{formatAmount(p.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amount ₹</Label>
              <Input
                type="number"
                min={0}
                autoFocus
                className="tabular text-right"
                value={amount || ""}
                onChange={(e) => setAmount(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI / Bank</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
