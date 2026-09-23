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

    public static function search(array $filters, ?int $userId = null): array
    {
        $where = [];
        $params = [];

        if ($userId !== null) {
            $where[] = 'r.user_id = :user_id';
            $params['user_id'] = $userId;
        }

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(l.lot_code LIKE :q1 OR l.block LIKE :q2 OR u.fullname LIKE :q3 OR s.section_name LIKE :q4 OR r.purpose LIKE :q5)';
            foreach (['q1', 'q2', 'q3', 'q4', 'q5'] as $param) {
                $params[$param] = "%{$q}%";
            }
        }

        if (isset($filters['payment_status']) && in_array($filters['payment_status'], ['pending', 'paid', 'failed'], true)) {
            $where[] = 'r.payment_status = :payment_status';
            $params['payment_status'] = $filters['payment_status'];
        }
        if (isset($filters['approved_status']) && in_array($filters['approved_status'], ['pending', 'approved', 'rejected'], true)) {
            $where[] = 'r.approved_status = :approved_status';
            $params['approved_status'] = $filters['approved_status'];
        }
        if (isset($filters['section_id']) && (int) $filters['section_id'] > 0) {
            $where[] = 'l.section_id = :section_id';
            $params['section_id'] = (int) $filters['section_id'];
        }
        foreach (['from' => '>=', 'to' => '<='] as $key => $op) {
            if (isset($filters[$key]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $filters[$key])) {
                $where[] = "r.reservation_date {$op} :{$key}";
                $params[$key] = $filters[$key];
            }
        }

        $sql = "SELECT r.*, l.lot_code, s.section_name, u.fullname AS user_name, u.email AS user_email
                FROM reservations r
                JOIN cemetery_lots l ON l.lot_id = r.lot_id
                JOIN cemetery_sections s ON s.section_id = l.section_id
                JOIN users u ON u.user_id = r.user_id";
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY r.reservation_id DESC';

        $stmt = self::db()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}