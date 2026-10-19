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

  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  ).toString()
  const path = qs ? `${base}?${qs}` : base

  const reload = useCallback(async () => {
    const request = ++latest.current
    const { ok, data } = await api(path)
    if (request !== latest.current) return
    if (ok) {
      setItems(data)
      setError('')
    } else {
      setError(data?.error || failMessage)
    }
    setLoaded(true)
  }, [path, failMessage])

  useEffect(() => {
    reload()
  }, [reload])

  return { items, loaded, error, reload }
}
