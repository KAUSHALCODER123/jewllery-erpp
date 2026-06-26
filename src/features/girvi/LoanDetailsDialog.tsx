import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { X, Printer, Plus, RotateCw, Lock, Fingerprint, ImageOff, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import type { Loan, LoanPayment } from "@/db/types"
import { loansService, customersService, todayStr } from "@/services/dbService"
import { formatAmount, formatDate, wt } from "@/lib/format"
import { computeLoanDues } from "./interest"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PavatiReceipt } from "./PavatiReceipt"
import { PaymentReceipt } from "./PaymentReceipt"

export function LoanDetailsDialog({
  loan,
  open,
  onOpenChange,
}: {
  loan: Loan
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const company = useSession((s) => s.company)
  const [payAction, setPayAction] = useState<"part" | "renewal" | "closure" | null>(null)
  const [payDate, setPayDate] = useState(todayStr())
  const [payAmount, setPayAmount] = useState(0)
  const [payNotes, setPayNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const [printPavati, setPrintPavati] = useState<Loan | null>(null)
  const [printPayment, setPrintPayment] = useState<{ loan: Loan; payment: LoanPayment } | null>(null)

  // Fetch payments reactively
  const payments = useLiveQuery(
    () => loansService.getPayments(loan.id!),
    [loan.id],
    []
  )

  const customer = useLiveQuery(
    () => customersService.get(loan.customerId),
    [loan.customerId],
    undefined
  )

  // Compute live dues
  const dues = useMemo(() => {
    return computeLoanDues(loan, payments ?? [], todayStr())
  }, [loan, payments])

  const sendWhatsAppReminder = () => {
    if (!customer) return
    const defaultTemplate = "Dear {{customerName}},\nThis is a reminder regarding your gold loan {{loanNo}} dated {{loanDate}}.\nPrincipal: ₹{{loanAmount}}.\nAccumulated Interest: ₹{{interestOutstanding}}.\nTotal Dues: ₹{{totalDues}}.\nKindly clear your interest or close the loan. Thank you!"
    const template = company?.templateGirvi || defaultTemplate

    const text = template
      .replace(/{{customerName}}/g, customer.name)
      .replace(/{{loanNo}}/g, loan.loanNo)
      .replace(/{{loanDate}}/g, formatDate(loan.date))
      .replace(/{{loanAmount}}/g, formatAmount(loan.loanAmount))
      .replace(/{{interestOutstanding}}/g, formatAmount(dues.interestOutstanding))
      .replace(/{{totalDues}}/g, formatAmount(dues.totalDues))
      .replace(/{{companyName}}/g, company?.name || "")

    const cleanPhone = customer.mobile.trim().replace(/\D/g, "")
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`
    window.open(url, "_blank")
  }

  // Setup initial values when action changes
  const handleActionClick = (action: "part" | "renewal" | "closure") => {
    setPayAction(action)
    setPayDate(todayStr())
    setPayNotes("")
    if (action === "part") {
      setPayAmount(0)
    } else if (action === "renewal") {
      setPayAmount(dues.interestOutstanding)
    } else if (action === "closure") {
      setPayAmount(dues.totalDues)
    }
  }

  const handleAddPaymentSubmit = async () => {
    if (payAmount <= 0) {
      toast.error("Please enter a positive amount")
      return
    }
    if (payAction === "closure" && payAmount < dues.totalDues) {
      toast.warning(`Closure amount is less than total dues ${formatAmount(dues.totalDues)}`)
    }
    setSaving(true)
    try {
      const createdPayment = await loansService.addPayment(loan.id!, {
        date: payDate,
        amount: payAmount,
        type: payAction!,
        notes: payNotes.trim() || undefined,
      })
      toast.success("Payment recorded successfully")
      setPayAction(null)
      // Open receipt printing immediately
      setPrintPayment({ loan, payment: createdPayment })
    } catch (err) {
      toast.error(`Failed to record payment: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl flex items-center gap-2">
                  Loan Details: {loan.loanNo}
                  <Badge variant={loan.isClosed ? "secondary" : "default"} className="ml-2 font-normal">
                    {loan.isClosed ? "Closed" : "Active"}
                  </Badge>
                  <Badge variant="outline" className="ml-2 capitalize font-normal">
                    {loan.interestMode || "monthly"} Mode
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Customer: <span className="font-medium text-foreground">{customer?.name ?? "—"}</span> ({customer?.mobile ?? ""}) | Date Pledged: {formatDate(loan.date)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Left Column: Collateral & Pledged Items */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Pledged Collateral</h3>
                <div className="rounded-md border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-16">Purity</TableHead>
                        <TableHead className="text-right w-16">Gross Wt</TableHead>
                        <TableHead className="text-right w-16">Net Wt</TableHead>
                        <TableHead className="text-right w-20">Est. Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loan.itemsPledged.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell>{item.purity}</TableCell>
                          <TableCell className="text-right tabular">{wt(item.grossWt)}</TableCell>
                          <TableCell className="text-right tabular">{wt(item.netWt)}</TableCell>
                          <TableCell className="text-right tabular">{formatAmount(item.estimatedValue)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell colSpan={2}>Totals</TableCell>
                        <TableCell className="text-right tabular">{wt(loan.grossWt)}</TableCell>
                        <TableCell className="text-right tabular">{wt(loan.netWt)}</TableCell>
                        <TableCell className="text-right tabular">
                          {formatAmount(loan.itemsPledged.reduce((acc, curr) => acc + curr.estimatedValue, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Photos Row */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">Collateral Photo</Label>
                  <div className="border rounded-md overflow-hidden aspect-square flex items-center justify-center bg-muted/20">
                    {loan.collateralImage ? (
                      <img src={loan.collateralImage} alt="Collateral" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-muted-foreground flex flex-col items-center gap-1">
                        <ImageOff className="size-6 text-muted-foreground/50" />
                        <span className="text-[10px]">No photo uploaded</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">Borrower Thumbprint</Label>
                  <div className="border rounded-md overflow-hidden aspect-square flex items-center justify-center bg-muted/20">
                    {loan.collateralThumbprint ? (
                      <img src={loan.collateralThumbprint} alt="Thumbprint" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-muted-foreground flex flex-col items-center gap-1">
                        <Fingerprint className="size-6 text-muted-foreground/50" />
                        <span className="text-[10px]">No thumbprint</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Dues Calculations & History */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Live Dues Calculations</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="border p-2 rounded-md bg-card">
                    <span className="text-[10px] text-muted-foreground block">Principal O/S</span>
                    <span className="text-sm font-bold tabular">{formatAmount(dues.principalOutstanding)}</span>
                    <span className="text-[9px] text-muted-foreground block">Orig: {formatAmount(loan.loanAmount)}</span>
                  </div>
                  <div className="border p-2 rounded-md bg-card">
                    <span className="text-[10px] text-muted-foreground block">Interest O/S</span>
                    <span className="text-sm font-bold text-amber-600 tabular">{formatAmount(dues.interestOutstanding)}</span>
                    <span className="text-[9px] text-muted-foreground block">Accrued: {formatAmount(dues.interestAccrued)}</span>
                  </div>
                  <div className="border p-2 rounded-md bg-card border-primary/20">
                    <span className="text-[10px] text-primary block font-medium">Total Outstanding</span>
                    <span className="text-sm font-bold text-primary tabular">{formatAmount(dues.totalDues)}</span>
                    <span className="text-[9px] text-muted-foreground block">Elapsed: {dues.days} days ({dues.months} m)</span>
                  </div>
                </div>
              </div>

              {/* Action Forms */}
              {!loan.isClosed && (
                <div className="border rounded-md p-3 bg-muted/20">
                  {payAction ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b pb-1">
                        <h4 className="text-xs font-semibold capitalize text-foreground">
                          Record {payAction === "part" ? "Part Repayment" : payAction === "renewal" ? "Loan Renewal" : "Loan Closure"}
                        </h4>
                        <Button variant="ghost" size="icon" className="size-5" onClick={() => setPayAction(null)}>
                          <X className="size-3" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Payment Date</Label>
                          <Input type="date" className="h-8 py-0" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Amount (₹)</Label>
                          <Input type="number" className="h-8 py-0 text-right font-medium tabular" value={payAmount || ""} onChange={(e) => setPayAmount(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)} />
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <Label className="text-[10px]">Notes</Label>
                        <Input placeholder="e.g. UPI payment, gold valued..." className="h-8 py-0" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPayAction(null)}>Cancel</Button>
                        <Button size="sm" className="h-8 text-xs" onClick={handleAddPaymentSubmit} disabled={saving}>
                          {saving ? "Saving..." : "Submit Transaction"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="flex-1 text-xs" onClick={() => handleActionClick("part")}>
                        <Plus className="size-3.5 mr-1" /> Part Payment
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleActionClick("renewal")}>
                        <RotateCw className="size-3.5 mr-1" /> Renew Loan
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={() => handleActionClick("closure")}>
                        <Lock className="size-3.5 mr-1" /> Close Loan
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Payments Ledger History */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-semibold">Ledger & Payments</h3>
                  <div className="flex gap-1.5">
                    {!loan.isClosed && (
                      <Button
                        variant="outline"
                        size="xs"
                        className="h-7 text-xs px-2 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={sendWhatsAppReminder}
                      >
                        <MessageCircle className="size-3.5 mr-1" /> WhatsApp
                      </Button>
                    )}
                    <Button variant="outline" size="xs" className="h-7 text-xs px-2" onClick={() => setPrintPavati(loan)}>
                      <Printer className="size-3.5 mr-1" /> Print Pavati
                    </Button>
                  </div>
                </div>
                
                <div className="rounded-md border max-h-[160px] overflow-y-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/40 sticky top-0">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Int.</TableHead>
                        <TableHead className="text-right">Prin.</TableHead>
                        <TableHead className="w-12 text-center"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!payments || payments.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-[11px]">
                            No payments recorded yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        payments.map((p, idx) => (
                          <TableRow key={p.id || idx}>
                            <TableCell className="tabular">{formatDate(p.date)}</TableCell>
                            <TableCell className="capitalize font-medium">
                              {p.type === "part" ? "Part" : p.type === "renewal" ? "Renew" : "Close"}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular">{formatAmount(p.amount)}</TableCell>
                            <TableCell className="text-right text-amber-600 tabular">{formatAmount(p.towardsInterest)}</TableCell>
                            <TableCell className="text-right text-emerald-600 tabular">{formatAmount(p.towardsPrincipal)}</TableCell>
                            <TableCell className="text-center py-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                title="Print voucher"
                                onClick={() => setPrintPayment({ loan, payment: p })}
                              >
                                <Printer className="size-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3 mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vouchers/Receipt Overlays */}
      {printPavati && (
        <PavatiReceipt loan={printPavati} onClose={() => setPrintPavati(null)} />
      )}
      {printPayment && (
        <PaymentReceipt
          loan={printPayment.loan}
          payment={printPayment.payment}
          onClose={() => setPrintPayment(null)}
        />
      )}
    </>
  )
}
