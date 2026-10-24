<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CemeterySection;
use App\Models\Reservation;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Input the database cannot hold is a 422 with a reason, never a 500. */
class InputValidationTest extends TestCase
{
    public static function badWrites(): array
    {
        $long = str_repeat('x', 300);

        return [
            'burial name too long' => ['/api/burial-records', ['deceased_fullname' => $long, 'lot_id' => 1, 'burial_date' => '2026-01-01'], 'deceased_fullname must be text of at most 255 characters'],
            'burial name as a list' => ['/api/burial-records', ['deceased_fullname' => ['a'], 'lot_id' => 1, 'burial_date' => '2026-01-01'], 'deceased_fullname must be text of at most 255 characters'],
            'next of kin too long' => ['/api/burial-records', ['deceased_fullname' => 'A', 'lot_id' => 1, 'burial_date' => '2026-01-01', 'next_of_kin_name' => $long], 'next_of_kin_name must be text of at most 100 characters'],
            'phone as a list' => ['/api/burial-records', ['deceased_fullname' => 'A', 'lot_id' => 1, 'burial_date' => '2026-01-01', 'next_of_kin_phone' => ['1']], 'next_of_kin_phone must be a phone number, e.g. 0917 123 4567'],
            'impossible burial date' => ['/api/burial-records', ['deceased_fullname' => 'A', 'lot_id' => 1, 'burial_date' => '2026-02-30'], 'burial_date must be a date in YYYY-MM-DD format'],
            'price not a number' => ['/api/lots/{lot}', ['price' => 'abc'], 'price must be a number from 0 to 99,999,999.99'],
            'negative price' => ['/api/lots/{lot}', ['price' => -1], 'price must not be negative'],
            'block too long' => ['/api/lots/{lot}', ['block' => $long], 'block must be at most 10 characters'],
            'lot code too long' => ['/api/lots', ['section_id' => '{section}', 'price' => 1, 'lot_code' => $long], 'lot_code must be at most 20 characters'],
            'plot off the canvas' => ['/api/lots/{lot}', ['svg_x' => 123456], 'svg_x, svg_y, svg_w and svg_h must be numbers from 0 to 9999.99'],
            'latitude out of range' => ['/api/lots/{lot}', ['latitude' => 91], 'latitude must be within -90..90 and longitude within -180..180'],
            'import row not an object' => ['/api/lots/import-grid', ['section_id' => '{section}', 'lots' => ['x']], 'each of lots[] must be an object'],
            'import price not a number' => ['/api/lots/import-grid', ['section_id' => '{section}', 'lots' => [['lot_code' => 'Z-1', 'price' => 'abc']]], 'price must be a number from 0 to 99,999,999.99'],
            'name too long' => ['/api/users/{admin}', ['fullname' => $long], 'fullname must be at most 100 characters'],
            'blank email' => ['/api/users/{admin}', ['email' => ''], 'Invalid email address'],
            'payment too large' => ['/api/payments', ['reservation_id' => '{reservation}', 'amount' => 1e12, 'payment_date' => '2026-01-01'], 'amount must be at most 99,999,999.99'],
            'amount too large' => ['/api/reservations/{reservation}', ['total_amount' => 1e12], 'total_amount must be at most 99,999,999.99'],
            'reservation as a list' => ['/api/payments', ['reservation_id' => ['{reservation}'], 'amount' => 5, 'payment_date' => '2026-01-01'], 'reservation_id is required and must exist'],
            'regrid section as a list' => ['/api/lots/regrid', ['section_id' => ['{section}']], 'Unknown section'],
            'sign-in email as a list' => ['/api/auth/login', ['email' => ['x'], 'password' => 'y'], 'Enter your email and password.'],
            'registration email as a list' => ['/api/auth/register', ['fullname' => 'A', 'email' => ['x'], 'password' => 'password123', 'password_confirmation' => 'password123'], 'Invalid email address'],
        ];
    }

    #[DataProvider('badWrites')]
    public function test_bad_input_is_refused_with_a_reason(string $path, array $body, string $error): void
    {
        $admin = $this->makeUser('admin');
        $lot = $this->makeLot(['status' => 'reserved']);
        $reservation = Reservation::create([
            'user_id' => $this->makeUser()->user_id, 'lot_id' => $lot->lot_id, 'reservation_date' => '2026-01-01',
        ]);
        $ids = ['{lot}' => $lot->lot_id, '{section}' => $lot->section_id, '{admin}' => $admin->user_id, '{reservation}' => $reservation->reservation_id];
        $this->actingAs($admin);

        array_walk_recursive($body, function (&$value) use ($ids) {
            if (is_string($value) && isset($ids[$value])) {
                $value = $ids[$value];
            }
        });
        $this->postJson(strtr($path, $ids), $body)->assertStatus(422)->assertExactJson(['error' => $error]);
    }

    public static function lists(): array
    {
        return [['/api/lots'], ['/api/users'], ['/api/reservations'], ['/api/payments'], ['/api/burial-records']];
    }

    #[DataProvider('lists')]
    public function test_a_search_that_is_not_text_finds_everything(string $path): void
    {
        $this->actingAs($this->makeUser('admin'));
        $this->getJson("{$path}?q[]=x")->assertOk();
    }

    public function test_search_wildcards_are_taken_literally(): void
    {
        $this->actingAs($this->makeUser('admin'));
        $this->makeLot(['lot_code' => 'A-100']);
        $this->makeLot(['lot_code' => 'A_1%']);

        $this->getJson('/api/lots?q=%25')->assertOk()->assertJsonCount(1)->assertJsonPath('0.lot_code', 'A_1%');
        $this->getJson('/api/lots?q=A_')->assertOk()->assertJsonCount(1);
        $this->getJson('/api/memorials?q[]=abc')->assertStatus(422);
    }

    public function test_a_blank_field_leaves_the_plot_as_it_was(): void
    {
        $this->actingAs($this->makeUser('admin'));
        $lot = $this->makeLot(['price' => 45000, 'lot_type' => 'double']);

        $this->postJson("/api/lots/{$lot->lot_id}", ['price' => '', 'lot_type' => '', 'status' => ''])->assertOk();
        $lot->refresh();
        $this->assertSame('45000.00', $lot->price);
        $this->assertSame('double', $lot->lot_type);
        $this->assertSame('available', $lot->status);
    }

    public function test_a_plot_cannot_be_moved_into_a_locked_section(): void
    {
        $this->actingAs($this->makeUser('admin'));
        $lot = $this->makeLot();
        $locked = CemeterySection::create(['section_name' => 'Locked', 'is_locked' => 1]);

        $this->postJson("/api/lots/{$lot->lot_id}", ['section_id' => $locked->section_id])->assertStatus(422);
        $this->assertNotSame($locked->section_id, $lot->fresh()->section_id);
    }

    public function test_an_import_with_a_bad_row_creates_nothing(): void
    {
        $this->actingAs($this->makeUser('admin'));
        $section = $this->makeLot()->section_id;

        $this->postJson('/api/lots/import-grid', ['section_id' => $section, 'lots' => [
            ['lot_code' => 'NEW-1', 'price' => 100],
            ['lot_code' => 'NEW-2', 'price' => 'abc'],
        ]])->assertStatus(422);
        $this->assertDatabaseMissing('cemetery_lots', ['lot_code' => 'NEW-1']);

        $this->postJson('/api/lots/import-grid', ['section_id' => $section, 'lots' => [
            ['lot_code' => 'NEW-1', 'price' => 100],
            ['lot_code' => '', 'price' => 100],
        ]])->assertOk()->assertExactJson(['created' => 1, 'skipped' => 1]);
    }

    public function test_the_spa_forms_still_save(): void
    {
        $this->actingAs($this->makeUser('admin'));
        $section = $this->makeLot()->section_id;

        // The Lot Editor's new plot, then its form saved back with the map fields it carries.
        $lot = $this->postJson('/api/lots', [
            'section_id' => $section, 'block' => null, 'lot_type' => 'single', 'price' => 0, 'status' => 'available',
            'description' => '', 'svg_x' => 10.5, 'svg_y' => 20, 'svg_w' => 7, 'svg_h' => 12,
        ])->assertCreated()->json();
        $this->postJson("/api/lots/{$lot['lot_id']}", [...$lot, 'section_name' => 'Test Section', 'price' => 1500, 'block' => 'B'])
            ->assertOk()->assertJsonPath('price', '1500.00')->assertJsonPath('block', 'B')->assertJsonPath('svg_x', 10.5);

        // The burial form, created and then edited with its blanks.
        $this->postJson("/api/lots/{$lot['lot_id']}", ['status' => 'occupied'])->assertOk();
        $form = [
            'deceased_fullname' => 'Lourdes P. Santos', 'date_of_birth' => '', 'date_of_death' => '2026-02-01',
            'burial_date' => '2026-02-03', 'lot_id' => $lot['lot_id'], 'burial_type' => 'single',
            'next_of_kin_name' => '', 'next_of_kin_phone' => '', 'interment_status' => 'scheduled',
        ];
        $id = $this->postJson('/api/burial-records', $form)->assertCreated()->json('burial_id');
        $this->postJson("/api/burial-records/{$id}", [...$form, 'date_of_death' => '', 'next_of_kin_phone' => '0917 123 4567'])
            ->assertOk()->assertJsonPath('date_of_death', null)->assertJsonPath('next_of_kin_phone', '0917 123 4567');
    }

    public function test_a_visitor_learns_nothing_about_an_account_they_cannot_edit(): void
    {
        $other = $this->makeUser();
        $this->actingAs($this->makeUser());

        $this->postJson("/api/users/{$other->user_id}", ['email' => $other->email])
            ->assertStatus(403)->assertExactJson(['error' => 'Forbidden']);
    }
}
