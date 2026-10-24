<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Contracts\Database\Query\Builder;

class Tally
{
    /**
     * Rows counted by each value of $column, every listed value present (0 when
     * no row has it), plus their total.
     *
     * @param list<string> $values
     * @return array<string, int>
     */
    public static function by(Builder $query, string $column, array $values): array
    {
        $found = $query->selectRaw("{$column} AS value, COUNT(*) AS n")->groupBy($column)->pluck('n', 'value');
        $counts = ['total' => (int) $found->sum()];
        foreach ($values as $value) {
            $counts[$value] = (int) ($found[$value] ?? 0);
        }
        return $counts;
    }
}
