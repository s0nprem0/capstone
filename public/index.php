<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use App\Core\Router;
use App\Controllers\ReservationController;
use App\Controllers\LotController;

$router = new Router();

$reservations = new ReservationController($router);
$lots = new LotController($router);

$router->get('/api/reservations', [$reservations, 'index']);
$router->get('/api/reservations/{id}', [$reservations, 'show']);
$router->post('/api/reservations', [$reservations, 'store']);
$router->post('/api/reservations/{id}', [$reservations, 'update']);
$router->post('/api/reservations/{id}/delete', [$reservations, 'destroy']);

$router->get('/api/lots', [$lots, 'index']);
$router->get('/api/lots/{id}', [$lots, 'show']);
$router->post('/api/lots', [$lots, 'store']);
$router->post('/api/lots/{id}', [$lots, 'update']);
$router->post('/api/lots/{id}/delete', [$lots, 'destroy']);

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (str_starts_with($uri, '/api/')) {
    $router->dispatch();
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
    <title>Cemetery Reservation System</title>
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
