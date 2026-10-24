<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Loads one of the SQL data files into the app's own database connection, so
 * the load uses DB_* from .env instead of a hard-coded mysql client call.
 */
abstract class LoadSqlFile extends Command
{
    protected function loadFile(string $path): int
    {
        $full = base_path($path);

        if (!is_file($full)) {
            $this->components->error("SQL file not found: {$path}");

            return self::FAILURE;
        }

        $sql = (string) file_get_contents($full);

        // The files can also be sourced into a plain `mysql` client, where they
        // name the database. The app connection already has one, and a USE could
        // only point it somewhere else.
        $sql = preg_replace('/^\s*USE\s+`?\w+`?\s*;\s*$/mi', '', $sql) ?? $sql;

        DB::unprepared($sql);

        return self::SUCCESS;
    }
}
