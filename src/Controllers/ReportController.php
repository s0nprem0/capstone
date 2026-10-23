<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Core\Validate;
use App\Config\Database;
use App\Models\Payment;

class ReportController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function reservations(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $db = Database::connection();

        $total = $db->query("SELECT COUNT(*) FROM reservations")->fetchColumn();
        $pending = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'pending'")->fetchColumn();
        $approved = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'approved'")->fetchColumn();
        $rejected = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'rejected'")->fetchColumn();
        $cancelled = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'cancelled'")->fetchColumn();

        $items = $db->query(
            "SELECT r.reservation_id, r.reservation_date, r.total_amount, r.approved_status,
                    l.lot_code, u.fullname AS user_name
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN users u ON u.user_id = r.user_id
             ORDER BY r.reservation_id DESC"
        )->fetchAll();

        Response::json([
            'total' => (int) $total,
            'pending' => (int) $pending,
            'approved' => (int) $approved,
            'rejected' => (int) $rejected,
            'cancelled' => (int) $cancelled,
            'items' => $items,
        ]);
    }

    public function burialRecords(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $db = Database::connection();

        $total = $db->query("SELECT COUNT(*) FROM burial_records")->fetchColumn();
        $scheduled = $db->query("SELECT COUNT(*) FROM burial_records WHERE interment_status = 'scheduled'")->fetchColumn();
        $interred = $db->query("SELECT COUNT(*) FROM burial_records WHERE interment_status = 'interred'")->fetchColumn();

        $items = $db->query(
            "SELECT b.burial_id, b.deceased_fullname, b.burial_date, b.burial_type, b.interment_status,
                    l.lot_code, s.section_name
             FROM burial_records b
             JOIN cemetery_lots l ON l.lot_id = b.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             ORDER BY b.burial_id DESC"
        )->fetchAll();

        Response::json([
            'total' => (int) $total,
            'scheduled' => (int) $scheduled,
            'interred' => (int) $interred,
            'items' => $items,
        ]);
    }

    public function availability(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $db = Database::connection();

        $total = $db->query("SELECT COUNT(*) FROM cemetery_lots")->fetchColumn();
        $available = $db->query("SELECT COUNT(*) FROM cemetery_lots WHERE status = 'available'")->fetchColumn();
        $reserved = $db->query("SELECT COUNT(*) FROM cemetery_lots WHERE status = 'reserved'")->fetchColumn();
        $occupied = $db->query("SELECT COUNT(*) FROM cemetery_lots WHERE status = 'occupied'")->fetchColumn();

        // Every plot, but only the columns the report renders: a report that
        // silently stops partway is worse than a large one.
        $items = $db->query(
            "SELECT l.lot_id, l.lot_code, l.lot_type, l.block, l.price, l.status, s.section_name
             FROM cemetery_lots l
             JOIN cemetery_sections s ON s.section_id = l.section_id
             ORDER BY s.section_name, l.lot_code"
        )->fetchAll();

        Response::json([
            'total' => (int) $total,
            'available' => (int) $available,
            'reserved' => (int) $reserved,
            'occupied' => (int) $occupied,
            'items' => $items,
        ]);
    }

    public function payments(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $db = Database::connection();

        $summary = Payment::summary();

        $items = $db->query(
            "SELECT p.payment_id, p.amount, p.method, p.reference_no, p.payment_date,
                    r.reservation_id, l.lot_code, s.section_name, u.fullname AS user_name,
                    rec.fullname AS recorded_by_name
             FROM payments p
             JOIN reservations r ON r.reservation_id = p.reservation_id
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN cemetery_sections s ON s.section_id = l.section_id
             JOIN users u ON u.user_id = r.user_id
             LEFT JOIN users rec ON rec.user_id = p.recorded_by
             ORDER BY p.payment_date DESC, p.payment_id DESC"
        )->fetchAll();

        Response::json([
            'total' => $summary['total'],
            'count' => $summary['count'],
            'this_month' => $summary['this_month'],
            'by_method' => $summary['by_method'],
            'items' => $items,
        ]);
    }

    public function auditLogs(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $range = $this->range();
        if ($range === null) {
            return;
        }
        $db = Database::connection();

        [$where, $params] = $this->between('a.created_at', $range, true);

        $stmt = $db->prepare("SELECT COUNT(*) FROM audit_logs a {$where}");
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        // Paged rather than capped, so the whole trail for a period stays
        // reachable: the page asks for the next block, and the CSV export walks
        // every block.
        $limit = max(1, min(1000, (int) ($_GET['limit'] ?? 200)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));
        $stmt = $db->prepare(
            "SELECT a.*, u.fullname AS user_name
             FROM audit_logs a
             LEFT JOIN users u ON u.user_id = a.user_id
             {$where}
             ORDER BY a.log_id DESC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
        $stmt->execute();

        Response::json([
            'total' => $total,
            'offset' => $offset,
            'items' => $stmt->fetchAll(),
        ]);
    }

    /**
     * Activity in a date range, for the Reports page. Plot availability is a
     * snapshot of now: a plot's status has no history to look back through.
     */
    public function summary(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $range = $this->range();
        if ($range === null) {
            return;
        }
        $db = Database::connection();

        [$where, $params] = $this->between('created_at', $range, true);
        $stmt = $db->prepare(
            "SELECT approved_status, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS value
             FROM reservations {$where} GROUP BY approved_status"
        );
        $stmt->execute($params);
        $reservations = ['pending' => 0, 'approved' => 0, 'rejected' => 0, 'cancelled' => 0, 'total' => 0, 'value' => 0.0];
        foreach ($stmt->fetchAll() as $row) {
            $reservations[$row['approved_status']] = (int) $row['count'];
            $reservations['total'] += (int) $row['count'];
            $reservations['value'] += (float) $row['value'];
        }

        [$where, $params] = $this->between('payment_date', $range);
        $stmt = $db->prepare(
            "SELECT method, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
             FROM payments {$where} GROUP BY method ORDER BY total DESC"
        );
        $stmt->execute($params);
        $byMethod = array_map(
            fn (array $row) => ['method' => $row['method'], 'count' => (int) $row['count'], 'total' => (float) $row['total']],
            $stmt->fetchAll()
        );
        $payments = [
            'total' => array_sum(array_column($byMethod, 'total')),
            'count' => array_sum(array_column($byMethod, 'count')),
            'by_method' => $byMethod,
        ];

        [$where, $params] = $this->between('burial_date', $range);
        $stmt = $db->prepare(
            "SELECT interment_status, COUNT(*) AS count FROM burial_records {$where} GROUP BY interment_status"
        );
        $stmt->execute($params);
        $burials = ['scheduled' => 0, 'interred' => 0, 'total' => 0];
        foreach ($stmt->fetchAll() as $row) {
            $burials[$row['interment_status']] = (int) $row['count'];
            $burials['total'] += (int) $row['count'];
        }

        $sections = $db->query(
            "SELECT s.section_id, s.section_name,
                    COUNT(l.lot_id) AS total,
                    COALESCE(SUM(l.status = 'available'), 0) AS available,
                    COALESCE(SUM(l.status = 'reserved'), 0) AS reserved,
                    COALESCE(SUM(l.status = 'occupied'), 0) AS occupied
             FROM cemetery_sections s
             LEFT JOIN cemetery_lots l ON l.section_id = s.section_id
             GROUP BY s.section_id, s.section_name
             ORDER BY LENGTH(s.section_name), s.section_name"
        )->fetchAll();
        $sections = array_map(fn (array $row) => [
            'section_id' => (int) $row['section_id'],
            'section_name' => $row['section_name'],
            'total' => (int) $row['total'],
            'available' => (int) $row['available'],
            'reserved' => (int) $row['reserved'],
            'occupied' => (int) $row['occupied'],
        ], $sections);

        Response::json([
            'from' => $range['from'],
            'to' => $range['to'],
            'reservations' => $reservations,
            'payments' => $payments,
            'burials' => $burials,
            'lots' => [
                'total' => array_sum(array_column($sections, 'total')),
                'available' => array_sum(array_column($sections, 'available')),
                'reserved' => array_sum(array_column($sections, 'reserved')),
                'occupied' => array_sum(array_column($sections, 'occupied')),
                'sections' => $sections,
            ],
        ]);
    }

    /**
     * The optional ?from= and ?to= dates (inclusive, YYYY-MM-DD). Answers 422
     * and returns null for anything else, so a bad date is never silently
     * read as "all time".
     *
     * @return array{from: ?string, to: ?string}|null
     */
    private function range(): ?array
    {
        $range = [];
        foreach (['from', 'to'] as $key) {
            $value = trim((string) ($_GET[$key] ?? ''));
            if ($value === '') {
                $range[$key] = null;
                continue;
            }
            if (!Validate::date($value)) {
                Response::json(['error' => "{$key} must be a date in YYYY-MM-DD format"], 422);
                return null;
            }
            $range[$key] = $value;
        }
        if ($range['from'] !== null && $range['to'] !== null && $range['from'] > $range['to']) {
            Response::json(['error' => 'from must not be after to'], 422);
            return null;
        }
        return $range;
    }

    /**
     * A WHERE clause bounding $column to the range. A DATETIME column runs up
     * to the start of the day after `to`, so the whole of that day counts.
     *
     * @param array{from: ?string, to: ?string} $range
     * @return array{0: string, 1: array<string, string>}
     */
    private function between(string $column, array $range, bool $datetime = false): array
    {
        $clauses = [];
        $params = [];
        if ($range['from'] !== null) {
            $clauses[] = "{$column} >= :from";
            $params['from'] = $range['from'];
        }
        if ($range['to'] !== null) {
            if ($datetime) {
                $clauses[] = "{$column} < :to";
                $params['to'] = (new \DateTimeImmutable($range['to']))->modify('+1 day')->format('Y-m-d');
            } else {
                $clauses[] = "{$column} <= :to";
                $params['to'] = $range['to'];
            }
        }
        return [$clauses ? 'WHERE ' . implode(' AND ', $clauses) : '', $params];
    }
}
