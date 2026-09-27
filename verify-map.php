<?php

declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';

use App\Config\Database;

$pdo = Database::connection();

$sections = $pdo->query("SELECT section_id, section_name, svg_viewbox, svg_points FROM cemetery_sections ORDER BY section_id")
    ->fetchAll();
$lots = $pdo->query("SELECT lot_id, lot_code, section_id, svg_x, svg_y, svg_w, svg_h FROM cemetery_lots")
    ->fetchAll();

function parsePoints(string $s): array
{
    $nums = preg_split('/\s+/', trim($s)) ?: [];
    $pts = [];
    for ($i = 0; $i + 1 < count($nums); $i += 2) {
        $pts[] = [(float) $nums[$i], (float) $nums[$i + 1]];
    }
    return $pts;
}

function pointInPolygon(array $poly, float $x, float $y): bool
{
    $hit = false;
    $n = count($poly);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        [$xi, $yi] = $poly[$i];
        [$xj, $yj] = $poly[$j];
        if (($yi > $y) !== ($yj > $y) && $x < (($xj - $xi) * ($y - $yi)) / ($yj - $yi) + $xi) {
            $hit = !$hit;
        }
    }
    return $hit;
}

$bySection = [];
foreach ($lots as $l) {
    $bySection[(int) $l['section_id']][] = $l;
}

$bad = 0;
$total = 0;
printf("%-4s %-11s %5s %5s %6s %6s %8s\n", 'id', 'section', 'lots', 'verts', 'outside', 'overlap', 'cell');
foreach ($sections as $s) {
    $id = (int) $s['section_id'];
    $poly = parsePoints((string) $s['svg_points']);
    $ls = $bySection[$id] ?? [];
    $outside = 0;
    $boxes = [];

    foreach ($ls as $l) {
        $total++;
        $cx = $l['svg_x'] + $l['svg_w'] / 2;
        $cy = $l['svg_y'] + $l['svg_h'] / 2;
        if (!pointInPolygon($poly, $cx, $cy)) {
            $outside++;
        }
        $boxes[] = [$l['svg_x'], $l['svg_y'], $l['svg_x'] + $l['svg_w'], $l['svg_y'] + $l['svg_h'], $l['lot_code']];
    }

    // pairwise overlap within the section
    $overlap = 0;
    $n = count($boxes);
    for ($i = 0; $i < $n; $i++) {
        for ($j = $i + 1; $j < $n; $j++) {
            if ($boxes[$i][0] < $boxes[$j][2] && $boxes[$j][0] < $boxes[$i][2]
                && $boxes[$i][1] < $boxes[$j][3] && $boxes[$j][1] < $boxes[$i][3]) {
                $overlap++;
            }
        }
    }
    $bad += $outside + $overlap;

    $vb = preg_split('/\s+/', trim((string) $s['svg_viewbox']));
    $cellW = $ls ? (int) round(array_sum(array_column($ls, 'svg_w')) / count($ls)) : 0;
    $cellH = $ls ? (int) round(array_sum(array_column($ls, 'svg_h')) / count($ls)) : 0;
    printf(
        "%-4d %-11s %5d %5d %6d %6d %4dx%-4d (vb %s)\n",
        $id,
        $s['section_name'],
        count($ls),
        count($poly),
        $outside,
        $overlap,
        $cellW,
        $cellH,
        implode(' ', $vb)
    );
}

printf("\n%d lots checked, %d problems (centres outside the outline, or overlapping)\n", $total, $bad);

// Every plot must sit within the whole-map viewBox too.
$oob = 0;
foreach ($lots as $l) {
    if ($l['svg_x'] < 0 || $l['svg_y'] < 0 || $l['svg_x'] + $l['svg_w'] > 1791 || $l['svg_y'] + $l['svg_h'] > 1457) {
        $oob++;
    }
}
printf("%d lots outside the overall viewBox 0 0 1791 1457\n", $oob);

exit($bad + $oob === 0 ? 0 : 1);
