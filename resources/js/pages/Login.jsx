import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath } from '../lib/nav'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Derived rather than stored, so correcting a field clears its message on
  // the next keystroke without a second code path to clear it.
  const errors = {}
  if (!email.trim()) errors.email = 'Email is required.'
  else if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Password is required.'

  const show = (name) => touched[name] && errors[name]
  const blur = (name) => setTouched((t) => ({ ...t, [name]: true }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setTouched({ email: true, password: true })
    if (errors.email || errors.password) return
    setSubmitting(true)

    const res = await login(email, password)
    setSubmitting(false)

    if (res.ok) {
      const from = location.state?.from
      const target = from ? `${from.pathname}${from.search || ''}` : homePath(res.data?.user?.role)
      navigate(target, { replace: true })
    } else {
      setError(res.data?.error || 'Login failed')
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-card" noValidate>
        <h2>Sign In</h2>
        {error && <p className="alert alert--error">{error}</p>}
        <div className="field">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => blur('password')}
              aria-invalid={!!show('password')}
              autoComplete="current-password"
              required
            />
          </label>
          {show('password') && <span className="field-error" role="alert">{errors.password}</span>}
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
        <p className="text-muted auth-links">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  )
}
