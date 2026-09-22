<?php

declare(strict_types=1);

namespace App\Models;

class CemeterySection extends Model
{
    protected static string $table = 'cemetery_sections';
    protected static string $primaryKey = 'section_id';

    public static function withLotCounts(): array
    {
        $stmt = self::db()->query(
            "SELECT s.*, COUNT(l.`lot_id`) AS `lot_count`
             FROM `cemetery_sections` s
             LEFT JOIN `cemetery_lots` l ON l.`section_id` = s.`section_id`
             GROUP BY s.`section_id`
             ORDER BY s.`section_id` ASC"
        );
        return $stmt->fetchAll();
    }

    /** Count of lots/reservations/payments/burials attached to a section (deletion guard). */
    public static function usage(int $sectionId): array
    {
        $stmt = self::db()->prepare(
            "SELECT
                (SELECT COUNT(*) FROM `cemetery_lots` l WHERE l.`section_id` = ? AND l.`status` <> 'available') AS `non_available`,
                (SELECT COUNT(*) FROM `reservations` r JOIN `cemetery_lots` l ON l.`lot_id` = r.`lot_id` WHERE l.`section_id` = ?) AS `reservations`,
                (SELECT COUNT(*) FROM `payments` p JOIN `reservations` r ON r.`reservation_id` = p.`reservation_id` JOIN `cemetery_lots` l ON l.`lot_id` = r.`lot_id` WHERE l.`section_id` = ?) AS `payments`,
                (SELECT COUNT(*) FROM `burial_records` b JOIN `cemetery_lots` l ON l.`lot_id` = b.`lot_id` WHERE l.`section_id` = ?) AS `burials`"
        );
        $stmt->execute([$sectionId, $sectionId, $sectionId, $sectionId]);
        $row = $stmt->fetch();
        return $row ?: ['non_available' => 0, 'reservations' => 0, 'payments' => 0, 'burials' => 0];
    }
}