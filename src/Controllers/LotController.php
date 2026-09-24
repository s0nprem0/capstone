<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
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

        $latitude = $this->coordinate($input['latitude'] ?? null);
        $longitude = $this->coordinate($input['longitude'] ?? null);
        if (!$this->validCoordinate($latitude, $longitude)) {
            Response::json(['error' => 'latitude must be within -90..90 and longitude within -180..180'], 422);
            return;
        }

        $id = Lot::create([
            'lot_code' => $input['lot_code'],
            'section_id' => (int) $input['section_id'],
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
        if (!Lot::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $input = $this->router->input();
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
        if (!Lot::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Lot::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'cemetery_lots', $id);
        Response::json(['message' => 'Deleted']);
    }
}