<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\CemeterySection;
use App\Models\Lot;
use Illuminate\Http\JsonResponse;

class MapController extends Controller
{
    public function map(): JsonResponse
    {
        // In the plan's own order, so sections added later (the perimeter
        // rows, the northern strips) do not trail the list.
        $sections = CemeterySection::query()
            ->orderByRaw('section_number IS NULL')
            ->orderBy('section_number')
            ->orderBy('section_id')
            ->get();

        // One pass over the lots into per-section buckets, rather than scanning
        // the whole set once per section (70 x 6,440).
        $bySection = [];
        foreach (Lot::forMap() as $lot) {
            $bySection[$lot->section_id][] = $lot;
        }

        $grouped = $sections->map(function (CemeterySection $section) use ($bySection) {
            $lots = $bySection[$section->section_id] ?? [];
            $counts = ['available' => 0, 'reserved' => 0, 'occupied' => 0];
            foreach ($lots as $lot) {
                if (isset($counts[$lot->status])) {
                    $counts[$lot->status]++;
                }
            }
            return [
                'section_id' => $section->section_id,
                'section_name' => $section->section_name,
                'location' => $section->location,
                'viewBox' => $section->svg_viewbox ?? '0 0 4096 3072',
                'image' => $section->svg_image,
                'points' => $section->svg_points,
                'is_locked' => $section->isLocked(),
                'counts' => $counts,
                'lots' => $lots,
            ];
        });

        return response()->json([
            'viewBox' => [0, 0, 4096, 3072],
            'sections' => $grouped,
        ]);
    }
}
