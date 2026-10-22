<?php

declare(strict_types=1);

namespace App\Models;

class Payment extends Model
{
    protected static string $table = 'payments';
    protected static string $primaryKey = 'payment_id';

    public const METHODS = ['cash', 'gcash', 'bank_transfer', 'cheque', 'other'];

    /** @param int|null $userId restrict to one client's reservations (visitor view) */
    public static function search(array $filters, ?int $userId = null): array
    {
        $where = [];
        $params = [];

        if ($userId !== null) {
            $where[] = 'r.user_id = :user_id';
            $params['user_id'] = $userId;
        }
        if (isset($filters['reservation_id']) && (int) $filters['reservation_id'] > 0) {
            $where[] = 'p.reservation_id = :reservation_id';
            $params['reservation_id'] = (int) $filters['reservation_id'];
        }

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(l.lot_code LIKE :q1 OR u.fullname LIKE :q2 OR p.reference_no LIKE :q3)';
            foreach (['q1', 'q2', 'q3'] as $param) {
                $params[$param] = "%{$q}%";
            }
        }
        if (isset($filters['method']) && in_array($filters['method'], self::METHODS, true)) {
            $where[] = 'p.method = :method';
            $params['method'] = $filters['method'];
        }
        foreach (['from' => '>=', 'to' => '<='] as $key => $op) {
            if (isset($filters[$key]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $filters[$key])) {
                $where[] = "p.payment_date {$op} :{$key}";
                $params[$key] = $filters[$key];
            }
        }

        $sql = self::select() . self::joins();
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY p.payment_date DESC, p.payment_id DESC LIMIT 1000';

        $stmt = self::db()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function withDetails(int $id): ?array
    {
        $stmt = self::db()->prepare(self::select() . self::joins() . ' WHERE p.payment_id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public static function countForReservation(int $reservationId): int
    {
        $stmt = self::db()->prepare("SELECT COUNT(*) FROM `payments` WHERE `reservation_id` = :id");
        $stmt->execute(['id' => $reservationId]);
        return (int) $stmt->fetchColumn();
    }

    public static function totalForReservation(int $reservationId): float
    {
        $stmt = self::db()->prepare(
            "SELECT COALESCE(SUM(`amount`), 0) FROM `payments` WHERE `reservation_id` = :id"
        );
        $stmt->execute(['id' => $reservationId]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * Recompute a reservation's stored payment_status from its payments. Called
     * after any payment change and after the reservation's amount changes, so
     * the stored value never drifts from the rows it summarises.
     */
    public static function recomputeStatus(int $reservationId): void
    {
        $reservation = Reservation::find($reservationId);
        if (!$reservation) {
            return;
        }
        $paid = self::totalForReservation($reservationId);
        $total = (float) $reservation['total_amount'];
        $status = $paid <= 0 ? 'unpaid' : ($paid >= $total ? 'paid' : 'partial');
        Reservation::update($reservationId, ['payment_status' => $status]);
    }

    /** Totals for the dashboard and the payments report. */
    public static function summary(): array
    {
        $db = self::db();
        $total = (float) $db->query("SELECT COALESCE(SUM(`amount`), 0) FROM `payments`")->fetchColumn();
        $count = (int) $db->query("SELECT COUNT(*) FROM `payments`")->fetchColumn();
        $thisMonth = (float) $db->query(
            "SELECT COALESCE(SUM(`amount`), 0) FROM `payments`
             WHERE `payment_date` >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')"
        )->fetchColumn();

        $byMethod = $db->query(
            "SELECT `method`, COUNT(*) AS `count`, COALESCE(SUM(`amount`), 0) AS `total`
             FROM `payments` GROUP BY `method` ORDER BY `total` DESC"
        )->fetchAll();

        return ['total' => $total, 'count' => $count, 'this_month' => $thisMonth, 'by_method' => $byMethod];
    }

    private static function select(): string
    {
        return "SELECT p.*, r.total_amount, r.approved_status, r.payment_status,
                       r.user_id, l.lot_id, l.lot_code, s.section_name,
                       u.fullname AS user_name, rec.fullname AS recorded_by_name
                FROM `payments` p";
    }

    private static function joins(): string
    {
        return " JOIN `reservations` r ON r.reservation_id = p.reservation_id
                 JOIN `cemetery_lots` l ON l.lot_id = r.lot_id
                 JOIN `cemetery_sections` s ON s.section_id = l.section_id
                 JOIN `users` u ON u.user_id = r.user_id
                 LEFT JOIN `users` rec ON rec.user_id = p.recorded_by";
    }
}
