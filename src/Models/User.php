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

    public static function search(array $filters): array
    {
        $where = [];
        $params = [];

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(fullname LIKE :q1 OR email LIKE :q2 OR phone LIKE :q3)';
            foreach (['q1', 'q2', 'q3'] as $param) {
                $params[$param] = "%{$q}%";
            }
        }

        if (isset($filters['role']) && in_array($filters['role'], ['admin', 'staff', 'user'], true)) {
            $where[] = 'role = :role';
            $params['role'] = $filters['role'];
        }
        if (isset($filters['status']) && in_array($filters['status'], ['active', 'inactive'], true)) {
            $where[] = 'status = :status';
            $params['status'] = $filters['status'];
        }

        $sql = "SELECT * FROM users";
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY user_id DESC';

        $stmt = self::db()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}