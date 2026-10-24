export default function Loading({ message = 'Loading...' }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {message}
    </p>
  )
}