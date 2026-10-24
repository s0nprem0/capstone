import { Outlet, NavLink, Link, useLocation, useNavigationType } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect, useRef, useCallback } from 'react'
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
        items: [
          { to: '/visitor/reservations', label: 'My Reservations' },
          { to: '/visitor/payments', label: 'My Payments' },
        ],
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
  const { pathname, state } = useLocation()
  const navigationType = useNavigationType()
  const groups = roleNav(user?.role)
  const items = groups.flatMap((group) => group.items)
  const [unreadCount, setUnreadCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mainRef = useRef(null)
  const sidebarRef = useRef(null)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const restoreFocusRef = useRef(true)

  // A hidden tab has no one looking at the badge; polling it every 30 seconds
  // only spends battery and requests. Refresh once when it becomes visible.
  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    const load = async () => {
      const { ok, data } = await api('/api/notifications/unread-count')
      if (!cancelled && ok) setUnreadCount(data.unread_count)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    load()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 30000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user])

  const closeSidebar = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus
    setSidebarOpen(false)
  }, [])

  const openSidebar = () => {
    restoreFocusRef.current = true
    setSidebarOpen(true)
  }

  const pageLabel = labelFor(items, pathname)

  // A single-page app never re-titles the document or moves focus on its own,
  // so a screen-reader or keyboard user gets no signal that the view changed
  // and stays parked on the link they just activated. Set the title (WCAG
  // 2.4.2) and move focus to the content on a client-side navigation.
  // POP is the first paint and back/forward, where focus should stay at the top
  // of the document so the skip link is still the first Tab stop.
  useEffect(() => {
    document.title = pageLabel ? `${pageLabel} · St. John Memorial Garden & Parks` : 'St. John Memorial Garden & Parks'
  }, [pageLabel])

  useEffect(() => {
    if (navigationType === 'POP') return
    mainRef.current?.focus()
  }, [pathname, navigationType])

  // The off-canvas drawer covers the page, so while it is open focus belongs
  // inside it: move it to the close control, keep Tab from wandering into the
  // covered content, and put it back on the menu button when it closes.
  useEffect(() => {
    if (!sidebarOpen) return undefined
    const previous = document.activeElement
    closeButtonRef.current?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSidebar()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = sidebarRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (restoreFocusRef.current) previous?.focus?.()
    }
  }, [sidebarOpen, closeSidebar])

  return (
    <div className="app-layout">
      <a href="#main" className="skip-link">Skip to content</a>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => closeSidebar()} aria-hidden="true" />}
      <aside
        ref={sidebarRef}
        id="site-navigation"
        className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}
        aria-label="Site navigation"
        {...(sidebarOpen ? { role: 'dialog', 'aria-modal': 'true' } : {})}
      >
        <div className="sidebar-header">
          <h1 className="sidebar-title">St. John Memorial Garden &amp; Parks</h1>
          <button
            type="button"
            ref={closeButtonRef}
            className="sidebar-close"
            onClick={() => closeSidebar()}
            aria-label="Close navigation menu"
          >
            ×
          </button>
        </div>
        <nav
          onClick={(e) => {
            if (e.target.closest('a')) closeSidebar(false)
          }}
          aria-label="Primary"
        >
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
            ref={menuButtonRef}
            className="btn btn-secondary topbar-menu"
            onClick={openSidebar}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="site-navigation"
          >
            <Icon name="menu" size={18} />
          </button>
          {/* The page's own heading names it; a title here only repeated it. */}
          <span className="topbar-title">St. John Memorial Garden &amp; Parks</span>
        </div>
        {state?.denied && (
          <p className="alert alert--error" role="alert">
            That page is not available to your account, so you were brought to your own home page instead.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  )
}
