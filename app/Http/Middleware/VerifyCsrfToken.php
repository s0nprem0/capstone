<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;

/**
 * The SPA reads its token from /api/csrf-token and sends it as X-CSRF-Token,
 * so the XSRF-TOKEN cookie is not needed. Sign-in and registration are open:
 * there is no session to protect yet.
 */
class VerifyCsrfToken extends ValidateCsrfToken
{
    protected $addHttpCookie = false;

    protected $except = [
        'api/auth/login',
        'api/auth/register',
    ];
}
