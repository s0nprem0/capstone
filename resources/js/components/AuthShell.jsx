import { Link } from 'react-router-dom'

// Login and Register sit outside <Layout> -- a signed-out visitor should not be
// handed the role-aware sidebar -- so they carry their own shell. It supplies
// what <Layout> would otherwise supply: the only <h1> on the page, a <main>
// landmark, and a way back to the public map for anyone who followed a
// protected link here and found they were not signed in.
export default function AuthShell({ children }) {
  return (
    <main className="auth-page">
      <div className="auth-inner">
        <header className="auth-brand">
          <h1 className="auth-wordmark">St. John Memorial Garden &amp; Parks</h1>
          <p className="auth-tagline">Cemetery Reservation &amp; Records</p>
          <Link to="/" className="auth-back">
            Back to cemetery map
          </Link>
        </header>
        {children}
      </div>
    </main>
  )
}