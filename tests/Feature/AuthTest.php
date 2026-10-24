<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AuditLog;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_registering_creates_a_client_account_and_signs_it_in(): void
    {
        $this->postJson('/api/auth/register', [
            'fullname' => 'Ana Reyes',
            'email' => 'Ana.Reyes@Test.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertCreated()
            ->assertJsonPath('user.email', 'ana.reyes@test.test')
            ->assertJsonPath('user.role', 'user')
            ->assertJsonMissingPath('user.password');

        $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.fullname', 'Ana Reyes');
    }

    public function test_registration_rejects_a_taken_email(): void
    {
        $this->makeUser('user', ['email' => 'taken@test.test']);

        $this->postJson('/api/auth/register', [
            'fullname' => 'Someone',
            'email' => 'TAKEN@test.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertStatus(422)->assertExactJson(['error' => 'Email already registered']);
    }

    public function test_login_logout_and_audit(): void
    {
        $user = $this->makeUser('staff', ['email' => 'clerk@test.test']);

        $this->postJson('/api/auth/login', ['email' => 'clerk@test.test', 'password' => 'password123'])
            ->assertOk()->assertJsonPath('user.user_id', $user->user_id);
        $this->postJson('/api/auth/logout')->assertOk();
        $this->getJson('/api/auth/me')->assertStatus(401)->assertExactJson(['error' => 'Unauthenticated']);

        $this->assertSame(['login', 'logout'], AuditLog::query()->orderBy('log_id')->pluck('action')->all());
    }

    public function test_repeated_failures_pause_sign_in_for_that_account(): void
    {
        $this->makeUser('user', ['email' => 'juan@test.test']);

        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'juan@test.test', 'password' => 'wrong'])->assertStatus(401);
        }

        $this->postJson('/api/auth/login', ['email' => 'juan@test.test', 'password' => 'password123'])->assertStatus(429);
        $this->assertSame(5, AuditLog::query()->where('action', 'login_failed')->count());
    }

    public function test_a_deactivated_account_cannot_sign_in_and_its_session_ends(): void
    {
        $user = $this->makeUser('user', ['email' => 'gone@test.test']);
        $this->actingAs($user)->getJson('/api/auth/me')->assertOk();

        $user->update(['status' => 'inactive']);
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/auth/me')->assertStatus(401);
        $this->postJson('/api/auth/login', ['email' => 'gone@test.test', 'password' => 'password123'])
            ->assertStatus(403)
            ->assertJsonPath('error', 'This account has been deactivated. Contact the cemetery office to restore it.');
    }
}
