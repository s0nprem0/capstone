<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\Lot;
use App\Models\LotOwner;

/**
 * Plot ownership outside the online reservations: the office's paper sales.
 * Owner names are personal data, so every route is staff and admin only; the
 * public map shows a plot's status, never who holds it.
 */
class LotOwnerController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(int $lotId): void
    {
        Auth::requireRole(['admin', 'staff']);
        if (!Lot::find($lotId)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json(LotOwner::forLot($lotId));
    }

    public function store(int $lotId): void
    {
        Auth::requireRole(['admin', 'staff']);
        $fields = $this->validate($this->router->input(), false);
        if (isset($fields['error'])) {
            Response::json(['error' => $fields['error']], 422);
            return;
        }
        $data = $fields['data'];

        $pdo = Database::connection();
        try {
            $pdo->beginTransaction();
            $lot = Lot::findForUpdate($lotId);
            if (!$lot) {
                $pdo->rollBack();
                Response::json(['error' => 'Not found'], 404);
                return;
            }
            if (Lot::liveReservations($lotId) > 0) {
                $pdo->rollBack();
                Response::json(['error' => "Plot {$lot['lot_code']} has a pending or approved online reservation; its client is the owner. Settle the reservation first."], 409);
                return;
            }
            if (LotOwner::duplicate($lotId, $data['plot'], $data['owner_name'])) {
                $pdo->rollBack();
                Response::json(['error' => "{$data['owner_name']} is already recorded as an owner of {$lot['lot_code']}"], 422);
                return;
            }

            $id = LotOwner::create(['lot_id' => $lotId] + $data);
            if ($lot['status'] !== 'occupied') {
                Lot::occupy($lotId);
            }
            AuditLog::record(Auth::id(), 'create', 'lot_owners', $id, AuditLog::snapshot(
                ['lot_code' => $lot['lot_code']] + $data,
                ['lot_code', 'plot', 'owner_name', 'payment_terms']
            ));
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        Response::json(LotOwner::find($id), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $owner = LotOwner::find($id);
        if (!$owner) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        $fields = $this->validate($this->router->input(), true);
        if (isset($fields['error'])) {
            Response::json(['error' => $fields['error']], 422);
            return;
        }
        $data = $fields['data'];
        $name = $data['owner_name'] ?? $owner['owner_name'];
        $plot = array_key_exists('plot', $data) ? $data['plot'] : $owner['plot'];
        if (LotOwner::duplicate((int) $owner['lot_id'], $plot, $name, $id)) {
            Response::json(['error' => "{$name} is already recorded as an owner of this plot"], 422);
            return;
        }

        if ($data !== []) {
            LotOwner::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'lot_owners', $id, AuditLog::changes($owner, $data));
        }
        Response::json(LotOwner::find($id));
    }

    /** Admin only, like deleting a payment or a burial: it erases a sale. */
    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        $pdo = Database::connection();
        try {
            $pdo->beginTransaction();
            $owner = LotOwner::find($id);
            if (!$owner) {
                $pdo->rollBack();
                Response::json(['error' => 'Not found'], 404);
                return;
            }
            LotOwner::delete($id);
            // The last owner gone and nothing else holding it: back on the map.
            Lot::releaseIfFree((int) $owner['lot_id']);
            AuditLog::record(Auth::id(), 'delete', 'lot_owners', $id, AuditLog::snapshot(
                $owner,
                ['lot_id', 'plot', 'owner_name', 'payment_terms', 'source']
            ));
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        Response::json(['message' => 'Deleted']);
    }

    /**
     * @return array{data: array<string, mixed>}|array{error: string}
     */
    private function validate(array $input, bool $partial): array
    {
        $data = [];
        if (!$partial || array_key_exists('owner_name', $input)) {
            $name = trim((string) ($input['owner_name'] ?? ''));
            if ($name === '' || mb_strlen($name) > 255) {
                return ['error' => 'owner_name is required, at most 255 characters'];
            }
            $data['owner_name'] = $name;
        }
        if (!$partial || array_key_exists('plot', $input)) {
            $plot = trim((string) ($input['plot'] ?? ''));
            if (mb_strlen($plot) > 10) {
                return ['error' => 'plot must be at most 10 characters'];
            }
            $data['plot'] = $plot !== '' ? $plot : null;
        }
        if (!$partial || array_key_exists('payment_terms', $input)) {
            $terms = (string) ($input['payment_terms'] ?? '');
            if ($terms !== '' && !in_array($terms, LotOwner::TERMS, true)) {
                return ['error' => 'payment_terms must be cash, installment or F'];
            }
            $data['payment_terms'] = $terms !== '' ? $terms : null;
        }
        if (!$partial || array_key_exists('notes', $input)) {
            $notes = trim((string) ($input['notes'] ?? ''));
            if (mb_strlen($notes) > 500) {
                return ['error' => 'notes must be at most 500 characters'];
            }
            $data['notes'] = $notes !== '' ? $notes : null;
        }
        return ['data' => $data];
    }
}
