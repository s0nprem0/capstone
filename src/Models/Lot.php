<?php

declare(strict_types=1);

namespace App\Models;

use PDO;

class Lot extends Model
{
    protected static string $table = 'cemetery_lots';
    protected static string $primaryKey = 'lot_id';

    /** Interments a plot holds, by lot_type; also the most slots one reservation can take. */
    public const CAPACITY = ['single' => 1, 'double' => 2, 'family' => 4];

    public static function capacity(array $lot): int
    {
        return self::CAPACITY[$lot['lot_type']] ?? 1;
    }

    /**
     * Lot geometry as numbers.
     *
     * The svg_* columns are DECIMAL, and PDO hands a DECIMAL back as a string
     * so its precision survives the trip. The map does arithmetic on these
     * values - a label sits at x + w / 2, a drag adds a delta - and string
     * arithmetic concatenates instead of adding, so they are converted once
     * here rather than coerced at every call site.
     */
    private static function withNumbers(array $row): array
    {
        foreach (['svg_x', 'svg_y', 'svg_w', 'svg_h'] as $field) {
            if (array_key_exists($field, $row)) {
                $row[$field] = (float) $row[$field];
            }
        }
        return $row;
    }

    /** @param list<array<string, mixed>> $rows */
    private static function rowsWithNumbers(array $rows): array
    {
        return array_map([self::class, 'withNumbers'], $rows);
    }

    public static function find(int $id): ?array
    {
        $row = parent::find($id);
        return $row === null ? null : self::withNumbers($row);
    }

    public static function available(array $filters = []): array
    {
        [$limit, $offset] = self::paginate($filters, 200, 1000);
        $stmt = self::db()->prepare(
            "SELECT * FROM `" . static::$table . "` WHERE status = 'available' ORDER BY `lot_code` LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return self::rowsWithNumbers($stmt->fetchAll());
    }

    public static function findForUpdate(int $id): ?array
    {
        $stmt = self::db()->prepare(
            "SELECT * FROM `" . static::$table . "` WHERE `" . static::$primaryKey . "` = :id FOR UPDATE"
        );
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public static function reserve(int $id): bool
    {
        return self::update($id, ['status' => 'reserved']);
    }

    /**
     * Next free code in a section's surveyed sequence, e.g. 12 -> "S12-050".
     *
     * Allocated here rather than in the browser because the browser cannot see
     * the current codes: the map is fetched once when the page loads and the
     * lot list is re-seeded from that snapshot when the section changes, so a
     * client-side "first free number" goes stale the moment a lot is added and
     * re-issues a code that already exists. The database owns the unique key,
     * so it is the only place that can answer this correctly.
     *
     * Max+1 rather than first-free, so the sequence stays monotonic even where
     * a section has gaps in it.
     */
    public static function nextSurveyCode(int $sectionNumber): string
    {
        $prefix = 'S' . $sectionNumber . '-';
        $stmt = self::db()->prepare(
            "SELECT MAX(CAST(SUBSTRING_INDEX(`lot_code`, '-', -1) AS UNSIGNED))
             FROM `" . static::$table . "` WHERE `lot_code` LIKE :prefix"
        );
        $stmt->execute(['prefix' => $prefix . '%']);
        $max = $stmt->fetchColumn();
        return $prefix . str_pad((string) (((int) $max) + 1), 3, '0', STR_PAD_LEFT);
    }

    public static function occupy(int $id): bool
    {
        return self::update($id, ['status' => 'occupied']);
    }

    public static function map(): array
    {
        // latitude/longitude are not selected: nothing in the SVG map reads
        // them, and at ~6,400 rows they are dead weight on the largest payload
        // the app sends. Use find() when a single lot's coordinates are needed.
        // Section fields beyond the name travel once, on the section.
        $stmt = self::db()->query(
            "SELECT l.lot_id, l.lot_code, l.block, l.lot_type, l.price, l.status,
                    l.svg_x, l.svg_y, l.svg_w, l.svg_h, l.svg_points, l.description,
                    s.section_id, s.section_name
             FROM cemetery_lots l
             JOIN cemetery_sections s ON s.section_id = l.section_id
             ORDER BY s.section_name, l.lot_code"
        );
        return self::rowsWithNumbers($stmt->fetchAll());
    }

    public static function grid(int $sectionId): array
    {
        $stmt = self::db()->prepare(
            "SELECT * FROM `" . static::$table . "`
             WHERE section_id = :section_id
             ORDER BY svg_y, svg_x, lot_code"
        );
        $stmt->execute(['section_id' => $sectionId]);
        return $stmt->fetchAll();
    }

    /** Count of reservations, burials and recorded owners attached to a lot (deletion guard). */
    public static function usage(int $id): array
    {
        $stmt = self::db()->prepare(
            "SELECT
                (SELECT COUNT(*) FROM `reservations` r WHERE r.`lot_id` = ?) AS `reservations`,
                (SELECT COUNT(*) FROM `burial_records` b WHERE b.`lot_id` = ?) AS `burials`,
                (SELECT COUNT(*) FROM `lot_owners` o WHERE o.`lot_id` = ?) AS `owners`"
        );
        $stmt->execute([$id, $id, $id]);
        $row = $stmt->fetch();
        return array_map('intval', $row ?: ['reservations' => 0, 'burials' => 0, 'owners' => 0]);
    }

    /**
     * Returns a lot to the available pool once nothing holds it: no pending or
     * approved reservation, no burial record and no recorded owner. A lot with
     * a burial or an owner against it is occupied whatever becomes of its
     * reservations. Locks the row, so call it inside the caller's transaction.
     */
    public static function releaseIfFree(int $id): void
    {
        $lot = self::findForUpdate($id);
        if (!$lot) {
            return;
        }

        $usage = self::usage($id);
        if ($usage['burials'] > 0 || $usage['owners'] > 0) {
            if ($lot['status'] !== 'occupied') {
                self::occupy($id);
            }
            return;
        }

        if ($lot['status'] !== 'available' && self::liveReservations($id) === 0) {
            self::update($id, ['status' => 'available']);
        }
    }

    /** Pending or approved reservations still holding a lot. */
    public static function liveReservations(int $id): int
    {
        $stmt = self::db()->prepare(
            "SELECT COUNT(*) FROM `reservations`
             WHERE `lot_id` = :id AND `approved_status` IN ('pending', 'approved')"
        );
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn();
    }

    /** Most slots any pending or approved reservation takes in a lot. */
    public static function largestLiveReservation(int $id): int
    {
        $stmt = self::db()->prepare(
            "SELECT COALESCE(MAX(`number_of_slots`), 0) FROM `reservations`
             WHERE `lot_id` = :id AND `approved_status` IN ('pending', 'approved')"
        );
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn();
    }

    public static function search(array $filters): array
    {
        $where = [];
        $params = [];

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(lot_code LIKE :q1 OR block LIKE :q2)';
            foreach (['q1', 'q2'] as $param) {
                $params[$param] = "%{$q}%";
            }
        }

        if (isset($filters['status']) && in_array($filters['status'], ['available', 'reserved', 'occupied'], true)) {
            $where[] = 'status = :status';
            $params['status'] = $filters['status'];
        }
        if (isset($filters['lot_type']) && in_array($filters['lot_type'], ['single', 'double', 'family'], true)) {
            $where[] = 'lot_type = :lot_type';
            $params['lot_type'] = $filters['lot_type'];
        }
        if (isset($filters['section_id']) && (int) $filters['section_id'] > 0) {
            $where[] = 'section_id = :section_id';
            $params['section_id'] = (int) $filters['section_id'];
        }

        $sql = "SELECT * FROM `" . static::$table . "`";
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY lot_code';
        [$limit, $offset] = self::paginate($filters, 200, 1000);
        $sql .= ' LIMIT :limit OFFSET :offset';

        $stmt = self::db()->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return self::rowsWithNumbers($stmt->fetchAll());
    }
}