<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\DB;
use PDO;
use PDOException;
use RuntimeException;

/**
 * The whole database as plain SQL, and back. Written against PDO rather than
 * mysqldump so it runs wherever the app does (XAMPP has no shell access).
 */
class DatabaseBackup
{
    public const HEADER = '-- Cemetery Reservation and Records Management System';

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

    /** The whole database as SQL: each table dropped, recreated and refilled. */
    public function dump(): string
    {
        $pdo = $this->pdo();
        $dump = self::HEADER."\n"
            .'-- Backup generated: '.now()->format('Y-m-d H:i:s')."\n"
            ."-- Pure-PHP dump via PDO (MySQL)\n\n"
            ."SET NAMES utf8mb4;\n"
            ."SET FOREIGN_KEY_CHECKS=0;\n\n";

        foreach ($this->tables() as $table) {
            $create = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_NUM)[1] ?? '';
            $dump .= "DROP TABLE IF EXISTS `{$table}`;\n";
            $dump .= rtrim($create).";\n\n";
            $dump .= $this->inserts($pdo, $table);
        }
        return $dump."\nSET FOREIGN_KEY_CHECKS=1;\n";
    }

    /**
     * The statements of a backup file that a restore runs, after checking every
     * one of them is a shape dump() writes. The audit log's statements are left
     * out: it is the record of what happened, restores included, so a backup
     * cannot overwrite or erase it.
     *
     * @return list<string>
     * @throws RuntimeException naming the first statement dump() would never write
     */
    public function restorable(string $sql): array
    {
        $statements = $this->split($sql);
        foreach ($statements as $n => $statement) {
            if ($this->statementTable($statement) === false) {
                throw new RuntimeException('Statement '.($n + 1).' is not part of a backup made by this system, so nothing was restored.');
            }
        }
        return array_values(array_filter(
            $statements,
            fn (string $statement) => $this->statementTable($statement) !== 'audit_logs'
        ));
    }

    /**
     * Run a restore.
     *
     * MySQL commits every DROP and CREATE TABLE on its own, so a restore cannot
     * run in one transaction. Instead the current database is dumped first, and
     * if a statement fails partway that dump is played back, so a bad file
     * never leaves the database half-restored.
     *
     * @param list<string> $statements from restorable()
     * @return array{ok: bool, executed: int, rolled_back: bool}
     */
    public function restore(array $statements): array
    {
        $pdo = $this->pdo();
        $before = $this->restorable($this->dump());

        $executed = 0;
        try {
            foreach ($statements as $statement) {
                $pdo->exec($statement);
                $executed++;
            }
            return ['ok' => true, 'executed' => $executed, 'rolled_back' => false];
        } catch (PDOException $e) {
            report(new RuntimeException('Restore failed at statement '.($executed + 1).': '.$e->getMessage(), 0, $e));
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        }

        try {
            foreach ($before as $statement) {
                $pdo->exec($statement);
            }
        } catch (PDOException $e) {
            report(new RuntimeException('Rollback after a failed restore also failed: '.$e->getMessage(), 0, $e));
            return ['ok' => false, 'executed' => $executed, 'rolled_back' => false];
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        }

        return ['ok' => false, 'executed' => $executed, 'rolled_back' => true];
    }

    private function pdo(): PDO
    {
        return DB::connection()->getPdo();
    }

    /**
     * The table a backup statement acts on ('' for a SET), or false for a
     * statement dump() never writes. Only those four shapes are accepted, so
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

    /** @return list<string> table names in dependency-friendly order */
    private function tables(): array
    {
        $found = $this->pdo()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

        $ordered = array_values(array_intersect(self::TABLE_ORDER, $found));
        foreach ($found as $table) {
            if (!in_array($table, $ordered, true)) {
                $ordered[] = $table;
            }
        }
        return $ordered;
    }

    private function inserts(PDO $pdo, string $table): string
    {
        $rows = $pdo->query("SELECT * FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC);
        if ($rows === []) {
            return '';
        }

        $columnList = implode(', ', array_map(fn (string $c) => "`{$c}`", array_keys($rows[0])));

        $sql = '';
        foreach (array_chunk($rows, 200) as $chunk) {
            $tuples = array_map(function (array $row) use ($pdo): string {
                $values = array_map(
                    fn ($value) => $value === null ? 'NULL' : $pdo->quote((string) $value),
                    array_values($row)
                );
                return '('.implode(', ', $values).')';
            }, $chunk);
            $sql .= "INSERT INTO `{$table}` ({$columnList}) VALUES\n".implode(",\n", $tuples).";\n";
        }
        return $sql."\n";
    }

    /**
     * Split a MySQL script into single statements, honoring quotes and comments.
     *
     * @return list<string>
     */
    private function split(string $sql): array
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
                    // A backslash escapes whatever follows it, itself included:
                    // PDO::quote() writes C:\ as 'C:\\', whose last quote closes.
                    if ($sql[$i] === '\\' && $quote !== '`' && $i + 1 < $length) {
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
