<?php

declare(strict_types=1);

namespace App\Core;

class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        Headers::apply();
        http_response_code($status);
        header('Content-Type: application/json');
        echo json_encode($data);
    }
}