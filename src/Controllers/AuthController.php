<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Csrf;
use App\Core\RateLimiter;
use App\Core\Response;
use App\Core\Session;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\User;

class AuthController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function csrf(): void
    {
        Response::json(['csrf_token' => Csrf::token()]);
    }

    public function register(): void
    {
        $input = $this->router->input();

        $fullname = trim($input['fullname'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $phone = trim($input['phone'] ?? '');
        $password = $input['password'] ?? '';
        $confirm = $input['password_confirmation'] ?? '';

        if ($fullname === '' || $email === '' || $password === '') {
            Response::json(['error' => 'fullname, email and password are required'], 422);
            return;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['error' => 'Invalid email address'], 422);
            return;
        }

        if (strlen($password) < 8) {
            Response::json(['error' => 'Password must be at least 8 characters'], 422);
            return;
        }

        if ($password !== $confirm) {
            Response::json(['error' => 'Passwords do not match'], 422);
            return;
        }

        if (User::findByEmail($email)) {
            Response::json(['error' => 'Email already registered'], 422);
            return;
        }

        $userId = User::create([
            'fullname' => $fullname,
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'password' => password_hash($password, PASSWORD_BCRYPT),
            'role' => 'user',
            'status' => 'active',
        ]);

        AuditLog::record(null, 'register', 'users', $userId);

        Session::regenerate();
        Session::set('user_id', $userId);

        Response::json(['user' => User::publicUser(User::find($userId))], 201);
    }

    public function login(): void
    {
        $input = $this->router->input();
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');

        if (RateLimiter::blocked($ip)) {
            Response::json(['error' => 'Too many failed login attempts. Try again in 15 minutes.'], 429);
            return;
        }

        if (Auth::attempt($email, $password)) {
            RateLimiter::clear($ip);
            $userId = Auth::id();
            AuditLog::record($userId, 'login', 'users', $userId);
            Response::json(['user' => Auth::user()]);
            return;
        }

        RateLimiter::recordFailure($ip, $email);
        Response::json(['error' => 'Invalid credentials or inactive account'], 401);
    }

    public function logout(): void
    {
        $userId = Auth::id();
        if ($userId !== null) {
            AuditLog::record($userId, 'logout', 'users', $userId);
        }
        Auth::logout();
        Response::json(['message' => 'Logged out']);
    }

    public function me(): void
    {
        $user = Auth::user();
        if (!$user) {
            Response::json(['error' => 'Unauthenticated'], 401);
            return;
        }
        Response::json(['user' => $user]);
    }
}