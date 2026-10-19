import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, forget } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import PlotPicker from '../components/PlotPicker'
import { nearestSection } from '../lib/sections'
import { LOT_TYPES, label, money } from '../lib/terms'

const SLOT_CAPACITY = { single: 1, double: 2, family: 4 }
const EMPTY_FORM = { lot_id: '', reservation_date: '', purpose: '', number_of_slots: 1 }
const TAKEN = 'That plot is no longer available. Someone may have reserved it while this page was open. Please choose another.'

// Local date, not toISOString(): that is UTC, which rejects today's date for
// anyone east of Greenwich during their own morning.
const todayISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// A half-filled form survives a dropped signal or a closed tab. Purpose is left
// out: it is free text that often names the deceased, and localStorage is not
// for personal data. Keyed per user so a shared phone does not hand one
// family's draft to the next.
const DRAFT_DAYS = 30
const draftKey = (userId) => `reserve-draft:${userId}`

const readDraft = (userId) => {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey(userId)) || 'null')
    if (!draft || Date.now() - draft.saved_at > DRAFT_DAYS * 86400000) return null
    return draft
  } catch {
    return null
  }
}

const writeDraft = (userId, form) => {
  try {
    if (!form.lot_id && !form.reservation_date) {
      localStorage.removeItem(draftKey(userId))
      return
    }
    localStorage.setItem(draftKey(userId), JSON.stringify({
      lot_id: form.lot_id,
      reservation_date: form.reservation_date,
      number_of_slots: form.number_of_slots,
      saved_at: Date.now(),
    }))
  } catch {
    // Storage full or blocked: the draft is a convenience, the form still works.
  }
}

export default function NewReservation() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [sections, setSections] = useState([])
  // A plot chosen on the map just now outranks the one in an old draft.
  const [draft] = useState(() => readDraft(user.user_id))
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(draft && {
      lot_id: draft.lot_id,
      reservation_date: draft.reservation_date,
      number_of_slots: draft.number_of_slots,
    }),
    ...(searchParams.get('lot') && { lot_id: searchParams.get('lot') }),
  }))
  const [draftRestored, setDraftRestored] = useState(!!draft)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [sectionChoice, setSectionChoice] = useState(null)
  const nextStepsRef = useRef(null)
  const sectionRef = useRef(null)

  const loadMap = () =>
    api('/api/map').then(({ ok, data }) => {
      if (ok && data?.sections) setSections(data.sections)
    })

  useEffect(() => {
    loadMap()
  }, [])

  useEffect(() => {
    if (!submitted) writeDraft(user.user_id, form)
  }, [form, submitted, user.user_id])

  useEffect(() => {
    if (submitted) nextStepsRef.current?.focus()
  }, [submitted])

  const grouped = sections
    .map((s) => ({
      section: s,
      lots: (s.lots || []).filter((l) => l.status === 'available'),
    }))
    .filter((g) => g.lots.length > 0)

  const lots = grouped.flatMap((g) => g.lots)
  const selectedLot = lots.find((l) => String(l.lot_id) === String(form.lot_id))
  const slotMax = selectedLot ? SLOT_CAPACITY[selectedLot.lot_type] || 1 : null
  const slots = Math.max(1, Number(form.number_of_slots) || 1)
  const totalAmount = selectedLot ? Number(selectedLot.price) * slots : 0

  // A ?lot= deep link can outlive the lot it points at. Gated on the map having
  // loaded, otherwise every deep link reports as stale for the first frame.
  const staleLot = sections.length > 0 && form.lot_id !== '' && !selectedLot
  const nearSection = selectedLot
    ? nearestSection(sections.find((s) => String(s.section_id) === String(selectedLot.section_id)), sections)
    : null

  // Until the visitor picks a section themselves, follow the selected plot, so a
  // ?lot= deep link opens on its own section with the plot highlighted.
  const sectionId = sectionChoice ?? (selectedLot ? String(selectedLot.section_id) : '')
  const q = search.trim().toLowerCase()
  const matches = sectionId || q
    ? lots.filter((l) =>
        (!sectionId || String(l.section_id) === sectionId) &&
        (!q || l.lot_code.toLowerCase().includes(q) || l.section_name.toLowerCase().includes(q))
      )
    : []

  const errors = {}
  if (!form.lot_id) errors.lot_id = 'Select a lot.'
  else if (staleLot) errors.lot_id = TAKEN
  if (!form.reservation_date) errors.reservation_date = 'Pick a reservation date.'
  else if (form.reservation_date < todayISO()) errors.reservation_date = 'The date cannot be in the past.'

  const show = (name) => touched[name] && errors[name]
  const blur = (name) => setTouched((t) => ({ ...t, [name]: true }))

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'number_of_slots') {
      const next = Number(value) || 1
      setForm((prev) => ({
        ...prev,
        number_of_slots: slotMax ? Math.max(1, Math.min(next, slotMax)) : next,
      }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const selectLot = (lot) => {
    const max = SLOT_CAPACITY[lot.lot_type] || 1
    setForm((prev) => ({
      ...prev,
      lot_id: String(lot.lot_id),
      number_of_slots: Math.min(Number(prev.number_of_slots) || 1, max),
    }))
  }

  const startOver = () => {
    setForm(EMPTY_FORM)
    setTouched({})
    setSearch('')
    setSectionChoice(null)
    setDraftRestored(false)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setTouched({ lot_id: true, reservation_date: true })
    if (errors.lot_id || errors.reservation_date) return
    setSubmitting(true)

    const { ok, status, data } = await api('/api/reservations', {
      method: 'POST',
      body: {
        user_id: user.user_id,
        lot_id: form.lot_id,
        reservation_date: form.reservation_date,
        purpose: form.purpose,
        number_of_slots: slots,
      },
    })
    setSubmitting(false)
    if (ok) {
      setSubmitted({ id: data.reservation_id, lot: selectedLot, near: nearSection })
      writeDraft(user.user_id, EMPTY_FORM)
      startOver()
    } else if (status === 422 && data?.error === 'Lot is not available') {
      // The cached map still lists the plot as free. Reload it so the plot
      // drops out of the list and the field reports it as taken.
      setSectionChoice(String(selectedLot.section_id))
      forget('/api/map')
      await loadMap()
      setTouched({ lot_id: true, reservation_date: true })
      sectionRef.current?.focus()
    } else {
      setError(data?.error || 'Failed to create reservation')
    }
  }

  if (submitted) {
    const { id, lot, near } = submitted
    return (
      <div>
        <h2>Reserve a Lot</h2>
        <section className="form-card next-steps" aria-labelledby="next-steps-heading">
          <h3 id="next-steps-heading" ref={nextStepsRef} tabIndex={-1}>
            Reservation #{id} received
          </h3>
          <p>
            Plot <strong>{lot.lot_code}</strong> in {lot.section_name}
            {near && <>, near {near.section_name}</>}, is now held for you while the
            cemetery office reviews your request.
          </p>
          <p className="panel-heading">What happens next</p>
          <ol className="next-steps-list">
            <li>The office reviews your reservation. Approval is a separate step and can take some time.</li>
            <li>
              You will get a <Link to="/notifications">notification</Link> when it is approved or
              declined. You can also follow it under <Link to="/visitor/reservations">My Reservations</Link>.
            </li>
            <li>
              Payment is arranged with the cemetery office by cash, GCash, bank transfer or cheque.
              Mention reservation #{id} so it is recorded against this plot.
            </li>
          </ol>
          <div className="form-actions">
            <Link to="/visitor/reservations" className="btn btn-primary">View my reservations</Link>
            <button type="button" className="btn btn-secondary" onClick={() => setSubmitted(null)}>
              Reserve another plot
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div>
      <h2>Reserve a Lot</h2>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {draftRestored && (
        <p className="alert alert--info draft-note" role="status">
          We kept what you entered last time.{' '}
          <button type="button" className="btn btn-secondary btn-sm" onClick={startOver}>Start over</button>
        </p>
      )}

      {grouped.length === 0 && (
        <p className="text-muted">No available lots at the moment. Please check back later.</p>
      )}

      <form onSubmit={handleSubmit} className="form-card" noValidate>
        <fieldset className="plot-picker" aria-describedby="res-lot-hint">
          <legend>Cemetery Lot</legend>
          <span className="label-hint" id="res-lot-hint">
            Choose a section, or type a plot code, then tap the plot you would like to hold.
            Not sure which one? <Link to="/">Browse the cemetery map</Link> to see where each plot lies.
          </span>
          <div className="plot-picker-filters">
            <label>
              Section
              <select
                ref={sectionRef}
                value={sectionId}
                onChange={(e) => setSectionChoice(e.target.value)}
                aria-invalid={!!show('lot_id')}
                aria-describedby={staleLot || show('lot_id') ? 'res-lot-error' : undefined}
              >
                <option value="">All sections</option>
                {grouped.map((g) => (
                  <option key={g.section.section_id} value={g.section.section_id}>
                    {g.section.section_name} ({g.lots.length} available)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plot code
              <input
                type="search"
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. S3-025"
                autoComplete="off"
              />
            </label>
          </div>
          {/* Staleness shows on its own — it is a data condition, not a
              field the visitor has just left. */}
          {(staleLot || show('lot_id')) && (
            <span className="field-error" id="res-lot-error" role="alert">{errors.lot_id}</span>
          )}
          <p className="panel-heading" id="res-lot-list-heading">
            {sectionId || q ? `Available plots (${matches.length})` : 'Available plots'}
          </p>
          <PlotPicker
            lots={matches}
            selectedId={form.lot_id}
            onSelect={selectLot}
            labelledBy="res-lot-list-heading"
            emptyMessage={
              sectionId || q
                ? 'No available plot matches that. Try another section or a shorter code.'
                : 'Choose a section or type a plot code to see the plots you can reserve.'
            }
            showSection={!sectionId}
            showStatus={false}
            showPrice
          />
        </fieldset>

        <div className="form-grid">
          <div className="field">
            <label>
              Reservation Date
              <input
                type="date"
                name="reservation_date"
                value={form.reservation_date}
                onChange={handleChange}
                onBlur={() => blur('reservation_date')}
                aria-invalid={!!show('reservation_date')}
                aria-describedby={show('reservation_date') ? 'res-date-error res-date-hint' : 'res-date-hint'}
                min={todayISO()}
                required
              />
            </label>
            {show('reservation_date') && (
              <span className="field-error" id="res-date-error" role="alert">{errors.reservation_date}</span>
            )}
            <span className="label-hint" id="res-date-hint">
              The date the reservation is for. Today or any later day.
            </span>
          </div>
          <div className="field">
            <label>
              Purpose
              <input
                name="purpose"
                value={form.purpose}
                onChange={handleChange}
                maxLength={100}
                aria-describedby="res-purpose-hint"
              />
            </label>
            <span className="label-hint" id="res-purpose-hint">
              Optional. A few words for the office, such as who the plot is for.
            </span>
          </div>
          <div className="field">
            <label>
              Number of Slots{slotMax && <span className="label-hint">(max {slotMax})</span>}
              <input
                type="number"
                min="1"
                max={slotMax || undefined}
                name="number_of_slots"
                value={form.number_of_slots}
                onChange={handleChange}
                aria-describedby="res-slots-hint"
                required
              />
            </label>
            <span className="label-hint" id="res-slots-hint">
              How many people this plot will hold. A single plot holds 1, a double 2, a family plot 4.
            </span>
          </div>
        </div>

        {/* Without this the only feedback for picking a plot was Total: ₱0
            turning into a number. Spells out what was actually chosen. */}
        {selectedLot && (
          <dl className="figure-list reserve-summary">
            <div><dt>Plot</dt><dd>{selectedLot.lot_code}</dd></div>
            <div>
              <dt>Section</dt>
              <dd>{selectedLot.section_name}{nearSection && `, near ${nearSection.section_name}`}</dd>
            </div>
            <div><dt>Type</dt><dd>{label(LOT_TYPES, selectedLot.lot_type)}</dd></div>
            <div><dt>Price</dt><dd>{money(selectedLot.price)}</dd></div>
            <div><dt>Capacity</dt><dd>{slotMax} {slotMax === 1 ? 'slot' : 'slots'}</dd></div>
          </dl>
        )}

        <div className="form-actions">
          <p className="total-display">
            Total: <strong>{money(totalAmount)}</strong>
          </p>
          <Link to="/visitor/reservations" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Reservation'}
          </button>
        </div>
      </form>
    </div>
  )
}
