<?php

use App\Http\Middleware\Compress;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\ExpireStaleReservations;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\VerifyCsrfToken;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append([SecurityHeaders::class, Compress::class]);

        // Blank strings stay blank: several updates read "" as "clear this
        // field", which null would turn into "leave it alone".
        $middleware->remove(\Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull::class);

        // The SPA is served from the same origin as the API, so no other site
        // is meant to call it; Laravel's default CORS would allow any origin.
        $middleware->remove(\Illuminate\Http\Middleware\HandleCors::class);

        // The SPA authenticates with the session cookie and sends the CSRF
        // token from /api/csrf-token on every POST, so the API is stateful.
        $middleware->group('api', [
            EncryptCookies::class,
            AddQueuedCookiesToResponse::class,
            StartSession::class,
            VerifyCsrfToken::class,
            SubstituteBindings::class,
            ExpireStaleReservations::class,
            // A conditional GET: repeat loads of the ~1.1 MB map revalidate
            // with an empty 304. Private and no-cache, since every response is
            // per-user and the browser must check before reusing it.
            'cache.headers:private;no_cache;etag',
        ]);

        $middleware->alias(['role' => EnsureRole::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*'));

        // Every API error is {"error": "..."}, the one shape the SPA reads.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (!$request->is('api/*') || $e instanceof HttpResponseException) {
                return null;
            }

            // Handlers see the exception after Laravel has mapped it to HTTP
            // (a missing model to a 404, a denied gate to a 403), so the
            // original is the previous one.
            $previous = $e->getPrevious();
            [$status, $message] = match (true) {
                $e instanceof ValidationException => [422, $e->validator->errors()->first()],
                $previous instanceof TokenMismatchException => [419, 'Invalid CSRF token'],
                $previous instanceof ModelNotFoundException => [404, 'Not found'],
                $previous instanceof AuthorizationException => [403, $previous->response()?->message() ?? 'Forbidden'],
                $e instanceof NotFoundHttpException => [404, 'Not Found'],
                $e instanceof MethodNotAllowedHttpException => [405, 'Method Not Allowed'],
                $e instanceof HttpExceptionInterface => [$e->getStatusCode(), $e->getMessage() ?: SymfonyResponse::$statusTexts[$e->getStatusCode()] ?? 'Error'],
                default => [500, 'Internal server error'],
            };

            return response()->json(['error' => $message], $status);
        });
    })->create();
