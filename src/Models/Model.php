<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

class Model
{
    protected static string $table = '';

    protected static function db(): PDO
    {
        return Database::connection();
    }

    public static function all(): array
    {
        $stmt = self::db()->query("SELECT * FROM `" . static::$table . "` ORDER BY id DESC");
        return $stmt->fetchAll();
    }

    public static function find(int $id): ?array
    {
        $stmt = self::db()->prepare("SELECT * FROM `" . static::$table . "` WHERE id = :id");
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): int
    {
        $columns = implode(', ', array_map(fn($c) => "`{$c}`", array_keys($data)));
        $placeholders = implode(', ', array_fill(0, count($data), '?'));

        $stmt = self::db()->prepare(
            "INSERT INTO `" . static::$table . "` ({$columns}) VALUES ({$placeholders})"
        );
        $stmt->execute(array_values($data));
        return (int) self::db()->lastInsertId();
    }

    public static function update(int $id, array $data): bool
    {
        $set = implode(', ', array_map(fn($c) => "`{$c}` = ?", array_keys($data)));
        $stmt = self::db()->prepare(
            "UPDATE `" . static::$table . "` SET {$set} WHERE id = ?"
        );
        $params = array_merge(array_values($data), [$id]);
        return $stmt->execute($params);
    }

    public static function delete(int $id): bool
    {
        $stmt = self::db()->prepare("DELETE FROM `" . static::$table . "` WHERE id = ?");
        return $stmt->execute([$id]);
    }
}