export default function Loading({ message = 'Loading...' }) {
  return (
    <p className="loading">
      <span className="spinner" aria-hidden="true" />
      {message}
    </p>
  )
}