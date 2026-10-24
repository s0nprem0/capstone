<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Svg;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Checks the map geometry the seed and the lot editor both depend on: every
 * plot's centre inside its section outline, no two plots overlapping, and
 * nothing outside the overall viewBox. Exits non-zero when one is not.
 */
class VerifyMap extends Command
{
    protected $signature = 'map:verify';

    protected $description = 'Check every plot sits inside its section outline, without overlaps';

    public function handle(): int
    {
        $sections = DB::table('cemetery_sections')->select('section_id', 'section_name', 'svg_viewbox', 'svg_points')->orderBy('section_id')->get();
        $lots = DB::table('cemetery_lots')->select('lot_id', 'lot_code', 'section_id', 'svg_x', 'svg_y', 'svg_w', 'svg_h', 'svg_points')->get();

        $bySection = $lots->groupBy('section_id');

        $bad = 0;
        $total = 0;
        $this->line(sprintf('%-4s %-11s %5s %5s %6s %6s %8s', 'id', 'section', 'lots', 'verts', 'outside', 'overlap', 'cell'));
        foreach ($sections as $s) {
            $poly = Svg::points((string) $s->svg_points);
            $ls = $bySection->get($s->section_id, collect());
            $outside = 0;
            $boxes = [];

            // A section with no outline has no polygon to test against; the
            // editor falls back to its view box. Report it rather than failing
            // every plot.
            $hasOutline = count($poly) >= 3;

            foreach ($ls as $l) {
                $total++;
                [$x0, $y0, $w, $h] = [(float) $l->svg_x, (float) $l->svg_y, (float) $l->svg_w, (float) $l->svg_h];
                if ($hasOutline && !Svg::contains($poly, $x0 + $w / 2, $y0 + $h / 2)) {
                    $outside++;
                }
                [$x1, $y1] = [$x0 + $w, $y0 + $h];
                // A tilted or cut plot is tested by its outline: its bounding
                // box overlaps its neighbours' even where the plots do not.
                $shape = !empty($l->svg_points)
                    ? Svg::points((string) $l->svg_points)
                    : [[$x0, $y0], [$x1, $y0], [$x1, $y1], [$x0, $y1]];
                $boxes[] = [$x0, $y0, $x1, $y1, $shape];
            }

            $overlap = 0;
            $n = count($boxes);
            for ($i = 0; $i < $n; $i++) {
                for ($j = $i + 1; $j < $n; $j++) {
                    if ($boxes[$i][0] < $boxes[$j][2] && $boxes[$j][0] < $boxes[$i][2]
                        && $boxes[$i][1] < $boxes[$j][3] && $boxes[$j][1] < $boxes[$i][3]
                        && $this->polygonsOverlap($boxes[$i][4], $boxes[$j][4])) {
                        $overlap++;
                    }
                }
            }
            $bad += $outside + $overlap;

            if (!$hasOutline && $ls->isNotEmpty()) {
                $this->line(sprintf('  note: %s has no outline yet, so its %d plots are unchecked', $s->section_name, $ls->count()));
            }

            $this->line(sprintf(
                '%-4d %-11s %5d %5d %6d %6d %4dx%-4d (vb %s)',
                $s->section_id,
                $s->section_name,
                $ls->count(),
                count($poly),
                $outside,
                $overlap,
                $ls->isNotEmpty() ? (int) round($ls->avg('svg_w')) : 0,
                $ls->isNotEmpty() ? (int) round($ls->avg('svg_h')) : 0,
                implode(' ', preg_split('/\s+/', trim((string) $s->svg_viewbox)) ?: [])
            ));
        }

        $this->newLine();
        $this->line(sprintf('%d lots checked, %d problems (centres outside the outline, or overlapping)', $total, $bad));

        $oob = $lots->filter(fn ($l) => $l->svg_x < 0 || $l->svg_y < 0 || $l->svg_x + $l->svg_w > 4096 || $l->svg_y + $l->svg_h > 3072)->count();
        $this->line(sprintf('%d lots outside the overall viewBox 0 0 4096 3072', $oob));

        return $bad + $oob === 0 ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Whether two convex outlines overlap by more than $tolerance, by the
     * separating-axis test. Plots share drawn lines with their neighbours, so a
     * touch along an edge is not an overlap.
     */
    private function polygonsOverlap(array $a, array $b, float $tolerance = 0.5): bool
    {
        foreach ([$a, $b] as $poly) {
            $n = count($poly);
            for ($i = 0; $i < $n; $i++) {
                [$x1, $y1] = $poly[$i];
                [$x2, $y2] = $poly[($i + 1) % $n];
                $len = hypot($x2 - $x1, $y2 - $y1);
                if ($len == 0.0) {
                    continue;
                }
                $nx = ($y1 - $y2) / $len;
                $ny = ($x2 - $x1) / $len;
                $project = static fn (array $p): array => [
                    min(array_map(static fn ($q) => $q[0] * $nx + $q[1] * $ny, $p)),
                    max(array_map(static fn ($q) => $q[0] * $nx + $q[1] * $ny, $p)),
                ];
                [$amin, $amax] = $project($a);
                [$bmin, $bmax] = $project($b);
                if ($amax - $bmin <= $tolerance || $bmax - $amin <= $tolerance) {
                    return false;
                }
            }
        }
        return true;
    }
}
