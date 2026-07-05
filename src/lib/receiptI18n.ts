/**
 * Regional-language labels for printed receipts.
 *
 * Indian jewellery shops serve customers who read the receipt in a regional
 * language. This maps the descriptive labels on the printed invoice/Pavati to
 * Hindi, Marathi, Gujarati and Tamil, selectable per firm (Settings → Print).
 *
 * Tax/technical acronyms (GST, CGST, SGST, IGST, HSN, HUID, TCS, GSTIN, IFSC,
 * UPI) are intentionally left in Latin — that is how they appear on real Indian
 * tax invoices regardless of the language.
 */

export type ReceiptLang = "en" | "hi" | "mr" | "gu" | "ta"

/** Languages offered in Settings, with their native display names. */
export const RECEIPT_LANGUAGES: { code: ReceiptLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी (Hindi)" },
  { code: "mr", label: "मराठी (Marathi)" },
  { code: "gu", label: "ગુજરાતી (Gujarati)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
]

export type ReceiptKey =
  | "taxInvoice"
  | "billTo"
  | "no"
  | "date"
  | "description"
  | "netWt"
  | "rate"
  | "making"
  | "amount"
  | "oldGoldUrd"
  | "lessAmount"
  | "salesTotal"
  | "lessOldGold"
  | "lessBillDiscount"
  | "lessMakingDiscount"
  | "lessLoyaltyPoints"
  | "taxable"
  | "netPayable"
  | "lessAdvance"
  | "cash"
  | "balance"
  | "bankDetails"
  | "bank"
  | "acNo"
  | "branch"
  | "thankYou"

type LangMap = Record<ReceiptLang, string>

const DICT: Record<ReceiptKey, LangMap> = {
  taxInvoice: { en: "TAX INVOICE", hi: "कर बीजक", mr: "कर बीजक", gu: "કર બિલ", ta: "வரி விலைப்பட்டி" },
  billTo: { en: "Bill To:", hi: "ग्राहक:", mr: "ग्राहक:", gu: "ગ્રાહક:", ta: "வாடிக்கையாளர்:" },
  no: { en: "No", hi: "क्र.", mr: "क्र.", gu: "નં.", ta: "எண்" },
  date: { en: "Date", hi: "दिनांक", mr: "दिनांक", gu: "તારીખ", ta: "தேதி" },
  description: { en: "Description", hi: "विवरण", mr: "तपशील", gu: "વિગત", ta: "விவரம்" },
  netWt: { en: "Net Wt", hi: "शुद्ध वज़न", mr: "निव्वळ वजन", gu: "ચોખ્ખું વજન", ta: "நிகர எடை" },
  rate: { en: "Rate", hi: "दर", mr: "दर", gu: "દર", ta: "விகிதம்" },
  making: { en: "Making", hi: "मजदूरी", mr: "मजुरी", gu: "મજૂરી", ta: "செய்கூலி" },
  amount: { en: "Amount", hi: "राशि", mr: "रक्कम", gu: "રકમ", ta: "தொகை" },
  oldGoldUrd: { en: "Old Gold (URD)", hi: "पुराना सोना", mr: "जुने सोने", gu: "જૂનું સોનું", ta: "பழைய தங்கம்" },
  lessAmount: { en: "Less Amount", hi: "घटाव राशि", mr: "वजा रक्कम", gu: "બાદ રકમ", ta: "கழிவுத் தொகை" },
  salesTotal: { en: "Sales Total", hi: "विक्रय कुल", mr: "विक्री एकूण", gu: "વેચાણ કુલ", ta: "விற்பனை மொத்தம்" },
  lessOldGold: { en: "Less: Old Gold", hi: "घटाएँ: पुराना सोना", mr: "वजा: जुने सोने", gu: "બાદ: જૂનું સોનું", ta: "கழி: பழைய தங்கம்" },
  lessBillDiscount: { en: "Less: Bill Discount", hi: "घटाएँ: बिल छूट", mr: "वजा: बिल सूट", gu: "બાદ: બિલ ડિસ્કાઉન્ટ", ta: "கழி: பில் தள்ளுபடி" },
  lessMakingDiscount: { en: "Less: Making Discount", hi: "घटाएँ: मजदूरी छूट", mr: "वजा: मजुरी सूट", gu: "બાદ: મજૂરી ડિસ્કાઉન્ટ", ta: "கழி: செய்கூலி தள்ளுபடி" },
  lessLoyaltyPoints: { en: "Less: Loyalty Points", hi: "घटाएँ: लॉयल्टी अंक", mr: "वजा: लॉयल्टी गुण", gu: "બાદ: લોયલ્ટી પોઈન્ટ", ta: "கழி: விசுவாசப் புள்ளிகள்" },
  taxable: { en: "Taxable", hi: "कर योग्य", mr: "करपात्र", gu: "કરપાત્ર", ta: "வரிவிதிப்பு" },
  netPayable: { en: "Net Payable", hi: "कुल देय", mr: "निव्वळ देय", gu: "ચૂકવવાપાત્ર", ta: "செலுத்த வேண்டியது" },
  lessAdvance: { en: "Less: Advance Adjusted", hi: "घटाएँ: अग्रिम समायोजित", mr: "वजा: आगाऊ समायोजित", gu: "બાદ: એડવાન્સ ગોઠવ્યું", ta: "கழி: முன்பணம் சரிசெய்யப்பட்டது" },
  cash: { en: "Cash", hi: "नकद", mr: "रोख", gu: "રોકડ", ta: "ரொக்கம்" },
  balance: { en: "Balance", hi: "शेष", mr: "शिल्लक", gu: "બાકી", ta: "மீதி" },
  bankDetails: { en: "Bank Account Details", hi: "बैंक खाता विवरण", mr: "बँक खाते तपशील", gu: "બેંક ખાતાની વિગત", ta: "வங்கிக் கணக்கு விவரம்" },
  bank: { en: "Bank", hi: "बैंक", mr: "बँक", gu: "બેંક", ta: "வங்கி" },
  acNo: { en: "A/C No", hi: "खाता क्र.", mr: "खाते क्र.", gu: "ખાતા નં.", ta: "கணக்கு எண்" },
  branch: { en: "Branch", hi: "शाखा", mr: "शाखा", gu: "શાખા", ta: "கிளை" },
  thankYou: {
    en: "Thank you for your business!",
    hi: "आपके व्यापार के लिए धन्यवाद!",
    mr: "आपल्या व्यवसायाबद्दल धन्यवाद!",
    gu: "તમારા વ્યવસાય બદલ આભાર!",
    ta: "உங்கள் வணிகத்திற்கு நன்றி!",
  },
}

/** All translatable receipt keys (derived from the dictionary). */
export const RECEIPT_KEYS = Object.keys(DICT) as ReceiptKey[]

/**
 * Build a translator bound to a language. Unknown/undefined languages fall back
 * to English, as does any key missing a translation for that language.
 */
export function receiptT(lang: ReceiptLang | undefined | null) {
  const l: ReceiptLang = lang && lang in DICT.taxInvoice ? lang : "en"
  return (key: ReceiptKey): string => DICT[key][l] ?? DICT[key].en
}
