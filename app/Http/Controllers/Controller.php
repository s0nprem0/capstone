<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

abstract class Controller
{
    protected function error(string $message, int $status = 422, array $extra = []): JsonResponse
    {
        return response()->json(['error' => $message] + $extra, $status);
    }
}
