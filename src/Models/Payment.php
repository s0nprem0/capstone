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

    /**
     * Collection totals for a reservation in a single round trip.
     *
     * - paid:     actually collected; alone decides when a reservation settles
     * - committed: paid + still-pending; caps how much more can be recorded
     * - payments: number of records, telling "all rejected" from "none exist"
     *
     * @return array{paid: float, committed: float, payments: int}
     */
    public static function totals(int $reservationId): array
    {
        $stmt = self::db()->prepare(
            "SELECT COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount END), 0) AS paid,
                    COALESCE(SUM(CASE WHEN payment_status <> 'failed' THEN amount END), 0) AS committed,
                    COUNT(*) AS payments
             FROM payments
             WHERE reservation_id = :id"
        );
        $stmt->execute(['id' => $reservationId]);
        $row = $stmt->fetch();

        return [
            'paid' => (float) ($row['paid'] ?? 0),
            'committed' => (float) ($row['committed'] ?? 0),
            'payments' => (int) ($row['payments'] ?? 0),
        ];
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
            $where[] = '(p.reference_no LIKE :q1 OR p.payment_method LIKE :q2 OR u.fullname LIKE :q3 OR l.lot_code LIKE :q4)';
            foreach (['q1', 'q2', 'q3', 'q4'] as $param) {
                $params[$param] = "%{$q}%";
            }
        }

        if (isset($filters['payment_status']) && in_array($filters['payment_status'], ['pending', 'paid', 'failed'], true)) {
            $where[] = 'p.payment_status = :payment_status';
            $params['payment_status'] = $filters['payment_status'];
        }
        if (isset($filters['payment_method']) && in_array($filters['payment_method'], ['gcash', 'card', 'cash'], true)) {
            $where[] = 'p.payment_method = :payment_method';
            $params['payment_method'] = $filters['payment_method'];
        }
        if (isset($filters['section_id']) && (int) $filters['section_id'] > 0) {
            $where[] = 'l.section_id = :section_id';
            $params['section_id'] = (int) $filters['section_id'];
        }
        foreach (['from' => '>=', 'to' => '<='] as $key => $op) {
            if (isset($filters[$key]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $filters[$key])) {
                $where[] = "p.payment_date {$op} :{$key}";
                $params[$key] = $filters[$key] . ' 00:00:00';
            }
        }

        $sql = "SELECT p.*, r.user_id, r.lot_id, r.total_amount AS reservation_amount,
                       l.lot_code, u.fullname AS user_name, u.email AS user_email
                FROM payments p
                JOIN reservations r ON r.reservation_id = p.reservation_id
                JOIN cemetery_lots l ON l.lot_id = r.lot_id
                JOIN users u ON u.user_id = r.user_id";
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY p.payment_id DESC';

        $stmt = self::db()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
