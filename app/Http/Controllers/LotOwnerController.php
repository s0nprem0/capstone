<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\LotOwner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Plot ownership outside the online reservations: the office's paper sales.
 * Owner names are personal data, so every route is staff and admin only; the
 * public map shows a plot's status, never who holds it.
 */
class LotOwnerController extends Controller
{
    public function index(int $id): JsonResponse
    {
        Lot::findOrFail($id);
        return response()->json(LotOwner::forLot($id));
    }

    public function store(Request $request, int $id): JsonResponse
    {
        $data = $this->validated($request, false);

        return DB::transaction(function () use ($id, $data) {
            $lot = Lot::findForUpdate($id);
            if (!$lot) {
                return $this->error('Not found', 404);
            }
            if (Lot::liveReservations($id) > 0) {
                return $this->error("Plot {$lot->lot_code} has a pending or approved online reservation; its client is the owner. Settle the reservation first.", 409);
            }
            if (LotOwner::duplicate($id, $data['plot'], $data['owner_name'])) {
                return $this->error("{$data['owner_name']} is already recorded as an owner of {$lot->lot_code}");
            }

            $owner = LotOwner::create(['lot_id' => $id] + $data);
            if ($lot->status !== 'occupied') {
                $lot->occupy();
            }
            AuditLog::record(Auth::id(), 'create', 'lot_owners', $owner->owner_id, AuditLog::snapshot(
                ['lot_code' => $lot->lot_code] + $data,
                ['lot_code', 'plot', 'owner_name', 'payment_terms']
            ));

            return response()->json($owner->fresh(), 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $owner = LotOwner::findOrFail($id);
        $data = $this->validated($request, true);

        $name = $data['owner_name'] ?? $owner->owner_name;
        $plot = array_key_exists('plot', $data) ? $data['plot'] : $owner->plot;
        if (LotOwner::duplicate($owner->lot_id, $plot, $name, $id)) {
            return $this->error("{$name} is already recorded as an owner of this plot");
        }

        if ($data !== []) {
            $before = $owner->getAttributes();
            $owner->update($data);
            AuditLog::record(Auth::id(), 'update', 'lot_owners', $id, AuditLog::changes($before, $data));
        }
        return response()->json($owner->fresh());
    }

    /** Admin only, like deleting a payment or a burial: it erases a sale. */
    public function destroy(int $id): JsonResponse
    {
        return DB::transaction(function () use ($id) {
            $owner = LotOwner::find($id);
            if (!$owner) {
                return $this->error('Not found', 404);
            }
            $owner->delete();
            // The last owner gone and nothing else holding it: back on the map.
            Lot::releaseIfFree($owner->lot_id);
            AuditLog::record(Auth::id(), 'delete', 'lot_owners', $id, AuditLog::snapshot(
                $owner->getAttributes(),
                ['lot_id', 'plot', 'owner_name', 'payment_terms']
            ));

            return response()->json(['message' => 'Deleted']);
        });
    }

    /**
     * @param bool $partial when true, only the fields present are validated (update)
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $partial): array
    {
        $presence = $partial ? ['sometimes', 'required'] : ['required'];
        $input = $request->validate([
            'owner_name' => [...$presence, 'string', 'max:255'],
            'plot' => ['nullable', 'string', 'max:10'],
            'payment_terms' => ['nullable', Rule::in(LotOwner::TERMS)],
            'notes' => ['nullable', 'string', 'max:500'],
        ], [
            'owner_name.*' => 'owner_name is required, at most 255 characters',
            'plot.*' => 'plot must be at most 10 characters',
            'payment_terms.*' => 'payment_terms must be cash, installment or F',
            'notes.*' => 'notes must be at most 500 characters',
        ]);

        $data = [];
        foreach (['owner_name', 'plot', 'payment_terms', 'notes'] as $field) {
            if (!$partial || array_key_exists($field, $input)) {
                $value = $input[$field] ?? null;
                $data[$field] = $value === '' ? null : $value;
            }
        }
        return $data;
    }
}
