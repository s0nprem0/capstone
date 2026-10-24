<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Reservation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(Payment::search($request->query()));
    }

    /** A visitor's own payments, across their reservations. */
    public function mine(Request $request): JsonResponse
    {
        return response()->json(Payment::search($request->query(), Auth::id()));
    }

    public function show(int $id): JsonResponse
    {
        $payment = Payment::withDetails($id);
        return $payment ? response()->json($payment) : $this->error('Not found', 404);
    }

    /**
     * Each change locks its reservation, the row the hold expiry also locks,
     * so a payment cannot land on a request in the moment it expires, and two
     * payments recorded at once each see the other when the status is summed.
     */
    public function store(Request $request): JsonResponse
    {
        // Strictly an integer: (int) would read ["5"] as reservation 1.
        $reservationId = filter_var($request->input('reservation_id'), FILTER_VALIDATE_INT) ?: 0;
        if ($reservationId <= 0 || !Reservation::query()->whereKey($reservationId)->exists()) {
            return $this->error('reservation_id is required and must exist');
        }
        $data = $this->validated($request, false);

        return DB::transaction(function () use ($reservationId, $data) {
            $reservation = Reservation::findForUpdate($reservationId);
            if (!$reservation) {
                return $this->error('reservation_id is required and must exist');
            }
            $payment = Payment::create(['reservation_id' => $reservationId, 'recorded_by' => Auth::id()] + $data);

            Payment::recomputeStatus($reservationId);
            AuditLog::record(Auth::id(), 'create', 'payments', $payment->payment_id, AuditLog::snapshot(
                ['reservation_id' => $reservationId] + $data,
                ['reservation_id', 'amount', 'method', 'payment_date', 'reference_no']
            ));
            Notification::createFor(
                $reservation->user_id,
                'Payment of ₱'.number_format($data['amount'], 2).' recorded for lot '
                    .(Lot::find($reservation->lot_id)?->lot_code ?? $reservation->lot_id).'.',
                'system',
                $reservationId
            );

            return response()->json(Payment::withDetails($payment->payment_id), 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $payment = Payment::findOrFail($id);
        $data = $this->validated($request, true);

        if ($data !== []) {
            DB::transaction(function () use ($payment, $data, $id) {
                Reservation::findForUpdate($payment->reservation_id);
                $before = $payment->getAttributes();
                $payment->update($data);
                Payment::recomputeStatus($payment->reservation_id);
                AuditLog::record(Auth::id(), 'update', 'payments', $id, AuditLog::changes($before, $data));
            });
        }

        return response()->json(Payment::withDetails($id));
    }

    public function destroy(int $id): JsonResponse
    {
        $payment = Payment::findOrFail($id);
        DB::transaction(function () use ($payment, $id) {
            Reservation::findForUpdate($payment->reservation_id);
            $payment->delete();
            Payment::recomputeStatus($payment->reservation_id);
            AuditLog::record(Auth::id(), 'delete', 'payments', $id, AuditLog::snapshot(
                $payment->getAttributes(),
                ['reservation_id', 'amount', 'method', 'payment_date', 'reference_no', 'recorded_by']
            ));
        });
        return response()->json(['message' => 'Deleted']);
    }

    /**
     * The payment fields of the request, cleaned for storage.
     *
     * @param bool $partial when true, only the fields present are validated (update)
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $partial): array
    {
        if (!$partial && $request->input('method') === null) {
            $request->merge(['method' => 'cash']);
        }
        $presence = $partial ? ['sometimes', 'required'] : ['required'];

        $input = $request->validate([
            'amount' => [...$presence, 'numeric', 'gt:0', 'max:'.Payment::MAX_AMOUNT],
            'method' => [...$presence, Rule::in(Payment::METHODS)],
            'payment_date' => [...$presence, 'date_format:Y-m-d'],
            'reference_no' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [
            'amount.max' => 'amount must be at most '.number_format(Payment::MAX_AMOUNT, 2),
            'amount.*' => 'amount must be greater than zero',
            'method.*' => 'Invalid payment method',
            'payment_date.*' => 'payment_date must be in YYYY-MM-DD format',
            'reference_no.*' => 'reference_no must be at most 50 characters',
            'notes.*' => 'notes must be at most 255 characters',
        ]);

        $data = [];
        foreach (['amount', 'method', 'payment_date', 'reference_no', 'notes'] as $field) {
            if (!$partial || array_key_exists($field, $input)) {
                $data[$field] = $input[$field] ?? null;
            }
        }
        if (isset($data['amount'])) {
            $data['amount'] = round((float) $data['amount'], 2);
        }
        foreach (['reference_no', 'notes'] as $field) {
            if (array_key_exists($field, $data) && ($data[$field] ?? '') === '') {
                $data[$field] = null;
            }
        }
        return $data;
    }
}
