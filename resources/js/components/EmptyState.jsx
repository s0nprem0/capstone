import { Link } from 'react-router-dom'

// One empty state for every list. The pages had two competing idioms -- an
// empty-state <td> inside the table, and a <p> that replaced the whole table
// -- and neither could tell "nothing here yet" from "nothing matched what you
// asked for", which are different problems with different next steps.
//
// `action` ({ label, to } or { label, onClick }) is the next step for an empty
// list: an empty page with nowhere to go from it is a dead end.
export default function EmptyState({ noun, filtered = false, onClear, action }) {
  if (!filtered) {
    return (
      <div className="empty-block">
        <p>No {noun} yet.</p>
        {action &&
          (action.to ? (
            <Link to={action.to} className="btn btn-primary btn-sm">{action.label}</Link>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={action.onClick}>{action.label}</button>
          ))}
      </div>
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
