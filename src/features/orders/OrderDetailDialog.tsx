import { useLiveData } from "@/db/useLiveData"
import { Printer } from "lucide-react"
import type { Order } from "@/db/types"
import { customersService, ordersService, karigarsService } from "@/services/dbService"
import { ORDER_STATUS_META, orderTypeLabel } from "@/lib/constants"
import { formatAmount, formatDate, wt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function OrderDetailDialog({
  order,
  onOpenChange,
}: {
  order: Order | null
  onOpenChange: (o: boolean) => void
}) {
  const customer = useLiveData(
    () => (order ? customersService.get(order.customerId) : Promise.resolve(undefined)),
    [order?.customerId],
    undefined,
  )
  const payments = useLiveData(
    () => (order?.id ? ordersService.getPayments(order.id) : Promise.resolve([])),
    [order?.id],
    [],
  )
  const allJobs = useLiveData(() => karigarsService.getJobs(), [], [])
  const karigars = useLiveData(() => karigarsService.getAll(), [], [])

  if (!order) return null
  const workshopJobs = allJobs.filter((j) => j.orderId === order.id)
  const karigarName = (id: number) => karigars.find((k) => k.id === id)?.name ?? "—"
  const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.confirmed
  const balance = Number((order.estimatedAmount - order.advanceReceived).toFixed(2))

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {order.orderNo}
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", meta.tone)}>{meta.label}</span>
            {order.priority === "urgent" && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800">Urgent</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {orderTypeLabel(order.orderType)} · booked {formatDate(order.date)}
            {order.deliveryDate ? ` · due ${formatDate(order.deliveryDate)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1 text-sm print-area">
          {/* Customer */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              <Meta label="Name" value={customer?.name ?? "—"} />
              <Meta label="Mobile" value={customer?.mobile ?? "—"} />
              <Meta label="City" value={customer?.city ?? "—"} />
              <Meta label="Salesperson" value={order.salesperson ?? "—"} />
              <Meta label="Loyalty" value={`${customer?.loyaltyPoints ?? 0} pts`} />
              <Meta label="Booked by" value={order.createdBy ?? "—"} />
            </div>
          </section>

          {/* Items */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="[&>th]:py-1 [&>th]:text-left">
                    <th>Description</th>
                    <th className="w-16">Purity</th>
                    <th className="w-20 text-right">Net</th>
                    <th className="w-24 text-right">Making/g</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it, i) => (
                    <tr key={i} className="border-t [&>td]:py-1">
                      <td>{it.description || "—"}</td>
                      <td className="text-muted-foreground">{it.purity}</td>
                      <td className="text-right tabular">{wt(it.netWt)}</td>
                      <td className="text-right tabular">{formatAmount(it.makingPerGm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Pricing */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <Row label="Gold Value" value={order.goldValue ?? 0} />
              <Row label="Making Charges" value={order.makingCharges ?? 0} />
              {order.stoneCharges ? <Row label="Stone Charges" value={order.stoneCharges} /> : null}
              {order.otherCharges ? <Row label="Other Charges" value={order.otherCharges} /> : null}
              {order.discount ? <Row label="Discount" value={-order.discount} /> : null}
              <Row label={`GST (${order.gstRate ?? 0}%)`} value={order.gstAmount ?? 0} />
              <Row label="Estimated Total" value={order.estimatedAmount} strong />
              {order.estimatedProfit != null && <Row label="Est. Profit" value={order.estimatedProfit} />}
            </div>
          </section>

          {/* Advance payments */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Advance Payments
            </h4>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No advance received yet.</p>
            ) : (
              <div className="space-y-1">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatDate(p.date)}</span>
                    <span className="capitalize text-muted-foreground">{p.mode}</span>
                    {p.notes && <span className="truncate text-[11px] text-muted-foreground">· {p.notes}</span>}
                    <span className="ml-auto tabular">₹{formatAmount(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t pt-1.5 font-medium">
              <span>Advance received</span>
              <span className="tabular">₹{formatAmount(order.advanceReceived)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Balance due</span>
              <span className={cn("tabular font-semibold", balance > 0 ? "text-destructive" : "text-emerald-600")}>
                ₹{formatAmount(balance)}
              </span>
            </div>
          </section>

          {/* Workshop / manufacturing */}
          {workshopJobs.length > 0 && (
            <section className="rounded-lg border p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Manufacturing Progress
              </h4>
              <div className="space-y-1.5">
                {workshopJobs.map((j) => (
                  <div key={j.id} className="flex items-center gap-2">
                    <span className="font-medium">{j.jobNo}</span>
                    <span className="text-muted-foreground">{karigarName(j.karigarId)}</span>
                    <span className="ml-auto tabular text-muted-foreground">
                      issued {wt(j.metalIssuedWt)} g
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
                        j.status === "received" || j.status === "closed"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                      )}
                    >
                      {j.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {order.notes && (
            <section className="rounded-lg border p-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remarks</h4>
              <p className="whitespace-pre-line">{order.notes}</p>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", strong && "border-t pt-1 font-semibold")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">₹{formatAmount(value)}</span>
    </div>
  )
}
