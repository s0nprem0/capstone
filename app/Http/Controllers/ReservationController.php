<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\StoreReservationRequest;
use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ReservationController extends Controller
{
    private const PURPOSE_RULES = ['nullable', 'string', 'max:100'];
    private const PURPOSE_ERROR = 'purpose must be text of at most 100 characters';

    public function index(Request $request): JsonResponse
    {
        return response()->json(Reservation::search($request->query()));
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json(Reservation::search($request->query(), Auth::id()));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $reservation = Reservation::withDetails($id);
        if (!$reservation) {
            return $this->error('Not found', 404);
        }
        if (!$request->user()->isOffice() && $reservation->user_id !== $request->user()->user_id) {
            return $this->error('Forbidden', 403);
        }
        return response()->json($reservation);
    }

    public function store(StoreReservationRequest $request): JsonResponse
    {
        $data = $request->validated();
        $actor = $request->user();
        $userId = (int) $data['user_id'];
        $lotId = (int) $data['lot_id'];
        $slots = (int) $data['number_of_slots'];
        $purpose = ($data['purpose'] ?? '') !== '' ? $data['purpose'] : null;

        if ($actor->role !== 'user') {
            $client = User::find($userId);
            if (!$client || $client->role !== 'user' || $client->status !== 'active') {
                return $this->error('user_id must be an active client account');
            }
        }

        return DB::transaction(function () use ($actor, $userId, $lotId, $slots, $purpose, $data) {
            // The client's row first, so two requests from the same visitor
            // queue here and cannot both slip under the pending limit.
            User::query()->lockForUpdate()->find($userId);
            $limit = Reservation::maxPending();
            if ($actor->role === 'user' && $limit > 0 && Reservation::pendingCount($userId) >= $limit) {
                return $this->error("You already have {$limit} reservations waiting for review. Wait for the office to approve or reject one before requesting another.");
            }

            // Lock the lot row so concurrent requests cannot both claim it.
            $lot = Lot::findForUpdate($lotId);
            if (!$lot || $lot->status !== 'available') {
                return $this->error('Lot is not available');
            }
            if ($slots > $lot->capacity()) {
                return $this->error("Lot capacity exceeded (max {$lot->capacity()} slots)");
            }

            $total = (float) ($lot->price * $slots);
            $reservation = Reservation::create([
                'user_id' => $userId,
                'lot_id' => $lotId,
                'reservation_date' => $data['reservation_date'],
                'purpose' => $purpose,
                'number_of_slots' => $slots,
                'total_amount' => $total,
                'approved_status' => 'pending',
            ]);
            $id = $reservation->reservation_id;

            $lot->update(['status' => 'reserved']);
            AuditLog::record($actor->user_id, 'create', 'reservations', $id, AuditLog::snapshot(
                ['user_id' => $userId, 'lot_code' => $lot->lot_code, 'number_of_slots' => $slots, 'total_amount' => $total],
                ['user_id', 'lot_code', 'number_of_slots', 'total_amount']
            ));

            // A request staff encode themselves needs no one told about it.
            if ($actor->role === 'user') {
                foreach (User::officeIds() as $officeId) {
                    Notification::createFor(
                        $officeId,
                        "New reservation #{$id} for lot {$lot->lot_code} from {$actor->fullname} is waiting for review.",
                        'reservation',
                        $id
                    );
                }
            }

            return response()->json(Reservation::withDetails($id), 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $reservation = Reservation::findOrFail($id);
        $input = $request->validate([
            'reservation_date' => ['nullable', 'date_format:Y-m-d'],
            'purpose' => self::PURPOSE_RULES,
            'number_of_slots' => ['nullable', 'integer', 'min:1'],
            'total_amount' => ['nullable', 'numeric', 'min:0'],
        ], [
            'reservation_date.*' => 'reservation_date must be a date in YYYY-MM-DD format',
            'purpose.*' => self::PURPOSE_ERROR,
            'number_of_slots.*' => 'number_of_slots must be at least 1',
            'total_amount.*' => 'total_amount must not be negative',
        ]);

        $data = [];
        if (($input['reservation_date'] ?? '') !== '') {
            $data['reservation_date'] = $input['reservation_date'];
        }
        if (isset($input['purpose'])) {
            $data['purpose'] = $input['purpose'] !== '' ? $input['purpose'] : null;
        }
        if (isset($input['number_of_slots'])) {
            $slots = (int) $input['number_of_slots'];
            $maxSlots = Lot::find($reservation->lot_id)?->capacity() ?? 1;
            if ($slots > $maxSlots) {
                return $this->error("Lot capacity exceeded (max {$maxSlots} slots)");
            }
            $data['number_of_slots'] = $slots;
        }
        if (isset($input['total_amount'])) {
            $data['total_amount'] = (float) $input['total_amount'];
        }

        if ($data !== []) {
            $before = $reservation->getAttributes();
            $reservation->update($data);
            // total_amount may have moved, so the stored payment_status is stale.
            Payment::recomputeStatus($id);
            AuditLog::record(Auth::id(), 'update', 'reservations', $id, AuditLog::changes($before, $data));
        }

        return response()->json(Reservation::withDetails($id));
    }

    public function approve(int $id): JsonResponse
    {
        return $this->decide($id, 'approved');
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        // 150 so the notification carrying it fits notifications.message (255).
        $reason = $request->validate(
            ['reason' => ['nullable', 'string', 'max:150']],
            ['reason.*' => 'reason must be text of at most 150 characters']
        )['reason'] ?? null;

        return $this->decide($id, 'rejected', $reason !== null && $reason !== '' ? $reason : null);
    }

    /**
     * The client withdrawing their own request. Only while it is pending and
     * nothing has been paid: money taken has to be settled at the office.
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();

        return DB::transaction(function () use ($actor, $id) {
            $reservation = Reservation::findForUpdate($id);
            if (!$reservation || $reservation->user_id !== $actor->user_id) {
                return $this->error('Not found', 404);
            }
            if ($reservation->approved_status !== 'pending') {
                return $this->error('Only a reservation still waiting for review can be cancelled.');
            }
            if ($reservation->payments()->exists()) {
                return $this->error('A payment has been recorded for this reservation. Contact the cemetery office to cancel it and settle the payment.');
            }

            $before = $reservation->getAttributes();
            $reservation->update(['approved_status' => 'cancelled']);
            Lot::releaseIfFree($reservation->lot_id);
            AuditLog::record($actor->user_id, 'cancel', 'reservations', $id, AuditLog::changes($before, ['approved_status' => 'cancelled']));

            $lotCode = $this->lotLabel($reservation->lot_id);
            foreach (User::officeIds() as $officeId) {
                Notification::createFor(
                    $officeId,
                    "{$actor->fullname} cancelled reservation #{$id} for lot {$lotCode}. The plot is available again.",
                    'reservation',
                    $id
                );
            }

            return response()->json(['message' => 'Reservation cancelled']);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        return DB::transaction(function () use ($id) {
            $reservation = Reservation::findForUpdate($id);
            if (!$reservation) {
                return $this->error('Not found', 404);
            }
            if ($reservation->payments()->exists()) {
                return $this->error('This reservation has recorded payments and cannot be deleted. Reject it instead, or have an administrator remove the payments first.');
            }
            $reservation->delete();
            // A rejected or cancelled reservation already let go of its lot,
            // which may since have been reserved by someone else.
            if (!in_array($reservation->approved_status, ['rejected', 'cancelled'], true)) {
                Lot::releaseIfFree($reservation->lot_id);
            }
            AuditLog::record(Auth::id(), 'delete', 'reservations', $id, AuditLog::snapshot(
                $reservation->getAttributes(),
                ['user_id', 'lot_id', 'reservation_date', 'approved_status', 'total_amount']
            ));

            return response()->json(['message' => 'Deleted']);
        });
    }

    /**
     * Approve or reject a pending reservation. The row is locked first, so two
     * staff deciding the same request at once cannot both act on it: the
     * second waits, then sees it is no longer pending.
     */
    private function decide(int $id, string $decision, ?string $reason = null): JsonResponse
    {
        return DB::transaction(function () use ($id, $decision, $reason) {
            $reservation = Reservation::findForUpdate($id);
            if (!$reservation) {
                return $this->error('Not found', 404);
            }
            if ($reservation->approved_status !== 'pending') {
                return $this->error("Only pending reservations can be {$decision}");
            }

            $before = $reservation->getAttributes();
            $lotId = $reservation->lot_id;
            $reservation->update(['approved_status' => $decision]);
            if ($decision === 'approved') {
                // Approval is what claims the plot, so it is the point the lot
                // stops being held and becomes owned by the client.
                $lot = Lot::findForUpdate($lotId);
                if ($lot && $lot->status === 'reserved') {
                    $lot->occupy();
                }
            } else {
                Lot::releaseIfFree($lotId);
            }

            $details = AuditLog::changes($before, ['approved_status' => $decision]);
            if ($reason !== null) {
                $details['reason'] = $reason;
            }
            AuditLog::record(Auth::id(), $decision === 'approved' ? 'approve' : 'reject', 'reservations', $id, $details);
            Notification::createFor(
                $reservation->user_id,
                "Your reservation #{$id} for lot {$this->lotLabel($lotId)} has been {$decision}."
                    .($reason !== null ? " Reason: {$reason}" : ''),
                'reservation',
                $id
            );

            return response()->json(['message' => 'Reservation '.$decision]);
        });
    }

    private function lotLabel(int $lotId): string
    {
        return (string) (Lot::find($lotId)?->lot_code ?? $lotId);
    }
}
