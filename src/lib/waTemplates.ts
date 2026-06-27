/**
 * Centralized WhatsApp messaging: default templates, placeholder filling, phone
 * normalization and link opening. Previously duplicated across InvoiceReceipt,
 * ReportsPage, SchemesPage, LoanDetailsDialog and SettingsPage.
 *
 * Company-stored templates (company.templateInvoice etc.) override these defaults;
 * this module only supplies the fallbacks and the send behavior.
 */

export const DEFAULT_INVOICE_TEMPLATE =
  "*{{companyName}}*\nInvoice {{invoiceNo}} · {{invoiceDate}}\nNet Payable: ₹{{netAmount}}\n{{paymentStatus}}"

export const DEFAULT_DUES_TEMPLATE =
  "Dear {{customerName}}, this is a gentle reminder that your outstanding balance is ₹{{outstanding}}. Please clear the dues at your earliest convenience. Thank you!"

export const DEFAULT_GIRVI_TEMPLATE =
  "Dear {{customerName}},\nThis is a reminder regarding your gold loan {{loanNo}} dated {{loanDate}}.\nPrincipal: ₹{{loanAmount}}.\nAccumulated Interest: ₹{{interestOutstanding}}.\nTotal Dues: ₹{{totalDues}}.\nKindly clear your interest or close the loan. Thank you!"

export const DEFAULT_SCHEME_TEMPLATE =
  "Dear {{customerName}},\nYour monthly installment of ₹{{monthlyAmount}} for saving scheme account {{accountNo}} is due on {{dueDate}}.\nKindly pay at your earliest convenience. Thank you!"

/** Replace every {{key}} in the template (split/join is $-safe vs String.replace). */
export function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.split(`{{${key}}}`).join(String(value)),
    template,
  )
}

/** Indian mobile normalization: strip non-digits; prefix 91 to a bare 10-digit number. */
export function normalizePhone(mobile: string | undefined | null): string {
  const digits = (mobile ?? "").replace(/\D/g, "")
  return digits.length === 10 ? `91${digits}` : digits
}

/** Open WhatsApp (web/app) with a pre-filled message to the given number. */
export function openWhatsApp(mobile: string | undefined | null, text: string): void {
  const phone = normalizePhone(mobile)
  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener",
  )
}
