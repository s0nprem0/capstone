<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Validate;
use PDO;

/**
 * A transcribed line of the handwritten sales ledger, staged for review before
 * it becomes a lot owner or a burial record (see ledger_rows in schema.sql).
 */
class LedgerRow extends Model
{
    protected static string $table = 'ledger_rows';
    protected static string $primaryKey = 'row_id';

    /** The cemetery opened in 1995; no interment in the book is older. */
    private const FIRST_YEAR = 1995;

    /**
     * The surveyed plot a ledger line names. Ledger "Block N" is survey
     * Section N, and its lot number is the plot's printed number, so Block 5
     * lot 1 is S5-001. Anything else -- the named estates, the Extension
     * blocks, niches, lettered lots like "1-A" -- has no automatic match and
     * waits for staff to choose the plot.
     */
    public static function matchLot(string $blockLabel, string $lot): ?int
    {
        if (stripos($blockLabel, 'niche') !== false
            || !preg_match('/^Block\s+(\d+)\b/i', trim($blockLabel), $block)
            || !preg_match('/^\d+$/', trim($lot))) {
            return null;
        }
        $code = 'S' . (int) $block[1] . '-' . str_pad((string) (int) $lot, 3, '0', STR_PAD_LEFT);
        $found = Lot::findBy('lot_code', $code);
        return $found ? (int) $found['lot_id'] : null;
    }

    /**
     * A burial date as the book writes it -- m-d-yy, m/d/yy, m-d-yyyy -- as
     * YYYY-MM-DD, or null when it is partial, impossible, or ambiguous. A
     * two-digit year is 19yy from 95 and 20yy up to this year; anything in
     * between cannot be a burial here and is left for staff.
     */
    public static function parseDate(?string $text): ?string
    {
        if ($text === null || !preg_match('#^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\s*$#', $text, $m)) {
            return null;
        }
        [, $month, $day, $year] = $m;
        $thisYear = (int) substr(Validate::today(), 0, 4);
        if (strlen($year) === 2) {
            $yy = (int) $year;
            $year = $yy >= self::FIRST_YEAR % 100 ? 1900 + $yy : 2000 + $yy;
        }
        $year = (int) $year;
        if ($year < self::FIRST_YEAR || $year > $thisYear || !checkdate((int) $month, (int) $day, $year)) {
            return null;
        }
        $date = sprintf('%04d-%02d-%02d', $year, (int) $month, (int) $day);
        return $date <= Validate::today() ? $date : null;
    }

    /** Stage one transcribed line. Returns false when it was already staged. */
    public static function stage(array $row): bool
    {
        $row['row_key'] = sha1(json_encode([
            $row['kind'], $row['book'], $row['photo'], $row['block_label'], $row['lot'],
            $row['plot'], $row['name'], $row['terms'], $row['date_text'],
        ], JSON_UNESCAPED_UNICODE));

        $columns = implode(', ', array_map(fn($c) => "`{$c}`", array_keys($row)));
        $placeholders = implode(', ', array_fill(0, count($row), '?'));
        $stmt = self::db()->prepare("INSERT IGNORE INTO `ledger_rows` ({$columns}) VALUES ({$placeholders})");
        $stmt->execute(array_values($row));
        return $stmt->rowCount() === 1;
    }

    public static function findForUpdate(int $id): ?array
    {
        $stmt = self::db()->prepare("SELECT * FROM `ledger_rows` WHERE `row_id` = :id FOR UPDATE");
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    /** Where an approved row came from, for the record it creates. */
    public static function source(array $row): string
    {
        $where = $row['book'] === 'old'
            ? 'Ledger (first transcription), ' . $row['block_label']
            : 'Ledger book ' . $row['book'] . ($row['photo'] ? ', photo ' . $row['photo'] : '');
        return mb_substr($where . ($row['plot'] ? ', plot ' . $row['plot'] : ''), 0, 120);
    }

    /**
     * Pending rows with nothing for a person to settle: a matched plot, no
     * transcriber doubt, a date for a burial, and not already refused by a
     * rule (review_note holds the reason until someone edits the row).
     */
    public const CLEAN = "r.`status` = 'pending' AND r.`lot_id` IS NOT NULL AND COALESCE(r.`doubt`, '') = ''
                          AND (r.`kind` = 'owner' OR r.`burial_date` IS NOT NULL) AND r.`review_note` IS NULL";

    /**
     * @return array{total: int, counts: array<string, int>, items: list<array<string, mixed>>}
     */
    public static function search(array $filters): array
    {
        $where = [];
        $params = [];

        $status = $filters['status'] ?? 'pending';
        if (in_array($status, ['pending', 'approved', 'rejected'], true)) {
            $where[] = 'r.`status` = :status';
            $params['status'] = $status;
        }
        if (in_array($filters['kind'] ?? '', ['owner', 'burial'], true)) {
            $where[] = 'r.`kind` = :kind';
            $params['kind'] = $filters['kind'];
        }
        $issues = [
            'clean' => self::CLEAN,
            'doubt' => "COALESCE(r.`doubt`, '') <> ''",
            'unmatched' => 'r.`lot_id` IS NULL',
            'undated' => "r.`kind` = 'burial' AND r.`burial_date` IS NULL",
        ];
        if (isset($issues[$filters['issue'] ?? ''])) {
            $where[] = '(' . $issues[$filters['issue']] . ')';
        }
        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(r.`name` LIKE :q1 OR r.`block_label` LIKE :q2 OR l.`lot_code` LIKE :q3 OR r.`lot` = :q4)';
            foreach (['q1', 'q2', 'q3'] as $param) {
                $params[$param] = '%' . addcslashes($q, '%_\\') . '%';
            }
            $params['q4'] = $q;
        }

        $from = " FROM `ledger_rows` r LEFT JOIN `cemetery_lots` l ON l.`lot_id` = r.`lot_id`";
        $sql = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);

        $stmt = self::db()->prepare("SELECT COUNT(*)" . $from . $sql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        [$limit, $offset] = self::paginate($filters, 100, 500);
        $stmt = self::db()->prepare(
            "SELECT r.*, l.`lot_code`, l.`lot_type`, l.`status` AS `lot_status`, u.`fullname` AS `reviewed_by_name`"
            . $from . " LEFT JOIN `users` u ON u.`user_id` = r.`reviewed_by`" . $sql
            . " ORDER BY r.`book`, CAST(r.`photo` AS UNSIGNED), r.`row_id` LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $counts = ['pending' => 0, 'approved' => 0, 'rejected' => 0, 'clean' => 0];
        foreach (self::db()->query("SELECT `status`, COUNT(*) FROM `ledger_rows` GROUP BY `status`")->fetchAll(PDO::FETCH_KEY_PAIR) as $key => $count) {
            $counts[$key] = (int) $count;
        }
        $counts['clean'] = (int) self::db()->query("SELECT COUNT(*) FROM `ledger_rows` r WHERE " . self::CLEAN)->fetchColumn();

        return ['total' => $total, 'counts' => $counts, 'items' => $stmt->fetchAll()];
    }

    /** Ids of clean pending rows, oldest page first, for a bulk approval. */
    public static function cleanIds(int $limit): array
    {
        $stmt = self::db()->prepare(
            "SELECT r.`row_id` FROM `ledger_rows` r WHERE " . self::CLEAN . " ORDER BY r.`row_id` LIMIT :limit"
        );
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
}
