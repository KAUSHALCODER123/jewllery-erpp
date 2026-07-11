import { Check, Circle, XCircle } from "lucide-react"
import type { Order } from "@/db/types"
import { ORDER_WORKFLOW, ORDER_STATUS_META, orderStatusIndex, orderTypeLabel } from "@/lib/constants"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function fmtStamp(iso?: string): string {
  if (!iso) return ""
  const d = iso.slice(0, 10)
  const t = iso.length > 10 ? iso.slice(11, 16) : ""
  return t ? `${formatDate(d)} ${t}` : formatDate(d)
}

export function OrderTimelineDialog({
  order,
  onOpenChange,
}: {
  order: Order | null
  onOpenChange: (o: boolean) => void
}) {
  if (!order) return null
  const cancelled = order.status === "cancelled"
  const reachedIdx = orderStatusIndex(order.status)
  const history = order.statusHistory ?? []
  const lastFor = (status: string) => [...history].reverse().find((h) => h.status === status)

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{order.orderNo} — Timeline</DialogTitle>
          <DialogDescription>
            {orderTypeLabel(order.orderType)}
            {order.deliveryDate ? ` · due ${formatDate(order.deliveryDate)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {cancelled && (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
              <XCircle className="size-4" /> Order cancelled
              <span className="ml-auto text-xs font-normal">{fmtStamp(lastFor("cancelled")?.at)}</span>
            </div>
          )}
          <ol className="relative space-y-0">
            {ORDER_WORKFLOW.map((step, i) => {
              const meta = ORDER_STATUS_META[step]
              const entry = lastFor(step)
              const reached = !!entry || (reachedIdx >= 0 && i <= reachedIdx)
              const isLast = i === ORDER_WORKFLOW.length - 1
              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border",
                        reached
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-muted-foreground/30 text-muted-foreground/40",
                      )}
                    >
                      {reached ? <Check className="size-3.5" /> : <Circle className="size-2 fill-current" />}
                    </span>
                    {!isLast && <span className={cn("w-px flex-1", reached ? "bg-emerald-500/50" : "bg-border")} style={{ minHeight: 18 }} />}
                  </div>
                  <div className={cn("pb-3", !reached && "opacity-50")}>
                    <div className="text-sm font-medium">{meta.label}</div>
                    {entry && (
                      <div className="text-[11px] text-muted-foreground">
                        {fmtStamp(entry.at)}
                        {entry.by ? ` · ${entry.by}` : ""}
                        {entry.remarks ? ` · ${entry.remarks}` : ""}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}
