<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Failed sign-ins are counted per account from an address, so one clerk's typos
 * do not lock out every desk behind the office's shared IP. A looser ceiling on
 * the address alone still stops one machine from guessing across many accounts.
 *
 * Kept in login_attempts rather than the cache, so a reset (Settings) clears it
 * with the rest of the records and it survives a cache flush.
 */
class LoginThrottle
{
    public const MAX_ATTEMPTS = 5;
    private const MAX_PER_ADDRESS = 20;
    public const WINDOW_MINUTES = 15;

    public static function blocked(string $ip, string $email): bool
    {
        return self::accountFailures($ip, $email) >= self::MAX_ATTEMPTS
            || self::recent()->where('ip_address', $ip)->count() >= self::MAX_PER_ADDRESS;
    }

    /** Attempts left on this account from this address before it is paused. */
    public static function remaining(string $ip, string $email): int
    {
        return max(0, self::MAX_ATTEMPTS - self::accountFailures($ip, $email));
    }

    public static function recordFailure(string $ip, string $email): void
    {
        DB::table('login_attempts')->insert(['ip_address' => $ip, 'email' => mb_substr($email, 0, 100)]);
    }

    public static function clear(string $ip, string $email): void
    {
        DB::table('login_attempts')->where('ip_address', $ip)->where('email', mb_substr($email, 0, 100))->delete();
    }

    private static function accountFailures(string $ip, string $email): int
    {
        return self::recent()->where('ip_address', $ip)->where('email', mb_substr($email, 0, 100))->count();
    }

    private static function recent(): Builder
    {
        return DB::table('login_attempts')->where('attempted_at', '>=', now()->subMinutes(self::WINDOW_MINUTES)->format('Y-m-d H:i:s'));
    }
}
