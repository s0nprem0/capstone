<?php

declare(strict_types=1);

namespace App\Console\Commands;

/**
 * Loads the demo dataset: fake clients, reservations, payments, burials and
 * the history behind them. Run after map:load, which resets the plots.
 */
class LoadDemoData extends LoadSqlFile
{
    protected $signature = 'demo:load';

    protected $description = 'Load the demo dataset from database/demo.sql';

    public function handle(): int
    {
        $this->components->info('Loading the demo dataset...');

        $status = $this->loadFile('database/demo.sql');

        if ($status === self::SUCCESS) {
            $this->components->info('Demo dataset loaded.');
        }

        return $status;
    }
}
