<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    public const ROLES = ['admin', 'staff', 'user'];
    public const STATUSES = ['active', 'inactive'];

    protected $primaryKey = 'user_id';
    public $timestamps = false;

    protected $fillable = ['fullname', 'email', 'phone', 'password', 'role', 'status'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return ['password' => 'hashed'];
    }

    /** Sessions only; the users table has no remember-me column. */
    public function getRememberTokenName(): string
    {
        return '';
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class, 'user_id');
    }

    public function isOffice(): bool
    {
        return in_array($this->role, ['admin', 'staff'], true);
    }

    /** @return list<int> the active staff and administrator accounts */
    public static function officeIds(): array
    {
        return self::query()
            ->whereIn('role', ['admin', 'staff'])
            ->where('status', 'active')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public static function search(array $filters): Builder
    {
        $query = self::query()->orderByDesc('user_id');

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w
                ->where('fullname', 'like', "%{$q}%")
                ->orWhere('email', 'like', "%{$q}%")
                ->orWhere('phone', 'like', "%{$q}%"));
        }
        if (in_array($filters['role'] ?? null, self::ROLES, true)) {
            $query->where('role', $filters['role']);
        }
        if (in_array($filters['status'] ?? null, self::STATUSES, true)) {
            $query->where('status', $filters['status']);
        }

        return $query;
    }
}
