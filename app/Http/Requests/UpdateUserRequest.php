<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\NormalizesEmail;
use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * An account edit. A visitor edits their own registration; staff edit their
 * own account and visitors'; staff and admin accounts are an administrator's.
 * Checked before the rules, so the rules (an email already taken) tell nothing
 * about an account the caller may not edit. Which fields each role may change
 * is UserController's.
 */
class UpdateUserRequest extends FormRequest
{
    use NormalizesEmail;

    public function authorize(): Response
    {
        $actor = $this->user();
        $user = User::find((int) $this->route('id'));
        if ($user === null || $user->user_id === $actor->user_id) {
            return Response::allow();
        }
        return match ($actor->role) {
            'admin' => Response::allow(),
            'staff' => $user->role === 'user'
                ? Response::allow()
                : Response::deny('Staff and admin accounts can only be managed by an administrator'),
            default => Response::deny('Forbidden'),
        };
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('email')) {
            $this->merge(['email' => $this->normalizedEmail()]);
        }
    }

    public function rules(): array
    {
        return [
            'fullname' => ['sometimes', 'required', 'string', 'max:100'],
            'email' => [
                'sometimes', 'required', 'string', 'email:filter', 'max:100',
                Rule::unique('users', 'email')->ignore((int) $this->route('id'), 'user_id'),
            ],
            'phone' => ['nullable', 'string', 'max:15'],
            'status' => ['nullable', Rule::in(User::STATUSES)],
            'role' => ['nullable', Rule::in(User::ROLES)],
            'password' => ['nullable', 'string', 'min:8'],
            'current_password' => ['nullable', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'fullname.required' => 'fullname cannot be empty',
            'fullname.max' => 'fullname must be at most 100 characters',
            'fullname.string' => 'fullname cannot be empty',
            'email.unique' => 'Email already registered',
            'email.*' => 'Invalid email address',
            'phone.*' => 'phone must be at most 15 characters',
            'status.*' => 'Invalid status',
            'role.*' => 'Invalid role',
            'password.*' => 'Password must be at least 8 characters',
            'current_password.*' => 'Current password is incorrect',
        ];
    }
}
