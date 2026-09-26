<?php

declare(strict_types=1);

namespace App\Core;

use App\Models\User;

class Auth
{
    private static int $resolvedId = 0;
    private static ?array $resolved = null;

    public static function attempt(string $email, string $password): bool
    {
        $user = User::findByEmail($email);

        if (!$user || $user['status'] !== 'active') {
            return false;
        }

        if (!User::verifyPassword($user, $password)) {
            return false;
        }

        Session::regenerate();
        Session::set('user_id', (int) $user['user_id']);
        return true;
    }

    /**
     * Resolved once per request. requireRole() and the guard that follows it
     * both need the caller, and without this each call re-read the same row.
     * Keying on the session id makes a login in the same request re-resolve,
     * and a missing id short-circuits before any lookup.
     */
    public static function user(): ?array
    {
        $id = (int) Session::get('user_id');
        if ($id === 0) {
            return null;
        }

        if (self::$resolvedId !== $id) {
            $user = User::find($id);
            self::$resolved = $user ? User::publicUser($user) : null;
            self::$resolvedId = $id;
        }

        return self::$resolved;
    }

    public static function id(): ?int
    {
        return Session::get('user_id');
    }

    public static function check(): bool
    {
        return self::id() !== null;
    }

    public static function guest(): bool
    {
        return !self::check();
    }

    public static function role(): ?string
    {
        return self::user()['role'] ?? null;
    }

    public static function logout(): void
    {
        Session::destroy();
    }

    public static function requireRole(array $roles): void
    {
        $role = self::role();
        if ($role === null) {
            Response::json(['error' => 'Unauthenticated'], 401);
            exit;
        }
        if (!in_array($role, $roles, true)) {
            Response::json(['error' => 'Forbidden'], 403);
            exit;
        }
    }
}