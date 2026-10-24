<?php

declare(strict_types=1);

namespace Tests;

use App\Models\CemeterySection;
use App\Models\Lot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    /** The suite drops every table, so it must never reach the real database. */
    protected function beforeRefreshingDatabase(): void
    {
        $this->assertTestDatabase();
    }

    protected function assertTestDatabase(): void
    {
        $database = config('database.connections.mysql.database');
        if ($database !== 'cemetery_test') {
            throw new RuntimeException("Refusing to run the test suite against '{$database}'.");
        }
    }

    protected function makeUser(string $role = 'user', array $attributes = []): User
    {
        static $n = 0;
        $n++;

        return User::create($attributes + [
            'fullname' => ucfirst($role)." {$n}",
            'email' => "{$role}{$n}@test.test",
            'password' => 'password123',
            'role' => $role,
            'status' => 'active',
        ]);
    }

    protected function makeLot(array $attributes = []): Lot
    {
        static $n = 0;
        $n++;
        $section = CemeterySection::query()->first() ?? CemeterySection::create(['section_name' => 'Test Section', 'section_number' => 1]);

        return Lot::create($attributes + [
            'lot_code' => sprintf('T-%03d', $n),
            'section_id' => $section->section_id,
            'lot_type' => 'single',
            'price' => 10000,
            'status' => 'available',
        ])->fresh();
    }
}
