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
  // Girvi (gold-loan) Pavati + payment receipts
  | "girviPavati"
  | "borrower"
  | "pledgedItem"
  | "purity"
  | "gross"
  | "net"
  | "estValue"
  | "loanAmount"
  | "interestRate"
  | "perMonth"
  | "totalNetWt"
  | "pledgeTerms"
  | "borrowerSignature"
  | "forShop"
  | "partRepaymentReceipt"
  | "loanRenewalVoucher"
  | "loanClosureReceipt"
  | "receiptNo"
  | "loanDetails"
  | "particulars"
  | "amountReceived"
  | "towardsInterest"
  | "towardsPrincipal"
  | "notes"
  | "paymentTerms"

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

  // ---- Girvi Pavati (pledge receipt) ----
  girviPavati: { en: "GIRVI PAVATI", hi: "गिरवी पावती", mr: "गिरवी पावती", gu: "ગીરવી રસીદ", ta: "அடகு ரசீது" },
  borrower: { en: "Borrower:", hi: "उधारकर्ता:", mr: "कर्जदार:", gu: "ઉધાર લેનાર:", ta: "கடன் வாங்குபவர்:" },
  pledgedItem: { en: "Pledged Item", hi: "गिरवी वस्तु", mr: "गहाण वस्तू", gu: "ગીરવે વસ્તુ", ta: "அடகு பொருள்" },
  purity: { en: "Purity", hi: "शुद्धता", mr: "शुद्धता", gu: "શુદ્ધતા", ta: "தூய்மை" },
  gross: { en: "Gross", hi: "सकल", mr: "स्थूल", gu: "કુલ", ta: "மொத்தம்" },
  net: { en: "Net", hi: "शुद्ध", mr: "निव्वळ", gu: "ચોખ્ખું", ta: "நிகர்" },
  estValue: { en: "Est. Value", hi: "अनु. मूल्य", mr: "अंदाजे मूल्य", gu: "અંદાજિત મૂલ્ય", ta: "மதிப்பீட்டு மதிப்பு" },
  loanAmount: { en: "Loan Amount", hi: "ऋण राशि", mr: "कर्ज रक्कम", gu: "લોન રકમ", ta: "கடன் தொகை" },
  interestRate: { en: "Interest Rate", hi: "ब्याज दर", mr: "व्याज दर", gu: "વ્યાજ દર", ta: "வட்டி விகிதம்" },
  perMonth: { en: "/ month", hi: "/ माह", mr: "/ महिना", gu: "/ મહિનો", ta: "/ மாதம்" },
  totalNetWt: { en: "Total Net Wt", hi: "कुल शुद्ध वज़न", mr: "एकूण निव्वळ वजन", gu: "કુલ ચોખ્ખું વજન", ta: "மொத்த நிகர எடை" },
  pledgeTerms: {
    en: "The above goods are pledged as security for the loan. Interest accrues monthly. Goods will be returned on full repayment of principal plus interest. Subject to shop terms & statutory pawn-broking rules.",
    hi: "उपरोक्त वस्तुएँ ऋण की जमानत के रूप में गिरवी रखी गई हैं। ब्याज मासिक रूप से लगता है। मूलधन और ब्याज के पूर्ण भुगतान पर वस्तुएँ लौटा दी जाएँगी। दुकान की शर्तों एवं वैधानिक गिरवी नियमों के अधीन।",
    mr: "वरील वस्तू कर्जाची तारण म्हणून गहाण ठेवल्या आहेत. व्याज मासिक आकारले जाते. मुद्दल व व्याजाच्या पूर्ण परतफेडीवर वस्तू परत केल्या जातील. दुकानाच्या अटी व कायदेशीर गहाण नियमांच्या अधीन.",
    gu: "ઉપરોક્ત વસ્તુઓ લોનની જામીનગીરી તરીકે ગીરવે મૂકવામાં આવી છે. વ્યાજ માસિક લાગે છે. મુદ્દલ અને વ્યાજની સંપૂર્ણ ચુકવણી પર વસ્તુઓ પરત કરવામાં આવશે. દુકાનની શરતો અને કાયદેસર ગીરો નિયમોને આધીન.",
    ta: "மேற்கண்ட பொருட்கள் கடனுக்குப் பிணையமாக அடகு வைக்கப்பட்டுள்ளன. வட்டி மாதந்தோறும் சேரும். அசல் மற்றும் வட்டியை முழுமையாகச் செலுத்தியவுடன் பொருட்கள் திரும்ப வழங்கப்படும். கடை விதிமுறைகள் மற்றும் சட்டப்பூர்வ அடகு விதிகளுக்கு உட்பட்டது.",
  },
  borrowerSignature: { en: "Borrower Signature", hi: "उधारकर्ता हस्ताक्षर", mr: "कर्जदार स्वाक्षरी", gu: "ઉધાર લેનારની સહી", ta: "கடன் வாங்குபவர் கையொப்பம்" },
  forShop: { en: "For", hi: "कृते", mr: "कृते", gu: "વતી", ta: "சார்பாக" },

  // ---- Girvi payment / renewal / closure receipt ----
  partRepaymentReceipt: { en: "PART REPAYMENT RECEIPT", hi: "आंशिक चुकौती पावती", mr: "आंशिक परतफेड पावती", gu: "આંશિક ચુકવણી રસીદ", ta: "பகுதி திருப்பிச் செலுத்தல் ரசீது" },
  loanRenewalVoucher: { en: "LOAN RENEWAL VOUCHER", hi: "ऋण नवीनीकरण वाउचर", mr: "कर्ज नूतनीकरण व्हाउचर", gu: "લોન નવીકરણ વાઉચર", ta: "கடன் புதுப்பித்தல் வவுச்சர்" },
  loanClosureReceipt: { en: "LOAN CLOSURE RECEIPT", hi: "ऋण समापन पावती", mr: "कर्ज बंद पावती", gu: "લોન બંધ રસીદ", ta: "கடன் முடிப்பு ரசீது" },
  receiptNo: { en: "Receipt No", hi: "पावती क्र.", mr: "पावती क्र.", gu: "રસીદ નં.", ta: "ரசீது எண்" },
  loanDetails: { en: "Loan Details:", hi: "ऋण विवरण:", mr: "कर्ज तपशील:", gu: "લોન વિગત:", ta: "கடன் விவரம்:" },
  particulars: { en: "Particulars", hi: "विवरण", mr: "तपशील", gu: "વિગત", ta: "விவரம்" },
  amountReceived: { en: "Amount Received", hi: "प्राप्त राशि", mr: "मिळालेली रक्कम", gu: "મળેલ રકમ", ta: "பெறப்பட்ட தொகை" },
  towardsInterest: { en: "Adjusted Towards Interest Accrued", hi: "अर्जित ब्याज में समायोजित", mr: "जमा व्याजात समायोजित", gu: "ઉપાર્જિત વ્યાજમાં ગોઠવ્યું", ta: "சேர்ந்த வட்டிக்கு சரிசெய்யப்பட்டது" },
  towardsPrincipal: { en: "Adjusted Towards Principal", hi: "मूलधन में समायोजित", mr: "मुद्दलात समायोजित", gu: "મુદ્દલમાં ગોઠવ્યું", ta: "அசலுக்கு சரிசெய்யப்பட்டது" },
  notes: { en: "Notes:", hi: "टिप्पणी:", mr: "टीप:", gu: "નોંધ:", ta: "குறிப்பு:" },
  paymentTerms: {
    en: "This is a transaction receipt for the payment received against the gold loan. Interest balances are updated chronologically. Keep this voucher safe for future reference.",
    hi: "यह स्वर्ण ऋण के विरुद्ध प्राप्त भुगतान की लेन-देन पावती है। ब्याज शेष कालानुक्रमिक रूप से अद्यतन किए जाते हैं। भविष्य के संदर्भ हेतु यह वाउचर सुरक्षित रखें।",
    mr: "ही सुवर्ण कर्जाविरुद्ध मिळालेल्या भरण्याची व्यवहार पावती आहे. व्याज शिल्लक कालानुक्रमे अद्ययावत केली जाते. भविष्यातील संदर्भासाठी हे व्हाउचर सुरक्षित ठेवा.",
    gu: "આ સોના લોન સામે મળેલ ચુકવણીની વ્યવહાર રસીદ છે. વ્યાજ બાકી કાળક્રમે અપડેટ થાય છે. ભવિષ્યના સંદર્ભ માટે આ વાઉચર સુરક્ષિત રાખો.",
    ta: "இது தங்கக் கடனுக்கு எதிராகப் பெறப்பட்ட கட்டணத்தின் பரிவர்த்தனை ரசீது. வட்டி இருப்புகள் காலவரிசைப்படி புதுப்பிக்கப்படும். எதிர்கால குறிப்புக்காக இந்த வவுச்சரைப் பாதுகாப்பாக வைக்கவும்.",
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
