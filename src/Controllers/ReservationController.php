<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Core\Validate;
use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\User;

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

        if (!Validate::date($date)) {
            Response::json(['error' => 'reservation_date must be a date in YYYY-MM-DD format'], 422);
            return;
        }
        // Staff encode bookings taken on paper, which can be dated earlier.
        if (Auth::role() === 'user' && $date < Validate::today()) {
            Response::json(['error' => 'reservation_date cannot be in the past'], 422);
            return;
        }

        $purpose = $this->purpose($input['purpose'] ?? null);
        if ($purpose === false) {
            Response::json(['error' => self::PURPOSE_ERROR], 422);
            return;
        }

        if (Auth::role() !== 'user') {
            $client = User::find($userId);
            if (!$client || $client['role'] !== 'user' || $client['status'] !== 'active') {
                Response::json(['error' => 'user_id must be an active client account'], 422);
                return;
            }
        }

        $pdo = Database::connection();

        try {
            $pdo->beginTransaction();

            // The client's row first, so two requests from the same visitor
            // queue here and cannot both slip under the pending limit.
            User::findForUpdate($userId);
            $limit = Reservation::maxPending();
            if (Auth::role() === 'user' && $limit > 0 && Reservation::pendingCount($userId) >= $limit) {
                $pdo->rollBack();
                Response::json(['error' => "You already have {$limit} reservations waiting for review. Wait for the office to approve or reject one before requesting another."], 422);
                return;
            }

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
                'purpose' => $purpose,
                'number_of_slots' => $slots,
                'total_amount' => (float) ($lot['price'] * $slots),
                'approved_status' => 'pending',
            ]);

            Lot::reserve($lotId);
            AuditLog::record(Auth::id(), 'create', 'reservations', $reservationId, AuditLog::snapshot(
                ['user_id' => $userId, 'lot_code' => $lot['lot_code'], 'number_of_slots' => $slots, 'total_amount' => (float) ($lot['price'] * $slots)],
                ['user_id', 'lot_code', 'number_of_slots', 'total_amount']
            ));

            // A request staff encode themselves needs no one told about it.
            if (Auth::role() === 'user') {
                $client = Auth::user()['fullname'] ?? 'a visitor';
                foreach (User::officeIds() as $officeId) {
                    Notification::createFor(
                        $officeId,
                        "New reservation #{$reservationId} for lot {$this->lotLabel($lotId)} from {$client} is waiting for review.",
                        'reservation',
                        $reservationId
                    );
                }
            }

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
            if (!Validate::date($input['reservation_date'])) {
                Response::json(['error' => 'reservation_date must be a date in YYYY-MM-DD format'], 422);
                return;
            }
            $data['reservation_date'] = $input['reservation_date'];
        }
        if (isset($input['purpose'])) {
            $purpose = $this->purpose($input['purpose']);
            if ($purpose === false) {
                Response::json(['error' => self::PURPOSE_ERROR], 422);
                return;
            }
            $data['purpose'] = $purpose;
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
            AuditLog::record(Auth::id(), 'update', 'reservations', $id, AuditLog::changes($reservation, $data));
        }

        Response::json(Reservation::withLot($id));
    }

    public function approve(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $this->decide($id, 'approved');
    }

    public function reject(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $this->decide($id, 'rejected');
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $pdo = Database::connection();

        try {
            $pdo->beginTransaction();
            $reservation = Reservation::findForUpdate($id);
            if (!$reservation) {
                $pdo->rollBack();
                Response::json(['error' => 'Not found'], 404);
                return;
            }
            if (Payment::countForReservation($id) > 0) {
                $pdo->rollBack();
                Response::json(['error' => 'This reservation has recorded payments and cannot be deleted. Reject it instead, or have an administrator remove the payments first.'], 422);
                return;
            }
            Reservation::delete($id);
            // A rejected reservation already let go of its lot, which may since
            // have been reserved by someone else.
            if ($reservation['approved_status'] !== 'rejected') {
                Lot::releaseIfFree((int) $reservation['lot_id']);
            }
            AuditLog::record(Auth::id(), 'delete', 'reservations', $id, AuditLog::snapshot(
                $reservation,
                ['user_id', 'lot_id', 'reservation_date', 'approved_status', 'total_amount']
            ));
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        Response::json(['message' => 'Deleted']);
    }

    /**
     * Approve or reject a pending reservation. The row is locked first, so two
     * staff deciding the same request at once cannot both act on it: the
     * second waits, then sees it is no longer pending.
     */
    private function decide(int $id, string $decision): void
    {
        $pdo = Database::connection();

        try {
            $pdo->beginTransaction();
            $reservation = Reservation::findForUpdate($id);
            if (!$reservation) {
                $pdo->rollBack();
                Response::json(['error' => 'Not found'], 404);
                return;
            }
            if ($reservation['approved_status'] !== 'pending') {
                $pdo->rollBack();
                Response::json(['error' => "Only pending reservations can be {$decision}"], 422);
                return;
            }

            $lotId = (int) $reservation['lot_id'];
            Reservation::update($id, ['approved_status' => $decision]);
            if ($decision === 'approved') {
                // Approval is what claims the plot, so it is the point the lot
                // stops being held and becomes owned by the client.
                $lot = Lot::findForUpdate($lotId);
                if ($lot && $lot['status'] === 'reserved') {
                    Lot::occupy($lotId);
                }
            } else {
                Lot::releaseIfFree($lotId);
            }

            AuditLog::record(
                Auth::id(),
                $decision === 'approved' ? 'approve' : 'reject',
                'reservations',
                $id,
                AuditLog::changes($reservation, ['approved_status' => $decision])
            );
            Notification::createFor(
                (int) $reservation['user_id'],
                "Your reservation #{$id} for lot {$this->lotLabel($lotId)} has been {$decision}.",
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

        Response::json(['message' => 'Reservation ' . $decision]);
    }

    private const PURPOSE_ERROR = 'purpose must be text of at most 100 characters';

    /** Trimmed purpose, null when blank, or false when it is not short text. */
    private function purpose(mixed $value): string|false|null
    {
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            return false;
        }
        $value = trim($value);
        if (mb_strlen($value) > 100) {
            return false;
        }
        return $value !== '' ? $value : null;
    }

    private function lotLabel(int $lotId): string
    {
        $lot = Lot::find($lotId);
        return $lot ? (string) $lot['lot_code'] : (string) $lotId;
    }
}