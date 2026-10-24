<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Reservation;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class ExpireStaleReservations
{
    public function handle(Request $request, Closure $next): Response
    {
        try {
            Reservation::expireStale();
        } catch (Throwable $e) {
            // Housekeeping must never take the API down with it.
            report($e);
        }

        return $next($request);
    }
}
