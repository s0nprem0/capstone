<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Only active accounts sign in or stay signed in: a deactivated account
        // resolves to no one, so its open sessions stop on their next request
        // instead of lasting until the browser closes.
        Auth::provider('active-users', fn ($app, array $config) => (new EloquentUserProvider($app['hash'], $config['model']))
            ->withQuery(fn (Builder $query) => $query->where('status', 'active')));

        // The session cookie is Secure whenever the request came over HTTPS,
        // unless SESSION_SECURE_COOKIE says otherwise.
        if (config('session.secure') === null && !$this->app->runningInConsole()) {
            config(['session.secure' => $this->app['request']->isSecure()]);
        }
    }
}
