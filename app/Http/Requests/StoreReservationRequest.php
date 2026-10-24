<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreReservationRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge([
            'user_id' => $this->input('user_id', $this->user()->user_id),
            'number_of_slots' => $this->input('number_of_slots', 1),
        ]);
    }

    /** A visitor books for themselves; staff encode bookings for a client. */
    public function authorize(): bool
    {
        return $this->user()->role !== 'user' || (int) $this->input('user_id') === $this->user()->user_id;
    }

    public function rules(): array
    {
        return [
            'lot_id' => ['required', 'integer', 'min:1'],
            'user_id' => ['required', 'integer', 'min:1'],
            'number_of_slots' => ['required', 'integer', 'min:1'],
            // Staff encode bookings taken on paper, which can be dated earlier.
            'reservation_date' => ['required', 'date_format:Y-m-d', Rule::when($this->user()->role === 'user', 'after_or_equal:today')],
            'purpose' => ['nullable', 'string', 'max:100'],
        ];
    }

    public function messages(): array
    {
        $required = 'lot_id, user_id, reservation_date and number_of_slots are required';

        return [
            'lot_id.*' => $required,
            'user_id.*' => $required,
            'number_of_slots.*' => $required,
            'reservation_date.required' => $required,
            'reservation_date.date_format' => 'reservation_date must be a date in YYYY-MM-DD format',
            'reservation_date.after_or_equal' => 'reservation_date cannot be in the past',
            'purpose.*' => 'purpose must be text of at most 100 characters',
        ];
    }
}
