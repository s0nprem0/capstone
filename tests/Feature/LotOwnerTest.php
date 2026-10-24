<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class LotOwnerTest extends TestCase
{
    public function test_an_owner_holds_the_plot_until_removed(): void
    {
        $lot = $this->makeLot();
        $this->actingAs($this->makeUser('staff'));

        $id = $this->postJson("/api/lots/{$lot->lot_id}/owners", ['owner_name' => 'O. Mojica', 'plot' => 'A', 'payment_terms' => 'F'])
            ->assertCreated()->json('owner_id');
        $this->assertSame('occupied', $lot->fresh()->status);

        $this->postJson("/api/lots/{$lot->lot_id}/owners", ['owner_name' => 'o. mojica', 'plot' => 'A'])->assertStatus(422);
        $this->postJson("/api/lot-owners/{$id}/delete")->assertStatus(403);

        $this->actingAs($this->makeUser('admin'))->postJson("/api/lot-owners/{$id}/delete")->assertOk();
        $this->assertSame('available', $lot->fresh()->status);
    }

    public function test_a_plot_with_a_live_online_reservation_takes_no_paper_owner(): void
    {
        $lot = $this->makeLot();
        $this->actingAs($this->makeUser('user'))->postJson('/api/reservations', [
            'lot_id' => $lot->lot_id,
            'reservation_date' => now()->addDay()->format('Y-m-d'),
        ])->assertCreated();

        $this->actingAs($this->makeUser('staff'))
            ->postJson("/api/lots/{$lot->lot_id}/owners", ['owner_name' => 'Paper Buyer'])
            ->assertStatus(409);
    }

    public function test_a_held_plot_cannot_be_marked_available_by_hand(): void
    {
        $lot = $this->makeLot();
        $this->actingAs($this->makeUser('staff'));
        $this->postJson("/api/lots/{$lot->lot_id}/owners", ['owner_name' => 'Owner']);

        $this->postJson("/api/lots/{$lot->lot_id}", ['status' => 'available'])->assertStatus(422);
        $this->actingAs($this->makeUser('admin'))->postJson("/api/lots/{$lot->lot_id}/delete")->assertStatus(409);
    }
}
