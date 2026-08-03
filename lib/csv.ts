// Shared RFC-4180 CSV parser. Used for both the punter-catalog seed and the
// Phase 4 import pipeline (nflverse fetch + commissioner CSV upload converge on
// this single parser).

export type CsvRow = Record<string, string>

/**
 * Parse CSV text into an array of objects keyed by the header row.
 * Handles quoted fields, escaped quotes (""), and embedded commas/newlines.
 */
export function parseCsv(text: string): CsvRow[] {
  const rows = parseCsvToArrays(text)
  if (rows.length === 0) return []
  const header = rows[0]
  const out: CsvRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    // Skip fully empty trailing lines.
    if (cells.length === 1 && cells[0] === "") continue
    const row: CsvRow = {}
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cells[c] ?? ""
    }
    out.push(row)
  }
  return out
}

/** Parse CSV text into a 2D array of raw string cells. */
export function parseCsvToArrays(text: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  // Normalize line endings.
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      field = ""
      row = []
    } else {
      field += ch
    }
  }
  // Flush the final field/row if present.
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
