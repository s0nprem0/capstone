import { useRef, useState } from 'react'
import { api } from '../lib/api'
import ConfirmButton from '../components/ConfirmButton'

export default function Settings() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef(null)

  const downloadBackup = async () => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/backup/export', { credentials: 'same-origin' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Backup export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cemetery_db-${new Date().toISOString().slice(0, 10)}.sql`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setSuccess('Backup downloaded.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const restoreBackup = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Choose a .sql backup file first.')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    const fd = new FormData()
    fd.append('file', file)
    const { ok, data } = await api('/api/backup/import', { method: 'POST', body: fd })
    setBusy(false)
    if (ok) {
      setSuccess(`Database restored (${data.statements} statements).`)
      fileRef.current.value = ''
    } else {
      setError(data?.error || 'Restore failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings — Backup &amp; Restore</h2>
      </div>

      {error && <p className="alert alert--error">{error}</p>}
      {success && <p className="alert alert--success">{success}</p>}

      <div className="form-card section-block">
        <h3>Backup</h3>
        <p className="text-muted">Download a full SQL dump of the database (schema + data).</p>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={downloadBackup} disabled={busy}>
            {busy ? 'Working...' : 'Download Backup (.sql)'}
          </button>
        </div>
      </div>

      <div className="form-card section-block">
        <h3>Restore</h3>
        <p className="text-muted">Restore from a backup file. This overwrites all current data with the backup.</p>
        <input ref={fileRef} type="file" accept=".sql,application/sql" className="file-input" />
        <div className="form-actions">
          <ConfirmButton
            label="Restore Backup"
            confirmLabel="Restore Now"
            danger
            className="btn btn-danger"
            message="This replaces all current data with the backup. Continue?"
            busy={busy}
            onConfirm={restoreBackup}
          />
        </div>
      </div>
    </div>
  )
}