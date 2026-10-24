<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class Lot extends Model
{
    public const TYPES = ['single', 'double', 'family'];
    public const STATUSES = ['available', 'reserved', 'occupied'];

    /** Interments a plot holds, by lot_type; also the most slots one reservation can take. */
    public const CAPACITY = ['single' => 1, 'double' => 2, 'family' => 4];

    protected $table = 'cemetery_lots';
    protected $primaryKey = 'lot_id';
    public $timestamps = false;

    protected $fillable = [
        'lot_code', 'section_id', 'block', 'lot_type', 'price', 'status', 'description',
        'latitude', 'longitude', 'svg_x', 'svg_y', 'svg_w', 'svg_h', 'svg_points',
    ];

    /**
     * Geometry as numbers. The svg_* columns are DECIMAL, which PDO hands back
     * as strings to keep their precision, and the map does arithmetic on them:
     * a label sits at x + w / 2, a drag adds a delta. String arithmetic in the
     * browser concatenates instead of adding.
     */
    protected function casts(): array
    {
        return [
            'svg_x' => 'float',
            'svg_y' => 'float',
            'svg_w' => 'float',
            'svg_h' => 'float',
        ];
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(CemeterySection::class, 'section_id');
    }

    public function capacity(): int
    {
        return self::CAPACITY[$this->lot_type] ?? 1;
    }

    public static function findForUpdate(int $id): ?self
    {
        return self::query()->lockForUpdate()->find($id);
    }

    public function occupy(): void
    {
        $this->update(['status' => 'occupied']);
    }

    public static function search(array $filters): Collection
    {
        $query = self::query()->orderBy('lot_code');

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('lot_code', 'like', "%{$q}%")->orWhere('block', 'like', "%{$q}%"));
        }
        if (in_array($filters['status'] ?? null, self::STATUSES, true)) {
            $query->where('status', $filters['status']);
        }
        if (in_array($filters['lot_type'] ?? null, self::TYPES, true)) {
            $query->where('lot_type', $filters['lot_type']);
        }
        if ((int) ($filters['section_id'] ?? 0) > 0) {
            $query->where('section_id', (int) $filters['section_id']);
        }

        return self::window($query, $filters)->get();
    }

    public static function available(array $filters): Collection
    {
        return self::window(self::query()->where('status', 'available')->orderBy('lot_code'), $filters)->get();
    }

    /**
     * A capped LIMIT/OFFSET from the request, so an unpaginated caller cannot
     * pull every one of the thousands of plots.
     */
    private static function window(Builder $query, array $filters, int $default = 200, int $max = 1000): Builder
    {
        $limit = max(1, min($max, (int) ($filters['limit'] ?? $default)));
        $offset = max(0, (int) ($filters['offset'] ?? 0));
        return $query->limit($limit)->offset($offset);
    }

    /**
     * Every plot for the map, as plain rows: at ~6,800 plots, building a model
     * for each would triple the time of the largest payload the app sends.
     * latitude/longitude are left out, since nothing in the SVG map reads
     * them; section fields beyond the name travel once, on the section.
     *
     * @return list<object>
     */
    public static function forMap(): array
    {
        return DB::table('cemetery_lots as l')
            ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
            ->select([
                'l.lot_id', 'l.lot_code', 'l.block', 'l.lot_type', 'l.price', 'l.status',
                'l.svg_x', 'l.svg_y', 'l.svg_w', 'l.svg_h', 'l.svg_points', 'l.description',
                's.section_id', 's.section_name',
            ])
            ->orderBy('s.section_name')
            ->orderBy('l.lot_code')
            ->get()
            ->each(function (object $lot) {
                foreach (['svg_x', 'svg_y', 'svg_w', 'svg_h'] as $field) {
                    $lot->{$field} = (float) $lot->{$field};
                }
            })
            ->all();
    }

    /**
     * Next free code in a section's surveyed sequence, e.g. 12 -> "S12-050".
     *
     * Allocated here rather than in the browser because the browser cannot see
     * the current codes: the map is fetched once per page load, so a client-side
     * "first free number" goes stale the moment a lot is added. The database
     * owns the unique key, so it is the only place that can answer this.
     *
     * Max+1 rather than first-free, so the sequence stays monotonic even where
     * a section has gaps in it.
     */
    public static function nextSurveyCode(int $sectionNumber): string
    {
        $prefix = 'S'.$sectionNumber.'-';
        $max = self::query()
            ->where('lot_code', 'like', $prefix.'%')
            ->max(DB::raw("CAST(SUBSTRING_INDEX(`lot_code`, '-', -1) AS UNSIGNED)"));
        return $prefix.str_pad((string) (((int) $max) + 1), 3, '0', STR_PAD_LEFT);
    }

    /** Count of reservations, burials and recorded owners attached to a lot (deletion guard). */
    public static function usage(int $id): array
    {
        return [
            'reservations' => Reservation::query()->where('lot_id', $id)->count(),
            'burials' => BurialRecord::query()->where('lot_id', $id)->count(),
            'owners' => LotOwner::query()->where('lot_id', $id)->count(),
        ];
    }

    /** Pending or approved reservations still holding a lot. */
    public static function liveReservations(int $id): int
    {
        return Reservation::query()->where('lot_id', $id)->whereIn('approved_status', ['pending', 'approved'])->count();
    }

    /** Most slots any pending or approved reservation takes in a lot. */
    public static function largestLiveReservation(int $id): int
    {
        return (int) Reservation::query()
            ->where('lot_id', $id)
            ->whereIn('approved_status', ['pending', 'approved'])
            ->max('number_of_slots');
    }

    /**
     * Returns a lot to the available pool once nothing holds it: no pending or
     * approved reservation, no burial record and no recorded owner. A lot with
     * a burial or an owner against it is occupied whatever becomes of its
     * reservations. Locks the row, so call it inside the caller's transaction.
     */
    public static function releaseIfFree(int $id): void
    {
        $lot = self::findForUpdate($id);
        if (!$lot) {
            return;
        }

        $usage = self::usage($id);
        if ($usage['burials'] > 0 || $usage['owners'] > 0) {
            if ($lot->status !== 'occupied') {
                $lot->occupy();
            }
            return;
        }

        if ($lot->status !== 'available' && self::liveReservations($id) === 0) {
            $lot->update(['status' => 'available']);
        }
    }
}
