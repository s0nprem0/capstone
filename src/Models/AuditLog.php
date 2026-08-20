<?php

declare(strict_types=1);

namespace App\Models;

class AuditLog extends Model
{
    protected static string $table = 'audit_logs';
    protected static string $primaryKey = 'log_id';

    public static function record(?int $userId, string $action, string $tableName, ?int $recordId = null): void
    {
        self::create([
            'user_id' => $userId,
            'action' => $action,
            'table_name' => $tableName,
            'record_id' => $recordId,
        ]);
    }
}