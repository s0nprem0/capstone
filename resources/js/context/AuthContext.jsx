import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    const { ok, data } = await api('/api/auth/me')
    setUser(ok && data.user ? data.user : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadUser()
    const onUnauthorized = () => setUser(null)
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [loadUser])

  const login = async (email, password) => {
    const res = await api('/api/auth/login', { method: 'POST', body: { email, password } })
    if (res.ok) setUser(res.data.user)
    return res
  }

  const register = async (payload) => {
    const res = await api('/api/auth/register', { method: 'POST', body: payload })
    if (res.ok) setUser(res.data.user)
    return res
  }

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loadUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
