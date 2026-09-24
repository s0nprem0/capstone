<?php

declare(strict_types=1);

namespace App\Models;

class CemeterySection extends Model
{
    protected static string $table = 'cemetery_sections';
    protected static string $primaryKey = 'section_id';

    public static function withCounts(): array
    {
        $stmt = self::db()->query(
            "SELECT s.*,
                COUNT(l.lot_id) AS lot_count,
                COALESCE(SUM(l.status = 'available'), 0) AS available,
                COALESCE(SUM(l.status = 'reserved'), 0) AS reserved,
                COALESCE(SUM(l.status = 'occupied'), 0) AS occupied
            FROM cemetery_sections s
            LEFT JOIN cemetery_lots l ON l.section_id = s.section_id
            GROUP BY s.section_id
            ORDER BY s.section_id ASC"
        );
        return $stmt->fetchAll();
    }

    public static function lotCount(int $id): int
    {
        $stmt = self::db()->prepare("SELECT COUNT(*) FROM cemetery_lots WHERE section_id = :id");
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn();
    }
}