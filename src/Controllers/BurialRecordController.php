<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\BurialRecord;
use App\Models\Lot;

class BurialRecordController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(): void
    {
        Auth::requireRole(['admin', 'staff']);
        Response::json(BurialRecord::search($_GET));
    }

    public function show(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $record = BurialRecord::withDetails($id);
        if (!$record) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json($record);
    }

    public function store(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $input = $this->router->input();

        $deceasedName = trim($input['deceased_fullname'] ?? '');
        $lotId = (int) ($input['lot_id'] ?? 0);
        $burialDate = $input['burial_date'] ?? '';

        if ($deceasedName === '' || $lotId <= 0 || $burialDate === '') {
            Response::json(['error' => 'deceased_fullname, lot_id, and burial_date are required'], 422);
            return;
        }

        $burialType = $input['burial_type'] ?? 'single';
        if (!in_array($burialType, ['single', 'double', 'family', 'cremation'], true)) {
            Response::json(['error' => 'Invalid burial_type'], 422);
            return;
        }

        $lot = Lot::find($lotId);
        if (!$lot) {
            Response::json(['error' => 'Lot not found'], 404);
            return;
        }

        $intermentStatus = $input['interment_status'] ?? 'scheduled';
        if (!in_array($intermentStatus, ['scheduled', 'interred'], true)) {
            Response::json(['error' => 'Invalid interment_status'], 422);
            return;
        }

        $burialId = BurialRecord::create([
            'deceased_fullname' => $deceasedName,
            'date_of_birth' => !empty($input['date_of_birth']) ? $input['date_of_birth'] : null,
            'date_of_death' => !empty($input['date_of_death']) ? $input['date_of_death'] : null,
            'burial_date' => $burialDate,
            'lot_id' => $lotId,
            'burial_type' => $burialType,
            'next_of_kin_name' => !empty($input['next_of_kin_name']) ? $input['next_of_kin_name'] : null,
            'next_of_kin_phone' => !empty($input['next_of_kin_phone']) ? $input['next_of_kin_phone'] : null,
            'interment_status' => $intermentStatus,
        ]);

        AuditLog::record(Auth::id(), 'create', 'burial_records', $burialId);
        Response::json(BurialRecord::withDetails($burialId), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        if (!BurialRecord::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $input = $this->router->input();
        $data = [];

        if (isset($input['deceased_fullname'])) {
            $data['deceased_fullname'] = $input['deceased_fullname'];
        }
        if (isset($input['date_of_birth'])) {
            $data['date_of_birth'] = $input['date_of_birth'] ?: null;
        }
        if (isset($input['date_of_death'])) {
            $data['date_of_death'] = $input['date_of_death'] ?: null;
        }
        if (isset($input['burial_date'])) {
            $data['burial_date'] = $input['burial_date'];
        }
        if (isset($input['lot_id'])) {
            $data['lot_id'] = (int) $input['lot_id'];
        }
        if (isset($input['burial_type'])) {
            $data['burial_type'] = $input['burial_type'];
        }
        if (isset($input['next_of_kin_name'])) {
            $data['next_of_kin_name'] = $input['next_of_kin_name'] ?: null;
        }
        if (isset($input['next_of_kin_phone'])) {
            $data['next_of_kin_phone'] = $input['next_of_kin_phone'] ?: null;
        }
        if (isset($input['interment_status'])) {
            $data['interment_status'] = $input['interment_status'];
        }

        if ($data !== []) {
            BurialRecord::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'burial_records', $id);
        }

        Response::json(BurialRecord::withDetails($id));
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        if (!BurialRecord::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        BurialRecord::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'burial_records', $id);
        Response::json(['message' => 'Deleted']);
    }
}
