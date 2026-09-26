import { useEffect, useState } from 'react'

/**
 * Returns `value` once it has stopped changing for `delay` ms, so a search box
 * only triggers a request when the user pauses typing.
 */
export default function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
