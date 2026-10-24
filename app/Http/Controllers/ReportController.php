<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\BurialRecord;
use App\Models\Lot;
use App\Models\Payment;
use App\Models\Reservation;
use App\Support\Dates;
use App\Support\Tally;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function reservations(): JsonResponse
    {
        return response()->json(Tally::by(Reservation::query(), 'approved_status', Reservation::STATUSES) + [
            'items' => DB::table('reservations as r')
                ->join('cemetery_lots as l', 'l.lot_id', '=', 'r.lot_id')
                ->join('users as u', 'u.user_id', '=', 'r.user_id')
                ->select('r.reservation_id', 'r.reservation_date', 'r.total_amount', 'r.approved_status', 'l.lot_code', 'u.fullname as user_name')
                ->orderByDesc('r.reservation_id')
                ->get(),
        ]);
    }

    public function burialRecords(): JsonResponse
    {
        return response()->json(Tally::by(BurialRecord::query(), 'interment_status', BurialRecord::INTERMENT) + [
            'items' => DB::table('burial_records as b')
                ->join('cemetery_lots as l', 'l.lot_id', '=', 'b.lot_id')
                ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
                ->select('b.burial_id', 'b.deceased_fullname', 'b.burial_date', 'b.burial_type', 'b.interment_status', 'l.lot_code', 's.section_name')
                ->orderByDesc('b.burial_id')
                ->get(),
        ]);
    }

    public function availability(): JsonResponse
    {
        // Every plot, but only the columns the report renders: a report that
        // silently stops partway is worse than a large one.
        return response()->json(Tally::by(Lot::query(), 'status', Lot::STATUSES) + [
            'items' => DB::table('cemetery_lots as l')
                ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
                ->select('l.lot_id', 'l.lot_code', 'l.lot_type', 'l.block', 'l.price', 'l.status', 's.section_name')
                ->orderBy('s.section_name')
                ->orderBy('l.lot_code')
                ->get(),
        ]);
    }

    public function payments(): JsonResponse
    {
        return response()->json(Payment::summary() + [
            'items' => DB::table('payments as p')
                ->join('reservations as r', 'r.reservation_id', '=', 'p.reservation_id')
                ->join('cemetery_lots as l', 'l.lot_id', '=', 'r.lot_id')
                ->join('cemetery_sections as s', 's.section_id', '=', 'l.section_id')
                ->join('users as u', 'u.user_id', '=', 'r.user_id')
                ->leftJoin('users as rec', 'rec.user_id', '=', 'p.recorded_by')
                ->select(
                    'p.payment_id', 'p.amount', 'p.method', 'p.reference_no', 'p.payment_date',
                    'r.reservation_id', 'l.lot_code', 's.section_name', 'u.fullname as user_name',
                    'rec.fullname as recorded_by_name'
                )
                ->orderByDesc('p.payment_date')
                ->orderByDesc('p.payment_id')
                ->get(),
        ]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $range = $this->range($request);
        $query = $this->between(DB::table('audit_logs as a'), 'a.created_at', $range, true);

        // Paged rather than capped, so the whole trail for a period stays
        // reachable: the page asks for the next block, and the CSV export walks
        // every block.
        $limit = max(1, min(1000, (int) $request->query('limit', 200)));
        $offset = max(0, (int) $request->query('offset', 0));

        return response()->json([
            'total' => (clone $query)->count(),
            'offset' => $offset,
            'items' => $query
                ->leftJoin('users as u', 'u.user_id', '=', 'a.user_id')
                ->select('a.*', 'u.fullname as user_name')
                ->orderByDesc('a.log_id')
                ->limit($limit)
                ->offset($offset)
                ->get(),
        ]);
    }

    /**
     * Activity in a date range, for the Reports page. Plot availability is a
     * snapshot of now: a plot's status has no history to look back through.
     */
    public function summary(Request $request): JsonResponse
    {
        $range = $this->range($request);

        $reservations = ['pending' => 0, 'approved' => 0, 'rejected' => 0, 'cancelled' => 0, 'total' => 0, 'value' => 0.0];
        $rows = $this->between(DB::table('reservations'), 'created_at', $range, true)
            ->select('approved_status')
            ->selectRaw('COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS value')
            ->groupBy('approved_status')
            ->get();
        foreach ($rows as $row) {
            $reservations[$row->approved_status] = (int) $row->count;
            $reservations['total'] += (int) $row->count;
            $reservations['value'] += (float) $row->value;
        }

        $byMethod = $this->between(DB::table('payments'), 'payment_date', $range)
            ->select('method')
            ->selectRaw('COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total')
            ->groupBy('method')
            ->orderByDesc('total')
            ->get()
            ->map(fn (object $row) => ['method' => $row->method, 'count' => (int) $row->count, 'total' => (float) $row->total])
            ->all();

        $burials = ['scheduled' => 0, 'interred' => 0, 'total' => 0];
        $rows = $this->between(DB::table('burial_records'), 'burial_date', $range)
            ->select('interment_status')
            ->selectRaw('COUNT(*) AS count')
            ->groupBy('interment_status')
            ->get();
        foreach ($rows as $row) {
            $burials[$row->interment_status] = (int) $row->count;
            $burials['total'] += (int) $row->count;
        }
        // Every interment still to happen, whatever its date: the figure the
        // dashboard shows, so the two can be reconciled.
        $burials['scheduled_all'] = BurialRecord::query()->where('interment_status', 'scheduled')->count();

        $sections = DB::table('cemetery_sections as s')
            ->leftJoin('cemetery_lots as l', 'l.section_id', '=', 's.section_id')
            ->select('s.section_id', 's.section_name')
            ->selectRaw('COUNT(l.lot_id) AS total')
            ->selectRaw("COALESCE(SUM(l.status = 'available'), 0) AS available")
            ->selectRaw("COALESCE(SUM(l.status = 'reserved'), 0) AS reserved")
            ->selectRaw("COALESCE(SUM(l.status = 'occupied'), 0) AS occupied")
            ->groupBy('s.section_id', 's.section_name')
            ->orderByRaw('LENGTH(s.section_name), s.section_name')
            ->get()
            ->map(fn (object $row) => [
                'section_id' => (int) $row->section_id,
                'section_name' => $row->section_name,
                'total' => (int) $row->total,
                'available' => (int) $row->available,
                'reserved' => (int) $row->reserved,
                'occupied' => (int) $row->occupied,
            ])
            ->all();

        return response()->json([
            'from' => $range['from'],
            'to' => $range['to'],
            'reservations' => $reservations,
            'payments' => [
                'total' => array_sum(array_column($byMethod, 'total')),
                'count' => array_sum(array_column($byMethod, 'count')),
                'by_method' => $byMethod,
            ],
            'burials' => $burials,
            'lots' => [
                'total' => array_sum(array_column($sections, 'total')),
                'available' => array_sum(array_column($sections, 'available')),
                'reserved' => array_sum(array_column($sections, 'reserved')),
                'occupied' => array_sum(array_column($sections, 'occupied')),
                'sections' => $sections,
            ],
        ]);
    }

    /**
     * The optional ?from= and ?to= dates (inclusive, YYYY-MM-DD). Anything
     * else is a 422, so a bad date is never silently read as "all time".
     *
     * @return array{from: ?string, to: ?string}
     */
    private function range(Request $request): array
    {
        $range = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ], [
            'from.*' => 'from must be a date in YYYY-MM-DD format',
            'to.*' => 'to must be a date in YYYY-MM-DD format',
        ]);
        $range = ['from' => ($range['from'] ?? '') ?: null, 'to' => ($range['to'] ?? '') ?: null];

        if ($range['from'] !== null && $range['to'] !== null && $range['from'] > $range['to']) {
            abort(422, 'from must not be after to');
        }
        return $range;
    }

    /**
     * $query bounded to the range on $column. A DATETIME column runs up to the
     * start of the day after `to`, so the whole of that day counts.
     *
     * @param array{from: ?string, to: ?string} $range
     */
    private function between(Builder $query, string $column, array $range, bool $datetime = false): Builder
    {
        if ($range['from'] !== null) {
            $query->where($column, '>=', $range['from']);
        }
        if ($range['to'] !== null) {
            $datetime
                ? $query->where($column, '<', Dates::nextDay($range['to']))
                : $query->where($column, '<=', $range['to']);
        }
        return $query;
    }
}
