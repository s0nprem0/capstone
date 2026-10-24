<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $table = 'notifications';
    protected $primaryKey = 'notification_id';
    public $timestamps = false;

    protected $fillable = ['user_id', 'message', 'type', 'reservation_id', 'is_read'];

    public static function forUser(int $userId): Collection
    {
        return self::query()
            ->from('notifications as n')
            ->leftJoin('reservations as r', 'r.reservation_id', '=', 'n.reservation_id')
            ->leftJoin('cemetery_lots as l', 'l.lot_id', '=', 'r.lot_id')
            ->select('n.*', 'l.lot_code')
            ->where('n.user_id', $userId)
            ->orderByDesc('n.notification_id')
            ->get();
    }

    public static function unreadCount(int $userId): int
    {
        return self::query()->where('user_id', $userId)->where('is_read', 0)->count();
    }

    public static function markRead(int $userId, int $id): void
    {
        self::query()->where('notification_id', $id)->where('user_id', $userId)->update(['is_read' => 1]);
    }

    public static function markAllRead(int $userId): void
    {
        self::query()->where('user_id', $userId)->where('is_read', 0)->update(['is_read' => 1]);
    }

    public static function createFor(int $userId, string $message, string $type = 'system', ?int $reservationId = null): void
    {
        self::create([
            'user_id' => $userId,
            'message' => $message,
            'type' => $type,
            'reservation_id' => $reservationId,
            'is_read' => 0,
        ]);
    }
}
