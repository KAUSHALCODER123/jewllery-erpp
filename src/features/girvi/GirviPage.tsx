import { useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus, Landmark, Receipt, Lock, Eye } from "lucide-react"
import { toast } from "sonner"
import type { Loan, LoanPayment } from "@/db/types"
import { db } from "@/db/database"
import { loansService, customersService, todayStr } from "@/services/dbService"
import { formatAmount, formatDate, wt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoanFormDialog } from "./LoanFormDialog"
import { PavatiReceipt } from "./PavatiReceipt"
import { computeLoanDues } from "./interest"
import { LoanDetailsDialog } from "./LoanDetailsDialog"

export function GirviPage() {
  const [tab, setTab] = useState<"open" | "all">("open")
  const [formOpen, setFormOpen] = useState(false)
  const [pavati, setPavati] = useState<Loan | null>(null)
  const [closing, setClosing] = useState<Loan | null>(null)
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null)

  const loans = useLiveQuery(() => loansService.getAll(), [], undefined)
  const customers = useLiveQuery(() => customersService.getAll(), [], [])
  const payments = useLiveQuery(() => db.loan_payments.toArray(), [], [])

  const custName = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of customers) m.set(c.id!, c.name)
    return m
  }, [customers])

  const paymentsByLoanId = useMemo(() => {
    const m = new Map<number, LoanPayment[]>()
    for (const p of payments ?? []) {
      const arr = m.get(p.loanId) || []
      arr.push(p)
      m.set(p.loanId, arr)
    }
    return m
  }, [payments])

  const visible = (loans ?? []).filter((l) => (tab === "open" ? !l.isClosed : true))

  return (
    <>
      <PageHeader
        title="Girvi — Gold Loans"
        subtitle={`${(loans ?? []).filter((l) => !l.isClosed).length} open loans`}
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> New Loan
          </Button>
        }
      />

      <div className="border-b px-4 py-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "all")}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto">
        {loans && loans.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <Landmark className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No gold loans yet.</p>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> New Loan
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-24">Loan No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="w-24">Date</TableHead>
                <TableHead className="w-20 text-right">Net Wt</TableHead>
                <TableHead className="w-28 text-right">Principal</TableHead>
                <TableHead className="w-16 text-right">Rate</TableHead>
                <TableHead className="w-28 text-right">Due Today</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((l) => {
                const loanPayments = paymentsByLoanId.get(l.id!) || []
                const dues = computeLoanDues(l, loanPayments, todayStr())
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.loanNo}</TableCell>
                    <TableCell>{custName.get(l.customerId) ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(l.date)}
                    </TableCell>
                    <TableCell className="text-right tabular">{wt(l.netWt)}</TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(l.principalOutstanding ?? l.loanAmount)}
                      {l.principalOutstanding !== undefined && l.principalOutstanding < l.loanAmount && (
                        <div className="text-[10px] text-muted-foreground">
                          Orig: {formatAmount(l.loanAmount)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {l.interestRate}%
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {l.isClosed ? "—" : formatAmount(dues.totalDues)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-medium",
                          l.isClosed
                            ? "bg-muted text-muted-foreground"
                            : "bg-emerald-100 text-emerald-800",
                        )}
                      >
                        {l.isClosed ? "Closed" : "Active"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="View Details"
                          onClick={() => setSelectedLoan(l)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="View Pavati"
                          onClick={() => setPavati(l)}
                        >
                          <Receipt className="size-4" />
                        </Button>
                        {!l.isClosed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Close / Redeem"
                            onClick={() => setClosing(l)}
                          >
                            <Lock className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <LoanFormDialog open={formOpen} onOpenChange={setFormOpen} />
      {selectedLoan && (
        <LoanDetailsDialog
          loan={selectedLoan}
          open={!!selectedLoan}
          onOpenChange={(o) => !o && setSelectedLoan(null)}
        />
      )}
      {pavati && (
        <PavatiReceipt loan={pavati} onClose={() => setPavati(null)} />
      )}
      {closing && (
        <CloseLoanDialog loan={closing} onDone={() => setClosing(null)} />
      )}
    </>
  )
}

function CloseLoanDialog({
  loan,
  onDone,
}: {
  loan: Loan
  onDone: () => void
}) {
  const payments = useLiveQuery(() => db.loan_payments.where("loanId").equals(loan.id!).toArray(), [loan.id], [])
  const dues = useMemo(() => {
    return computeLoanDues(loan, payments ?? [], todayStr())
  }, [loan, payments])
  const [amount, setAmount] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (dues) {
      setAmount(dues.totalDues)
    }
  }, [dues])

  const close = async () => {
    setSaving(true)
    try {
      await loansService.addPayment(loan.id!, {
        date: todayStr(),
        amount,
        type: "closure",
        notes: "Redeemed from quick close dialog",
      })
      toast.success(`Loan ${loan.loanNo} closed`)
      onDone()
    } catch (err) {
      toast.error(`Could not close loan: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close Loan {loan.loanNo}</DialogTitle>
          <DialogDescription>
            Collect dues and return the pledged collateral.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <Row label="Principal Outstanding" value={dues ? dues.principalOutstanding : loan.loanAmount} />
          <Row label={`Interest Outstanding (${dues ? dues.months : 0} month${(dues && dues.months > 1) ? "s" : ""} @ ${loan.interestRate}%)`} value={dues ? dues.interestOutstanding : 0} />
          <div className="my-1 border-t" />
          <Row label="Total Due" value={dues ? dues.totalDues : loan.loanAmount} bold />
          <div className="space-y-1 pt-2">
            <Label className="text-xs text-muted-foreground">Amount Collected</Label>
            <Input
              type="number"
              className="tabular text-right"
              value={amount || ""}
              onChange={(e) =>
                setAmount(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => void close()} disabled={saving}>
            Close & Redeem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  bold,
}: {
  label: string
  value: number
  bold?: boolean
}) {
  return (
    <div className={cn("flex justify-between", bold && "font-semibold")}>
      <span className={cn(!bold && "text-muted-foreground")}>{label}</span>
      <span className="tabular">{formatAmount(value)}</span>
    </div>
  )
}
