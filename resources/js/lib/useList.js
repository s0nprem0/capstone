import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

/**
 * A list endpoint and its filters. Empty filters are left off the query, and a
 * response that lands after a newer request has been made is dropped, so fast
 * typing in a search box cannot end on a stale result.
 *
 * @param {string} base e.g. '/api/payments'
 * @param {Record<string, string>} [params] filter values, sent when non-empty
 */
export default function useList(base, params = {}, failMessage = 'Failed to load') {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef(0)
  const abortRef = useRef(null)
  const lastPath = useRef(null)

  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  ).toString()
  const path = qs ? `${base}?${qs}` : base

  const reload = useCallback(async () => {
    // A new filter is a different list: showing the old rows until the response
    // lands reads as though the filter did not apply. A manual reload after a
    // mutation keeps them, so the table does not blink while it refreshes.
    if (lastPath.current !== path) {
      lastPath.current = path
      setLoaded(false)
      setItems([])
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const request = ++latest.current
    const { ok, data, cancelled } = await api(path, { signal: controller.signal })
    if (request !== latest.current) return
    if (ok) {
      setItems(data)
      setError('')
    } else if (!cancelled) {
      setError(data?.error || failMessage)
    }
    setLoaded(true)
  }, [path, failMessage])

  useEffect(() => {
    reload()
    return () => abortRef.current?.abort()
  }, [reload])

  return { items, loaded, error, reload, mutate: setItems }
}
