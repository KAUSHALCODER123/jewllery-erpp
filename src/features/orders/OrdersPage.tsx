import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus, ClipboardList } from "lucide-react"
import { toast } from "sonner"
import type { OrderStatus } from "@/db/types"
import { ordersService, customersService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useNavigate } from "react-router-dom"
import { usePosStore } from "@/features/pos/usePosStore"
import { OrderFormDialog } from "./OrderFormDialog"

const STATUSES: OrderStatus[] = [
  "booked",
  "in_production",
  "ready",
  "delivered",
  "cancelled",
]

const STATUS_TONE: Record<OrderStatus, string> = {
  booked: "bg-blue-100 text-blue-800",
  in_production: "bg-amber-100 text-amber-800",
  ready: "bg-violet-100 text-violet-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-muted text-muted-foreground",
}

export function OrdersPage() {
  const [formOpen, setFormOpen] = useState(false)
  const navigate = useNavigate()
  const posStore = usePosStore()
  const orders = useLiveQuery(() => ordersService.getAll(), [], undefined)
  const customers = useLiveQuery(() => customersService.getAll(), [], [])
  const custName = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of customers) m.set(c.id!, c.name)
    return m
  }, [customers])

  const openCount = (orders ?? []).filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled",
  ).length

  const handleDeliver = (order: any) => {
    posStore.reset()
    posStore.setCustomer(order.customerId)
    posStore.setOrderLink(order.id!, order.advanceReceived)
    for (const item of order.items) {
      posStore.addSalesLine({
        description: item.description || "Custom Order Item",
        netWt: item.netWt,
        makingPerGm: item.makingPerGm,
        rate: 0,
      })
    }
    toast.info(`Loaded Order ${order.orderNo} into POS with ₹${order.advanceReceived} advance`)
    navigate("/billing")
  }

  return (
    <>
      <PageHeader
        title="Order Booking"
        subtitle={`${openCount} open orders`}
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> New Order
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        {orders && orders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <ClipboardList className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No custom orders yet.</p>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> New Order
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-24">Order No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Design</TableHead>
                <TableHead className="w-24">Delivery</TableHead>
                <TableHead className="w-28 text-right">Estimated</TableHead>
                <TableHead className="w-24 text-right">Advance</TableHead>
                <TableHead className="w-28 text-right">Balance</TableHead>
                <TableHead className="w-40">Status</TableHead>
                <TableHead className="w-28 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.orderNo}</TableCell>
                  <TableCell>{custName.get(o.customerId) ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {o.items.map((i) => i.description).filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.deliveryDate ? formatDate(o.deliveryDate) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {formatAmount(o.estimatedAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {formatAmount(o.advanceReceived)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular">
                    {formatAmount(o.estimatedAmount - o.advanceReceived)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={o.status}
                      onValueChange={async (v) => {
                        await ordersService.setStatus(o.id!, v as OrderStatus)
                        toast.success(`${o.orderNo} → ${v.replace("_", " ")}`)
                      }}
                    >
                      <SelectTrigger size="sm" className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
                                STATUS_TONE[s],
                              )}
                            >
                              {s.replace("_", " ")}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {o.status !== "delivered" && o.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-primary hover:text-primary/80 h-7 font-medium"
                        onClick={() => handleDeliver(o)}
                      >
                        Deliver & Bill
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <OrderFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  )
}
