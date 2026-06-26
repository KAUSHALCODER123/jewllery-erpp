/** Minimal CSV export helper (offline, no deps). */

const escape = (v: string | number): string => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Build a CSV string from headers + rows. */
export function toCsv(
  headers: string[],
  rows: (string | number)[][],
): string {
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n")
}

/** Trigger a browser download of the given text as a file. */
export function downloadText(filename: string, text: string, mime = "text/csv"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
