import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth, RequireRole, GuestOnly } from './components/RouteGuards'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Reservations from './pages/Reservations'
import NewReservation from './pages/NewReservation'
import Cemetery from './pages/Cemetery'
import Records from './pages/Records'
import Users from './pages/Users'

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
          <Route path="/records" element={<Records />} />

          <Route element={<RequireAuth />}>
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/reservations/new" element={<NewReservation />} />
          </Route>

          <Route element={<RequireRole roles={['admin', 'staff']} />}>
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
