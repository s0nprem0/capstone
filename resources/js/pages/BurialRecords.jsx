import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import useList from '../lib/useList'
import ConfirmButton from '../components/ConfirmButton'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import PlotPicker from '../components/PlotPicker'
import Notice, { useNotice } from '../components/Notice'
import ExportActions from '../components/ExportActions'
import Select from '../components/Select'
import { BURIAL_TYPES, INTERMENT_STATUS, label, lifespan, longDate, optionsOf } from '../lib/terms'

const EMPTY_FORM = {
  deceased_fullname: '', date_of_birth: '', date_of_death: '',
  burial_date: '', lot_id: '', burial_type: 'single',
  next_of_kin_name: '', next_of_kin_phone: '', interment_status: 'scheduled',
}

// The server files an interment only against a plot someone holds.
const BURIABLE = new Set(['reserved', 'occupied'])

export default function BurialRecords() {
  const [searchParams] = useSearchParams()
  // Deep links from the map arrive as ?q=<lot code>; the existing search
  // already matches lot codes, so there is no second filter to maintain.
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [interment, setInterment] = useState('')
  const [type, setType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [plotSearch, setPlotSearch] = useState('')
  const [plots, setPlots] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const { notice, succeed, fail, clear } = useNotice()
  const q = useDebounced(search)

  const { items: records, loaded, error, reload } = useList(
    '/api/burial-records',
    { q, interment_status: interment, burial_type: type },
    'Failed to load burial records'
  )

  // Plots are chosen by code, not typed in as an internal id nobody can know.
  // The map payload is cached for the session, so this costs nothing after
  // the first page that loads it.
  useEffect(() => {
    if (!showForm || plots.length) return
    api('/api/map').then(({ ok, data }) => {
      if (ok) setPlots((data.sections || []).flatMap((s) => s.lots || []))
    })
  }, [showForm, plots.length])

  const selectedPlot = plots.find((l) => String(l.lot_id) === String(form.lot_id)) || null

  const plotChoices = useMemo(() => {
    const term = plotSearch.trim().toLowerCase()
    return plots.filter(
      (l) =>
        (BURIABLE.has(l.status) || String(l.lot_id) === String(form.lot_id)) &&
        (!term || l.lot_code.toLowerCase().includes(term) || l.section_name.toLowerCase().includes(term))
    )
  }, [plots, plotSearch, form.lot_id])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const openCreate = () => {
    clear()
    setEditing(null)
    setForm(EMPTY_FORM)
    setPlotSearch('')
    setShowForm(true)
  }

  const openEdit = (r) => {
    clear()
    setEditing(r)
    setForm({
      deceased_fullname: r.deceased_fullname,
      date_of_birth: r.date_of_birth || '',
      date_of_death: r.date_of_death || '',
      burial_date: r.burial_date,
      lot_id: String(r.lot_id),
      burial_type: r.burial_type,
      next_of_kin_name: r.next_of_kin_name || '',
      next_of_kin_phone: r.next_of_kin_phone || '',
      interment_status: r.interment_status,
    })
    setPlotSearch('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clear()
    if (!form.lot_id) {
      fail('Choose the plot this interment is filed against.')
      return
    }
    setSubmitting(true)
    const body = { ...form, lot_id: Number(form.lot_id) }
    const url = editing ? `/api/burial-records/${editing.burial_id}` : '/api/burial-records'
    const { ok, data } = await api(url, { method: 'POST', body })
    setSubmitting(false)
    if (ok) {
      succeed(editing ? `Entry for ${form.deceased_fullname} updated.` : `Entry for ${form.deceased_fullname} added.`)
      closeForm()
      reload()
    } else {
      fail(data?.error || 'Failed to save')
    }
  }

  const handleDelete = async (r) => {
    clear()
    setBusyId(r.burial_id)
    const { ok, data } = await api(`/api/burial-records/${r.burial_id}/delete`, { method: 'POST' })
    setBusyId(null)
    if (ok) {
      succeed(`Entry for ${r.deceased_fullname} deleted.`)
      reload()
    } else {
      fail(data?.error || 'Delete failed')
    }
  }

  const columns = [
    { label: 'No.', value: (r) => r.burial_id },
    { label: 'Deceased', value: (r) => r.deceased_fullname },
    { label: 'Date of birth', value: (r) => r.date_of_birth },
    { label: 'Date of death', value: (r) => r.date_of_death },
    { label: 'Plot', value: (r) => r.lot_code },
    { label: 'Section', value: (r) => r.section_name },
    { label: 'Burial date', value: (r) => r.burial_date },
    { label: 'Burial type', value: (r) => label(BURIAL_TYPES, r.burial_type) },
    { label: 'Next of kin', value: (r) => r.next_of_kin_name },
    { label: 'Next of kin phone', value: (r) => r.next_of_kin_phone },
    { label: 'Interment status', value: (r) => label(INTERMENT_STATUS, r.interment_status) },
  ]
  const describe = [
    interment ? label(INTERMENT_STATUS, interment) : 'All entries',
    type && label(BURIAL_TYPES, type),
    q && `search "${q}"`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      <Notice notice={notice} />

      <section className="section-block" aria-labelledby="register-heading">
        <div className="register-head">
          <h2 id="register-heading">Register of Interments</h2>
          <p>
            St. John Memorial Garden &amp; Parks
            {records.length > 0 && ` · ${records.length} ${records.length === 1 ? 'entry' : 'entries'}`}
          </p>
          <div className="register-head-actions">
            <ExportActions name="register-of-interments" columns={columns} rows={records} describe={describe} />
            {!showForm && <button className="btn btn-primary no-print" onClick={openCreate}>New Entry</button>}
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="register-form" aria-labelledby="entry-form-heading">
            <h3 id="entry-form-heading">
              {editing ? `Edit entry — ${editing.deceased_fullname}` : 'New entry'}
            </h3>

            <fieldset className="plot-picker">
              <legend>Plot</legend>
              <span className="label-hint">
                Only reserved or occupied plots can take an interment. Search by plot code or section.
              </span>
              <input
                type="search"
                className="search-input"
                aria-label="Search plots"
                placeholder="e.g. S4-015 or Section 4"
                value={plotSearch}
                onChange={(e) => setPlotSearch(e.target.value)}
                autoComplete="off"
              />
              {selectedPlot && (
                <p className="register-form-plot">
                  Filed against <strong>{selectedPlot.lot_code}</strong>, {selectedPlot.section_name}
                </p>
              )}
              <p className="panel-heading" id="entry-plot-list">
                {plots.length ? `Plots (${plotChoices.length})` : 'Plots'}
              </p>
              <PlotPicker
                lots={plotChoices}
                selectedId={form.lot_id}
                onSelect={(lot) => setForm((prev) => ({ ...prev, lot_id: String(lot.lot_id) }))}
                labelledBy="entry-plot-list"
                emptyMessage={plots.length ? 'No reserved or occupied plot matches that.' : 'Loading plots…'}
              />
            </fieldset>

            <div className="form-grid">
              <label>
                Deceased Full Name
                <input type="text" name="deceased_fullname" value={form.deceased_fullname} onChange={handleChange} required />
              </label>
              <label>
                Burial Date
                <input type="date" name="burial_date" value={form.burial_date} onChange={handleChange} required />
              </label>
              <label>
                Date of Birth
                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
              </label>
              <label>
                Date of Death
                <input type="date" name="date_of_death" value={form.date_of_death} onChange={handleChange} />
              </label>
              <Select
                label="Burial Type"
                value={form.burial_type}
                onChange={(v) => setForm((f) => ({ ...f, burial_type: v }))}
                options={optionsOf(BURIAL_TYPES)}
              />
              <Select
                label="Interment Status"
                value={form.interment_status}
                onChange={(v) => setForm((f) => ({ ...f, interment_status: v }))}
                options={optionsOf(INTERMENT_STATUS)}
              />
              <label>
                Next of Kin Name
                <input type="text" name="next_of_kin_name" value={form.next_of_kin_name} onChange={handleChange} />
              </label>
              <label>
                Next of Kin Phone
                <input type="tel" name="next_of_kin_phone" value={form.next_of_kin_phone} onChange={handleChange} />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </form>
        )}

        <div className="filter-bar register-filters">
          <input
            type="search"
            className="search-input"
            aria-label="Search the register"
            placeholder="Search a name, plot, section or next of kin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            ariaLabel="Filter by interment status"
            value={interment}
            onChange={setInterment}
            options={optionsOf(INTERMENT_STATUS, 'All interment statuses')}
          />
          <Select
            ariaLabel="Filter by burial type"
            value={type}
            onChange={setType}
            options={optionsOf(BURIAL_TYPES, 'All burial types')}
          />
        </div>

        {!loaded && !error && <Loading message="Loading the register..." />}

        {loaded && !error && (records.length === 0 ? (
          <div className="register register-scroll">
            <EmptyState
              noun="entries"
              filtered={Boolean(q || interment || type)}
              onClear={() => { setSearch(''); setInterment(''); setType('') }}
            />
          </div>
        ) : (
          <div className="register register-scroll">
            <table className="register-table table--stack">
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
                  <th scope="col" className="no-print"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const years = lifespan(r.date_of_birth, r.date_of_death)
                  return (
                    <tr key={r.burial_id}>
                      <td className="register-no" data-label="No.">{String(r.burial_id).padStart(3, '0')}</td>
                      <th scope="row" className="register-name">
                        {r.deceased_fullname}
                        {years && <span className="register-lifespan">{years}</span>}
                      </th>
                      <td className="register-cell" data-label="Plot">
                        <Link
                          to={`/?lot=${r.lot_id}`}
                          className="register-plot"
                          title="Show this plot on the cemetery map"
                        >
                          {r.lot_code}
                        </Link>
                      </td>
                      <td className="register-cell" data-label="Section">{r.section_name}</td>
                      <td className="register-cell" data-label="Interment">{longDate(r.burial_date)}</td>
                      <td className="register-cell" data-label="Type">{label(BURIAL_TYPES, r.burial_type)}</td>
                      <td className="register-cell" data-label="Next of kin">
                        {r.next_of_kin_name || '—'}
                        {r.next_of_kin_phone && (
                          <span className="register-kin">{r.next_of_kin_phone}</span>
                        )}
                      </td>
                      <td className="register-cell" data-label="State">
                        <span className={`mark mark--${r.interment_status}`}>
                          {label(INTERMENT_STATUS, r.interment_status)}
                        </span>
                      </td>
                      <td className="register-actions no-print cell-actions">
                        <div className="table-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                          <ConfirmButton
                            label="Delete"
                            danger
                            onConfirm={() => handleDelete(r)}
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
        ))}
      </section>
    </div>
  )
}
