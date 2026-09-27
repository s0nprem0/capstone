import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath } from '../lib/nav'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const [form, setForm] = useState({
    fullname: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
  })
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const blur = (name) => setTouched((t) => ({ ...t, [name]: true }))

  // Derived from the current values, so a corrected field stops reporting as
  // soon as it is correct.
  const errors = {}
  if (!form.fullname.trim()) errors.fullname = 'Full name is required.'
  if (!form.email.trim()) errors.email = 'Email is required.'
  else if (!EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email address.'
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (!form.password_confirmation) errors.password_confirmation = 'Confirm your password.'
  else if (form.password_confirmation !== form.password) errors.password_confirmation = 'Passwords do not match.'

  const show = (name) => touched[name] && errors[name]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setTouched({
      fullname: true,
      email: true,
      password: true,
      password_confirmation: true,
    })
    if (Object.keys(errors).length) return
    setSubmitting(true)

    const res = await register(form)
    setSubmitting(false)

    if (res.ok) {
      navigate(homePath('user'), { replace: true })
    } else {
      setError(res.data?.error || 'Registration failed')
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-card" noValidate>
        <h2>Create Account</h2>
        {error && <p className="alert alert--error">{error}</p>}
        <div className="field">
          <label>
            Full Name
            <input
              name="fullname"
              value={form.fullname}
              onChange={handleChange}
              onBlur={() => blur('fullname')}
              aria-invalid={!!show('fullname')}
              autoComplete="name"
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
              autoComplete="email"
              required
            />
          </label>
          {show('email') && <span className="field-error" role="alert">{errors.email}</span>}
        </div>
        <div className="field">
          <label>
            Phone
            <input name="phone" value={form.phone} onChange={handleChange} autoComplete="tel" />
          </label>
        </div>
        <div className="field">
          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
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
            Confirm Password
            <input
              type="password"
              name="password_confirmation"
              value={form.password_confirmation}
              onChange={handleChange}
              onBlur={() => blur('password_confirmation')}
              aria-invalid={!!show('password_confirmation')}
              autoComplete="new-password"
              required
            />
          </label>
          {show('password_confirmation') && (
            <span className="field-error" role="alert">{errors.password_confirmation}</span>
          )}
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating...' : 'Register'}
        </button>
        <p className="text-muted auth-links">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
