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
  const triggerRef = useRef(null)
  const confirmRef = useRef(null)
  const returnFocusRef = useRef(false)

  // Closing always returns focus to the trigger, so a keyboard user is put back
  // where they were instead of being dropped at the top of the document. The
  // trigger is unmounted while the confirm is open, so focus has to be restored
  // in the effect below, after it is back in the DOM — not here.
  const close = () => {
    returnFocusRef.current = true
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Move focus onto the choice when it opens, and back onto the trigger when it
  // closes (once the trigger has re-mounted).
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus()
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false
      triggerRef.current?.focus()
    }
  }, [open])

  if (open) {
    const confirmClass = danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'
    return (
      <span className="confirm-inline" ref={ref}>
        <span className="confirm-message">{message}</span>
        <button
          type="button"
          ref={confirmRef}
          className={confirmClass}
          disabled={busy}
          onClick={async () => {
            await onConfirm()
            close()
          }}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={close}>
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button type="button" ref={triggerRef} className={className} disabled={disabled} onClick={() => setOpen(true)}>
      {label}
    </button>
  )
}
