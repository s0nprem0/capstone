import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const NOTIFICATIONS = { to: '/notifications', label: 'Notifications', badge: true }

function roleNav(role) {
  if (role === 'user') {
    return [
      {
        heading: 'Cemetery',
        items: [
          { to: '/', label: 'Cemetery Map' },
          { to: '/visitor/reserve', label: 'Reserve a Lot' },
        ],
      },
      {
        heading: 'My Records',
        items: [
          { to: '/visitor/reservations', label: 'My Reservations' },
          { to: '/visitor/payments', label: 'My Payments' },
        ],
      },
      {
        heading: 'Account',
        items: [{ to: '/visitor/profile', label: 'Profile' }, NOTIFICATIONS],
      },
    ]
  }
  if (role === 'staff') {
    return [
      {
        heading: 'Overview',
        items: [
          { to: '/staff', label: 'Dashboard' },
          { to: '/', label: 'Cemetery Map' },
          NOTIFICATIONS,
        ],
      },
      {
        heading: 'Records',
        items: [
          { to: '/staff/reservations', label: 'Reservations' },
          { to: '/staff/payments', label: 'Payments' },
          { to: '/staff/burial-records', label: 'Burial Records' },
        ],
      },
      {
        heading: 'Administration',
        items: [
          { to: '/staff/users', label: 'Users' },
          { to: '/staff/reports', label: 'Reports' },
        ],
      },
    ]
  }
  if (role === 'admin') {
    return [
      {
        heading: 'Overview',
        items: [
          { to: '/admin', label: 'Dashboard' },
          { to: '/', label: 'Cemetery Map' },
          NOTIFICATIONS,
        ],
      },
      {
        heading: 'Records',
        items: [
          { to: '/admin/reservations', label: 'Reservations' },
          { to: '/admin/payments', label: 'Payments' },
          { to: '/admin/burial-records', label: 'Burial Records' },
        ],
      },
      {
        heading: 'Inventory',
        items: [
          { to: '/admin/sections', label: 'Sections' },
          { to: '/admin/lots', label: 'Lots' },
        ],
      },
      {
        heading: 'Administration',
        items: [
          { to: '/admin/users', label: 'Users' },
          { to: '/admin/reports', label: 'Reports' },
          { to: '/admin/settings', label: 'Settings' },
        ],
      },
    ]
  }
  return [{ heading: 'Cemetery', items: [{ to: '/', label: 'Cemetery Map' }] }]
}

// Sub-pages such as /admin/sections/editor have no nav entry of their own,
// so fall back to the deepest nav item they sit under.
function labelFor(items, pathname) {
  const under = items.filter(
    (item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`))
  )
  if (!under.length) return null
  return under.reduce((deepest, item) => (item.to.length > deepest.to.length ? item : deepest)).label
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const groups = roleNav(user?.role)
  const items = groups.flatMap((group) => group.items)
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
          {groups.map((group) => (
            <div className="nav-group" key={group.heading}>
              <p className="nav-heading">{group.heading}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                >
                  {item.label}
                  {item.badge && unreadCount > 0 && (
                    <span className="notif-badge">{unreadCount}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
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
          <span className="topbar-title">
            {labelFor(items, pathname) || 'St. John Memorial Garden & Parks'}
          </span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
