// A list that is still loading keeps its shape: rows of neutral bars instead of
// a single spinner, so the page does not jump when the real table arrives.
export default function TableSkeleton({ label = 'Loading...', rows = 5, columns = 5 }) {
  return (
    <div className="table-skeleton" role="status" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }).map((_, row) => (
        <div className="table-skeleton-row" key={row} aria-hidden="true">
          {Array.from({ length: columns }).map((_, column) => (
            <span className="table-skeleton-cell" key={column} />
          ))}
        </div>
      ))}
    </div>
  )
}
