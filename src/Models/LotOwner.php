<?php

declare(strict_types=1);

namespace App\Models;

class LotOwner extends Model
{
    protected static string $table = 'lot_owners';
    protected static string $primaryKey = 'owner_id';

    /**
     * As the office's sales book marks them: CASH, installment, and "F",
     * which the book uses without saying what it stands for; kept as written.
     */
    public const TERMS = ['cash', 'installment', 'F'];

    public static function forLot(int $lotId): array
    {
        $stmt = self::db()->prepare(
            "SELECT * FROM `lot_owners` WHERE `lot_id` = :lot_id ORDER BY `plot`, `owner_id`"
        );
        $stmt->execute(['lot_id' => $lotId]);
        return $stmt->fetchAll();
    }

    /** An owner already recorded on this lot (and sub-plot) under the same name. */
    public static function duplicate(int $lotId, ?string $plot, string $name, ?int $exceptId = null): ?array
    {
        $stmt = self::db()->prepare(
            "SELECT * FROM `lot_owners`
             WHERE `lot_id` = :lot_id AND COALESCE(`plot`, '') = :plot
               AND LOWER(`owner_name`) = LOWER(:name) AND `owner_id` <> :except
             LIMIT 1"
        );
        $stmt->execute(['lot_id' => $lotId, 'plot' => $plot ?? '', 'name' => $name, 'except' => $exceptId ?? 0]);
        return $stmt->fetch() ?: null;
    }
}
