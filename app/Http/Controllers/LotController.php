<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\BurialRecord;
use App\Models\CemeterySection;
use App\Models\Lot;
use App\Support\Svg;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LotController extends Controller
{
    private const COORDINATE_ERROR = 'latitude must be within -90..90 and longitude within -180..180';

    public function index(Request $request): JsonResponse
    {
        return response()->json(Lot::search($request->query()));
    }

    public function available(Request $request): JsonResponse
    {
        return response()->json(Lot::available($request->query()));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(Lot::findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $input = $request->all();

        foreach (['section_id', 'price'] as $field) {
            if (($input[$field] ?? '') === '') {
                return $this->error("$field is required");
            }
        }

        $sectionId = (int) $input['section_id'];
        $section = $sectionId > 0 ? CemeterySection::find($sectionId) : null;
        if (!$section) {
            return $this->error('Unknown section');
        }
        if ($section->isLocked()) {
            return $this->error('Section is locked — its layout is frozen. Unlock the section to add lots.', 409);
        }

        // A code is optional on create. The Lot Editor leaves it out and lets
        // the database allocate the next free one, because only the database
        // can see every code already in use.
        $lotCode = trim((string) ($input['lot_code'] ?? ''));
        if ($lotCode === '') {
            $lotCode = Lot::nextSurveyCode($section->section_number ?? $sectionId);
        } elseif (Lot::query()->where('lot_code', $lotCode)->exists()) {
            return $this->error('lot_code already exists');
        }
        if (isset($input['lot_type']) && !in_array($input['lot_type'], Lot::TYPES, true)) {
            return $this->error('Invalid lot_type');
        }
        if (isset($input['status']) && !in_array($input['status'], Lot::STATUSES, true)) {
            return $this->error('Invalid status');
        }
        if ((float) $input['price'] < 0) {
            return $this->error('price must not be negative');
        }

        $latitude = $this->coordinate($input['latitude'] ?? null);
        $longitude = $this->coordinate($input['longitude'] ?? null);
        if (!$this->validCoordinate($latitude, $longitude)) {
            return $this->error(self::COORDINATE_ERROR);
        }

        $lot = Lot::create([
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

        AuditLog::record(Auth::id(), 'create', 'cemetery_lots', $lot->lot_id);
        return response()->json($lot->fresh(), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $lot = Lot::findOrFail($id);
        $input = $request->all();

        if ($request->hasAny(['section_id', 'svg_x', 'svg_y', 'svg_w', 'svg_h']) && $this->sectionLocked($lot->section_id)) {
            return $this->error('This section is locked — lot positions are frozen. Unlock the section to move or resize lots.');
        }
        if (array_key_exists('lot_code', $input)) {
            $code = trim((string) $input['lot_code']);
            if ($code === '') {
                return $this->error('lot_code is required');
            }
            if (Lot::query()->where('lot_code', $code)->where('lot_id', '<>', $id)->exists()) {
                return $this->error('lot_code already exists');
            }
        }
        if (isset($input['section_id'])) {
            $sectionId = (int) $input['section_id'];
            if ($sectionId <= 0 || !CemeterySection::find($sectionId)) {
                return $this->error('Unknown section');
            }
        }
        if (isset($input['lot_type']) && !in_array($input['lot_type'], Lot::TYPES, true)) {
            return $this->error('Invalid lot_type');
        }
        if (isset($input['status']) && !in_array($input['status'], Lot::STATUSES, true)) {
            return $this->error('Invalid status');
        }
        // A plot a reservation or a burial holds can only be let go through
        // that record (reject, delete), or the next client could book it too.
        if (($input['status'] ?? null) === 'available' && $lot->status !== 'available') {
            $usage = Lot::usage($id);
            if (Lot::liveReservations($id) > 0 || $usage['burials'] > 0 || $usage['owners'] > 0) {
                return $this->error('This lot is held by a pending or approved reservation, a burial record or a recorded owner, so it cannot be marked available. Reject or remove that record instead.');
            }
        }
        if (isset($input['lot_type']) && $input['lot_type'] !== $lot->lot_type) {
            $capacity = Lot::CAPACITY[$input['lot_type']];
            if (BurialRecord::slotsUsed($id) > $capacity || Lot::largestLiveReservation($id) > $capacity) {
                return $this->error("A {$input['lot_type']} lot holds {$capacity}, fewer than its burials or reserved slots");
            }
        }
        if (isset($input['price']) && (float) $input['price'] < 0) {
            return $this->error('price must not be negative');
        }

        $data = array_intersect_key($input, array_flip([
            'lot_code', 'section_id', 'block', 'lot_type', 'price', 'status', 'description',
            'latitude', 'longitude', 'svg_x', 'svg_y', 'svg_w', 'svg_h',
        ]));

        foreach (['latitude', 'longitude'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = $this->coordinate($data[$field]);
            }
        }
        if (!$this->validCoordinate($data['latitude'] ?? null, $data['longitude'] ?? null)) {
            return $this->error(self::COORDINATE_ERROR);
        }
        foreach (['svg_x' => 0.0, 'svg_y' => 0.0, 'svg_w' => 40.0, 'svg_h' => 40.0] as $field => $default) {
            if (array_key_exists($field, $data)) {
                $data[$field] = $this->svgCoord($data[$field], $default);
            }
        }
        // The editor moves and resizes rectangles. A traced outline left behind
        // would draw the plot where it used to be, so it gives way to the box.
        if (array_intersect(['svg_x', 'svg_y', 'svg_w', 'svg_h'], array_keys($data)) !== []) {
            $data['svg_points'] = null;
        }

        if ($data !== []) {
            $before = $lot->attributesToArray();
            $lot->update($data);
            AuditLog::record(Auth::id(), 'update', 'cemetery_lots', $id, AuditLog::changes($before, $data));
        }

        return response()->json($lot->fresh());
    }

    public function importGrid(Request $request): JsonResponse
    {
        $sectionId = (int) $request->input('section_id', 0);
        $rows = $request->input('lots');
        if ($sectionId <= 0 || !is_array($rows) || $rows === []) {
            return $this->error('section_id and lots[] are required');
        }
        $section = CemeterySection::find($sectionId);
        if (!$section) {
            return $this->error('Unknown section');
        }
        if ($section->isLocked()) {
            return $this->error('Section is locked — its layout is frozen. Unlock the section to import lots.', 409);
        }

        $created = 0;
        $skipped = 0;
        foreach ($rows as $row) {
            $lotCode = trim((string) ($row['lot_code'] ?? ''));
            if ($lotCode === '' || Lot::query()->where('lot_code', $lotCode)->exists()) {
                $skipped++;
                continue;
            }
            Lot::create([
                'lot_code' => $lotCode,
                'section_id' => $sectionId,
                'block' => $row['block'] ?? null,
                'lot_type' => in_array($row['lot_type'] ?? '', Lot::TYPES, true) ? $row['lot_type'] : 'single',
                'price' => (float) ($row['price'] ?? 0),
                'status' => in_array($row['status'] ?? '', Lot::STATUSES, true) ? $row['status'] : 'available',
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

        return response()->json(['created' => $created, 'skipped' => $skipped]);
    }

    public function destroy(int $id): JsonResponse
    {
        $lot = Lot::findOrFail($id);
        if ($this->sectionLocked($lot->section_id)) {
            return $this->error('Section is locked — its layout is frozen. Unlock the section to delete lots.', 409);
        }
        $usage = Lot::usage($id);
        if (array_sum($usage) > 0) {
            return $this->error('This lot is linked to reservations, burial records or owners and cannot be deleted.', 409, ['usage' => $usage]);
        }
        $lot->delete();
        AuditLog::record(Auth::id(), 'delete', 'cemetery_lots', $id, AuditLog::snapshot($lot->getAttributes(), ['lot_code', 'section_id', 'lot_type', 'status']));
        return response()->json(['message' => 'Deleted']);
    }

    /**
     * Reposition a section's lots into a uniform grid inside its current
     * outline (the traced svg_points polygon, or the svg_viewbox rectangle
     * when the section has no outline). Keeps lot_code/type/price/status;
     * only the SVG coordinates are rewritten. Staff refine from here via the
     * Lot Editor or CSV import (POST /api/lots/import-grid).
     */
    public function regrid(Request $request): JsonResponse
    {
        $sectionId = (int) $request->input('section_id', 0);
        $section = CemeterySection::find($sectionId);
        if (!$section) {
            return $this->error('Unknown section');
        }
        if ($section->isLocked()) {
            return $this->error('Section is locked — its layout is frozen. Unlock the section to reflow lots.', 409);
        }

        $poly = !empty($section->svg_points) && Svg::validPoints($section->svg_points)
            ? Svg::points($section->svg_points)
            : [];

        if ($poly) {
            $xs = array_column($poly, 0);
            $ys = array_column($poly, 1);
            $bx = min($xs);
            $by = min($ys);
            $bw = max(1.0, max($xs) - $bx);
            $bh = max(1.0, max($ys) - $by);
        } else {
            $vb = array_map('intval', preg_split('/\s+/', trim((string) $section->svg_viewbox)) ?: []);
            if (count($vb) !== 4 || $vb[2] <= 0 || $vb[3] <= 0) {
                return $this->error('Section has no usable outline');
            }
            [$bx, $by, $bw, $bh] = array_map('floatval', $vb);
        }

        $lots = Lot::query()->where('section_id', $sectionId)->orderBy('svg_y')->orderBy('svg_x')->orderBy('lot_code')->get();
        if ($lots->isEmpty()) {
            return response()->json(['section_id' => $sectionId, 'updated' => 0]);
        }

        $cells = $this->gridCells($poly, $bx, $by, $bw, $bh, $lots->count());

        $updated = 0;
        foreach ($lots->values() as $i => $lot) {
            if (!isset($cells[$i])) {
                break; // outline cannot hold the remaining plots
            }
            [$x, $y, $cellW, $cellH] = $cells[$i];
            $lot->update([
                'svg_x' => $this->svgCoord($x, 0.0),
                'svg_y' => $this->svgCoord($y, 0.0),
                'svg_w' => $this->svgCoord($cellW, 40.0),
                'svg_h' => $this->svgCoord($cellH, 40.0),
            ]);
            $updated++;
        }

        AuditLog::record(Auth::id(), 'regrid-lots', 'cemetery_sections', $sectionId);
        return response()->json(['section_id' => $sectionId, 'updated' => $updated]);
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
                    if (!$poly || Svg::contains($poly, $x + $w / 2, $y + $h / 2)) {
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

    private function coordinate(mixed $value): ?float
    {
        return $value === null || $value === '' ? null : (float) $value;
    }

    private function validCoordinate(?float $lat, ?float $lng): bool
    {
        return ($lat === null || abs($lat) <= 90) && ($lng === null || abs($lng) <= 180);
    }

    /**
     * Lot geometry, rounded to the column's two decimals. Surveyed lots land
     * at a pitch of only about 7 map units, so an integer here would move a
     * plot by roughly a seventh of its own width.
     */
    private function svgCoord(mixed $value, float $default): float
    {
        if ($value === null || $value === '') {
            return $default;
        }
        return round(max(0.0, (float) $value), 2);
    }

    private function sectionLocked(int $sectionId): bool
    {
        return (bool) CemeterySection::find($sectionId)?->isLocked();
    }
}
