import { useRef, useState } from 'react'
import { api } from '../lib/api'
import ConfirmButton from '../components/ConfirmButton'
import PageHeader from '../components/PageHeader'
import Notice, { useNotice } from '../components/Notice'
import { localISO, longDateTime } from '../lib/terms'

const fileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// A file's local modification time in the YYYY-MM-DD HH:MM form longDateTime reads.
const localStamp = (d) =>
  `${localISO(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default function Settings() {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null)
  // Each card reports beside its own button rather than at the top of the page.
  const backup = useNotice()
  const restore = useNotice()
  const fileRef = useRef(null)

  const downloadBackup = async () => {
    setBusy(true)
    backup.clear()
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
      a.download = `cemetery_db-${localISO()}.sql`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      backup.succeed('Backup downloaded.')
    } catch (e) {
      backup.fail(e.message)
    } finally {
      setBusy(false)
    }
  }

  const restoreBackup = async () => {
    if (!file) {
      restore.fail('Choose a .sql backup file first.')
      return
    }
    setBusy(true)
    restore.clear()
    const fd = new FormData()
    fd.append('file', file)
    const { ok, data } = await api('/api/backup/import', { method: 'POST', body: fd })
    setBusy(false)
    if (ok) {
      restore.succeed(`Database restored from ${file.name} (${data.statements} statements).`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } else {
      restore.fail(data?.error || 'Restore failed')
    }
  }

  return (
    <div>
      <PageHeader title="Backup & restore" />

      <div className="form-card section-block">
        <h3>Backup</h3>
        <Notice notice={backup.notice} />
        <p className="text-muted">Download a full SQL dump of the database (schema and data).</p>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={downloadBackup} disabled={busy}>
            {busy ? 'Working...' : 'Download Backup (.sql)'}
          </button>
        </div>
      </div>

      <div className="form-card section-block">
        <h3>Restore</h3>
        <Notice notice={restore.notice} />
        <p className="text-muted">
          Restore from a backup file downloaded above. This overwrites all current data with the backup, except
          the audit log, which keeps its full history. If the restore fails partway, the database is put back as
          it was.
        </p>

        {/* The native file input cannot be styled to match; it stays in the
            page, focusable and labelled, behind a button-styled label. */}
        <div className="file-picker">
          <input
            id="restore-file"
            ref={fileRef}
            type="file"
            accept=".sql,application/sql"
            className="visually-hidden"
            onChange={(e) => {
              restore.clear()
              setFile(e.target.files?.[0] || null)
            }}
          />
          <label htmlFor="restore-file" className="btn btn-secondary">
            {file ? 'Choose a different file' : 'Choose backup file (.sql)'}
          </label>
          {file ? (
            <p className="file-picker-chosen">
              <strong>{file.name}</strong>
              <span className="text-muted">
                {fileSize(file.size)} · modified {longDateTime(localStamp(new Date(file.lastModified)))}
              </span>
            </p>
          ) : (
            <p className="text-muted file-picker-chosen">No file chosen.</p>
          )}
        </div>

        <div className="form-actions">
          <ConfirmButton
            label="Restore Backup"
            confirmLabel="Restore Now"
            danger
            className="btn btn-danger"
            disabled={!file || busy}
            message={file ? `Replace all current data with ${file.name}?` : 'Choose a file first.'}
            busy={busy}
            onConfirm={restoreBackup}
          />
        </div>
      </div>
    </div>
  )
}
