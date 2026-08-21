<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Config\Database;

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

        $items = $db->query(
            "SELECT r.*, l.lot_code, u.fullname AS user_name
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
            'items' => $items,
        ]);
    }

    public function payments(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $db = Database::connection();

        $total = $db->query("SELECT COUNT(*) FROM payments")->fetchColumn();
        $pending = $db->query("SELECT COUNT(*) FROM payments WHERE payment_status = 'pending'")->fetchColumn();
        $revenue = $db->query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'paid'")->fetchColumn();

        $items = $db->query(
            "SELECT p.*, l.lot_code, u.fullname AS user_name
             FROM payments p
             JOIN reservations r ON r.reservation_id = p.reservation_id
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN users u ON u.user_id = r.user_id
             ORDER BY p.payment_id DESC"
        )->fetchAll();

        Response::json([
            'total' => (int) $total,
            'pending' => (int) $pending,
            'total_revenue' => (float) $revenue,
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
            "SELECT b.*, l.lot_code, s.section_name
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

        $items = $db->query(
            "SELECT l.*, s.section_name
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

    public function auditLogs(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $db = Database::connection();

        $total = $db->query("SELECT COUNT(*) FROM audit_logs")->fetchColumn();

        $items = $db->query(
            "SELECT a.*, u.fullname AS user_name
             FROM audit_logs a
             LEFT JOIN users u ON u.user_id = a.user_id
             ORDER BY a.log_id DESC LIMIT 200"
        )->fetchAll();

        Response::json([
            'total' => (int) $total,
            'items' => $items,
        ]);
    }
}
