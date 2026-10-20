import { LOT_STATUS, PLOT_STATUSES } from '../lib/terms'

/**
 * How a set of plots divides between the three statuses, as one bar. A status
 * with any plots keeps a sliver however small its share, so three occupied
 * plots in 6,734 still show rather than rounding away to nothing.
 */
export default function OccupancyBar({ counts: raw, large = false }) {
  // Counts can arrive from PDO as strings; summing those would concatenate.
  const counts = Object.fromEntries(PLOT_STATUSES.map((s) => [s, Number(raw[s]) || 0]))
  const total = PLOT_STATUSES.reduce((sum, s) => sum + counts[s], 0)
  const summary = PLOT_STATUSES.map((s) => `${counts[s]} ${LOT_STATUS[s].toLowerCase()}`).join(', ')
  return (
    <div className={large ? 'occupancy-bar occupancy-bar--large' : 'occupancy-bar'} role="img" aria-label={summary}>
      {total > 0 &&
        PLOT_STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} className={`occupancy-bar-seg occupancy-bar-seg--${s}`} style={{ flexGrow: counts[s] }} />
        ))}
    </div>
  )
}
