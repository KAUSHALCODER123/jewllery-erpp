import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import type { Supplier } from "@/db/types"
import { suppliersService } from "@/services/dbService"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  const [f, setF] = useState<Partial<Supplier>>({})
  const [adv, setAdv] = useState(false)
  const set = (patch: Partial<Supplier>) => setF((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (!open) return
    setF(
      editSupplier ?? {
        name: "",
        status: "active",
        openingBalance: 0,
      },
    )
    setAdv(false)
  }, [open, editSupplier])

  const save = async () => {
    if (!f.name?.trim()) return toast.error("Enter vendor name")
    const payload = {
      name: f.name.trim(),
      mobile: f.mobile?.trim() || undefined,
      email: f.email?.trim() || undefined,
      gstin: f.gstin?.trim().toUpperCase() || undefined,
      pan: f.pan?.trim().toUpperCase() || undefined,
      address: f.address?.trim() || undefined,
      city: f.city?.trim() || undefined,
      state: f.state?.trim() || undefined,
      bankName: f.bankName?.trim() || undefined,
      bankAccount: f.bankAccount?.trim() || undefined,
      bankIfsc: f.bankIfsc?.trim().toUpperCase() || undefined,
      creditLimit: f.creditLimit || undefined,
      paymentTerms: f.paymentTerms?.trim() || undefined,
      rating: f.rating || undefined,
      status: (f.status as "active" | "inactive") ?? "active",
      notes: f.notes?.trim() || undefined,
      openingBalance: f.openingBalance ?? 0,
    }
    try {
      if (editSupplier?.id) {
        await suppliersService.update(editSupplier.id, payload)
        toast.success(`Updated ${payload.name}`)
        onOpenChange(false)
      } else {
        const created = await suppliersService.add(payload)
        toast.success(`Added vendor ${payload.name}`)
        onSaved?.(created)
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    }
  }

  const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v) || 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>{editSupplier ? "Edit Vendor" : "New Vendor"}</DialogTitle>
          <DialogDescription>A positive opening balance means the shop owes the vendor.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" full>
              <Input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} autoFocus />
            </Field>
            <Field label="Mobile">
              <Input value={f.mobile ?? ""} onChange={(e) => set({ mobile: e.target.value })} />
            </Field>
            <Field label="City">
              <Input value={f.city ?? ""} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <Input value={f.gstin ?? ""} onChange={(e) => set({ gstin: e.target.value })} className="uppercase" maxLength={15} />
            </Field>
            <Field label="Status">
              <Select value={f.status ?? "active"} onValueChange={(v) => set({ status: v as "active" | "inactive" })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Opening Balance (₹)" full>
              <Input
                type="number"
                className="tabular text-right"
                value={f.openingBalance || ""}
                onChange={(e) => set({ openingBalance: e.target.value === "" ? 0 : Number(e.target.value) || 0 })}
              />
            </Field>
          </div>

          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setAdv((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {adv ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              More details (KYC, bank, terms)
            </button>
            {adv && (
              <div className="grid grid-cols-2 gap-2 border-t p-3">
                <Field label="Email">
                  <Input value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
                </Field>
                <Field label="PAN">
                  <Input value={f.pan ?? ""} onChange={(e) => set({ pan: e.target.value })} className="uppercase" maxLength={10} />
                </Field>
                <Field label="State">
                  <Input value={f.state ?? ""} onChange={(e) => set({ state: e.target.value })} />
                </Field>
                <Field label="Address">
                  <Input value={f.address ?? ""} onChange={(e) => set({ address: e.target.value })} />
                </Field>
                <Field label="Bank Name">
                  <Input value={f.bankName ?? ""} onChange={(e) => set({ bankName: e.target.value })} />
                </Field>
                <Field label="Account No">
                  <Input value={f.bankAccount ?? ""} onChange={(e) => set({ bankAccount: e.target.value })} />
                </Field>
                <Field label="IFSC">
                  <Input value={f.bankIfsc ?? ""} onChange={(e) => set({ bankIfsc: e.target.value })} className="uppercase" maxLength={11} />
                </Field>
                <Field label="Credit Limit (₹)">
                  <Input
                    type="number"
                    className="tabular text-right"
                    value={f.creditLimit || ""}
                    onChange={(e) => set({ creditLimit: num(e.target.value) })}
                  />
                </Field>
                <Field label="Payment Terms">
                  <Input value={f.paymentTerms ?? ""} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="e.g. 30 days" />
                </Field>
                <Field label="Rating (0–5)">
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={1}
                    className="tabular text-right"
                    value={f.rating || ""}
                    onChange={(e) => set({ rating: e.target.value === "" ? undefined : Math.min(5, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </Field>
                <Field label="Notes" full>
                  <Textarea value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
                </Field>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>{editSupplier ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
