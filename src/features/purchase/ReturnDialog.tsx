import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { PurchaseInvoice } from "@/db/types"
import { purchaseReturnsService, todayStr } from "@/services/dbService"
import { PURCHASE_RETURN_REASONS } from "@/lib/constants"
import { formatAmount } from "@/lib/format"
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

export function ReturnDialog({
  purchase,
  onOpenChange,
}: {
  purchase: PurchaseInvoice | null
  onOpenChange: (o: boolean) => void
}) {
  const user = useSession((s) => s.user)
  const [amount, setAmount] = useState(0)
  const [weight, setWeight] = useState(0)
  const [reason, setReason] = useState(PURCHASE_RETURN_REASONS[0])
  const [notes, setNotes] = useState("")
  const [date, setDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!purchase) return
    setAmount(purchase.netAmount)
    setWeight(0)
    setReason(PURCHASE_RETURN_REASONS[0])
    setNotes("")
    setDate(todayStr())
  }, [purchase])

  if (!purchase) return null

  const save = async () => {
    if (!(amount > 0)) return toast.error("Enter a return amount greater than zero")
    if (amount > purchase.netAmount + 0.01)
      return toast.error("Return amount can't exceed the purchase total")
    setSaving(true)
    try {
      const ret = await purchaseReturnsService.create({
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        date,
        amount,
        weight: weight || undefined,
        reason,
        notes: notes || undefined,
        createdBy: user?.name,
      })
      toast.success(`Return ${ret.returnNo} recorded · ₹${formatAmount(amount)} credited`)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!purchase} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return — {purchase.purchaseNo}</DialogTitle>
          <DialogDescription>
            Reduces this bill's payable by the return amount and logs a stock-out entry.
            Purchase total ₹{formatAmount(purchase.netAmount)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Return Amount ₹</Label>
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
            <Label className="text-xs text-muted-foreground">Weight (g)</Label>
            <Input
              type="number"
              step="0.001"
              min={0}
              className="tabular text-right"
              value={weight || ""}
              onChange={(e) => setWeight(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURCHASE_RETURN_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void save()} disabled={saving}>
            Record Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
