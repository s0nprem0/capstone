<?php

declare(strict_types=1);

namespace App\Models;

class Reservation extends Model
{
    protected static string $table = 'reservations';
    protected static string $primaryKey = 'reservation_id';

    public static function forUser(int $userId): array
    {
        $stmt = self::db()->prepare(
            "SELECT r.*, l.lot_code, s.section_name
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             WHERE r.user_id = :user_id
             ORDER BY r.reservation_id DESC"
        );
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    public static function withLot(int $id): ?array
    {
        $stmt = self::db()->prepare(
            "SELECT r.*, l.lot_code, s.section_name, u.fullname AS user_name, u.email AS user_email
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             JOIN users u ON u.user_id = r.user_id
             WHERE r.reservation_id = :id"
        );
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public static function allWithDetails(): array
    {
        $stmt = self::db()->query(
            "SELECT r.*, l.lot_code, s.section_name, u.fullname AS user_name, u.email AS user_email
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             JOIN users u ON u.user_id = r.user_id
             ORDER BY r.reservation_id DESC"
        );
        return $stmt->fetchAll();
    }
}