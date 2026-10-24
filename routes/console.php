<?php

use App\Models\Reservation;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// The API also sweeps on every request (ExpireStaleReservations), which is
// what keeps holds honest under XAMPP; with cron, the scheduler does it too.
Artisan::command('reservations:expire', function () {
    Reservation::expireStale();
    $this->info('Expired unpaid pending reservations past their hold.');
})->purpose('Release plots held by unpaid pending reservations past RESERVATION_HOLD_DAYS');

Schedule::command('reservations:expire')->hourly();
