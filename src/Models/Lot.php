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
}