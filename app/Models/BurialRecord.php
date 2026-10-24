<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Dates;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

class BurialRecord extends Model
{
    public const TYPES = ['single', 'double', 'family', 'cremation'];
    public const INTERMENT = ['scheduled', 'interred'];

    protected $table = 'burial_records';
    protected $primaryKey = 'burial_id';
    public $timestamps = false;

    protected $fillable = [
        'deceased_fullname', 'date_of_birth', 'date_of_death', 'burial_date', 'lot_id',
        'burial_type', 'next_of_kin_name', 'next_of_kin_phone', 'interment_status',
    ];

    /**
     * Burials taking a grave slot in a lot. Cremated remains do not use a
     * slot, so they are not counted against the lot's capacity.
     */
    public static function slotsUsed(int $lotId, ?int $exceptId = null): int
    {
        return self::query()
            ->where('lot_id', $lotId)
            ->where('burial_type', '<>', 'cremation')
            ->where('burial_id', '<>', $exceptId ?? 0)
            ->count();
    }

    public static function detailed(): Builder
    {
        return self::query()
            ->from('burial_records as b')
            ->join('cemetery_lots as l', 'l.lot_id', '=', 'b.lot_id')
            ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
            ->select('b.*', 'l.lot_code', 's.section_name');
    }

    public static function withDetails(int $id): ?self
    {
        return self::detailed()->where('b.burial_id', $id)->first();
    }

    public static function search(array $filters): Collection
    {
        $query = self::detailed()->orderByDesc('b.burial_id');

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w
                ->where('b.deceased_fullname', 'like', "%{$q}%")
                ->orWhere('l.lot_code', 'like', "%{$q}%")
                ->orWhere('s.section_name', 'like', "%{$q}%")
                ->orWhere('b.next_of_kin_name', 'like', "%{$q}%"));
        }
        if (in_array($filters['interment_status'] ?? null, self::INTERMENT, true)) {
            $query->where('b.interment_status', $filters['interment_status']);
        }
        if (in_array($filters['burial_type'] ?? null, self::TYPES, true)) {
            $query->where('b.burial_type', $filters['burial_type']);
        }
        if ((int) ($filters['section_id'] ?? 0) > 0) {
            $query->where('l.section_id', (int) $filters['section_id']);
        }
        if ((int) ($filters['lot_id'] ?? 0) > 0) {
            $query->where('b.lot_id', (int) $filters['lot_id']);
        }
        if (Dates::valid($filters['from'] ?? null)) {
            $query->where('b.burial_date', '>=', $filters['from']);
        }
        if (Dates::valid($filters['to'] ?? null)) {
            $query->where('b.burial_date', '<=', $filters['to']);
        }

        return $query->get();
    }

    /**
     * The public memorial search: what a headstone says and where it stands.
     * Next-of-kin details and scheduled burials stay in the register. Every
     * word of the name must match, so "santos lourdes" finds "Lourdes P. Santos".
     *
     * @param list<string> $words
     */
    public static function memorials(array $words = [], ?int $lotId = null, int $limit = 50): Collection
    {
        $query = self::query()
            ->from('burial_records as b')
            ->join('cemetery_lots as l', 'l.lot_id', '=', 'b.lot_id')
            ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
            ->select('b.deceased_fullname', 'b.date_of_death', 'b.lot_id', 'l.lot_code', 's.section_name')
            ->where('b.interment_status', 'interred')
            ->orderBy('b.deceased_fullname')
            ->orderBy('b.burial_id')
            ->limit($limit);

        foreach ($words as $word) {
            $query->where('b.deceased_fullname', 'like', '%'.addcslashes($word, '%_\\').'%');
        }
        if ($lotId !== null) {
            $query->where('b.lot_id', $lotId);
        }

        return $query->get();
    }
}
