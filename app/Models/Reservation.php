<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Dates;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Reservation extends Model
{
    public const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

    protected $table = 'reservations';
    protected $primaryKey = 'reservation_id';
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'lot_id', 'reservation_date', 'purpose', 'number_of_slots',
        'total_amount', 'approved_status', 'payment_status',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function lot(): BelongsTo
    {
        return $this->belongsTo(Lot::class, 'lot_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'reservation_id');
    }

    /** Pending requests one client may hold at once; 0 turns the limit off. */
    public static function maxPending(): int
    {
        return (int) config('cemetery.reservation_max_pending');
    }

    /** Days an unpaid pending request holds its plot; 0 keeps holds forever. */
    public static function holdDays(): int
    {
        return (int) config('cemetery.reservation_hold_days');
    }

    public static function findForUpdate(int $id): ?self
    {
        return self::query()->lockForUpdate()->find($id);
    }

    public static function pendingCount(int $userId): int
    {
        return self::query()->where('user_id', $userId)->where('approved_status', 'pending')->count();
    }

    /**
     * The reservation with its plot, its client, what has been paid and, for
     * an unpaid pending request, when its hold runs out (the rule
     * expireStale() applies, computed in SQL so it shares NOW()'s clock).
     */
    public static function detailed(): Builder
    {
        $days = self::holdDays();

        return self::query()
            ->from('reservations as r')
            ->join('cemetery_lots as l', 'l.lot_id', '=', 'r.lot_id')
            ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
            ->join('users as u', 'u.user_id', '=', 'r.user_id')
            ->select('r.*', 'l.lot_code', 's.section_name', 'u.fullname as user_name', 'u.email as user_email')
            ->selectRaw('COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = r.reservation_id), 0) AS amount_paid')
            ->selectRaw(
                "CASE WHEN r.approved_status = 'pending' AND ? > 0
                     AND NOT EXISTS (SELECT 1 FROM payments hp WHERE hp.reservation_id = r.reservation_id)
                 THEN r.created_at + INTERVAL ? DAY END AS hold_until",
                [$days, $days]
            );
    }

    public static function withDetails(int $id): ?self
    {
        return self::detailed()->where('r.reservation_id', $id)->first();
    }

    public static function search(array $filters, ?int $userId = null): Collection
    {
        $query = self::detailed()->orderByDesc('r.reservation_id');

        if ($userId !== null) {
            $query->where('r.user_id', $userId);
        }

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w
                ->where('l.lot_code', 'like', "%{$q}%")
                ->orWhere('l.block', 'like', "%{$q}%")
                ->orWhere('u.fullname', 'like', "%{$q}%")
                ->orWhere('s.section_name', 'like', "%{$q}%")
                ->orWhere('r.purpose', 'like', "%{$q}%"));
        }
        if (in_array($filters['approved_status'] ?? null, self::STATUSES, true)) {
            $query->where('r.approved_status', $filters['approved_status']);
        }
        if ((int) ($filters['section_id'] ?? 0) > 0) {
            $query->where('l.section_id', (int) $filters['section_id']);
        }
        if (Dates::valid($filters['from'] ?? null)) {
            $query->where('r.reservation_date', '>=', $filters['from']);
        }
        if (Dates::valid($filters['to'] ?? null)) {
            $query->where('r.reservation_date', '<=', $filters['to']);
        }

        return $query->get();
    }

    /**
     * Turn away pending requests that have held a plot past the hold period
     * without a payment, and put their plots back on the map. Without this a
     * request nobody follows up keeps a plot off the market for good.
     *
     * Run on every API request (ExpireStaleReservations) rather than only from
     * the scheduler, which XAMPP has no cron for; the lookup is one indexed
     * query and usually finds nothing. A request with a payment against it is
     * never expired: the family is already paying and staff decide it.
     */
    public static function expireStale(): void
    {
        $days = self::holdDays();
        if ($days === 0) {
            return;
        }

        $ids = self::query()
            ->from('reservations as r')
            ->where('r.approved_status', 'pending')
            ->whereRaw('r.created_at < NOW() - INTERVAL ? DAY', [$days])
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('payments as p')->whereColumn('p.reservation_id', 'r.reservation_id'))
            ->pluck('r.reservation_id');

        foreach ($ids as $id) {
            self::expire((int) $id, $days);
        }
    }

    private static function expire(int $id, int $days): void
    {
        DB::transaction(function () use ($id, $days) {
            $reservation = self::findForUpdate($id);
            // Re-checked under the lock: staff may have decided it, or recorded
            // a payment, since the lookup.
            if (!$reservation || $reservation->approved_status !== 'pending' || $reservation->payments()->exists()) {
                return;
            }
            $before = $reservation->getAttributes();
            $reservation->update(['approved_status' => 'rejected']);
            Lot::releaseIfFree($reservation->lot_id);
            AuditLog::record(null, 'expire', 'reservations', $id, AuditLog::changes($before, ['approved_status' => 'rejected']));
            Notification::createFor(
                $reservation->user_id,
                "Your reservation #{$id} for lot ".(Lot::find($reservation->lot_id)?->lot_code ?? $reservation->lot_id)
                    ." expired after {$days} days without a payment, and the lot was released. Contact the office to book again.",
                'reservation',
                $id
            );
        });
    }
}
