import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import ConfirmButton from '../components/ConfirmButton'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import Notice, { useNotice } from '../components/Notice'
import PageHeader from '../components/PageHeader'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import Blank from '../components/Blank'
import {
  APPROVAL_STATUS, LEDGER_ISSUES, LEDGER_KINDS, LOT_STATUS, OWNER_TERMS, label, localISO, longDate, optionsOf,
} from '../lib/terms'

const PAGE = 100

// "57;58" -> two links: a row is often read off a spread photographed twice.
function PhotoLinks({ book, photo }) {
  if (book === 'old') return <span className="text-muted">First transcription</span>
  if (!photo) return <Blank />
  return (
    <span className="ledger-photos">
      Book {book} ·{' '}
      {photo.split(';').map((n) => n.trim()).filter(Boolean).map((n, i) => (
        <span key={n}>
          {i > 0 && ', '}
          <a href={`/api/ledger/photo?book=${book}&n=${encodeURIComponent(n)}`} target="_blank" rel="noreferrer">
            photo {n}
          </a>
        </span>
      ))}
    </span>
  )
}

const editFormOf = (row) => ({
  name: row.name,
  lot_code: row.lot_code || '',
  plot: row.plot || '',
  burial_date: row.burial_date || '',
  terms: row.terms || '',
  checked: false,
})

/**
 * The handwritten ledger, line by line, before it becomes records. Each row
 * is checked against its photo, corrected, and approved into an owner or an
 * interment on the surveyed plot; approval runs the same rules as entering
 * the record by hand.
 */
export default function LedgerReview() {
  const [status, setStatus] = useState('pending')
  const [kind, setKind] = useState('')
  const [issue, setIssue] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const { notice, succeed, fail, clear } = useNotice()
  const q = useDebounced(search)
  const latest = useRef(0)

  const qs = new URLSearchParams(
    Object.entries({ status, kind, issue, q, limit: PAGE, offset }).filter(([, v]) => v !== '')
  ).toString()

  const reload = useCallback(async () => {
    const request = ++latest.current
    const { ok, data } = await api(`/api/ledger?${qs}`)
    if (request !== latest.current) return
    if (ok) {
      setPage(data)
      setError('')
    } else {
      setError(data?.error || 'Failed to load the ledger')
    }
  }, [qs])

  useEffect(() => { reload() }, [reload])
  useEffect(() => { setOffset(0) }, [status, kind, issue, q])

  const act = async (row, path, body, done) => {
    clear()
    setBusyId(row.row_id)
    const { ok, data } = await api(`/api/ledger/${row.row_id}${path}`, { method: 'POST', body })
    setBusyId(null)
    if (!ok) {
      fail(data?.error || 'That did not go through')
      return
    }
    succeed(done)
    setEditing(null)
    setRejecting(null)
    reload()
  }

  const save = (e) => {
    e.preventDefault()
    const body = { name: form.name, lot_code: form.lot_code, plot: form.plot }
    if (editing.kind === 'burial') body.burial_date = form.burial_date
    else body.terms = form.terms
    if (form.checked) body.doubt = ''
    act(editing, '', body, `Row ${editing.row_id} updated.`)
  }

  const approveClean = async () => {
    clear()
    setBulkBusy(true)
    const { ok, data } = await api('/api/ledger/approve-clean', { method: 'POST' })
    setBulkBusy(false)
    if (!ok) {
      fail(data?.error || 'Bulk approval failed')
      return
    }
    const skipped = data.skipped.length
    succeed(
      `Approved ${data.approved} ${data.approved === 1 ? 'row' : 'rows'}.` +
        (skipped ? ` ${skipped} could not be, and are marked with the reason.` : '')
    )
    reload()
  }

  const counts = page?.counts
  const rows = page?.items || []

  return (
    <div>
      <PageHeader title="Ledger review" />
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      <Notice notice={notice} />

      <section className="section-block" aria-labelledby="ledger-heading">
        <div className="register-head">
          <h2 id="ledger-heading">Handwritten sales ledger</h2>
          <p>
            Check each line against its photo before approving it. Approving a sale records the owner on the plot;
            approving an interment files it in the register. Either takes the plot off the market.
          </p>
          {counts && (
            <div className="register-head-actions">
              <span className="text-muted">
                {counts.pending} waiting · {counts.approved} approved · {counts.rejected} rejected
              </span>
              <ConfirmButton
                label={`Approve ready rows (${counts.clean})`}
                className="btn btn-primary btn-sm"
                disabled={!counts.clean || bulkBusy}
                busy={bulkBusy}
                confirmLabel="Approve them"
                message={`Approve up to 200 of the ${counts.clean} rows with a matched plot, no transcriber doubt and a date? Any a rule refuses stay here with the reason.`}
                onConfirm={approveClean}
              />
            </div>
          )}
        </div>

        <div className="filter-bar register-filters">
          <input
            type="search"
            className="search-input"
            aria-label="Search the ledger"
            placeholder="Search a name, block or plot code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select ariaLabel="Filter by review status" value={status} onChange={setStatus} options={optionsOf(APPROVAL_STATUS, 'All rows')} />
          <Select ariaLabel="Filter by kind" value={kind} onChange={setKind} options={optionsOf(LEDGER_KINDS, 'Sales and interments')} />
          <Select ariaLabel="Filter by what needs attention" value={issue} onChange={setIssue} options={optionsOf(LEDGER_ISSUES, 'Any row')} />
        </div>

        {!page && !error && <Loading message="Loading the ledger..." />}

        {page && (rows.length === 0 ? (
          <EmptyState
            noun="rows"
            filtered={Boolean(q || kind || issue || status !== 'pending')}
            onClear={() => { setSearch(''); setKind(''); setIssue(''); setStatus('pending') }}
          />
        ) : (
          <div className="table-container">
            <table className="table table--stack ledger-table">
              <caption className="visually-hidden">Ledger rows in page order</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Book says</th>
                  <th scope="col">Name</th>
                  <th scope="col">Plot</th>
                  <th scope="col">Date / terms</th>
                  <th scope="col">Notes</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <LedgerRowView
                    key={r.row_id}
                    row={r}
                    busy={busyId === r.row_id}
                    editing={editing?.row_id === r.row_id}
                    rejecting={rejecting === r.row_id}
                    form={form}
                    setForm={setForm}
                    reason={reason}
                    setReason={setReason}
                    onEdit={() => { clear(); setRejecting(null); setEditing(r); setForm(editFormOf(r)) }}
                    onCancel={() => { setEditing(null); setRejecting(null) }}
                    onSave={save}
                    onApprove={() => act(r, '/approve', undefined, `Row ${r.row_id} approved.`)}
                    onReject={() => { clear(); setEditing(null); setReason(''); setRejecting(r.row_id) }}
                    onConfirmReject={(e) => { e.preventDefault(); act(r, '/reject', { reason }, `Row ${r.row_id} rejected.`) }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {page && page.total > PAGE && (
          <div className="ledger-pager">
            <button type="button" className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </button>
            <span className="text-muted">
              {offset + 1}–{Math.min(offset + PAGE, page.total)} of {page.total}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={offset + PAGE >= page.total} onClick={() => setOffset(offset + PAGE)}>
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function LedgerRowView({
  row: r, busy, editing, rejecting, form, setForm, reason, setReason,
  onEdit, onCancel, onSave, onApprove, onReject, onConfirmReject,
}) {
  const pending = r.status === 'pending'
  const field = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))

  return (
    <>
      <tr className={editing || rejecting ? 'ledger-row--open' : undefined}>
        <td data-label="Source">
          <PhotoLinks book={r.book} photo={r.photo} />
          <div className="text-muted">{label(LEDGER_KINDS, r.kind)} · row {r.row_id}</div>
        </td>
        <td data-label="Book says">
          {r.block_label}, lot {r.lot}{r.plot ? `-${r.plot}` : ''}
        </td>
        <th scope="row" className="register-name">{r.name}</th>
        <td data-label="Plot">
          {r.lot_code ? (
            <>
              <strong>{r.lot_code}</strong>
              <div className="text-muted">{label(LOT_STATUS, r.lot_status)}</div>
            </>
          ) : (
            <span className="ledger-flag">Choose a plot</span>
          )}
        </td>
        <td data-label={r.kind === 'burial' ? 'Interred' : 'Terms'}>
          {r.kind === 'burial' ? (
            r.burial_date ? (
              <>
                {longDate(r.burial_date)}
                {r.date_text && <div className="text-muted">book: {r.date_text}</div>}
              </>
            ) : (
              <span className="ledger-flag">{r.date_text ? `Unreadable: ${r.date_text}` : 'No date'}</span>
            )
          ) : (
            label(OWNER_TERMS, r.terms) || <Blank />
          )}
        </td>
        <td data-label="Notes" className="ledger-notes">
          {r.doubt && <div className="ledger-flag">Unsure: {r.doubt}</div>}
          {r.notes && <div>{r.notes}</div>}
          {r.review_note && <div className={pending ? 'ledger-flag' : 'text-muted'}>{pending ? 'Held back: ' : ''}{r.review_note}</div>}
          {!r.doubt && !r.notes && !r.review_note && <Blank />}
        </td>
        <td className="cell-actions">
          {pending ? (
            <div className="table-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit} disabled={busy}>Edit</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy || !r.lot_id}>Approve</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onReject} disabled={busy}>Reject</button>
            </div>
          ) : (
            <>
              <StatusBadge kind="approval" value={r.status} />
              {r.reviewed_by_name && <div className="text-muted">by {r.reviewed_by_name}</div>}
            </>
          )}
        </td>
      </tr>

      {editing && form && (
        <tr className="ledger-edit">
          <td colSpan={7}>
            <form onSubmit={onSave} aria-label={`Correct row ${r.row_id}`}>
              <div className="form-grid">
                <label>
                  Name as it should be recorded
                  <input value={form.name} onChange={field('name')} required maxLength={255} />
                </label>
                <label>
                  Plot code
                  <input value={form.lot_code} onChange={field('lot_code')} placeholder="e.g. S5-001" />
                  <small className="label-hint">The surveyed plot this line is about.</small>
                </label>
                <label>
                  Sub-plot
                  <input value={form.plot} onChange={field('plot')} maxLength={10} placeholder="e.g. A or B-C" />
                </label>
                {r.kind === 'burial' ? (
                  <label>
                    Burial date
                    <input type="date" value={form.burial_date} onChange={field('burial_date')} max={localISO()} />
                    {r.date_text && <small className="label-hint">The book has "{r.date_text}".</small>}
                  </label>
                ) : (
                  <Select
                    label="Terms"
                    value={form.terms}
                    onChange={(v) => setForm((f) => ({ ...f, terms: v }))}
                    options={optionsOf(OWNER_TERMS, 'Not marked')}
                  />
                )}
              </div>
              {r.doubt && (
                <label className="ledger-check">
                  <input
                    type="checkbox"
                    checked={form.checked}
                    onChange={(e) => setForm((f) => ({ ...f, checked: e.target.checked }))}
                  />
                  I checked this against the photo (clears "{r.doubt}")
                </label>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </td>
        </tr>
      )}

      {rejecting && (
        <tr className="ledger-edit">
          <td colSpan={7}>
            <form onSubmit={onConfirmReject} aria-label={`Reject row ${r.row_id}`}>
              <label>
                Why is this row rejected?
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  maxLength={255}
                  placeholder='e.g. "duplicate of row 12" or "ghost text from the other page"'
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={busy || !reason.trim()}>Reject row</button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  )
}
