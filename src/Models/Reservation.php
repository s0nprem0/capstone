<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Validate;

class Reservation extends Model
{
    protected static string $table = 'reservations';
    protected static string $primaryKey = 'reservation_id';

    /** Pending requests one client may hold at once; 0 turns the limit off. */
    public static function maxPending(): int
    {
        return max(0, (int) ($_ENV['RESERVATION_MAX_PENDING'] ?? 3));
    }

    /**
     * When an unpaid pending request will expire, by the same rule
     * expireStale() applies; null once it is decided, paid, or holds never
     * expire. Computed in SQL so it shares NOW()'s clock with the expiry.
     */
    private const HOLD_UNTIL = "CASE WHEN r.approved_status = 'pending' AND :hold_a > 0
                     AND NOT EXISTS (SELECT 1 FROM payments hp WHERE hp.reservation_id = r.reservation_id)
                 THEN r.created_at + INTERVAL :hold_b DAY END AS hold_until";

    /** @return array{hold_a: int, hold_b: int} */
    private static function holdParams(): array
    {
        $days = self::holdDays();
        return ['hold_a' => $days, 'hold_b' => $days];
    }

    /** Days an unpaid pending request holds its plot; 0 keeps holds forever. */
    public static function holdDays(): int
    {
        return max(0, (int) ($_ENV['RESERVATION_HOLD_DAYS'] ?? 7));
    }

    public static function pendingCount(int $userId): int
    {
        $stmt = self::db()->prepare(
            "SELECT COUNT(*) FROM `reservations` WHERE `user_id` = :id AND `approved_status` = 'pending'"
        );
        $stmt->execute(['id' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Turn away pending requests that have held a plot past the hold period
     * without a payment, and put their plots back on the map. Without this a
     * request nobody follows up keeps a plot off the market for good.
     *
     * Run on every API request rather than from cron, which XAMPP does not
     * have; the lookup is one indexed query and usually finds nothing. A
     * request with a payment against it is never expired: the family is
     * already paying and staff decide it.
     */
    public static function expireStale(): void
    {
        $days = self::holdDays();
        if ($days === 0) {
            return;
        }

        $stmt = self::db()->prepare(
            "SELECT r.`reservation_id` FROM `reservations` r
             WHERE r.`approved_status` = 'pending'
               AND r.`created_at` < NOW() - INTERVAL :days DAY
               AND NOT EXISTS (SELECT 1 FROM `payments` p WHERE p.`reservation_id` = r.`reservation_id`)"
        );
        $stmt->bindValue(':days', $days, \PDO::PARAM_INT);
        $stmt->execute();

        foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $id) {
            self::expire((int) $id, $days);
        }
    }

    private static function expire(int $id, int $days): void
    {
        $pdo = self::db();
        try {
            $pdo->beginTransaction();
            $reservation = self::findForUpdate($id);
            // Re-checked under the lock: staff may have decided it, or recorded
            // a payment, since the lookup.
            if (!$reservation || $reservation['approved_status'] !== 'pending' || Payment::countForReservation($id) > 0) {
                $pdo->rollBack();
                return;
            }
            self::update($id, ['approved_status' => 'rejected']);
            Lot::releaseIfFree((int) $reservation['lot_id']);
            AuditLog::record(null, 'expire', 'reservations', $id, AuditLog::changes($reservation, ['approved_status' => 'rejected']));
            $lot = Lot::find((int) $reservation['lot_id']);
            Notification::createFor(
                (int) $reservation['user_id'],
                "Your reservation #{$id} for lot " . ($lot['lot_code'] ?? $reservation['lot_id'])
                    . " expired after {$days} days without a payment, and the lot was released. Contact the office to book again.",
                'reservation',
                $id
            );
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function findForUpdate(int $id): ?array
    {
        $stmt = self::db()->prepare("SELECT * FROM `reservations` WHERE `reservation_id` = :id FOR UPDATE");
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public static function forUser(int $userId): array
    {
        $stmt = self::db()->prepare(
            "SELECT r.*, l.lot_code, s.section_name,
                    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = r.reservation_id), 0) AS amount_paid,
                    " . self::HOLD_UNTIL . "
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             WHERE r.user_id = :user_id
             ORDER BY r.reservation_id DESC"
        );
        $stmt->execute(['user_id' => $userId] + self::holdParams());
        return $stmt->fetchAll();
    }

    public static function withLot(int $id): ?array
    {
        $stmt = self::db()->prepare(
            "SELECT r.*, l.lot_code, s.section_name, u.fullname AS user_name, u.email AS user_email,
                    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = r.reservation_id), 0) AS amount_paid,
                    " . self::HOLD_UNTIL . "
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             JOIN users u ON u.user_id = r.user_id
             WHERE r.reservation_id = :id"
        );
        $stmt->execute(['id' => $id] + self::holdParams());
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

        if (isset($filters['approved_status']) && in_array($filters['approved_status'], ['pending', 'approved', 'rejected', 'cancelled'], true)) {
            $where[] = 'r.approved_status = :approved_status';
            $params['approved_status'] = $filters['approved_status'];
        }
        if (isset($filters['section_id']) && (int) $filters['section_id'] > 0) {
            $where[] = 'l.section_id = :section_id';
            $params['section_id'] = (int) $filters['section_id'];
        }
        foreach (['from' => '>=', 'to' => '<='] as $key => $op) {
            if (isset($filters[$key]) && Validate::date($filters[$key] ?? null)) {
                $where[] = "r.reservation_date {$op} :{$key}";
                $params[$key] = $filters[$key];
            }
        }

        $sql = "SELECT r.*, l.lot_code, s.section_name, u.fullname AS user_name, u.email AS user_email,
                       COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = r.reservation_id), 0) AS amount_paid,
                    " . self::HOLD_UNTIL . "
                FROM reservations r
                JOIN cemetery_lots l ON l.lot_id = r.lot_id
                JOIN cemetery_sections s ON s.section_id = l.section_id
                JOIN users u ON u.user_id = r.user_id";
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY r.reservation_id DESC';

        $stmt = self::db()->prepare($sql);
        $stmt->execute($params + self::holdParams());
        return $stmt->fetchAll();
    }
}