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

    public function index(): void
    {
        Auth::requireRole(['admin']);
        Response::json(CemeterySection::withLotCounts());
    }

    public function show(int $id): void
    {
        $section = CemeterySection::find($id);
        if (!$section) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json($section);
    }

    private function validateName(array $input, bool $require, ?int $selfId = null): ?string
    {
        if (!isset($input['section_name'])) {
            return $require ? 'section_name is required' : null;
        }
        $name = trim((string) $input['section_name']);
        if ($name === '' || mb_strlen($name) > 50) {
            return 'section_name must be 1-50 characters';
        }
        $existing = CemeterySection::findBy('section_name', $name);
        if ($existing && $existing['section_id'] !== $selfId) {
            return 'section_name already exists';
        }
        return null;
    }

    public function store(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();

        if ($error = $this->validateName($input, true)) {
            Response::json(['error' => $error], 422);
            return;
        }

        $id = CemeterySection::create([
            'section_name' => trim((string) $input['section_name']),
            'location' => mb_strlen(trim((string) ($input['location'] ?? ''))) > 0
                ? trim((string) $input['location'])
                : null,
            'description' => trim((string) ($input['description'] ?? '')) !== ''
                ? trim((string) $input['description'])
                : null,
            // Default placeholder outline in the gap area of the map; map it with the editor.
            'svg_viewbox' => '620 640 500 300',
            'svg_points' => '620 640 1120 640 1120 940 620 940',
        ]);

        AuditLog::record(Auth::id(), 'create', 'cemetery_sections', $id);
        Response::json(CemeterySection::find($id), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin']);
        if (!CemeterySection::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $input = $this->router->input();
        if ($error = $this->validateName($input, false, $id)) {
            Response::json(['error' => $error], 422);
            return;
        }

        $data = array_intersect_key($input, array_flip(['section_name', 'location', 'description']));
        if (isset($data['section_name'])) $data['section_name'] = trim((string) $data['section_name']);
        if (isset($data['location'])) $data['location'] = trim((string) $data['location']) !== '' ? trim((string) $data['location']) : null;
        if (isset($data['description'])) $data['description'] = trim((string) $data['description']) !== '' ? trim((string) $data['description']) : null;

        if ($data !== []) {
            CemeterySection::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'cemetery_sections', $id);
        }

        Response::json(CemeterySection::find($id));
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        if (!CemeterySection::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $usage = CemeterySection::usage($id);
        if ($usage['reservations'] > 0 || $usage['payments'] > 0 || $usage['burials'] > 0 || $usage['non_available'] > 0) {
            Response::json([
                'error' => 'Cannot delete — section still has lots or records in use',
                'usage' => $usage,
            ], 409);
            return;
        }

        CemeterySection::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'cemetery_sections', $id);
        Response::json(['message' => 'Deleted']);
    }

    // TEMP: supports the admin section-vertex editor; remove when the layout is final.
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