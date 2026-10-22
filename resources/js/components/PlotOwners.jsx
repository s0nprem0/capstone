import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { OWNER_TERMS, label, optionsOf } from '../lib/terms'
import ConfirmButton from './ConfirmButton'
import Select from './Select'

const EMPTY = { owner_name: '', plot: '', payment_terms: '', notes: '' }

/**
 * Who holds a plot sold at the office (the ledger's sales, or one entered
 * here). Staff and admin only: owner names are personal data and the public
 * map shows a plot's status, never its owner. Removing an owner is admin only.
 */
export default function PlotOwners({ lot, isAdmin, onChanged }) {
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    api(`/api/lots/${lot.lot_id}/owners`).then(({ ok, data }) => {
      setOwners(ok && Array.isArray(data) ? data : [])
      setLoading(false)
    })

  useEffect(() => {
    setLoading(true)
    setForm(null)
    setError('')
    load()
  }, [lot.lot_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (owner) => {
    setError('')
    setEditingId(owner ? owner.owner_id : null)
    setForm(owner ? { owner_name: owner.owner_name, plot: owner.plot || '', payment_terms: owner.payment_terms || '', notes: owner.notes || '' } : EMPTY)
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const path = editingId ? `/api/lot-owners/${editingId}` : `/api/lots/${lot.lot_id}/owners`
    const { ok, data } = await api(path, { method: 'POST', body: form })
    setBusy(false)
    if (!ok) {
      setError(data?.error || 'Could not save the owner')
      return
    }
    setForm(null)
    load()
    if (!editingId) onChanged?.()
  }

  const remove = async (owner) => {
    setError('')
    const { ok, data } = await api(`/api/lot-owners/${owner.owner_id}/delete`, { method: 'POST' })
    if (!ok) {
      setError(data?.error || 'Could not remove the owner')
      return
    }
    load()
    onChanged?.()
  }

  const field = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))

  return (
    <div className="plot-doc plot-doc--filed">
      <p className="plot-doc-label">Owners</p>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {loading && <p className="text-muted">Checking the register…</p>}
      {!loading && owners.length === 0 && !form && <p className="text-muted">No owner is recorded for this plot.</p>}
      {owners.map((o) => (
        <div key={o.owner_id} className="plot-owner">
          <p className="plot-doc-name">
            {o.owner_name}
            {o.plot && <span className="text-muted"> · plot {o.plot}</span>}
          </p>
          {(o.payment_terms || o.notes) && (
            <p className="text-muted">{[label(OWNER_TERMS, o.payment_terms), o.notes].filter(Boolean).join(' · ')}</p>
          )}
          {o.source && <p className="text-muted">{o.source}</p>}
          {!form && (
            <div className="table-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(o)}>Edit</button>
              {isAdmin && (
                <ConfirmButton
                  label="Remove"
                  danger
                  message={`Remove ${o.owner_name} as an owner of ${lot.lot_code}?`}
                  onConfirm={() => remove(o)}
                />
              )}
            </div>
          )}
        </div>
      ))}

      {form ? (
        <form onSubmit={submit} className="plot-owner-form" aria-label={editingId ? 'Edit owner' : 'Add an owner'}>
          <label>
            Owner name
            <input value={form.owner_name} onChange={field('owner_name')} required maxLength={255} />
          </label>
          <label>
            Sub-plot
            <input value={form.plot} onChange={field('plot')} maxLength={10} placeholder="e.g. A" />
          </label>
          <Select
            label="Terms"
            value={form.payment_terms}
            onChange={(v) => setForm((f) => ({ ...f, payment_terms: v }))}
            options={optionsOf(OWNER_TERMS, 'Not marked')}
          />
          <label>
            Notes
            <input value={form.notes} onChange={field('notes')} maxLength={500} />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      ) : (
        !loading && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(null)}>Add an owner</button>
        )
      )}
    </div>
  )
}
