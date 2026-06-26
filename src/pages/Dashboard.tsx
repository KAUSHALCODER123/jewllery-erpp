import { useLiveQuery } from "dexie-react-hooks"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { dbService } from "@/services/dbService"
import { seedAllIfEmpty } from "@/db/seed"

/**
 * Phase 1 smoke-test dashboard: proves the Dexie layer, React Query/Dexie live
 * binding, Tailwind theme and shadcn components are all wired together.
 * Real KPIs land in Phase 5 (Day Book).
 */
export function Dashboard() {
  const itemCount = useLiveQuery(() => dbService.items.count(), [], 0)
  const customers = useLiveQuery(() => dbService.customers.getAll(), [], [])
  const invoices = useLiveQuery(() => dbService.sales.getInvoices(), [], [])

  const stats = [
    { label: "Items in Master", value: itemCount },
    { label: "Customers", value: customers.length },
    { label: "Invoices", value: invoices.length },
  ]

  const loadDemo = async () => {
    const { items, customers: c } = await seedAllIfEmpty()
    toast.success(
      items || c
        ? `Loaded ${items} items and ${c} customers`
        : "Demo data already present",
    )
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h1 className="text-sm font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadDemo}>
            Load demo data
          </Button>
          <span className="text-xs text-muted-foreground">
            {dbService.todayStr()}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="tabular text-2xl font-semibold text-primary">
                  {s.value}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-6 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Phase 1 complete: Vite + React + TypeScript, Tailwind v4 with the gold/copper
          theme, shadcn/ui, and the offline Dexie database (abstracted behind{" "}
          <code className="rounded bg-muted px-1">dbService.ts</code>) are all live.
          Item Master, the Unified POS, Girvi, Karigar and the Day Book arrive in the
          following phases.
        </p>
      </div>
    </>
  )
}
