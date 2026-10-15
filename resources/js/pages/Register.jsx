import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath } from '../lib/nav'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const UNREACHABLE = "Can't reach the server. Check your connection and try again."

const FIELDS = ['fullname', 'email', 'password', 'password_confirmation']

export default function Register() {
  const [form, setForm] = useState({
    fullname: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
  })
  const [error, setError] = useState(null)
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()
  const summaryRef = useRef(null)

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

  // A four-field form failing on submit would otherwise interrupt a screen
  // reader four times over. One summary, focused, carrying every problem.
  useEffect(() => {
    if (error) summaryRef.current?.focus()
  }, [error])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    const invalid = Object.keys(errors)
    if (invalid.length) {
      setTouched({ fullname: true, email: true, password: true, password_confirmation: true })
      setError({ title: 'Check the highlighted fields', fields: invalid })
      return
    }

    setSubmitting(true)
    try {
      const res = await register(form)
      if (res.ok) {
        navigate(homePath('user'), { replace: true })
        return
      }
      setError({ title: res.data?.error || UNREACHABLE })
    } catch {
      setError({ title: UNREACHABLE })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="auth-card" noValidate>
        <h2 className="auth-title">Create your account</h2>

        {error && (
          <div className="alert alert--error auth-summary" role="alert" tabIndex={-1} ref={summaryRef}>
            <p className="auth-summary-title">{error.title}</p>
            {error.fields && (
              <ul className="auth-summary-list">
                {error.fields.map((name) => (
                  <li key={name}>
                    <a href={`#register-${name}`}>{errors[name]}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="register-fullname">Full Name</label>
          <input
            id="register-fullname"
            name="fullname"
            value={form.fullname}
            onChange={handleChange}
            onBlur={() => blur('fullname')}
            aria-invalid={!!show('fullname')}
            aria-describedby={show('fullname') ? 'register-fullname-error' : undefined}
            autoComplete="name"
            required
          />
          {show('fullname') && (
            <span className="field-error" id="register-fullname-error">
              {errors.fullname}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            onBlur={() => blur('email')}
            aria-invalid={!!show('email')}
            aria-describedby={show('email') ? 'register-email-error' : undefined}
            autoComplete="email"
            required
          />
          {show('email') && (
            <span className="field-error" id="register-email-error">
              {errors.email}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="register-phone">Phone</label>
          <input
            id="register-phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            autoComplete="tel"
          />
        </div>

        <div className="field">
          <label htmlFor="register-password">Password</label>
          <PasswordInput
            id="register-password"
            name="password"
            value={form.password}
            onChange={handleChange}
            onBlur={() => blur('password')}
            aria-invalid={!!show('password')}
            aria-describedby={`register-password-hint${show('password') ? ' register-password-error' : ''}`}
            minLength={8}
            autoComplete="new-password"
            required
          />
          {/* The requirement stays put when the field goes wrong -- at 7
              characters it is still the reason it is wrong. */}
          <span className="label-hint" id="register-password-hint">
            At least 8 characters.
          </span>
          {show('password') && (
            <span className="field-error" id="register-password-error">
              {errors.password}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="register-password_confirmation">Confirm Password</label>
          <PasswordInput
            id="register-password_confirmation"
            name="password_confirmation"
            value={form.password_confirmation}
            onChange={handleChange}
            onBlur={() => blur('password_confirmation')}
            aria-invalid={!!show('password_confirmation')}
            aria-describedby={show('password_confirmation') ? 'register-password_confirmation-error' : undefined}
            autoComplete="new-password"
            required
          />
          {show('password_confirmation') && (
            <span className="field-error" id="register-password_confirmation-error">
              {errors.password_confirmation}
            </span>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block" aria-disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-muted auth-links">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  )
}