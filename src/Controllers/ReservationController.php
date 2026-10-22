<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\Notification;
use App\Models\Payment;
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
        Response::json(Reservation::search($_GET));
    }

    public function mine(): void
    {
        Auth::requireRole(['user']);
        Response::json(Reservation::search($_GET, Auth::id()));
    }

    public function show(int $id): void
    {
        if (!Auth::check()) {
            Response::json(['error' => 'Unauthenticated'], 401);
            return;
        }

        $reservation = Reservation::withLot($id);
        if (!$reservation) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $isStaff = in_array(Auth::role(), ['admin', 'staff'], true);
        if (!$isStaff && (int) $reservation['user_id'] !== Auth::id()) {
            Response::json(['error' => 'Forbidden'], 403);
            return;
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
            return;
        }

        $pdo = Database::connection();

        try {
            $pdo->beginTransaction();

            // Lock the lot row so concurrent requests cannot both claim it.
            $lot = Lot::findForUpdate($lotId);
            if (!$lot || $lot['status'] !== 'available') {
                $pdo->rollBack();
                Response::json(['error' => 'Lot is not available'], 422);
                return;
            }

            $maxSlots = Lot::capacity($lot);
            if ($slots > $maxSlots) {
                $pdo->rollBack();
                Response::json(['error' => "Lot capacity exceeded (max {$maxSlots} slots)"], 422);
                return;
            }

            $reservationId = Reservation::create([
                'user_id' => $userId,
                'lot_id' => $lotId,
                'reservation_date' => $date,
                'purpose' => $input['purpose'] ?? null,
                'number_of_slots' => $slots,
                'total_amount' => (float) ($lot['price'] * $slots),
                'approved_status' => 'pending',
            ]);

            Lot::reserve($lotId);
            AuditLog::record(Auth::id(), 'create', 'reservations', $reservationId);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

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

        if (isset($input['reservation_date']) && $input['reservation_date'] !== '') {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['reservation_date'])) {
                Response::json(['error' => 'reservation_date must be in YYYY-MM-DD format'], 422);
                return;
            }
            $data['reservation_date'] = $input['reservation_date'];
        }
        if (isset($input['purpose'])) {
            $data['purpose'] = $input['purpose'] !== '' ? $input['purpose'] : null;
        }
        if (isset($input['number_of_slots'])) {
            $slots = (int) $input['number_of_slots'];
            if ($slots < 1) {
                Response::json(['error' => 'number_of_slots must be at least 1'], 422);
                return;
            }
            $lot = Lot::find((int) $reservation['lot_id']);
            $maxSlots = $lot ? Lot::capacity($lot) : 1;
            if ($slots > $maxSlots) {
                Response::json(['error' => "Lot capacity exceeded (max {$maxSlots} slots)"], 422);
                return;
            }
            $data['number_of_slots'] = $slots;
        }
        if (isset($input['total_amount'])) {
            $amount = (float) $input['total_amount'];
            if ($amount < 0) {
                Response::json(['error' => 'total_amount must not be negative'], 422);
                return;
            }
            $data['total_amount'] = $amount;
        }

        if ($data !== []) {
            Reservation::update($id, $data);
            // total_amount may have moved, so the stored payment_status is stale.
            Payment::recomputeStatus($id);
            AuditLog::record(Auth::id(), 'update', 'reservations', $id);
        }

        Response::json(Reservation::withLot($id));
    }

    public function approve(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $reservation = Reservation::find($id);
        if (!$reservation) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        if ($reservation['approved_status'] !== 'pending') {
            Response::json(['error' => 'Only pending reservations can be approved'], 422);
            return;
        }
        Reservation::update($id, ['approved_status' => 'approved']);
        // Approval is what claims the plot, so it is the point the lot stops
        // being held and becomes owned by the client.
        $lot = Lot::find((int) $reservation['lot_id']);
        if ($lot && $lot['status'] === 'reserved') {
            Lot::occupy((int) $lot['lot_id']);
        }
        AuditLog::record(Auth::id(), 'approve', 'reservations', $id);
        Notification::createFor(
            (int) $reservation['user_id'],
            "Your reservation #{$id} for lot {$this->lotLabel((int) $reservation['lot_id'])} has been approved.",
            'reservation',
            $id
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
        if ($reservation['approved_status'] !== 'pending') {
            Response::json(['error' => 'Only pending reservations can be rejected'], 422);
            return;
        }
        Reservation::update($id, ['approved_status' => 'rejected']);
        $this->releaseLot((int) $reservation['lot_id']);
        AuditLog::record(Auth::id(), 'reject', 'reservations', $id);
        Notification::createFor(
            (int) $reservation['user_id'],
            "Your reservation #{$id} for lot {$this->lotLabel((int) $reservation['lot_id'])} has been rejected.",
            'reservation',
            $id
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
        if (Payment::countForReservation($id) > 0) {
            Response::json(['error' => 'This reservation has recorded payments and cannot be deleted. Reject it instead, or have an administrator remove the payments first.'], 422);
            return;
        }
        Reservation::delete($id);
        // A rejected reservation already let go of its lot, which may since
        // have been reserved by someone else.
        if ($reservation['approved_status'] !== 'rejected') {
            $this->releaseLot((int) $reservation['lot_id']);
        }
        AuditLog::record(Auth::id(), 'delete', 'reservations', $id);
        Response::json(['message' => 'Deleted']);
    }

    /**
     * Returns a lot to the available pool once nothing holds it: no other
     * pending or approved reservation and no burial record. A lot with a
     * burial against it is occupied whatever becomes of the reservation.
     */
    private function releaseLot(int $lotId): void
    {
        $lot = Lot::find($lotId);
        if (!$lot) {
            return;
        }

        if ((int) Lot::usage($lotId)['burials'] > 0) {
            if ($lot['status'] !== 'occupied') {
                Lot::occupy($lotId);
            }
            return;
        }

        if ($lot['status'] !== 'available' && Lot::liveReservations($lotId) === 0) {
            Lot::update($lotId, ['status' => 'available']);
        }
    }

    private function lotLabel(int $lotId): string
    {
        $lot = Lot::find($lotId);
        return $lot ? (string) $lot['lot_code'] : (string) $lotId;
    }
}