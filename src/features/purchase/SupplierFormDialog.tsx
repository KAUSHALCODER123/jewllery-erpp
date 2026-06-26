import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Supplier } from "@/db/types"
import { suppliersService } from "@/services/dbService"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function SupplierFormDialog({
  open,
  onOpenChange,
  editSupplier,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editSupplier?: Supplier | null
  onSaved?: (s: Supplier) => void
}) {
  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")
  const [gstin, setGstin] = useState("")
  const [city, setCity] = useState("")
  const [openingBalance, setOpeningBalance] = useState(0)

  useEffect(() => {
    if (!open) return
    setName(editSupplier?.name ?? "")
    setMobile(editSupplier?.mobile ?? "")
    setGstin(editSupplier?.gstin ?? "")
    setCity(editSupplier?.city ?? "")
    setOpeningBalance(editSupplier?.openingBalance ?? 0)
  }, [open, editSupplier])

  const save = async () => {
    if (!name.trim()) return toast.error("Enter supplier name")
    const payload = {
      name: name.trim(),
      mobile: mobile.trim() || undefined,
      gstin: gstin.trim().toUpperCase() || undefined,
      city: city.trim() || undefined,
      openingBalance,
    }
    if (editSupplier?.id) {
      await suppliersService.update(editSupplier.id, payload)
      toast.success(`Updated ${name}`)
      onOpenChange(false)
    } else {
      const created = await suppliersService.add(payload)
      toast.success(`Added supplier ${name}`)
      onSaved?.(created)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editSupplier ? "Edit Supplier" : "New Supplier"}</DialogTitle>
          <DialogDescription>
            A positive opening balance means the shop owes the supplier.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Mobile</Label>
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <Label className="text-xs text-muted-foreground">GSTIN</Label>
          <Input
            value={gstin}
            onChange={(e) => setGstin(e.target.value)}
            className="uppercase"
            maxLength={15}
          />
          <Label className="text-xs text-muted-foreground">Opening Balance (₹)</Label>
          <Input
            type="number"
            className="tabular text-right"
            value={openingBalance || ""}
            onChange={(e) =>
              setOpeningBalance(
                e.target.value === "" ? 0 : e.target.valueAsNumber || 0,
              )
            }
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>
            {editSupplier ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
