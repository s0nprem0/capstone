<?php

declare(strict_types=1);

namespace App\Models;

class BurialRecord extends Model
{
    protected static string $table = 'burial_records';
    protected static string $primaryKey = 'burial_id';

    public static function allWithDetails(): array
    {
        $stmt = self::db()->query(
            "SELECT b.*, l.lot_code, s.section_name
             FROM burial_records b
             JOIN cemetery_lots l ON l.lot_id = b.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             ORDER BY b.burial_id DESC"
        );
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
