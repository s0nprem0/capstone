import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth, RequireRole, GuestOnly } from './components/RouteGuards'
import Layout from './components/Layout'
import Loading from './components/Loading'
import OfflineBanner from './components/OfflineBanner'

// Pages load on demand, so the public map and sign-in do not carry the admin
// editors (Lot Editor alone is ~900 lines) into the first bundle.
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Reservations = lazy(() => import('./pages/Reservations'))
const Payments = lazy(() => import('./pages/Payments'))
const MyPayments = lazy(() => import('./pages/MyPayments'))
const NewReservation = lazy(() => import('./pages/NewReservation'))
const BurialRecords = lazy(() => import('./pages/BurialRecords'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Reports = lazy(() => import('./pages/Reports'))
const Cemetery = lazy(() => import('./pages/Cemetery'))
const Users = lazy(() => import('./pages/Users'))
const Sections = lazy(() => import('./pages/Sections'))
const SectionEditor = lazy(() => import('./pages/SectionEditor'))
const LotEditor = lazy(() => import('./pages/LotEditor'))
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))

export default function App() {
  return (
    <AuthProvider>
      <OfflineBanner />
      <Suspense fallback={<Loading />}>
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
                <Route path="/visitor/payments" element={<MyPayments />} />
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
                <Route path="/admin/sections" element={<Sections />} />
                <Route path="/admin/sections/editor" element={<SectionEditor />} />
                <Route path="/admin/lots" element={<LotEditor />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/settings" element={<Settings />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
