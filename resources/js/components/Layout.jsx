import { Outlet, NavLink, Link, useLocation, useNavigationType } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import Icon from './Icon'
import { ROLES, label } from '../lib/terms'

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
        items: [{ to: '/visitor/reservations', label: 'My Reservations' }],
      },
      {
        heading: 'Account',
        items: [{ to: '/visitor/profile', label: 'Account settings' }, NOTIFICATIONS],
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
  const navigationType = useNavigationType()
  const groups = roleNav(user?.role)
  const items = groups.flatMap((group) => group.items)
  const [unreadCount, setUnreadCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mainRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { ok, data } = await api('/api/notifications/unread-count')
      if (ok) setUnreadCount(data.unread_count)
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [user])

  const closeSidebar = () => setSidebarOpen(false)
  const pageTitle = labelFor(items, pathname) || 'St. John Memorial Garden & Parks'

  // A single-page app never re-titles the document or moves focus on its own,
  // so a screen-reader or keyboard user gets no signal that the view changed
  // and stays parked on the link they just activated. Set the title (WCAG
  // 2.4.2) and move focus to the content on a client-side navigation.
  // POP is the first paint and back/forward, where focus should stay at the top
  // of the document so the skip link is still the first Tab stop.
  useEffect(() => {
    document.title = `${pageTitle} · St. John Memorial Garden & Parks`
  }, [pageTitle])

  useEffect(() => {
    if (navigationType === 'POP') return
    mainRef.current?.focus()
  }, [pathname, navigationType])

  // Escape dismisses the off-canvas drawer without forcing a navigation.
  useEffect(() => {
    if (!sidebarOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  return (
    <div className="app-layout">
      <a href="#main" className="skip-link">Skip to content</a>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} aria-label="Site">
        <div className="sidebar-header">
          <h1 className="sidebar-title">St. John Memorial Garden &amp; Parks</h1>
          <button
            type="button"
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="Close navigation menu"
          >
            ×
          </button>
        </div>
        <nav onClick={closeSidebar} aria-label="Primary">
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
              <p className="sidebar-role">{label(ROLES, user.role)}</p>
              <button className="btn btn-ghost" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-ghost">Sign in</Link>
          )}
        </div>
      </aside>
      <main className="main-content" id="main" tabIndex={-1} ref={mainRef}>
        <div className="topbar">
          <button
            type="button"
            className="btn btn-secondary topbar-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" size={18} />
          </button>
          {/* The page's own heading names it; a title here only repeated it. */}
          <span className="topbar-title">St. John Memorial Garden &amp; Parks</span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
