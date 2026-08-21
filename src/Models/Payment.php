<?php

declare(strict_types=1);

namespace App\Models;

class Payment extends Model
{
    protected static string $table = 'payments';
    protected static string $primaryKey = 'payment_id';

    public static function forReservation(int $reservationId): array
    {
        $stmt = self::db()->prepare(
            "SELECT p.*, r.user_id, r.lot_id
             FROM payments p
             JOIN reservations r ON r.reservation_id = p.reservation_id
             WHERE p.reservation_id = :reservation_id
             ORDER BY p.payment_date DESC"
        );
        $stmt->execute(['reservation_id' => $reservationId]);
        return $stmt->fetchAll();
    }

    public static function forUser(int $userId): array
    {
        $stmt = self::db()->prepare(
            "SELECT p.*, r.lot_id, l.lot_code, r.total_amount AS reservation_amount
             FROM payments p
             JOIN reservations r ON r.reservation_id = p.reservation_id
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             WHERE r.user_id = :user_id
             ORDER BY p.payment_id DESC"
        );
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    public static function allWithDetails(): array
    {
        $stmt = self::db()->query(
            "SELECT p.*, r.user_id, r.lot_id, r.total_amount AS reservation_amount,
                    l.lot_code, u.fullname AS user_name
             FROM payments p
             JOIN reservations r ON r.reservation_id = p.reservation_id
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN users u ON u.user_id = r.user_id
             ORDER BY p.payment_id DESC"
        );
        return $stmt->fetchAll();
    }

    public static function withDetails(int $id): ?array
    {
        $stmt = self::db()->prepare(
            "SELECT p.*, r.user_id, r.lot_id, r.total_amount AS reservation_amount,
                    l.lot_code, u.fullname AS user_name, u.email AS user_email
             FROM payments p
             JOIN reservations r ON r.reservation_id = p.reservation_id
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN users u ON u.user_id = r.user_id
             WHERE p.payment_id = :id"
        );
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }
}
