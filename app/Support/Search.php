<?php

declare(strict_types=1);

namespace App\Support;

class Search
{
    /**
     * The ?q= search box of a list, trimmed. Anything but a string (?q[]=x)
     * searches for nothing rather than failing the request.
     */
    public static function term(array $filters, string $key = 'q'): string
    {
        $value = $filters[$key] ?? '';
        return is_string($value) ? trim($value) : '';
    }

    /** A LIKE pattern matching $term anywhere, with its own % and _ taken literally. */
    public static function contains(string $term): string
    {
        return '%'.addcslashes($term, '%_\\').'%';
    }
}
