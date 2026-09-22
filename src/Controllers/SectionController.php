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
    public function updateViewboxes(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();
        $rows = $input['viewboxes'] ?? null;
        if (!is_array($rows) || $rows === []) {
            Response::json(['error' => 'viewboxes[] is required'], 422);
            return;
        }

        $updated = 0;
        foreach ($rows as $row) {
            $id = (int) ($row['section_id'] ?? 0);
            $parts = preg_split('/\s+/', trim((string) ($row['svg_viewbox'] ?? '')));
            if ($id <= 0 || !is_array($parts) || count($parts) !== 4) continue;
            $ok = true;
            $clean = [];
            foreach ($parts as $p) {
                if (!is_numeric($p)) {
                    $ok = false;
                    break;
                }
                $clean[] = (int) round((float) $p);
            }
            [$x, $y, $w, $h] = $clean;
            if (!$ok || $w < 10 || $h < 10 || $x < 0 || $y < 0 || $x + $w > 1791 || $y + $h > 1457) continue;

            if (!CemeterySection::find($id)) continue;

            CemeterySection::update($id, ['svg_viewbox' => "$x $y $w $h"]);
            AuditLog::record(Auth::id(), 'update-viewbox', 'cemetery_sections', $id);
            $updated++;
        }

        Response::json(['updated' => $updated]);
    }
}