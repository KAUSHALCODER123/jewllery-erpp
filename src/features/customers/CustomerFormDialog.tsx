import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { Customer } from "@/db/types"
import { customerSchema, type CustomerFormValues } from "@/lib/validators"
import { customersService } from "@/services/dbService"
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

const emptyValues: CustomerFormValues = {
  name: "",
  mobile: "",
  address: "",
  city: "",
  email: "",
  pan: "",
  aadhaar: "",
  gstin: "",
  birthDate: "",
  anniversary: "",
  openingBalance: 0,
  loyaltyPoints: 0,
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  editCustomer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editCustomer?: Customer | null
}) {
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    if (editCustomer) {
      form.reset({
        name: editCustomer.name,
        mobile: editCustomer.mobile,
        address: editCustomer.address ?? "",
        city: editCustomer.city ?? "",
        email: editCustomer.email ?? "",
        pan: editCustomer.pan ?? "",
        aadhaar: editCustomer.aadhaar ?? "",
        gstin: editCustomer.gstin ?? "",
        birthDate: editCustomer.birthDate ?? "",
        anniversary: editCustomer.anniversary ?? "",
        openingBalance: editCustomer.openingBalance,
        loyaltyPoints: editCustomer.loyaltyPoints,
      })
    } else {
      form.reset(emptyValues)
    }
  }, [open, editCustomer, form])

  const onSubmit = async (values: CustomerFormValues) => {
    const payload = {
      name: values.name,
      mobile: values.mobile,
      address: values.address || undefined,
      city: values.city || undefined,
      email: values.email || undefined,
      pan: values.pan || undefined,
      aadhaar: values.aadhaar || undefined,
      gstin: values.gstin || undefined,
      birthDate: values.birthDate || undefined,
      anniversary: values.anniversary || undefined,
      openingBalance: values.openingBalance,
      loyaltyPoints: values.loyaltyPoints,
    }
    try {
      if (editCustomer?.id) {
        await customersService.update(editCustomer.id, payload)
        toast.success(`Updated ${values.name}`)
      } else {
        await customersService.add(payload)
        toast.success(`Added ${values.name}`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save customer: ${(err as Error).message}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editCustomer ? "Edit Customer" : "New Customer"}
          </DialogTitle>
          <DialogDescription>
            A positive opening balance means the customer owes the shop (Udhari).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="10-digit number"
                        className="tabular"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="pan"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PAN</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ABCDE1234F"
                        maxLength={10}
                        className="uppercase"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="aadhaar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aadhaar</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        maxLength={12}
                        placeholder="12 digits"
                        className="tabular"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gstin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GSTIN</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="optional"
                        maxLength={15}
                        className="uppercase"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birth Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="anniversary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Anniversary</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="openingBalance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opening Balance (₹)</FormLabel>
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
                name="loyaltyPoints"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loyalty Points</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="0"
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
                {editCustomer ? "Save Changes" : "Add Customer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
