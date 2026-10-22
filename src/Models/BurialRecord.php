<?php

declare(strict_types=1);

namespace App\Models;

class BurialRecord extends Model
{
    protected static string $table = 'burial_records';
    protected static string $primaryKey = 'burial_id';

    /**
     * Burials taking a grave slot in a lot. Cremated remains do not use a
     * slot, so they are not counted against the lot's capacity.
     */
    public static function slotsUsed(int $lotId, ?int $exceptId = null): int
    {
        $stmt = self::db()->prepare(
            "SELECT COUNT(*) FROM `burial_records`
             WHERE `lot_id` = :lot_id AND `burial_type` <> 'cremation' AND `burial_id` <> :except"
        );
        $stmt->execute(['lot_id' => $lotId, 'except' => $exceptId ?? 0]);
        return (int) $stmt->fetchColumn();
    }

    public static function search(array $filters): array
    {
        $where = [];
        $params = [];

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(b.deceased_fullname LIKE :q1 OR l.lot_code LIKE :q2 OR s.section_name LIKE :q3 OR b.next_of_kin_name LIKE :q4)';
            foreach (['q1', 'q2', 'q3', 'q4'] as $param) {
                $params[$param] = "%{$q}%";
            }
        }

        if (isset($filters['interment_status']) && in_array($filters['interment_status'], ['scheduled', 'interred'], true)) {
            $where[] = 'b.interment_status = :interment_status';
            $params['interment_status'] = $filters['interment_status'];
        }
        if (isset($filters['burial_type']) && in_array($filters['burial_type'], ['single', 'double', 'family', 'cremation'], true)) {
            $where[] = 'b.burial_type = :burial_type';
            $params['burial_type'] = $filters['burial_type'];
        }
        if (isset($filters['section_id']) && (int) $filters['section_id'] > 0) {
            $where[] = 'l.section_id = :section_id';
            $params['section_id'] = (int) $filters['section_id'];
        }
        if (isset($filters['lot_id']) && (int) $filters['lot_id'] > 0) {
            $where[] = 'b.lot_id = :lot_id';
            $params['lot_id'] = (int) $filters['lot_id'];
        }
        foreach (['from' => '>=', 'to' => '<='] as $key => $op) {
            if (isset($filters[$key]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $filters[$key])) {
                $where[] = "b.burial_date {$op} :{$key}";
                $params[$key] = $filters[$key];
            }
        }

        $sql = "SELECT b.*, l.lot_code, s.section_name
                FROM burial_records b
                JOIN cemetery_lots l ON l.lot_id = b.lot_id
                JOIN cemetery_sections s ON s.section_id = l.section_id";
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY b.burial_id DESC';

        $stmt = self::db()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * The public memorial search: what a headstone says and where it stands.
     * Next-of-kin details and scheduled burials stay in the register. Every
     * word of the name must match, so "santos lourdes" finds "Lourdes P. Santos".
     */
    public static function memorials(array $words = [], ?int $lotId = null, int $limit = 50): array
    {
        $where = ["b.interment_status = 'interred'"];
        $params = [];
        foreach (array_values($words) as $i => $word) {
            $where[] = "b.deceased_fullname LIKE :w{$i}";
            $params["w{$i}"] = '%' . addcslashes($word, '%_\\') . '%';
        }
        if ($lotId !== null) {
            $where[] = 'b.lot_id = :lot_id';
            $params['lot_id'] = $lotId;
        }

        $stmt = self::db()->prepare(
            "SELECT b.deceased_fullname, b.date_of_death, b.lot_id, l.lot_code, s.section_name
             FROM burial_records b
             JOIN cemetery_lots l ON l.lot_id = b.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             WHERE " . implode(' AND ', $where) . "
             ORDER BY b.deceased_fullname, b.burial_id
             LIMIT " . $limit
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function withDetails(int $id): ?array
    {
        $stmt = self::db()->prepare(
            "SELECT b.*, l.lot_code, s.section_name
             FROM burial_records b
             JOIN cemetery_lots l ON l.lot_id = b.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             WHERE b.burial_id = :id"
        );
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }
}
