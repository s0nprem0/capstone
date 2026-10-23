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

        // A blank form is a mistake, not a guess, so it is not counted.
        if ($email === '' || !is_string($password) || $password === '') {
            Response::json(['error' => 'Enter your email and password.'], 422);
            return;
        }

        if (RateLimiter::blocked($ip, $email)) {
            Response::json([
                'error' => 'Too many failed sign-in attempts. Wait ' . RateLimiter::WINDOW_MINUTES
                    . ' minutes, then try again, or ask the cemetery office to reset your password.',
            ], 429);
            return;
        }

        if (Auth::attempt($email, $password)) {
            RateLimiter::clear($ip, $email);
            $userId = Auth::id();
            AuditLog::record($userId, 'login', 'users', $userId);
            Response::json(['user' => Auth::user()]);
            return;
        }

        RateLimiter::recordFailure($ip, $email);
        // login_attempts is cleared on the next success, so the lasting record
        // of a failed sign-in is here.
        AuditLog::record(null, 'login_failed', 'users', null, ['email' => mb_substr($email, 0, 100)]);

        // Only someone who knows the password learns the account is switched
        // off, so this says nothing to a guesser that "incorrect" would not.
        $user = User::findByEmail($email);
        if ($user && $user['status'] !== 'active' && User::verifyPassword($user, $password)) {
            Response::json(['error' => 'This account has been deactivated. Contact the cemetery office to restore it.'], 403);
            return;
        }

        $left = RateLimiter::remaining($ip, $email);
        $error = 'Incorrect email or password.';
        if ($left === 0) {
            $error .= ' Sign-in for this account is paused for ' . RateLimiter::WINDOW_MINUTES . ' minutes.';
        } elseif ($left <= 2) {
            $error .= " {$left} " . ($left === 1 ? 'attempt' : 'attempts') . ' left before sign-in is paused for '
                . RateLimiter::WINDOW_MINUTES . ' minutes.';
        }
        Response::json(['error' => $error], 401);
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