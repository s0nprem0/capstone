import { useEffect, useRef, useState } from 'react'

export default function ConfirmButton({
  onConfirm,
  label,
  className = 'btn btn-secondary btn-sm',
  confirmLabel = 'Confirm',
  message = 'Are you sure?',
  busy = false,
  disabled = false,
  danger = false,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (open) {
    const confirmClass = danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'
    return (
      <span className="confirm-inline" ref={ref}>
        <span className="confirm-message">{message}</span>
        <button
          type="button"
          className={confirmClass}
          disabled={busy}
          onClick={async () => {
            await onConfirm()
            setOpen(false)
          }}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
      {label}
    </button>
  )
}