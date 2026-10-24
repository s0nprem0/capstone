<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Gzip the response when the client accepts it, at the application rather
 * than the web server: the map payload is ~1.1 MB of JSON that compresses
 * ~20x, and neither PHP's built-in server nor stock XAMPP compresses.
 * Downloads (the SQL backup) go out as they are, with their own length.
 */
class Compress
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($response instanceof BinaryFileResponse
            || $response instanceof StreamedResponse
            || $response->headers->has('Content-Encoding')
            || str_contains((string) $response->headers->get('Content-Disposition'), 'attachment')
            || !str_contains((string) $request->header('Accept-Encoding'), 'gzip')
            || !function_exists('gzencode')
        ) {
            return $response;
        }

        $content = $response->getContent();
        if ($content === false || $content === '') {
            return $response;
        }

        $response->setContent(gzencode($content, 6));
        $response->headers->set('Content-Encoding', 'gzip');
        $response->headers->set('Vary', 'Accept-Encoding', false);
        $response->headers->remove('Content-Length');

        return $response;
    }
}
