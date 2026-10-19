export function ControlIcon({ d }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const RECENTRE = 'M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z'

/**
 * The map controls every map shares: zoom in and out as one pair, re-centre
 * (and any extra view toggles passed as children) as a second.
 */
export default function ZoomControls({ onZoomIn, onZoomOut, onFit, fitLabel = 'Re-centre the map', fitTitle, children }) {
  return (
    <div className="map-zoom-controls">
      <div className="map-zoom-group">
        <button type="button" onClick={onZoomIn} title="Zoom in (+)" aria-label="Zoom in">
          <ControlIcon d="M8 3v10M3 8h10" />
        </button>
        <button type="button" onClick={onZoomOut} title="Zoom out (−)" aria-label="Zoom out">
          <ControlIcon d="M3 8h10" />
        </button>
      </div>
      <div className="map-zoom-group">
        <button type="button" onClick={onFit} title={fitTitle || fitLabel} aria-label={fitLabel}>
          <ControlIcon d={RECENTRE} />
        </button>
        {children}
      </div>
    </div>
  )
}
