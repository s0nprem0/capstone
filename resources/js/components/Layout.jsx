import { Outlet, NavLink, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function roleNav(role) {
  const common = [
    { to: '/', label: 'Dashboard' },
    { to: '/cemetery', label: 'Cemetery Map' },
    { to: '/records', label: 'Records' },
  ]

  if (role === 'admin' || role === 'staff') {
    return [
      { to: '/', label: 'Dashboard' },
      { to: '/reservations', label: 'Reservations' },
      { to: '/cemetery', label: 'Cemetery Map' },
      { to: '/records', label: 'Records' },
      { to: '/users', label: 'Users' },
    ]
  }

  return common
}

export default function Layout() {
  const { user, logout } = useAuth()
  const items = roleNav(user?.role)

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
