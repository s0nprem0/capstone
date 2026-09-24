<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use App\Core\Router;
use App\Core\Response;
use App\Core\Session;
use App\Controllers\AuthController;
use App\Controllers\UserController;
use App\Controllers\MapController;
use App\Controllers\ReservationController;
use App\Controllers\PaymentController;
use App\Controllers\BurialRecordController;
use App\Controllers\NotificationController;
use App\Controllers\StatsController;
use App\Controllers\ReportController;
use App\Controllers\LotController;
use App\Controllers\BackupController;

$router = new Router();
Session::start();

$auth = new AuthController($router);
$users = new UserController($router);
$map = new MapController($router);
$reservations = new ReservationController($router);
$payments = new PaymentController($router);
$burialRecords = new BurialRecordController($router);
$notifications = new NotificationController($router);
$stats = new StatsController($router);
$reports = new ReportController($router);
$lots = new LotController($router);
$backup = new BackupController($router);

$router->get('/api/map', [$map, 'map']);

$router->get('/api/csrf-token', [$auth, 'csrf']);
$router->post('/api/auth/register', [$auth, 'register']);
$router->post('/api/auth/login', [$auth, 'login']);
$router->post('/api/auth/logout', [$auth, 'logout']);
$router->get('/api/auth/me', [$auth, 'me']);

$router->get('/api/users', [$users, 'index']);
$router->get('/api/users/{id}', [$users, 'show']);
$router->post('/api/users', [$users, 'store']);
$router->post('/api/users/{id}', [$users, 'update']);
$router->post('/api/users/{id}/delete', [$users, 'destroy']);

$router->get('/api/reservations', [$reservations, 'index']);
$router->get('/api/reservations/mine', [$reservations, 'mine']);
$router->get('/api/reservations/{id}', [$reservations, 'show']);
$router->post('/api/reservations', [$reservations, 'store']);
$router->post('/api/reservations/{id}', [$reservations, 'update']);
$router->post('/api/reservations/{id}/approve', [$reservations, 'approve']);
$router->post('/api/reservations/{id}/reject', [$reservations, 'reject']);
$router->post('/api/reservations/{id}/delete', [$reservations, 'destroy']);

$router->get('/api/payments', [$payments, 'index']);
$router->get('/api/payments/mine', [$payments, 'mine']);
$router->get('/api/payments/{id}', [$payments, 'show']);
$router->get('/api/payments/{id}/receipt', [$payments, 'receipt']);
$router->post('/api/payments', [$payments, 'store']);
$router->post('/api/payments/{id}/upload-receipt', [$payments, 'uploadReceipt']);
$router->post('/api/payments/{id}/validate', [$payments, 'validate']);
$router->post('/api/payments/{id}/delete', [$payments, 'destroy']);

$router->get('/api/burial-records', [$burialRecords, 'index']);
$router->get('/api/burial-records/{id}', [$burialRecords, 'show']);
$router->post('/api/burial-records', [$burialRecords, 'store']);
$router->post('/api/burial-records/{id}', [$burialRecords, 'update']);
$router->post('/api/burial-records/{id}/delete', [$burialRecords, 'destroy']);

$router->get('/api/notifications', [$notifications, 'mine']);
$router->post('/api/notifications/{id}/read', [$notifications, 'markRead']);
$router->post('/api/notifications/read-all', [$notifications, 'markAllRead']);

$router->get('/api/stats/dashboard', [$stats, 'dashboard']);

$router->get('/api/reports/reservations', [$reports, 'reservations']);
$router->get('/api/reports/payments', [$reports, 'payments']);
$router->get('/api/reports/burial-records', [$reports, 'burialRecords']);
$router->get('/api/reports/availability', [$reports, 'availability']);
$router->get('/api/reports/audit-logs', [$reports, 'auditLogs']);

$router->get('/api/lots', [$lots, 'index']);
$router->get('/api/lots/available', [$lots, 'available']);
$router->get('/api/lots/{id}', [$lots, 'show']);
$router->post('/api/lots', [$lots, 'store']);
$router->post('/api/lots/import-grid', [$lots, 'importGrid']);
$router->post('/api/lots/{id}', [$lots, 'update']);
$router->post('/api/lots/{id}/delete', [$lots, 'destroy']);

$router->get('/api/backup/export', [$backup, 'export']);
$router->post('/api/backup/import', [$backup, 'import']);

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (str_starts_with($uri, '/api/')) {
    try {
        $router->dispatch();
    } catch (\Throwable $e) {
        error_log('[api] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
        Response::json(['error' => 'Internal server error'], 500);
    }
} else {
    $vite = '';
    $manifestFile = __DIR__ . '/../dist/.vite/manifest.json';

    if (file_exists($manifestFile)) {
        $manifest = json_decode(file_get_contents($manifestFile), true);
        $entry = $manifest['index.html'] ?? null;
        if ($entry) {
            $css = $entry['css'][0] ?? '';
            $js = $entry['file'] ?? '';
            $cssTag = $css ? '<link rel="stylesheet" href="/dist/' . htmlspecialchars($css) . '">' : '';
            $jsTag = '<script type="module" src="/dist/' . htmlspecialchars($js) . '"></script>';
            $vite = $cssTag . "\n    " . $jsTag;
        }
    }
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="St. John Memorial Garden & Parks — reserve cemetery lots, track payments, and manage burial records online.">
    <meta name="theme-color" content="#2c5530">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <title>St. John Memorial Garden &amp; Parks — Cemetery Reservation &amp; Records</title>
    <?php if ($vite): ?>
    <?php echo $vite; ?>
    <?php endif; ?>
</head>
<body>
    <div id="root"></div>
    <?php if (!$vite): ?>
    <script type="module" src="http://localhost:5173/resources/js/main.jsx"></script>
    <?php endif; ?>
</body>
</html>
<?php
}
