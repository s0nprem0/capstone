<?php

declare(strict_types=1);

namespace App\Core;

class Headers
{
    /**
     * Send baseline security headers on every response (API + SPA + files).
     * - nosniff: prevent MIME sniffing of responses
     * - frame-ancestors 'none' + X-Frame-Options: block clickjacking
     * - Referrer-Policy: don't leak the app origin's full URL to third parties
     * - Permissions-Policy: deny camera/mic/geolocation (Data Privacy Act)
     *
     * Compression is opt-in per response so callers that set their own
     * Content-Length (the SQL backup download) can skip it.
     */
    public static function apply(bool $compress = true): void
    {
        self::security();
        if ($compress) {
            self::compress();
        }
    }

    public static function security(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header("Content-Security-Policy: frame-ancestors 'none'");
    }

    /**
     * Gzip the response when the client accepts it, at the application layer
     * rather than the web server's. The map payload is ~1.1 MB of JSON and
     * compresses ~20x, and XAMPP's Apache is not configured to compress, so
     * doing it here is what actually makes it small over the wire.
     *
     * ob_gzhandler sets Content-Encoding and passes the body through untouched
     * when the client did not ask for gzip, so this is safe for every client.
     */
    public static function compress(): void
    {
        static $started = false;
        if ($started) {
            return;
        }
        $started = true;

        if (headers_sent() || ini_get('zlib.output_compression') || !function_exists('ob_gzhandler')) {
            return;
        }

        $accept = $_SERVER['HTTP_ACCEPT_ENCODING'] ?? '';
        if (stripos($accept, 'gzip') === false) {
            return;
        }

        // ob_gzhandler sets Content-Encoding and Vary: Accept-Encoding itself.
        ob_start('ob_gzhandler');
    }
}
