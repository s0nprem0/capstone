<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $table = 'audit_logs';
    protected $primaryKey = 'log_id';
    public $timestamps = false;

    protected $fillable = ['user_id', 'action', 'table_name', 'record_id', 'ip_address', 'details'];

    /**
     * Fields whose value never goes into the log: a password hash is secret,
     * and a traced outline is kilobytes of coordinates nobody reads. The log
     * still says they changed.
     */
    private const MASKED = ['password', 'svg_points', 'svg_image'];

    /**
     * @param array<string, mixed>|null $details what was done, e.g. changes()
     *        for an update or snapshot() for a delete, so the entry says more
     *        than "user 3 updated payment 7"
     */
    public static function record(?int $userId, string $action, string $tableName, ?int $recordId = null, ?array $details = null): void
    {
        self::create([
            'user_id' => $userId,
            'action' => $action,
            'table_name' => $tableName,
            'record_id' => $recordId,
            'ip_address' => app()->runningInConsole() ? null : substr((string) request()->ip(), 0, 45),
            'details' => $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
        ]);
    }

    /**
     * Each field in $after whose value differs from $before, as [old, new].
     * Numbers compare by value, so "5000.00" from the database and 5000 from
     * the request are not reported as a change.
     *
     * @return array{changes: array<string, array{0: mixed, 1: mixed}>}|null null when nothing changed
     */
    public static function changes(array $before, array $after): ?array
    {
        $changes = [];
        foreach ($after as $field => $new) {
            $old = $before[$field] ?? null;
            $same = is_numeric($old) && is_numeric($new)
                ? (float) $old === (float) $new
                : (string) $old === (string) $new;
            if ($same) {
                continue;
            }
            $changes[$field] = in_array($field, self::MASKED, true) ? ['(hidden)', '(changed)'] : [$old, $new];
        }
        return $changes === [] ? null : ['changes' => $changes];
    }

    /**
     * The named fields of a row, for a create or delete entry, so a deleted
     * record can still be identified from the log.
     *
     * @param list<string> $fields
     * @return array{record: array<string, mixed>}
     */
    public static function snapshot(array $row, array $fields): array
    {
        return ['record' => array_intersect_key($row, array_flip($fields))];
    }
}
