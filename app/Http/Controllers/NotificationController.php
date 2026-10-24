<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
    public function mine(): JsonResponse
    {
        return response()->json([
            'notifications' => Notification::forUser(Auth::id()),
            'unread_count' => Notification::unreadCount(Auth::id()),
        ]);
    }

    /** Just the badge count, so the header poll does not pull the whole list. */
    public function unreadCount(): JsonResponse
    {
        return response()->json(['unread_count' => Notification::unreadCount(Auth::id())]);
    }

    public function markRead(int $id): JsonResponse
    {
        Notification::markRead(Auth::id(), $id);
        return response()->json(['unread_count' => Notification::unreadCount(Auth::id())]);
    }

    public function markAllRead(): JsonResponse
    {
        Notification::markAllRead(Auth::id());
        return response()->json(['unread_count' => 0]);
    }
}
