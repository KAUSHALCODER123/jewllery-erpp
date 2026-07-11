import { useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import {
  Plus,
  ClipboardList,
  Clock,
  MoreHorizontal,
  Eye,
  IndianRupee,
  Truck,
  Copy,
  XCircle,
  Boxes,
  Hammer,
} from "lucide-react"
import { toast } from "sonner"
import type { Order, OrderStatus } from "@/db/types"
import { ordersService, customersService, todayStr } from "@/services/dbService"
import { ORDER_STATUS_META, ORDER_WORKFLOW, orderTypeLabel } from "@/lib/constants"
import { formatAmount, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNavigate } from "react-router-dom"
import { usePosStore } from "@/features/pos/usePosStore"
import { OrderFormDialog } from "./OrderFormDialog"
import { OrderTimelineDialog } from "./OrderTimelineDialog"
import { OrderDetailDialog } from "./OrderDetailDialog"
import { ReceiveAdvanceDialog } from "./ReceiveAdvanceDialog"
import { AssignWorkshopDialog } from "./AssignWorkshopDialog"

/** Statuses selectable from the row dropdown — the workflow plus Cancelled. */
const SELECTABLE: OrderStatus[] = [...ORDER_WORKFLOW, "cancelled"]

export function OrdersPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [timelineOrder, setTimelineOrder] = useState<Order | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [advanceOrder, setAdvanceOrder] = useState<Order | null>(null)
  const [assignOrder, setAssignOrder] = useState<Order | null>(null)
  const navigate = useNavigate()
  const posStore = usePosStore()
  const user = useSession((s) => s.user)
  const orders = useLiveData(() => ordersService.getAll(), [], undefined)
  const customers = useLiveData(() => customersService.getAll(), [], [])
  const custName = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of customers) m.set(c.id!, c.name)
    return m
  }, [customers])

  const openCount = (orders ?? []).filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled",
  ).length

  const handleDeliver = (order: Order) => {
    posStore.reset()
    posStore.setCustomer(order.customerId)
    posStore.setOrderLink(order.id!, order.advanceReceived)
    for (const item of order.items) {
      posStore.addSalesLine({
        description: item.description || "Custom Order Item",
        netWt: item.netWt,
        makingPerGm: item.makingPerGm,
        rate: order.goldRate ?? 0,
      })
    }
    toast.info(`Loaded Order ${order.orderNo} into POS with ₹${order.advanceReceived} advance`)
    navigate("/billing")
  }

  const duplicate = async (order: Order) => {
    const { id: _id, orderNo: _no, status: _s, statusHistory: _h, createdAt: _c, invoiceId: _i, ...rest } = order
    const dup = await ordersService.add(
      { ...rest, date: todayStr(), deliveryDate: undefined, advanceReceived: 0, createdBy: user?.name },
      { status: "draft" },
    )
    toast.success(`Duplicated as ${dup.orderNo} (draft)`)
  }

  const cancel = async (order: Order) => {
    if (!confirm(`Cancel order ${order.orderNo}?`)) return
    await ordersService.setStatus(order.id!, "cancelled", { by: user?.name })
    toast.success(`${order.orderNo} cancelled`)
  }

  const reserveGold = async (order: Order) => {
    const net = order.items.reduce((s, i) => s + i.netWt, 0)
    await ordersService.setStatus(order.id!, "gold_reserved", {
      by: user?.name,
      remarks: `${net.toFixed(3)} g reserved`,
    })
    toast.success(`Gold reserved for ${order.orderNo}`)
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
            <p className="text-sm text-muted-foreground">No orders yet.</p>
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
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-24">Delivery</TableHead>
                <TableHead className="w-28 text-right">Estimated</TableHead>
                <TableHead className="w-28 text-right">Balance</TableHead>
                <TableHead className="w-44">Status</TableHead>
                <TableHead className="w-36 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders ?? []).map((o) => {
                const meta = ORDER_STATUS_META[o.status] ?? ORDER_STATUS_META.confirmed
                const closed = o.status === "delivered" || o.status === "cancelled"
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.orderNo}</TableCell>
                    <TableCell>
                      <div>{custName.get(o.customerId) ?? "—"}</div>
                      <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                        {o.items.map((i) => i.description).filter(Boolean).join(", ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {orderTypeLabel(o.orderType)}
                      {o.priority === "urgent" && (
                        <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-800">urgent</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.deliveryDate ? formatDate(o.deliveryDate) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular">{formatAmount(o.estimatedAmount)}</TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {formatAmount(o.estimatedAmount - o.advanceReceived)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={o.status === "booked" ? "confirmed" : o.status}
                        onValueChange={async (v) => {
                          await ordersService.setStatus(o.id!, v as OrderStatus, { by: user?.name })
                          toast.success(`${o.orderNo} → ${ORDER_STATUS_META[v as OrderStatus].label}`)
                        }}
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue>
                            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", meta.tone)}>
                              {meta.label}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {SELECTABLE.map((s) => (
                            <SelectItem key={s} value={s}>
                              <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", ORDER_STATUS_META[s].tone)}>
                                {ORDER_STATUS_META[s].label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7" aria-label="Order actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailOrder(o)}>
                            <Eye className="size-4" /> Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setTimelineOrder(o)}>
                            <Clock className="size-4" /> Timeline
                          </DropdownMenuItem>
                          {!closed && (
                            <DropdownMenuItem onClick={() => setAdvanceOrder(o)}>
                              <IndianRupee className="size-4" /> Receive Advance
                            </DropdownMenuItem>
                          )}
                          {!closed && (
                            <DropdownMenuItem onClick={() => void reserveGold(o)}>
                              <Boxes className="size-4" /> Reserve Gold
                            </DropdownMenuItem>
                          )}
                          {!closed && (
                            <DropdownMenuItem onClick={() => setAssignOrder(o)}>
                              <Hammer className="size-4" /> Assign to Workshop
                            </DropdownMenuItem>
                          )}
                          {!closed && (
                            <DropdownMenuItem onClick={() => handleDeliver(o)}>
                              <Truck className="size-4" /> Deliver &amp; Bill
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => void duplicate(o)}>
                            <Copy className="size-4" /> Duplicate
                          </DropdownMenuItem>
                          {!closed && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => void cancel(o)}>
                                <XCircle className="size-4" /> Cancel Order
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <OrderFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <OrderTimelineDialog order={timelineOrder} onOpenChange={(o) => !o && setTimelineOrder(null)} />
      <OrderDetailDialog order={detailOrder} onOpenChange={(o) => !o && setDetailOrder(null)} />
      <ReceiveAdvanceDialog order={advanceOrder} onOpenChange={(o) => !o && setAdvanceOrder(null)} />
      <AssignWorkshopDialog order={assignOrder} onOpenChange={(o) => !o && setAssignOrder(null)} />
    </>
  )
}
