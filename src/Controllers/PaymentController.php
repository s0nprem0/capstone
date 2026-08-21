<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
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
        Response::json(Payment::allWithDetails());
    }

    public function mine(): void
    {
        Auth::requireRole(['user']);
        Response::json(Payment::forUser(Auth::id()));
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
        Auth::requireRole(['user', 'admin', 'staff']);
        $input = $this->router->input();

        $reservationId = (int) ($input['reservation_id'] ?? 0);
        $amount = (float) ($input['amount'] ?? 0);
        $method = $input['payment_method'] ?? '';
        $referenceNo = $input['reference_no'] ?? null;

        if ($reservationId <= 0 || $amount <= 0 || $method === '') {
            Response::json(['error' => 'reservation_id, amount, and payment_method are required'], 422);
            return;
        }

        if (!in_array($method, ['gcash', 'card', 'cash'], true)) {
            Response::json(['error' => 'Invalid payment method'], 422);
            return;
        }

        $reservation = Reservation::find($reservationId);
        if (!$reservation) {
            Response::json(['error' => 'Reservation not found'], 404);
            return;
        }

        if (Auth::role() === 'user' && (int) $reservation['user_id'] !== Auth::id()) {
            Response::json(['error' => 'Forbidden'], 403);
            exit;
        }

        $paymentId = Payment::create([
            'reservation_id' => $reservationId,
            'amount' => $amount,
            'payment_method' => $method,
            'reference_no' => $referenceNo,
            'payment_status' => 'pending',
        ]);

        AuditLog::record(Auth::id(), 'create', 'payments', $paymentId);
        Response::json(Payment::withDetails($paymentId), 201);
    }

    public function validate(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $payment = Payment::find($id);
        if (!$payment) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $input = $this->router->input();
        $status = $input['payment_status'] ?? '';

        if (!in_array($status, ['paid', 'failed'], true)) {
            Response::json(['error' => 'payment_status must be paid or failed'], 422);
            return;
        }

        Payment::update($id, [
            'payment_status' => $status,
            'validated_by' => Auth::id(),
            'validated_at' => date('Y-m-d H:i:s'),
        ]);

        if ($status === 'paid') {
            Reservation::update((int) $payment['reservation_id'], [
                'payment_status' => 'paid',
            ]);
        }

        Notification::createFor(
            (int) $payment['user_id'],
            "Your payment #{$id} for reservation #{$payment['reservation_id']} has been {$status}.",
            'payment'
        );
        AuditLog::record(Auth::id(), 'validate', 'payments', $id);
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
        AuditLog::record(Auth::id(), 'delete', 'payments', $id);
        Response::json(['message' => 'Deleted']);
    }
}
