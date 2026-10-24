<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\AuditLog;
use App\Models\User;
use App\Support\LoginThrottle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function csrf(): JsonResponse
    {
        return response()->json(['csrf_token' => csrf_token()]);
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = User::create([
            'fullname' => $data['fullname'],
            'email' => $data['email'],
            'phone' => ($data['phone'] ?? '') !== '' ? $data['phone'] : null,
            'password' => $data['password'],
            'role' => 'user',
            'status' => 'active',
        ]);

        AuditLog::record(null, 'register', 'users', $user->user_id);

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json(['user' => $user->fresh()], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $email = $request->validated('email');
        $password = $request->validated('password');
        $ip = (string) $request->ip();

        if (LoginThrottle::blocked($ip, $email)) {
            return $this->error(
                'Too many failed sign-in attempts. Wait '.LoginThrottle::WINDOW_MINUTES
                    .' minutes, then try again, or ask the cemetery office to reset your password.',
                429
            );
        }

        // Only active accounts are found (the active-users provider).
        if (Auth::attempt(['email' => $email, 'password' => $password])) {
            $request->session()->regenerate();
            LoginThrottle::clear($ip, $email);
            AuditLog::record(Auth::id(), 'login', 'users', Auth::id());
            return response()->json(['user' => Auth::user()]);
        }

        LoginThrottle::recordFailure($ip, $email);
        // login_attempts is cleared on the next success, so the lasting record
        // of a failed sign-in is here.
        AuditLog::record(null, 'login_failed', 'users', null, ['email' => mb_substr($email, 0, 100)]);

        // Only someone who knows the password learns the account is switched
        // off, so this says nothing to a guesser that "incorrect" would not.
        $user = User::query()->where('email', $email)->first();
        if ($user && $user->status !== 'active' && Hash::check($password, $user->password)) {
            return $this->error('This account has been deactivated. Contact the cemetery office to restore it.', 403);
        }

        $left = LoginThrottle::remaining($ip, $email);
        $error = 'Incorrect email or password.';
        if ($left === 0) {
            $error .= ' Sign-in for this account is paused for '.LoginThrottle::WINDOW_MINUTES.' minutes.';
        } elseif ($left <= 2) {
            $error .= " {$left} ".($left === 1 ? 'attempt' : 'attempts').' left before sign-in is paused for '
                .LoginThrottle::WINDOW_MINUTES.' minutes.';
        }
        return $this->error($error, 401);
    }

    public function logout(Request $request): JsonResponse
    {
        if (Auth::check()) {
            AuditLog::record(Auth::id(), 'logout', 'users', Auth::id());
            Auth::logout();
        }
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()]);
    }
}
