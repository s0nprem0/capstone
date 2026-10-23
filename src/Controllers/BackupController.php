<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\User;
use PDO;
use PDOException;

class BackupController
{
    private const MAX_IMPORT_BYTES = 52428800; // 50 MB
    private const HEADER = '-- Cemetery Reservation and Records Management System';
    private const TABLE_ORDER = [
        'users',
        'cemetery_sections',
        'cemetery_lots',
        'reservations',
        'payments',
        'burial_records',
        'lot_owners',
        'notifications',
        'audit_logs',
    ];

    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function export(): void
    {
        Auth::requireRole(['admin']);
        $dump = $this->dump();

        http_response_code(200);
        header('Content-Type: application/sql; charset=utf-8');
        header('Content-Disposition: attachment; filename="cemetery_db-' . date('Ymd-His') . '.sql"');
        header('Content-Length: ' . strlen($dump));
        echo $dump;

        AuditLog::record(Auth::id(), 'backup_export', 'database', null, ['bytes' => strlen($dump)]);
    }

    /** What the database holds, and when it was last backed up or restored. */
    public function summary(): void
    {
        Auth::requireRole(['admin']);
        $db = Database::connection();
        $count = fn (string $sql): int => (int) $db->query($sql)->fetchColumn();
        $lastStmt = $db->prepare("SELECT MAX(created_at) FROM audit_logs WHERE action = :action");
        $last = function (string $action) use ($lastStmt): ?string {
            $lastStmt->execute(['action' => $action]);
            return $lastStmt->fetchColumn() ?: null;
        };

        $roles = ['admin' => 0, 'staff' => 0, 'user' => 0];
        foreach ($db->query("SELECT role, COUNT(*) AS n FROM users GROUP BY role")->fetchAll() as $row) {
            $roles[$row['role']] = (int) $row['n'];
        }

        Response::json([
            'users' => $roles,
            'sections' => $count("SELECT COUNT(*) FROM cemetery_sections"),
            'lots' => $count("SELECT COUNT(*) FROM cemetery_lots"),
            'reservations' => $count("SELECT COUNT(*) FROM reservations"),
            'payments' => $count("SELECT COUNT(*) FROM payments"),
            'burial_records' => $count("SELECT COUNT(*) FROM burial_records"),
            'lot_owners' => $count("SELECT COUNT(*) FROM lot_owners"),
            'notifications' => $count("SELECT COUNT(*) FROM notifications"),
            'audit_logs' => $count("SELECT COUNT(*) FROM audit_logs"),
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
    public function reset(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();

        if (($input['confirm'] ?? '') !== 'RESET') {
            Response::json(['error' => 'Type RESET to confirm.'], 422);
            return;
        }
        $admin = User::find((int) Auth::id());
        $password = $input['password'] ?? '';
        if (!$admin || !is_string($password) || !User::verifyPassword($admin, $password)) {
            Response::json(['error' => 'Your password is incorrect, so nothing was reset.'], 422);
            return;
        }

        $pdo = Database::connection();
        $cleared = [];
        try {
            $pdo->beginTransaction();
            // Children before parents, so no foreign key is left pointing at a
            // row already gone.
            foreach (['payments', 'notifications', 'burial_records', 'lot_owners', 'reservations', 'login_attempts'] as $table) {
                $cleared[$table] = $pdo->exec("DELETE FROM `{$table}`");
            }
            $cleared['lots_released'] = $pdo->exec("UPDATE `cemetery_lots` SET `status` = 'available' WHERE `status` <> 'available'");
            AuditLog::record(Auth::id(), 'reset', 'database', null, $cleared);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        Response::json(['message' => 'Records reset', 'cleared' => $cleared]);
    }

    /**
     * Restore a backup made by export().
     *
     * MySQL commits every DROP and CREATE TABLE on its own, so a restore cannot
     * run in one transaction. Instead the file is checked in full before
     * anything runs, the current database is dumped first, and if a statement
     * fails partway that dump is played back, so a bad file never leaves the
     * database half-restored.
     *
     * The audit log is not restored: it is the record of what happened,
     * restores included, so a backup cannot overwrite or erase it.
     */
    public function import(): void
    {
        Auth::requireRole(['admin']);
        $pdo = Database::connection();

        $sql = trim($this->readSql());
        if ($sql === '' || strlen($sql) > self::MAX_IMPORT_BYTES) {
            Response::json(['error' => 'Empty or oversized backup file'], 422);
            return;
        }
        if (!str_starts_with($sql, self::HEADER)) {
            Response::json(['error' => 'This is not a backup made by this system (Settings, Download Backup).'], 422);
            return;
        }

        $statements = $this->splitStatements($sql);
        foreach ($statements as $n => $statement) {
            if ($this->statementTable($statement) === false) {
                Response::json(['error' => 'Statement ' . ($n + 1) . ' is not part of a backup made by this system, so nothing was restored.'], 422);
                return;
            }
        }
        $statements = $this->restorable($statements);
        if ($statements === []) {
            Response::json(['error' => 'No SQL statements found'], 422);
            return;
        }

        $before = $this->restorable($this->splitStatements($this->dump()));

        $executed = 0;
        try {
            foreach ($statements as $statement) {
                $pdo->exec($statement);
                $executed++;
            }
        } catch (PDOException $e) {
            error_log('[backup] restore failed at statement ' . ($executed + 1) . ': ' . $e->getMessage());
            $this->rollBack($pdo, $before, $executed);
            return;
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        }

        AuditLog::record(Auth::id(), 'backup_import', 'database', null, ['statements' => $executed, 'bytes' => strlen($sql)]);
        Response::json(['message' => 'Database restored', 'statements' => $executed]);
    }

    /** Put the pre-restore dump back after a failed restore, and say how it went. */
    private function rollBack(PDO $pdo, array $before, int $executed): void
    {
        try {
            foreach ($before as $statement) {
                $pdo->exec($statement);
            }
        } catch (PDOException $e) {
            error_log('[backup] rollback after a failed restore also failed: ' . $e->getMessage());
            AuditLog::record(Auth::id(), 'backup_import_failed', 'database', null, ['failed_at' => $executed + 1, 'rolled_back' => false]);
            Response::json(['error' => 'The restore failed and the database could not be put back as it was. Restore your last good backup file now.'], 500);
            return;
        }

        AuditLog::record(Auth::id(), 'backup_import_failed', 'database', null, ['failed_at' => $executed + 1, 'rolled_back' => true]);
        Response::json(['error' => 'The restore failed at statement ' . ($executed + 1) . '. The database was put back as it was before the restore.'], 422);
    }

    /** The whole database as SQL: each table dropped, recreated and refilled. */
    private function dump(): string
    {
        $pdo = Database::connection();
        $dump = $this->header();
        foreach ($this->tables() as $table) {
            $create = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_NUM)[1] ?? '';
            $dump .= "DROP TABLE IF EXISTS `{$table}`;\n";
            $dump .= rtrim($create) . ";\n\n";
            $dump .= $this->inserts($pdo, $table);
        }
        return $dump . "\nSET FOREIGN_KEY_CHECKS=1;\n";
    }

    /**
     * The table a backup statement acts on ('' for a SET), or false for a
     * statement export() never writes. Only those four shapes are accepted, so
     * the restore cannot be used to run arbitrary SQL such as triggers, GRANTs
     * or UPDATEs.
     */
    private function statementTable(string $statement): string|false
    {
        if (preg_match('/^SET\s+(NAMES\s+utf8mb4|FOREIGN_KEY_CHECKS\s*=\s*[01])$/i', $statement)) {
            return '';
        }
        if (preg_match('/^(?:DROP\s+TABLE\s+IF\s+EXISTS\s+`(\w+)`$|CREATE\s+TABLE\s+`(\w+)`\s*\(|INSERT\s+INTO\s+`(\w+)`\s*\()/i', $statement, $m)) {
            return $m[1] ?: ($m[2] ?? '') ?: ($m[3] ?? '');
        }
        return false;
    }

    /** The statements a restore runs: everything except the audit log's. */
    private function restorable(array $statements): array
    {
        return array_values(array_filter(
            $statements,
            fn(string $statement) => $this->statementTable($statement) !== 'audit_logs'
        ));
    }

    private function header(): string
    {
        return self::HEADER . "\n"
            . "-- Backup generated: " . date('Y-m-d H:i:s') . "\n"
            . "-- Pure-PHP dump via PDO (MySQL)\n\n"
            . "SET NAMES utf8mb4;\n"
            . "SET FOREIGN_KEY_CHECKS=0;\n\n";
    }

    /** @return string[] table names in dependency-friendly order */
    private function tables(): array
    {
        $found = Database::connection()
            ->query('SHOW TABLES')
            ->fetchAll(PDO::FETCH_COLUMN);

        $ordered = [];
        foreach (self::TABLE_ORDER as $table) {
            if (in_array($table, $found, true) && !in_array($table, $ordered, true)) {
                $ordered[] = $table;
            }
        }
        foreach ($found as $table) {
            if (!in_array($table, $ordered, true)) {
                $ordered[] = $table;
            }
        }
        return $ordered;
    }

    private function inserts(PDO $pdo, string $table): string
    {
        $rows = $pdo->query("SELECT * FROM `{$table}`")->fetchAll();
        if ($rows === []) {
            return '';
        }

        $columns = array_keys($rows[0]);
        $columnList = implode(', ', array_map(fn(string $c) => "`{$c}`", $columns));

        $sql = '';
        foreach (array_chunk($rows, 200) as $chunk) {
            $tuples = array_map(function (array $row) use ($pdo): string {
                $values = array_map(
                    fn($value) => $value === null ? 'NULL' : $pdo->quote((string) $value),
                    array_values($row)
                );
                return '(' . implode(', ', $values) . ')';
            }, $chunk);
            $sql .= "INSERT INTO `{$table}` ({$columnList}) VALUES\n" . implode(",\n", $tuples) . ";\n";
        }
        return $sql . "\n";
    }

    private function readSql(): string
    {
        if (!empty($_FILES['file']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            return (string) file_get_contents($_FILES['file']['tmp_name']);
        }
        return (string) file_get_contents('php://input');
    }

    /** Split a MySQL script into single statements, honoring quotes and comments. */
    private function splitStatements(string $sql): array
    {
        $statements = [];
        $buffer = '';
        $length = strlen($sql);
        $i = 0;

        while ($i < $length) {
            $char = $sql[$i];
            $next = $i + 1 < $length ? $sql[$i + 1] : '';

            if (($char === '-' && $next === '-') || $char === '#') {
                while ($i < $length && $sql[$i] !== "\n") {
                    $i++;
                }
                continue;
            }

            if ($char === '/' && $next === '*') {
                $end = strpos($sql, '*/', $i + 2);
                $i = $end === false ? $length : $end + 2;
                continue;
            }

            if ($char === "'" || $char === '"' || $char === '`') {
                $quote = $char;
                $buffer .= $char;
                $i++;
                while ($i < $length) {
                    $buffer .= $sql[$i];
                    if ($sql[$i] === '\\' && $i + 1 < $length && $sql[$i + 1] === $quote) {
                        $buffer .= $sql[$i + 1];
                        $i += 2;
                        continue;
                    }
                    if ($sql[$i] === $quote) {
                        if ($i + 1 < $length && $sql[$i + 1] === $quote) {
                            $buffer .= $sql[$i + 1];
                            $i += 2;
                            continue;
                        }
                        $i++;
                        break;
                    }
                    $i++;
                }
                continue;
            }

            if ($char === ';') {
                $statement = trim($buffer);
                if ($statement !== '') {
                    $statements[] = $statement;
                }
                $buffer = '';
                $i++;
                continue;
            }

            $buffer .= $char;
            $i++;
        }

        $statement = trim($buffer);
        if ($statement !== '') {
            $statements[] = $statement;
        }
        return $statements;
    }
}