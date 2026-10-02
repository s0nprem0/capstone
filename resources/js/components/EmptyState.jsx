// One empty state for every list. The pages had two competing idioms -- an
// empty-state <td> inside the table, and a <p> that replaced the whole table
// -- and neither could tell "nothing here yet" from "nothing matched what you
// asked for", which are different problems with different next steps.
export default function EmptyState({ noun, filtered = false, onClear }) {
  if (!filtered) {
    return (
      <p className="empty-block">
        No {noun} yet.
      </p>
    )
  }

  return (
    <div className="empty-block">
      <p>No {noun} match the current filters.</p>
      {onClear && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  )
}