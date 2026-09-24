import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user, loadUser } = useAuth()
  const [form, setForm] = useState({ fullname: '', email: '', phone: '' })
  const [pwd, setPwd] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setForm({
        fullname: user.fullname || '',
        email: user.email || '',
        phone: user.phone || '',
      })
    }
  }, [user])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const handlePwdChange = (e) => setPwd({ ...pwd, [e.target.name]: e.target.value })

  const saveInfo = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    const { ok, data } = await api(`/api/users/${user.user_id}`, { method: 'POST', body: form })
    setSaving(false)
    if (ok) {
      setSuccess('Registration info updated.')
      await loadUser()
    } else {
      setError(data?.error || 'Failed to update profile')
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (pwd.password !== pwd.password_confirmation) {
      setError('New password and confirmation do not match.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    const { ok, data } = await api(`/api/users/${user.user_id}`, {
      method: 'POST',
      body: { current_password: pwd.current_password, password: pwd.password },
    })
    setSaving(false)
    if (ok) {
      setSuccess('Password changed.')
      setPwd({ current_password: '', password: '', password_confirmation: '' })
    } else {
      setError(data?.error || 'Failed to change password')
    }
  }

  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'

  return (
    <div>
      <div className="page-header">
        <h2>My Profile</h2>
      </div>

      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      <div className="form-card section-block">
        <h3>Registration Info</h3>
        <form onSubmit={saveInfo}>
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
          </div>
          <p className="text-muted">
            Role: <span className={`badge badge--${user?.role}`}>{user?.role}</span> — Status:{' '}
            <span className={`badge badge--${user?.status}`}>{user?.status}</span> — Member since {memberSince}
          </p>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="form-card section-block">
        <h3>Change Password</h3>
        <form onSubmit={changePassword}>
          <div className="form-grid">
            <label>
              Current Password
              <input
                type="password"
                name="current_password"
                value={pwd.current_password}
                onChange={handlePwdChange}
                required
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                name="password"
                value={pwd.password}
                onChange={handlePwdChange}
                required
                minLength="8"
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                name="password_confirmation"
                value={pwd.password_confirmation}
                onChange={handlePwdChange}
                required
                minLength="8"
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}