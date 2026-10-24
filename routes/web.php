<?php

use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

// Every page that is not the API is the React app, which routes in the browser.
Route::get('/{path?}', SpaController::class)->where('path', '^(?!api(?:/|$)).*');
