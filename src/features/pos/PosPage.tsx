import { useState } from "react"
import { Pencil } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PosTopBar } from "./PosTopBar"
import { SalesGrid } from "./SalesGrid"
import { UrdGrid } from "./UrdGrid"
import { CheckoutPane } from "./CheckoutPane"
import { InvoiceReceipt, type PrintPayload } from "./InvoiceReceipt"
import { usePosStore } from "./usePosStore"

export function PosPage() {
  const [printPayload, setPrintPayload] = useState<PrintPayload | null>(null)
  const urdCount = usePosStore((s) => s.urd.length)
  const salesCount = usePosStore((s) => s.sales.length)
  const editingInvoiceNo = usePosStore((s) => s.editingInvoiceNo)
  const reset = usePosStore((s) => s.reset)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PosTopBar />

      {editingInvoiceNo && (
        <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          <Pencil className="size-3.5" />
          <span>
            Editing invoice <span className="font-semibold">{editingInvoiceNo}</span>{" "}
            — saving will update it.
          </span>
          <button
            className="ml-auto rounded border border-amber-300 px-2 py-0.5 font-medium hover:bg-amber-100"
            onClick={reset}
          >
            Cancel edit / New bill
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left ledger pane with nested tabs */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Tabs defaultValue="sales" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="m-2 self-start">
              <TabsTrigger value="sales">
                New Sales
                {salesCount > 0 && (
                  <span className="ml-1.5 rounded bg-primary/15 px-1 text-[10px] text-primary">
                    {salesCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="urd">
                URD Purchase (Old Gold)
                {urdCount > 0 && (
                  <span className="ml-1.5 rounded bg-secondary/20 px-1 text-[10px] text-secondary">
                    {urdCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sales" className="min-h-0 flex-1">
              <SalesGrid />
            </TabsContent>
            <TabsContent value="urd" className="min-h-0 flex-1">
              <UrdGrid />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right checkout pane */}
        <CheckoutPane onSaved={setPrintPayload} />
      </div>

      {printPayload && (
        <InvoiceReceipt
          payload={printPayload}
          onClose={() => setPrintPayload(null)}
        />
      )}
    </div>
  )
}
