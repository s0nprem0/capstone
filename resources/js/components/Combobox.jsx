import { useEffect, useId, useRef, useState } from 'react'
import { Check } from './Select'

/**
 * A searchable picker (WAI-ARIA APG combobox with list autocomplete): type to
 * narrow a long list, arrows to move, Enter to choose, Escape to close. The
 * match count is announced, so a screen reader hears the list narrowing.
 *
 * `options` are { value, label, description? }; `onChange` receives the value.
 */
export default function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = 'Type to search…',
  disabled = false,
  invalid = false,
  emptyText = 'No matches.',
  hint,
}) {
  const uid = useId().replace(/:/g, '')
  const id = `combo-${uid}`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(null)
  const [active, setActive] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = options.find((o) => String(o.value) === String(value ?? ''))
  const term = (query ?? '').trim().toLowerCase()
  const matches = term
    ? options.filter((o) => `${o.label} ${o.description || ''}`.toLowerCase().includes(term))
    : options

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) {
        setOpen(false)
        setQuery(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  const choose = (option) => {
    if (!option) return
    onChange(option.value)
    setQuery(null)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        else setActive((a) => Math.min(matches.length - 1, a + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => Math.max(0, a - 1))
        break
      case 'Enter':
        if (open && matches[active]) {
          e.preventDefault()
          choose(matches[active])
        }
        break
      case 'Escape':
        if (open || query !== null) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
          setQuery(null)
        }
        break
      default:
    }
  }

  return (
    <div className={`select combobox${open ? ' select--open' : ''}`} ref={wrapRef}>
      <label className="select-label" htmlFor={id}>{label}</label>
      <div className={`select-trigger combobox-field${invalid ? ' select-trigger--invalid' : ''}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && matches[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={query ?? selected?.label ?? ''}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {hint && <small className="label-hint" id={`${id}-hint`}>{hint}</small>}
      <span className="visually-hidden" aria-live="polite">
        {open ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}` : ''}
      </span>
      <ul ref={listRef} id={`${id}-list`} role="listbox" className="select-list" aria-label={label} hidden={!open}>
        {matches.length === 0 && <li className="select-empty" role="presentation">{emptyText}</li>}
        {matches.map((o, i) => (
          <li
            key={String(o.value)}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={String(o.value) === String(value ?? '')}
            className={`select-option${i === active ? ' select-option--active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(o)}
          >
            <span className="select-option-text">
              {o.label}
              {o.description && <span className="select-option-desc">{o.description}</span>}
            </span>
            {String(o.value) === String(value ?? '') && <Check />}
          </li>
        ))}
      </ul>
    </div>
  )
}
