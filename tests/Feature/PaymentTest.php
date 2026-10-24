<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Reservation;
use Tests\TestCase;

class PaymentTest extends TestCase
{
    public function test_payment_status_follows_the_payments_recorded(): void
    {
        $visitor = $this->makeUser('user');
        $lot = $this->makeLot(['price' => 1000]);
        $id = $this->actingAs($visitor)->postJson('/api/reservations', [
            'lot_id' => $lot->lot_id,
            'reservation_date' => now()->addDay()->format('Y-m-d'),
        ])->json('reservation_id');

        $this->actingAs($this->makeUser('staff'));
        $first = $this->postJson('/api/payments', ['reservation_id' => $id, 'amount' => 400, 'payment_date' => '2026-10-01'])
            ->assertCreated()
            ->assertJsonPath('method', 'cash')
            ->assertJsonPath('payment_status', 'partial')
            ->json('payment_id');
        $this->postJson('/api/payments', ['reservation_id' => $id, 'amount' => 600, 'method' => 'gcash', 'payment_date' => '2026-10-02'])
            ->assertJsonPath('payment_status', 'paid');

        // Raising the price makes the same payments partial again.
        $this->postJson("/api/reservations/{$id}", ['total_amount' => 2000])->assertOk();
        $this->assertSame('partial', Reservation::find($id)->payment_status);

        $this->actingAs($this->makeUser('admin'))->postJson("/api/payments/{$first}/delete")->assertOk();
        $this->postJson("/api/reservations/{$id}", ['total_amount' => 600]);
        $this->assertSame('paid', Reservation::find($id)->payment_status);
    }

    public function test_payment_input_is_validated(): void
    {
        $lot = $this->makeLot();
        $id = $this->actingAs($this->makeUser('user'))->postJson('/api/reservations', [
            'lot_id' => $lot->lot_id,
            'reservation_date' => now()->addDay()->format('Y-m-d'),
        ])->json('reservation_id');
        $this->actingAs($this->makeUser('staff'));

        $this->postJson('/api/payments', ['reservation_id' => 999, 'amount' => 5])
            ->assertStatus(422)->assertExactJson(['error' => 'reservation_id is required and must exist']);
        $this->postJson('/api/payments', ['reservation_id' => $id, 'amount' => 0, 'payment_date' => '2026-10-01'])
            ->assertExactJson(['error' => 'amount must be greater than zero']);
        $this->postJson('/api/payments', ['reservation_id' => $id, 'amount' => 5, 'method' => 'card', 'payment_date' => '2026-10-01'])
            ->assertExactJson(['error' => 'Invalid payment method']);
        $this->postJson('/api/payments', ['reservation_id' => $id, 'amount' => 5, 'payment_date' => '2026-02-30'])
            ->assertExactJson(['error' => 'payment_date must be in YYYY-MM-DD format']);
    }

    public function test_a_visitor_sees_only_their_own_payments(): void
    {
        $mine = $this->makeUser('user');
        $theirs = $this->makeUser('user');
        $staff = $this->makeUser('staff');
        foreach ([$mine, $theirs] as $visitor) {
            $id = $this->actingAs($visitor)->postJson('/api/reservations', [
                'lot_id' => $this->makeLot()->lot_id,
                'reservation_date' => now()->addDay()->format('Y-m-d'),
            ])->json('reservation_id');
            $this->actingAs($staff)->postJson('/api/payments', ['reservation_id' => $id, 'amount' => 10, 'payment_date' => '2026-10-01']);
        }

        $this->actingAs($mine)->getJson('/api/payments/mine')
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.user_id', $mine->user_id);
    }
}
