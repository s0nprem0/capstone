import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Profile() {
  const { user, loadUser } = useAuth()
  const [form, setForm] = useState({ fullname: '', email: '', phone: '' })
  const [pwd, setPwd] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [touched, setTouched] = useState({})
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
  const blur = (name) => setTouched((t) => ({ ...t, [name]: true }))

  // Derived from both forms' current values; `touched` decides which are shown.
  const errors = {}
  if (!form.fullname.trim()) errors.fullname = 'Full name is required.'
  if (!form.email.trim()) errors.email = 'Email is required.'
  else if (!EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email address.'
  if (!pwd.current_password) errors.current_password = 'Enter your current password.'
  if (pwd.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (!pwd.password_confirmation) errors.password_confirmation = 'Confirm the new password.'
  else if (pwd.password_confirmation !== pwd.password) errors.password_confirmation = 'Passwords do not match.'

  const show = (name) => touched[name] && errors[name]

  const saveInfo = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setTouched((t) => ({ ...t, fullname: true, email: true }))
    if (errors.fullname || errors.email) return
    setSaving(true)

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
    setError('')
    setSuccess('')
    setTouched((t) => ({
      ...t,
      current_password: true,
      password: true,
      password_confirmation: true,
    }))
    if (errors.current_password || errors.password || errors.password_confirmation) return
    setSaving(true)

    const { ok, data } = await api(`/api/users/${user.user_id}`, {
      method: 'POST',
      body: { current_password: pwd.current_password, password: pwd.password },
    })
    setSaving(false)
    if (ok) {
      setSuccess('Password changed.')
      setPwd({ current_password: '', password: '', password_confirmation: '' })
      setTouched({})
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
        <form onSubmit={saveInfo} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>
                Full Name
                <input
                  name="fullname"
                  value={form.fullname}
                  onChange={handleChange}
                  onBlur={() => blur('fullname')}
                  aria-invalid={!!show('fullname')}
                  required
                />
              </label>
              {show('fullname') && <span className="field-error" role="alert">{errors.fullname}</span>}
            </div>
            <div className="field">
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  onBlur={() => blur('email')}
                  aria-invalid={!!show('email')}
                  required
                />
              </label>
              {show('email') && <span className="field-error" role="alert">{errors.email}</span>}
            </div>
            <div className="field">
              <label>
                Phone
                <input name="phone" value={form.phone} onChange={handleChange} />
              </label>
            </div>
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
        <form onSubmit={changePassword} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>
                Current Password
                <input
                  type="password"
                  name="current_password"
                  value={pwd.current_password}
                  onChange={handlePwdChange}
                  onBlur={() => blur('current_password')}
                  aria-invalid={!!show('current_password')}
                  required
                />
              </label>
              {show('current_password') && (
                <span className="field-error" role="alert">{errors.current_password}</span>
              )}
            </div>
            <div className="field">
              <label>
                New Password
                <input
                  type="password"
                  name="password"
                  value={pwd.password}
                  onChange={handlePwdChange}
                  onBlur={() => blur('password')}
                  aria-invalid={!!show('password')}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              {show('password') ? (
                <span className="field-error" role="alert">{errors.password}</span>
              ) : (
                <span className="label-hint">At least 8 characters.</span>
              )}
            </div>
            <div className="field">
              <label>
                Confirm New Password
                <input
                  type="password"
                  name="password_confirmation"
                  value={pwd.password_confirmation}
                  onChange={handlePwdChange}
                  onBlur={() => blur('password_confirmation')}
                  aria-invalid={!!show('password_confirmation')}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              {show('password_confirmation') && (
                <span className="field-error" role="alert">{errors.password_confirmation}</span>
              )}
            </div>
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
