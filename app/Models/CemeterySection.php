<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CemeterySection extends Model
{
    protected $table = 'cemetery_sections';
    protected $primaryKey = 'section_id';
    public $timestamps = false;

    protected $fillable = [
        'section_name', 'location', 'description', 'svg_viewbox', 'svg_image', 'svg_points', 'section_number', 'is_locked',
    ];

    public function lots(): HasMany
    {
        return $this->hasMany(Lot::class, 'section_id');
    }

    public function isLocked(): bool
    {
        return (int) $this->is_locked === 1;
    }

    /** @return Collection<int, self> each section with its plot counts by status */
    public static function withCounts(): Collection
    {
        return self::query()
            ->from('cemetery_sections as s')
            ->leftJoin('cemetery_lots as l', 'l.section_id', '=', 's.section_id')
            ->select('s.*')
            ->selectRaw('COUNT(l.lot_id) AS lot_count')
            ->selectRaw("COALESCE(SUM(l.status = 'available'), 0) AS available")
            ->selectRaw("COALESCE(SUM(l.status = 'reserved'), 0) AS reserved")
            ->selectRaw("COALESCE(SUM(l.status = 'occupied'), 0) AS occupied")
            ->groupBy('s.section_id')
            ->orderBy('s.section_id')
            ->get();
    }
}
