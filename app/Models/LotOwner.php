<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

class LotOwner extends Model
{
    /**
     * As the office's sales book marks them: CASH, installment, and "F",
     * which the book uses without saying what it stands for; kept as written.
     */
    public const TERMS = ['cash', 'installment', 'F'];

    protected $table = 'lot_owners';
    protected $primaryKey = 'owner_id';
    public $timestamps = false;

    protected $fillable = ['lot_id', 'plot', 'owner_name', 'payment_terms', 'notes'];

    public static function forLot(int $lotId): Collection
    {
        return self::query()->where('lot_id', $lotId)->orderBy('plot')->orderBy('owner_id')->get();
    }

    /** An owner already recorded on this lot (and sub-plot) under the same name. */
    public static function duplicate(int $lotId, ?string $plot, string $name, ?int $exceptId = null): bool
    {
        return self::query()
            ->where('lot_id', $lotId)
            ->whereRaw("COALESCE(`plot`, '') = ?", [$plot ?? ''])
            ->whereRaw('LOWER(`owner_name`) = LOWER(?)', [$name])
            ->where('owner_id', '<>', $exceptId ?? 0)
            ->exists();
    }
}
