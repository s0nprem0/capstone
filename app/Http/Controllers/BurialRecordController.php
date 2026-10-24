<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\BurialRecord;
use App\Models\Lot;
use App\Support\Dates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BurialRecordController extends Controller
{
    private const PHONE_ERROR = 'next_of_kin_phone must be a phone number, e.g. 0917 123 4567';

    public function index(Request $request): JsonResponse
    {
        return response()->json(BurialRecord::search($request->query()));
    }

    /**
     * Public: a visitor searching for a loved one by name. Only the name, the
     * date of death and the plot are shown -- never the next of kin.
     */
    public function memorials(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 3) {
            return $this->error('Type at least 3 letters of the name');
        }
        return response()->json(BurialRecord::memorials(array_slice(preg_split('/\s+/', $q), 0, 5)));
    }

    /** Public: who rests in the plot chosen on the map. */
    public function lotMemorials(int $id): JsonResponse
    {
        Lot::findOrFail($id);
        return response()->json(BurialRecord::memorials([], $id));
    }

    public function show(int $id): JsonResponse
    {
        $record = BurialRecord::withDetails($id);
        return $record ? response()->json($record) : $this->error('Not found', 404);
    }

    public function store(Request $request): JsonResponse
    {
        $input = $request->all();

        $deceasedName = trim((string) ($input['deceased_fullname'] ?? ''));
        $lotId = (int) ($input['lot_id'] ?? 0);
        $burialDate = (string) ($input['burial_date'] ?? '');

        if ($deceasedName === '' || $lotId <= 0 || $burialDate === '') {
            return $this->error('deceased_fullname, lot_id, and burial_date are required');
        }

        $dates = ['burial_date' => $burialDate];
        foreach (['date_of_birth', 'date_of_death'] as $field) {
            $dates[$field] = !empty($input[$field]) ? (string) $input[$field] : null;
        }
        $dateError = self::dateError($dates);
        if ($dateError !== null) {
            return $this->error($dateError);
        }

        $burialType = $input['burial_type'] ?? 'single';
        if (!in_array($burialType, BurialRecord::TYPES, true)) {
            return $this->error('Invalid burial_type');
        }

        if (!self::validPhone($input['next_of_kin_phone'] ?? null)) {
            return $this->error(self::PHONE_ERROR);
        }

        $lot = Lot::find($lotId);
        if (!$lot) {
            return $this->error('Lot not found', 404);
        }
        if (!in_array($lot->status, ['reserved', 'occupied'], true)) {
            return $this->error('A burial record requires a reserved or occupied lot; this lot is '.$lot->status);
        }
        if ($burialType !== 'cremation' && BurialRecord::slotsUsed($lotId) >= $lot->capacity()) {
            return $this->error(self::fullError($lot));
        }

        $intermentStatus = $input['interment_status'] ?? 'scheduled';
        if (!in_array($intermentStatus, BurialRecord::INTERMENT, true)) {
            return $this->error('Invalid interment_status');
        }

        $record = BurialRecord::create([
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
        if ($lot->status !== 'occupied') {
            $lot->occupy();
        }

        AuditLog::record(Auth::id(), 'create', 'burial_records', $record->burial_id, AuditLog::snapshot(
            ['deceased_fullname' => $deceasedName, 'lot_code' => $lot->lot_code, 'burial_date' => $burialDate],
            ['deceased_fullname', 'lot_code', 'burial_date']
        ));
        return response()->json(BurialRecord::withDetails($record->burial_id), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $record = BurialRecord::findOrFail($id);
        $input = $request->all();
        $data = [];

        if (array_key_exists('deceased_fullname', $input)) {
            $name = trim((string) $input['deceased_fullname']);
            if ($name === '') {
                return $this->error('deceased_fullname cannot be empty');
            }
            $data['deceased_fullname'] = $name;
        }
        foreach (['date_of_birth', 'date_of_death'] as $field) {
            if (isset($input[$field])) {
                if ($input[$field] === '') {
                    $data[$field] = null;
                    continue;
                }
                if (!Dates::valid($input[$field])) {
                    return $this->error("$field must be in YYYY-MM-DD format");
                }
                $data[$field] = $input[$field];
            }
        }
        if (array_key_exists('burial_date', $input)) {
            if (!Dates::valid($input['burial_date'])) {
                return $this->error('burial_date must be in YYYY-MM-DD format');
            }
            $data['burial_date'] = $input['burial_date'];
        }
        if (isset($input['lot_id'])) {
            $lotId = (int) $input['lot_id'];
            $target = $lotId > 0 ? Lot::find($lotId) : null;
            if (!$target) {
                return $this->error('Lot not found');
            }
            if ($lotId !== $record->lot_id && !in_array($target->status, ['reserved', 'occupied'], true)) {
                return $this->error('A burial record requires a reserved or occupied lot; this lot is '.$target->status);
            }
            $data['lot_id'] = $lotId;
        }
        if (isset($input['burial_type'])) {
            if (!in_array($input['burial_type'], BurialRecord::TYPES, true)) {
                return $this->error('Invalid burial_type');
            }
            $data['burial_type'] = $input['burial_type'];
        }
        if (isset($input['next_of_kin_phone']) && !self::validPhone($input['next_of_kin_phone'])) {
            return $this->error(self::PHONE_ERROR);
        }
        foreach (['next_of_kin_name', 'next_of_kin_phone'] as $field) {
            if (isset($input[$field])) {
                $data[$field] = $input[$field] !== '' ? trim((string) $input[$field]) : null;
            }
        }
        if (isset($input['interment_status'])) {
            if (!in_array($input['interment_status'], BurialRecord::INTERMENT, true)) {
                return $this->error('Invalid interment_status');
            }
            $data['interment_status'] = $input['interment_status'];
        }

        $merged = array_merge($record->getAttributes(), $data);
        $dateError = self::dateError([
            'burial_date' => (string) $merged['burial_date'],
            'date_of_birth' => $merged['date_of_birth'],
            'date_of_death' => $merged['date_of_death'],
        ]);
        if ($dateError !== null) {
            return $this->error($dateError);
        }

        $lot = Lot::find((int) $merged['lot_id']);
        $takesSlot = $merged['burial_type'] !== 'cremation';
        $movedIn = $lot->lot_id !== $record->lot_id || ($takesSlot && $record->burial_type === 'cremation');
        if ($takesSlot && $movedIn && BurialRecord::slotsUsed($lot->lot_id, $id) >= $lot->capacity()) {
            return $this->error(self::fullError($lot));
        }

        if ($data !== []) {
            $before = $record->getAttributes();
            $record->update($data);
            if ($lot->status !== 'occupied') {
                $lot->occupy();
            }
            AuditLog::record(Auth::id(), 'update', 'burial_records', $id, AuditLog::changes($before, $data));
        }

        return response()->json(BurialRecord::withDetails($id));
    }

    public function destroy(int $id): JsonResponse
    {
        $record = BurialRecord::withDetails($id);
        if (!$record) {
            return $this->error('Not found', 404);
        }
        BurialRecord::query()->whereKey($id)->delete();
        AuditLog::record(Auth::id(), 'delete', 'burial_records', $id, AuditLog::snapshot(
            $record->getAttributes(),
            ['deceased_fullname', 'date_of_death', 'burial_date', 'lot_code', 'interment_status']
        ));
        return response()->json(['message' => 'Deleted']);
    }

    private static function fullError(Lot $lot): string
    {
        $capacity = $lot->capacity();
        return "Lot {$lot->lot_code} is a {$lot->lot_type} lot and already holds {$capacity} "
            .($capacity === 1 ? 'burial' : 'burials');
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
            if ($value !== null && !Dates::valid($value)) {
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
