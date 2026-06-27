import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus, Truck, Pencil, UserPlus } from "lucide-react"
import type { Supplier } from "@/db/types"
import { purchaseService, suppliersService } from "@/services/dbService"
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
import { PurchaseFormDialog } from "./PurchaseFormDialog"
import { SupplierFormDialog } from "./SupplierFormDialog"

export function PurchasePage() {
  const [tab, setTab] = useState("purchases")
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)

  const purchases = useLiveQuery(() => purchaseService.getInvoices(), [], [])
  const suppliers = useLiveQuery(() => suppliersService.getAll(), [], [])
  const supName = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of suppliers) m.set(s.id!, s.name)
    return m
  }, [suppliers])

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.purchaseNo}</TableCell>
                    <TableCell>{supName.get(p.supplierId) ?? "—"}</TableCell>
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
                  <TableHead className="w-28 text-right">Opening Bal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {s.mobile ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.gstin ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(s.openingBalance)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Edit supplier"
                        title="Edit supplier"
                        onClick={() => {
                          setEditSupplier(s)
                          setSupplierOpen(true)
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
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
