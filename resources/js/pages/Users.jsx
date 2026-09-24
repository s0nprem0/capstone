import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import ConfirmButton from '../components/ConfirmButton'

const EMPTY_FORM = { fullname: '', email: '', phone: '', password: '', role: 'user', status: 'active' }

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [savingAdd, setSavingAdd] = useState(false)

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ fullname: '', email: '', phone: '', role: '', status: '', password: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const isAdmin = me?.role === 'admin'

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const load = async () => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (role) params.set('role', role)
    if (status) params.set('status', status)
    const qs = params.toString()
    const path = qs ? `/api/users?${qs}` : '/api/users'
    const { ok, data } = await api(path)
    if (ok) setUsers(data)
    else setError(data?.error || 'Failed to load users')
  }

  useEffect(() => {
    load()
  }, [q, role, status])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSavingAdd(true)
    const { ok, data } = await api('/api/users', { method: 'POST', body: form })
    setSavingAdd(false)
    if (ok) {
      setSuccess(`Created ${data.user.fullname}`)
      setForm(EMPTY_FORM)
      load()
    } else {
      setError(data?.error || 'Failed to create user')
    }
  }

  const openEdit = (u) => {
    setEditing(u)
    setEditForm({ ...u, password: '' })
    setError('')
    setSuccess('')
  }

  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value })

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editing) return
    setError('')
    setSuccess('')
    setSavingEdit(true)
    const body = { ...editForm }
    delete body.user_id
    delete body.created_at
    delete body.password_confirmation
    const { ok, data } = await api(`/api/users/${editing.user_id}`, { method: 'POST', body })
    setSavingEdit(false)
    if (ok) {
      setSuccess(`Updated ${data.user.fullname}`)
      setEditing(null)
      load()
    } else {
      setError(data?.error || 'Failed to update user')
    }
  }

  const toggleStatus = async (u) => {
    setBusyId(u.user_id)
    const { ok, data } = await api(`/api/users/${u.user_id}`, {
      method: 'POST',
      body: { status: u.status === 'active' ? 'inactive' : 'active' },
    })
    setBusyId(null)
    if (ok) {
      setSuccess('User updated')
      load()
    } else {
      setError(data?.error || 'Failed to update user')
    }
  }

  const handleDelete = async (u) => {
    setBusyId(u.user_id)
    const { ok, data } = await api(`/api/users/${u.user_id}/delete`, { method: 'POST' })
    setBusyId(null)
    if (ok) {
      setSuccess(`Deleted ${u.fullname}`)
      load()
    } else {
      setError(data?.error || 'Delete failed')
    }
  }

  return (
    <div>
      <h2>User Management</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      {isAdmin && (
        <form onSubmit={handleSubmit} className="form-card form-card--compact">
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
                <option value="user">Visitor/Client</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label>
              Status
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
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
                  <option value="user">Visitor/Client</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
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
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
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
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="user">Visitor/Client</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">No users found.</td>
              </tr>
            ) : (
              users.map((u) => (
              <tr key={u.user_id}>
                <td>{u.fullname}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td><span className={`badge badge--${u.role}`}>{u.role}</span></td>
                <td><span className={`badge badge--${u.status}`}>{u.status}</span></td>
                <td>
                  <div className="table-actions">
                    {(isAdmin || u.role !== 'admin') && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                    )}
                    {u.user_id !== me.user_id &&
                      (u.status === 'active' ? (
                        <ConfirmButton
                          label="Deactivate"
                          danger
                          onConfirm={() => toggleStatus(u)}
                          busy={busyId === u.user_id}
                          message="Deactivate this account? They will no longer be able to sign in."
                        />
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === u.user_id}
                          onClick={() => toggleStatus(u)}
                        >
                          {busyId === u.user_id ? 'Working...' : 'Activate'}
                        </button>
                      ))}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}