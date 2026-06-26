import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Recycle,
  Receipt,
  Banknote,
  Smartphone,
  Wallet,
  Clock,
  Landmark,
  Pencil,
} from "lucide-react"
import { usePosStore } from "@/features/pos/usePosStore"
import {
  reportsService,
  salesService,
  customersService,
  loansService,
  todayStr,
} from "@/services/dbService"
import { formatAmount, formatINR } from "@/lib/format"
import { cn } from "@/lib/utils"
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

/** Shift an ISO "YYYY-MM-DD" date by N days. */
function shiftDay(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + days)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

export function DayBookPage() {
  const [date, setDate] = useState(todayStr())
  const navigate = useNavigate()
  const loadForEdit = usePosStore((s) => s.loadForEdit)

  const editInvoice = async (invoiceId: number) => {
    const full = await salesService.getFull(invoiceId)
    if (!full) return toast.error("Invoice not found")
    loadForEdit(full)
    navigate("/billing")
  }

  const summary = useLiveQuery(
    () => reportsService.getDayBook(date),
    [date],
    undefined,
  )
  const invoices = useLiveQuery(
    () => salesService.getInvoicesByDate(date),
    [date],
    [],
  )
  const customers = useLiveQuery(() => customersService.getAll(), [], [])
  const loans = useLiveQuery(() => loansService.getAll(), [], [])

  const custName = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of customers) m.set(c.id!, c.name)
    return m
  }, [customers])

  const loansToday = loans.filter((l) => l.date === date)
  const loansDisbursed = loansToday.reduce((s, l) => s + l.loanAmount, 0)

  const netCollected = (summary?.cashCollected ?? 0) + (summary?.upiCollected ?? 0)

  const cards = [
    {
      label: "Total Sales",
      value: summary?.totalSales ?? 0,
      icon: TrendingUp,
      tone: "text-primary",
    },
    {
      label: "Old Gold (URD)",
      value: summary?.totalUrdPurchase ?? 0,
      icon: Recycle,
      tone: "text-secondary",
    },
    { label: "GST Collected", value: summary?.totalTax ?? 0, icon: Receipt },
    { label: "Cash Collected", value: summary?.cashCollected ?? 0, icon: Banknote },
    { label: "UPI Collected", value: summary?.upiCollected ?? 0, icon: Smartphone },
    {
      label: "Net Collected",
      value: netCollected,
      icon: Wallet,
      tone: "text-emerald-600",
    },
    {
      label: "Credit Given (Udhari)",
      value: summary?.outstandingCreated ?? 0,
      icon: Clock,
      tone: (summary?.outstandingCreated ?? 0) > 0 ? "text-destructive" : undefined,
    },
    { label: "Loans Disbursed", value: loansDisbursed, icon: Landmark },
  ]

  const isToday = date === todayStr()

  return (
    <>
      <PageHeader
        title="Day Book"
        subtitle={`${summary?.invoiceCount ?? 0} invoices · ${loansToday.length} loans`}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setDate((d) => shiftDay(d, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value || todayStr())}
              className="h-8 w-40"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={isToday}
              onClick={() => setDate((d) => shiftDay(d, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="size-4" />
            </Button>
            {!isToday && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDate(todayStr())}
              >
                Today
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border bg-card p-3"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <c.icon className="size-3.5" />
                {c.label}
              </div>
              <div
                className={cn(
                  "mt-1 text-xl font-bold tabular",
                  c.tone ?? "text-foreground",
                )}
              >
                {formatINR(c.value)}
              </div>
            </div>
          ))}
        </div>

        {/* Invoice list */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Sales Invoices
          </h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-28 text-right">Gross</TableHead>
                  <TableHead className="w-28 text-right">URD</TableHead>
                  <TableHead className="w-28 text-right">Net</TableHead>
                  <TableHead className="w-24 text-right">Cash</TableHead>
                  <TableHead className="w-24 text-right">UPI</TableHead>
                  <TableHead className="w-28 text-right">Balance</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No sales on this day.
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoiceNo}</TableCell>
                    <TableCell>{custName.get(inv.customerId) ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(inv.totalGrossAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">
                      {inv.totalUrdAmount ? `-${formatAmount(inv.totalUrdAmount)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {formatAmount(inv.netAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(inv.cashPaid)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(inv.upiPaid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular",
                        inv.balance > 0 && "text-destructive",
                      )}
                    >
                      {inv.balance > 0 ? formatAmount(inv.balance) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Edit / modify this bill"
                        onClick={() => void editInvoice(inv.id!)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </>
  )
}
