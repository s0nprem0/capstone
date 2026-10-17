<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

use Dotenv\Dotenv;

// The file is optional: the container sets DB_* as real environment variables,
// which Dotenv (immutable) does not overwrite. Loading only when present lets a
// fresh clone run from the compose environment without a hand-made .env, while
// `required()` still fails loudly when neither source supplies the values.
$dotenv = Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

$dotenv->required(['DB_HOST', 'DB_DATABASE', 'DB_USERNAME']);
