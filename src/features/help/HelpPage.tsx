import { useMemo, useState } from "react"
import {
  ShoppingCart, HandCoins, Landmark, Hammer, Truck, ClipboardList, Wrench,
  PiggyBank, Package, Flame, Calculator, Users, FileBarChart, Database,
  type LucideIcon,
} from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Guide {
  id: string
  title: string
  icon: LucideIcon
  what: string
  steps: string[]
  tip?: string
}

/**
 * Plain-language, business-terms help. No technical jargon — every guide reads
 * like a shopkeeper explaining the counter to a new staff member.
 */
const GUIDES: Guide[] = [
  {
    id: "bill", title: "Make a bill (sell jewellery)", icon: ShoppingCart,
    what: "Sell items to a customer and print or WhatsApp the bill.",
    steps: [
      "Open Billing / POS from the left menu (or press F2).",
      "Scan the item's barcode tag — or type a few letters of its name in the Search box and pick it. For an untagged/loose item, click ‘Blank row’ and type the weight and rate yourself.",
      "If the customer gives old gold in exchange, open the ‘URD Purchase (Old Gold)’ tab and enter its weight — its value is deducted from the bill.",
      "Choose the customer at the top (or type a name to add a walk-in customer).",
      "Give a discount if needed, and let the customer redeem loyalty points.",
      "Take the payment — click ‘full’ for cash, or split it across cash / UPI / card / cheque.",
      "Click ‘Save & Print’ (F12). The bill gets a number and the sold items leave your stock automatically.",
    ],
    tip: "If money is still due, leave it as balance — it shows up as the customer's Udhari (outstanding).",
  },
  {
    id: "receipt", title: "Collect an old due (Udhari)", icon: HandCoins,
    what: "Take a payment from a customer against money they already owe.",
    steps: [
      "Open Receipt (Udhari) from the left menu.",
      "Pick the customer — you'll see how much they owe.",
      "Enter the amount received and the mode (cash / UPI…).",
      "Click ‘Save & Print Receipt’. Their outstanding drops by that amount and a voucher prints.",
    ],
  },
  {
    id: "girvi", title: "Give a gold loan (Girvi)", icon: Landmark,
    what: "Lend cash against a customer's gold kept as security.",
    steps: [
      "Open Girvi (Loans) and click ‘New Loan’.",
      "Choose the customer and enter the pledged item(s) and their weight — the loan amount fills in from your lending rate per gram (you can change it).",
      "Set the monthly interest rate and save. A Pavati (loan receipt) prints.",
      "When they pay: open the loan (eye icon) → ‘Part Payment’ for a part amount, ‘Renew’ to roll over unpaid interest, or ‘Close’ to redeem and return the gold.",
    ],
    tip: "Interest is always collected first, then the principal. Renewing adds the unpaid interest onto the loan.",
  },
  {
    id: "karigar", title: "Give work to a karigar (goldsmith)", icon: Hammer,
    what: "Hand raw metal to a goldsmith and get the finished piece back, keeping the metal accounted.",
    steps: [
      "Open Karigar and add the goldsmith if they're new.",
      "Click ‘Issue Job’ — choose the karigar, enter the metal weight you're giving and the allowed wastage. This is added to what they owe you.",
      "When they return the piece, click ‘Receive’ — enter the finished weight. The allowed wastage is settled and their balance updates.",
    ],
    tip: "You can also give a karigar metal straight from a Repair (see the Metal button on a repair) or an Order.",
  },
  {
    id: "purchase", title: "Record a purchase bill (buy stock)", icon: Truck,
    what: "Enter goods bought from a supplier and put them into your stock.",
    steps: [
      "Open Purchase and click ‘New Purchase’.",
      "Choose the supplier (add one with the + button if new) and enter each item's weight, rate and making.",
      "Keep the ‘Stock’ box ticked on a line to add that item into your Item Master automatically — untick it for loose/bulk metal you don't want as a stock item.",
      "Enter how much you paid; the rest stays as the supplier's balance. Save.",
    ],
    tip: "Ticked lines become tagged items in Item Master, ready to sell in Billing.",
  },
  {
    id: "order", title: "Book a customer order", icon: ClipboardList,
    what: "Take an order for a piece to be made, with an advance.",
    steps: [
      "Open Order Booking and start a new order.",
      "Pick the customer, describe the item and weight — a price estimate is shown live.",
      "Take an advance payment if any.",
      "Move the order along as work progresses (confirmed → gold reserved → given to karigar → ready).",
      "When ready, ‘Deliver & Bill’ turns it into a normal sale bill.",
    ],
  },
  {
    id: "repair", title: "Take in a repair", icon: Wrench,
    what: "Log a customer's item for repair and track it to delivery.",
    steps: [
      "Open Repairs and click ‘New Repair’.",
      "Choose the customer, describe the item and its condition, and note the estimate and promised date.",
      "If the repair needs extra gold, click the ‘Metal’ button on the repair to issue metal to a karigar; record the finished piece when it's back.",
      "Change the status as it moves — Received → In progress → Ready → Delivered. On delivery, enter the final amount (labour + any metal added).",
    ],
  },
  {
    id: "scheme", title: "Start a gold saving scheme", icon: PiggyBank,
    what: "Run a monthly instalment plan (e.g. pay 11 months, get the 12th).",
    steps: [
      "Open Gold Schemes and create a plan.",
      "Enrol a customer into the plan.",
      "Each month, record their instalment — the due schedule updates and a chit prints.",
      "When the term finishes, mark the account matured.",
    ],
  },
  {
    id: "item", title: "Add a new item to stock", icon: Package,
    what: "Add a piece of jewellery to your Item Master by hand.",
    steps: [
      "Open Item Master (F3) and click ‘New Item’.",
      "Pick the category — a tag number is generated for you — then enter weights, purity, making and HUID.",
      "Save. The item is now in stock and ready to bill or print a barcode label for.",
    ],
  },
  {
    id: "refining", title: "Melt scrap into pure gold (Ghalai)", icon: Flame,
    what: "Refine old/scrap gold into pure bullion.",
    steps: [
      "Open Refining (Ghalai) and create a job.",
      "Choose the scrap source, purity, expected loss and any charges — the pure yield is calculated.",
      "Confirm. The scrap leaves stock and refined bullion (a sellable item) is created.",
    ],
    tip: "You can reverse a job if the bullion hasn't been sold yet.",
  },
  {
    id: "rates", title: "Set today's rate & close the day", icon: Calculator,
    what: "Update the daily gold/silver rate and do the day-end cash count.",
    steps: [
      "Open Counter Operations → Metal Rates and enter today's Gold/Silver rates, then ‘Save New Rate Version’. Billing picks these up.",
      "Use the Vouchers tab to record miscellaneous cash in/out.",
      "At day end, use ‘Close Day’ to compare the counted cash against the expected cash.",
    ],
  },
  {
    id: "customer", title: "Add a customer", icon: Users,
    what: "Create a customer record with their KYC and balances.",
    steps: [
      "Open Customers and click ‘New Customer’.",
      "Enter their name, mobile and any PAN/Aadhaar/GSTIN. Add an opening balance if they already owe or are owed.",
      "Save. You can now pick them in Billing, Loans, Orders and more.",
    ],
  },
  {
    id: "reports", title: "See reports & GST", icon: FileBarChart,
    what: "View ledgers, cash book and GST summaries, and export them.",
    steps: [
      "Open Reports & GST.",
      "Use the tabs — Party Ledger (one customer's account), Cash Book (a day's cash), Sundry Debtors (who owes you), GSTR-1 and HSN Summary (for filing).",
      "Export any report to Excel/CSV from the report screen.",
    ],
  },
  {
    id: "backup", title: "Back up your data", icon: Database,
    what: "Keep a safe copy of all your shop data.",
    steps: [
      "Open Settings → Backup.",
      "Click to save a backup file (or to your Google Drive sync folder). Keep it somewhere safe.",
      "To restore on a new machine, use Restore and pick your backup file (you'll be asked to confirm).",
    ],
    tip: "Take a backup at the end of every day — it's the most important habit for safety.",
  },
]

export function HelpPage() {
  const [q, setQ] = useState("")
  const [activeId, setActiveId] = useState(GUIDES[0].id)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return GUIDES
    return GUIDES.filter(
      (g) => g.title.toLowerCase().includes(s) || g.what.toLowerCase().includes(s) || g.steps.some((x) => x.toLowerCase().includes(s)),
    )
  }, [q])
  const active = GUIDES.find((g) => g.id === activeId) ?? filtered[0] ?? GUIDES[0]

  return (
    <>
      <PageHeader title="Help & How-to" subtitle="Simple step-by-step guides for every task" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[300px_1fr]">
        {/* Topic list */}
        <div className="flex min-h-0 flex-col border-r">
          <div className="border-b p-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a task…" />
          </div>
          <nav className="min-h-0 flex-1 overflow-auto p-2">
            {filtered.map((g) => {
              const Icon = g.icon
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveId(g.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                    g.id === active.id && "bg-accent font-medium",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{g.title}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No task matches “{q}”.</p>
            )}
          </nav>
        </div>

        {/* Guide detail */}
        <div className="min-h-0 overflow-auto p-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <active.icon className="size-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{active.title}</h2>
                <p className="text-sm text-muted-foreground">{active.what}</p>
              </div>
            </div>
            <ol className="space-y-3">
              {active.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            {active.tip && (
              <div className="mt-5 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                <span className="font-semibold text-primary">Tip: </span>
                {active.tip}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
