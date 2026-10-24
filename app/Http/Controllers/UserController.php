<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
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

    /** Who may edit the account is UpdateUserRequest's; this is which fields. */
    public function update(UpdateUserRequest $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $user = User::findOrFail($id);
        $self = $user->user_id === $actor->user_id;
        $input = $request->validated();
        $data = array_intersect_key($input, array_flip(['fullname', 'email']));

        if (array_key_exists('phone', $input)) {
            $data['phone'] = ($input['phone'] ?? '') !== '' ? $input['phone'] : null;
        }
        if (isset($input['status'])) {
            if ($actor->role === 'user') {
                return $this->error('Users cannot change their account status', 403);
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
            if ($self) {
                return $this->error('You cannot change your own role');
            }
            $data['role'] = $input['role'];
        }
        if (($input['password'] ?? '') !== '') {
            if ($self && !Hash::check($input['current_password'] ?? '', $user->password)) {
                return $this->error('Current password is incorrect');
            }
            $data['password'] = $input['password'];
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
