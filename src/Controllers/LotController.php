<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Lot;
use App\Core\Router;

class LotController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(): void
    {
        $this->router->json(Lot::all());
    }

    public function show(int $id): void
    {
        $lot = Lot::find($id);
        if (!$lot) {
            $this->router->json(['error' => 'Not found'], 404);
            return;
        }
        $this->router->json($lot);
    }

    public function store(): void
    {
        $data = $this->router->input();
        $id = Lot::create($data);
        $this->router->json(['id' => $id, 'message' => 'Created'], 201);
    }

    public function update(int $id): void
    {
        $data = $this->router->input();
        $updated = Lot::update($id, $data);
        $this->router->json(['message' => $updated ? 'Updated' : 'Not found'], $updated ? 200 : 404);
    }

    public function destroy(int $id): void
    {
        $deleted = Lot::delete($id);
        $this->router->json(['message' => $deleted ? 'Deleted' : 'Not found'], $deleted ? 200 : 404);
    }
}
