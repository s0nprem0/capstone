<?php

declare(strict_types=1);

/*
 * Stages the handwritten-ledger transcription for review:
 *
 *   make ledger-import            (or: php tools/ledger_import.php [ledger dir])
 *
 * Reads the transcribers' CSVs (database/ledger/BRIEF.md) and loads each line
 * into ledger_rows, matched to its surveyed plot where the block number says
 * which (Block 5 lot 1 = S5-001). Nothing becomes a record here: staff review
 * the rows on the Ledger review page and approve them one by one or in bulk.
 *
 *   bookN/batchK_owners.csv, bookN/batchK_burials.csv   the transcription
 *   old/sections.csv, old/owners.csv, old/burials.csv   the first, keyed by block
 *
 * Safe to re-run: a line already staged (same transcribed fields) is skipped,
 * and rows a reviewer has touched are never changed.
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\Models\LedgerRow;

$dir = rtrim($argv[1] ?? dirname(__DIR__) . '/database/ledger', '/');
if (!is_dir($dir)) {
    fwrite(STDERR, "No ledger directory at {$dir}\n");
    exit(1);
}

/** @return list<array<string, string>> rows keyed by the header line */
function readCsv(string $file): array
{
    $handle = fopen($file, 'r');
    $header = fgetcsv($handle, null, ',', '"', '');
    $rows = [];
    while (($line = fgetcsv($handle, null, ',', '"', '')) !== false) {
        if ($line === [null]) {
            continue;
        }
        $rows[] = array_combine($header, array_pad(array_slice($line, 0, count($header)), count($header), ''));
    }
    fclose($handle);
    return $rows;
}

function blank(?string $value, int $max): ?string
{
    $value = trim((string) $value);
    return $value === '' ? null : mb_substr($value, 0, $max);
}

/** Stage a file's lines; print what happened to them. */
function stageFile(string $file, string $kind, string $book, callable $blockOf): void
{
    $staged = $already = $unmatched = $undated = $skipped = 0;
    foreach (readCsv($file) as $line) {
        $name = blank($line[$kind === 'owner' ? 'owner' : 'deceased'] ?? '', 255);
        $block = blank($blockOf($line), 120);
        $lot = blank($line['lot'] ?? '', 20);
        if ($name === null || $block === null || $lot === null) {
            $skipped++;
            continue;
        }
        $dateText = $kind === 'burial' ? blank($line['date'] ?? '', 50) : null;
        $row = [
            'kind' => $kind,
            'book' => $book,
            'photo' => blank($line['photo'] ?? '', 50),
            'block_label' => $block,
            'lot' => $lot,
            'plot' => blank($line['plot'] ?? '', 10),
            'name' => $name,
            'terms' => $kind === 'owner' ? blank($line['terms'] ?? '', 20) : null,
            'date_text' => $dateText,
            'burial_date' => $kind === 'burial' ? LedgerRow::parseDate($dateText) : null,
            'notes' => blank($line['notes'] ?? '', 500),
            'doubt' => blank($line['check'] ?? '', 500),
            'lot_id' => LedgerRow::matchLot($block, $lot),
        ];
        if (!LedgerRow::stage($row)) {
            $already++;
            continue;
        }
        $staged++;
        $unmatched += $row['lot_id'] === null ? 1 : 0;
        $undated += $kind === 'burial' && $row['burial_date'] === null ? 1 : 0;
    }
    printf(
        "%-48s %4d staged  %4d already staged  %4d no plot match  %4d no readable date  %3d blank\n",
        substr($file, strlen(dirname($file, 2)) + 1),
        $staged, $already, $unmatched, $undated, $skipped
    );
}

foreach (glob("{$dir}/book*", GLOB_ONLYDIR) as $bookDir) {
    $book = preg_replace('/\D/', '', basename($bookDir));
    foreach (['owners' => 'owner', 'burials' => 'burial'] as $suffix => $kind) {
        foreach (glob("{$bookDir}/batch*_{$suffix}.csv") as $file) {
            stageFile($file, $kind, $book, fn(array $line) => $line['block_label'] ?? '');
        }
    }
}

// The first transcription keys each row by a block code (B5, RCN) that
// sections.csv names.
if (is_file("{$dir}/old/sections.csv")) {
    $names = [];
    foreach (readCsv("{$dir}/old/sections.csv") as $section) {
        $names[$section['key']] = $section['name'];
    }
    foreach (['owners' => 'owner', 'burials' => 'burial'] as $suffix => $kind) {
        if (is_file("{$dir}/old/{$suffix}.csv")) {
            stageFile("{$dir}/old/{$suffix}.csv", $kind, 'old', fn(array $line) => $names[$line['key'] ?? ''] ?? '');
        }
    }
}
