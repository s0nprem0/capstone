<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Requests\Concerns\NormalizesEmail;
use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    use NormalizesEmail;

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => $this->normalizedEmail()]);
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
        ];
    }

    /** A blank form is a mistake, not a guess, so it is not counted against the account. */
    public function messages(): array
    {
        return [
            '*.required' => 'Enter your email and password.',
            '*.string' => 'Enter your email and password.',
        ];
    }
}
