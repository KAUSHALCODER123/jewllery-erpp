/**
 * Excel (.xlsx) export helpers, built on SheetJS (already a dependency, used by
 * the Reports GST exports). `XLSX.writeFile` triggers a normal browser download,
 * which works both on the web build and inside the desktop WebView.
 */
import * as XLSX from "xlsx"

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 chars. */
function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = (name || "Sheet").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet"
  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = `-${n++}`
    candidate = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}

/** Download an array of plain objects as a single-sheet workbook. */
export function exportObjectsToExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, unknown>[],
): void {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}])
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheetName, new Set()))
  XLSX.writeFile(wb, filename)
}

export interface ExcelSheet {
  name: string
  rows: Record<string, unknown>[]
}

/** Download a multi-sheet workbook — one sheet per non-empty {name, rows}. */
export function exportWorkbook(filename: string, sheets: ExcelSheet[]): number {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  let added = 0
  for (const sheet of sheets) {
    if (!sheet.rows || sheet.rows.length === 0) continue
    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name, used))
    added += 1
  }
  if (added === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No data to export"]]), "Empty")
  }
  XLSX.writeFile(wb, filename)
  return added
}
