<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['email' => strtolower((string) $this->input('email', ''))]);
    }

    public function rules(): array
    {
        return [
            'fullname' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email:filter', 'max:100', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:15'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ];
    }

    public function messages(): array
    {
        $required = 'fullname, email and password are required';

        return [
            'fullname.required' => $required,
            'email.required' => $required,
            'password.required' => $required,
            'email.email' => 'Invalid email address',
            'email.unique' => 'Email already registered',
            'password.min' => 'Password must be at least 8 characters',
            'password.confirmed' => 'Passwords do not match',
        ];
    }
}
