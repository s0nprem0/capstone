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

    private function validViewbox(mixed $value): bool
    {
        $parts = preg_split('/\s+/', trim((string) $value));
        if ($parts === false || count($parts) !== 4) return false;
        foreach ($parts as $n) {
            if (!is_numeric($n) || (float) $n < 0) return false;
        }
        return (float) $parts[2] > 0 && (float) $parts[3] > 0;
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

    public function index(): void
    {
        Auth::requireRole(['staff', 'admin']);
        Response::json(CemeterySection::withCounts());
    }

    public function show(int $id): void
    {
        Auth::requireRole(['staff', 'admin']);
        $section = CemeterySection::find($id);
        if (!$section) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json($section);
    }

    public function store(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();

        $name = trim((string) ($input['section_name'] ?? ''));
        if ($name === '') {
            Response::json(['error' => 'section_name is required'], 422);
            return;
        }
        if (strlen($name) > 50) {
            Response::json(['error' => 'section_name must be at most 50 characters'], 422);
            return;
        }
        if (CemeterySection::findBy('section_name', $name)) {
            Response::json(['error' => 'section_name already exists'], 422);
            return;
        }
        if (isset($input['location']) && strlen((string) $input['location']) > 100) {
            Response::json(['error' => 'location must be at most 100 characters'], 422);
            return;
        }
        $viewbox = trim((string) ($input['svg_viewbox'] ?? ''));
        if ($viewbox !== '' && !$this->validViewbox($viewbox)) {
            Response::json(['error' => 'svg_viewbox must be 4 numbers (x y width height) with positive width and height'], 422);
            return;
        }
        $points = null;
        if (array_key_exists('points', $input) && trim((string) $input['points']) !== '') {
            if (!$this->validSvgPoints($input['points'])) {
                Response::json(['error' => 'points must be an even list of numbers, e.g. "10 20 30 40 50 60" (at least three vertices)'], 422);
                return;
            }
            $points = trim((string) $input['points']);
        }

        $id = CemeterySection::create([
            'section_name' => $name,
            'location' => $input['location'] ?? null,
            'description' => $input['description'] ?? null,
            'svg_viewbox' => $viewbox !== '' ? $viewbox : '0 0 1791 1457',
            'svg_image' => $input['svg_image'] ?? null,
            'svg_points' => $points,
            'is_locked' => !empty($input['is_locked']) ? 1 : 0,
        ]);

        AuditLog::record(Auth::id(), 'create', 'cemetery_sections', $id);
        Response::json(CemeterySection::find($id), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin']);
        $section = CemeterySection::find($id);
        if (!$section) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $locked = (int) ($section['is_locked'] ?? 0) === 1;
        $input = $this->router->input();

        if ($locked && array_intersect(['points', 'svg_viewbox', 'svg_image'], array_keys($input)) !== []) {
            Response::json(['error' => 'Section is locked — unlock it to edit its outline.'], 422);
            return;
        }

        if (array_key_exists('section_name', $input)) {
            $name = trim((string) $input['section_name']);
            if ($name === '') {
                Response::json(['error' => 'section_name is required'], 422);
                return;
            }
            if (strlen($name) > 50) {
                Response::json(['error' => 'section_name must be at most 50 characters'], 422);
                return;
            }
            $existing = CemeterySection::findBy('section_name', $name);
            if ($existing && (int) $existing['section_id'] !== $id) {
                Response::json(['error' => 'section_name already exists'], 422);
                return;
            }
        }
        if (isset($input['location']) && strlen((string) $input['location']) > 100) {
            Response::json(['error' => 'location must be at most 100 characters'], 422);
            return;
        }
        if (array_key_exists('svg_viewbox', $input) && trim((string) $input['svg_viewbox']) !== '' && !$this->validViewbox($input['svg_viewbox'])) {
            Response::json(['error' => 'svg_viewbox must be 4 numbers (x y width height) with positive width and height'], 422);
            return;
        }
        if (array_key_exists('points', $input) && trim((string) $input['points']) !== '' && !$this->validSvgPoints($input['points'])) {
            Response::json(['error' => 'points must be an even list of numbers, e.g. "10 20 30 40 50 60" (at least three vertices)'], 422);
            return;
        }

        $data = array_intersect_key($input, array_flip([
            'section_name', 'location', 'description', 'svg_viewbox', 'svg_image', 'is_locked',
        ]));
        if (array_key_exists('points', $input)) {
            $data['svg_points'] = trim((string) $input['points']) !== '' ? trim((string) $input['points']) : null;
        }
        if (array_key_exists('is_locked', $data)) {
            $data['is_locked'] = !empty($data['is_locked']) ? 1 : 0;
        }

        if ($data !== []) {
            CemeterySection::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'cemetery_sections', $id);
        }

        Response::json(CemeterySection::find($id));
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        $section = CemeterySection::find($id);
        if (!$section) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        if ((int) ($section['is_locked'] ?? 0) === 1) {
            Response::json(['error' => 'Section is locked — unlock it before deleting.'], 409);
            return;
        }

        $count = CemeterySection::lotCount($id);
        if ($count > 0) {
            Response::json(['error' => "Cannot delete section: $count lot(s) are assigned to it. Move or delete the lots first."], 422);
            return;
        }

        CemeterySection::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'cemetery_sections', $id);
        Response::json(['message' => 'Deleted']);
    }
}