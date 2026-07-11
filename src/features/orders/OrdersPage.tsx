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
  Search,
  FileSpreadsheet,
  MessageCircle,
} from "lucide-react"
import { toast } from "sonner"
import type { Order, OrderStatus } from "@/db/types"
import { ordersService, customersService, todayStr } from "@/services/dbService"
import { ORDER_STATUS_META, ORDER_WORKFLOW, ORDER_TYPES, orderTypeLabel } from "@/lib/constants"
import { formatAmount, formatDate } from "@/lib/format"
import { exportObjectsToExcel } from "@/lib/excel"
import { openWhatsApp } from "@/lib/waTemplates"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [quick, setQuick] = useState<"all" | "delayed" | "ready" | "in_production">("all")
  const navigate = useNavigate()
  const posStore = usePosStore()
  const user = useSession((s) => s.user)
  const orders = useLiveData(() => ordersService.getAll(), [], undefined)
  const customers = useLiveData(() => customersService.getAll(), [], [])
  const custInfo = useMemo(() => {
    const m = new Map<number, { name: string; mobile: string }>()
    for (const c of customers) m.set(c.id!, { name: c.name, mobile: c.mobile })
    return m
  }, [customers])
  const custName = (id: number) => custInfo.get(id)?.name ?? "—"

  const today = todayStr()
  const isOpen = (o: Order) => o.status !== "delivered" && o.status !== "cancelled"
  const PROD_STATUSES = new Set<OrderStatus>([
    "assigned_workshop",
    "in_production",
    "stone_setting",
    "polishing",
    "quality_check",
  ])
  const deliveredOn = (o: Order) =>
    [...(o.statusHistory ?? [])].reverse().find((h) => h.status === "delivered")?.at?.slice(0, 10)

  const list = orders ?? []
  const openCount = list.filter(isOpen).length

  const metrics = useMemo(() => {
    const open = list.filter(isOpen)
    const delivered = list.filter((o) => o.status === "delivered").length
    return {
      today: list.filter((o) => o.date === today).length,
      open: open.length,
      ready: list.filter((o) => o.status === "ready").length,
      delayed: open.filter((o) => o.deliveryDate && o.deliveryDate < today).length,
      inProduction: list.filter((o) => PROD_STATUSES.has(o.status)).length,
      deliveredToday: list.filter((o) => o.status === "delivered" && deliveredOn(o) === today).length,
      advance: Number(list.reduce((s, o) => s + o.advanceReceived, 0).toFixed(2)),
      pending: Number(open.reduce((s, o) => s + (o.estimatedAmount - o.advanceReceived), 0).toFixed(2)),
      completion: delivered + open.length > 0 ? Math.round((delivered / (delivered + open.length)) * 100) : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, today])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((o) => {
      const c = custInfo.get(o.customerId)
      const okText =
        !q ||
        o.orderNo.toLowerCase().includes(q) ||
        (c?.name.toLowerCase().includes(q) ?? false) ||
        (c?.mobile.includes(q) ?? false) ||
        o.items.some((i) => i.description.toLowerCase().includes(q))
      const st = o.status === "booked" ? "confirmed" : o.status
      const okStatus = statusFilter === "all" || st === statusFilter
      const okType = typeFilter === "all" || (o.orderType ?? "custom") === typeFilter
      const okQuick =
        quick === "all" ||
        (quick === "ready" && o.status === "ready") ||
        (quick === "in_production" && PROD_STATUSES.has(o.status)) ||
        (quick === "delayed" && isOpen(o) && !!o.deliveryDate && o.deliveryDate < today)
      return okText && okStatus && okType && okQuick
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, custInfo, search, statusFilter, typeFilter, quick, today])

  const exportExcel = () => {
    if (filtered.length === 0) return toast.error("No orders to export")
    const rows = filtered.map((o) => ({
      "Order No": o.orderNo,
      Customer: custName(o.customerId),
      Mobile: custInfo.get(o.customerId)?.mobile ?? "",
      Type: orderTypeLabel(o.orderType),
      "Order Date": o.date,
      Delivery: o.deliveryDate ?? "",
      Status: (ORDER_STATUS_META[o.status] ?? ORDER_STATUS_META.confirmed).label,
      Estimated: o.estimatedAmount,
      Advance: o.advanceReceived,
      Balance: Number((o.estimatedAmount - o.advanceReceived).toFixed(2)),
      Salesperson: o.salesperson ?? "",
    }))
    exportObjectsToExcel(`orders-${today}.xlsx`, "Orders", rows)
    toast.success(`Exported ${rows.length} orders`)
  }

  const notify = (o: Order) => {
    const info = custInfo.get(o.customerId)
    const bal = Number((o.estimatedAmount - o.advanceReceived).toFixed(2))
    const label = (ORDER_STATUS_META[o.status] ?? ORDER_STATUS_META.confirmed).label
    const msg =
      `Dear ${info?.name ?? "Customer"}, update on your order ${o.orderNo} ` +
      `(${orderTypeLabel(o.orderType)}): ${label}.` +
      (bal > 0 ? ` Balance due ₹${formatAmount(bal)}.` : "") +
      (o.deliveryDate ? ` Delivery: ${formatDate(o.deliveryDate)}.` : "")
    openWhatsApp(info?.mobile, msg)
  }

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <FileSpreadsheet className="size-4" /> Excel
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> New Order
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {orders && orders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <ClipboardList className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No orders yet.</p>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> New Order
            </Button>
          </div>
        ) : (
          <>
            {/* Dashboard */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
              <Metric label="Today's Orders" value={metrics.today} />
              <Metric label="Open" value={metrics.open} />
              <Metric label="Ready" value={metrics.ready} tone="violet" />
              <Metric label="Delayed" value={metrics.delayed} tone="red" />
              <Metric label="In Production" value={metrics.inProduction} tone="amber" />
              <Metric label="Delivered Today" value={metrics.deliveredToday} tone="emerald" />
              <Metric label="Advance Collected" value={`₹${formatAmount(metrics.advance)}`} small />
              <Metric label="Pending Payments" value={`₹${formatAmount(metrics.pending)}`} small tone="red" />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search order, customer, mobile, item…"
                  className="h-8 pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {ORDER_WORKFLOW.concat("cancelled").map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {ORDER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                {(["all", "delayed", "ready", "in_production"] as const).map((qk) => (
                  <button
                    key={qk}
                    onClick={() => setQuick(qk)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      quick === qk ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {qk === "in_production" ? "In production" : qk}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{filtered.length} shown</span>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-card">
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No orders match your filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((o) => {
                const meta = ORDER_STATUS_META[o.status] ?? ORDER_STATUS_META.confirmed
                const closed = o.status === "delivered" || o.status === "cancelled"
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.orderNo}</TableCell>
                    <TableCell>
                      <div>{custName(o.customerId)}</div>
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
                          <DropdownMenuItem onClick={() => notify(o)}>
                            <MessageCircle className="size-4" /> Notify (WhatsApp)
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
            </div>
          </>
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

const TONES: Record<string, string> = {
  default: "text-foreground",
  violet: "text-violet-600 dark:text-violet-400",
  red: "text-destructive",
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
}

function Metric({
  label,
  value,
  tone = "default",
  small,
}: {
  label: string
  value: string | number
  tone?: keyof typeof TONES
  small?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-bold tabular", small ? "text-base" : "text-2xl", TONES[tone])}>{value}</div>
    </div>
  )
}
