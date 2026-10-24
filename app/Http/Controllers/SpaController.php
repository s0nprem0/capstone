<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Contracts\View\View;

class SpaController extends Controller
{
    /**
     * The SPA shell: the built bundle from public/dist when `pnpm build` has
     * run, otherwise the Vite dev server's entry.
     */
    public function __invoke(): View
    {
        $entry = null;
        $manifest = public_path('dist/.vite/manifest.json');
        if (is_file($manifest)) {
            $entry = json_decode((string) file_get_contents($manifest), true)['index.html'] ?? null;
        }

        return view('app', [
            'js' => $entry['file'] ?? null,
            'css' => $entry['css'][0] ?? null,
        ]);
    }
}
