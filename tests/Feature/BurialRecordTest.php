<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class BurialRecordTest extends TestCase
{
    private function record(int $lotId, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/burial-records', $extra + [
            'deceased_fullname' => 'Lourdes P. Santos',
            'lot_id' => $lotId,
            'burial_date' => '2026-03-01',
        ]);
    }

    public function test_a_burial_needs_a_held_plot_and_occupies_it(): void
    {
        $this->actingAs($this->makeUser('staff'));
        $free = $this->makeLot();
        $held = $this->makeLot(['status' => 'reserved']);

        $this->record($free->lot_id)->assertStatus(422);
        $this->record($held->lot_id)->assertCreated()->assertJsonPath('lot_code', $held->lot_code);
        $this->assertSame('occupied', $held->fresh()->status);
    }

    public function test_burials_are_capped_by_capacity_except_cremations(): void
    {
        $this->actingAs($this->makeUser('staff'));
        $lot = $this->makeLot(['status' => 'occupied']);

        $this->record($lot->lot_id)->assertCreated();
        $this->record($lot->lot_id, ['deceased_fullname' => 'Second'])
            ->assertStatus(422)
            ->assertExactJson(['error' => "Lot {$lot->lot_code} is a single lot and already holds 1 burial"]);
        $this->record($lot->lot_id, ['deceased_fullname' => 'Ashes', 'burial_type' => 'cremation'])->assertCreated();
    }

    public function test_dates_must_be_in_order(): void
    {
        $this->actingAs($this->makeUser('staff'));
        $lot = $this->makeLot(['status' => 'occupied']);

        $this->record($lot->lot_id, ['date_of_death' => '2026-04-01'])
            ->assertExactJson(['error' => 'burial_date must not be before date_of_death']);
        $this->record($lot->lot_id, ['date_of_birth' => '2026-02-02', 'date_of_death' => '2026-02-01'])
            ->assertExactJson(['error' => 'date_of_birth must not be after date_of_death']);
    }

    public function test_the_public_memorial_search_shows_no_next_of_kin_or_scheduled_burials(): void
    {
        $this->actingAs($this->makeUser('staff'));
        $lot = $this->makeLot(['lot_type' => 'family', 'status' => 'occupied']);
        $this->record($lot->lot_id, ['interment_status' => 'interred', 'next_of_kin_name' => 'Private Person']);
        $this->record($lot->lot_id, ['deceased_fullname' => 'Lourdes Scheduled', 'interment_status' => 'scheduled']);
        $this->app['auth']->forgetGuards();
        $this->flushSession();

        $results = $this->getJson('/api/memorials?q=santos%20lourdes')->assertOk()->assertJsonCount(1);
        $this->assertSame(['deceased_fullname', 'date_of_death', 'lot_id', 'lot_code', 'section_name'], array_keys($results->json(0)));
        $this->getJson('/api/memorials?q=lo')->assertStatus(422);
    }
}
