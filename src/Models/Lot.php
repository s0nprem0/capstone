<?php

declare(strict_types=1);

namespace App\Models;

class Lot extends Model
{
    protected static string $table = 'cemetery_lots';
    protected static string $primaryKey = 'lot_id';

    public static function available(): array
    {
        $stmt = self::db()->query("SELECT * FROM `" . static::$table . "` WHERE status = 'available' ORDER BY `lot_code`");
        return $stmt->fetchAll();
    }

    public static function reserve(int $id): bool
    {
        return self::update($id, ['status' => 'reserved']);
    }

    public static function occupy(int $id): bool
    {
        return self::update($id, ['status' => 'occupied']);
    }

    public static function map(): array
    {
        $stmt = self::db()->query(
            "SELECT l.lot_id, l.lot_code, l.block, l.lot_type, l.price, l.status,
                    l.latitude, l.longitude,
                    l.svg_x, l.svg_y, l.svg_w, l.svg_h, l.description,
                    s.section_id, s.section_name, s.location, s.svg_viewbox
             FROM cemetery_lots l
             JOIN cemetery_sections s ON s.section_id = l.section_id
             ORDER BY s.section_name, l.lot_code"
        );
        return $stmt->fetchAll();
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
}