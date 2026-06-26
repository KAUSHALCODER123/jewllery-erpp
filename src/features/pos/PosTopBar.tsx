import { useState, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Check, ChevronsUpDown, UserPlus, User, Zap } from "lucide-react"
import { toast } from "sonner"
import { customersService } from "@/services/dbService"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { CustomerFormDialog } from "@/features/customers/CustomerFormDialog"
import { usePosStore } from "./usePosStore"

export function PosTopBar() {
  const customerId = usePosStore((s) => s.customerId)
  const setCustomer = usePosStore((s) => s.setCustomer)

  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const customers = useLiveQuery(() => customersService.getAll(), [], [])
  const selected = customers.find((c) => c.id === customerId) ?? null

  // Walk-in: create a minimal customer from the typed name and select it.
  const quickAdd = async () => {
    const name = query.trim()
    if (!name) return
    const created = await customersService.add({
      name,
      mobile: "",
      openingBalance: 0,
      loyaltyPoints: 0,
    })
    setCustomer(created.id ?? null)
    setQuery("")
    setOpen(false)
    toast.success(`Walk-in customer "${name}" added`)
  }

  // Live outstanding (Udhari) for the selected customer.
  const outstanding = useLiveQuery(
    () => (customerId ? customersService.getOutstanding(customerId) : Promise.resolve(0)),
    [customerId],
    0,
  )

  return (
    <div className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4">
      <div className="flex items-center gap-2">
        <User className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Customer</span>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-72 justify-between font-normal"
          >
            {selected ? (
              <span className="truncate">
                {selected.name}{" "}
                <span className="text-muted-foreground tabular">
                  · {selected.mobile}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Select customer…</span>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search, or type a new name…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No customer found.</CommandEmpty>
              {query.trim() && (
                <CommandGroup heading="Walk-in">
                  <CommandItem
                    value={`__quickadd_${query}`}
                    onSelect={() => void quickAdd()}
                  >
                    <Zap className="size-4 text-primary" />
                    Add “{query.trim()}” as walk-in customer
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.mobile}`}
                    onSelect={() => {
                      setCustomer(c.id ?? null)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        customerId === c.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {c.mobile}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAddOpen(true)}
        title="Add new customer"
      >
        <UserPlus className="size-4" /> New
      </Button>

      {/* Past pending amount (Udhari) — red when the customer owes money. */}
      {selected && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Past Pending</span>
          <span
            className={cn(
              "rounded px-2 py-1 text-sm font-semibold tabular",
              outstanding > 0
                ? "bg-destructive/10 text-destructive"
                : outstanding < 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {outstanding > 0
              ? `${formatAmount(outstanding)} Dr`
              : outstanding < 0
                ? `${formatAmount(-outstanding)} Cr (Advance)`
                : "No dues"}
          </span>
        </div>
      )}

      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
