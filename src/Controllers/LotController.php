<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Router;
use App\Models\AuditLog;
use App\Models\Lot;

class LotController
{
    private Router $router;

    public function __construct(Router $router)
    {
        $this->router = $router;
    }

    public function index(): void
    {
        Response::json(Lot::all());
    }

    public function available(): void
    {
        Response::json(Lot::available());
    }

    public function show(int $id): void
    {
        $lot = Lot::find($id);
        if (!$lot) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Response::json($lot);
    }

    public function store(): void
    {
        Auth::requireRole(['admin']);
        $input = $this->router->input();

        $required = ['lot_code', 'section_id', 'price'];
        foreach ($required as $field) {
            if (($input[$field] ?? '') === '') {
                Response::json(['error' => "$field is required"], 422);
                return;
            }
        }

        $id = Lot::create([
            'lot_code' => $input['lot_code'],
            'section_id' => (int) $input['section_id'],
            'block' => $input['block'] ?? null,
            'lot_type' => $input['lot_type'] ?? 'single',
            'price' => (float) $input['price'],
            'status' => $input['status'] ?? 'available',
            'description' => $input['description'] ?? null,
        ]);

        AuditLog::record(Auth::id(), 'create', 'cemetery_lots', $id);
        Response::json(Lot::find($id), 201);
    }

    public function update(int $id): void
    {
        Auth::requireRole(['admin', 'staff']);
        if (!Lot::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }

        $input = $this->router->input();
        $data = array_intersect_key($input, array_flip([
            'lot_code', 'section_id', 'block', 'lot_type', 'price', 'status', 'description',
        ]));

        if ($data !== []) {
            Lot::update($id, $data);
            AuditLog::record(Auth::id(), 'update', 'cemetery_lots', $id);
        }

        Response::json(Lot::find($id));
    }

    public function destroy(int $id): void
    {
        Auth::requireRole(['admin']);
        if (!Lot::find($id)) {
            Response::json(['error' => 'Not found'], 404);
            return;
        }
        Lot::delete($id);
        AuditLog::record(Auth::id(), 'delete', 'cemetery_lots', $id);
        Response::json(['message' => 'Deleted']);
    }
}