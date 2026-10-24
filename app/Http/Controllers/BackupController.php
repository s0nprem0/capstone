<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Services\DatabaseBackup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class BackupController extends Controller
{
    private const MAX_IMPORT_BYTES = 52428800; // 50 MB

    public function __construct(private readonly DatabaseBackup $backup)
    {
    }

    public function export(): Response
    {
        $dump = $this->backup->dump();
        AuditLog::record(Auth::id(), 'backup_export', 'database', null, ['bytes' => strlen($dump)]);

        return response($dump, 200, [
            'Content-Type' => 'application/sql; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="cemetery_db-'.now()->format('Ymd-His').'.sql"',
            'Content-Length' => (string) strlen($dump),
        ]);
    }

    /** What the database holds, and when it was last backed up or restored. */
    public function summary(): JsonResponse
    {
        $count = fn (string $table): int => DB::table($table)->count();
        $last = fn (string $action): ?string => DB::table('audit_logs')->where('action', $action)->max('created_at');

        $roles = ['admin' => 0, 'staff' => 0, 'user' => 0];
        foreach (DB::table('users')->selectRaw('role, COUNT(*) AS n')->groupBy('role')->get() as $row) {
            $roles[$row->role] = (int) $row->n;
        }

        return response()->json([
            'users' => $roles,
            'sections' => $count('cemetery_sections'),
            'lots' => $count('cemetery_lots'),
            'reservations' => $count('reservations'),
            'payments' => $count('payments'),
            'burial_records' => $count('burial_records'),
            'lot_owners' => $count('lot_owners'),
            'notifications' => $count('notifications'),
            'audit_logs' => $count('audit_logs'),
            'last_backup' => $last('backup_export'),
            'last_restore' => $last('backup_import'),
            'last_reset' => $last('reset'),
        ]);
    }

    /**
     * Clear the cemetery's records back to an empty register: reservations,
     * payments, burials, owners, notifications and sign-in attempts go, and
     * every plot is available again. Accounts, sections and plots stay, and so
     * does the audit log, which records the reset itself.
     *
     * The administrator's own password and a typed confirmation are required,
     * since one click here cannot be undone except by restoring a backup.
     */
    public function reset(Request $request): JsonResponse
    {
        if ($request->input('confirm') !== 'RESET') {
            return $this->error('Type RESET to confirm.');
        }
        $password = $request->input('password');
        if (!is_string($password) || !Hash::check($password, $request->user()->password)) {
            return $this->error('Your password is incorrect, so nothing was reset.');
        }

        $cleared = DB::transaction(function () {
            $cleared = [];
            // Children before parents, so no foreign key is left pointing at a
            // row already gone.
            foreach (['payments', 'notifications', 'burial_records', 'lot_owners', 'reservations', 'login_attempts'] as $table) {
                $cleared[$table] = DB::table($table)->delete();
            }
            $cleared['lots_released'] = DB::table('cemetery_lots')->where('status', '<>', 'available')->update(['status' => 'available']);
            AuditLog::record(Auth::id(), 'reset', 'database', null, $cleared);
            return $cleared;
        });

        return response()->json(['message' => 'Records reset', 'cleared' => $cleared]);
    }

    /** Restore a backup made by export(). See DatabaseBackup::restore(). */
    public function import(Request $request): JsonResponse
    {
        $file = $request->file('file');
        $sql = trim($file && $file->isValid() ? (string) $file->get() : $request->getContent());
        if ($sql === '' || strlen($sql) > self::MAX_IMPORT_BYTES) {
            return $this->error('Empty or oversized backup file');
        }
        if (!str_starts_with($sql, DatabaseBackup::HEADER)) {
            return $this->error('This is not a backup made by this system (Settings, Download Backup).');
        }

        try {
            $statements = $this->backup->restorable($sql);
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage());
        }
        if ($statements === []) {
            return $this->error('No SQL statements found');
        }

        $result = $this->backup->restore($statements);
        if ($result['ok']) {
            AuditLog::record(Auth::id(), 'backup_import', 'database', null, ['statements' => $result['executed'], 'bytes' => strlen($sql)]);
            return response()->json(['message' => 'Database restored', 'statements' => $result['executed']]);
        }

        $failedAt = $result['executed'] + 1;
        AuditLog::record(Auth::id(), 'backup_import_failed', 'database', null, ['failed_at' => $failedAt, 'rolled_back' => $result['rolled_back']]);
        return $result['rolled_back']
            ? $this->error("The restore failed at statement {$failedAt}. The database was put back as it was before the restore.")
            : $this->error('The restore failed and the database could not be put back as it was. Restore your last good backup file now.', 500);
    }
}
