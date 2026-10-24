<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Dates;
use App\Support\Search;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class Payment extends Model
{
    public const METHODS = ['cash', 'gcash', 'bank_transfer', 'cheque', 'other'];

    /** The most a DECIMAL(10,2) amount column holds. */
    public const MAX_AMOUNT = 99999999.99;

    protected $table = 'payments';
    protected $primaryKey = 'payment_id';
    public $timestamps = false;

    protected $fillable = ['reservation_id', 'amount', 'method', 'reference_no', 'payment_date', 'notes', 'recorded_by'];

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(Reservation::class, 'reservation_id');
    }

    /** The payment with its reservation, plot, client and the staff member who took it. */
    public static function detailed(): Builder
    {
        return self::query()
            ->from('payments as p')
            ->join('reservations as r', 'r.reservation_id', '=', 'p.reservation_id')
            ->join('cemetery_lots as l', 'l.lot_id', '=', 'r.lot_id')
            ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
            ->join('users as u', 'u.user_id', '=', 'r.user_id')
            ->leftJoin('users as rec', 'rec.user_id', '=', 'p.recorded_by')
            ->select(
                'p.*', 'r.total_amount', 'r.approved_status', 'r.payment_status',
                'r.user_id', 'l.lot_id', 'l.lot_code', 's.section_name',
                'u.fullname as user_name', 'rec.fullname as recorded_by_name'
            );
    }

    public static function withDetails(int $id): ?self
    {
        return self::detailed()->where('p.payment_id', $id)->first();
    }

    /** @param int|null $userId restrict to one client's reservations (visitor view) */
    public static function search(array $filters, ?int $userId = null): Collection
    {
        $query = self::detailed()->orderByDesc('p.payment_date')->orderByDesc('p.payment_id');

        if ($userId !== null) {
            $query->where('r.user_id', $userId);
        }
        if ((int) ($filters['reservation_id'] ?? 0) > 0) {
            $query->where('p.reservation_id', (int) $filters['reservation_id']);
        }

        $q = Search::term($filters);
        if ($q !== '') {
            $like = Search::contains($q);
            $query->where(fn (Builder $w) => $w
                ->where('l.lot_code', 'like', $like)
                ->orWhere('u.fullname', 'like', $like)
                ->orWhere('p.reference_no', 'like', $like));
        }
        if (in_array($filters['method'] ?? null, self::METHODS, true)) {
            $query->where('p.method', $filters['method']);
        }
        if (Dates::valid($filters['from'] ?? null)) {
            $query->where('p.payment_date', '>=', $filters['from']);
        }
        if (Dates::valid($filters['to'] ?? null)) {
            $query->where('p.payment_date', '<=', $filters['to']);
        }

        return $query->get();
    }

    /**
     * Recompute a reservation's stored payment_status from its payments. Called
     * after any payment change and after the reservation's amount changes, so
     * the stored value never drifts from the rows it summarises.
     */
    public static function recomputeStatus(int $reservationId): void
    {
        $reservation = Reservation::find($reservationId);
        if (!$reservation) {
            return;
        }
        $paid = (float) self::query()->where('reservation_id', $reservationId)->sum('amount');
        $total = (float) $reservation->total_amount;
        $status = $paid <= 0 ? 'unpaid' : ($paid >= $total ? 'paid' : 'partial');
        $reservation->update(['payment_status' => $status]);
    }

    /** Totals for the dashboard and the payments report. */
    public static function summary(): array
    {
        return [
            'total' => (float) self::query()->sum('amount'),
            'count' => self::query()->count(),
            'this_month' => (float) self::query()->whereRaw("payment_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')")->sum('amount'),
            'by_method' => DB::table('payments')
                ->select('method')
                ->selectRaw('COUNT(*) AS `count`, COALESCE(SUM(`amount`), 0) AS `total`')
                ->groupBy('method')
                ->orderByDesc('total')
                ->get(),
        ];
    }
}
