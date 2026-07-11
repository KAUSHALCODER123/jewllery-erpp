import { useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import { Plus, Truck, Pencil, UserPlus, MoreHorizontal, BookOpen, IndianRupee, RotateCcw } from "lucide-react"
import type { PurchaseInvoice, Supplier } from "@/db/types"
import { purchaseService, suppliersService, purchasePaymentsService, purchaseReturnsService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
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

  return (
    <>
      <PageHeader
        title="Purchase & Suppliers"
        subtitle={`${purchases.length} purchases · ${suppliers.length} suppliers`}
        actions={
          tab === "purchases" ? (
            <Button size="sm" onClick={() => setPurchaseOpen(true)}>
              <Plus className="size-4" /> New Purchase
            </Button>
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
                  <TableHead className="w-16 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
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
