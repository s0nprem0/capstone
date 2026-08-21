<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\Notification;

class NotificationController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function mine(): void
    {
        Auth::requireRole(['user', 'admin', 'staff']);
        $notifications = Notification::forUser(Auth::id());
        $unread = Notification::unreadCount(Auth::id());
        Response::json(['notifications' => $notifications, 'unread_count' => $unread]);
    }

    public function markRead(int $id): void
    {
        Auth::requireRole(['user', 'admin', 'staff']);
        Notification::markRead(Auth::id(), $id);
        $unread = Notification::unreadCount(Auth::id());
        Response::json(['unread_count' => $unread]);
    }

    public function markAllRead(): void
    {
        Auth::requireRole(['user', 'admin', 'staff']);
        Notification::markAllRead(Auth::id());
        Response::json(['unread_count' => 0]);
    }
}
