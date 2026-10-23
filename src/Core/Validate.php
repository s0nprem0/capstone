<?php

declare(strict_types=1);

namespace App\Core;

use DateTimeImmutable;
use DateTimeZone;

class Validate
{
    /**
     * A real calendar date in YYYY-MM-DD. The pattern alone lets 2026-02-30
     * through, and MySQL then rejects it with a server error instead of a 422.
     */
    public static function date(mixed $value): bool
    {
        if (!is_string($value)) {
            return false;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date !== false && $date->format('Y-m-d') === $value;
    }

    /**
     * Today at the cemetery, not on the server. bootstrap.php already sets
     * PHP's zone; naming it here keeps this right if that is ever skipped,
     * since a visitor booking in the morning would otherwise be told today
     * is in the past.
     */
    public static function today(): string
    {
        $zone = new DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Asia/Manila');
        return (new DateTimeImmutable('now', $zone))->format('Y-m-d');
    }
}
