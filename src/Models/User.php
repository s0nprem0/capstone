<?php

declare(strict_types=1);

namespace App\Models;

class User extends Model
{
    protected static string $table = 'users';
    protected static string $primaryKey = 'user_id';

    public static function findByEmail(string $email): ?array
    {
        return self::findBy('email', $email);
    }

    public static function verifyPassword(array $user, string $password): bool
    {
        return password_verify($password, $user['password']);
    }

    public static function publicUser(array $user): array
    {
        unset($user['password']);
        return $user;
    }
}