<?php

declare(strict_types=1);

namespace App\Support;

use DateTimeImmutable;

class Dates
{
    /**
     * A real calendar date in YYYY-MM-DD. The pattern alone lets 2026-02-30
     * through, and MySQL then rejects it with a server error instead of a 422.
     */
    public static function valid(mixed $value): bool
    {
        if (!is_string($value)) {
            return false;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date !== false && $date->format('Y-m-d') === $value;
    }

    public static function nextDay(string $date): string
    {
        return (new DateTimeImmutable($date))->modify('+1 day')->format('Y-m-d');
    }
}
