<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\CemeterySection;

class SectionController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    // TEMP: supports the admin overview section-vertex editor; remove when the layout is final.
    public function updatePolygons(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();
        $rows = $input['polygons'] ?? null;
        if (!is_array($rows) || $rows === []) {
            Response::json(['error' => 'polygons[] is required'], 422);
            return;
        }

        $updated = 0;
        foreach ($rows as $row) {
            $id = (int) ($row['section_id'] ?? 0);
            $tokens = preg_split('/\s+/', trim((string) ($row['svg_points'] ?? '')));
            if ($id <= 0 || !is_array($tokens) || count($tokens) < 8 || count($tokens) % 2 !== 0) continue;

            $points = [];
            $ok = true;
            foreach ($tokens as $t) {
                if (!is_numeric($t)) {
                    $ok = false;
                    break;
                }
                $points[] = (int) round((float) $t);
            }
            if (!$ok) continue;

            $minX = PHP_INT_MAX;
            $minY = PHP_INT_MAX;
            $maxX = 0;
            $maxY = 0;
            $svgPoints = [];
            for ($i = 0; $i < count($points); $i += 2) {
                $px = $points[$i];
                $py = $points[$i + 1];
                if ($px < 0 || $py < 0 || $px > 1791 || $py > 1457) continue 2;
                $minX = min($minX, $px);
                $minY = min($minY, $py);
                $maxX = max($maxX, $px);
                $maxY = max($maxY, $py);
                $svgPoints[] = "$px $py";
            }

            if (!CemeterySection::find($id)) continue;

            $bbox = sprintf('%d %d %d %d', $minX, $minY, $maxX - $minX, $maxY - $minY);
            CemeterySection::update($id, [
                'svg_points' => implode(' ', $svgPoints),
                'svg_viewbox' => $bbox,
            ]);
            AuditLog::record(Auth::id(), 'update-polygon', 'cemetery_sections', $id);
            $updated++;
        }

        Response::json(['updated' => $updated]);
    }
}