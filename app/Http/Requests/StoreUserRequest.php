<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => strtolower((string) $this->input('email', '')),
            'role' => $this->input('role', 'user'),
            'status' => $this->input('status', 'active'),
        ]);
    }

    public function rules(): array
    {
        return [
            'role' => ['required', Rule::in(User::ROLES)],
            'status' => ['required', Rule::in(User::STATUSES)],
            'fullname' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email:filter', 'max:100', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:15'],
            'password' => ['required', 'string', 'min:8'],
        ];
    }

    public function messages(): array
    {
        $required = 'fullname, email and a password of at least 8 characters are required';

        return [
            'role.*' => 'Invalid role or status',
            'status.*' => 'Invalid role or status',
            'fullname.required' => $required,
            'email.required' => $required,
            'password.required' => $required,
            'password.min' => $required,
            'email.email' => 'Invalid email address',
            'email.unique' => 'Email already registered',
        ];
    }
}
