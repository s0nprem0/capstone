<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline security headers on every response (API, SPA and errors):
 * - nosniff: prevent MIME sniffing of responses
 * - frame-ancestors 'none' + X-Frame-Options: block clickjacking
 * - Referrer-Policy: don't leak the app origin's full URL to third parties
 * - Permissions-Policy: deny camera/mic/geolocation (Data Privacy Act)
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->add([
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy' => "frame-ancestors 'none'",
        ]);

        return $response;
    }
}
