<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\Notification;
use App\Models\Reservation;

class ReservationController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(): void
    {
        Auth::requireRole(['admin', 'staff']);
        Response::json(Reservation::allWithDetails());
    }

    public function mine(): void
    {
        Auth::requireRole(['user']);
        Response::json(Reservation::forUser(Auth::id()));
    }

    public function show(int $id): void
    {
        $reservation = Reservation::withLot($id);
        if (!$reservation) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        if (Auth::role() === 'user' && (int) $reservation['user_id'] !== Auth::id()) {
            Response::json(['error' => 'Forbidden'], 403);
            exit;
        }

        Response::json($reservation);
    }

    public function store(): void
    {
        Auth::requireRole(['user', 'admin', 'staff']);
        $input = $this->router->input();

        $lotId = (int) ($input['lot_id'] ?? 0);
        $userId = (int) ($input['user_id'] ?? Auth::id());
        $date = $input['reservation_date'] ?? '';
        $slots = (int) ($input['number_of_slots'] ?? 1);

        if ($userId <= 0 || $lotId <= 0 || $date === '' || $slots < 1) {
            Response::json(['error' => 'lot_id, user_id, reservation_date and number_of_slots are required'], 422);
            return;
        }

        if (Auth::role() === 'user' && $userId !== Auth::id()) {
            Response::json(['error' => 'Forbidden'], 403);
            exit;
        }

        $lot = Lot::find($lotId);
        if (!$lot || $lot['status'] !== 'available') {
            Response::json(['error' => 'Lot is not available'], 422);
            return;
        }

        $reservationId = Reservation::create([
            'user_id' => $userId,
            'lot_id' => $lotId,
            'reservation_date' => $date,
            'purpose' => $input['purpose'] ?? null,
            'number_of_slots' => $slots,
            'total_amount' => (float) ($input['total_amount'] ?? ($lot['price'] * $slots)),
            'payment_status' => 'pending',
            'approved_status' => 'pending',
        ]);

        Lot::reserve($lotId);
        AuditLog::record(Auth::id(), 'create', 'reservations', $reservationId);

        Response::json(Reservation::withLot($reservationId), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $reservation = Reservation::find($id);
        if (!$reservation) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $input = $this->router->input();
        $data = [];

        if (isset($input['reservation_date'])) {
            $data['reservation_date'] = $input['reservation_date'];
        }
        if (isset($input['purpose'])) {
            $data['purpose'] = $input['purpose'];
        }
        if (isset($input['number_of_slots'])) {
            $data['number_of_slots'] = (int) $input['number_of_slots'];
        }
        if (isset($input['total_amount'])) {
            $data['total_amount'] = (float) $input['total_amount'];
        }
        if (isset($input['payment_status'])) {
            $data['payment_status'] = $input['payment_status'];
        }

        if ($data !== []) {
            Reservation::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'reservations', $id);
        }

        Response::json(Reservation::withLot($id));
    }

    public function approve(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        if (!Reservation::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Reservation::update($id, ['approved_status' => 'approved']);
        AuditLog::record(Auth::id(), 'approve', 'reservations', $id);
        Notification::createFor(
            (int) $reservation['user_id'],
            "Your reservation #{$id} for lot " . ($reservation['lot_id']) . " has been approved.",
            'reservation'
        );
        Response::json(['message' => 'Reservation approved']);
    }

    public function reject(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $reservation = Reservation::find($id);
        if (!$reservation) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Reservation::update($id, ['approved_status' => 'rejected']);
        Lot::update((int) $reservation['lot_id'], ['status' => 'available']);
        AuditLog::record(Auth::id(), 'reject', 'reservations', $id);
        Notification::createFor(
            (int) $reservation['user_id'],
            "Your reservation #{$id} for lot " . ($reservation['lot_id']) . " has been rejected.",
            'reservation'
        );
        Response::json(['message' => 'Reservation rejected']);
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $reservation = Reservation::find($id);
        if (!$reservation) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Reservation::delete($id);
        Lot::update((int) $reservation['lot_id'], ['status' => 'available']);
        AuditLog::record(Auth::id(), 'delete', 'reservations', $id);
        Response::json(['message' => 'Deleted']);
    }
}