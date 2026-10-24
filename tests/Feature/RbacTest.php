<?php

declare(strict_types=1);

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RbacTest extends TestCase
{
    /** @return array<string, array{0: string, 1: string, 2: ?string, 3: int}> */
    public static function routes(): array
    {
        return [
            'map is public' => ['GET', '/api/map', null, 200],
            'memorial search is public' => ['GET', '/api/memorials?q=santos', null, 200],
            'users need sign-in' => ['GET', '/api/users', null, 401],
            'visitors cannot list users' => ['GET', '/api/users', 'user', 403],
            'staff list users' => ['GET', '/api/users', 'staff', 200],
            'visitors cannot see all reservations' => ['GET', '/api/reservations', 'user', 403],
            'my reservations are for visitors' => ['GET', '/api/reservations/mine', 'staff', 403],
            'visitors cannot record payments' => ['POST', '/api/payments', 'user', 403],
            'staff cannot delete payments' => ['POST', '/api/payments/1/delete', 'staff', 403],
            'visitors cannot read burial records' => ['GET', '/api/burial-records', 'user', 403],
            'staff cannot delete burial records' => ['POST', '/api/burial-records/1/delete', 'staff', 403],
            'staff cannot create lots' => ['POST', '/api/lots', 'staff', 403],
            'staff cannot edit sections' => ['POST', '/api/sections/1', 'staff', 403],
            'visitors cannot read owners' => ['GET', '/api/lots/1/owners', 'user', 403],
            'staff read reports' => ['GET', '/api/reports/summary', 'staff', 200],
            'visitors cannot read reports' => ['GET', '/api/reports/audit-logs', 'user', 403],
            'backups are admin only' => ['GET', '/api/backup/summary', 'staff', 403],
            'admin reads backups' => ['GET', '/api/backup/summary', 'admin', 200],
            'unknown api route' => ['GET', '/api/nope', null, 404],
        ];
    }

    #[DataProvider('routes')]
    public function test_route_access(string $method, string $uri, ?string $role, int $status): void
    {
        if ($role !== null) {
            $this->actingAs($this->makeUser($role));
        }

        $this->json($method, $uri)->assertStatus($status);
    }

    public function test_staff_cannot_manage_staff_accounts(): void
    {
        $other = $this->makeUser('staff');

        $this->actingAs($this->makeUser('staff'))
            ->postJson("/api/users/{$other->user_id}", ['fullname' => 'Renamed'])
            ->assertStatus(403)
            ->assertExactJson(['error' => 'Staff and admin accounts can only be managed by an administrator']);
    }

    public function test_a_visitor_edits_only_their_own_registration(): void
    {
        $visitor = $this->makeUser('user');
        $other = $this->makeUser('user');

        $this->actingAs($visitor)->postJson("/api/users/{$other->user_id}", ['fullname' => 'X'])->assertStatus(403);
        $this->actingAs($visitor)->postJson("/api/users/{$visitor->user_id}", ['role' => 'admin'])->assertStatus(403);
        $this->actingAs($visitor)->postJson("/api/users/{$visitor->user_id}", ['phone' => '0917 000 0000'])
            ->assertOk()->assertJsonPath('user.phone', '0917 000 0000');
    }

    public function test_the_spa_is_served_for_non_api_paths_with_security_headers(): void
    {
        $this->get('/admin/reservations')
            ->assertOk()
            ->assertSee('<div id="root"></div>', false)
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
    }
}
