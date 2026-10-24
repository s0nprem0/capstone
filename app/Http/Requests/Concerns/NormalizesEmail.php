<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

trait NormalizesEmail
{
    /** Emails compare lowercased; a non-string is left for the rules to reject. */
    protected function normalizedEmail(): mixed
    {
        $email = $this->input('email', '');
        return is_string($email) ? strtolower($email) : $email;
    }
}
