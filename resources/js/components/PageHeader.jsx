export default function PageHeader({ title, id, children }) {
  return (
    <div className="page-header">
      <h2 id={id}>{title}</h2>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  )
}
