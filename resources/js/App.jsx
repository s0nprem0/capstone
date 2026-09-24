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
          <Route path="/" element={<Cemetery />} />

          <Route element={<RequireAuth />}>
            <Route path="/notifications" element={<Notifications />} />

            <Route element={<RequireRole roles={['user']} />}>
              <Route path="/visitor/reserve" element={<NewReservation />} />
              <Route path="/visitor/reservations" element={<Reservations />} />
              <Route path="/visitor/payments" element={<Payments />} />
              <Route path="/visitor/profile" element={<Profile />} />
            </Route>

            <Route element={<RequireRole roles={['staff']} />}>
              <Route path="/staff" element={<Dashboard />} />
              <Route path="/staff/reservations" element={<Reservations />} />
              <Route path="/staff/payments" element={<Payments />} />
              <Route path="/staff/burial-records" element={<BurialRecords />} />
              <Route path="/staff/users" element={<Users />} />
              <Route path="/staff/reports" element={<Reports />} />
            </Route>

            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/reservations" element={<Reservations />} />
              <Route path="/admin/payments" element={<Payments />} />
              <Route path="/admin/burial-records" element={<BurialRecords />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/reports" element={<Reports />} />
              <Route path="/admin/settings" element={<Settings />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
