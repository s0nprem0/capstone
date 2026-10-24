<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(User::search($request->query())->get());
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(User::findOrFail($id));
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = User::create([
            'fullname' => $data['fullname'],
            'email' => $data['email'],
            'phone' => ($data['phone'] ?? '') !== '' ? $data['phone'] : null,
            'password' => $data['password'],
            'role' => $data['role'],
            'status' => $data['status'],
        ]);

        AuditLog::record(Auth::id(), 'create', 'users', $user->user_id, AuditLog::snapshot($data, ['email', 'role', 'status']));
        return response()->json(['user' => $user->fresh()], 201);
    }

    /**
     * A visitor edits their own registration; staff edit their own account and
     * visitors'; staff and admin accounts, roles, and status of the caller's
     * own account are an administrator's.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $user = User::findOrFail($id);

        $self = $user->user_id === $actor->user_id;
        if ($actor->role === 'user' && !$self) {
            return $this->error('Forbidden', 403);
        }
        if ($actor->role === 'staff' && !$self && $user->role !== 'user') {
            return $this->error('Staff and admin accounts can only be managed by an administrator', 403);
        }

        $input = $request->all();
        $data = [];

        if (isset($input['fullname'])) {
            $fullname = trim((string) $input['fullname']);
            if ($fullname === '') {
                return $this->error('fullname cannot be empty');
            }
            $data['fullname'] = $fullname;
        }
        if (isset($input['email'])) {
            $email = strtolower(trim((string) $input['email']));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $this->error('Invalid email address');
            }
            if (User::query()->where('email', $email)->where('user_id', '<>', $id)->exists()) {
                return $this->error('Email already registered');
            }
            $data['email'] = $email;
        }
        if (isset($input['phone'])) {
            $data['phone'] = trim((string) $input['phone']) !== '' ? trim((string) $input['phone']) : null;
        }
        if (isset($input['status'])) {
            if ($actor->role === 'user') {
                return $this->error('Users cannot change their account status', 403);
            }
            if (!in_array($input['status'], User::STATUSES, true)) {
                return $this->error('Invalid status');
            }
            if ($self && $input['status'] === 'inactive') {
                return $this->error('You cannot deactivate your own account');
            }
            $data['status'] = $input['status'];
        }
        if (isset($input['role']) && $input['role'] !== $user->role) {
            if ($actor->role === 'user') {
                return $this->error('Users cannot change their role', 403);
            }
            if ($actor->role !== 'admin') {
                return $this->error('Forbidden', 403);
            }
            if (!in_array($input['role'], User::ROLES, true)) {
                return $this->error('Invalid role');
            }
            if ($self) {
                return $this->error('You cannot change your own role');
            }
            $data['role'] = $input['role'];
        }
        if (isset($input['password']) && $input['password'] !== '') {
            if ($self && !Hash::check((string) ($input['current_password'] ?? ''), $user->password)) {
                return $this->error('Current password is incorrect');
            }
            if (strlen((string) $input['password']) < 8) {
                return $this->error('Password must be at least 8 characters');
            }
            $data['password'] = (string) $input['password'];
        }

        if ($data !== []) {
            $before = $user->getAttributes();
            $user->update($data);
            AuditLog::record(Auth::id(), 'update', 'users', $id, AuditLog::changes($before, $data));
        }

        return response()->json(['user' => $user->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        if ($id === Auth::id()) {
            return $this->error('You cannot delete your own account');
        }
        $user = User::findOrFail($id);
        if ($user->reservations()->exists()) {
            return $this->error('User has reservations; deactivate the account instead of deleting it');
        }
        $user->delete();
        AuditLog::record(Auth::id(), 'delete', 'users', $id, AuditLog::snapshot($user->getAttributes(), ['fullname', 'email', 'role']));
        return response()->json(['message' => 'Deleted']);
    }
}
