<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\Reservation;
use App\Models\User;

class UserController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(): void
    {
        Auth::requireRole(['admin', 'staff']);
        $users = array_map(fn($u) => User::publicUser($u), User::search($_GET));
        Response::json($users);
    }

    public function show(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        $user = User::find($id);
        if (!$user) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json(User::publicUser($user));
    }

    public function store(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();

        $fullname = trim($input['fullname'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $role = $input['role'] ?? 'user';
        $status = $input['status'] ?? 'active';
        $password = $input['password'] ?? '';

        if (!in_array($role, ['admin', 'staff', 'user'], true) || !in_array($status, ['active', 'inactive'], true)) {
            Response::json(['error' => 'Invalid role or status'], 422);
            return;
        }

        if ($fullname === '' || $email === '' || strlen($password) < 8) {
            Response::json(['error' => 'fullname, email and a password of at least 8 characters are required'], 422);
            return;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['error' => 'Invalid email address'], 422);
            return;
        }

        if (User::findByEmail($email)) {
            Response::json(['error' => 'Email already registered'], 422);
            return;
        }

        $userId = User::create([
            'fullname' => $fullname,
            'email' => $email,
            'phone' => trim($input['phone'] ?? '') !== '' ? trim($input['phone']) : null,
            'password' => password_hash($password, PASSWORD_BCRYPT),
            'role' => $role,
            'status' => $status,
        ]);

        AuditLog::record(Auth::id(), 'create', 'users', $userId);
        Response::json(['user' => User::publicUser(User::find($userId))], 201);
    }

    public function update(int $id): void
    {
        $role = Auth::role();
        if ($role === null) {
            Response::json(['error' => 'Unauthenticated'], 401);
            return;
        }
        if (!in_array($role, ['admin', 'staff', 'user'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
            return;
        }

        $user = User::find($id);
        if (!$user) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $self = (int) $id === (int) Auth::id();
        if ($role === 'user' && !$self) {
            Response::json(['error' => 'Forbidden'], 403);
            return;
        }
        if ($role !== 'admin' && $user['role'] === 'admin') {
            Response::json(['error' => 'Admin accounts can only be managed by an administrator'], 403);
            return;
        }

        $input = $this->router->input();
        $data = [];

        if (isset($input['fullname'])) {
            $data['fullname'] = trim($input['fullname']);
        }
        if (isset($input['email'])) {
            $email = strtolower(trim($input['email']));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::json(['error' => 'Invalid email address'], 422);
                return;
            }
            $existing = User::findByEmail($email);
            if ($existing && (int) $existing['user_id'] !== $id) {
                Response::json(['error' => 'Email already registered'], 422);
                return;
            }
            $data['email'] = $email;
        }
        if (isset($input['phone'])) {
            $data['phone'] = trim($input['phone']) !== '' ? trim($input['phone']) : null;
        }
        if (isset($input['status'])) {
            if ($role === 'user') {
                Response::json(['error' => 'Users cannot change their account status'], 403);
                return;
            }
            if (!in_array($input['status'], ['active', 'inactive'], true)) {
                Response::json(['error' => 'Invalid status'], 422);
                return;
            }
            if ($self && $input['status'] === 'inactive') {
                Response::json(['error' => 'You cannot deactivate your own account'], 422);
                return;
            }
            $data['status'] = $input['status'];
        }
        if (isset($input['role'])) {
            if ($role === 'user') {
                Response::json(['error' => 'Users cannot change their role'], 403);
                return;
            }
            Auth::requireRole(['admin']);
            if (!in_array($input['role'], ['admin', 'staff', 'user'], true)) {
                Response::json(['error' => 'Invalid role'], 422);
                return;
            }
            if ($self && $input['role'] !== $user['role']) {
                Response::json(['error' => 'You cannot change your own role'], 422);
                return;
            }
            $data['role'] = $input['role'];
        }
        if (isset($input['password']) && $input['password'] !== '') {
            if ($self) {
                $current = (string) ($input['current_password'] ?? '');
                if (!User::verifyPassword($user, $current)) {
                    Response::json(['error' => 'Current password is incorrect'], 422);
                    return;
                }
            }
            if (strlen($input['password']) < 8) {
                Response::json(['error' => 'Password must be at least 8 characters'], 422);
                return;
            }
            $data['password'] = password_hash($input['password'], PASSWORD_BCRYPT);
        }

        if ($data !== []) {
            User::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'users', $id);
        }

        Response::json(['user' => User::publicUser(User::find($id))]);
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        if ($id === Auth::id()) {
            Response::json(['error' => 'You cannot delete your own account'], 422);
            return;
        }
        $user = User::find($id);
        if (!$user) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        if (Reservation::forUser($id) !== []) {
            Response::json(['error' => 'User has reservations; deactivate the account instead of deleting it'], 422);
            return;
        }
        User::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'users', $id);
        Response::json(['message' => 'Deleted']);
    }
}