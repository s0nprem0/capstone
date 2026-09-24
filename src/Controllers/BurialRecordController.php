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

        if (array_key_exists('deceased_fullname', $input)) {
            $name = trim((string) $input['deceased_fullname']);
            if ($name === '') {
                Response::json(['error' => 'deceased_fullname cannot be empty'], 422);
                return;
            }
            $data['deceased_fullname'] = $name;
        }
        foreach (['date_of_birth', 'date_of_death'] as $field) {
            if (isset($input[$field])) {
                if ($input[$field] === '') {
                    $data[$field] = null;
                    continue;
                }
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input[$field])) {
                    Response::json(['error' => "$field must be in YYYY-MM-DD format"], 422);
                    return;
                }
                $data[$field] = $input[$field];
            }
        }
        if (array_key_exists('burial_date', $input)) {
            if ($input['burial_date'] === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input['burial_date'])) {
                Response::json(['error' => 'burial_date must be in YYYY-MM-DD format'], 422);
                return;
            }
            $data['burial_date'] = $input['burial_date'];
        }
        if (isset($input['lot_id'])) {
            $lotId = (int) $input['lot_id'];
            if ($lotId <= 0 || !Lot::find($lotId)) {
                Response::json(['error' => 'Lot not found'], 422);
                return;
            }
            $data['lot_id'] = $lotId;
        }
        if (isset($input['burial_type'])) {
            if (!in_array($input['burial_type'], ['single', 'double', 'family', 'cremation'], true)) {
                Response::json(['error' => 'Invalid burial_type'], 422);
                return;
            }
            $data['burial_type'] = $input['burial_type'];
        }
        foreach (['next_of_kin_name', 'next_of_kin_phone'] as $field) {
            if (isset($input[$field])) {
                $data[$field] = $input[$field] !== '' ? trim($input[$field]) : null;
            }
        }
        if (isset($input['interment_status'])) {
            if (!in_array($input['interment_status'], ['scheduled', 'interred'], true)) {
                Response::json(['error' => 'Invalid interment_status'], 422);
                return;
            }
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
