import { useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import { Plus, Truck, Pencil, UserPlus, MoreHorizontal, BookOpen, IndianRupee, RotateCcw, Search, FileSpreadsheet } from "lucide-react"
import type { PurchaseInvoice, Supplier } from "@/db/types"
import { purchaseService, suppliersService, purchasePaymentsService, purchaseReturnsService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { purchaseTypeLabel, PURCHASE_TYPES } from "@/lib/constants"
import { exportObjectsToExcel } from "@/lib/excel"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PurchaseFormDialog } from "./PurchaseFormDialog"
import { SupplierFormDialog } from "./SupplierFormDialog"
import { VendorPaymentDialog } from "./VendorPaymentDialog"
import { VendorLedgerDialog } from "./VendorLedgerDialog"
import { ReturnDialog } from "./ReturnDialog"

export function PurchasePage() {
  const [tab, setTab] = useState("purchases")
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [payVendor, setPayVendor] = useState<Supplier | null>(null)
  const [ledgerVendor, setLedgerVendor] = useState<Supplier | null>(null)
  const [returnPurchase, setReturnPurchase] = useState<PurchaseInvoice | null>(null)

  const purchases = useLiveData(() => purchaseService.getInvoices(), [], [])
  const suppliers = useLiveData(() => suppliersService.getAll(), [], [])
  const payments = useLiveData(() => purchasePaymentsService.getAll(), [], [])
  const returns = useLiveData(() => purchaseReturnsService.getAll(), [], [])
  const supById = useMemo(() => {
    const m = new Map<number, Supplier>()
    for (const s of suppliers) m.set(s.id!, s)
    return m
  }, [suppliers])
  const supName = (id: number) => supById.get(id)?.name ?? "—"

  // Outstanding = opening + unpaid purchase balances − on-account payments.
  const outstanding = useMemo(() => {
    const m = new Map<number, number>()
    for (const s of suppliers) m.set(s.id!, s.openingBalance)
    for (const p of purchases) m.set(p.supplierId, (m.get(p.supplierId) ?? 0) + p.balance)
    for (const pay of payments) if (!pay.purchaseId) m.set(pay.supplierId, (m.get(pay.supplierId) ?? 0) - pay.amount)
    return m
  }, [suppliers, purchases, payments])

  // ---- Purchases dashboard + filters/search ----
  const [search, setSearch] = useState("")
  const [vendorFilter, setVendorFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [payFilter, setPayFilter] = useState("all")

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const month = today.slice(0, 7)
    const rates = purchases.map((p) => p.goldRate ?? 0).filter((r) => r > 0)
    return {
      todayAmt: purchases.filter((p) => p.date === today).reduce((s, p) => s + p.netAmount, 0),
      monthAmt: purchases.filter((p) => p.date.slice(0, 7) === month).reduce((s, p) => s + p.netAmount, 0),
      pending: purchases.reduce((s, p) => s + p.balance, 0),
      outVendors: new Set(purchases.filter((p) => p.balance > 0).map((p) => p.supplierId)).size,
      bullion: purchases.filter((p) => p.purchaseType === "bullion").length,
      avgRate: rates.length ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0,
    }
  }, [purchases])

  const payStatus = (p: PurchaseInvoice): "paid" | "partial" | "pending" =>
    p.balance <= 0.01 ? "paid" : p.amountPaid > 0 ? "partial" : "pending"

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return purchases.filter((p) => {
      const okText =
        !q ||
        p.purchaseNo.toLowerCase().includes(q) ||
        supName(p.supplierId).toLowerCase().includes(q) ||
        (p.billNo ?? "").toLowerCase().includes(q)
      const okVendor = vendorFilter === "all" || String(p.supplierId) === vendorFilter
      const okType = typeFilter === "all" || (p.purchaseType ?? "jewellery") === typeFilter
      const okPay = payFilter === "all" || payStatus(p) === payFilter
      return okText && okVendor && okType && okPay
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, suppliers, search, vendorFilter, typeFilter, payFilter])

  const exportExcel = () => {
    if (filteredPurchases.length === 0) return
    const rows = filteredPurchases.map((p) => ({
      "Purchase No": p.purchaseNo,
      Vendor: supName(p.supplierId),
      "Bill No": p.billNo ?? "",
      Date: p.date,
      Type: purchaseTypeLabel(p.purchaseType),
      Gross: p.totalGrossAmount,
      GST: p.cgst + p.sgst,
      Net: p.netAmount,
      Paid: p.amountPaid,
      Balance: p.balance,
      Status: payStatus(p),
    }))
    exportObjectsToExcel(`purchases-${new Date().toISOString().slice(0, 10)}.xlsx`, "Purchases", rows)
  }

  const PAY_TONE: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    partial: "bg-amber-100 text-amber-800",
    pending: "bg-red-100 text-red-800",
  }

  return (
    <>
      <PageHeader
        title="Purchase & Suppliers"
        subtitle={`${purchases.length} purchases · ${suppliers.length} suppliers`}
        actions={
          tab === "purchases" ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button size="sm" onClick={() => setPurchaseOpen(true)}>
                <Plus className="size-4" /> New Purchase
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setEditSupplier(null)
                setSupplierOpen(true)
              }}
            >
              <UserPlus className="size-4" /> New Supplier
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="returns">Returns ({returns.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="purchases" className="min-h-0 flex-1 overflow-auto">
          {purchases.length === 0 ? (
            <Empty
              icon={<Truck className="size-10 text-muted-foreground/50" />}
              text="No purchases yet."
              action={
                <Button size="sm" onClick={() => setPurchaseOpen(true)}>
                  <Plus className="size-4" /> New Purchase
                </Button>
              }
            />
          ) : (
            <div className="space-y-3 p-4">
              {/* Dashboard */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <Metric label="Today" value={`₹${formatAmount(metrics.todayAmt)}`} />
                <Metric label="This Month" value={`₹${formatAmount(metrics.monthAmt)}`} />
                <Metric label="Pending Payments" value={`₹${formatAmount(metrics.pending)}`} tone="red" />
                <Metric label="Outstanding Vendors" value={String(metrics.outVendors)} />
                <Metric label="Bullion Purchases" value={String(metrics.bullion)} />
                <Metric label="Avg Gold Rate" value={metrics.avgRate ? `₹${formatAmount(metrics.avgRate)}/g` : "—"} />
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search purchase / vendor / bill"
                    className="h-8 pl-8"
                  />
                </div>
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue placeholder="All vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {PURCHASE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={payFilter} onValueChange={setPayFilter}>
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue placeholder="Payment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any payment</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
                <span className="ml-auto text-xs text-muted-foreground">{filteredPurchases.length} shown</span>
              </div>

              <div className="overflow-x-auto rounded-xl border bg-card">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="w-24">Purchase No</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="w-24">Bill No</TableHead>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead className="w-28 text-right">Gross</TableHead>
                      <TableHead className="w-28 text-right">Net</TableHead>
                      <TableHead className="w-24 text-right">Paid</TableHead>
                      <TableHead className="w-28 text-right">Balance</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-16 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                          No purchases match your filters.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredPurchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.purchaseNo}</TableCell>
                    <TableCell>{supName(p.supplierId)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.billNo ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.date)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(p.totalGrossAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {formatAmount(p.netAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(p.amountPaid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular",
                        p.balance > 0 && "text-destructive",
                      )}
                    >
                      {p.balance > 0 ? formatAmount(p.balance) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", PAY_TONE[payStatus(p)])}>
                        {payStatus(p)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7" aria-label="Purchase actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {p.balance > 0 && (
                            <DropdownMenuItem onClick={() => setPayVendor(supById.get(p.supplierId) ?? null)}>
                              <IndianRupee className="size-4" /> Pay
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setReturnPurchase(p)}>
                            <RotateCcw className="size-4" /> Return
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="suppliers" className="min-h-0 flex-1 overflow-auto">
          {suppliers.length === 0 ? (
            <Empty
              icon={<UserPlus className="size-10 text-muted-foreground/50" />}
              text="No suppliers yet."
              action={
                <Button size="sm" onClick={() => setSupplierOpen(true)}>
                  <UserPlus className="size-4" /> New Supplier
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32">Mobile</TableHead>
                  <TableHead className="w-28">City</TableHead>
                  <TableHead className="w-40">GSTIN</TableHead>
                  <TableHead className="w-28 text-right">Outstanding</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => {
                  const out = outstanding.get(s.id!) ?? 0
                  return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setLedgerVendor(s)}>
                    <TableCell className="font-medium">
                      {s.name}
                      {s.status === "inactive" && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">inactive</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {s.mobile ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.gstin ?? "—"}
                    </TableCell>
                    <TableCell className={cn("text-right tabular", out > 0 && "text-destructive")}>
                      {out !== 0 ? formatAmount(out) : "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7" aria-label="Vendor actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLedgerVendor(s)}>
                            <BookOpen className="size-4" /> Ledger
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPayVendor(s)}>
                            <IndianRupee className="size-4" /> Record Payment
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditSupplier(s)
                              setSupplierOpen(true)
                            }}
                          >
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        <TabsContent value="returns" className="min-h-0 flex-1 overflow-auto">
          {returns.length === 0 ? (
            <Empty
              icon={<RotateCcw className="size-10 text-muted-foreground/50" />}
              text="No purchase returns yet."
              action={null}
            />
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-24">Return No</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-20 text-right">Weight</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.returnNo}</TableCell>
                    <TableCell>{supName(r.supplierId)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.date)}</TableCell>
                    <TableCell className="text-right tabular">{formatAmount(r.amount)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">
                      {r.weight ? `${r.weight} g` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.reason}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      <PurchaseFormDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} />
      <SupplierFormDialog
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        editSupplier={editSupplier}
      />
      <VendorPaymentDialog vendor={payVendor} onOpenChange={(o) => !o && setPayVendor(null)} />
      <ReturnDialog purchase={returnPurchase} onOpenChange={(o) => !o && setReturnPurchase(null)} />
      <VendorLedgerDialog
        vendor={ledgerVendor}
        onOpenChange={(o) => !o && setLedgerVendor(null)}
        onPay={(v) => {
          setLedgerVendor(null)
          setPayVendor(v)
        }}
      />
    </>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-bold tabular", tone === "red" && "text-destructive")}>{value}</div>
    </div>
  )
}

function Empty({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode
  text: string
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
      {icon}
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}
