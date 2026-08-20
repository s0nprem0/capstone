<?php

declare(strict_types=1);

namespace App\Models;

class Reservation extends Model
{
    protected static string $table = 'reservations';

    public static function all(): array
    {
        return parent::all(self::$table);
    }

    public static function find(int $id): ?array
    {
        return parent::find(self::$table, $id);
    }

    public static function create(array $data): int
    {
        return parent::create(self::$table, $data);
    }

    public static function update(int $id, array $data): bool
    {
        return parent::update(self::$table, $id, $data);
    }

    public static function delete(int $id): bool
    {
        return parent::delete(self::$table, $id);
    }
}
