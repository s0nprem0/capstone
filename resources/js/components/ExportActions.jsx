import { downloadCsv } from '../lib/csv'
import { localISO, longDate } from '../lib/terms'

/**
 * Print and CSV export for a list page. Both take what the page is showing,
 * filters included, so the report a user wants is the list they have already
 * narrowed down rather than a second copy of it on the Reports page.
 *
 * `describe` says what was exported ("Pending · search S4"); it is printed
 * under the title, where the on-screen filters are hidden.
 */
export default function ExportActions({ name, columns, rows, describe }) {
  const today = localISO()
  return (
    <>
      <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()} disabled={!rows.length}>
        Print
      </button>
      {columns && (
        <button
          type="button"
          className="btn btn-secondary no-print"
          disabled={!rows.length}
          onClick={() => downloadCsv(`${name}-${today}`, columns, rows)}
        >
          Export CSV
        </button>
      )}
      <p className="print-only print-note">
        {describe ? `${describe} · ` : ''}{rows.length} {rows.length === 1 ? 'row' : 'rows'} · printed {longDate(today)}
      </p>
    </>
  )
}
