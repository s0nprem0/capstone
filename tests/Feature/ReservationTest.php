<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Lot;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Reservation;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReservationTest extends TestCase
{
    private function reserve(int $lotId, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/reservations', $extra + [
            'lot_id' => $lotId,
            'reservation_date' => now()->addDay()->format('Y-m-d'),
        ]);
    }

    public function test_a_request_holds_the_plot_and_tells_the_office(): void
    {
        $staff = $this->makeUser('staff');
        $lot = $this->makeLot(['lot_type' => 'double', 'price' => 25000]);
        $visitor = $this->makeUser('user');

        $this->actingAs($visitor);
        $this->reserve($lot->lot_id, ['number_of_slots' => 2])
            ->assertCreated()
            ->assertJsonPath('approved_status', 'pending')
            ->assertJsonPath('total_amount', '50000.00')
            ->assertJsonPath('lot_code', $lot->lot_code);

        $this->assertSame('reserved', $lot->fresh()->status);
        $this->assertSame(1, Notification::query()->where('user_id', $staff->user_id)->count());
    }

    public function test_a_held_plot_cannot_be_booked_again(): void
    {
        $lot = $this->makeLot();
        $this->actingAs($this->makeUser('user'));
        $this->reserve($lot->lot_id)->assertCreated();

        $this->actingAs($this->makeUser('user'));
        $this->reserve($lot->lot_id)->assertStatus(422)->assertExactJson(['error' => 'Lot is not available']);
    }

    public function test_slots_are_capped_by_the_plot_type(): void
    {
        $this->actingAs($this->makeUser('user'));
        $this->reserve($this->makeLot()->lot_id, ['number_of_slots' => 2])
            ->assertStatus(422)->assertExactJson(['error' => 'Lot capacity exceeded (max 1 slots)']);
    }

    public function test_a_visitor_may_hold_only_the_pending_limit(): void
    {
        $this->actingAs($this->makeUser('user'));
        foreach (range(1, 3) as $i) {
            $this->reserve($this->makeLot()->lot_id)->assertCreated();
        }
        $this->reserve($this->makeLot()->lot_id)->assertStatus(422);
    }

    public function test_a_visitor_cannot_book_in_the_past_or_for_someone_else(): void
    {
        $other = $this->makeUser('user');
        $this->actingAs($this->makeUser('user'));
        $lot = $this->makeLot();

        $this->reserve($lot->lot_id, ['reservation_date' => '2020-01-01'])
            ->assertStatus(422)->assertExactJson(['error' => 'reservation_date cannot be in the past']);
        $this->reserve($lot->lot_id, ['user_id' => $other->user_id])->assertStatus(403);
    }

    public function test_approval_occupies_and_rejection_releases_the_plot(): void
    {
        $approved = $this->makeLot();
        $rejected = $this->makeLot();
        $visitor = $this->makeUser('user');
        $this->actingAs($visitor);
        $a = $this->reserve($approved->lot_id)->json('reservation_id');
        $r = $this->reserve($rejected->lot_id)->json('reservation_id');

        $this->actingAs($this->makeUser('staff'));
        $this->postJson("/api/reservations/{$a}/approve")->assertOk();
        $this->postJson("/api/reservations/{$a}/approve")->assertStatus(422);
        $this->postJson("/api/reservations/{$r}/reject", ['reason' => 'Incomplete papers'])->assertOk();

        $this->assertSame('occupied', $approved->fresh()->status);
        $this->assertSame('available', $rejected->fresh()->status);
        $this->assertStringContainsString(
            'Reason: Incomplete papers',
            Notification::query()->where('user_id', $visitor->user_id)->where('reservation_id', $r)->value('message')
        );
    }

    public function test_a_visitor_cancels_only_their_own_unpaid_pending_request(): void
    {
        $lot = $this->makeLot();
        $owner = $this->makeUser('user');
        $this->actingAs($owner);
        $id = $this->reserve($lot->lot_id)->json('reservation_id');

        $this->actingAs($this->makeUser('user'))->postJson("/api/reservations/{$id}/cancel")->assertNotFound();

        Payment::create(['reservation_id' => $id, 'amount' => 100, 'method' => 'cash', 'payment_date' => '2026-01-01']);
        $this->actingAs($owner)->postJson("/api/reservations/{$id}/cancel")->assertStatus(422);

        Payment::query()->delete();
        $this->actingAs($owner)->postJson("/api/reservations/{$id}/cancel")->assertOk();
        $this->assertSame('cancelled', Reservation::find($id)->approved_status);
        $this->assertSame('available', $lot->fresh()->status);
    }

    public function test_a_reservation_with_payments_cannot_be_deleted(): void
    {
        $lot = $this->makeLot();
        $this->actingAs($this->makeUser('user'));
        $id = $this->reserve($lot->lot_id)->json('reservation_id');
        Payment::create(['reservation_id' => $id, 'amount' => 100, 'method' => 'cash', 'payment_date' => '2026-01-01']);

        $this->actingAs($this->makeUser('staff'))->postJson("/api/reservations/{$id}/delete")->assertStatus(422);
        $this->assertNotNull(Reservation::find($id));
    }

    public function test_unpaid_holds_expire_after_the_hold_period(): void
    {
        $lot = $this->makeLot();
        $visitor = $this->makeUser('user');
        $this->actingAs($visitor);
        $id = $this->reserve($lot->lot_id)->json('reservation_id');
        DB::table('reservations')->where('reservation_id', $id)->update(['created_at' => now()->subDays(8)]);

        // Any API request runs the sweep.
        $this->getJson('/api/map')->assertOk();

        $this->assertSame('rejected', Reservation::find($id)->approved_status);
        $this->assertSame('available', $lot->fresh()->status);
        $this->assertTrue(Notification::query()->where('user_id', $visitor->user_id)->where('message', 'like', '%expired%')->exists());
    }

    public function test_a_paid_hold_never_expires(): void
    {
        $lot = $this->makeLot();
        $this->actingAs($this->makeUser('user'));
        $id = $this->reserve($lot->lot_id)->json('reservation_id');
        Payment::create(['reservation_id' => $id, 'amount' => 100, 'method' => 'cash', 'payment_date' => '2026-01-01']);
        DB::table('reservations')->where('reservation_id', $id)->update(['created_at' => now()->subDays(30)]);

        $this->artisan('reservations:expire')->assertSuccessful();

        $this->assertSame('pending', Reservation::find($id)->approved_status);
        $this->assertSame('reserved', Lot::find($lot->lot_id)->status);
    }
}
