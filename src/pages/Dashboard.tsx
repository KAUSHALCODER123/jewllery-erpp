import { useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { toast } from "sonner"
import {
  TrendingUp,
  PiggyBank,
  Landmark,
  Package,
  ShoppingCart,
  Coins,
  Layers,
  Sparkles,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { db } from "@/db/database"
import { dbService } from "@/services/dbService"
import { seedAllIfEmpty } from "@/db/seed"
import { formatAmount, formatINR, formatWt } from "@/lib/format"

export function Dashboard() {
  const [hoveredSalesIndex, setHoveredSalesIndex] = useState<number | null>(null)

  // Load demo data handler
  const loadDemo = async () => {
    const { items, customers } = await seedAllIfEmpty()
    toast.success(
      items || customers
        ? `Loaded ${items} items and ${customers} customers`
        : "Demo data already present",
    )
  }

  // Reactive IndexedDB query logic for all dashboard metrics
  const stats = useLiveQuery(async () => {
    const today = dbService.todayStr()
    const currentMonth = today.substring(0, 7)

    const invoices = await db.sales_invoices.toArray()
    const customers = await db.customers.toArray()
    const loans = await db.loans.toArray()
    const schemeAccounts = await db.scheme_accounts.toArray()
    const schemePayments = await db.scheme_payments.toArray()
    const items = await db.items.toArray()

    const customerMap = new Map(customers.map((c) => [c.id, c.name]))

    // MTD sales calculations
    const mtdInvoices = invoices.filter((inv) => inv.date.startsWith(currentMonth))
    const totalSalesMtd = mtdInvoices.reduce((sum, inv) => sum + (inv.netAmount || 0), 0)
    const mtdCount = mtdInvoices.length

    // Generate last 14 days historical trend
    const last14Days: { date: string; label: string; amount: number }[] = []
    const dateObj = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(dateObj.getDate() - i)
      const yr = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, "0")
      const da = String(d.getDate()).padStart(2, "0")
      const dateStr = `${yr}-${mo}-${da}`

      const daySales = invoices
        .filter((inv) => inv.date === dateStr)
        .reduce((sum, inv) => sum + (inv.netAmount || 0), 0)

      last14Days.push({
        date: dateStr,
        label: `${da}/${mo}`,
        amount: daySales,
      })
    }

    // Payment modes breakdown (MTD)
    const mtdCash = mtdInvoices.reduce((sum, inv) => sum + (inv.cashPaid || 0), 0)
    const mtdUpi = mtdInvoices.reduce((sum, inv) => sum + (inv.upiPaid || 0), 0)

    // Gold Schemes metrics
    const activeSchemesCount = schemeAccounts.filter((ac) => ac.status === "active").length
    const totalSchemesPool = schemePayments.reduce((sum, p) => sum + (p.amount || 0), 0)

    // Girvi Loans metrics
    const activeLoans = loans.filter((l) => !l.isClosed)
    const activeLoansCount = activeLoans.length
    const girviPrincipalOutstanding = activeLoans.reduce(
      (sum, l) => sum + (l.principalOutstanding || 0),
      0,
    )
    const totalGirviWeight = activeLoans.reduce((sum, l) => sum + (l.netWt || 0), 0)

    // Inventory metrics
    const inStockItems = items.filter((it) => it.status === "in_stock")
    const totalInStockWeight = inStockItems.reduce((sum, it) => sum + (it.netWt || 0), 0)
    const totalInStockItems = inStockItems.length
    const goldItemsCount = inStockItems.filter((it) => it.type === "gold").length
    const silverItemsCount = inStockItems.filter((it) => it.type === "silver").length

    // Recent 5 sales invoices
    const sortedInvoices = [...invoices].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5)
    const recentInvoices = sortedInvoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      customerName: customerMap.get(inv.customerId) || "Walk-in Customer",
      amount: inv.netAmount,
      cash: inv.cashPaid,
      upi: inv.upiPaid,
    }))

    return {
      totalSalesMtd,
      mtdCount,
      last14Days,
      mtdCash,
      mtdUpi,
      activeSchemesCount,
      totalSchemesPool,
      activeLoansCount,
      girviPrincipalOutstanding,
      totalGirviWeight,
      totalInStockWeight,
      totalInStockItems,
      goldItemsCount,
      silverItemsCount,
      recentInvoices,
      customerCount: customers.length,
      itemCount: items.length,
    }
  }, [], null)

  if (!stats) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Loading dashboard metrics...
      </div>
    )
  }

  // custom SVG Sales Area Chart Math
  const chartWidth = 560
  const chartHeight = 180
  const paddingLeft = 55
  const paddingRight = 15
  const paddingTop = 15
  const paddingBottom = 25

  const graphWidth = chartWidth - paddingLeft - paddingRight
  const graphHeight = chartHeight - paddingTop - paddingBottom

  const maxSalesVal = Math.max(...stats.last14Days.map((d) => d.amount), 5000)
  const yScale = graphHeight / maxSalesVal
  const xScale = graphWidth / (stats.last14Days.length - 1)

  const points = stats.last14Days.map((d, i) => ({
    x: paddingLeft + i * xScale,
    y: paddingTop + graphHeight - d.amount * yScale,
    amount: d.amount,
    label: d.label,
    date: d.date,
  }))

  const linePath = points.length > 0 ? "M " + points.map((p) => `${p.x} ${p.y}`).join(" L ") : ""
  const fillPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + graphHeight} L ${points[0].x} ${paddingTop + graphHeight} Z`
      : ""

  // custom SVG Donut Chart Math
  const donutTotal = stats.mtdCash + stats.mtdUpi
  const cashPercent = donutTotal > 0 ? stats.mtdCash / donutTotal : 0.5
  const upiPercent = donutTotal > 0 ? stats.mtdUpi / donutTotal : 0.5

  const radius = 50
  const circ = 2 * Math.PI * radius // ~314.16
  const cashSegment = cashPercent * circ
  const upiSegment = upiPercent * circ

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4 bg-card shadow-2xs">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-500 animate-pulse" />
          <h1 className="text-sm font-semibold tracking-tight">Dashboard & Operations Control</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="xs"
            className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-600 transition-colors"
            onClick={loadDemo}
          >
            Load Demo Datasets
          </Button>
          <span className="text-xs font-medium bg-muted/60 px-2 py-0.5 rounded border text-muted-foreground">
            Business Date: {dbService.todayStr()}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4 max-w-(screen-2xl) mx-auto w-full">
        {/* KPI Metrics Ribbon */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Sales */}
          <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-amber-500/40">
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Sales (Current Month)
              </CardTitle>
              <div className="rounded-lg bg-amber-500/15 p-2 text-amber-600">
                <ShoppingCart className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-amber-600 tabular-nums">
                {formatINR(stats.totalSalesMtd)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="size-3 text-emerald-500" />
                <span>{stats.mtdCount} Invoices generated</span>
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Schemes */}
          <Card className="overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-emerald-500/40">
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Gold Savings Pool
              </CardTitle>
              <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-600">
                <PiggyBank className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 tabular-nums">
                {formatINR(stats.totalSchemesPool)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="size-3 text-emerald-500" />
                <span>{stats.activeSchemesCount} Active chits</span>
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Loans */}
          <Card className="overflow-hidden border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-indigo-500/40">
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Girvi Loans Book
              </CardTitle>
              <div className="rounded-lg bg-indigo-500/15 p-2 text-indigo-600">
                <Landmark className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-indigo-600 tabular-nums">
                {formatINR(stats.girviPrincipalOutstanding)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <TrendingUp className="size-3 text-emerald-500" />
                <span>{stats.activeLoansCount} Active pledged files</span>
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Inventory */}
          <Card className="overflow-hidden border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-transparent to-transparent shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-rose-500/40">
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                In-Stock Inventory
              </CardTitle>
              <div className="rounded-lg bg-rose-500/15 p-2 text-rose-600">
                <Package className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-2xl font-bold tracking-tight text-rose-600 tabular-nums">
                {formatWt(stats.totalInStockWeight)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Layers className="size-3 text-rose-500" />
                <span>{stats.totalInStockItems} Stock items registered</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts & Graphs Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Sales Revenue Trend Chart */}
          <Card className="lg:col-span-2 shadow-xs bg-card">
            <CardHeader className="pb-1 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Sales Revenue Trend</CardTitle>
                  <p className="text-[10px] text-muted-foreground">Daily billings for the last 14 days</p>
                </div>
                {hoveredSalesIndex !== null && (
                  <div className="bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] text-amber-700 font-medium font-semibold">
                    {points[hoveredSalesIndex].date} :{" "}
                    <span className="font-bold">{formatINR(points[hoveredSalesIndex].amount)}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex justify-center">
              <div className="relative w-full overflow-hidden flex justify-center">
                <svg
                  width={chartWidth}
                  height={chartHeight}
                  className="overflow-visible"
                >
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d4af37" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#d4af37" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                    const y = paddingTop + p * graphHeight
                    const labelVal = maxSalesVal * (1 - p)
                    return (
                      <g key={idx} className="opacity-40">
                        <line
                          x1={paddingLeft}
                          y1={y}
                          x2={chartWidth - paddingRight}
                          y2={y}
                          stroke="#e5e7eb"
                          strokeDasharray="2,2"
                        />
                        <text
                          x={paddingLeft - 8}
                          y={y + 3}
                          textAnchor="end"
                          className="text-[9px] fill-muted-foreground font-medium tabular-nums"
                        >
                          {formatAmount(labelVal)}
                        </text>
                      </g>
                    )
                  })}

                  {/* Fill Area (Gradient Under Line) */}
                  {fillPath && (
                    <path d={fillPath} fill="url(#salesGradient)" className="transition-all duration-300" />
                  )}

                  {/* Area Stroke Line */}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#d4af37"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300"
                    />
                  )}

                  {/* Highlight Dots */}
                  {points.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={hoveredSalesIndex === i ? 5 : p.amount > 0 ? 3 : 0}
                      fill={hoveredSalesIndex === i ? "#b89030" : "#d4af37"}
                      stroke="#ffffff"
                      strokeWidth={hoveredSalesIndex === i ? 2 : 1}
                      className="transition-all duration-150 cursor-pointer"
                    />
                  ))}

                  {/* Interactive Transparent Overlay Rects for Hover Detection */}
                  {points.map((p, i) => {
                    const rectW = graphWidth / (stats.last14Days.length - 1)
                    return (
                      <rect
                        key={i}
                        x={p.x - rectW / 2}
                        y={paddingTop}
                        width={rectW}
                        height={graphHeight}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredSalesIndex(i)}
                        onMouseLeave={() => setHoveredSalesIndex(null)}
                      />
                    )
                  })}

                  {/* X-axis labels */}
                  {points.map((p, i) => {
                    // Render labels only for alternating indexes to avoid cramming
                    if (i % 2 !== 0 && i !== points.length - 1) return null
                    return (
                      <text
                        key={i}
                        x={p.x}
                        y={chartHeight - 8}
                        textAnchor="middle"
                        className="text-[9px] fill-muted-foreground font-medium"
                      >
                        {p.label}
                      </text>
                    )
                  })}
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* Payment Split Donut Chart */}
          <Card className="shadow-xs bg-card">
            <CardHeader className="pb-1 border-b">
              <CardTitle className="text-sm font-semibold">Payment Split (MTD)</CardTitle>
              <p className="text-[10px] text-muted-foreground">Digital vs. cash mode checkout breakdown</p>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col items-center justify-between min-h-[190px]">
              {donutTotal > 0 ? (
                <>
                  <div className="relative size-32 flex items-center justify-center">
                    <svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 120 120"
                      className="-rotate-90"
                    >
                      {/* Grey background ring */}
                      <circle cx="60" cy="60" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="12" />

                      {/* Cash segment */}
                      <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke="#d4af37"
                        strokeWidth="12"
                        strokeDasharray={`${cashSegment} ${circ}`}
                        strokeDashoffset="0"
                      />

                      {/* UPI segment */}
                      <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="12"
                        strokeDasharray={`${upiSegment} ${circ}`}
                        strokeDashoffset={`-${cashSegment}`}
                      />
                    </svg>
                    {/* Centered label */}
                    <div className="absolute flex flex-col items-center text-center">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">Total</span>
                      <span className="text-xs font-bold text-foreground tabular-nums">
                        {formatAmount(donutTotal)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-2 mt-4 text-[11px] font-medium border-t pt-3">
                    <div className="flex items-center gap-1.5 justify-center">
                      <span className="size-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-muted-foreground">Cash:</span>
                      <span className="font-bold tabular-nums">
                        {Math.round(cashPercent * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-center">
                      <span className="size-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-muted-foreground">UPI:</span>
                      <span className="font-bold tabular-nums">
                        {Math.round(upiPercent * 100)}%
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 py-8 text-center text-xs text-muted-foreground gap-1.5">
                  <div className="size-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <Coins className="size-6 opacity-40" />
                  </div>
                  <span>No billing operations recorded this month.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Operations Grid & Recent Sales */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Operations & Health panels */}
          <div className="lg:col-span-1 space-y-4">
            {/* Schemes Health Widget */}
            <Card className="shadow-2xs bg-card">
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Gold Schemes Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="py-3 text-xs space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Active Chit Members</span>
                  <span className="font-semibold">{stats.activeSchemesCount} Enrolments</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Funds Saved</span>
                  <span className="font-bold text-emerald-600">{formatINR(stats.totalSchemesPool)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Avg. Accumulated/Chit</span>
                  <span className="font-semibold">
                    {stats.activeSchemesCount > 0
                      ? formatINR(stats.totalSchemesPool / stats.activeSchemesCount)
                      : "₹0"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Girvi Loans Collateral Health Widget */}
            <Card className="shadow-2xs bg-card">
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Pledged Collateral Book
                </CardTitle>
              </CardHeader>
              <CardContent className="py-3 text-xs space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Active Loans Ledger</span>
                  <span className="font-semibold">{stats.activeLoansCount} Active Pavatis</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Pledged Gold weight</span>
                  <span className="font-bold text-indigo-600">{formatWt(stats.totalGirviWeight)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Avg. Loan Value</span>
                  <span className="font-semibold">
                    {stats.activeLoansCount > 0
                      ? formatINR(stats.girviPrincipalOutstanding / stats.activeLoansCount)
                      : "₹0"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Inventory Breakdown Widget */}
            <Card className="shadow-2xs bg-card">
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Stock Category Split
                </CardTitle>
              </CardHeader>
              <CardContent className="py-3 text-xs space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Gold Stock Items</span>
                  <span className="font-semibold">{stats.goldItemsCount} Items</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Silver Stock Items</span>
                  <span className="font-semibold">{stats.silverItemsCount} Items</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total In-Stock Items</span>
                  <span className="font-semibold">{stats.totalInStockItems} Items</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Billings Ledger */}
          <Card className="lg:col-span-2 shadow-2xs bg-card">
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Billing Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {stats.recentInvoices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30 font-medium text-muted-foreground">
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Invoice No</th>
                        <th className="px-4 py-2.5">Customer Name</th>
                        <th className="px-4 py-2.5 text-right">Cash Paid</th>
                        <th className="px-4 py-2.5 text-right">UPI Paid</th>
                        <th className="px-4 py-2.5 text-right">Total Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {stats.recentInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-accent/40 transition-colors">
                          <td className="px-4 py-2.5 font-medium tabular-nums">{inv.date}</td>
                          <td className="px-4 py-2.5 font-semibold text-amber-600">{inv.invoiceNo}</td>
                          <td className="px-4 py-2.5 truncate max-w-[150px]">{inv.customerName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                            {formatAmount(inv.cash)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                            {formatAmount(inv.upi)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                            {formatINR(inv.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground gap-1">
                  <ShoppingCart className="size-6 opacity-30 mb-1" />
                  <span>No billing operations recorded yet.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
