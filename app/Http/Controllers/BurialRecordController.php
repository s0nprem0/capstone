<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\BurialRecord;
use App\Models\Lot;
use App\Support\Dates;
use App\Support\Search;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

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
        $q = Search::term($request->query());
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
        $input = $request->validate(self::rules(false), self::messages(false));

        $dates = ['burial_date' => $input['burial_date']];
        foreach (['date_of_birth', 'date_of_death'] as $field) {
            $dates[$field] = ($input[$field] ?? '') !== '' ? $input[$field] : null;
        }
        $dateError = self::dateError($dates);
        if ($dateError !== null) {
            return $this->error($dateError);
        }

        $lotId = (int) $input['lot_id'];
        $burialType = ($input['burial_type'] ?? '') ?: 'single';

        return DB::transaction(function () use ($input, $dates, $lotId, $burialType) {
            // Locked, so two clerks recording into the last free slot at once
            // cannot both get it.
            $lot = Lot::findForUpdate($lotId);
            if (!$lot) {
                return $this->error('Lot not found', 404);
            }
            if (!in_array($lot->status, ['reserved', 'occupied'], true)) {
                return $this->error('A burial record requires a reserved or occupied lot; this lot is '.$lot->status);
            }
            if ($burialType !== 'cremation' && BurialRecord::slotsUsed($lotId) >= $lot->capacity()) {
                return $this->error(self::fullError($lot));
            }

            $record = BurialRecord::create([
                'deceased_fullname' => $input['deceased_fullname'],
                'date_of_birth' => $dates['date_of_birth'],
                'date_of_death' => $dates['date_of_death'],
                'burial_date' => $dates['burial_date'],
                'lot_id' => $lotId,
                'burial_type' => $burialType,
                'next_of_kin_name' => ($input['next_of_kin_name'] ?? '') ?: null,
                'next_of_kin_phone' => ($input['next_of_kin_phone'] ?? '') ?: null,
                'interment_status' => ($input['interment_status'] ?? '') ?: 'scheduled',
            ]);

            // Someone is laid to rest here, so the plot is occupied whatever state
            // its reservation is in.
            if ($lot->status !== 'occupied') {
                $lot->occupy();
            }

            AuditLog::record(Auth::id(), 'create', 'burial_records', $record->burial_id, AuditLog::snapshot(
                ['deceased_fullname' => $record->deceased_fullname, 'lot_code' => $lot->lot_code, 'burial_date' => $record->burial_date],
                ['deceased_fullname', 'lot_code', 'burial_date']
            ));
            return response()->json(BurialRecord::withDetails($record->burial_id), 201);
        });
    }

    /** Only the fields sent change; "" clears an optional field, null leaves it. */
    public function update(Request $request, int $id): JsonResponse
    {
        $record = BurialRecord::findOrFail($id);
        $input = $request->validate(self::rules(true), self::messages(true));

        $data = array_intersect_key($input, array_flip(['deceased_fullname', 'burial_date']));
        foreach (['date_of_birth', 'date_of_death', 'next_of_kin_name', 'next_of_kin_phone'] as $field) {
            if (isset($input[$field])) {
                $data[$field] = $input[$field] !== '' ? $input[$field] : null;
            }
        }
        foreach (['lot_id', 'burial_type', 'interment_status'] as $field) {
            if (($input[$field] ?? '') !== '') {
                $data[$field] = $field === 'lot_id' ? (int) $input[$field] : $input[$field];
            }
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

        return DB::transaction(function () use ($record, $data, $merged, $id) {
            $lot = Lot::findForUpdate((int) $merged['lot_id']);
            if (!$lot) {
                return $this->error('Lot not found');
            }
            $moved = $lot->lot_id !== $record->lot_id;
            if ($moved && !in_array($lot->status, ['reserved', 'occupied'], true)) {
                return $this->error('A burial record requires a reserved or occupied lot; this lot is '.$lot->status);
            }
            $takesSlot = $merged['burial_type'] !== 'cremation';
            $movedIn = $moved || ($takesSlot && $record->burial_type === 'cremation');
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
        });
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

    /** @param bool $partial an update, where every field is optional */
    private static function rules(bool $partial): array
    {
        $presence = $partial ? ['sometimes', 'required'] : ['required'];
        $date = ['nullable', 'string', fn (string $field, mixed $value, Closure $fail) => $value === '' || Dates::valid($value) || $fail("{$field} must be a date in YYYY-MM-DD format")];

        return [
            'deceased_fullname' => [...$presence, 'string', 'max:255'],
            'lot_id' => [$partial ? 'nullable' : 'required', 'integer', 'min:1'],
            'burial_date' => [...$presence, ...array_slice($date, 1)],
            'date_of_birth' => $date,
            'date_of_death' => $date,
            'burial_type' => ['nullable', Rule::in(BurialRecord::TYPES)],
            'next_of_kin_name' => ['nullable', 'string', 'max:100'],
            'next_of_kin_phone' => ['nullable', 'string', fn (string $field, mixed $value, Closure $fail) => self::validPhone($value) || $fail(self::PHONE_ERROR)],
            'interment_status' => ['nullable', Rule::in(BurialRecord::INTERMENT)],
        ];
    }

    private static function messages(bool $partial): array
    {
        $required = 'deceased_fullname, lot_id, and burial_date are required';

        return [
            'deceased_fullname.required' => $partial ? 'deceased_fullname cannot be empty' : $required,
            'deceased_fullname.*' => 'deceased_fullname must be text of at most 255 characters',
            'lot_id.*' => $partial ? 'Lot not found' : $required,
            'burial_date.required' => $partial ? 'burial_date must be a date in YYYY-MM-DD format' : $required,
            'burial_date.string' => 'burial_date must be a date in YYYY-MM-DD format',
            'date_of_birth.string' => 'date_of_birth must be a date in YYYY-MM-DD format',
            'date_of_death.string' => 'date_of_death must be a date in YYYY-MM-DD format',
            'burial_type.*' => 'Invalid burial_type',
            'next_of_kin_name.*' => 'next_of_kin_name must be text of at most 100 characters',
            'next_of_kin_phone.string' => self::PHONE_ERROR,
            'interment_status.*' => 'Invalid interment_status',
        ];
    }

    private static function fullError(Lot $lot): string
    {
        $capacity = $lot->capacity();
        return "Lot {$lot->lot_code} is a {$lot->lot_type} lot and already holds {$capacity} "
            .($capacity === 1 ? 'burial' : 'burials');
    }

    /**
     * Dates in order: born on or before death, buried on or after death.
     * Birth and death are optional; the rules have checked each is a date.
     *
     * @param array{burial_date: string, date_of_birth: ?string, date_of_death: ?string} $dates
     */
    private static function dateError(array $dates): ?string
    {
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
        if (!is_string($value)) {
            return $value === null;
        }
        $phone = trim($value);
        return $phone === '' || (bool) preg_match('/^\+?[0-9(][0-9 ()\-]{6,14}$/', $phone) && strlen($phone) <= 15;
    }
}
