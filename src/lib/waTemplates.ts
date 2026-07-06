/**
 * Centralized WhatsApp messaging: default templates, placeholder filling, phone
 * normalization and link opening. Previously duplicated across InvoiceReceipt,
 * ReportsPage, SchemesPage, LoanDetailsDialog and SettingsPage.
 *
 * Company-stored templates (company.templateInvoice etc.) override these defaults;
 * this module supplies the fallbacks (localized to the firm's receiptLanguage,
 * matching the printed receipts) and the send behavior. Placeholders ({{…}}) and
 * ₹ amounts are identical across languages.
 */

import type { ReceiptLang } from "@/lib/receiptI18n"

export type WaTemplateKind = "invoice" | "dues" | "girvi" | "scheme"

/** English defaults — also the reset/placeholder text shown in Settings. */
export const DEFAULT_INVOICE_TEMPLATE =
  "*{{companyName}}*\nInvoice {{invoiceNo}} · {{invoiceDate}}\nNet Payable: ₹{{netAmount}}\n{{paymentStatus}}"

export const DEFAULT_DUES_TEMPLATE =
  "Dear {{customerName}}, this is a gentle reminder that your outstanding balance is ₹{{outstanding}}. Please clear the dues at your earliest convenience. Thank you!"

export const DEFAULT_GIRVI_TEMPLATE =
  "Dear {{customerName}},\nThis is a reminder regarding your gold loan {{loanNo}} dated {{loanDate}}.\nPrincipal: ₹{{loanAmount}}.\nAccumulated Interest: ₹{{interestOutstanding}}.\nTotal Dues: ₹{{totalDues}}.\nKindly clear your interest or close the loan. Thank you!"

export const DEFAULT_SCHEME_TEMPLATE =
  "Dear {{customerName}},\nYour monthly installment of ₹{{monthlyAmount}} for saving scheme account {{accountNo}} is due on {{dueDate}}.\nKindly pay at your earliest convenience. Thank you!"

/** Localized default templates per firm receipt language (falls back to English). */
const WA_TEMPLATES: Record<ReceiptLang, Record<WaTemplateKind, string>> = {
  en: {
    invoice: DEFAULT_INVOICE_TEMPLATE,
    dues: DEFAULT_DUES_TEMPLATE,
    girvi: DEFAULT_GIRVI_TEMPLATE,
    scheme: DEFAULT_SCHEME_TEMPLATE,
  },
  hi: {
    invoice: "*{{companyName}}*\nबीजक {{invoiceNo}} · {{invoiceDate}}\nकुल देय: ₹{{netAmount}}\n{{paymentStatus}}",
    dues: "प्रिय {{customerName}}, यह एक विनम्र स्मरण है कि आपकी बकाया राशि ₹{{outstanding}} है। कृपया शीघ्र भुगतान करें। धन्यवाद!",
    girvi: "प्रिय {{customerName}},\nयह आपके स्वर्ण ऋण {{loanNo}} (दिनांक {{loanDate}}) संबंधी स्मरण है।\nमूलधन: ₹{{loanAmount}}।\nसंचित ब्याज: ₹{{interestOutstanding}}।\nकुल देय: ₹{{totalDues}}।\nकृपया ब्याज चुकाएँ या ऋण बंद करें। धन्यवाद!",
    scheme: "प्रिय {{customerName}},\nबचत योजना खाता {{accountNo}} के लिए आपकी मासिक किस्त ₹{{monthlyAmount}} {{dueDate}} को देय है।\nकृपया शीघ्र भुगतान करें। धन्यवाद!",
  },
  mr: {
    invoice: "*{{companyName}}*\nबीजक {{invoiceNo}} · {{invoiceDate}}\nनिव्वळ देय: ₹{{netAmount}}\n{{paymentStatus}}",
    dues: "प्रिय {{customerName}}, आपली थकबाकी ₹{{outstanding}} आहे याची नम्र आठवण. कृपया लवकरात लवकर रक्कम भरा. धन्यवाद!",
    girvi: "प्रिय {{customerName}},\nआपल्या सुवर्ण कर्ज {{loanNo}} (दिनांक {{loanDate}}) संबंधी आठवण.\nमुद्दल: ₹{{loanAmount}}.\nजमा व्याज: ₹{{interestOutstanding}}.\nएकूण देय: ₹{{totalDues}}.\nकृपया व्याज भरा किंवा कर्ज बंद करा. धन्यवाद!",
    scheme: "प्रिय {{customerName}},\nबचत योजना खाते {{accountNo}} साठी आपला मासिक हप्ता ₹{{monthlyAmount}} {{dueDate}} रोजी देय आहे.\nकृपया लवकर भरा. धन्यवाद!",
  },
  gu: {
    invoice: "*{{companyName}}*\nબિલ {{invoiceNo}} · {{invoiceDate}}\nચૂકવવાપાત્ર: ₹{{netAmount}}\n{{paymentStatus}}",
    dues: "પ્રિય {{customerName}}, આપની બાકી રકમ ₹{{outstanding}} છે તેની નમ્ર યાદ. કૃપા કરી વહેલી તકે ચૂકવણી કરો. આભાર!",
    girvi: "પ્રિય {{customerName}},\nઆપની સોના લોન {{loanNo}} (તારીખ {{loanDate}}) અંગે યાદ.\nમુદ્દલ: ₹{{loanAmount}}.\nસંચિત વ્યાજ: ₹{{interestOutstanding}}.\nકુલ બાકી: ₹{{totalDues}}.\nકૃપા કરી વ્યાજ ચૂકવો અથવા લોન બંધ કરો. આભાર!",
    scheme: "પ્રિય {{customerName}},\nબચત યોજના ખાતા {{accountNo}} માટે આપનો માસિક હપ્તો ₹{{monthlyAmount}} {{dueDate}} ના રોજ બાકી છે.\nકૃપા કરી વહેલી તકે ચૂકવો. આભાર!",
  },
  ta: {
    invoice: "*{{companyName}}*\nவிலைப்பட்டி {{invoiceNo}} · {{invoiceDate}}\nசெலுத்த வேண்டியது: ₹{{netAmount}}\n{{paymentStatus}}",
    dues: "அன்புள்ள {{customerName}}, உங்கள் நிலுவைத் தொகை ₹{{outstanding}} என்பதை நினைவூட்டுகிறோம். விரைவில் செலுத்தவும். நன்றி!",
    girvi: "அன்புள்ள {{customerName}},\nஉங்கள் தங்கக் கடன் {{loanNo}} (தேதி {{loanDate}}) குறித்த நினைவூட்டல்.\nஅசல்: ₹{{loanAmount}}.\nசேர்ந்த வட்டி: ₹{{interestOutstanding}}.\nமொத்த நிலுவை: ₹{{totalDues}}.\nதயவுசெய்து வட்டியைச் செலுத்தவும் அல்லது கடனை முடிக்கவும். நன்றி!",
    scheme: "அன்புள்ள {{customerName}},\nசேமிப்புத் திட்டக் கணக்கு {{accountNo}} க்கான உங்கள் மாதாந்திர தவணை ₹{{monthlyAmount}} {{dueDate}} அன்று செலுத்த வேண்டும்.\nதயவுசெய்து விரைவில் செலுத்தவும். நன்றி!",
  },
}

/** The default template for a message kind in the firm's language (English fallback). */
export function defaultWaTemplate(kind: WaTemplateKind, lang: ReceiptLang | undefined | null): string {
  const l: ReceiptLang = lang && lang in WA_TEMPLATES ? lang : "en"
  return WA_TEMPLATES[l][kind]
}

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
