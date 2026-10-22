<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Core\Auth;
use App\Core\Headers;
use App\Core\Response;
use App\Core\Router;
use App\Core\Validate;
use App\Models\AuditLog;
use App\Models\BurialRecord;
use App\Models\LedgerRow;
use App\Models\Lot;
use App\Models\LotOwner;

/**
 * Review of the handwritten ledger before it becomes records: the study's data
 * migration step ("organize, clean ... transfer and encode all validated
 * data"). Staff check each staged row against its photo, correct it, and
 * approve it into a lot owner or burial record on the surveyed plot, through
 * the same rules as records entered by hand.
 */
class LedgerController
{
    /** Approving more than this in one request risks the PHP time limit. */
    private const BULK_LIMIT = 200;

    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(): void
    {
        Auth::requireRole(['admin', 'staff']);
        Response::json(LedgerRow::search($_GET));
    }

    /** Correct a pending row before approving it. */
    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $row = LedgerRow::find($id);
        if (!$row) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        if ($row['status'] !== 'pending') {
            Response::json(['error' => 'Only pending rows can be changed'], 422);
            return;
        }

        $input = $this->router->input();
        $data = [];

        if (array_key_exists('name', $input)) {
            $name = trim((string) $input['name']);
            if ($name === '' || mb_strlen($name) > 255) {
                Response::json(['error' => 'name is required, at most 255 characters'], 422);
                return;
            }
            $data['name'] = $name;
        }
        if (array_key_exists('lot_code', $input)) {
            $code = trim((string) $input['lot_code']);
            if ($code === '') {
                $data['lot_id'] = null;
            } else {
                $lot = Lot::findBy('lot_code', $code);
                if (!$lot) {
                    Response::json(['error' => "No plot has the code {$code}"], 422);
                    return;
                }
                $data['lot_id'] = (int) $lot['lot_id'];
            }
        }
        if (array_key_exists('plot', $input)) {
            $plot = trim((string) $input['plot']);
            if (mb_strlen($plot) > 10) {
                Response::json(['error' => 'plot must be at most 10 characters'], 422);
                return;
            }
            $data['plot'] = $plot !== '' ? $plot : null;
        }
        if (array_key_exists('burial_date', $input)) {
            $date = $input['burial_date'];
            if ($date === '' || $date === null) {
                $data['burial_date'] = null;
            } elseif (!Validate::date($date) || $date > Validate::today()) {
                Response::json(['error' => 'burial_date must be a past date in YYYY-MM-DD format'], 422);
                return;
            } else {
                $data['burial_date'] = $date;
            }
        }
        if (array_key_exists('terms', $input)) {
            $terms = (string) $input['terms'];
            if ($terms !== '' && !in_array($terms, LotOwner::TERMS, true)) {
                Response::json(['error' => 'terms must be cash, installment or F'], 422);
                return;
            }
            $data['terms'] = $terms !== '' ? $terms : null;
        }
        if (array_key_exists('doubt', $input)) {
            // Clearing the transcriber's doubt is how a reviewer says "checked".
            $doubt = trim((string) $input['doubt']);
            $data['doubt'] = $doubt !== '' ? mb_substr($doubt, 0, 500) : null;
        }

        if ($data !== []) {
            // A corrected row is tried again by the bulk approval.
            LedgerRow::update($id, $data + ['review_note' => null]);
            AuditLog::record(Auth::id(), 'update', 'ledger_rows', $id, AuditLog::changes($row, $data));
        }

        Response::json(LedgerRow::find($id));
    }

    public function approve(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        [$status, $message] = $this->approveRow($id);
        Response::json($status === 200 ? ['message' => $message] : ['error' => $message], $status);
    }

    /**
     * Approve every clean pending row (matched plot, no doubt, a date for a
     * burial), up to BULK_LIMIT per call. Rows a rule refuses -- a duplicate,
     * a full plot, an online reservation on the plot -- stay pending with the
     * reason, for a person to settle.
     */
    public function approveClean(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $approved = 0;
        $skipped = [];
        foreach (LedgerRow::cleanIds(self::BULK_LIMIT) as $id) {
            [$status, $message] = $this->approveRow($id);
            if ($status === 200) {
                $approved++;
            } else {
                $skipped[] = ['row_id' => $id, 'reason' => $message];
                LedgerRow::update($id, ['review_note' => mb_substr($message, 0, 255)]);
            }
        }
        Response::json(['approved' => $approved, 'skipped' => $skipped]);
    }

    public function reject(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $reason = trim((string) ($this->router->input()['reason'] ?? ''));
        if ($reason === '') {
            Response::json(['error' => 'Say why the row is rejected (for example "duplicate of row 12" or "not a burial")'], 422);
            return;
        }

        $pdo = Database::connection();
        try {
            $pdo->beginTransaction();
            $row = LedgerRow::findForUpdate($id);
            if (!$row || $row['status'] !== 'pending') {
                $pdo->rollBack();
                Response::json(['error' => $row ? 'Only pending rows can be rejected' : 'Not found'], $row ? 422 : 404);
                return;
            }
            LedgerRow::update($id, $this->reviewed('rejected', mb_substr($reason, 0, 255)));
            AuditLog::record(Auth::id(), 'reject', 'ledger_rows', $id, ['reason' => $reason]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        Response::json(['message' => 'Row rejected']);
    }

    /**
     * The photo a row was read from, so a reviewer can check it against the
     * page. Staff and admin only: the book holds personal data. The files stay
     * outside public/ and are read by number, never by a path from the request.
     */
    public function photo(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $book = (string) ($_GET['book'] ?? '');
        $number = (string) ($_GET['n'] ?? '');
        if (!ctype_digit($book) || !ctype_digit($number) || (int) $book < 1 || (int) $number < 1) {
            Response::json(['error' => 'book and n must be positive numbers'], 422);
            return;
        }
        $dir = $_ENV['LEDGER_DIR'] ?? dirname(__DIR__, 2) . '/database/ledger';
        $file = sprintf('%s/book%d/photos/%03d.jpg', $dir, (int) $book, (int) $number);
        if (!is_file($file)) {
            Response::json(['error' => 'Photo not found'], 404);
            return;
        }
        Headers::security();
        header('Content-Type: image/jpeg');
        header('Cache-Control: private, max-age=3600');
        header('Content-Length: ' . filesize($file));
        readfile($file);
    }

    /**
     * @return array{0: int, 1: string} HTTP status and message
     */
    private function approveRow(int $id): array
    {
        $pdo = Database::connection();
        try {
            $pdo->beginTransaction();
            $row = LedgerRow::findForUpdate($id);
            if (!$row) {
                $pdo->rollBack();
                return [404, 'Not found'];
            }
            if ($row['status'] !== 'pending') {
                $pdo->rollBack();
                return [422, 'Only pending rows can be approved'];
            }
            if ($row['lot_id'] === null) {
                $pdo->rollBack();
                return [422, 'Choose the plot this row belongs to first'];
            }
            $lotId = (int) $row['lot_id'];
            $lot = Lot::findForUpdate($lotId);

            // An online booking and a paper sale on the same plot is a double
            // sale; the office has to settle which one stands.
            if (Lot::liveReservations($lotId) > 0) {
                $pdo->rollBack();
                return [409, "Plot {$lot['lot_code']} has a pending or approved online reservation. Settle it on Reservations before recording the ledger's " . ($row['kind'] === 'owner' ? 'sale' : 'burial') . '.'];
            }

            $error = $row['kind'] === 'owner' ? $this->ownerError($row, $lot) : $this->burialError($row, $lot);
            if ($error !== null) {
                $pdo->rollBack();
                return $error;
            }

            $source = LedgerRow::source($row);
            if ($row['kind'] === 'owner') {
                $recordId = LotOwner::create([
                    'lot_id' => $lotId,
                    'plot' => $row['plot'],
                    'owner_name' => $row['name'],
                    'payment_terms' => in_array($row['terms'], LotOwner::TERMS, true) ? $row['terms'] : null,
                    'notes' => $row['notes'],
                    'source' => $source,
                ]);
                $table = 'lot_owners';
            } else {
                $recordId = BurialRecord::create([
                    'deceased_fullname' => $row['name'],
                    'burial_date' => $row['burial_date'],
                    'lot_id' => $lotId,
                    'burial_type' => $this->burialType($row, $lot),
                    'interment_status' => 'interred',
                    'source' => $source,
                ]);
                $table = 'burial_records';
            }

            // Sold or in use, so off the market.
            if ($lot['status'] !== 'occupied') {
                Lot::occupy($lotId);
            }
            LedgerRow::update($id, $this->reviewed('approved', null) + ['record_id' => $recordId]);
            AuditLog::record(Auth::id(), 'approve', 'ledger_rows', $id, ['created' => "{$table} #{$recordId}", 'lot_code' => $lot['lot_code']]);
            AuditLog::record(Auth::id(), 'create', $table, $recordId, AuditLog::snapshot(
                ['name' => $row['name'], 'lot_code' => $lot['lot_code'], 'source' => $source],
                ['name', 'lot_code', 'source']
            ));
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return [200, 'Row approved'];
    }

    /** @return array{0: int, 1: string}|null */
    private function ownerError(array $row, array $lot): ?array
    {
        $existing = LotOwner::duplicate((int) $lot['lot_id'], $row['plot'], $row['name']);
        if ($existing) {
            return [409, "{$row['name']} is already recorded as an owner of {$lot['lot_code']} (owner #{$existing['owner_id']}). Reject this row as a duplicate."];
        }
        return null;
    }

    /** @return array{0: int, 1: string}|null */
    private function burialError(array $row, array $lot): ?array
    {
        if ($row['burial_date'] === null) {
            return [422, $row['date_text'] === null
                ? 'Set the burial date first; the book gives none'
                : 'Set the burial date first; the book\'s "' . $row['date_text'] . '" could not be read as one'];
        }
        $existing = BurialRecord::duplicate((int) $lot['lot_id'], $row['name']);
        if ($existing) {
            return [409, "{$row['name']} is already filed on {$lot['lot_code']} (burial #{$existing['burial_id']}). Reject this row as a duplicate."];
        }
        if ($this->burialType($row, $lot) !== 'cremation'
            && BurialRecord::slotsUsed((int) $lot['lot_id']) >= Lot::capacity($lot)) {
            return [422, "{$lot['lot_code']} is a {$lot['lot_type']} lot and already holds " . Lot::capacity($lot)
                . '. If the book shows a family estate, change the plot\'s type before approving.'];
        }
        return null;
    }

    /**
     * Ash interments (the brief has transcribers note "ash interment") take no
     * grave slot; the rest are filed as the plot's own type.
     */
    private function burialType(array $row, array $lot): string
    {
        return preg_match('/\bash interment\b/i', ($row['notes'] ?? '') . ' ' . $row['name']) ? 'cremation' : $lot['lot_type'];
    }

    private function reviewed(string $status, ?string $note): array
    {
        return [
            'status' => $status,
            'review_note' => $note,
            'reviewed_by' => Auth::id(),
            'reviewed_at' => date('Y-m-d H:i:s'),
        ];
    }
}
