// A cell a spreadsheet would run as a formula (=, +, -, @, tab, CR) is
// prefixed with a quote, so a client named "=HYPERLINK(...)" stays text.
const FORMULA = /^[=+\-@\t\r]/

const cell = (value) => {
  if (value == null) return ''
  if (typeof value === 'number') return String(value)
  let text = String(value)
  if (FORMULA.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Save rows as a CSV file. Amounts go out as plain numbers and dates as
 * YYYY-MM-DD, so the sheet can sum and sort them.
 *
 * @param {string} filename without the extension
 * @param {{ label: string, value: (row: object) => unknown }[]} columns
 * @param {object[]} rows
 */
export function downloadCsv(filename, columns, rows) {
  const lines = [columns.map((c) => cell(c.label)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','))
  // The BOM tells Excel the file is UTF-8, or Ñ and ₱ arrive garbled.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
