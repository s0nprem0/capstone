import { forwardRef, useEffect, useId, useRef, useState } from 'react'

const Chevron = () => (
  <svg className="select-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Check = () => (
  <svg className="select-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * A select-only combobox (WAI-ARIA APG), in place of a native <select>: the
 * native control draws its chevron hard against its edge and cannot be styled
 * to match the rest of the forms. Keyboard parity with the native one: arrows,
 * Home/End, Enter/Space, Escape, Tab to commit, and type-to-jump, open or shut.
 *
 * `options` are { value, label, description? }; `onChange` receives the value.
 * Give it a visible `label`, or an `ariaLabel` where the context names it.
 */
const Select = forwardRef(function Select(
  { label, ariaLabel, value, onChange, options, placeholder = 'Select…', disabled = false, invalid = false, describedBy, hint },
  forwardedRef
) {
  const uid = useId().replace(/:/g, '')
  const id = `select-${uid}`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const typed = useRef({ text: '', at: 0 })

  const selectedIndex = options.findIndex((o) => String(o.value) === String(value ?? ''))
  const selected = options[selectedIndex]

  const setTrigger = (node) => {
    triggerRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }

  const show = (index) => {
    if (disabled) return
    setActive(index ?? (selectedIndex >= 0 ? selectedIndex : 0))
    setOpen(true)
  }

  const commit = (index, refocus = true) => {
    const option = options[index]
    if (option && !option.disabled && String(option.value) !== String(value ?? '')) onChange(option.value)
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keeps the active option in view as the arrows walk a long list.
  useEffect(() => {
    if (!open || active < 0) return
    const item = listRef.current?.children[active]
    item?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  // Typing jumps to the next option starting with what was typed; repeating
  // one letter cycles through the options that start with it, as natively.
  const typeahead = (key) => {
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at > 600 ? key : t.text + key
    t.at = now
    const text = t.text.toLowerCase()
    const cycling = text.split('').every((c) => c === text[0])
    const from = (open ? active : selectedIndex) + (cycling ? 1 : 0)
    const n = options.length
    for (let i = 0; i < n; i++) {
      const index = (Math.max(from, 0) + i) % n
      const o = options[index]
      const name = String(o.label).toLowerCase()
      if (!o.disabled && (cycling ? name.startsWith(text[0]) : name.startsWith(text))) {
        if (open) setActive(index)
        else commit(index, false)
        return
      }
    }
  }

  const onKeyDown = (e) => {
    const last = options.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) show()
        else setActive((a) => Math.min(last, a + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) show()
        else setActive((a) => Math.max(0, a - 1))
        break
      case 'Home':
        if (open) { e.preventDefault(); setActive(0) }
        break
      case 'End':
        if (open) { e.preventDefault(); setActive(last) }
        break
      case 'Enter':
      case ' ':
        if (e.key === ' ' && typed.current.text && Date.now() - typed.current.at < 600) {
          typeahead(' ')
          e.preventDefault()
          break
        }
        e.preventDefault()
        if (open) commit(active)
        else show()
        break
      case 'Escape':
        if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
        break
      case 'Tab':
        if (open) commit(active, false)
        break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key)
    }
  }

  const described = [describedBy, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined

  return (
    <div className={`select${open ? ' select--open' : ''}${disabled ? ' select--disabled' : ''}`} ref={wrapRef}>
      {label && (
        <span className="select-label" id={`${id}-label`} onClick={() => triggerRef.current?.focus()}>
          {label}
        </span>
      )}
      <div
        ref={setTrigger}
        id={id}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        className={`select-trigger${invalid ? ' select-trigger--invalid' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-disabled={disabled || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={described}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={disabled ? undefined : onKeyDown}
      >
        <span className={selected ? 'select-value' : 'select-value select-value--placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <Chevron />
      </div>
      {hint && <small className="label-hint" id={`${id}-hint`}>{hint}</small>}
      <ul
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        className="select-list"
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-label={label ? undefined : ariaLabel}
        tabIndex={-1}
        hidden={!open}
      >
        {options.map((o, i) => (
          <li
            key={String(o.value)}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === selectedIndex}
            aria-disabled={o.disabled || undefined}
            className={`select-option${i === active ? ' select-option--active' : ''}`}
            // Keeps focus on the trigger, where the keyboard state lives.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => commit(i)}
          >
            <span className="select-option-text">
              {o.label}
              {o.description && <span className="select-option-desc">{o.description}</span>}
            </span>
            {i === selectedIndex && <Check />}
          </li>
        ))}
      </ul>
    </div>
  )
})

export default Select
