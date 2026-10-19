<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Reservation;

class PaymentController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(): void
    {
        Auth::requireRole(['admin', 'staff']);
        Response::json(Payment::search($_GET));
    }

    /** A visitor's own payments, across their reservations. */
    public function mine(): void
    {
        Auth::requireRole(['user', 'admin', 'staff']);
        Response::json(Payment::search($_GET, Auth::id()));
    }

    public function show(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $payment = Payment::withDetails($id);
        if (!$payment) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json($payment);
    }

    public function store(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $input = $this->router->input();

        $reservationId = (int) ($input['reservation_id'] ?? 0);
        $reservation = $reservationId > 0 ? Reservation::find($reservationId) : null;
        if (!$reservation) {
            Response::json(['error' => 'reservation_id is required and must exist'], 422);
            return;
        }

        $fields = $this->validate($input, false);
        if (isset($fields['error'])) {
            Response::json(['error' => $fields['error']], 422);
            return;
        }

        $id = Payment::create([
            'reservation_id' => $reservationId,
            'amount' => $fields['data']['amount'],
            'method' => $fields['data']['method'],
            'reference_no' => $fields['data']['reference_no'],
            'payment_date' => $fields['data']['payment_date'],
            'notes' => $fields['data']['notes'],
            'recorded_by' => Auth::id(),
        ]);

        Payment::recomputeStatus($reservationId);
        AuditLog::record(Auth::id(), 'create', 'payments', $id);
        $this->notify($reservation, $fields['data']['amount']);

        Response::json(Payment::withDetails($id), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $payment = Payment::find($id);
        if (!$payment) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $fields = $this->validate($this->router->input(), true);
        if (isset($fields['error'])) {
            Response::json(['error' => $fields['error']], 422);
            return;
        }

        if ($fields['data'] !== []) {
            Payment::update($id, $fields['data']);
            Payment::recomputeStatus((int) $payment['reservation_id']);
            AuditLog::record(Auth::id(), 'update', 'payments', $id);
        }

        Response::json(Payment::withDetails($id));
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        $payment = Payment::find($id);
        if (!$payment) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Payment::delete($id);
        Payment::recomputeStatus((int) $payment['reservation_id']);
        AuditLog::record(Auth::id(), 'delete', 'payments', $id);
        Response::json(['message' => 'Deleted']);
    }

    /**
     * Validate a payment payload.
     *
     * @param bool $partial when true, only the keys present are validated (update)
     * @return array{data: array<string, mixed>}|array{error: string}
     */
    private function validate(array $input, bool $partial): array
    {
        $data = [];

        if (!$partial || array_key_exists('amount', $input)) {
            $amount = (float) ($input['amount'] ?? 0);
            if ($amount <= 0) {
                return ['error' => 'amount must be greater than zero'];
            }
            $data['amount'] = round($amount, 2);
        }
        if (!$partial || array_key_exists('method', $input)) {
            $method = (string) ($input['method'] ?? 'cash');
            if (!in_array($method, Payment::METHODS, true)) {
                return ['error' => 'Invalid payment method'];
            }
            $data['method'] = $method;
        }
        if (!$partial || array_key_exists('payment_date', $input)) {
            $date = (string) ($input['payment_date'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                return ['error' => 'payment_date must be in YYYY-MM-DD format'];
            }
            $data['payment_date'] = $date;
        }
        if (!$partial || array_key_exists('reference_no', $input)) {
            $reference = trim((string) ($input['reference_no'] ?? ''));
            if (strlen($reference) > 50) {
                return ['error' => 'reference_no must be at most 50 characters'];
            }
            $data['reference_no'] = $reference !== '' ? $reference : null;
        }
        if (!$partial || array_key_exists('notes', $input)) {
            $notes = trim((string) ($input['notes'] ?? ''));
            if (strlen($notes) > 255) {
                return ['error' => 'notes must be at most 255 characters'];
            }
            $data['notes'] = $notes !== '' ? $notes : null;
        }

        return ['data' => $data];
    }

    private function notify(array $reservation, float $amount): void
    {
        $lot = Lot::find((int) $reservation['lot_id']);
        $lotCode = $lot ? (string) $lot['lot_code'] : (string) $reservation['lot_id'];
        Notification::createFor(
            (int) $reservation['user_id'],
            'Payment of ₱' . number_format($amount, 2) . " recorded for lot {$lotCode}.",
            'system',
            (int) $reservation['reservation_id']
        );
    }
}
