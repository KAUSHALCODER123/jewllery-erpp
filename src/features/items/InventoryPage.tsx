import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  PackageOpen,
  MoreHorizontal,
  Barcode as BarcodeIcon,
} from "lucide-react"
import { toast } from "sonner"
import type { Item } from "@/db/types"
import { itemsService } from "@/services/dbService"
import { seedItemsIfEmpty } from "@/db/seed"
import { CATEGORIES, ITEM_STATUS } from "@/lib/constants"
import { formatAmount, wt } from "@/lib/format"
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
import { ItemFormDialog } from "./ItemFormDialog"
import { BarcodeLabels } from "./BarcodeLabels"

export function InventoryPage() {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [labelItems, setLabelItems] = useState<Item[] | null>(null)

  const items = useLiveQuery(() => itemsService.getAll(), [], undefined)

  const filtered = useMemo(() => {
    if (!items) return []
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      const matchesCat = category === "all" || i.category === category
      const matchesText =
        !q ||
        i.tag.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.huid?.toLowerCase().includes(q) ?? false)
      return matchesCat && matchesText
    })
  }, [items, search, category])

  const totals = useMemo(() => {
    const grossWt = filtered.reduce((s, i) => s + i.grossWt, 0)
    const netWt = filtered.reduce((s, i) => s + i.netWt, 0)
    return { count: filtered.length, grossWt, netWt }
  }, [filtered])

  const openCreate = () => {
    setEditItem(null)
    setDialogOpen(true)
  }
  const openEdit = (item: Item) => {
    setEditItem(item)
    setDialogOpen(true)
  }

  const handleDelete = async (item: Item) => {
    if (!item.id) return
    if (!confirm(`Delete ${item.name} (${item.tag})?`)) return
    await itemsService.remove(item.id)
    toast.success(`Deleted ${item.tag}`)
  }

  const loadDemo = async () => {
    const n = await seedItemsIfEmpty()
    toast.success(n ? `Loaded ${n} demo items` : "Inventory already has items")
  }

  return (
    <>
      <PageHeader
        title="Item Master"
        subtitle={`${totals.count} items · ${wt(totals.grossWt)} g gross · ${wt(totals.netWt)} g net`}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Item
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="relative w-72">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tag, name or HUID…"
            className="pl-8"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.prefix} value={c.label}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={filtered.length === 0}
          onClick={() => setLabelItems(filtered)}
          title="Print barcode labels for the listed items"
        >
          <BarcodeIcon className="size-4" /> Print Labels ({filtered.length})
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {items && items.length === 0 ? (
          <EmptyState onLoadDemo={loadDemo} onCreate={openCreate} />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-28">Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Category</TableHead>
                <TableHead className="w-28">Purity</TableHead>
                <TableHead className="w-20 text-right">Gross</TableHead>
                <TableHead className="w-20 text-right">Stone</TableHead>
                <TableHead className="w-20 text-right">Net</TableHead>
                <TableHead className="w-24 text-right">Making/g</TableHead>
                <TableHead className="w-24">HUID</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const status = ITEM_STATUS[item.status ?? "in_stock"]
                return (
                  <TableRow key={item.id} className="cursor-default">
                    <TableCell className="font-medium">{item.tag}</TableCell>
                    <TableCell className="max-w-[280px] truncate">
                      {item.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.category}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.purity}
                    </TableCell>
                    <TableCell className="text-right tabular">{wt(item.grossWt)}</TableCell>
                    <TableCell className="text-right tabular">{wt(item.stoneWt)}</TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {wt(item.netWt)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatAmount(item.makingChargePerGm)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.huid ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-medium",
                          status.tone,
                        )}
                      >
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(item)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLabelItems([item])}>
                            <BarcodeIcon className="size-4" /> Print Label
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && items && items.length > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No items match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <ItemFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
      />
      {labelItems && (
        <BarcodeLabels items={labelItems} onClose={() => setLabelItems(null)} />
      )}
    </>
  )
}

function EmptyState({
  onLoadDemo,
  onCreate,
}: {
  onLoadDemo: () => void
  onCreate: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
      <PackageOpen className="size-10 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">
        Your inventory is empty. Add an item or load demo stock to try the POS.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onLoadDemo}>
          Load demo stock
        </Button>
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" /> New Item
        </Button>
      </div>
    </div>
  )
}
