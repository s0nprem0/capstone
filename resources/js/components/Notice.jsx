import { useCallback, useState } from 'react'

// The outcome of the last action on a page. Kept apart from the list's load
// error: a failed approve used to share that state, and the table vanished.
export function useNotice() {
  const [notice, setNotice] = useState(null)
  const succeed = useCallback((text) => setNotice({ type: 'success', text }), [])
  const fail = useCallback((text) => setNotice({ type: 'error', text }), [])
  const clear = useCallback(() => setNotice(null), [])
  return { notice, succeed, fail, clear }
}

export default function Notice({ notice }) {
  if (!notice) return null
  return notice.type === 'error' ? (
    <p className="alert alert--error" role="alert">{notice.text}</p>
  ) : (
    <p className="alert alert--success" role="status">{notice.text}</p>
  )
}
