import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { NOTIFICATION_TYPES, label, longDateTime } from '../lib/terms'

export default function Notifications() {
  const { user } = useAuth()
  // A notice about a reservation opens that reservation, found by its plot.
  const reservationsPath = user?.role === 'user' ? '/visitor/reservations' : `/${user?.role}/reservations`
  const [notifications, setNotifications] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState('')

  const load = async () => {
    const { ok, data } = await api('/api/notifications')
    if (ok) {
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
    } else {
      setError(data?.error || 'Failed to load notifications')
    }
    setLoaded(true)
  }

  useEffect(() => { load() }, [])

  const markRead = async (id) => {
    const { ok, data } = await api(`/api/notifications/${id}/read`, { method: 'POST' })
    if (ok) {
      setUnreadCount(data.unread_count)
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === id ? { ...n, is_read: 1 } : n))
      )
    }
  }

  const markAllRead = async () => {
    const { ok, data } = await api('/api/notifications/read-all', { method: 'POST' })
    if (ok) {
      setUnreadCount(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })))
    }
  }

  return (
    <div>
      <PageHeader title="Notifications">
        {unreadCount > 0 && (
          <button className="btn btn-secondary" onClick={markAllRead}>
            Mark all read ({unreadCount})
          </button>
        )}
      </PageHeader>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {!loaded && !error && <Loading message="Loading notifications..." />}

      {loaded && !error && notifications.length === 0 ? (
        <EmptyState noun="notifications" />
      ) : (
        <div className="notifications-list">
          {notifications.map((n) => (
            <div
              key={n.notification_id}
              className={`notification-item ${!n.is_read ? 'notification-item--unread' : ''}`}
            >
              <div className="notification-content">
                <span className={`badge badge--${n.type === 'reservation' ? 'pending' : 'user'}`}>
                  {label(NOTIFICATION_TYPES, n.type)}
                </span>
                <p className="notification-message">{n.message}</p>
                <span className="text-muted">{longDateTime(n.created_at)}</span>
              </div>
              <div className="notification-actions">
                {n.lot_code && (
                  <Link
                    className="btn btn-sm btn-primary"
                    to={`${reservationsPath}?q=${encodeURIComponent(n.lot_code)}`}
                    onClick={() => !n.is_read && markRead(n.notification_id)}
                  >
                    View reservation
                  </Link>
                )}
                {!n.is_read && (
                  <button className="btn btn-sm btn-secondary" onClick={() => markRead(n.notification_id)}>
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
