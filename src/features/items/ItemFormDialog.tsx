import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { Item, MetalType } from "@/db/types"
import { itemSchema, type ItemFormValues } from "@/lib/validators"
import {
  CATEGORIES,
  METAL_TYPES,
  PURITY_OPTIONS,
  categoryByLabel,
} from "@/lib/constants"
import { computeNetWt, itemsService } from "@/services/dbService"
import { formatWt } from "@/lib/format"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const emptyValues: ItemFormValues = {
  name: "",
  type: "gold",
  category: "Ring",
  purity: "22K (916)",
  grossWt: 0,
  stoneWt: 0,
  makingChargePerGm: 0,
  quantity: 1,
  huid: "",
  hsn: "7113",
  tag: "",
}

export function ItemFormDialog({
  open,
  onOpenChange,
  editItem,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits an existing item instead of creating one. */
  editItem?: Item | null
}) {
  const company = useSession((s) => s.company)
  const defaultHsn = company?.defaultHsnCode || "7113"

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: emptyValues,
  })

  // Load values when (re)opening for create or edit.
  useEffect(() => {
    if (!open) return
    if (editItem) {
      form.reset({
        name: editItem.name,
        type: editItem.type,
        category: editItem.category ?? "Ring",
        purity: editItem.purity,
        grossWt: editItem.grossWt,
        stoneWt: editItem.stoneWt,
        makingChargePerGm: editItem.makingChargePerGm,
        quantity: editItem.quantity ?? 1,
        huid: editItem.huid ?? "",
        hsn: editItem.hsn ?? defaultHsn,
        tag: editItem.tag,
      })
    } else {
      form.reset({
        ...emptyValues,
        hsn: defaultHsn,
      })
    }
  }, [open, editItem, form, defaultHsn])

  const grossWt = form.watch("grossWt")
  const stoneWt = form.watch("stoneWt")
  const type = form.watch("type")
  const netWt = computeNetWt(Number(grossWt) || 0, Number(stoneWt) || 0)

  // When category changes (create mode only), default the metal type to suit it.
  const onCategoryChange = (label: string) => {
    form.setValue("category", label)
    if (!editItem) {
      const def = categoryByLabel(label)
      if (def) {
        form.setValue("type", def.defaultType)
        form.setValue("purity", PURITY_OPTIONS[def.defaultType][0])
      }
    }
  }

  const onTypeChange = (value: string) => {
    const t = value as MetalType
    form.setValue("type", t)
    // Keep purity valid for the chosen metal.
    if (!PURITY_OPTIONS[t].includes(form.getValues("purity"))) {
      form.setValue("purity", PURITY_OPTIONS[t][0])
    }
  }

  const onSubmit = async (values: ItemFormValues) => {
    try {
      if (editItem?.id) {
        await itemsService.update(editItem.id, {
          name: values.name,
          type: values.type,
          category: values.category,
          purity: values.purity,
          grossWt: values.grossWt,
          stoneWt: values.stoneWt,
          makingChargePerGm: values.makingChargePerGm,
          quantity: values.quantity,
          huid: values.huid || undefined,
          hsn: values.hsn || undefined,
          tag: values.tag || editItem.tag,
        })
        toast.success(`Updated ${values.name}`)
      } else {
        const cat = categoryByLabel(values.category)
        const created = await itemsService.add({
          name: values.name,
          type: values.type,
          category: values.category,
          purity: values.purity,
          grossWt: values.grossWt,
          stoneWt: values.stoneWt,
          makingChargePerGm: values.makingChargePerGm,
          quantity: values.quantity,
          huid: values.huid || undefined,
          hsn: values.hsn || undefined,
          tag: values.tag || undefined,
          tagPrefix: cat?.prefix ?? "ITM",
        })
        toast.success(`Added ${created.name} · Tag ${created.tag}`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save item: ${(err as Error).message}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editItem ? "Edit Item" : "New Item"}</DialogTitle>
          <DialogDescription>
            Net weight is calculated automatically. Leave Tag blank to
            auto-generate a barcode from the category.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {/* Category / Type / Purity */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={onCategoryChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.prefix} value={c.label}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metal</FormLabel>
                    <Select value={field.value} onValueChange={onTypeChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {METAL_TYPES.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purity</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PURITY_OPTIONS[type].map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Ladies Gold Ring (Floral)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Weights */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="grossWt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gross Wt (g)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        className="tabular"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? 0 : e.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stoneWt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stone Wt (g)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        className="tabular"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? 0 : e.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel className="text-muted-foreground">Net Wt (auto)</FormLabel>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium tabular">
                  {formatWt(netWt)}
                </div>
              </FormItem>
            </div>

            {/* Making / Qty / HUID */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="makingChargePerGm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Making / g (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        className="tabular"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? 0 : e.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        className="tabular"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? 1 : e.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="huid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HUID (6 chars)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="optional"
                        maxLength={6}
                        className="uppercase"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* HSN & Tag */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="hsn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HSN Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 7113" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Barcode Tag</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Leave blank to auto-generate"
                        className="uppercase"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {editItem ? "Save Changes" : "Add Item"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
