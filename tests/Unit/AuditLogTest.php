<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\AuditLog;
use PHPUnit\Framework\TestCase;

class AuditLogTest extends TestCase
{
    public function test_changes_lists_only_fields_that_differ(): void
    {
        $changes = AuditLog::changes(
            ['fullname' => 'Ana', 'phone' => '0917', 'price' => '5000.00'],
            ['fullname' => 'Ana Reyes', 'phone' => '0917', 'price' => 5000]
        );

        $this->assertSame(['changes' => ['fullname' => ['Ana', 'Ana Reyes']]], $changes);
    }

    public function test_changes_is_null_when_nothing_changed(): void
    {
        $this->assertNull(AuditLog::changes(['status' => 'active'], ['status' => 'active']));
    }

    public function test_secrets_and_outlines_are_masked(): void
    {
        $changes = AuditLog::changes(
            ['password' => '$2y$10$old', 'svg_points' => '0 0 1 1 2 2'],
            ['password' => 'new-secret', 'svg_points' => '0 0 3 3 4 4']
        );

        $this->assertSame(['(hidden)', '(changed)'], $changes['changes']['password']);
        $this->assertSame(['(hidden)', '(changed)'], $changes['changes']['svg_points']);
    }

    public function test_snapshot_keeps_the_named_fields(): void
    {
        $this->assertSame(
            ['record' => ['lot_code' => 'S1-001']],
            AuditLog::snapshot(['lot_code' => 'S1-001', 'price' => '1.00'], ['lot_code', 'missing'])
        );
    }
}
