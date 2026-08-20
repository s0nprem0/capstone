<?php

declare(strict_types=1);

namespace App\Core;

class Router
{
    private array $routes = [];

    public function get(string $path, callable $handler): self
    {
        $this->routes['GET'][$path] = $handler;
        return $this;
    }

    public function post(string $path, callable $handler): self
    {
        $this->routes['POST'][$path] = $handler;
        return $this;
    }

    public function dispatch(): void
    {
        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'POST' && !$this->isPublicRoute()) {
            $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
            if (!Csrf::validate($token)) {
                Response::json(['error' => 'Invalid CSRF token'], 419);
                return;
            }
        }

        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $uri = rtrim($uri, '/') ?: '/';

        if (isset($this->routes[$method][$uri])) {
            call_user_func($this->routes[$method][$uri]);
            return;
        }

        foreach ($this->routes[$method] ?? [] as $route => $handler) {
            $pattern = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $route);
            $pattern = '#^' . $pattern . '$#';

            if (preg_match($pattern, $uri, $matches)) {
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                call_user_func_array($handler, array_values($params));
                return;
            }
        }

        Response::json(['error' => 'Not Found'], 404);
    }

    private function isPublicRoute(): bool
    {
        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $uri = rtrim($uri, '/') ?: '/';
        return str_starts_with($uri, '/api/auth/login')
            || str_starts_with($uri, '/api/auth/register');
    }

    public function json(mixed $data, int $status = 200): void
    {
        Response::json($data, $status);
    }

    public function input(): array
    {
        $json = file_get_contents('php://input');
        return json_decode($json, true) ?? [];
    }
}
