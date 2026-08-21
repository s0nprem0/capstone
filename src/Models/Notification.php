<?php

declare(strict_types=1);

namespace App\Models;

class Notification extends Model
{
    protected static string $table = 'notifications';
    protected static string $primaryKey = 'notification_id';

    public static function forUser(int $userId): array
    {
        $stmt = self::db()->prepare(
            "SELECT * FROM notifications WHERE user_id = :user_id ORDER BY notification_id DESC"
        );
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    public static function unreadCount(int $userId): int
    {
        $stmt = self::db()->prepare(
            "SELECT COUNT(*) FROM notifications WHERE user_id = :user_id AND is_read = 0"
        );
        $stmt->execute(['user_id' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    public static function markRead(int $userId, int $id): bool
    {
        $stmt = self::db()->prepare(
            "UPDATE notifications SET is_read = 1 WHERE notification_id = :id AND user_id = :user_id"
        );
        return $stmt->execute(['id' => $id, 'user_id' => $userId]);
    }

    public static function markAllRead(int $userId): bool
    {
        $stmt = self::db()->prepare(
            "UPDATE notifications SET is_read = 1 WHERE user_id = :user_id AND is_read = 0"
        );
        return $stmt->execute(['user_id' => $userId]);
    }

    public static function createFor(int $userId, string $message, string $type = 'system'): int
    {
        return self::create([
            'user_id' => $userId,
            'message' => $message,
            'type' => $type,
            'is_read' => 0,
        ]);
    }
}
