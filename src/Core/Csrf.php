<?php

declare(strict_types=1);

namespace App\Core;

class Csrf
{
    public static function generate(): string
    {
        if (!Session::has('csrf_token')) {
            Session::set('csrf_token', bin2hex(random_bytes(32)));
        }
        return Session::get('csrf_token');
    }

    public static function token(): string
    {
        return self::generate();
    }

    public static function validate(?string $token): bool
    {
        $stored = Session::get('csrf_token');
        return $stored !== null && is_string($token) && hash_equals($stored, $token);
    }
}