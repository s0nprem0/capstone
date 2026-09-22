import { Outlet, NavLink, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import { api } from '../lib/api'

function roleNav(role) {
  if (role === 'admin' || role === 'staff') {
    const items = [
      { to: '/', label: 'Dashboard' },
      { to: '/reservations', label: 'Reservations' },
      { to: '/cemetery', label: 'Cemetery Map' },
      { to: '/payments', label: 'Payments' },
      { to: '/burial-records', label: 'Burial Records' },
      { to: '/reports', label: 'Reports' },
      { to: '/users', label: 'Users' },
    ]
    if (role === 'admin') {
      items.splice(3, 0, { to: '/sections', label: 'Sections' }, { to: '/admin/lots', label: 'Lots' })
    }
    return items
  }

  return [
    { to: '/', label: 'Dashboard' },
    { to: '/cemetery', label: 'Cemetery Map' },
    { to: '/reservations', label: 'My Reservations' },
    { to: '/payments', label: 'Payments' },
  ]
}

export default function Layout() {
  const { user, logout } = useAuth()
  const items = roleNav(user?.role)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { ok, data } = await api('/api/notifications')
      if (ok) setUnreadCount(data.unread_count)
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [user])

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1 className="sidebar-title">Cemetery System</h1>
        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
          {user && (
            <NavLink
              to="/notifications"
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
            >
              Notifications
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          {user ? (
            <>
              <p className="sidebar-user">{user.fullname}</p>
              <p className="sidebar-role">{user.role}</p>
              <button className="btn btn-ghost" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-ghost">Sign In</Link>
          )}
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
