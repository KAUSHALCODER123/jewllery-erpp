import { useEffect, useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import { toast } from "sonner"
import type { Order } from "@/db/types"
import { karigarsService, ordersService, todayStr } from "@/services/dbService"
import { wt } from "@/lib/format"
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

export function AssignWorkshopDialog({
  order,
  onOpenChange,
}: {
  order: Order | null
  onOpenChange: (o: boolean) => void
}) {
  const user = useSession((s) => s.user)
  const karigars = useLiveData(() => karigarsService.getAll(), [], [])

  const [karigarId, setKarigarId] = useState("")
  const [metalWt, setMetalWt] = useState(0)
  const [wastage, setWastage] = useState(2)
  const [saving, setSaving] = useState(false)

  const orderNet = useMemo(
    () => (order ? Number(order.items.reduce((s, i) => s + i.netWt, 0).toFixed(3)) : 0),
    [order],
  )
  const orderDesc = useMemo(
    () => order?.items.map((i) => i.description).filter(Boolean).join(", ") || "Custom order",
    [order],
  )

  useEffect(() => {
    if (!order) return
    setKarigarId("")
    setMetalWt(orderNet)
    setWastage(2)
  }, [order, orderNet])

  if (!order) return null

  const save = async () => {
    if (!karigarId) return toast.error("Select a karigar")
    if (!(metalWt > 0)) return toast.error("Enter the metal weight to issue")
    setSaving(true)
    try {
      const job = await karigarsService.issueJob({
        karigarId: Number(karigarId),
        issuedDate: todayStr(),
        metalIssuedWt: metalWt,
        wastageAllowed: wastage,
        description: orderDesc,
        orderId: order.id,
      })
      await ordersService.setStatus(order.id!, "assigned_workshop", {
        by: user?.name,
        remarks: `Workshop job ${job.jobNo}`,
      })
      toast.success(`${order.orderNo} assigned to workshop (job ${job.jobNo})`)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not assign: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to Workshop — {order.orderNo}</DialogTitle>
          <DialogDescription>
            Issues metal to a karigar and creates a linked workshop job. Order net weight ≈{" "}
            {wt(orderNet)} g.
          </DialogDescription>
        </DialogHeader>

        {karigars.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            No karigars yet. Add one from the <span className="font-medium">Karigar</span> screen first.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Karigar</Label>
              <Select value={karigarId} onValueChange={setKarigarId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select karigar" />
                </SelectTrigger>
                <SelectContent>
                  {karigars.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Metal Issued (g)</Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                className="tabular text-right"
                value={metalWt || ""}
                onChange={(e) => setMetalWt(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Wastage Allowed %</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                className="tabular text-right"
                value={wastage || ""}
                onChange={(e) => setWastage(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || karigars.length === 0}>
            Assign &amp; Issue Metal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
