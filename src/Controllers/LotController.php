<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\CemeterySection;
use App\Models\Lot;

class LotController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    private function coordinate(mixed $value): ?float
    {
        if ($value === null || $value === '') return null;
        return (float) $value;
    }

    private function validCoordinate(?float $lat, ?float $lng): bool
    {
        return ($lat === null || abs($lat) <= 90) && ($lng === null || abs($lng) <= 180);
    }

    private function svgInt(mixed $value, int $default): int
    {
        if ($value === null || $value === '') return $default;
        return max(0, (int) $value);
    }

    private function sectionLocked(int $sectionId): bool
    {
        $section = CemeterySection::find($sectionId);
        return $section !== null && (int) ($section['is_locked'] ?? 0) === 1;
    }

    /** "x y x y ..." — an even number of numbers, at least 3 vertices. */
    private function validSvgPoints(mixed $value): bool
    {
        $parts = preg_split('/\s+/', trim((string) $value)) ?: [];
        if (count($parts) < 6 || count($parts) % 2 !== 0) return false;
        foreach ($parts as $n) {
            if (!is_numeric($n)) return false;
        }
        return true;
    }

    private function pointInPolygon(array $poly, float $px, float $py): bool
    {
        $inside = false;
        $n = count($poly);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$xi, $yi] = $poly[$i];
            [$xj, $yj] = $poly[$j];
            if ((($yi > $py) !== ($yj > $py)) && ($px < ($xj - $xi) * ($py - $yi) / ($yj - $yi) + $xi)) {
                $inside = !$inside;
            }
        }
        return $inside;
    }

    public function index(): void
    {
        Response::json(Lot::search($_GET));
    }

    public function available(): void
    {
        Response::json(Lot::available());
    }

    public function show(int $id): void
    {
        $lot = Lot::find($id);
        if (!$lot) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json($lot);
    }

    public function store(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();

        $required = ['lot_code', 'section_id', 'price'];
        foreach ($required as $field) {
            if (($input[$field] ?? '') === '') {
                Response::json(['error' => "$field is required"], 422);
                return;
            }
        }

        if (Lot::findBy('lot_code', $input['lot_code'])) {
            Response::json(['error' => 'lot_code already exists'], 422);
            return;
        }

        $sectionId = (int) ($input['section_id'] ?? 0);
        if ($sectionId <= 0 || !CemeterySection::find($sectionId)) {
            Response::json(['error' => 'Unknown section'], 422);
            return;
        }
        if ($this->sectionLocked($sectionId)) {
            Response::json(['error' => 'Section is locked — its layout is frozen. Unlock the section to add lots.'], 409);
            return;
        }
        if (isset($input['lot_type']) && !in_array($input['lot_type'], ['single', 'double', 'family'], true)) {
            Response::json(['error' => 'Invalid lot_type'], 422);
            return;
        }
        if (isset($input['status']) && !in_array($input['status'], ['available', 'reserved', 'occupied'], true)) {
            Response::json(['error' => 'Invalid status'], 422);
            return;
        }
        if ((float) ($input['price'] ?? 0) < 0) {
            Response::json(['error' => 'price must not be negative'], 422);
            return;
        }

        $latitude = $this->coordinate($input['latitude'] ?? null);
        $longitude = $this->coordinate($input['longitude'] ?? null);
        if (!$this->validCoordinate($latitude, $longitude)) {
            Response::json(['error' => 'latitude must be within -90..90 and longitude within -180..180'], 422);
            return;
        }

        $id = Lot::create([
            'lot_code' => $input['lot_code'],
            'section_id' => $sectionId,
            'block' => $input['block'] ?? null,
            'lot_type' => $input['lot_type'] ?? 'single',
            'price' => (float) $input['price'],
            'status' => $input['status'] ?? 'available',
            'description' => $input['description'] ?? null,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'svg_x' => $this->svgInt($input['svg_x'] ?? null, 0),
            'svg_y' => $this->svgInt($input['svg_y'] ?? null, 0),
            'svg_w' => $this->svgInt($input['svg_w'] ?? null, 40),
            'svg_h' => $this->svgInt($input['svg_h'] ?? null, 40),
        ]);

        AuditLog::record(Auth::id(), 'create', 'cemetery_lots', $id);
        Response::json(Lot::find($id), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $lot = Lot::find($id);
        if (!$lot) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $input = $this->router->input();
        if (array_intersect(['section_id', 'svg_x', 'svg_y', 'svg_w', 'svg_h'], array_keys($input)) !== []
            && $this->sectionLocked((int) $lot['section_id'])) {
            Response::json(['error' => 'This section is locked — lot positions are frozen. Unlock the section to move or resize lots.'], 422);
            return;
        }
        if (array_key_exists('lot_code', $input)) {
            $code = trim((string) $input['lot_code']);
            if ($code === '') {
                Response::json(['error' => 'lot_code is required'], 422);
                return;
            }
            $existing = Lot::findBy('lot_code', $code);
            if ($existing && (int) $existing['lot_id'] !== $id) {
                Response::json(['error' => 'lot_code already exists'], 422);
                return;
            }
        }
        if (isset($input['section_id'])) {
            $sectionId = (int) $input['section_id'];
            if ($sectionId <= 0 || !\App\Models\CemeterySection::find($sectionId)) {
                Response::json(['error' => 'Unknown section'], 422);
                return;
            }
        }
        if (isset($input['lot_type']) && !in_array($input['lot_type'], ['single', 'double', 'family'], true)) {
            Response::json(['error' => 'Invalid lot_type'], 422);
            return;
        }
        if (isset($input['status']) && !in_array($input['status'], ['available', 'reserved', 'occupied'], true)) {
            Response::json(['error' => 'Invalid status'], 422);
            return;
        }
        if (isset($input['price']) && (float) $input['price'] < 0) {
            Response::json(['error' => 'price must not be negative'], 422);
            return;
        }

        $data = array_intersect_key($input, array_flip([
            'lot_code', 'section_id', 'block', 'lot_type', 'price', 'status', 'description',
            'latitude', 'longitude', 'svg_x', 'svg_y', 'svg_w', 'svg_h',
        ]));

        if (array_key_exists('latitude', $data)) {
            $data['latitude'] = $this->coordinate($data['latitude']);
        }
        if (array_key_exists('longitude', $data)) {
            $data['longitude'] = $this->coordinate($data['longitude']);
        }
        if (!$this->validCoordinate($data['latitude'] ?? null, $data['longitude'] ?? null)) {
            Response::json(['error' => 'latitude must be within -90..90 and longitude within -180..180'], 422);
            return;
        }
        foreach (['svg_x', 'svg_y'] as $field) {
            if (array_key_exists($field, $data)) $data[$field] = $this->svgInt($data[$field], 0);
        }
        foreach (['svg_w', 'svg_h'] as $field) {
            if (array_key_exists($field, $data)) $data[$field] = $this->svgInt($data[$field], 40);
        }

        if ($data !== []) {
            Lot::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'cemetery_lots', $id);
        }

        Response::json(Lot::find($id));
    }

    public function importGrid(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();

        $sectionId = (int) ($input['section_id'] ?? 0);
        $rows = $input['lots'] ?? null;
        if ($sectionId <= 0 || !is_array($rows) || $rows === []) {
            Response::json(['error' => 'section_id and lots[] are required'], 422);
            return;
        }
        if (!\App\Models\CemeterySection::find($sectionId)) {
            Response::json(['error' => 'Unknown section'], 422);
            return;
        }
        if ($this->sectionLocked($sectionId)) {
            Response::json(['error' => 'Section is locked — its layout is frozen. Unlock the section to import lots.'], 409);
            return;
        }

        $created = 0;
        $skipped = 0;
        foreach ($rows as $row) {
            $lotCode = trim((string) ($row['lot_code'] ?? ''));
            if ($lotCode === '' || Lot::findBy('lot_code', $lotCode)) {
                $skipped++;
                continue;
            }
            Lot::create([
                'lot_code' => $lotCode,
                'section_id' => $sectionId,
                'block' => $row['block'] ?? null,
                'lot_type' => in_array($row['lot_type'] ?? '', ['single', 'double', 'family'], true) ? $row['lot_type'] : 'single',
                'price' => (float) ($row['price'] ?? 0),
                'status' => in_array($row['status'] ?? '', ['available', 'reserved', 'occupied'], true) ? $row['status'] : 'available',
                'svg_x' => $this->svgInt($row['svg_x'] ?? null, 0),
                'svg_y' => $this->svgInt($row['svg_y'] ?? null, 0),
                'svg_w' => $this->svgInt($row['svg_w'] ?? null, 40),
                'svg_h' => $this->svgInt($row['svg_h'] ?? null, 40),
            ]);
            $created++;
        }

        if ($created > 0) {
            AuditLog::record(Auth::id(), 'import-grid', 'cemetery_lots', $sectionId);
        }

        Response::json(['created' => $created, 'skipped' => $skipped]);
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        $lot = Lot::find($id);
        if (!$lot) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        if ($this->sectionLocked((int) $lot['section_id'])) {
            Response::json(['error' => 'Section is locked — its layout is frozen. Unlock the section to delete lots.'], 409);
            return;
        }
        $usage = Lot::usage($id);
        if (($usage['reservations'] + $usage['payments'] + $usage['burials']) > 0) {
            Response::json([
                'error' => 'This lot is linked to reservations, payments, or burial records and cannot be deleted.',
                'usage' => $usage,
            ], 409);
            return;
        }
        Lot::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'cemetery_lots', $id);
        Response::json(['message' => 'Deleted']);
    }

    /**
     * Reposition a section's lots into a uniform grid inside its current
     * outline (the traced svg_points polygon, or the svg_viewbox rectangle
     * when the section has no outline). Keeps lot_code/type/price/status;
     * only the SVG coordinates are rewritten. Placeholder placement — staff
     * refine via the Lot Editor or CSV import (POST /api/lots/import-grid).
     */
    public function regrid(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();
        $sectionId = (int) ($input['section_id'] ?? 0);

        $section = CemeterySection::find($sectionId);
        if (!$section) {
            Response::json(['error' => 'Unknown section'], 422);
            return;
        }
        if ($this->sectionLocked($sectionId)) {
            Response::json(['error' => 'Section is locked — its layout is frozen. Unlock the section to reflow lots.'], 409);
            return;
        }

        $poly = [];
        if (!empty($section['svg_points']) && $this->validSvgPoints($section['svg_points'])) {
            $nums = array_map('floatval', preg_split('/\s+/', trim($section['svg_points'])) ?: []);
            for ($i = 0; $i + 1 < count($nums); $i += 2) {
                $poly[] = [$nums[$i], $nums[$i + 1]];
            }
        }

        if ($poly) {
            $xs = array_column($poly, 0);
            $ys = array_column($poly, 1);
            $bx = min($xs);
            $by = min($ys);
            $bw = max(1.0, max($xs) - $bx);
            $bh = max(1.0, max($ys) - $by);
        } else {
            $parts = preg_split('/\s+/', trim((string) $section['svg_viewbox'])) ?: [];
            $vb = array_map('intval', $parts);
            if (count($vb) !== 4 || $vb[2] <= 0 || $vb[3] <= 0) {
                Response::json(['error' => 'Section has no usable outline'], 422);
                return;
            }
            [$bx, $by, $bw, $bh] = $vb;
        }

        $lots = Lot::grid($sectionId);
        $n = count($lots);
        if ($n === 0) {
            Response::json(['section_id' => $sectionId, 'updated' => 0]);
            return;
        }

        $cols = max(1, (int) ceil(sqrt($n * ($bw / max(1, $bh)))));
        $rows = max(1, (int) ceil($n / $cols));
        $cellW = $bw / $cols;
        $cellH = $bh / $rows;
        $pad = 2;
        $cells = $cols * $rows;

        $updated = 0;
        $cellIndex = 0;
        foreach ($lots as $lot) {
            // Find the next grid cell whose center sits inside the outline.
            while ($cellIndex < $cells) {
                $col = $cellIndex % $cols;
                $row = intdiv($cellIndex, $cols);
                $cellIndex++;
                if (!$poly || $this->pointInPolygon($poly, $bx + $col * $cellW + $cellW / 2, $by + $row * $cellH + $cellH / 2)) {
                    break;
                }
            }
            if ($cellIndex > $cells) break; // no cells left; leave the rest untouched
            $col = ($cellIndex - 1) % $cols;
            $row = intdiv($cellIndex - 1, $cols);
            Lot::update((int) $lot['lot_id'], [
                'svg_x' => (int) round($bx + $col * $cellW),
                'svg_y' => (int) round($by + $row * $cellH),
                'svg_w' => max(8, (int) floor($cellW) - $pad),
                'svg_h' => max(8, (int) floor($cellH) - $pad),
            ]);
            $updated++;
        }

        AuditLog::record(Auth::id(), 'regrid-lots', 'cemetery_sections', $sectionId);
        Response::json(['section_id' => $sectionId, 'updated' => $updated]);
    }
}