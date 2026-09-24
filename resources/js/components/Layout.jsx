import { Outlet, NavLink, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import { api } from '../lib/api'

function roleNav(role) {
  if (role === 'user') {
    return [
      { to: '/visitor/reserve', label: 'Reserve a Lot', end: true },
      { to: '/visitor/reservations', label: 'My Reservations', end: true },
      { to: '/visitor/payments', label: 'My Payments', end: true },
      { to: '/visitor/profile', label: 'Profile', end: true },
      { to: '/', label: 'Cemetery Map', end: true },
    ]
  }
  if (role === 'staff') {
    return [
      { to: '/staff', label: 'Dashboard', end: true },
      { to: '/staff/reservations', label: 'Reservations', end: true },
      { to: '/staff/payments', label: 'Payments', end: true },
      { to: '/staff/burial-records', label: 'Burial Records', end: true },
      { to: '/staff/users', label: 'Users', end: true },
      { to: '/staff/reports', label: 'Reports', end: true },
      { to: '/', label: 'Cemetery Map', end: true },
    ]
  }
  if (role === 'admin') {
    return [
      { to: '/admin', label: 'Dashboard', end: true },
      { to: '/admin/sections', label: 'Sections', end: true },
      { to: '/admin/reservations', label: 'Reservations', end: true },
      { to: '/admin/payments', label: 'Payments', end: true },
      { to: '/admin/burial-records', label: 'Burial Records', end: true },
      { to: '/admin/users', label: 'Users', end: true },
      { to: '/admin/reports', label: 'Reports', end: true },
      { to: '/admin/settings', label: 'Settings', end: true },
      { to: '/', label: 'Cemetery Map', end: true },
    ]
  }
  return [{ to: '/', label: 'Cemetery Map', end: true }]
}

export default function Layout() {
  const { user, logout } = useAuth()
  const items = roleNav(user?.role)
  const [unreadCount, setUnreadCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <h1 className="sidebar-title">St. John Memorial Garden &amp; Parks</h1>
        <nav onClick={closeSidebar}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
        <div className="topbar">
          <button
            type="button"
            className="btn btn-secondary topbar-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
          <span className="topbar-title">St. John Memorial Garden &amp; Parks</span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
