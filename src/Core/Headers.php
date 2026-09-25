<?php

declare(strict_types=1);

namespace App\Core;

class Headers
{
    /**
     * Send baseline security headers on every response (API + SPA + files).
     * - nosniff: prevent MIME sniffing (e.g. uploaded PDFs / receipts)
     * - frame-ancestors 'none' + X-Frame-Options: block clickjacking
     * - Referrer-Policy: don't leak the app origin's full URL to third parties
     * - Permissions-Policy: deny camera/mic/geolocation (Data Privacy Act)
     */
    public static function apply(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header("Content-Security-Policy: frame-ancestors 'none'");
    }
}