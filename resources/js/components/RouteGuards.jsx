import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath } from '../lib/nav'
import Loading from './Loading'

// `roles` is optional: omitted, this is the signed-in check on its own. Keeping
// one guard rather than two identical ones means the redirect back to /login
// carries `state.from` in one place, which is what makes a protected page send
// you to your destination after signing in.
export function RequireRole({ roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />

  return <Outlet />
}

export function RequireAuth() {
  return <RequireRole />
}

export function GuestOnly() {
  const { user, loading } = useAuth()

  if (loading) return <Loading />
  if (user) return <Navigate to={homePath(user.role)} replace />

  return <Outlet />
}
