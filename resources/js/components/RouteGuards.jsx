import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath } from '../lib/nav'
import Loading from './Loading'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return <Outlet />
}

export function RequireRole({ roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />

  return <Outlet />
}

export function GuestOnly() {
  const { user, loading } = useAuth()

  if (loading) return <Loading />
  if (user) return <Navigate to={homePath(user.role)} replace />

  return <Outlet />
}
