import { useEffect, useRef } from 'react'

export const STATUS_LABELS = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
}

// Capped so a one-letter search cannot mount thousands of nodes; whatever
// drives `lots` is expected to offer a way to narrow it.
const MAX_LISTED = 300

export default function PlotPicker({
  lots,
  selectedId,
  onSelect,
  labelledBy,
  emptyMessage,
  showSection = true,
  showStatus = true,
  showPrice = false,
}) {
  const listRef = useRef(null)
  const hasLots = lots.length > 0

  // A plot chosen elsewhere (the map, a ?lot= link) can sit far down the list.
  // Scroll the list itself, not the page, so it lands where the eye is.
  useEffect(() => {
    const list = listRef.current
    const item = list?.querySelector('[aria-current="true"]')
    if (!item) return
    const top = item.offsetTop - list.offsetTop
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - (list.clientHeight - item.offsetHeight) / 2
    }
  }, [selectedId, hasLots])

  if (!hasLots) {
    return <p className="text-muted map-toggle-note">{emptyMessage}</p>
  }

  const shown = lots.slice(0, MAX_LISTED)

  return (
    <>
      <ul className="plot-list" aria-labelledby={labelledBy} ref={listRef}>
        {shown.map((lot) => {
          const isSelected = String(lot.lot_id) === String(selectedId)
          return (
            <li key={lot.lot_id}>
              <button
                type="button"
                className={`plot-list-item${isSelected ? ' plot-list-item--selected' : ''}`}
                onClick={() => onSelect(lot)}
                aria-current={isSelected ? 'true' : undefined}
              >
                <span className="plot-list-code">{lot.lot_code}</span>
                {showSection && <span className="plot-list-section">{lot.section_name}</span>}
                {showPrice && <span className="plot-list-price">₱{Number(lot.price).toLocaleString()}</span>}
                {showStatus && <span className={`mark mark--${lot.status}`}>{STATUS_LABELS[lot.status]}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {lots.length > MAX_LISTED && (
        <p className="text-muted map-toggle-note">
          Showing the first {MAX_LISTED} of {lots.length}. Narrow the search to see the rest.
        </p>
      )}
    </>
  )
}
