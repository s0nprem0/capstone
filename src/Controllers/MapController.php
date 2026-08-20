<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Core\Router;
use App\Models\CemeterySection;
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
        $sections = CemeterySection::all();
        $lots = Lot::map();

        $grouped = array_map(function ($section) use ($lots) {
            $section['lots'] = array_values(array_filter($lots, fn($l) => (int) $l['section_id'] === (int) $section['section_id']));
            return $section;
        }, $sections);

        Response::json([
            'center' => ['lat' => 14.365789, 'lng' => 120.857495],
            'sections' => $grouped,
        ]);
    }
}
