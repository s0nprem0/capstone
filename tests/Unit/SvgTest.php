<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Dates;
use App\Support\Svg;
use PHPUnit\Framework\TestCase;

class SvgTest extends TestCase
{
    public function test_points_need_three_vertices_of_numbers(): void
    {
        $this->assertTrue(Svg::validPoints('0 0 10 0 10 10'));
        $this->assertFalse(Svg::validPoints('0 0 10 0'));
        $this->assertFalse(Svg::validPoints('0 0 10 0 10'));
        $this->assertFalse(Svg::validPoints('0 0 10 0 10 x'));
    }

    public function test_viewbox_needs_a_positive_size(): void
    {
        $this->assertTrue(Svg::validViewbox('0 0 4096 3072'));
        $this->assertFalse(Svg::validViewbox('0 0 0 10'));
        $this->assertFalse(Svg::validViewbox('-1 0 10 10'));
        $this->assertFalse(Svg::validViewbox('0 0 10'));
    }

    public function test_contains_tests_a_point_against_the_outline(): void
    {
        $square = Svg::points('0 0 10 0 10 10 0 10');

        $this->assertTrue(Svg::contains($square, 5, 5));
        $this->assertFalse(Svg::contains($square, 15, 5));
    }

    public function test_dates_must_be_real_calendar_days(): void
    {
        $this->assertTrue(Dates::valid('2028-02-29'));
        $this->assertFalse(Dates::valid('2026-02-30'));
        $this->assertFalse(Dates::valid('2026-2-1'));
        $this->assertFalse(Dates::valid(null));
        $this->assertSame('2026-03-01', Dates::nextDay('2026-02-28'));
    }
}
