<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Headers;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Reservation;

class PaymentController
{
    private const RECEIPT_DIR = __DIR__ . '/../../storage/receipts';
    private const RECEIPT_MAX = 5 * 1024 * 1024;

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

    public function mine(): void
    {
        Auth::requireRole(['user']);
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
            return;
        }

        $remaining = (float) $reservation['total_amount'] - Payment::totals($reservationId)['committed'];
        if ($amount > $remaining) {
            $message = $remaining <= 0
                ? 'This reservation has already been fully paid'
                : 'Amount exceeds the remaining balance of ₱' . number_format($remaining, 2);
            Response::json(['error' => $message], 422);
            return;
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
        $payment = Payment::withDetails($id);
        if (!$payment) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        if ($payment['payment_status'] !== 'pending') {
            Response::json(['error' => 'Only pending payments can be validated'], 422);
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

        $reservationId = (int) $payment['reservation_id'];
        $settlement = $this->settleReservation($reservationId);

        $message = "Your payment #{$id} for reservation #{$reservationId} has been {$status}.";
        if ($settlement['payment_status'] === 'paid') {
            $message .= ' This reservation is now fully paid.';
        } elseif ($status === 'paid') {
            $message .= ' Remaining balance: ₱' . number_format($settlement['remaining'], 2) . '.';
        }

        Notification::createFor((int) $payment['user_id'], $message, 'payment');
        AuditLog::record(Auth::id(), 'validate', 'payments', $id);
        Response::json(Payment::withDetails($id));
    }

    /**
     * Recomputes the reservation's payment state from the collected balance and
     * moves the lot to match. The reservation settles only once the full total
     * has actually been collected, so a partial payment leaves it pending. If a
     * payment is later rejected, an occupancy this reservation caused is handed
     * back — but never when a burial record already claims the lot.
     *
     * @return array{payment_status: string, remaining: float}
     */
    private function settleReservation(int $reservationId): array
    {
        $reservation = Reservation::find($reservationId);
        $lotId = (int) $reservation['lot_id'];
        $total = (float) $reservation['total_amount'];
        $totals = Payment::totals($reservationId);
        $paid = $totals['paid'];

        if ($paid >= $total) {
            $status = 'paid';
        } elseif ($totals['payments'] > 0 && $totals['committed'] <= 0) {
            // Records exist but none can settle it — every one was rejected.
            $status = 'failed';
        } else {
            $status = 'pending';
        }

        Reservation::update($reservationId, ['payment_status' => $status]);

        $lot = Lot::find($lotId);
        if ($lot && $status === 'paid' && $lot['status'] === 'reserved') {
            Lot::occupy($lotId);
        } elseif ($lot && $status !== 'paid' && $lot['status'] === 'occupied'
            && (int) Lot::usage($lotId)['burials'] === 0
        ) {
            Lot::update($lotId, ['status' => 'reserved']);
        }

        return ['payment_status' => $status, 'remaining' => $total - $paid];
    }

    public function uploadReceipt(int $id): void
    {
        Auth::requireRole(['user', 'admin', 'staff']);
        $payment = Payment::withDetails($id);
        if (!$payment) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        if (Auth::role() === 'user' && (int) $payment['user_id'] !== Auth::id()) {
            Response::json(['error' => 'Forbidden'], 403);
            return;
        }

        $file = $_FILES['receipt'] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::json(['error' => 'A receipt file is required'], 422);
            return;
        }

        if ($file['size'] > self::RECEIPT_MAX) {
            Response::json(['error' => 'Receipt must be 5MB or smaller'], 422);
            return;
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($file['tmp_name']);
        $allowed = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'application/pdf' => 'pdf',
        ];

        if (!isset($allowed[$mime])) {
            Response::json(['error' => 'Receipt must be a JPG, PNG, or PDF'], 422);
            return;
        }

        if (!is_dir(self::RECEIPT_DIR)) {
            mkdir(self::RECEIPT_DIR, 0775, true);
        }

        $name = 'payment_' . $id . '_' . bin2hex(random_bytes(6)) . '.' . $allowed[$mime];
        $target = self::RECEIPT_DIR . '/' . $name;

        if (!move_uploaded_file($file['tmp_name'], $target)) {
            Response::json(['error' => 'Failed to store receipt'], 500);
            return;
        }

        $rel = 'receipts/' . $name;
        Payment::update($id, ['receipt_path' => $rel]);
        AuditLog::record(Auth::id(), 'upload', 'payments', $id);
        Response::json(Payment::withDetails($id));
    }

    public function receipt(int $id): void
    {
        if (!Auth::check()) {
            Response::json(['error' => 'Unauthenticated'], 401);
            return;
        }

        $payment = Payment::withDetails($id);
        if (!$payment || !$payment['receipt_path']) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $isStaff = in_array(Auth::role(), ['admin', 'staff'], true);
        if (!$isStaff && (int) $payment['user_id'] !== Auth::id()) {
            Response::json(['error' => 'Forbidden'], 403);
            return;
        }

        $path = dirname(__DIR__, 2) . '/storage/' . $payment['receipt_path'];
        if (!is_file($path)) {
            Response::json(['error' => 'Receipt file is missing'], 404);
            return;
        }

        $mime = mime_content_type($path) ?: 'application/octet-stream';
        Headers::apply();
        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline; filename="' . basename($path) . '"');
        readfile($path);
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        $payment = Payment::find($id);
        if (!$payment) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        $reservationId = (int) $payment['reservation_id'];
        Payment::delete($id);
        // Deleting a validated payment changes what was collected, so the
        // reservation and its lot are re-derived rather than left stale.
        $this->settleReservation($reservationId);
        AuditLog::record(Auth::id(), 'delete', 'payments', $id);
        Response::json(['message' => 'Deleted']);
    }
}
