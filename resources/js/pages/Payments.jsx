import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import useDebounced from '../lib/useDebounced'
import useList from '../lib/useList'
import { useAuth } from '../context/AuthContext'
import ConfirmButton from '../components/ConfirmButton'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Notice, { useNotice } from '../components/Notice'
import StatusBadge from '../components/StatusBadge'
import ExportActions from '../components/ExportActions'
import Select from '../components/Select'
import Combobox from '../components/Combobox'
import Blank from '../components/Blank'
import { PAYMENT_METHODS, PAYMENT_STATUS, label, localISO, longDate, money, optionsOf } from '../lib/terms'

const emptyForm = () => ({
  reservation_id: '',
  amount: '',
  method: 'cash',
  reference_no: '',
  payment_date: localISO(),
  notes: '',
})

export default function Payments() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [reservations, setReservations] = useState([])
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const { notice, succeed, fail, clear } = useNotice()
  const q = useDebounced(search)

  const { items: payments, loaded, error, reload } = useList('/api/payments', { q, method }, 'Failed to load payments')

  // Reservations to record a payment against. Balance is total minus what has
  // been paid, so the person recording can see what is still owed.
  useEffect(() => {
    api('/api/reservations').then(({ ok, data }) => {
      if (ok) setReservations(data)
    })
  }, [])

  const openRecord = () => {
    setEditId(null)
    setForm(emptyForm())
    clear()
    setShowForm(true)
  }

  const openEdit = (p) => {
    setEditId(p.payment_id)
    setForm({
      reservation_id: String(p.reservation_id),
      amount: String(p.amount),
      method: p.method,
      reference_no: p.reference_no || '',
      payment_date: p.payment_date,
      notes: p.notes || '',
    })
    clear()
    setShowForm(true)
  }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const setField = (name) => (value) => setForm((prev) => ({ ...prev, [name]: value }))

  const balanceOf = (r) => Number(r.total_amount) - Number(r.amount_paid)

  // Only what can still take a payment: owing a balance and not rejected.
  // The one being edited stays listed whatever its state, so it can show.
  const reservationOptions = reservations
    .filter((r) => String(r.reservation_id) === form.reservation_id || (balanceOf(r) > 0 && r.approved_status !== 'rejected'))
    .map((r) => ({
      value: String(r.reservation_id),
      label: `#${r.reservation_id} · ${r.lot_code} · ${r.user_name}`,
      description: `${label(PAYMENT_STATUS, r.payment_status)} · balance ${money(balanceOf(r))}`,
    }))

  // Choosing a reservation offers its balance as the amount, the usual case.
  const chooseReservation = (value) => {
    const r = reservations.find((x) => String(x.reservation_id) === value)
    setForm((prev) => ({
      ...prev,
      reservation_id: value,
      amount: prev.amount || (r ? String(balanceOf(r)) : ''),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clear()
    if (!form.reservation_id) {
      fail('Choose the reservation this payment is for.')
      return
    }
    setSaving(true)
    const body = {
      reservation_id: Number(form.reservation_id),
      amount: Number(form.amount),
      method: form.method,
      reference_no: form.reference_no,
      payment_date: form.payment_date,
      notes: form.notes,
    }
    const url = editId ? `/api/payments/${editId}` : '/api/payments'
    const { ok, data } = await api(url, { method: 'POST', body })
    setSaving(false)
    if (ok) {
      succeed(editId ? 'Payment updated.' : 'Payment recorded.')
      setShowForm(false)
      setEditId(null)
      setForm(emptyForm())
      reload()
    } else {
      fail(data?.error || 'Failed to save payment')
    }
  }

  const handleDelete = async (id) => {
    clear()
    setBusyId(id)
    const { ok, data } = await api(`/api/payments/${id}/delete`, { method: 'POST' })
    setBusyId(null)
    if (ok) {
      succeed('Payment deleted.')
      reload()
    } else {
      fail(data?.error || 'Delete failed')
    }
  }

  const columns = [
    { label: 'Payment date', value: (p) => p.payment_date },
    { label: 'Reservation', value: (p) => p.reservation_id },
    { label: 'Plot', value: (p) => p.lot_code },
    { label: 'Client', value: (p) => p.user_name },
    { label: 'Amount', value: (p) => Number(p.amount) },
    { label: 'Method', value: (p) => label(PAYMENT_METHODS, p.method) },
    { label: 'Reference', value: (p) => p.reference_no },
    { label: 'Recorded by', value: (p) => p.recorded_by_name },
    { label: 'Reservation payment', value: (p) => label(PAYMENT_STATUS, p.payment_status) },
  ]
  const describe = [method ? label(PAYMENT_METHODS, method) : 'All methods', q && `search "${q}"`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      <PageHeader title="Payments">
        <ExportActions name="payments" columns={columns} rows={payments} describe={describe} />
        {!showForm && <button className="btn btn-primary no-print" onClick={openRecord}>Record Payment</button>}
      </PageHeader>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      <Notice notice={notice} />

      {showForm && (
        <div className="form-card section-block">
          <form onSubmit={handleSubmit}>
            <h3>{editId ? 'Edit Payment' : 'Record Payment'}</h3>
            <div className="form-grid">
              <Combobox
                label="Reservation"
                value={form.reservation_id}
                onChange={chooseReservation}
                options={reservationOptions}
                disabled={Boolean(editId)}
                placeholder="Search by number, plot or client"
                emptyText="No reservation with a balance matches that."
              />
              <label>
                Amount (₱)
                <input type="number" name="amount" min="0.01" step="0.01" value={form.amount} onChange={handleChange} required />
              </label>
              <Select label="Method" value={form.method} onChange={setField('method')} options={optionsOf(PAYMENT_METHODS)} />
              <label>
                Payment Date
                <input type="date" name="payment_date" value={form.payment_date} onChange={handleChange} required />
              </label>
              <label>
                Reference No.
                <input name="reference_no" value={form.reference_no} onChange={handleChange} maxLength={50} placeholder="e.g. GC-8821301" />
              </label>
              <label>
                Notes
                <input name="notes" value={form.notes} onChange={handleChange} maxLength={255} />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by lot, client or reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select ariaLabel="Filter by payment method" value={method} onChange={setMethod} options={optionsOf(PAYMENT_METHODS, 'All methods')} />
      </div>

      {!loaded && !error && <Loading message="Loading payments..." />}

      {loaded && !error && (payments.length === 0 ? (
        <EmptyState
          noun="payments"
          filtered={Boolean(q || method)}
          onClear={() => { setSearch(''); setMethod('') }}
        />
      ) : (
        <div className="table-container section-block">
          <table className="table table--stack">
            <caption className="visually-hidden">Recorded payments</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reservation</th>
                <th>Client</th>
                <th className="num">Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Recorded by</th>
                <th>Reservation payment</th>
                <th className="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.payment_id}>
                  <td data-label="Date">{longDate(p.payment_date)}</td>
                  <td data-label="Reservation">
                    <Link to={`/?lot=${p.lot_id}`} title="Show on the cemetery map">{p.lot_code}</Link>
                    <span className="text-muted"> #{p.reservation_id}</span>
                  </td>
                  <td data-label="Client">{p.user_name}</td>
                  <td data-label="Amount" className="num">{money(p.amount)}</td>
                  <td data-label="Method">{label(PAYMENT_METHODS, p.method)}</td>
                  <td data-label="Reference">{p.reference_no || <Blank />}</td>
                  <td data-label="Recorded by">{p.recorded_by_name || <Blank />}</td>
                  <td data-label="Reservation payment">
                    <StatusBadge kind="payment" value={p.payment_status} />
                  </td>
                  <td className="cell-actions no-print">
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      {isAdmin && (
                        <ConfirmButton
                          label="Delete"
                          danger
                          onConfirm={() => handleDelete(p.payment_id)}
                          busy={busyId === p.payment_id}
                          message="Delete this payment? The reservation's paid total will be recalculated."
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
