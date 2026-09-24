import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth, RequireRole, GuestOnly } from './components/RouteGuards'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Reservations from './pages/Reservations'
import NewReservation from './pages/NewReservation'
import Payments from './pages/Payments'
import BurialRecords from './pages/BurialRecords'
import Notifications from './pages/Notifications'
import Reports from './pages/Reports'
import Cemetery from './pages/Cemetery'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Profile from './pages/Profile'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cemetery" element={<Cemetery />} />

          <Route element={<RequireAuth />}>
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/reservations/new" element={<NewReservation />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'staff']} />}>
            <Route path="/burial-records" element={<BurialRecords />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<Users />} />
          </Route>

          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
