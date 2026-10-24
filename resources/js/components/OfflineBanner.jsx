import { useEffect, useState } from 'react'

// The browser reports connectivity changes; the API layer reports the failures
// themselves. This is the early, page-wide signal so a form is not filled in
// only to find out at submit time that the connection is gone.
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  if (online) return null

  return (
    <p className="alert alert--warn offline-banner" role="status">
      You are offline. Anything you submit will have to wait until the connection returns.
    </p>
  )
}
