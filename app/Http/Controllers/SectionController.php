<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\CemeterySection;
use App\Support\Svg;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class SectionController extends Controller
{
    private const VIEWBOX_ERROR = 'svg_viewbox must be 4 numbers (x y width height) with positive width and height';
    private const POINTS_ERROR = 'points must be an even list of numbers, e.g. "10 20 30 40 50 60" (at least three vertices)';

    public function index(): JsonResponse
    {
        return response()->json(CemeterySection::withCounts());
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(CemeterySection::findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $input = $request->validate($this->rules(), $this->messages());

        $viewbox = (string) ($input['svg_viewbox'] ?? '');
        $points = (string) ($input['points'] ?? '');
        $section = CemeterySection::create([
            'section_name' => $input['section_name'],
            'location' => $input['location'] ?? null,
            'description' => $input['description'] ?? null,
            'svg_viewbox' => $viewbox !== '' ? $viewbox : '0 0 4096 3072',
            'svg_image' => $input['svg_image'] ?? null,
            'svg_points' => $points !== '' ? $points : null,
            'is_locked' => !empty($input['is_locked']) ? 1 : 0,
        ]);

        AuditLog::record(Auth::id(), 'create', 'cemetery_sections', $section->section_id);
        return response()->json($section->fresh(), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $section = CemeterySection::findOrFail($id);

        if ($section->isLocked() && $request->hasAny(['points', 'svg_viewbox', 'svg_image'])) {
            return $this->error('Section is locked — unlock it to edit its outline.');
        }

        $input = $request->validate($this->rules($id), $this->messages());

        $data = array_intersect_key($input, array_flip([
            'section_name', 'location', 'description', 'svg_viewbox', 'svg_image', 'is_locked',
        ]));
        if (array_key_exists('points', $input)) {
            $data['svg_points'] = (string) $input['points'] !== '' ? $input['points'] : null;
        }
        if (array_key_exists('is_locked', $data)) {
            $data['is_locked'] = !empty($data['is_locked']) ? 1 : 0;
        }

        if ($data !== []) {
            $before = $section->getAttributes();
            $section->update($data);
            AuditLog::record(Auth::id(), 'update', 'cemetery_sections', $id, AuditLog::changes($before, $data));
        }

        return response()->json($section->fresh());
    }

    public function destroy(int $id): JsonResponse
    {
        $section = CemeterySection::findOrFail($id);
        if ($section->isLocked()) {
            return $this->error('Section is locked — unlock it before deleting.', 409);
        }

        $count = $section->lots()->count();
        if ($count > 0) {
            return $this->error("Cannot delete section: $count lot(s) are assigned to it. Move or delete the lots first.");
        }

        $section->delete();
        AuditLog::record(Auth::id(), 'delete', 'cemetery_sections', $id, AuditLog::snapshot($section->getAttributes(), ['section_name', 'section_number', 'location']));
        return response()->json(['message' => 'Deleted']);
    }

    /** @param int|null $id the section being updated, whose fields are each optional */
    private function rules(?int $id = null): array
    {
        $presence = $id === null ? ['required'] : ['sometimes', 'required'];

        return [
            'section_name' => [
                ...$presence, 'string', 'max:50',
                Rule::unique('cemetery_sections', 'section_name')->ignore($id, 'section_id'),
            ],
            'location' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'svg_viewbox' => ['nullable', 'string', fn (string $a, mixed $v, Closure $fail) => Svg::validViewbox($v) || $fail(self::VIEWBOX_ERROR)],
            'svg_image' => ['nullable', 'string', 'max:255'],
            'points' => ['nullable', 'string', fn (string $a, mixed $v, Closure $fail) => Svg::validPoints($v) || $fail(self::POINTS_ERROR)],
            'is_locked' => ['nullable'],
        ];
    }

    private function messages(): array
    {
        return [
            'section_name.required' => 'section_name is required',
            'section_name.max' => 'section_name must be at most 50 characters',
            'section_name.unique' => 'section_name already exists',
            'location.max' => 'location must be at most 100 characters',
        ];
    }
}
