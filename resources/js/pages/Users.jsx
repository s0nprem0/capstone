import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    fullname: '',
    email: '',
    phone: '',
    password: '',
    role: 'user',
    status: 'active',
  })

  const load = async () => {
    const { ok, data } = await api('/api/users')
    if (ok) setUsers(data)
    else setError(data?.error || 'Failed to load users')
  }

  useEffect(() => {
    load()
  }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const { ok, data } = await api('/api/users', { method: 'POST', body: form })
    if (ok) {
      setSuccess(`Created ${data.user.fullname}`)
      setForm({ fullname: '', email: '', phone: '', password: '', role: 'user', status: 'active' })
      load()
    } else {
      setError(data?.error || 'Failed to create user')
    }
  }

  const toggleStatus = async (u) => {
    const { ok, data } = await api(`/api/users/${u.user_id}`, {
      method: 'POST',
      body: { status: u.status === 'active' ? 'inactive' : 'active' },
    })
    if (ok) {
      setSuccess('User updated')
      load()
    } else {
      setError(data?.error || 'Failed to update user')
    }
  }

  const filtered = users.filter((u) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      u.fullname.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone && u.phone.includes(q)) ||
      u.role.toLowerCase().includes(q) ||
      u.status.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <h2>User Management</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      {me?.role === 'admin' && (
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
              <input type="password" name="password" value={form.password} onChange={handleChange} required />
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
            <button type="submit" className="btn btn-primary">Add User</button>
          </div>
        </form>
      )}

      <input
        type="text"
        className="search-input"
        placeholder="Search by name, email, phone, role, status..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '1rem' }}
      />

      <div className="table-container">
        <table className="table">
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
            {filtered.map((u) => (
              <tr key={u.user_id}>
                <td>{u.fullname}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td><span className={`badge badge--${u.role}`}>{u.role}</span></td>
                <td><span className={`badge badge--${u.status}`}>{u.status}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleStatus(u)}>
                    {u.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}