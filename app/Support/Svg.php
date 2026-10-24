<?php

declare(strict_types=1);

namespace App\Support;

/** Geometry on the survey plan's 4096 x 3072 map space. */
class Svg
{
    /** "x y width height" with non-negative numbers and a positive size. */
    public static function validViewbox(mixed $value): bool
    {
        $parts = preg_split('/\s+/', trim((string) $value));
        if ($parts === false || count($parts) !== 4) {
            return false;
        }
        foreach ($parts as $n) {
            if (!is_numeric($n) || (float) $n < 0) {
                return false;
            }
        }
        return (float) $parts[2] > 0 && (float) $parts[3] > 0;
    }

    /** "x y x y ..." — an even number of numbers, at least 3 vertices. */
    public static function validPoints(mixed $value): bool
    {
        $parts = preg_split('/\s+/', trim((string) $value)) ?: [];
        if (count($parts) < 6 || count($parts) % 2 !== 0) {
            return false;
        }
        foreach ($parts as $n) {
            if (!is_numeric($n)) {
                return false;
            }
        }
        return true;
    }

    /** @return list<array{0: float, 1: float}> */
    public static function points(string $value): array
    {
        $nums = array_map('floatval', preg_split('/\s+/', trim($value)) ?: []);
        $points = [];
        for ($i = 0; $i + 1 < count($nums); $i += 2) {
            $points[] = [$nums[$i], $nums[$i + 1]];
        }
        return $points;
    }

    /** @param list<array{0: float, 1: float}> $poly */
    public static function contains(array $poly, float $px, float $py): bool
    {
        $inside = false;
        $n = count($poly);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$xi, $yi] = $poly[$i];
            [$xj, $yj] = $poly[$j];
            if ((($yi > $py) !== ($yj > $py)) && ($px < ($xj - $xi) * ($py - $yi) / ($yj - $yi) + $xi)) {
                $inside = !$inside;
            }
        }
        return $inside;
    }
}
