import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import ConfirmButton from '../components/ConfirmButton'
import PasswordInput from '../components/PasswordInput'
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
  const reset = useNotice()
  const fileRef = useRef(null)
  const [summary, setSummary] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetWord, setResetWord] = useState('')

  const loadSummary = useCallback(async () => {
    const { ok, data } = await api('/api/backup/summary')
    if (ok) setSummary(data)
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

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
      loadSummary()
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
      loadSummary()
    } else {
      restore.fail(data?.error || 'Restore failed')
    }
  }

  const resetRecords = async () => {
    setBusy(true)
    reset.clear()
    const { ok, data } = await api('/api/backup/reset', {
      method: 'POST',
      body: { confirm: resetWord, password: resetPassword },
    })
    setBusy(false)
    setResetPassword('')
    if (ok) {
      const c = data.cleared
      reset.succeed(
        `Records reset: ${c.reservations} reservations, ${c.payments} payments, ${c.burial_records} burial records ` +
          `and ${c.lot_owners} owners removed; ${c.lots_released} plots made available.`
      )
      setResetWord('')
      loadSummary()
    } else {
      reset.fail(data?.error || 'Reset failed')
    }
  }

  return (
    <div>
      <PageHeader title="Backup & restore" />

      <section className="dash-panel section-block" aria-labelledby="records-heading">
        <h3 id="records-heading">Records in the database</h3>
        {!summary ? (
          <p className="text-muted">Counting records...</p>
        ) : (
          <>
            <dl className="figure-list">
              <div><dt>User accounts</dt><dd>{summary.users.admin + summary.users.staff + summary.users.user} <span className="text-muted">({summary.users.admin} admin, {summary.users.staff} staff, {summary.users.user} visitors)</span></dd></div>
              <div><dt>Sections · plots</dt><dd>{summary.sections} · {summary.lots.toLocaleString()}</dd></div>
              <div><dt>Reservations</dt><dd>{summary.reservations}</dd></div>
              <div><dt>Payments</dt><dd>{summary.payments}</dd></div>
              <div><dt>Burial records</dt><dd>{summary.burial_records}</dd></div>
              <div><dt>Plot owners</dt><dd>{summary.lot_owners}</dd></div>
              <div><dt>Notifications</dt><dd>{summary.notifications}</dd></div>
              <div><dt>Audit log entries</dt><dd>{summary.audit_logs}</dd></div>
            </dl>
            <p className="text-muted panel-note">
              Last backup: {summary.last_backup ? longDateTime(summary.last_backup) : 'never'}
              {summary.last_restore && <> · last restore: {longDateTime(summary.last_restore)}</>}
              {summary.last_reset && <> · last reset: {longDateTime(summary.last_reset)}</>}
            </p>
          </>
        )}
      </section>

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

      <div className="form-card section-block">
        <h3>Reset records</h3>
        <Notice notice={reset.notice} />
        <p className="text-muted">
          Clears every reservation, payment, burial record, plot owner and notification, and makes every plot
          available again. User accounts, sections, plots and the audit log are kept. This cannot be undone except
          by restoring a backup, so <strong>download a backup first</strong>.
        </p>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault()
          }}
        >
          <label htmlFor="reset-password">
            Your password
            <PasswordInput
              id="reset-password"
              autoComplete="current-password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
            />
          </label>
          <label>
            Type RESET to confirm
            <input value={resetWord} onChange={(e) => setResetWord(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        </form>
        <div className="form-actions">
          <ConfirmButton
            label="Reset records"
            confirmLabel="Reset now"
            danger
            className="btn btn-danger"
            disabled={resetWord !== 'RESET' || !resetPassword || busy}
            message="Remove all reservations, payments, burials, owners and notifications?"
            busy={busy}
            onConfirm={resetRecords}
          />
        </div>
      </div>
    </div>
  )
}
