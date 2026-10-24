<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Lot;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * DDL commits on its own in MySQL, so these cannot run inside the test
 * transaction; the table is rebuilt from the migrations afterwards.
 */
class BackupTest extends TestCase
{
    protected function tearDown(): void
    {
        // tearDown runs even when setUp refused the database, so check again.
        if ($this->app !== null) {
            $this->assertTestDatabase();
            $this->artisan('migrate:fresh');
        }
        parent::tearDown();
    }

    protected function connectionsToTransact(): array
    {
        return [];
    }

    public function test_a_backup_restores_the_records_but_keeps_the_audit_log(): void
    {
        $admin = $this->makeUser('admin');
        $lot = $this->makeLot(['lot_code' => 'KEEP-1']);
        $this->actingAs($admin);

        $dump = $this->get('/api/backup/export')->assertOk()->assertHeader('Content-Disposition')->getContent();
        $this->assertStringStartsWith('-- Cemetery Reservation and Records Management System', $dump);

        $lot->update(['lot_code' => 'CHANGED']);
        AuditLog::record($admin->user_id, 'after-backup', 'database');

        $this->post('/api/backup/import', ['file' => UploadedFile::fake()->createWithContent('backup.sql', $dump)])
            ->assertOk()->assertJsonPath('message', 'Database restored');

        $this->assertSame('KEEP-1', Lot::find($lot->lot_id)->lot_code);
        $this->assertTrue(AuditLog::query()->where('action', 'after-backup')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'backup_import')->exists());
    }

    public function test_a_value_ending_in_a_backslash_survives_a_restore(): void
    {
        $this->actingAs($this->makeUser('admin'));
        $lot = $this->makeLot(['description' => 'C:\\', 'block' => "it's;"]);
        $after = $this->makeLot(['description' => 'next; row']);

        $dump = $this->get('/api/backup/export')->assertOk()->getContent();
        $this->post('/api/backup/import', ['file' => UploadedFile::fake()->createWithContent('backup.sql', $dump)])->assertOk();

        $this->assertSame('C:\\', Lot::find($lot->lot_id)->description);
        $this->assertSame("it's;", Lot::find($lot->lot_id)->block);
        $this->assertSame('next; row', Lot::find($after->lot_id)->description);
    }

    public function test_only_statements_a_backup_writes_are_accepted(): void
    {
        $this->actingAs($this->makeUser('admin'));
        $evil = "-- Cemetery Reservation and Records Management System\nGRANT ALL ON *.* TO 'x'@'%';";

        $this->call('POST', '/api/backup/import', [], [], [], ['CONTENT_TYPE' => 'application/sql', 'HTTP_ACCEPT' => 'application/json'], $evil)
            ->assertStatus(422)
            ->assertJsonPath('error', 'Statement 1 is not part of a backup made by this system, so nothing was restored.');
    }

    public function test_reset_needs_the_admins_password(): void
    {
        $admin = $this->makeUser('admin');
        $lot = $this->makeLot(['status' => 'occupied']);
        $this->actingAs($admin);

        $this->postJson('/api/backup/reset', ['confirm' => 'RESET', 'password' => 'wrong'])->assertStatus(422);
        $this->postJson('/api/backup/reset', ['confirm' => 'RESET', 'password' => 'password123'])
            ->assertOk()->assertJsonPath('cleared.lots_released', 1);
        $this->assertSame('available', $lot->fresh()->status);
    }
}
