<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use PDO;
use PDOException;

class BackupController
{
    private const MAX_IMPORT_BYTES = 52428800; // 50 MB
    private const TABLE_ORDER = [
        'users',
        'cemetery_sections',
        'cemetery_lots',
        'reservations',
        'payments',
        'burial_records',
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
        $pdo = Database::connection();

        $dump = $this->header();
        foreach ($this->tables() as $table) {
            $create = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_NUM)[1] ?? '';
            $dump .= "DROP TABLE IF EXISTS `{$table}`;\n";
            $dump .= rtrim($create) . ";\n\n";
            $dump .= $this->inserts($pdo, $table);
        }
        $dump .= "\nSET FOREIGN_KEY_CHECKS=1;\n";

        http_response_code(200);
        header('Content-Type: application/sql; charset=utf-8');
        header('Content-Disposition: attachment; filename="cemetery_db-' . date('Ymd-His') . '.sql"');
        header('Content-Length: ' . strlen($dump));
        echo $dump;

        AuditLog::record(Auth::id(), 'backup_export', 'database');
    }

    public function import(): void
    {
        Auth::requireRole(['admin']);
        $pdo = Database::connection();

        $sql = $this->readSql();
        $sql = trim($sql);
        if ($sql === '' || strlen($sql) > self::MAX_IMPORT_BYTES) {
            Response::json(['error' => 'Empty or oversized backup file'], 422);
            return;
        }

        $statements = $this->splitStatements($sql);
        if ($statements === []) {
            Response::json(['error' => 'No SQL statements found'], 422);
            return;
        }

        $executed = 0;
        try {
            foreach ($statements as $statement) {
                $pdo->exec($statement);
                $executed++;
            }
        } catch (PDOException $e) {
            Response::json(['error' => 'Restore failed: ' . $e->getMessage()], 422);
            return;
        }

        AuditLog::record(Auth::id(), 'backup_import', 'database');
        Response::json(['message' => 'Database restored', 'statements' => $executed]);
    }

    private function header(): string
    {
        return "-- Cemetery Reservation and Records Management System\n"
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