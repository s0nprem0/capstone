import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Secondary actions for a table row, behind one "More" button. Positioned
 * fixed against the button rather than absolutely inside the row: the table
 * scrolls horizontally, and an absolute menu would be clipped by it.
 *
 * `children` is a function of `close`, so an action can shut the menu.
 */
export default function RowMenu({ label = 'More', children }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return
    const r = triggerRef.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 220
    setPos({ right: window.innerWidth - r.right, ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) })
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) close(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    // A fixed menu would drift off its button as the page scrolls under it.
    const onScroll = () => close(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <div className="row-menu" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && pos && (
        <div className="row-menu-list" style={pos}>
          {children(close)}
        </div>
      )}
    </div>
  )
}
