import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Download, FileBarChart } from "lucide-react"
import * as XLSX from "xlsx"
import { ledgerService, todayStr } from "@/services/dbService"
import { formatAmount } from "@/lib/format"
import { toCsv, downloadText } from "@/lib/csv"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { useSession } from "@/stores/useSession"
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
import { CustomerCombobox } from "@/components/CustomerCombobox"

export function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports & GST"
        subtitle="Party ledger · Cash book · GSTR-1"
      />
      <Tabs defaultValue="ledger" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="ledger">Party Ledger</TabsTrigger>
            <TabsTrigger value="cashbook">Cash Book</TabsTrigger>
            <TabsTrigger value="debtors">Sundry Debtors</TabsTrigger>
            <TabsTrigger value="gstr1">GSTR-1</TabsTrigger>
            <TabsTrigger value="hsn">HSN Summary</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="ledger" className="min-h-0 flex-1 overflow-auto p-4">
          <PartyLedger />
        </TabsContent>
        <TabsContent value="cashbook" className="min-h-0 flex-1 overflow-auto p-4">
          <CashBook />
        </TabsContent>
        <TabsContent value="debtors" className="min-h-0 flex-1 overflow-auto p-4">
          <Debtors />
        </TabsContent>
        <TabsContent value="gstr1" className="min-h-0 flex-1 overflow-auto p-4">
          <Gstr1 />
        </TabsContent>
        <TabsContent value="hsn" className="min-h-0 flex-1 overflow-auto p-4">
          <HsnSummary />
        </TabsContent>
      </Tabs>
    </>
  )
}

function PartyLedger() {
  const [customerId, setCustomerId] = useState<number | null>(null)
  const data = useLiveQuery(
    () =>
      customerId
        ? ledgerService.customerLedger(customerId)
        : Promise.resolve(null),
    [customerId],
    null,
  )

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Customer</Label>
          <CustomerCombobox value={customerId} onChange={setCustomerId} className="w-72" />
        </div>
        {data && (
          <div className="ml-auto text-right text-sm">
            <span className="text-muted-foreground">Closing Balance: </span>
            <span
              className={cn(
                "font-semibold tabular",
                data.closing > 0 ? "text-destructive" : "text-emerald-600",
              )}
            >
              {formatAmount(Math.abs(data.closing))} {data.closing >= 0 ? "Dr" : "Cr"}
            </span>
          </div>
        )}
      </div>

      {!customerId ? (
        <Placeholder text="Select a customer to view the ledger." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Date</TableHead>
                <TableHead className="w-24">Ref</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="w-28 text-right">Debit</TableHead>
                <TableHead className="w-28 text-right">Credit</TableHead>
                <TableHead className="w-28 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No transactions.
                  </TableCell>
                </TableRow>
              )}
              {data?.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{r.date || "—"}</TableCell>
                  <TableCell>{r.ref}</TableCell>
                  <TableCell>{r.particulars}</TableCell>
                  <TableCell className="text-right tabular">
                    {r.debit ? formatAmount(r.debit) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {r.credit ? formatAmount(r.credit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular">
                    {formatAmount(Math.abs(r.balance))} {r.balance >= 0 ? "Dr" : "Cr"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function CashBook() {
  const [date, setDate] = useState(todayStr())
  const data = useLiveQuery(() => ledgerService.cashBook(date), [date], null)

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value || todayStr())}
            className="h-9 w-44"
          />
        </div>
        {data && (
          <div className="ml-auto flex gap-4 text-sm">
            <span>
              <span className="text-muted-foreground">In: </span>
              <span className="font-semibold tabular text-emerald-600">
                {formatAmount(data.totalIn)}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">Out: </span>
              <span className="font-semibold tabular text-destructive">
                {formatAmount(data.totalOut)}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">Net: </span>
              <span className="font-semibold tabular">{formatAmount(data.net)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Ref</TableHead>
              <TableHead>Particulars</TableHead>
              <TableHead className="w-32 text-right">Inflow</TableHead>
              <TableHead className="w-32 text-right">Outflow</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No cash movement on this day.
                </TableCell>
              </TableRow>
            )}
            {data?.rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.ref}</TableCell>
                <TableCell>{r.particulars}</TableCell>
                <TableCell className="text-right tabular text-emerald-600">
                  {r.inflow ? formatAmount(r.inflow) : "—"}
                </TableCell>
                <TableCell className="text-right tabular text-destructive">
                  {r.outflow ? formatAmount(r.outflow) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Gstr1() {
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const rows = useLiveQuery(() => ledgerService.gstr1(month), [month], [])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        taxable: acc.taxable + r.taxable,
        cgst: acc.cgst + r.cgst,
        sgst: acc.sgst + r.sgst,
        igst: acc.igst + r.igst,
        total: acc.total + r.total,
      }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    )
  }, [rows])

  const exportCsv = () => {
    const csv = toCsv(
      ["Type", "Invoice", "Date", "Party", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total"],
      rows.map((r) => [
        r.type,
        r.invoiceNo,
        r.date,
        r.party,
        r.gstin,
        r.taxable,
        r.cgst,
        r.sgst,
        r.igst,
        r.total,
      ]),
    )
    downloadText(`GSTR1-${month}.csv`, csv)
  }

  const exportExcel = () => {
    if (!rows || rows.length === 0) return
    const worksheetData = [
      ["Type", "Invoice No", "Date", "Party Name", "GSTIN", "Taxable Value (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total Amount (₹)"],
      ...rows.map((r) => [
        r.type,
        r.invoiceNo,
        r.date,
        r.party,
        r.gstin,
        r.taxable,
        r.cgst,
        r.sgst,
        r.igst,
        r.total,
      ]),
      [
        "Total",
        "",
        "",
        "",
        "",
        totals.taxable,
        totals.cgst,
        totals.sgst,
        totals.igst,
        totals.total
      ]
    ]

    const ws = XLSX.utils.aoa_to_sheet(worksheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "GSTR-1 Report")
    XLSX.writeFile(wb, `GSTR1-Report-${month}.xlsx`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tax Period (month)</Label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || todayStr().slice(0, 7))}
            className="h-9 w-44"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            <Download className="size-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            disabled={rows.length === 0}
          >
            <Download className="size-4" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard label="Taxable" value={totals.taxable} />
        <SummaryCard label="CGST" value={totals.cgst} />
        <SummaryCard label="SGST" value={totals.sgst} />
        <SummaryCard label="IGST" value={totals.igst} />
        <SummaryCard label="Invoice Total" value={totals.total} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Type</TableHead>
              <TableHead className="w-24">Invoice</TableHead>
              <TableHead className="w-24">Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead className="w-36">GSTIN</TableHead>
              <TableHead className="w-28 text-right">Taxable</TableHead>
              <TableHead className="w-24 text-right">CGST</TableHead>
              <TableHead className="w-24 text-right">SGST</TableHead>
              <TableHead className="w-24 text-right">IGST</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  No invoices in this period.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.invoiceNo}>
                <TableCell>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-medium",
                      r.type === "B2B"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.type}
                  </span>
                </TableCell>
                <TableCell className="font-medium">{r.invoiceNo}</TableCell>
                <TableCell className="text-muted-foreground">{r.date}</TableCell>
                <TableCell>{r.party}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.gstin || "—"}
                </TableCell>
                <TableCell className="text-right tabular">{formatAmount(r.taxable)}</TableCell>
                <TableCell className="text-right tabular">{formatAmount(r.cgst)}</TableCell>
                <TableCell className="text-right tabular">{formatAmount(r.sgst)}</TableCell>
                <TableCell className="text-right tabular">{formatAmount(r.igst)}</TableCell>
                <TableCell className="text-right font-medium tabular">
                  {formatAmount(r.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold tabular">{formatAmount(value)}</div>
    </div>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <FileBarChart className="size-8 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  )
}

function Debtors() {
  const company = useSession((s) => s.company)
  const debtors = useLiveQuery(() => ledgerService.sundryDebtors(), [], [])

  const totalOutstanding = useMemo(() => {
    return (debtors ?? []).reduce((sum, d) => sum + d.outstanding, 0)
  }, [debtors])

  const exportCsv = () => {
    if (!debtors) return
    const csv = toCsv(
      ["Customer Name", "Mobile", "Outstanding Balance (₹)", "Last Transaction Date"],
      debtors.map((d) => [d.name, d.mobile, d.outstanding, d.lastTxnDate])
    )
    downloadText(`Sundry-Debtors-${todayStr()}.csv`, csv)
  }

  const handleWhatsApp = (mobile: string, name: string, outstanding: number) => {
    const cleanPhone = mobile.trim().replace(/\D/g, "")
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
    
    const defaultTemplate = "Dear {{customerName}}, this is a gentle reminder that your outstanding balance is ₹{{outstanding}}. Please clear the dues at your earliest convenience. Thank you!"
    const template = company?.templateDues || defaultTemplate

    const text = template
      .replace(/{{customerName}}/g, name)
      .replace(/{{outstanding}}/g, formatAmount(outstanding))
      .replace(/{{companyName}}/g, company?.name || "")

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`
    window.open(url, "_blank")
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Total Debtors</Label>
          <div className="text-sm font-semibold text-muted-foreground">
            {debtors?.length ?? 0} customers owe money
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span>
            <span className="text-muted-foreground">Total Dues: </span>
            <span className="font-semibold tabular text-destructive">
              {formatAmount(totalOutstanding)}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!debtors || debtors.length === 0}
          >
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer Name</TableHead>
              <TableHead className="w-40">Mobile</TableHead>
              <TableHead className="w-44 text-right">Outstanding (Dr)</TableHead>
              <TableHead className="w-44 text-center">Last Transaction</TableHead>
              <TableHead className="w-28 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!debtors || debtors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No customers with outstanding balance.
                </TableCell>
              </TableRow>
            ) : (
              debtors.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.mobile}</TableCell>
                  <TableCell className="text-right font-semibold tabular text-destructive">
                    {formatAmount(d.outstanding)}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{d.lastTxnDate}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-7"
                      onClick={() => handleWhatsApp(d.mobile, d.name, d.outstanding)}
                    >
                      WhatsApp
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function HsnSummary() {
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const rows = useLiveQuery(() => ledgerService.gstHsnSummary(month), [month], [])

  const totals = useMemo(() => {
    return (rows ?? []).reduce(
      (acc, r) => ({
        taxableValue: acc.taxableValue + r.taxableValue,
        cgst: acc.cgst + r.cgst,
        sgst: acc.sgst + r.sgst,
        igst: acc.igst + r.igst,
        qty: acc.qty + r.qty,
        netWt: acc.netWt + r.netWt,
      }),
      { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, qty: 0, netWt: 0 }
    )
  }, [rows])

  const exportExcel = () => {
    if (!rows || rows.length === 0) return
    
    const worksheetData = [
      ["HSN Code", "Description", "Qty (Pcs)", "Net Wt (g)", "Taxable Value (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total Tax (₹)", "Total Value (₹)"],
      ...rows.map((r) => {
        const totalTax = r.cgst + r.sgst + r.igst
        return [
          r.hsn,
          r.description,
          r.qty,
          r.netWt,
          r.taxableValue,
          r.cgst,
          r.sgst,
          r.igst,
          totalTax,
          r.taxableValue + totalTax
        ]
      }),
      [
        "Total",
        "",
        totals.qty,
        Number(totals.netWt.toFixed(3)),
        totals.taxableValue,
        totals.cgst,
        totals.sgst,
        totals.igst,
        totals.cgst + totals.sgst + totals.igst,
        totals.taxableValue + totals.cgst + totals.sgst + totals.igst
      ]
    ]

    const ws = XLSX.utils.aoa_to_sheet(worksheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "HSN Summary")
    XLSX.writeFile(wb, `GST-HSN-Summary-${month}.xlsx`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tax Period (month)</Label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || todayStr().slice(0, 7))}
            className="h-9 w-44"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={exportExcel}
          disabled={!rows || rows.length === 0}
        >
          <Download className="size-4" /> Export Excel (.xlsx)
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">HSN</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-20 text-center">Qty</TableHead>
              <TableHead className="w-28 text-right">Net Wt (g)</TableHead>
              <TableHead className="w-32 text-right">Taxable Value</TableHead>
              <TableHead className="w-24 text-right">CGST</TableHead>
              <TableHead className="w-24 text-right">SGST</TableHead>
              <TableHead className="w-24 text-right">IGST</TableHead>
              <TableHead className="w-32 text-right">Total Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No records in this period.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((r) => {
                  const totalTax = r.cgst + r.sgst + r.igst
                  return (
                    <TableRow key={r.hsn}>
                      <TableCell className="font-medium">{r.hsn}</TableCell>
                      <TableCell className="text-muted-foreground">{r.description}</TableCell>
                      <TableCell className="text-center tabular">{r.qty}</TableCell>
                      <TableCell className="text-right tabular">{r.netWt.toFixed(3)}</TableCell>
                      <TableCell className="text-right tabular">{formatAmount(r.taxableValue)}</TableCell>
                      <TableCell className="text-right tabular">{formatAmount(r.cgst)}</TableCell>
                      <TableCell className="text-right tabular">{formatAmount(r.sgst)}</TableCell>
                      <TableCell className="text-right tabular">{formatAmount(r.igst)}</TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatAmount(r.taxableValue + totalTax)}
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-center tabular">{totals.qty}</TableCell>
                  <TableCell className="text-right tabular">{totals.netWt.toFixed(3)}</TableCell>
                  <TableCell className="text-right tabular">{formatAmount(totals.taxableValue)}</TableCell>
                  <TableCell className="text-right tabular">{formatAmount(totals.cgst)}</TableCell>
                  <TableCell className="text-right tabular">{formatAmount(totals.sgst)}</TableCell>
                  <TableCell className="text-right tabular">{formatAmount(totals.igst)}</TableCell>
                  <TableCell className="text-right tabular">
                    {formatAmount(totals.taxableValue + totals.cgst + totals.sgst + totals.igst)}
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
