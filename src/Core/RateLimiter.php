<?php

declare(strict_types=1);

namespace App\Core;

use App\Config\Database;

/**
 * Failed sign-ins are counted per account from an address, so one clerk's typos
 * do not lock out every desk behind the office's shared IP. A looser ceiling on
 * the address alone still stops one machine from guessing across many accounts.
 */
class RateLimiter
{
    public const MAX_ATTEMPTS = 5;
    private const MAX_PER_ADDRESS = 20;
    public const WINDOW_MINUTES = 15;

    public static function blocked(string $ip, string $email): bool
    {
        return self::accountFailures($ip, $email) >= self::MAX_ATTEMPTS
            || self::addressFailures($ip) >= self::MAX_PER_ADDRESS;
    }

    /** Attempts left on this account from this address before it is paused. */
    public static function remaining(string $ip, string $email): int
    {
        return max(0, self::MAX_ATTEMPTS - self::accountFailures($ip, $email));
    }

    public static function recordFailure(string $ip, string $email): void
    {
        $stmt = Database::connection()->prepare(
            "INSERT INTO login_attempts (ip_address, email) VALUES (:ip, :email)"
        );
        $stmt->execute(['ip' => $ip, 'email' => mb_substr($email, 0, 100)]);
    }

    public static function clear(string $ip, string $email): void
    {
        $stmt = Database::connection()->prepare(
            "DELETE FROM login_attempts WHERE ip_address = :ip AND email = :email"
        );
        $stmt->execute(['ip' => $ip, 'email' => mb_substr($email, 0, 100)]);
    }

    private static function accountFailures(string $ip, string $email): int
    {
        $stmt = Database::connection()->prepare(
            "SELECT COUNT(*)
             FROM login_attempts
             WHERE ip_address = :ip AND email = :email AND attempted_at >= :cutoff"
        );
        $stmt->execute(['ip' => $ip, 'email' => mb_substr($email, 0, 100), 'cutoff' => self::cutoff()]);
        return (int) $stmt->fetchColumn();
    }

    private static function addressFailures(string $ip): int
    {
        $stmt = Database::connection()->prepare(
            "SELECT COUNT(*)
             FROM login_attempts
             WHERE ip_address = :ip AND attempted_at >= :cutoff"
        );
        $stmt->execute(['ip' => $ip, 'cutoff' => self::cutoff()]);
        return (int) $stmt->fetchColumn();
    }

    private static function cutoff(): string
    {
        return date('Y-m-d H:i:s', time() - self::WINDOW_MINUTES * 60);
    }
}
