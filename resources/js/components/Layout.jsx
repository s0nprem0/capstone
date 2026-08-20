import { Outlet, NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/reservations', label: 'Reservations' },
  { to: '/cemetery', label: 'Cemetery Map' },
  { to: '/records', label: 'Records' },
]

export default function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1 className="sidebar-title">Cemetery System</h1>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
