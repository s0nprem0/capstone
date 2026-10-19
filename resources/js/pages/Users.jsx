import { useState } from 'react'
import { api } from '../lib/api'
import useList from '../lib/useList'
import useDebounced from '../lib/useDebounced'
import { useAuth } from '../context/AuthContext'
import ConfirmButton from '../components/ConfirmButton'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import Notice, { useNotice } from '../components/Notice'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { ACCOUNT_STATUS, ROLES } from '../lib/terms'

const EMPTY_FORM = { fullname: '', email: '', phone: '', password: '', role: 'user', status: 'active' }

export default function Users() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [savingAdd, setSavingAdd] = useState(false)

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ fullname: '', email: '', phone: '', role: '', status: '', password: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const isAdmin = me?.role === 'admin'
  const q = useDebounced(search)

  const { items: users, loaded, error, reload } = useList('/api/users', { q, role, status }, 'Failed to load users')
  const { notice, succeed, fail, clear } = useNotice()

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    clear()
    setSavingAdd(true)
    const { ok, data } = await api('/api/users', { method: 'POST', body: form })
    setSavingAdd(false)
    if (ok) {
      succeed(`Created ${data.user.fullname}.`)
      setForm(EMPTY_FORM)
      setAdding(false)
      reload()
    } else {
      fail(data?.error || 'Failed to create user')
    }
  }

  const openAdd = () => {
    clear()
    setEditing(null)
    setForm(EMPTY_FORM)
    setAdding(true)
  }

  const openEdit = (u) => {
    setAdding(false)
    setEditing(u)
    setEditForm({ ...u, password: '' })
    clear()
  }

  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value })

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editing) return
    clear()
    setSavingEdit(true)
    const body = { ...editForm }
    delete body.user_id
    delete body.created_at
    delete body.password_confirmation
    const { ok, data } = await api(`/api/users/${editing.user_id}`, { method: 'POST', body })
    setSavingEdit(false)
    if (ok) {
      succeed(`Updated ${data.user.fullname}.`)
      setEditing(null)
      reload()
    } else {
      fail(data?.error || 'Failed to update user')
    }
  }

  const handleDelete = async (u) => {
    clear()
    setBusyId(u.user_id)
    const { ok, data } = await api(`/api/users/${u.user_id}/delete`, { method: 'POST' })
    setBusyId(null)
    if (ok) {
      succeed(`Deleted ${u.fullname}.`)
      reload()
    } else {
      fail(data?.error || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader title="Users">
        {isAdmin && !adding && !editing && <button className="btn btn-primary" onClick={openAdd}>Add User</button>}
      </PageHeader>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      <Notice notice={notice} />

      {isAdmin && adding && (
        <form onSubmit={handleSubmit} className="form-card section-block">
          <h3>Add User</h3>
          <div className="form-grid">
            <label>
              Full Name
              <input name="fullname" value={form.fullname} onChange={handleChange} required />
            </label>
            <label>
              Email
              <input type="email" name="email" value={form.email} onChange={handleChange} required />
            </label>
            <label>
              Phone
              <input name="phone" value={form.phone} onChange={handleChange} />
            </label>
            <label>
              Password
              <input type="password" name="password" value={form.password} onChange={handleChange} required minLength="8" />
            </label>
            <label>
              Role
              <select name="role" value={form.role} onChange={handleChange}>
                {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>
              Status
              <select name="status" value={form.status} onChange={handleChange}>
                {Object.entries(ACCOUNT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingAdd}>
              {savingAdd ? 'Adding...' : 'Add User'}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <form onSubmit={handleEditSubmit} className="form-card section-block">
          <h3>Edit User — {editing.fullname}</h3>
          <div className="form-grid">
            <label>
              Full Name
              <input name="fullname" value={editForm.fullname} onChange={handleEditChange} required />
            </label>
            <label>
              Email
              <input type="email" name="email" value={editForm.email} onChange={handleEditChange} required />
            </label>
            <label>
              Phone
              <input name="phone" value={editForm.phone} onChange={handleEditChange} />
            </label>
            {isAdmin && (
              <label>
                Role
                <select
                  name="role"
                  value={editForm.role}
                  onChange={handleEditChange}
                  disabled={editing.user_id === me.user_id}
                >
                  {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            )}
            <label>
              Status
              <select
                name="status"
                value={editForm.status}
                onChange={handleEditChange}
                disabled={editing.user_id === me.user_id}
              >
                {Object.entries(ACCOUNT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <small className="label-hint">An inactive account cannot sign in.</small>
            </label>
            <label>
              New Password
              <input
                type="password"
                name="password"
                value={editForm.password}
                onChange={handleEditChange}
                minLength="8"
                placeholder="Leave blank to keep current"
              />
            </label>
          </div>
          {editing.user_id === me.user_id && (
            <p className="text-muted">You cannot change your own status or role.</p>
          )}
          {!isAdmin && editing.role === 'admin' && (
            <p className="text-muted">Admin accounts can only be managed by an administrator.</p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by name, email, phone, role, status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(ACCOUNT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {!loaded && !error ? (
        <Loading message="Loading accounts..." />
      ) : loaded && !error && users.length === 0 ? (
        <EmptyState
          noun="accounts"
          filtered={Boolean(q || role || status)}
          onClear={() => { setSearch(''); setRole(''); setStatus('') }}
        />
      ) : (
        <div className="table-container section-block">
          <table className="table">
            <caption className="visually-hidden">User accounts</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
              <tr key={u.user_id}>
                <td>{u.fullname}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td><StatusBadge kind="role" value={u.role} /></td>
                <td><StatusBadge kind="account" value={u.status} /></td>
                <td>
                  <div className="table-actions">
                    {(isAdmin || u.role !== 'admin') && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                    )}
                    {isAdmin && u.user_id !== me.user_id && (
                      <ConfirmButton
                        label="Delete"
                        danger
                        onConfirm={() => handleDelete(u)}
                        busy={busyId === u.user_id}
                        message={`Delete ${u.fullname}? This cannot be undone.`}
                      />
                    )}
                  </div>
                </td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}