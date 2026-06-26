import { useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Check, ChevronsUpDown } from "lucide-react"
import { customersService } from "@/services/dbService"
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

/** Reusable searchable customer picker (used by POS and Girvi). */
export function CustomerCombobox({
  value,
  onChange,
  className,
}: {
  value: number | null
  onChange: (id: number | null) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const customers = useLiveQuery(() => customersService.getAll(), [], [])
  const selected = customers.find((c) => c.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", className)}
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
          <CommandInput placeholder="Search name or mobile…" />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.mobile}`}
                  onSelect={() => {
                    onChange(c.id ?? null)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === c.id ? "opacity-100" : "opacity-0",
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
  )
}
