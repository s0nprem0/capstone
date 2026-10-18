import { MAP_VIEWBOX } from '../map/tracePaths'
import { STATUS_COLORS } from './CemeterySvgMap'
import PlanImage from '../map/PlanImage'

const [vbX, vbY, vbWidth, vbHeight] = MAP_VIEWBOX

// Read-only bird's-eye view for the dashboard. It reuses the same traced
// layout and status colours as the full map so the two read as one system, but
// carries no interaction: at this scale a lot is a few pixels across, and
// 262 near-invisible hit targets would promise precision the display cannot
// deliver. The counts are spelled out in the label and legend beside it.
export default function OccupancyMap({ sections }) {
  const lots = sections.flatMap((s) => s.lots || [])
  const counts = lots.reduce((acc, lot) => {
    if (acc[lot.status] !== undefined) acc[lot.status]++
    return acc
  }, { available: 0, reserved: 0, occupied: 0 })

  return (
    <svg
      className="occupancy-map"
      viewBox={MAP_VIEWBOX.join(' ')}
      width={vbWidth}
      height={vbHeight}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Cemetery occupancy: ${counts.available} available, ${counts.reserved} reserved, ${counts.occupied} occupied`}
    >
      <rect x={vbX - 200} y={vbY - 200} width={vbWidth + 400} height={vbHeight + 400} fill="#f4f1e8" />

      <PlanImage />

      <g>
        {lots.map((lot) => (
          <rect
            key={lot.lot_id}
            x={lot.svg_x}
            y={lot.svg_y}
            width={lot.svg_w}
            height={lot.svg_h}
            rx={1}
            fill={STATUS_COLORS[lot.status] || 'var(--color-text-muted)'}
            stroke="#fff"
            strokeWidth={1}
            // Keeps a hairline between neighbouring plots from thinning to
            // nothing when the whole cemetery is scaled into a panel.
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  )
}
