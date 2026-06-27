import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus, Search, Pencil, Trash2, Users, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import type { Customer } from "@/db/types"
import { customersService, salesService } from "@/services/dbService"
import { seedCustomersIfEmpty } from "@/db/seed"
import { formatAmount } from "@/lib/format"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CustomerFormDialog } from "./CustomerFormDialog"

export function CustomersPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)

  const customers = useLiveQuery(() => customersService.getAll(), [], undefined)
  const invoices = useLiveQuery(() => salesService.getInvoices(), [], [])

  // Outstanding (Udhari) = opening balance + sum of unpaid invoice balances.
  const outstandingByCustomer = useMemo(() => {
    const map = new Map<number, number>()
    for (const inv of invoices) {
      map.set(inv.customerId, (map.get(inv.customerId) ?? 0) + inv.balance)
    }
    return map
  }, [invoices])

  const filtered = useMemo(() => {
    if (!customers) return []
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q),
    )
  }, [customers, search])

  const outstandingFor = (c: Customer): number =>
    Number((c.openingBalance + (outstandingByCustomer.get(c.id!) ?? 0)).toFixed(2))

  const openCreate = () => {
    setEditCustomer(null)
    setDialogOpen(true)
  }
  const openEdit = (c: Customer) => {
    setEditCustomer(c)
    setDialogOpen(true)
  }

  const handleDelete = async (c: Customer) => {
    if (!c.id) return
    if (!confirm(`Delete customer ${c.name}?`)) return
    await customersService.remove(c.id)
    toast.success(`Deleted ${c.name}`)
  }

  const loadDemo = async () => {
    const n = await seedCustomersIfEmpty()
    toast.success(n ? `Loaded ${n} demo customers` : "Customers already exist")
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${filtered.length} customers`}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Customer
          </Button>
        }
      />

      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="relative w-72">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or mobile…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {customers && customers.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <Users className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No customers yet.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadDemo}>
                Load demo customers
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> New Customer
              </Button>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Mobile</TableHead>
                <TableHead className="w-28">City</TableHead>
                <TableHead className="w-28">PAN</TableHead>
                <TableHead className="w-24 text-right">Loyalty</TableHead>
                <TableHead className="w-32 text-right">Outstanding</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const bal = outstandingFor(c)
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="tabular">{c.mobile}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.pan ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {c.loyaltyPoints}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular",
                        bal > 0 && "text-destructive",
                        bal < 0 && "text-emerald-600",
                      )}
                    >
                      {bal > 0
                        ? `${formatAmount(bal)} Dr`
                        : bal < 0
                          ? `${formatAmount(-bal)} Cr`
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7" aria-label="Customer actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(c)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && customers && customers.length > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No customers match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editCustomer={editCustomer}
      />
    </>
  )
}
