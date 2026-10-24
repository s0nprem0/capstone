import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

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
  const listRef = useRef(null)
  const listId = `row-menu-${useId().replace(/:/g, '')}`

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
    const list = listRef.current
    // Focus travels into the menu, so the next Tab or Enter acts on the actions
    // rather than passing over the menu to the next row's controls.
    const first = list?.querySelector('a[href], button:not([disabled])')
    first?.focus()

    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) close(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    const onMenuKeyDown = (e) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
      const items = [...(list?.querySelectorAll('a[href], button:not([disabled])') || [])]
      if (!items.length) return
      e.preventDefault()
      const at = items.indexOf(document.activeElement)
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : e.key === 'ArrowDown'
              ? (at + 1) % items.length
              : (at - 1 + items.length) % items.length
      items[next].focus()
    }
    // A fixed menu would drift off its button as the page scrolls under it.
    const onScroll = () => close(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    list?.addEventListener('keydown', onMenuKeyDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      list?.removeEventListener('keydown', onMenuKeyDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, pos])

  return (
    <div className="row-menu" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && pos && (
        <div ref={listRef} id={listId} className="row-menu-list" style={pos}>
          {children(close)}
        </div>
      )}
    </div>
  )
}
