<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Config\Database;
use App\Models\Payment;

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
        $cancelledReservations = $db->query("SELECT COUNT(*) FROM reservations WHERE approved_status = 'cancelled'")->fetchColumn();

        $totalBurials = $db->query("SELECT COUNT(*) FROM burial_records")->fetchColumn();
        $pendingBurials = $db->query("SELECT COUNT(*) FROM burial_records WHERE interment_status = 'scheduled'")->fetchColumn();
        $interredBurials = $db->query("SELECT COUNT(*) FROM burial_records WHERE interment_status = 'interred'")->fetchColumn();

        $totalUsers = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();

        $payments = Payment::summary();

        $recentReservations = $db->query(
            "SELECT r.reservation_id, l.lot_code, u.fullname, r.reservation_date, r.approved_status, r.created_at
             FROM reservations r
             JOIN cemetery_lots l ON l.lot_id = r.lot_id
             JOIN users u ON u.user_id = r.user_id
             ORDER BY r.created_at DESC LIMIT 5"
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
                'cancelled' => (int) $cancelledReservations,
            ],
            'burials' => [
                'total' => (int) $totalBurials,
                'pending' => (int) $pendingBurials,
                'interred' => (int) $interredBurials,
            ],
            'users' => (int) $totalUsers,
            'payments' => [
                'total' => $payments['total'],
                'this_month' => $payments['this_month'],
                'count' => $payments['count'],
            ],
            'recent_reservations' => $recentReservations,
        ]);
    }
}
