import { useEffect, useId, useRef, useState } from 'react'
import { longDate } from '../lib/terms'

/**
 * The map's one search box: a loved one by name, or a plot by its code. The
 * people found drop down over the map as a WAI-ARIA APG combobox (arrows to
 * move, Enter to choose, Escape to close); plot codes need no list, the map
 * itself frames and labels them.
 */
export default function MapSearch({ value, onChange, people, onChoose, selectedId }) {
  const uid = useId().replace(/:/g, '')
  const id = `map-find-${uid}`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const expanded = open && people.length > 0

  // A new set of results starts at the top, and shows itself unprompted.
  useEffect(() => {
    setActive(0)
    if (people.length > 0) setOpen(true)
  }, [people])

  // A grave chosen -- here, on the map, or because it was the only match --
  // is what the list was for, so it gets out of the map's way.
  useEffect(() => {
    if (selectedId != null) setOpen(false)
  }, [selectedId])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (expanded) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [expanded, active])

  const choose = (person) => {
    if (!person) return
    onChoose(person)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!expanded) setOpen(true)
        else setActive((a) => Math.min(people.length - 1, a + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => Math.max(0, a - 1))
        break
      case 'Enter':
        if (expanded) {
          e.preventDefault()
          choose(people[active])
        }
        break
      // The map listens for Escape too (back to the overview), so a handled
      // one stops here: first it closes the list, then it clears the box.
      case 'Escape':
        if (expanded || value) {
          e.preventDefault()
          e.stopPropagation()
          if (expanded) setOpen(false)
          else onChange('')
        }
        break
      default:
    }
  }

  return (
    <div className="map-search-box" ref={wrapRef} role="search">
      <label className="visually-hidden" htmlFor={id}>Find a loved one by name, or a plot by its code</label>
      <svg className="map-search-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input
        id={id}
        className="map-search-input"
        type="search"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-activedescendant={expanded ? `${id}-opt-${active}` : undefined}
        aria-describedby={`${id}-hint`}
        placeholder="Find a loved one — type a name or plot code"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <small className="map-search-hint" id={`${id}-hint`}>
        A surname is enough, e.g. Santos. Plot codes look like S38-058.
      </small>
      <span className="visually-hidden" aria-live="polite">
        {people.length > 0 ? `${people.length} ${people.length === 1 ? 'person' : 'people'} found` : ''}
      </span>
      <ul
        id={`${id}-list`}
        ref={listRef}
        role="listbox"
        aria-label="People found"
        className="map-search-results"
        hidden={!expanded}
      >
        {people.map((p, i) => (
          <li
            key={`${p.lot_id}-${p.deceased_fullname}`}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={String(p.lot_id) === String(selectedId)}
            className={`map-search-option${i === active ? ' map-search-option--active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(p)}
          >
            <span className="map-search-name">{p.deceased_fullname}</span>
            <span className="map-search-meta">
              {p.section_name} · {p.lot_code}
              {p.date_of_death && <> · Died {longDate(p.date_of_death)}</>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
