<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\BurialRecord;
use App\Models\Lot;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\User;
use App\Support\Tally;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class StatsController extends Controller
{
    public function dashboard(): JsonResponse
    {
        $payments = Payment::summary();
        $burials = Tally::by(BurialRecord::query(), 'interment_status', BurialRecord::INTERMENT);

        return response()->json([
            'lots' => Tally::by(Lot::query(), 'status', Lot::STATUSES),
            'reservations' => Tally::by(Reservation::query(), 'approved_status', Reservation::STATUSES),
            'burials' => ['total' => $burials['total'], 'pending' => $burials['scheduled'], 'interred' => $burials['interred']],
            'users' => User::query()->count(),
            'payments' => [
                'total' => $payments['total'],
                'this_month' => $payments['this_month'],
                'count' => $payments['count'],
            ],
            'recent_reservations' => DB::table('reservations as r')
                ->join('cemetery_lots as l', 'l.lot_id', '=', 'r.lot_id')
                ->join('users as u', 'u.user_id', '=', 'r.user_id')
                ->select('r.reservation_id', 'l.lot_code', 'u.fullname', 'r.reservation_date', 'r.approved_status', 'r.created_at')
                ->orderByDesc('r.created_at')
                ->limit(5)
                ->get(),
        ]);
    }
}
