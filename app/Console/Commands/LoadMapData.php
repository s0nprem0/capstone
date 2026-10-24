<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Support\Facades\DB;

/**
 * Loads the surveyed map: the 70 sections and the 6769 plots traced off the
 * plan in public/traces/survey-lines.png. Kept out of the migrations because it
 * is thousands of rows of surveyed geometry rather than a definition of the
 * database, and the plan can be re-traced without the schema moving.
 */
class LoadMapData extends LoadSqlFile
{
    protected $signature = 'map:load';

    protected $description = 'Load the surveyed sections and plots from database/survey/lots.sql';

    public function handle(): int
    {
        $this->components->info('Loading surveyed sections and plots...');

        $status = $this->loadFile('database/survey/lots.sql');

        if ($status === self::SUCCESS) {
            $this->components->info(sprintf(
                'Loaded %s sections and %s plots.',
                number_format(DB::table('cemetery_sections')->count()),
                number_format(DB::table('cemetery_lots')->count())
            ));
        }

        return $status;
    }
}
