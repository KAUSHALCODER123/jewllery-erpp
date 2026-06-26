import { Printer, X } from "lucide-react"
import type { Item } from "@/db/types"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import { Barcode } from "@/components/Barcode"

/**
 * Print overlay that lays out one jewellery tag label per item. Reuses the
 * global print CSS (.print-overlay / .print-area / .no-print) so only the
 * labels reach the printer / thermal label roll.
 */
export function BarcodeLabels({
  items,
  onClose,
}: {
  items: Item[]
  onClose: () => void
}) {
  const company = useSession((s) => s.company)
  const shopName = company?.name ?? "Jewellery Shop"

  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/40 p-6">
      <div className="no-print mb-3 flex w-[200mm] max-w-full items-center justify-between">
        <span className="text-sm font-medium text-white">
          {items.length} label(s)
        </span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X className="size-4" /> Close
          </Button>
        </div>
      </div>

      <div className="print-area flex w-[200mm] max-w-full flex-wrap gap-2 bg-white p-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col items-center justify-between rounded border border-black/40 px-2 py-1 text-center text-black"
            style={{ width: "48mm", height: "26mm" }}
          >
            <div className="w-full truncate text-[8px] font-semibold uppercase tracking-wide">
              {shopName}
            </div>
            <Barcode value={item.tag} height={24} width={1.2} fontSize={9} />
            <div className="flex w-full items-center justify-between text-[8px] leading-tight">
              <span>{item.purity}</span>
              <span>N: {item.netWt.toFixed(3)}g</span>
            </div>
            {item.huid && (
              <div className="w-full truncate text-[7px] text-black/70">
                HUID: {item.huid}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
