import { useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useRef } from "react"
import { Plus, KeyRound, UserCog, ArrowLeftRight, Download, Upload } from "lucide-react"
import { toast } from "sonner"
import type { UserRole } from "@/db/systemDb"
import { authService } from "@/services/authService"
import { maintenanceService, type BackupFile } from "@/services/dbService"
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
      <PageHeader title="Settings" subtitle="Shop profile · Firms · Users" />
      <Tabs defaultValue="shop" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="shop">Shop Profile</TabsTrigger>
            <TabsTrigger value="firms">Firms</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="account">My Account</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="shop" className="min-h-0 flex-1 overflow-auto p-4">
          <ShopProfile />
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

  const doBackup = async () => {
    const data = await maintenanceService.exportData({
      company: company?.name,
      financialYear: financialYear ?? undefined,
    })
    const stamp = data.exportedAt.slice(0, 10)
    const safe = (company?.name ?? "firm").replace(/[^a-z0-9]+/gi, "-")
    downloadText(`jewel-backup-${safe}-${stamp}.json`, JSON.stringify(data), "application/json")
    const rows = Object.values(data.tables).reduce((s, t) => s + t.length, 0)
    toast.success(`Backup downloaded · ${rows} records`)
  }

  const doRestore = async (file?: File) => {
    if (!file) return
    if (
      !confirm(
        `Restore "${file.name}"? This REPLACES all data in the current firm (${company?.name}). This cannot be undone.`,
      )
    )
      return
    try {
      const text = await file.text()
      const backup = JSON.parse(text) as BackupFile
      const { tables, rows } = await maintenanceService.importData(backup)
      toast.success(`Restored ${rows} records across ${tables} tables. Reloading…`)
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      toast.error(`Restore failed: ${(err as Error).message}`)
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-md border p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Download className="size-4" /> Backup
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Downloads every record of the current firm
          {company?.name ? ` (${company.name})` : ""} as a single JSON file. Keep it
          on a USB drive or cloud folder.
        </p>
        <Button className="mt-3" onClick={() => void doBackup()}>
          <Download className="size-4" /> Download Backup
        </Button>
      </div>

      <div className="rounded-md border p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Upload className="size-4" /> Restore
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Replaces the current firm's data with a backup file. The app reloads when
          done.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void doRestore(e.target.files?.[0])}
        />
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-4" /> Choose Backup File…
        </Button>
      </div>
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
