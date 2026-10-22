<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\BurialRecord;
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

    /**
     * Lot geometry, rounded to the column's two decimals.
     *
     * Surveyed lots are scaled out of the trace's 4096-wide canvas and land at
     * a pitch of only about 7 map units, so an integer here would move a plot
     * by roughly a seventh of its own width.
     */
    private function svgCoord(mixed $value, float $default): float
    {
        if ($value === null || $value === '') return $default;
        return round(max(0.0, (float) $value), 2);
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
        Response::json(Lot::available($_GET));
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

        $required = ['section_id', 'price'];
        foreach ($required as $field) {
            if (($input[$field] ?? '') === '') {
                Response::json(['error' => "$field is required"], 422);
                return;
            }
        }

        $sectionId = (int) ($input['section_id'] ?? 0);
        $section = $sectionId > 0 ? CemeterySection::find($sectionId) : null;
        if (!$section) {
            Response::json(['error' => 'Unknown section'], 422);
            return;
        }
        if ($this->sectionLocked($sectionId)) {
            Response::json(['error' => 'Section is locked — its layout is frozen. Unlock the section to add lots.'], 409);
            return;
        }

        // A code is optional on create. The Lot Editor leaves it out and lets
        // the database allocate the next free one, because only the database
        // can see every code already in use.
        $lotCode = trim((string) ($input['lot_code'] ?? ''));
        if ($lotCode === '') {
            $number = $section['section_number'] !== null ? (int) $section['section_number'] : $sectionId;
            $lotCode = Lot::nextSurveyCode($number);
        } elseif (Lot::findBy('lot_code', $lotCode)) {
            Response::json(['error' => 'lot_code already exists'], 422);
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
            'lot_code' => $lotCode,
            'section_id' => $sectionId,
            'block' => $input['block'] ?? null,
            'lot_type' => $input['lot_type'] ?? 'single',
            'price' => (float) $input['price'],
            'status' => $input['status'] ?? 'available',
            'description' => $input['description'] ?? null,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'svg_x' => $this->svgCoord($input['svg_x'] ?? null, 0.0),
            'svg_y' => $this->svgCoord($input['svg_y'] ?? null, 0.0),
            'svg_w' => $this->svgCoord($input['svg_w'] ?? null, 40.0),
            'svg_h' => $this->svgCoord($input['svg_h'] ?? null, 40.0),
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
        // A plot a reservation or a burial holds can only be let go through
        // that record (reject, delete), or the next client could book it too.
        if (($input['status'] ?? null) === 'available' && $lot['status'] !== 'available') {
            $usage = Lot::usage($id);
            if (Lot::liveReservations($id) > 0 || (int) $usage['burials'] > 0) {
                Response::json(['error' => 'This lot is held by a pending or approved reservation or has a burial record, so it cannot be marked available. Reject or remove that record instead.'], 422);
                return;
            }
        }
        if (isset($input['lot_type']) && $input['lot_type'] !== $lot['lot_type']) {
            $capacity = Lot::CAPACITY[$input['lot_type']];
            if (BurialRecord::slotsUsed($id) > $capacity || Lot::largestLiveReservation($id) > $capacity) {
                Response::json(['error' => "A {$input['lot_type']} lot holds {$capacity}, fewer than its burials or reserved slots"], 422);
                return;
            }
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
            if (array_key_exists($field, $data)) $data[$field] = $this->svgCoord($data[$field], 0.0);
        }
        foreach (['svg_w', 'svg_h'] as $field) {
            if (array_key_exists($field, $data)) $data[$field] = $this->svgCoord($data[$field], 40.0);
        }
        // The editor moves and resizes rectangles. A traced outline left behind
        // would draw the plot where it used to be, so it gives way to the box.
        if (array_intersect(['svg_x', 'svg_y', 'svg_w', 'svg_h'], array_keys($data)) !== []) {
            $data['svg_points'] = null;
        }

        if ($data !== []) {
            Lot::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'cemetery_lots', $id, AuditLog::changes($lot, $data));
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
                'svg_x' => $this->svgCoord($row['svg_x'] ?? null, 0.0),
                'svg_y' => $this->svgCoord($row['svg_y'] ?? null, 0.0),
                'svg_w' => $this->svgCoord($row['svg_w'] ?? null, 40.0),
                'svg_h' => $this->svgCoord($row['svg_h'] ?? null, 40.0),
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
        if (($usage['reservations'] + $usage['burials']) > 0) {
            Response::json([
                'error' => 'This lot is linked to reservations or burial records and cannot be deleted.',
                'usage' => $usage,
            ], 409);
            return;
        }
        Lot::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'cemetery_lots', $id, AuditLog::snapshot($lot, ['lot_code', 'section_id', 'lot_type', 'status']));
        Response::json(['message' => 'Deleted']);
    }

    /**
     * Reposition a section's lots into a uniform grid inside its current
     * outline (the traced svg_points polygon, or the svg_viewbox rectangle
     * when the section has no outline). Keeps lot_code/type/price/status;
     * only the SVG coordinates are rewritten. Staff refine from here via the
     * Lot Editor or CSV import (POST /api/lots/import-grid).
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

        $cells = $this->gridCells($poly, $bx, $by, $bw, $bh, $n);

        $updated = 0;
        foreach ($lots as $i => $lot) {
            if (!isset($cells[$i])) {
                break; // outline cannot hold the remaining plots
            }
            [$x, $y, $cellW, $cellH] = $cells[$i];
            Lot::update((int) $lot['lot_id'], [
                'svg_x' => $this->svgCoord($x, 0.0),
                'svg_y' => $this->svgCoord($y, 0.0),
                'svg_w' => $this->svgCoord($cellW, 40.0),
                'svg_h' => $this->svgCoord($cellH, 40.0),
            ]);
            $updated++;
        }

        AuditLog::record(Auth::id(), 'regrid-lots', 'cemetery_sections', $sectionId);
        Response::json(['section_id' => $sectionId, 'updated' => $updated]);
    }

    /**
     * Grid cells that sit inside the outline, stepping the resolution up until
     * enough of them fit. Sizing the grid from the bounding box alone leaves
     * most of its cells outside an irregular outline, so a section would come
     * back with plots missing or spilled onto the roads.
     *
     * @param list<array{0: float, 1: float}> $poly
     * @return list<array{0: float, 1: float, 2: float, 3: float}>
     */
    private function gridCells(array $poly, float $bx, float $by, float $bw, float $bh, int $n): array
    {
        $best = [];
        for ($attempt = 0, $target = $n; $attempt < 12; $attempt++, $target = (int) ceil($target * 1.15)) {
            $cols = max(1, (int) round(sqrt($target * ($bw / max(1.0, $bh)))));
            $rows = max(1, (int) ceil($target / $cols));
            $cellW = $bw / $cols;
            $cellH = $bh / $rows;
            $cells = [];
            for ($r = 0; $r < $rows; $r++) {
                for ($c = 0; $c < $cols; $c++) {
                    // Round before testing, so a plot is only placed where the
                    // stored integers put it. Testing the unrounded centre can
                    // accept a cell that ends up a fraction outside once saved.
                    $x = (int) round($bx + $c * $cellW);
                    $y = (int) round($by + $r * $cellH);
                    $w = max(8, (int) floor($cellW) - 2);
                    $h = max(8, (int) floor($cellH) - 2);
                    if (!$poly || $this->pointInPolygon($poly, $x + $w / 2, $y + $h / 2)) {
                        $cells[] = [$x, $y, (float) $w, (float) $h];
                    }
                }
            }
            if (count($cells) > count($best)) {
                $best = $cells;
            }
            if (count($cells) >= $n) {
                return $cells;
            }
        }

        return $best;
    }
}