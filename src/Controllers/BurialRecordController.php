<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Core\Validate;
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

    /**
     * Public: a visitor searching for a loved one by name. Only the name, the
     * date of death and the plot are shown -- never the next of kin.
     */
    public function memorials(): void
    {
        $q = trim((string) ($_GET['q'] ?? ''));
        if (mb_strlen($q) < 3) {
            Response::json(['error' => 'Type at least 3 letters of the name'], 422);
            return;
        }
        $words = array_slice(preg_split('/\s+/', $q), 0, 5);
        Response::json(BurialRecord::memorials($words));
    }

    /** Public: who rests in the plot chosen on the map. */
    public function lotMemorials(int $id): void
    {
        if (!Lot::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json(BurialRecord::memorials([], $id));
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

        $deceasedName = trim((string) ($input['deceased_fullname'] ?? ''));
        $lotId = (int) ($input['lot_id'] ?? 0);
        $burialDate = (string) ($input['burial_date'] ?? '');

        if ($deceasedName === '' || $lotId <= 0 || $burialDate === '') {
            Response::json(['error' => 'deceased_fullname, lot_id, and burial_date are required'], 422);
            return;
        }

        $dates = ['burial_date' => $burialDate];
        foreach (['date_of_birth', 'date_of_death'] as $field) {
            $dates[$field] = !empty($input[$field]) ? (string) $input[$field] : null;
        }
        $dateError = self::dateError($dates);
        if ($dateError !== null) {
            Response::json(['error' => $dateError], 422);
            return;
        }

        $burialType = $input['burial_type'] ?? 'single';
        if (!in_array($burialType, ['single', 'double', 'family', 'cremation'], true)) {
            Response::json(['error' => 'Invalid burial_type'], 422);
            return;
        }

        if (!self::validPhone($input['next_of_kin_phone'] ?? null)) {
            Response::json(['error' => self::PHONE_ERROR], 422);
            return;
        }

        $lot = Lot::find($lotId);
        if (!$lot) {
            Response::json(['error' => 'Lot not found'], 404);
            return;
        }
        if (!in_array($lot['status'], ['reserved', 'occupied'], true)) {
            Response::json(['error' => 'A burial record requires a reserved or occupied lot; this lot is ' . $lot['status']], 422);
            return;
        }
        if ($burialType !== 'cremation' && BurialRecord::slotsUsed($lotId) >= Lot::capacity($lot)) {
            Response::json(['error' => self::fullError($lot)], 422);
            return;
        }

        $intermentStatus = $input['interment_status'] ?? 'scheduled';
        if (!in_array($intermentStatus, ['scheduled', 'interred'], true)) {
            Response::json(['error' => 'Invalid interment_status'], 422);
            return;
        }

        $burialId = BurialRecord::create([
            'deceased_fullname' => $deceasedName,
            'date_of_birth' => $dates['date_of_birth'],
            'date_of_death' => $dates['date_of_death'],
            'burial_date' => $burialDate,
            'lot_id' => $lotId,
            'burial_type' => $burialType,
            'next_of_kin_name' => !empty($input['next_of_kin_name']) ? $input['next_of_kin_name'] : null,
            'next_of_kin_phone' => !empty($input['next_of_kin_phone']) ? $input['next_of_kin_phone'] : null,
            'interment_status' => $intermentStatus,
        ]);

        // Someone is laid to rest here, so the plot is occupied whatever state
        // its reservation is in.
        if ($lot['status'] !== 'occupied') {
            Lot::occupy($lotId);
        }

        AuditLog::record(Auth::id(), 'create', 'burial_records', $burialId);
        Response::json(BurialRecord::withDetails($burialId), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $record = BurialRecord::find($id);
        if (!$record) {
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
                if (!Validate::date($input[$field])) {
                    Response::json(['error' => "$field must be in YYYY-MM-DD format"], 422);
                    return;
                }
                $data[$field] = $input[$field];
            }
        }
        if (array_key_exists('burial_date', $input)) {
            if (!Validate::date($input['burial_date'])) {
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
            if ($lotId !== (int) $record['lot_id']) {
                $lot = Lot::find($lotId);
                if (!in_array($lot['status'], ['reserved', 'occupied'], true)) {
                    Response::json(['error' => 'A burial record requires a reserved or occupied lot; this lot is ' . $lot['status']], 422);
                    return;
                }
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
        if (isset($input['next_of_kin_phone']) && !self::validPhone($input['next_of_kin_phone'])) {
            Response::json(['error' => self::PHONE_ERROR], 422);
            return;
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

        $merged = array_merge($record, $data);
        $dateError = self::dateError([
            'burial_date' => (string) $merged['burial_date'],
            'date_of_birth' => $merged['date_of_birth'],
            'date_of_death' => $merged['date_of_death'],
        ]);
        if ($dateError !== null) {
            Response::json(['error' => $dateError], 422);
            return;
        }

        $lotId = (int) $merged['lot_id'];
        $lot = Lot::find($lotId);
        $takesSlot = $merged['burial_type'] !== 'cremation';
        $movedIn = $lotId !== (int) $record['lot_id'] || ($takesSlot && $record['burial_type'] === 'cremation');
        if ($takesSlot && $movedIn && BurialRecord::slotsUsed($lotId, $id) >= Lot::capacity($lot)) {
            Response::json(['error' => self::fullError($lot)], 422);
            return;
        }

        if ($data !== []) {
            BurialRecord::update($id, $data);
            if ($lot['status'] !== 'occupied') {
                Lot::occupy($lotId);
            }
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

    private static function fullError(array $lot): string
    {
        $capacity = Lot::capacity($lot);
        return "Lot {$lot['lot_code']} is a {$lot['lot_type']} lot and already holds {$capacity} "
            . ($capacity === 1 ? 'burial' : 'burials');
    }

    /**
     * Real calendar dates, in order: born on or before death, buried on or
     * after death. Birth and death are optional.
     *
     * @param array{burial_date: string, date_of_birth: ?string, date_of_death: ?string} $dates
     */
    private static function dateError(array $dates): ?string
    {
        foreach ($dates as $field => $value) {
            if ($value === null) {
                continue;
            }
            if (!Validate::date($value)) {
                return "{$field} must be a date in YYYY-MM-DD format";
            }
        }
        ['date_of_birth' => $born, 'date_of_death' => $died, 'burial_date' => $buried] = $dates;
        if ($born !== null && $died !== null && $born > $died) {
            return 'date_of_birth must not be after date_of_death';
        }
        if ($died !== null && $buried < $died) {
            return 'burial_date must not be before date_of_death';
        }
        return null;
    }

    private const PHONE_ERROR = 'next_of_kin_phone must be a phone number, e.g. 0917 123 4567';

    /**
     * Digits with the usual separators, 7 to 15 characters (the column's
     * width): mobile and landline numbers, with or without +63. Empty is
     * fine; the field is optional.
     */
    private static function validPhone(mixed $value): bool
    {
        $phone = trim((string) ($value ?? ''));
        return $phone === '' || (bool) preg_match('/^\+?[0-9(][0-9 ()\-]{6,14}$/', $phone) && strlen($phone) <= 15;
    }
}
