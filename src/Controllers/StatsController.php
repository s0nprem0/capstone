<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Config\Database;

class StatsController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function dashboard(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $db = Database::connection();

        $totalLots = $db->query("SELECT COUNT(*) FROM cemetery_lots")->fetchColumn();
        $availableLots = $db->query("SELECT COUNT(*) FROM cemetery_lots WHERE status = 'available'")->fetchColumn();
        $reservedLots = $db->query("SELECT COUNT(*) FROM cemetery_lots WHERE status = 'reserved'")->fetchColumn();
        $occupiedLots = $db->query("SELECT COUNT(*) FROM cemetery_lots WHERE status = 'occupied'")->fetchColumn();

        $totalReservations = $db->query("SELECT COUNT(*) FROM reservations")->fetchColumn();
        $pendingReservations = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'pending'")->fetchColumn();
        $approvedReservations = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'approved'")->fetchColumn();
        $rejectedReservations = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'rejected'")->fetchColumn();

        $totalBurials = $db->query("SELECT COUNT(*) FROM burial_records")->fetchColumn();
        $pendingBurials = $db->query("SELECT COUNT(*) FROM burial_records WHERE interment_status = 'scheduled'")->fetchColumn();
        $interredBurials = $db->query("SELECT COUNT(*) FROM burial_records WHERE interment_status = 'interred'")->fetchColumn();

        $totalPayments = $db->query("SELECT COUNT(*) FROM payments")->fetchColumn();
        $pendingPayments = $db->query("SELECT COUNT(*) FROM payments WHERE payment_status = 'pending'")->fetchColumn();
        $totalRevenue = $db->query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'paid'")->fetchColumn();

        $totalUsers = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();

        $recentReservations = $db->query(
            "SELECT r.reservation_id, l.lot_code, u.fullname, r.reservation_date, r.approved_status, r.created_at
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN users u ON u.user_id = r.user_id
             ORDER BY r.created_at DESC LIMIT 5"
        )->fetchAll();

        $recentPayments = $db->query(
            "SELECT p.payment_id, p.amount, p.payment_method, p.payment_status, u.fullname, l.lot_code, p.payment_date
             FROM payments p
             JOIN reservations r ON r.reservation_id = p.reservation_id
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN users u ON u.user_id = r.user_id
             ORDER BY p.payment_id DESC LIMIT 5"
        )->fetchAll();

        Response::json([
            'lots' => [
                'total' => (int) $totalLots,
                'available' => (int) $availableLots,
                'reserved' => (int) $reservedLots,
                'occupied' => (int) $occupiedLots,
            ],
            'reservations' => [
                'total' => (int) $totalReservations,
                'pending' => (int) $pendingReservations,
                'approved' => (int) $approvedReservations,
                'rejected' => (int) $rejectedReservations,
            ],
            'burials' => [
                'total' => (int) $totalBurials,
                'pending' => (int) $pendingBurials,
                'interred' => (int) $interredBurials,
            ],
            'payments' => [
                'total' => (int) $totalPayments,
                'pending' => (int) $pendingPayments,
                'total_revenue' => (float) $totalRevenue,
            ],
            'users' => (int) $totalUsers,
            'recent_reservations' => $recentReservations,
            'recent_payments' => $recentPayments,
        ]);
    }
}
