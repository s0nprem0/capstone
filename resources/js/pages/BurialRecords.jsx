import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import ConfirmButton from '../components/ConfirmButton'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { BURIAL_TYPES, INTERMENT_STATUS, label, lifespan, longDate } from '../lib/terms'

export default function BurialRecords() {
  const [searchParams] = useSearchParams()
  const [records, setRecords] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  // Deep links from the map arrive as ?q=<lot code>; the existing search
  // already matches lot codes, so there is no second filter to maintain.
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [interment, setInterment] = useState('')
  const [type, setType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    deceased_fullname: '', date_of_birth: '', date_of_death: '',
    burial_date: '', lot_id: '', burial_type: 'single',
    next_of_kin_name: '', next_of_kin_phone: '', interment_status: 'scheduled',
  })
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const q = useDebounced(search)

  const load = async () => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (interment) params.set('interment_status', interment)
    if (type) params.set('burial_type', type)
    const qs = params.toString()
    const path = qs ? `/api/burial-records?${qs}` : '/api/burial-records'
    const { ok, data } = await api(path)
    if (ok) setRecords(data)
    else setError(data?.error || 'Failed to load burial records')
    setLoaded(true)
  }

  useEffect(() => { load() }, [q, interment, type])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const openCreate = () => {
    setEditId(null)
    setForm({
      deceased_fullname: '', date_of_birth: '', date_of_death: '',
      burial_date: '', lot_id: '', burial_type: 'single',
      next_of_kin_name: '', next_of_kin_phone: '', interment_status: 'scheduled',
    })
    setShowForm(true)
  }

  const openEdit = (r) => {
    setEditId(r.burial_id)
    setForm({
      deceased_fullname: r.deceased_fullname,
      date_of_birth: r.date_of_birth || '',
      date_of_death: r.date_of_death || '',
      burial_date: r.burial_date,
      lot_id: r.lot_id,
      burial_type: r.burial_type,
      next_of_kin_name: r.next_of_kin_name || '',
      next_of_kin_phone: r.next_of_kin_phone || '',
      interment_status: r.interment_status,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const body = { ...form, lot_id: Number(form.lot_id) }
    const url = editId ? `/api/burial-records/${editId}` : '/api/burial-records'
    const { ok, data } = await api(url, { method: 'POST', body })
    setSubmitting(false)
    if (ok) { setShowForm(false); load() }
    else setError(data?.error || 'Failed to save')
  }

  const handleDelete = async (id) => {
    setBusyId(id)
    const { ok, data } = await api(`/api/burial-records/${id}/delete`, { method: 'POST' })
    setBusyId(null)
    if (ok) load()
    else setError(data?.error || 'Delete failed')
  }

  return (
    <div>
      {error && <p className="alert alert--error">{error}</p>}

      {showForm && (
        <div className="form-card section-block">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Deceased Full Name
                <input type="text" name="deceased_fullname" value={form.deceased_fullname} onChange={handleChange} required />
              </label>
              <label>
                Plot ID
                <input type="number" name="lot_id" value={form.lot_id} onChange={handleChange} required />
              </label>
              <label>
                Burial Date
                <input type="date" name="burial_date" value={form.burial_date} onChange={handleChange} required />
              </label>
              <label>
                Burial Type
                <select name="burial_type" value={form.burial_type} onChange={handleChange}>
                  {Object.entries(BURIAL_TYPES).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label>
                Date of Birth
                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
              </label>
              <label>
                Date of Death
                <input type="date" name="date_of_death" value={form.date_of_death} onChange={handleChange} />
              </label>
              <label>
                Next of Kin Name
                <input type="text" name="next_of_kin_name" value={form.next_of_kin_name} onChange={handleChange} />
              </label>
              <label>
                Next of Kin Phone
                <input type="text" name="next_of_kin_phone" value={form.next_of_kin_phone} onChange={handleChange} />
              </label>
              <label>
                Interment Status
                <select name="interment_status" value={form.interment_status} onChange={handleChange}>
                  {Object.entries(INTERMENT_STATUS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {!loaded && !error && <Loading message="Loading the register..." />}

      {loaded && !error && (
        <section className="section-block" aria-labelledby="register-heading">
          <div className="register-head">
            <h2 id="register-heading">Register of Interments</h2>
            <p>
              St. John Memorial Garden &amp; Parks
              {records.length > 0 && ` · ${records.length} ${records.length === 1 ? 'entry' : 'entries'}`}
            </p>
            <button className="btn btn-primary" onClick={openCreate}>New Entry</button>
          </div>

          <div className="filter-bar register-filters">
            <input
              type="text"
              className="search-input"
              placeholder="Search a name, plot, section or next of kin..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select aria-label="Filter by interment status" value={interment} onChange={(e) => setInterment(e.target.value)}>
              <option value="">All interment statuses</option>
              <option value="interred">Interred</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <select aria-label="Filter by burial type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All burial types</option>
              {Object.entries(BURIAL_TYPES).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {records.length === 0 ? (
            <div className="register register-scroll">
              <EmptyState
                noun="entries"
                filtered={Boolean(q || interment || type)}
                onClear={() => { setSearch(''); setInterment(''); setType('') }}
              />
            </div>
          ) : (
            <div className="register register-scroll">
              <table className="register-table">
                <caption className="visually-hidden">
                  Register of interments, most recent first
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="register-no">No.</th>
                    <th scope="col">Deceased</th>
                    <th scope="col">Plot</th>
                    <th scope="col">Section</th>
                    <th scope="col">Interment</th>
                    <th scope="col">Type</th>
                    <th scope="col">Next of kin</th>
                    <th scope="col">State</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const years = lifespan(r.date_of_birth, r.date_of_death)
                    return (
                      <tr key={r.burial_id}>
                        <td className="register-no">{String(r.burial_id).padStart(3, '0')}</td>
                        <th scope="row" className="register-name">
                          {r.deceased_fullname}
                          {years && <span className="register-lifespan">{years}</span>}
                        </th>
                        <td className="register-cell">
                          <Link
                            to={`/?lot=${r.lot_id}`}
                            className="register-plot"
                            title="Show this plot on the cemetery map"
                          >
                            {r.lot_code}
                          </Link>
                        </td>
                        <td className="register-cell">{r.section_name}</td>
                        <td className="register-cell">{longDate(r.burial_date)}</td>
                        <td className="register-cell">{label(BURIAL_TYPES, r.burial_type)}</td>
                        <td className="register-cell">
                          {r.next_of_kin_name || '—'}
                          {r.next_of_kin_phone && (
                            <span className="register-kin">{r.next_of_kin_phone}</span>
                          )}
                        </td>
                        <td className="register-cell">
                          <span className={`mark mark--${r.interment_status}`}>
                            {label(INTERMENT_STATUS, r.interment_status)}
                          </span>
                        </td>
                        <td className="register-actions">
                          <div className="table-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                            <ConfirmButton
                              label="Delete"
                              danger
                              onConfirm={() => handleDelete(r.burial_id)}
                              busy={busyId === r.burial_id}
                              message={`Delete the entry for ${r.deceased_fullname}? This cannot be undone.`}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
