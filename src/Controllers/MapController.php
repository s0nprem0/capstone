<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Response;
use App\Core\Router;
use App\Models\Lot;

class MapController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function map(): void
    {
        $stmt = Database::connection()->query(
            // In the plan's own order, so sections added later (the perimeter
            // rows, the northern strips) do not trail the list.
            "SELECT * FROM cemetery_sections ORDER BY section_number IS NULL, section_number, section_id"
        );
        $sections = $stmt->fetchAll();
        $lots = Lot::map();

        // One pass over the lots into per-section buckets, rather than scanning
        // the whole set once per section (70 x 6,440).
        $bySection = [];
        foreach ($lots as $lot) {
            $bySection[(int) $lot['section_id']][] = $lot;
        }

        $grouped = array_map(function ($section) use ($bySection) {
            $sectionLots = $bySection[(int) $section['section_id']] ?? [];
            $counts = ['available' => 0, 'reserved' => 0, 'occupied' => 0];
            foreach ($sectionLots as $lot) {
                if (isset($counts[$lot['status']])) {
                    $counts[$lot['status']]++;
                }
            }
            return [
                'section_id' => $section['section_id'],
                'section_name' => $section['section_name'],
                'location' => $section['location'] ?? null,
                'viewBox' => $section['svg_viewbox'] ?? '0 0 4096 3072',
                'image' => $section['svg_image'] ?? null,
                'points' => $section['svg_points'] ?? null,
                'is_locked' => (int) ($section['is_locked'] ?? 0) === 1,
                'counts' => $counts,
                'lots' => $sectionLots,
            ];
        }, $sections);

        Response::json([
            'viewBox' => [0, 0, 4096, 3072],
            'sections' => $grouped,
        ]);
    }
}