import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import PasswordInput from '../components/PasswordInput'
import Notice, { useNotice } from '../components/Notice'
import { longDate } from '../lib/terms'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMPTY_PWD = { current_password: '', password: '', password_confirmation: '' }

export default function Profile() {
  const { user, loadUser } = useAuth()
  const [form, setForm] = useState({ fullname: '', email: '', phone: '' })
  const [pwd, setPwd] = useState(EMPTY_PWD)
  const [touched, setTouched] = useState({})
  // Each form has its own outcome and busy state: saving one used to lock the
  // other, and reported at the top of the page, away from both.
  const info = useNotice()
  const pass = useNotice()
  const [savingInfo, setSavingInfo] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)

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
    info.clear()
    setTouched((t) => ({ ...t, fullname: true, email: true }))
    if (errors.fullname || errors.email) return
    setSavingInfo(true)
    const { ok, data } = await api(`/api/users/${user.user_id}`, { method: 'POST', body: form })
    setSavingInfo(false)
    if (ok) {
      info.succeed('Registration info updated.')
      await loadUser()
    } else {
      info.fail(data?.error || 'Failed to update profile')
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    pass.clear()
    setTouched((t) => ({
      ...t,
      current_password: true,
      password: true,
      password_confirmation: true,
    }))
    if (errors.current_password || errors.password || errors.password_confirmation) return
    setSavingPwd(true)
    const { ok, data } = await api(`/api/users/${user.user_id}`, {
      method: 'POST',
      body: { current_password: pwd.current_password, password: pwd.password },
    })
    setSavingPwd(false)
    if (ok) {
      pass.succeed('Password changed.')
      setPwd(EMPTY_PWD)
      setTouched({})
    } else {
      pass.fail(data?.error || 'Failed to change password')
    }
  }

  return (
    <div className="settings-page">
      <PageHeader title="Account settings" />
      <p className="text-muted settings-intro">
        Signed in as {user?.email}. Member since {longDate(user?.created_at)}.
      </p>

      {/* One section per concern: what it is on the left, the fields in a
          single narrow column on the right, the button right under them. */}
      <section className="settings-section" aria-labelledby="settings-info-heading">
        <div className="settings-section-intro">
          <h3 id="settings-info-heading">Registration info</h3>
          <p className="text-muted">The name and contact details the cemetery office uses for your reservations.</p>
        </div>
        <form className="form-card settings-card" onSubmit={saveInfo} noValidate>
          <Notice notice={info.notice} />
          <div className="field">
            <label htmlFor="profile-fullname">Full name</label>
            <input
              id="profile-fullname"
              name="fullname"
              value={form.fullname}
              onChange={handleChange}
              onBlur={() => blur('fullname')}
              aria-invalid={!!show('fullname')}
              aria-describedby={show('fullname') ? 'profile-fullname-error' : undefined}
              autoComplete="name"
              required
            />
            {show('fullname') && (
              <span className="field-error" id="profile-fullname-error" role="alert">{errors.fullname}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              onBlur={() => blur('email')}
              aria-invalid={!!show('email')}
              aria-describedby={show('email') ? 'profile-email-error' : undefined}
              autoComplete="email"
              required
            />
            {show('email') && (
              <span className="field-error" id="profile-email-error" role="alert">{errors.email}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="profile-phone">Phone</label>
            <input
              id="profile-phone"
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              autoComplete="tel"
              aria-describedby="profile-phone-hint"
            />
            <span className="label-hint" id="profile-phone-hint">Optional. The office calls this number about your reservation.</span>
          </div>
          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={savingInfo}>
              {savingInfo ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section" aria-labelledby="settings-password-heading">
        <div className="settings-section-intro">
          <h3 id="settings-password-heading">Password</h3>
          <p className="text-muted">Enter your current password, then the new one twice.</p>
        </div>
        <form className="form-card settings-card" onSubmit={changePassword} noValidate>
          <Notice notice={pass.notice} />
          <div className="field">
            <label htmlFor="profile-current-password">Current password</label>
            <PasswordInput
              id="profile-current-password"
              name="current_password"
              value={pwd.current_password}
              onChange={handlePwdChange}
              onBlur={() => blur('current_password')}
              aria-invalid={!!show('current_password')}
              aria-describedby={show('current_password') ? 'profile-current-password-error' : undefined}
              autoComplete="current-password"
              required
            />
            {show('current_password') && (
              <span className="field-error" id="profile-current-password-error" role="alert">
                {errors.current_password}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="profile-new-password">New password</label>
            <PasswordInput
              id="profile-new-password"
              name="password"
              value={pwd.password}
              onChange={handlePwdChange}
              onBlur={() => blur('password')}
              aria-invalid={!!show('password')}
              aria-describedby={show('password') ? 'profile-new-password-error' : 'profile-new-password-hint'}
              minLength={8}
              autoComplete="new-password"
              required
            />
            {show('password') ? (
              <span className="field-error" id="profile-new-password-error" role="alert">{errors.password}</span>
            ) : (
              <span className="label-hint" id="profile-new-password-hint">At least 8 characters.</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="profile-confirm-password">Confirm new password</label>
            <PasswordInput
              id="profile-confirm-password"
              name="password_confirmation"
              value={pwd.password_confirmation}
              onChange={handlePwdChange}
              onBlur={() => blur('password_confirmation')}
              aria-invalid={!!show('password_confirmation')}
              aria-describedby={show('password_confirmation') ? 'profile-confirm-password-error' : undefined}
              minLength={8}
              autoComplete="new-password"
              required
            />
            {show('password_confirmation') && (
              <span className="field-error" id="profile-confirm-password-error" role="alert">
                {errors.password_confirmation}
              </span>
            )}
          </div>
          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={savingPwd}>
              {savingPwd ? 'Saving...' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
