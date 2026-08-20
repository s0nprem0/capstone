import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="text-muted">Loading...</p>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return <Outlet />
}

export function RequireRole({ roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="text-muted">Loading...</p>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />

  return <Outlet />
}

export function GuestOnly() {
  const { user, loading } = useAuth()

  if (loading) return <p className="text-muted">Loading...</p>
  if (user) return <Navigate to="/" replace />

  return <Outlet />
}
