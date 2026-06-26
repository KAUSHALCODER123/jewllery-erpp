import { useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useRef } from "react"
import { Plus, KeyRound, UserCog, ArrowLeftRight, Download, Upload, Printer, AlertTriangle, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import type { UserRole } from "@/db/systemDb"
import { Textarea } from "@/components/ui/textarea"
import { authService } from "@/services/authService"
import { maintenanceService, type BackupFile } from "@/services/dbService"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { switchCompany, activeCompanyId } from "@/db/database"
import { downloadText } from "@/lib/csv"
import { useSession } from "@/stores/useSession"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function SettingsPage() {
  const user = useSession((s) => s.user)
  const isOwner = user?.role === "owner"

  return (
    <>
      <PageHeader title="Settings" subtitle="Shop profile · Print layouts · Firms · Users" />
      <Tabs defaultValue="shop" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="shop">Shop Profile</TabsTrigger>
            <TabsTrigger value="print">Print & Rates</TabsTrigger>
            <TabsTrigger value="firms">Firms</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="account">My Account</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="shop" className="min-h-0 flex-1 overflow-auto p-4">
          <ShopProfile />
        </TabsContent>
        <TabsContent value="print" className="min-h-0 flex-1 overflow-auto p-4">
          <PrintSettings />
        </TabsContent>
        <TabsContent value="firms" className="min-h-0 flex-1 overflow-auto p-4">
          <Firms />
        </TabsContent>
        <TabsContent value="users" className="min-h-0 flex-1 overflow-auto p-4">
          {isOwner ? <UsersAdmin /> : <NoAccess />}
        </TabsContent>
        <TabsContent value="account" className="min-h-0 flex-1 overflow-auto p-4">
          <MyAccount />
        </TabsContent>
        <TabsContent value="backup" className="min-h-0 flex-1 overflow-auto p-4">
          <Backup />
        </TabsContent>
      </Tabs>
    </>
  )
}

function NoAccess() {
  return (
    <p className="text-sm text-muted-foreground">
      Only the owner can manage users.
    </p>
  )
}

function ShopProfile() {
  const company = useSession((s) => s.company)
  const setCompanyProfile = useSession((s) => s.setCompanyProfile)
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    gstin: "",
    phone: "",
  })

  useEffect(() => {
    if (company)
      setForm({
        name: company.name ?? "",
        address: company.address ?? "",
        city: company.city ?? "",
        gstin: company.gstin ?? "",
        phone: company.phone ?? "",
      })
  }, [company])

  const save = async () => {
    if (!company?.id) return
    if (!form.name.trim()) return toast.error("Shop name is required")
    await authService.updateCompany(company.id, form)
    setCompanyProfile({ ...company, ...form })
    toast.success("Shop profile saved — invoices & Pavati will use it")
  }

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-xs text-muted-foreground">
        These details print on the header of every Tax Invoice and Girvi Pavati.
      </p>
      <Field label="Shop / Firm Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Address">
        <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
      <Field label="GSTIN">
        <Input
          className="uppercase"
          maxLength={15}
          value={form.gstin}
          onChange={(e) => setForm({ ...form, gstin: e.target.value })}
        />
      </Field>
      <Button onClick={() => void save()}>Save Shop Profile</Button>
    </div>
  )
}

function PrintSettings() {
  const company = useSession((s) => s.company)
  const setCompanyProfile = useSession((s) => s.setCompanyProfile)
  const [form, setForm] = useState({
    printPaperSize: "A5" as "A4" | "A5" | "80mm",
    printShowLogo: false,
    printLogoUrl: "",
    printBankName: "",
    printBankAccountNo: "",
    printBankIfsc: "",
    printBankBranch: "",
    printTermsText: "",
    printShowHuid: true,
    printAccentColor: "#000000",
    defaultGstRate: 3,
    defaultHsnCode: "7113",
    loyaltyEarnPerGram: 1,
    loyaltyRupeesPerPoint: 1,
  })
  const [colorMode, setColorMode] = useState("default")

  useEffect(() => {
    if (company) {
      setForm({
        printPaperSize: company.printPaperSize ?? "A5",
        printShowLogo: company.printShowLogo ?? false,
        printLogoUrl: company.printLogoUrl ?? "",
        printBankName: company.printBankName ?? "",
        printBankAccountNo: company.printBankAccountNo ?? "",
        printBankIfsc: company.printBankIfsc ?? "",
        printBankBranch: company.printBankBranch ?? "",
        printTermsText: company.printTermsText ?? "",
        printShowHuid: company.printShowHuid ?? true,
        printAccentColor: company.printAccentColor ?? "#000000",
        defaultGstRate: company.defaultGstRate ?? 3,
        defaultHsnCode: company.defaultHsnCode ?? "7113",
        loyaltyEarnPerGram: company.loyaltyEarnPerGram ?? 1,
        loyaltyRupeesPerPoint: company.loyaltyRupeesPerPoint ?? 1,
      })

      const accentColor = company.printAccentColor ?? "#000000"
      if (accentColor === "#000000" || accentColor === "") setColorMode("default")
      else if (accentColor === "#d97706") setColorMode("gold")
      else if (accentColor === "#059669") setColorMode("emerald")
      else if (accentColor === "#4f46e5") setColorMode("indigo")
      else if (accentColor === "#dc2626") setColorMode("crimson")
      else setColorMode("custom")
    }
  }, [company])

  const handleColorModeChange = (mode: string) => {
    setColorMode(mode)
    let hex = "#000000"
    if (mode === "gold") hex = "#d97706"
    else if (mode === "emerald") hex = "#059669"
    else if (mode === "indigo") hex = "#4f46e5"
    else if (mode === "crimson") hex = "#dc2626"
    else if (mode === "custom") hex = form.printAccentColor || "#d97706"
    setForm((f) => ({ ...f, printAccentColor: hex }))
  }

  const onLogoUpload = (file?: File) => {
    if (!file) return
    if (file.size > 2_000_000) {
      toast.error("Logo size too large (max 2 MB)")
      return
    }
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, printLogoUrl: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!company?.id) return
    const patch = {
      printPaperSize: form.printPaperSize,
      printShowLogo: form.printShowLogo,
      printLogoUrl: form.printLogoUrl,
      printBankName: form.printBankName.trim(),
      printBankAccountNo: form.printBankAccountNo.trim(),
      printBankIfsc: form.printBankIfsc.trim().toUpperCase(),
      printBankBranch: form.printBankBranch.trim(),
      printTermsText: form.printTermsText.trim(),
      printShowHuid: form.printShowHuid,
      printAccentColor: form.printAccentColor,
      defaultGstRate: form.defaultGstRate,
      defaultHsnCode: form.defaultHsnCode.trim(),
      loyaltyEarnPerGram: form.loyaltyEarnPerGram,
      loyaltyRupeesPerPoint: form.loyaltyRupeesPerPoint,
    }
    await authService.updateCompany(company.id, patch)
    setCompanyProfile({ ...company, ...patch })
    toast.success("Print configurations saved successfully")
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-4 rounded-md border p-4 bg-card shadow-xs">
        <h3 className="text-sm font-semibold border-b pb-2 flex items-center gap-1.5">
          <Printer className="size-4" /> Layout & Styling
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default Paper Size">
            <Select
              value={form.printPaperSize}
              onValueChange={(v) => setForm({ ...form, printPaperSize: v as any })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select paper size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4 (Standard Sheet - 210mm)</SelectItem>
                <SelectItem value="A5">A5 (Half Sheet - 148mm)</SelectItem>
                <SelectItem value="80mm">80mm (Thermal Roll)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Print Accent Color">
            <Select value={colorMode} onValueChange={handleColorModeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select accent color" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Black (#000000)</SelectItem>
                <SelectItem value="gold">Gold (#D97706)</SelectItem>
                <SelectItem value="emerald">Emerald Green (#059669)</SelectItem>
                <SelectItem value="indigo">Indigo Blue (#4F46E5)</SelectItem>
                <SelectItem value="crimson">Crimson Red (#DC2626)</SelectItem>
                <SelectItem value="custom">Custom Hex Color...</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {colorMode === "custom" && (
          <div className="max-w-xs pt-1">
            <Field label="Custom Hex Code">
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  placeholder="#000000"
                  maxLength={7}
                  value={form.printAccentColor}
                  onChange={(e) => setForm({ ...form, printAccentColor: e.target.value })}
                  className="font-mono"
                />
                <input
                  type="color"
                  value={form.printAccentColor.startsWith("#") && form.printAccentColor.length === 7 ? form.printAccentColor : "#000000"}
                  onChange={(e) => setForm({ ...form, printAccentColor: e.target.value })}
                  className="size-8 cursor-pointer rounded-md border"
                />
              </div>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Show HUID column on Sales Invoice">
            <Select
              value={form.printShowHuid ? "yes" : "no"}
              onValueChange={(v) => setForm({ ...form, printShowHuid: v === "yes" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Show HUID Column</SelectItem>
                <SelectItem value="no">Hide HUID Column</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-md border p-4 bg-card shadow-xs">
        <h3 className="text-sm font-semibold border-b pb-2">Logo Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <Field label="Logo Visibility" className="col-span-1">
            <Select
              value={form.printShowLogo ? "yes" : "no"}
              onValueChange={(v) => setForm({ ...form, printShowLogo: v === "yes" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Print Logo on Header</SelectItem>
                <SelectItem value="no">Do Not Print Logo</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {form.printShowLogo && (
            <div className="col-span-2 space-y-2">
              <Label className="text-xs text-muted-foreground block">Shop Logo Image</Label>
              <div className="flex gap-4 items-center">
                <label className="flex w-24 h-24 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/30 hover:bg-muted">
                  {form.printLogoUrl ? (
                    <img src={form.printLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground text-center p-1">
                      <Upload className="size-4" />
                      <span className="text-[9px]">Upload logo</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onLogoUpload(e.target.files?.[0])}
                  />
                </label>
                {form.printLogoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setForm((f) => ({ ...f, printLogoUrl: "" }))}
                  >
                    Remove Logo
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-md border p-4 bg-card shadow-xs">
        <h3 className="text-sm font-semibold border-b pb-2">Shop Bank Details (For Invoice Receipts)</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Bank Name">
            <Input
              placeholder="e.g. State Bank of India"
              value={form.printBankName}
              onChange={(e) => setForm({ ...form, printBankName: e.target.value })}
            />
          </Field>
          <Field label="Account Number">
            <Input
              placeholder="e.g. 10023485890"
              value={form.printBankAccountNo}
              onChange={(e) => setForm({ ...form, printBankAccountNo: e.target.value })}
            />
          </Field>
          <Field label="IFSC Code">
            <Input
              placeholder="e.g. SBIN0001234"
              maxLength={11}
              className="uppercase"
              value={form.printBankIfsc}
              onChange={(e) => setForm({ ...form, printBankIfsc: e.target.value })}
            />
          </Field>
          <Field label="Branch Name">
            <Input
              placeholder="e.g. Main Market Branch"
              value={form.printBankBranch}
              onChange={(e) => setForm({ ...form, printBankBranch: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-md border p-4 bg-card shadow-xs">
        <h3 className="text-sm font-semibold border-b pb-2">Default Rates & Loyalty Rules</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Default GST Rate (%)">
            <Input
              type="number"
              step="0.1"
              value={form.defaultGstRate}
              onChange={(e) => setForm({ ...form, defaultGstRate: e.target.value === "" ? 3 : e.target.valueAsNumber || 0 })}
            />
          </Field>
          <Field label="Default HSN Code">
            <Input
              value={form.defaultHsnCode}
              onChange={(e) => setForm({ ...form, defaultHsnCode: e.target.value })}
            />
          </Field>
          <Field label="Loyalty Earn Rate (Points per Gram)">
            <Input
              type="number"
              step="0.1"
              value={form.loyaltyEarnPerGram}
              onChange={(e) => setForm({ ...form, loyaltyEarnPerGram: e.target.value === "" ? 1 : e.target.valueAsNumber || 0 })}
            />
          </Field>
          <Field label="Loyalty Point Value (₹ per Point)">
            <Input
              type="number"
              step="0.1"
              value={form.loyaltyRupeesPerPoint}
              onChange={(e) => setForm({ ...form, loyaltyRupeesPerPoint: e.target.value === "" ? 1 : e.target.valueAsNumber || 0 })}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-md border p-4 bg-card shadow-xs">
        <h3 className="text-sm font-semibold border-b pb-2">Custom Invoice Terms</h3>
        <Field label="Terms & Conditions Statement">
          <Textarea
            placeholder="e.g. Goods once sold cannot be returned. Please check the weight and hallmarks before leaving the counter."
            value={form.printTermsText}
            onChange={(e) => setForm({ ...form, printTermsText: e.target.value })}
            className="min-h-[80px]"
          />
        </Field>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button onClick={() => void save()}>Save Print Configurations</Button>
      </div>
    </div>
  )
}

function Firms() {
  const companies = useLiveQuery(() => authService.listCompanies(), [], [])
  const setSessionCompany = useSession((s) => s.setCompanyProfile)
  const setCurrentId = useSession((s) => s.companyId)
  const [name, setName] = useState("")
  const [city, setCity] = useState("")

  const add = async () => {
    if (!name.trim()) return toast.error("Enter firm name")
    await authService.addCompany({ name: name.trim(), city: city.trim() || undefined })
    toast.success("Firm added — select it at next login or switch now")
    setName("")
    setCity("")
  }

  const doSwitch = (id: number, companyName: string) => {
    if (id === activeCompanyId()) return toast.info("Already on this firm")
    if (!confirm(`Switch to "${companyName}"? The app will reload.`)) return
    const target = companies.find((c) => c.id === id)
    if (target) setSessionCompany(target)
    switchCompany(id) // sets localStorage + reloads
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-md border p-3">
        <h3 className="mb-2 text-sm font-medium">Add a firm / branch</h3>
        <div className="flex items-end gap-2">
          <Field label="Name" className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Button onClick={() => void add()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Each firm keeps fully separate stock, invoices, ledgers and numbering.
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Firm</TableHead>
              <TableHead className="w-28">City</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-muted-foreground">{c.id}</TableCell>
                <TableCell className="font-medium">
                  {c.name}
                  {c.id === setCurrentId && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                      active
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{c.city ?? "—"}</TableCell>
                <TableCell>
                  {c.id !== setCurrentId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => doSwitch(c.id!, c.name)}
                    >
                      <ArrowLeftRight className="size-4" /> Switch
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function UsersAdmin() {
  const users = useLiveQuery(() => authService.listUsers(), [], [])
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<UserRole>("cashier")
  const [password, setPassword] = useState("")

  const add = async () => {
    if (!username.trim() || !name.trim() || !password) {
      return toast.error("Fill username, name and password")
    }
    try {
      await authService.addUser({ username, name, role, password })
      toast.success(`User ${username} created`)
      setUsername("")
      setName("")
      setRole("cashier")
      setPassword("")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-md border p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <UserCog className="size-4" /> Add user
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="cashier">Cashier</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <Button className="mt-2" onClick={() => void add()}>
          <Plus className="size-4" /> Add User
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Role</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{u.role}</TableCell>
                <TableCell>
                  <span
                    className={
                      u.active
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    }
                  >
                    {u.active ? "Active" : "Disabled"}
                  </span>
                </TableCell>
                <TableCell>
                  {u.username !== "admin" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await authService.setActive(u.id!, !u.active)
                        toast.success(`${u.username} ${u.active ? "disabled" : "enabled"}`)
                      }}
                    >
                      {u.active ? "Disable" : "Enable"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function MyAccount() {
  const user = useSession((s) => s.user)
  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")

  const change = async () => {
    if (!user) return
    if (pw.length < 4) return toast.error("Password too short (min 4)")
    if (pw !== pw2) return toast.error("Passwords do not match")
    await authService.changePassword(user.id, pw)
    toast.success("Password changed")
    setPw("")
    setPw2("")
  }

  return (
    <div className="max-w-sm space-y-3">
      <div className="rounded-md border p-3 text-sm">
        <p className="font-medium">{user?.name}</p>
        <p className="text-muted-foreground">
          @{user?.username} · <span className="capitalize">{user?.role}</span>
        </p>
      </div>
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <KeyRound className="size-4" /> Change password
      </h3>
      <Field label="New password">
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Confirm password">
        <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <Button onClick={() => void change()}>Update Password</Button>
    </div>
  )
}

function Backup() {
  const company = useSession((s) => s.company)
  const financialYear = useSession((s) => s.financialYear)
  const fileRef = useRef<HTMLInputElement>(null)

  const [exportScope, setExportScope] = useState<"company" | "system">("company")
  const [previewBackup, setPreviewBackup] = useState<BackupFile | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [isRestoring, setIsRestoring] = useState(false)

  const doBackup = async () => {
    try {
      let data: BackupFile
      let filename = ""

      const stamp = new Date().toISOString().slice(0, 10)
      if (exportScope === "system") {
        data = await maintenanceService.exportSystem({
          financialYear: financialYear ?? undefined,
        })
        filename = `jewel-backup-FULL-SYSTEM-${stamp}.json`
      } else {
        data = await maintenanceService.exportCompany(activeCompanyId(), financialYear ?? undefined)
        const safe = (company?.name ?? "firm").replace(/[^a-z0-9]+/gi, "-")
        filename = `jewel-backup-${safe}-${stamp}.json`
      }

      downloadText(filename, JSON.stringify(data, null, 2), "application/json")

      let rows = 0
      if (data.scope === "system") {
        rows = (data.companiesData ?? []).reduce(
          (sum, cData) => sum + Object.values(cData.tables).reduce((s, t) => s + t.length, 0),
          0,
        )
      } else {
        rows = Object.values(data.tables || {}).reduce((s, t) => s + t.length, 0)
      }
      toast.success(`Backup downloaded · ${rows} records packaged`)
    } catch (err) {
      toast.error(`Backup failed: ${(err as Error).message}`)
    }
  }

  const handleFileChange = async (file?: File) => {
    if (!file) return
    try {
      const text = await file.text()
      const backup = JSON.parse(text) as BackupFile
      if (backup?.app !== "jewel-erp") {
        throw new Error("Not a valid Jewel-ERP backup file")
      }
      setPreviewBackup(backup)
      setConfirmText("")
    } catch (err) {
      toast.error(`Invalid backup file: ${(err as Error).message}`)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const confirmRestore = async () => {
    if (!previewBackup || confirmText !== "RESTORE") return
    setIsRestoring(true)
    try {
      if (previewBackup.scope === "system") {
        const { companies, users, records } = await maintenanceService.importSystem(previewBackup)
        toast.success(`System restored: ${companies} firms, ${users} users, ${records} records. Reloading…`)
      } else {
        const { tables, rows } = await maintenanceService.importCompany(previewBackup, activeCompanyId())
        toast.success(`Firm restored: ${rows} records across ${tables} tables. Reloading…`)
      }
      setTimeout(() => window.location.reload(), 1000)
    } catch (err) {
      toast.error(`Restore failed: ${(err as Error).message}`)
      setIsRestoring(false)
    }
  }

  const previewStats = () => {
    if (!previewBackup) return null
    const scope = previewBackup.scope ?? "company"
    let recordCount = 0
    let tableCount = 0
    let firmsList: string[] = []

    if (scope === "system") {
      tableCount = 0
      recordCount = (previewBackup.companiesData ?? []).reduce((sum, cData) => {
        const keys = Object.keys(cData.tables)
        tableCount += keys.length
        return sum + Object.values(cData.tables).reduce((s, t) => s + t.length, 0)
      }, 0)
      firmsList = (previewBackup.system?.companies ?? []).map((c) => c.name)
    } else {
      const keys = Object.keys(previewBackup.tables || {})
      tableCount = keys.length
      recordCount = Object.values(previewBackup.tables || {}).reduce((s, t) => s + t.length, 0)
      firmsList = [previewBackup.company || "Unknown Firm"]
    }

    return {
      scope,
      recordCount,
      tableCount,
      firmsList,
      date: previewBackup.exportedAt ? new Date(previewBackup.exportedAt).toLocaleString() : "Unknown date",
    }
  }

  const stats = previewStats()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border bg-card p-5 shadow-xs">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold border-b pb-2 mb-4">
          <Download className="size-4 text-amber-500" /> Export Database Backup
        </h3>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Select Backup Scope</Label>
            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === "company"}
                  onChange={() => setExportScope("company")}
                  className="accent-amber-500"
                />
                <span>Active Firm Only ({company?.name})</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === "system"}
                  onChange={() => setExportScope("system")}
                  className="accent-amber-500"
                />
                <span>Entire System (All Firms, Users, and Settings)</span>
              </label>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
            {exportScope === "system"
              ? "Generates a complete snapshot of all firms, global user configurations, and individual sales/girvi/chit records. Recommended for full backups or server migrations."
              : `Generates a single firm snapshot of ${company?.name || "the active company"}. This includes POS sales invoices, local items inventory, schemes accounts, and karigar transactions.`}
          </p>

          <Button className="mt-2 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => void doBackup()}>
            <Download className="size-4" /> Download Backup File
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-xs">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold border-b pb-2 mb-4">
          <Upload className="size-4 text-indigo-500" /> Restore Database Backup
        </h3>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload a previously exported Jewel-ERP JSON backup file to restore your database.
            A validation summary preview will be shown before any write operations are executed.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleFileChange(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            className="border-indigo-500/20 hover:bg-indigo-500/5 hover:text-indigo-600 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" /> Choose Backup File…
          </Button>
        </div>
      </div>

      {/* Restore Confirmation Dialog Preview Modal */}
      <Dialog open={previewBackup !== null} onOpenChange={(open) => { if (!open) setPreviewBackup(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-rose-600">
              <AlertTriangle className="size-5 animate-bounce shrink-0" />
              Confirm Database Restore
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please review the backup file contents below. This operation will overwrite existing database records!
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="space-y-4 my-2 text-xs">
              <div className="rounded-md bg-rose-50 border border-rose-100 p-3 text-rose-800 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
                  <ShieldAlert className="size-3.5" />
                  <span>Warning: Destructive Overwrite</span>
                </div>
                <p className="leading-relaxed">
                  {stats.scope === "system"
                    ? "Restoring this system backup will completely delete and replace all firms (companies), all user accounts, and all business data in the system."
                    : `Restoring this backup will replace all inventory, invoicing, and accounts data for the active company: "${company?.name}".`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border rounded-md p-3 bg-muted/30">
                <div>
                  <span className="text-muted-foreground block">Backup Scope:</span>
                  <span className="font-semibold capitalize text-foreground">{stats.scope}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Exported At:</span>
                  <span className="font-semibold text-foreground">{stats.date}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Tables Packaged:</span>
                  <span className="font-semibold text-foreground">{stats.tableCount} tables</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Total Records:</span>
                  <span className="font-semibold text-foreground">{stats.recordCount} records</span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground font-semibold block mb-1">Firms included in backup:</span>
                <div className="flex flex-wrap gap-1">
                  {stats.firmsList.map((f, i) => (
                    <span key={i} className="bg-muted px-2 py-0.5 rounded border text-[10px] font-medium text-foreground">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-xs font-semibold text-rose-700">
                  To confirm and proceed, please type <span className="font-black bg-rose-100 px-1 py-0.5 rounded">RESTORE</span> below:
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type RESTORE"
                  className="border-rose-300 focus-visible:ring-rose-400"
                  disabled={isRestoring}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isRestoring}
              onClick={() => setPreviewBackup(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50"
              disabled={confirmText !== "RESTORE" || isRestoring}
              onClick={() => void confirmRestore()}
            >
              {isRestoring ? "Restoring..." : "Yes, Confirm & Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
