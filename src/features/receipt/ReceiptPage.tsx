import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { HandCoins, Printer, X } from "lucide-react"
import { toast } from "sonner"
import type { PaymentMode, Receipt } from "@/db/types"
import { customersService, receiptsService, todayStr } from "@/services/dbService"
import { formatAmount, formatINR, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { PageHeader } from "@/components/PageHeader"
import { CustomerCombobox } from "@/components/CustomerCombobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ReceiptPage() {
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)
  const [mode, setMode] = useState<PaymentMode>("cash")
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState("")
  const [printing, setPrinting] = useState<{ receipt: Receipt; balanceAfter: number } | null>(null)

  const outstanding = useLiveQuery(
    () => (customerId ? customersService.getOutstanding(customerId) : Promise.resolve(0)),
    [customerId],
    0,
  )
  const recent = useLiveQuery(() => receiptsService.getAll(), [], [])
  const customers = useLiveQuery(() => customersService.getAll(), [], [])
  const custName = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of customers) m.set(c.id!, c.name)
    return m
  }, [customers])

  const save = async () => {
    if (customerId == null) return toast.error("Select a customer")
    if (amount <= 0) return toast.error("Enter the amount received")
    try {
      const receipt = await receiptsService.add({ customerId, amount, mode, date, notes: notes || undefined })
      toast.success(`Receipt ${receipt.receiptNo} · ${formatINR(amount)}`)
      setPrinting({ receipt, balanceAfter: Number((outstanding - amount).toFixed(2)) })
      setAmount(0)
      setNotes("")
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    }
  }

  return (
    <>
      <PageHeader
        title="Receipt — Udhari Collection"
        subtitle="Record a payment received against a customer's outstanding balance"
      />
      <div className="flex min-h-0 flex-1">
        {/* Form */}
        <div className="w-96 shrink-0 space-y-3 border-r p-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <CustomerCombobox value={customerId} onChange={setCustomerId} className="w-full" />
          </div>

          {customerId != null && (
            <div
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                outstanding > 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span className="font-medium">Current Outstanding</span>
              <span className="font-bold tabular">
                {outstanding > 0 ? `${formatAmount(outstanding)} Dr` : "No dues"}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={amount || ""}
                onChange={(e) =>
                  setAmount(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
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
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>

          {customerId != null && amount > 0 && (
            <p className="text-xs text-muted-foreground">
              Balance after: <span className="font-medium">{formatAmount(outstanding - amount)} Dr</span>
            </p>
          )}

          <Button className="w-full" onClick={() => void save()}>
            <HandCoins className="size-4" /> Save & Print Receipt
          </Button>
        </div>

        {/* Recent receipts */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="border-b px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Recent Receipts
          </div>
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="w-24">Receipt</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="w-24">Date</TableHead>
                <TableHead className="w-20">Mode</TableHead>
                <TableHead className="w-28 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No receipts yet.
                  </TableCell>
                </TableRow>
              )}
              {recent.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.receiptNo}</TableCell>
                  <TableCell>{custName.get(r.customerId) ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.date)}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{r.mode}</TableCell>
                  <TableCell className="text-right font-medium tabular">
                    {formatAmount(r.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {printing && (
        <ReceiptVoucher
          receipt={printing.receipt}
          balanceAfter={printing.balanceAfter}
          customerName={custName.get(printing.receipt.customerId)}
          onClose={() => setPrinting(null)}
        />
      )}
    </>
  )
}

function ReceiptVoucher({
  receipt,
  balanceAfter,
  customerName,
  onClose,
}: {
  receipt: Receipt
  balanceAfter: number
  customerName?: string
  onClose: () => void
}) {
  const company = useSession((s) => s.company)
  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/40 p-6">
      <div className="no-print mb-3 flex w-[120mm] items-center justify-between">
        <span className="text-sm font-medium text-white">Receipt {receipt.receiptNo}</span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X className="size-4" /> Close
          </Button>
        </div>
      </div>
      <div className="print-area w-[120mm] bg-white p-6 text-[12px] text-black shadow-xl">
        <div className="border-b-2 border-black pb-2 text-center">
          <h1 className="text-lg font-bold">{company?.name ?? "Jewellery Shop"}</h1>
          <p className="text-[11px]">
            {[company?.address, company?.city].filter(Boolean).join(", ")}
          </p>
        </div>
        <p className="mt-2 text-center text-sm font-semibold">PAYMENT RECEIPT</p>
        <div className="mt-2 space-y-1">
          <Row label="Receipt No" value={receipt.receiptNo} />
          <Row label="Date" value={formatDate(receipt.date)} />
          <Row label="Received From" value={customerName ?? "—"} />
          <Row label="Mode" value={receipt.mode.toUpperCase()} />
          {receipt.notes && <Row label="Notes" value={receipt.notes} />}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-black pt-2">
          <span className="font-bold">Amount Received</span>
          <span className="text-base font-bold tabular">{formatAmount(receipt.amount)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span>Balance Outstanding</span>
          <span className="tabular">{formatAmount(balanceAfter)} Dr</span>
        </div>
        <div className="mt-8 text-right text-[11px]">
          For {company?.name ?? "Jewellery Shop"}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-black/60">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
