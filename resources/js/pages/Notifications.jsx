import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
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

  const typeLabel = (type) => {
    const map = { reservation: 'Reservation', payment: 'Payment', system: 'System' }
    return map[type] || type
  }

  return (
    <div>
      <div className="page-header">
        <h2>Notifications</h2>
        {unreadCount > 0 && (
          <button className="btn btn-secondary" onClick={markAllRead}>
            Mark all read ({unreadCount})
          </button>
        )}
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      {notifications.length === 0 ? (
        <p className="text-muted">No notifications yet.</p>
      ) : (
        <div className="notifications-list">
          {notifications.map((n) => (
            <div
              key={n.notification_id}
              className={`notification-item ${!n.is_read ? 'notification-item--unread' : ''}`}
            >
              <div className="notification-content">
                <span className={`badge badge--${n.type === 'reservation' ? 'pending' : n.type === 'payment' ? 'paid' : 'user'}`}>
                  {typeLabel(n.type)}
                </span>
                <p className="notification-message">{n.message}</p>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>{n.created_at}</span>
              </div>
              {!n.is_read && (
                <button className="btn btn-sm btn-secondary" onClick={() => markRead(n.notification_id)}>
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
