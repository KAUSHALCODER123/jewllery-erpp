import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus, PiggyBank, IndianRupee, CheckCircle2, Eye, Printer, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import type { Scheme, SchemeAccount, SchemePayment, PaymentMode } from "@/db/types"
import { schemesService, customersService, todayStr } from "@/services/dbService"
import { formatAmount, formatDate, formatINR } from "@/lib/format"
import { DEFAULT_SCHEME_TEMPLATE, fillTemplate, openWhatsApp } from "@/lib/waTemplates"
import { ChitReceipt } from "./ChitReceipt"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CustomerCombobox } from "@/components/CustomerCombobox"

export function SchemesPage() {
  const [tab, setTab] = useState("accounts")
  const [schemeOpen, setSchemeOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [payAccount, setPayAccount] = useState<SchemeAccount | null>(null)
  const [payInstallmentNo, setPayInstallmentNo] = useState<number | undefined>(undefined)
  const [payDueDate, setPayDueDate] = useState<string | undefined>(undefined)
  const [detailAccount, setDetailAccount] = useState<SchemeAccount | null>(null)
  const [printPayment, setPrintPayment] = useState<SchemePayment | null>(null)
  const [printAccount, setPrintAccount] = useState<SchemeAccount | null>(null)

  const schemes = useLiveQuery(() => schemesService.getSchemes(), [], [])
  const customers = useLiveQuery(() => customersService.getAll(), [], [])
  const accounts = useLiveQuery(async () => {
    const accs = await schemesService.getAccounts()
    return Promise.all(
      accs.map(async (a) => {
        const pays = await schemesService.getPayments(a.id!)
        return {
          ...a,
          paid: pays.reduce((s, p) => s + p.amount, 0),
          count: pays.length,
        }
      }),
    )
  }, [], [])

  const schemeById = useMemo(() => {
    const m = new Map<number, Scheme>()
    for (const s of schemes) m.set(s.id!, s)
    return m
  }, [schemes])
  const custName = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of customers) m.set(c.id!, c.name)
    return m
  }, [customers])

  return (
    <>
      <PageHeader
        title="Gold Saving Schemes"
        subtitle={`${accounts.length} accounts · ${schemes.length} plans`}
        actions={
          tab === "accounts" ? (
            <Button
              size="sm"
              onClick={() => setEnrollOpen(true)}
              disabled={schemes.length === 0}
            >
              <Plus className="size-4" /> Enroll Customer
            </Button>
          ) : (
            <Button size="sm" onClick={() => setSchemeOpen(true)}>
              <Plus className="size-4" /> New Plan
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="plans">Scheme Plans</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="accounts" className="min-h-0 flex-1 overflow-auto">
          {accounts.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
              <PiggyBank className="size-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {schemes.length === 0
                  ? "Create a scheme plan first, then enroll customers."
                  : "No enrolled customers yet."}
              </p>
              {schemes.length === 0 ? (
                <Button size="sm" onClick={() => setSchemeOpen(true)}>
                  <Plus className="size-4" /> New Plan
                </Button>
              ) : (
                <Button size="sm" onClick={() => setEnrollOpen(true)}>
                  <Plus className="size-4" /> Enroll Customer
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-24">Account</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Scheme</TableHead>
                  <TableHead className="w-24">Start</TableHead>
                  <TableHead className="w-28 text-right">Paid</TableHead>
                  <TableHead className="w-28 text-right">Progress</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => {
                  const sch = schemeById.get(a.schemeId)
                  const done = sch ? a.count >= sch.durationMonths : false
                  return (
                    <TableRow key={a.id}>
                      <TableCell
                        className="cursor-pointer hover:underline text-blue-600 font-medium"
                        onClick={() => setDetailAccount(a)}
                      >
                        {a.accountNo}
                      </TableCell>
                      <TableCell>{custName.get(a.customerId) ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {sch?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(a.startDate)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatAmount(a.paid)}
                      </TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">
                        {a.count}/{sch?.durationMonths ?? "?"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-medium",
                            a.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : a.status === "matured"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {a.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="View details"
                            onClick={() => setDetailAccount(a)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          {a.status === "active" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              title="Record installment"
                              onClick={() => setPayAccount(a)}
                            >
                              <IndianRupee className="size-4" />
                            </Button>
                          )}
                          {done && a.status === "active" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              title="Mark matured"
                              onClick={async () => {
                                await schemesService.setStatus(a.id!, "matured")
                                toast.success(`${a.accountNo} matured`)
                              }}
                            >
                              <CheckCircle2 className="size-4" />
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
        </TabsContent>

        <TabsContent value="plans" className="min-h-0 flex-1 overflow-auto">
          {schemes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
              <PiggyBank className="size-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No scheme plans yet.</p>
              <Button size="sm" onClick={() => setSchemeOpen(true)}>
                <Plus className="size-4" /> New Plan
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32 text-right">Monthly</TableHead>
                  <TableHead className="w-24 text-right">Months</TableHead>
                  <TableHead className="w-24 text-right">Bonus</TableHead>
                  <TableHead className="w-36 text-right">Maturity Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schemes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(s.monthlyAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {s.durationMonths}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      +{s.bonusMonths} mo
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {formatAmount(
                        s.monthlyAmount * (s.durationMonths + s.bonusMonths),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      <NewSchemeDialog open={schemeOpen} onOpenChange={setSchemeOpen} />
      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        schemes={schemes}
      />
      {payAccount && (
        <PayInstallmentDialog
          account={payAccount}
          scheme={schemeById.get(payAccount.schemeId)}
          installmentNo={payInstallmentNo}
          dueDate={payDueDate}
          onDone={() => {
            setPayAccount(null)
            setPayInstallmentNo(undefined)
            setPayDueDate(undefined)
          }}
          onPaid={(pay) => {
            setPayAccount(null)
            setPayInstallmentNo(undefined)
            setPayDueDate(undefined)
            setPrintPayment(pay)
            setPrintAccount(payAccount)
          }}
        />
      )}
      {detailAccount && (
        <AccountDetailsDialog
          account={detailAccount}
          scheme={schemeById.get(detailAccount.schemeId)}
          customerName={custName.get(detailAccount.customerId) ?? "—"}
          onClose={() => setDetailAccount(null)}
          onPay={(instNo, dueDt) => {
            setPayInstallmentNo(instNo)
            setPayDueDate(dueDt)
            setPayAccount(detailAccount)
          }}
          onPrint={async (paymentId) => {
            const pays = await schemesService.getPayments(detailAccount.id!)
            const pay = pays.find((p) => p.id === paymentId)
            if (pay) {
              setPrintPayment(pay)
              setPrintAccount(detailAccount)
            }
          }}
        />
      )}
      {printPayment && printAccount && (
        <ChitReceipt
          account={printAccount}
          scheme={schemeById.get(printAccount.schemeId)!}
          payment={printPayment}
          onClose={() => {
            setPrintPayment(null)
            setPrintAccount(null)
          }}
        />
      )}
    </>
  )
}

function NewSchemeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [name, setName] = useState("")
  const [monthly, setMonthly] = useState(0)
  const [months, setMonths] = useState(11)
  const [bonus, setBonus] = useState(1)

  const save = async () => {
    if (!name.trim()) return toast.error("Enter scheme name")
    if (monthly <= 0 || months <= 0) return toast.error("Enter valid amount & months")
    await schemesService.addScheme({
      name: name.trim(),
      monthlyAmount: monthly,
      durationMonths: months,
      bonusMonths: bonus,
    })
    toast.success("Scheme created")
    setName("")
    setMonthly(0)
    setMonths(11)
    setBonus(1)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Scheme Plan</DialogTitle>
          <DialogDescription>
            Classic "pay 11, get 12" style gold saving plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Scheme Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dhanvarsha 11+1"
            autoFocus
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Monthly ₹</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={monthly || ""}
                onChange={(e) =>
                  setMonthly(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Months</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={months || ""}
                onChange={(e) =>
                  setMonths(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Bonus mo</Label>
              <Input
                type="number"
                className="tabular text-right"
                value={bonus || ""}
                onChange={(e) =>
                  setBonus(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Maturity value:{" "}
            <span className="font-medium">
              {formatINR(monthly * (months + bonus))}
            </span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EnrollDialog({
  open,
  onOpenChange,
  schemes,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  schemes: Scheme[]
}) {
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [schemeId, setSchemeId] = useState("")
  const [start, setStart] = useState(todayStr())

  const save = async () => {
    if (customerId == null) return toast.error("Select a customer")
    if (!schemeId) return toast.error("Select a scheme")
    await schemesService.enroll(schemeId ? Number(schemeId) : 0, customerId, start)
    toast.success("Customer enrolled")
    setCustomerId(null)
    setSchemeId("")
    setStart(todayStr())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll Customer</DialogTitle>
          <DialogDescription>Open a scheme account for a customer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Customer</Label>
          <CustomerCombobox value={customerId} onChange={setCustomerId} className="w-full" />
          <Label className="text-xs text-muted-foreground">Scheme</Label>
          <Select value={schemeId} onValueChange={setSchemeId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select scheme" />
            </SelectTrigger>
            <SelectContent>
              {schemes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name} · {formatAmount(s.monthlyAmount)}/mo
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground">Start Date</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Enroll</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PayInstallmentDialog({
  account,
  scheme,
  installmentNo,
  dueDate,
  onDone,
  onPaid,
}: {
  account: SchemeAccount
  scheme?: Scheme
  installmentNo?: number
  dueDate?: string
  onDone: () => void
  onPaid: (pay: SchemePayment) => void
}) {
  const [amount, setAmount] = useState(scheme?.monthlyAmount ?? 0)
  const [date, setDate] = useState(todayStr())
  const [mode, setMode] = useState<PaymentMode>("cash")

  const save = async () => {
    if (amount <= 0) return toast.error("Enter amount")
    try {
      const pay = await schemesService.addPayment(
        account.id!,
        amount,
        date,
        mode,
        installmentNo,
        dueDate,
      )
      toast.success("Installment recorded")
      onPaid(pay)
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Installment {installmentNo ? `#${installmentNo}` : ""} — {account.accountNo}
          </DialogTitle>
          <DialogDescription>{scheme?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
          <Input
            type="number"
            className="tabular text-right"
            value={amount || ""}
            onChange={(e) =>
              setAmount(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
            }
            autoFocus
          />
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Label className="text-xs text-muted-foreground">Payment Mode</Label>
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
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccountDetailsDialog({
  account,
  scheme,
  customerName,
  onClose,
  onPay,
  onPrint,
}: {
  account: SchemeAccount
  scheme?: Scheme
  customerName: string
  onClose: () => void
  onPay: (installmentNo: number, dueDate: string) => void
  onPrint: (paymentId: number) => void
}) {
  const company = useSession((s) => s.company)

  const customer = useLiveQuery(
    () => customersService.get(account.customerId),
    [account.customerId]
  )

  const schedule = useLiveQuery(
    () => schemesService.getSchedule(account.id!),
    [account.id],
    [],
  )

  const payments = useLiveQuery(
    () => schemesService.getPayments(account.id!),
    [account.id],
    [],
  )

  const paymentByInstallment = useMemo(() => {
    const map = new Map<number, SchemePayment>()
    for (const p of payments ?? []) {
      map.set(p.installmentNo, p)
    }
    return map
  }, [payments])

  const totalPaid = useMemo(() => {
    return (payments ?? []).reduce((sum, p) => sum + p.amount, 0)
  }, [payments])

  const maturityValue = scheme
    ? scheme.monthlyAmount * (scheme.durationMonths + scheme.bonusMonths)
    : 0

  const sendWhatsAppReminder = () => {
    if (!customer || !scheme) return
    const nextDue = (schedule ?? []).find((r) => !r.paid)
    if (!nextDue) {
      toast.info("All installments are already paid!")
      return
    }

    const text = fillTemplate(company?.templateScheme || DEFAULT_SCHEME_TEMPLATE, {
      customerName: customer.name,
      monthlyAmount: formatAmount(scheme.monthlyAmount),
      accountNo: account.accountNo,
      dueDate: formatDate(nextDue.dueDate),
      companyName: company?.name || "",
    })
    openWhatsApp(customer.mobile, text)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Account Details — {account.accountNo}</DialogTitle>
          <DialogDescription>
            View installment schedule, track dues, and print chit receipts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 border-y py-3 text-xs">
          <div className="space-y-1">
            <p>
              <span className="text-muted-foreground">Customer:</span>{" "}
              <span className="font-semibold">{customerName}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Scheme:</span>{" "}
              <span className="font-semibold">{scheme?.name}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Monthly Installment:</span>{" "}
              <span className="font-semibold">{formatAmount(scheme?.monthlyAmount ?? 0)}</span>
            </p>
          </div>
          <div className="space-y-1">
            <p>
              <span className="text-muted-foreground">Start Date:</span>{" "}
              <span className="font-semibold">{formatDate(account.startDate)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Status:</span>{" "}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                  account.status === "active"
                    ? "bg-emerald-100 text-emerald-800"
                    : account.status === "matured"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {account.status}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Total Saved:</span>{" "}
              <span className="font-semibold text-emerald-600">{formatAmount(totalPaid)}</span>
              <span className="text-muted-foreground text-[10px]">
                {" "}
                / {formatAmount(maturityValue)} (est. maturity)
              </span>
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-auto py-2">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-16">No</TableHead>
                <TableHead className="w-28">Due Date</TableHead>
                <TableHead className="w-24 text-right">Amount</TableHead>
                <TableHead className="text-center w-28">Status</TableHead>
                <TableHead className="w-32">Paid On</TableHead>
                <TableHead className="w-16 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.map((row) => {
                const pay = paymentByInstallment.get(row.installmentNo)
                const isOverdue =
                  !row.paid && new Date(row.dueDate) < new Date(todayStr())
                return (
                  <TableRow key={row.installmentNo}>
                    <TableCell className="font-medium">{row.installmentNo}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(row.dueDate)}
                    </TableCell>
                    <TableCell className="text-right tabular">{formatAmount(row.amount)}</TableCell>
                    <TableCell className="text-center">
                      {row.paid ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Paid
                        </span>
                      ) : isOverdue ? (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          Overdue
                        </span>
                      ) : (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          Due
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.paidOn ? `${formatDate(row.paidOn)} (${row.mode})` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.paid ? (
                        pay && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            title="Print chit receipt"
                            onClick={() => onPrint(pay.id!)}
                          >
                            <Printer className="size-4" />
                          </Button>
                        )
                      ) : (
                        account.status === "active" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            onClick={() => onPay(row.installmentNo, row.dueDate)}
                          >
                            Pay
                          </Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="border-t pt-3 flex items-center justify-between gap-2">
          {account.status === "active" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10"
              onClick={sendWhatsAppReminder}
            >
              <MessageCircle className="size-4 mr-1" /> WhatsApp Reminder
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="ml-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
