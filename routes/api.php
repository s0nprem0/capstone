<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BackupController;
use App\Http\Controllers\BurialRecordController;
use App\Http\Controllers\LotController;
use App\Http\Controllers\LotOwnerController;
use App\Http\Controllers\MapController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ReservationController;
use App\Http\Controllers\SectionController;
use App\Http\Controllers\StatsController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// JSON API for the SPA, under /api. Every route states who may call it; the
// SPA's route guards are only a convenience. GET lists and shows, POST
// creates, POST {id} updates and POST {id}/delete deletes.

Route::pattern('id', '[0-9]+');

// ---- Public ----
Route::get('map', [MapController::class, 'map']);
Route::get('csrf-token', [AuthController::class, 'csrf']);
Route::post('auth/register', [AuthController::class, 'register']);
Route::post('auth/login', [AuthController::class, 'login']);
Route::post('auth/logout', [AuthController::class, 'logout']);
Route::get('memorials', [BurialRecordController::class, 'memorials']);
Route::get('lots', [LotController::class, 'index']);
Route::get('lots/available', [LotController::class, 'available']);
Route::get('lots/{id}', [LotController::class, 'show']);
Route::get('lots/{id}/memorials', [BurialRecordController::class, 'lotMemorials']);

// ---- Any signed-in account ----
Route::middleware('role')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::post('users/{id}', [UserController::class, 'update']);
    Route::get('reservations/{id}', [ReservationController::class, 'show']);
    Route::post('reservations', [ReservationController::class, 'store']);
    Route::get('payments/mine', [PaymentController::class, 'mine']);
    Route::get('notifications', [NotificationController::class, 'mine']);
    Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);
});

// ---- Visitors (clients) ----
Route::middleware('role:user')->group(function () {
    Route::get('reservations/mine', [ReservationController::class, 'mine']);
    Route::post('reservations/{id}/cancel', [ReservationController::class, 'cancel']);
});

// ---- Office: staff and administrators ----
Route::middleware('role:admin,staff')->group(function () {
    Route::get('users', [UserController::class, 'index']);
    Route::get('users/{id}', [UserController::class, 'show']);

    Route::get('reservations', [ReservationController::class, 'index']);
    Route::post('reservations/{id}', [ReservationController::class, 'update']);
    Route::post('reservations/{id}/approve', [ReservationController::class, 'approve']);
    Route::post('reservations/{id}/reject', [ReservationController::class, 'reject']);
    Route::post('reservations/{id}/delete', [ReservationController::class, 'destroy']);

    Route::get('payments', [PaymentController::class, 'index']);
    Route::get('payments/{id}', [PaymentController::class, 'show']);
    Route::post('payments', [PaymentController::class, 'store']);
    Route::post('payments/{id}', [PaymentController::class, 'update']);

    Route::get('burial-records', [BurialRecordController::class, 'index']);
    Route::get('burial-records/{id}', [BurialRecordController::class, 'show']);
    Route::post('burial-records', [BurialRecordController::class, 'store']);
    Route::post('burial-records/{id}', [BurialRecordController::class, 'update']);

    Route::get('stats/dashboard', [StatsController::class, 'dashboard']);

    Route::get('reports/reservations', [ReportController::class, 'reservations']);
    Route::get('reports/burial-records', [ReportController::class, 'burialRecords']);
    Route::get('reports/availability', [ReportController::class, 'availability']);
    Route::get('reports/payments', [ReportController::class, 'payments']);
    Route::get('reports/audit-logs', [ReportController::class, 'auditLogs']);
    Route::get('reports/summary', [ReportController::class, 'summary']);

    Route::post('lots/{id}', [LotController::class, 'update']);
    Route::get('lots/{id}/owners', [LotOwnerController::class, 'index']);
    Route::post('lots/{id}/owners', [LotOwnerController::class, 'store']);
    Route::post('lot-owners/{id}', [LotOwnerController::class, 'update']);

    Route::get('sections', [SectionController::class, 'index']);
    Route::get('sections/{id}', [SectionController::class, 'show']);
});

// ---- Administrators ----
Route::middleware('role:admin')->group(function () {
    Route::post('users', [UserController::class, 'store']);
    Route::post('users/{id}/delete', [UserController::class, 'destroy']);

    Route::post('payments/{id}/delete', [PaymentController::class, 'destroy']);
    Route::post('burial-records/{id}/delete', [BurialRecordController::class, 'destroy']);
    Route::post('lot-owners/{id}/delete', [LotOwnerController::class, 'destroy']);

    Route::post('lots', [LotController::class, 'store']);
    Route::post('lots/import-grid', [LotController::class, 'importGrid']);
    Route::post('lots/regrid', [LotController::class, 'regrid']);
    Route::post('lots/{id}/delete', [LotController::class, 'destroy']);

    Route::post('sections', [SectionController::class, 'store']);
    Route::post('sections/{id}', [SectionController::class, 'update']);
    Route::post('sections/{id}/delete', [SectionController::class, 'destroy']);

    Route::get('backup/export', [BackupController::class, 'export']);
    Route::post('backup/import', [BackupController::class, 'import']);
    Route::get('backup/summary', [BackupController::class, 'summary']);
    Route::post('backup/reset', [BackupController::class, 'reset']);
});
