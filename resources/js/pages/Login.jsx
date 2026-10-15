import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath } from '../lib/nav'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// A 5xx, or a dev server with no PHP behind it, answers with no JSON at all.
// Saying "Login failed" there sends people off re-typing a password that was
// never the problem.
const UNREACHABLE = "Can't reach the server. Check your connection and try again."

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const summaryRef = useRef(null)

  // Derived rather than stored, so correcting a field clears its message on
  // the next keystroke without a second code path to clear it.
  const errors = {}
  if (!email.trim()) errors.email = 'Email is required.'
  else if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Password is required.'

  const show = (name) => touched[name] && errors[name]
  const blur = (name) => setTouched((t) => ({ ...t, [name]: true }))

  // One assertive announcement per failed submit, not one per field. The
  // summary is focused so a keyboard or screen-reader user lands on it instead
  // of being left sitting on the button they just pressed.
  useEffect(() => {
    if (error) summaryRef.current?.focus()
  }, [error])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    const invalid = Object.keys(errors)
    if (invalid.length) {
      setTouched({ email: true, password: true })
      setError({ title: 'Check the highlighted fields', fields: invalid })
      return
    }

    setSubmitting(true)
    try {
      const res = await login(email, password)
      if (res.ok) {
        const from = location.state?.from
        const target = from ? `${from.pathname}${from.search || ''}` : homePath(res.data?.user?.role)
        navigate(target, { replace: true })
        return
      }
      setError({ title: res.data?.error || UNREACHABLE })
    } catch {
      // fetch itself rejects when the server is down or the device is offline,
      // which is a different problem from a rejected password.
      setError({ title: UNREACHABLE })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="auth-card" noValidate>
        <h2 className="auth-title">Sign in to your account</h2>

        {error && (
          <div className="alert alert--error auth-summary" role="alert" tabIndex={-1} ref={summaryRef}>
            <p className="auth-summary-title">{error.title}</p>
            {error.fields && (
              <ul className="auth-summary-list">
                {error.fields.map((name) => (
                  <li key={name}>
                    <a href={`#login-${name}`}>{errors[name]}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => blur('email')}
            aria-invalid={!!show('email')}
            aria-describedby={show('email') ? 'login-email-error' : undefined}
            autoComplete="email"
            required
          />
          {show('email') && (
            <span className="field-error" id="login-email-error">
              {errors.email}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => blur('password')}
            aria-invalid={!!show('password')}
            aria-describedby={show('password') ? 'login-password-error' : undefined}
            autoComplete="current-password"
            required
          />
          {show('password') && (
            <span className="field-error" id="login-password-error">
              {errors.password}
            </span>
          )}
        </div>

        {/* aria-disabled, not disabled: a disabled button drops focus to the
            body mid-submit, which strands a keyboard user at the top of the
            document and hides the "Signing in..." change. The handler's
            submitting guard is what actually blocks the double submit, and
            .btn[aria-disabled='true'] is already styled in app.css. */}
        <button type="submit" className="btn btn-primary btn-block" aria-disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="text-muted auth-links">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </AuthShell>
  )
}