import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath } from '../lib/nav'

export default function Register() {
  const [form, setForm] = useState({
    fullname: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
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
      <form onSubmit={handleSubmit} className="auth-card">
        <h2>Create Account</h2>
        {error && <p className="alert alert--error">{error}</p>}
        <label>
          Full Name
          <input name="fullname" value={form.fullname} onChange={handleChange} autoComplete="name" required />
        </label>
        <label>
          Email
          <input type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email" required />
        </label>
        <label>
          Phone
          <input name="phone" value={form.phone} onChange={handleChange} autoComplete="tel" />
        </label>
        <label>
          Password
          <input type="password" name="password" value={form.password} onChange={handleChange} minLength={8} autoComplete="new-password" required />
          <small className="text-muted">At least 8 characters.</small>
        </label>
        <label>
          Confirm Password
          <input type="password" name="password_confirmation" value={form.password_confirmation} onChange={handleChange} autoComplete="new-password" required />
        </label>
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
