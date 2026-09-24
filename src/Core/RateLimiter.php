<?php

declare(strict_types=1);

namespace App\Core;

use App\Config\Database;

class RateLimiter
{
    private const MAX_ATTEMPTS = 5;
    private const WINDOW_MINUTES = 15;

    public static function blocked(string $ip): bool
    {
        $cutoff = date('Y-m-d H:i:s', time() - self::WINDOW_MINUTES * 60);
        $stmt = Database::connection()->prepare(
            "SELECT COUNT(*)
             FROM login_attempts
             WHERE ip_address = :ip AND attempted_at >= :cutoff"
        );
        $stmt->execute(['ip' => $ip, 'cutoff' => $cutoff]);
        return (int) $stmt->fetchColumn() >= self::MAX_ATTEMPTS;
    }

    public static function recordFailure(string $ip, ?string $email): void
    {
        $stmt = Database::connection()->prepare(
            "INSERT INTO login_attempts (ip_address, email) VALUES (:ip, :email)"
        );
        $stmt->execute(['ip' => $ip, 'email' => $email]);
    }

    public static function clear(string $ip): void
    {
        $stmt = Database::connection()->prepare("DELETE FROM login_attempts WHERE ip_address = :ip");
        $stmt->execute(['ip' => $ip]);
    }
}