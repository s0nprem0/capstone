<?php

declare(strict_types=1);

namespace App\Core;

class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        $body = json_encode($data);

        // A conditional GET so repeat loads of the big map payload revalidate
        // with an empty 304 body instead of re-sending ~1.1 MB. Private and
        // no-cache: every response is per-user, and the browser must check
        // before reusing it.
        if ($body !== false && $status === 200 && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
            $etag = '"' . md5($body) . '"';
            header('Cache-Control: private, no-cache');
            header('ETag: ' . $etag);
            if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
                Headers::security();
                http_response_code(304);
                return;
            }
        }

        Headers::apply();
        http_response_code($status);
        header('Content-Type: application/json');
        echo $body === false ? 'null' : $body;
    }
}
