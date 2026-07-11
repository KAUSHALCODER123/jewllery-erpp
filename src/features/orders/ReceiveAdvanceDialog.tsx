import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Order, PaymentMode } from "@/db/types"
import { ordersService, todayStr } from "@/services/dbService"
import { formatAmount } from "@/lib/format"
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

export function ReceiveAdvanceDialog({
  order,
  onOpenChange,
}: {
  order: Order | null
  onOpenChange: (o: boolean) => void
}) {
  const user = useSession((s) => s.user)
  const [amount, setAmount] = useState(0)
  const [mode, setMode] = useState<PaymentMode>("cash")
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!order) return
    setAmount(0)
    setMode("cash")
    setDate(todayStr())
    setNotes("")
  }, [order])

  if (!order) return null
  const balance = Number((order.estimatedAmount - order.advanceReceived).toFixed(2))

  const save = async () => {
    if (!(amount > 0)) return toast.error("Enter an amount greater than zero")
    setSaving(true)
    try {
      await ordersService.addPayment(order.id!, { date, amount, mode, notes: notes || undefined, by: user?.name })
      toast.success(`Advance ₹${formatAmount(amount)} received for ${order.orderNo}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Advance — {order.orderNo}</DialogTitle>
          <DialogDescription>
            Balance due: ₹{formatAmount(balance)} · already received ₹{formatAmount(order.advanceReceived)}
          </DialogDescription>
        </DialogHeader>
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
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Receive Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
