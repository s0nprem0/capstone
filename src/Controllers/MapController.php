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
            "SELECT * FROM cemetery_sections ORDER BY section_id ASC"
        );
        $sections = $stmt->fetchAll();
        $lots = Lot::map();

        $grouped = array_map(function ($section) use ($lots) {
            $sectionLots = array_values(array_filter($lots, fn($l) => (int) $l['section_id'] === (int) $section['section_id']));
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
                'viewBox' => $section['svg_viewbox'] ?? '0 0 1791 1457',
                'image' => $section['svg_image'] ?? null,
                'counts' => $counts,
                'lots' => $sectionLots,
            ];
        }, $sections);

        Response::json([
            'viewBox' => [0, 0, 1791, 1457],
            'sections' => $grouped,
        ]);
    }
}