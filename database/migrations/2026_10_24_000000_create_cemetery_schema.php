<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The whole database as the study's ERD defines it, plus the tables the build
 * added (payments, lot_owners, login_attempts). Later changes ship as their
 * own migrations rather than edits to this one.
 */
return new class extends Migration
{
    private const TABLES = [
        'users', 'cemetery_sections', 'cemetery_lots', 'reservations', 'payments',
        'burial_records', 'notifications', 'audit_logs', 'login_attempts', 'lot_owners',
    ];

    public function up(): void
    {
        // A database built from the old schema.sql (with its upgrades applied)
        // already has every table: adopt it as it is, keeping its records.
        $existing = array_filter(self::TABLES, fn (string $table) => Schema::hasTable($table));
        if (count($existing) === count(self::TABLES)) {
            return;
        }
        if ($existing !== []) {
            throw new RuntimeException(
                'The database has some cemetery tables but not all of them ('.implode(', ', $existing).'). '
                .'Restore a backup or drop them before migrating.'
            );
        }

        Schema::create('users', function (Blueprint $table) {
            $table->increments('user_id');
            $table->string('fullname', 100);
            $table->string('email', 100);
            $table->string('phone', 15)->nullable();
            $table->string('password', 255);
            $table->enum('role', ['admin', 'staff', 'user'])->default('user');
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->dateTime('created_at')->useCurrent();
            $table->unique('email', 'uq_users_email');
            $table->index('fullname', 'idx_users_fullname');
            $table->index('email', 'idx_users_email');
        });

        Schema::create('cemetery_sections', function (Blueprint $table) {
            $table->increments('section_id');
            $table->string('section_name', 50);
            $table->string('location', 100)->nullable();
            $table->text('description')->nullable();
            $table->string('svg_viewbox', 50)->default('0 0 4096 3072')->comment('SVG crop region (x y w h) in map space');
            $table->string('svg_image', 255)->nullable()->comment('trace background image path');
            $table->string('svg_points', 1024)->nullable()->comment('SVG polygon outline "x y x y ..." in map space (drawn with the section editor)');
            $table->unsignedSmallInteger('section_number')->nullable()->comment('number printed on the survey plan; NULL until the section is placed on the plan');
            $table->boolean('is_locked')->default(false)->comment('Freezes the outline and lot geometry until unlocked');
            $table->unique('section_number', 'uq_section_number');
        });

        Schema::create('cemetery_lots', function (Blueprint $table) {
            $table->increments('lot_id');
            $table->string('lot_code', 20);
            $table->unsignedInteger('section_id');
            $table->string('block', 10)->nullable();
            $table->enum('lot_type', ['single', 'double', 'family'])->default('single');
            $table->decimal('price', 10, 2)->nullable();
            $table->enum('status', ['available', 'reserved', 'occupied'])->default('available');
            $table->decimal('latitude', 10, 8)->nullable();
            $table->decimal('longitude', 11, 8)->nullable();
            // Two decimals because surveyed lots are scaled out of the trace's
            // 4096-wide canvas. At the survey's pitch a plot is only about 7 map
            // units across, so whole units would move it by a seventh of its width.
            $table->decimal('svg_x', 6, 2)->default(0);
            $table->decimal('svg_y', 6, 2)->default(0);
            $table->decimal('svg_w', 6, 2)->default(40);
            $table->decimal('svg_h', 6, 2)->default(40);
            $table->string('svg_points', 512)->nullable()->comment('Outline "x y x y ..." of a plot that is not an upright rectangle (tilted perimeter rows, plots cut by a diagonal walk); svg_x..svg_h is then its bounding box');
            $table->text('description')->nullable();
            $table->foreign('section_id')->references('section_id')->on('cemetery_sections')->cascadeOnDelete();
            $table->unique('lot_code', 'uq_lot_code');
            $table->index('status', 'idx_lots_status');
            $table->index(['section_id', 'svg_x', 'svg_y'], 'idx_lots_svg');
        });

        Schema::create('reservations', function (Blueprint $table) {
            $table->increments('reservation_id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('lot_id');
            $table->date('reservation_date');
            $table->string('purpose', 100)->nullable();
            $table->unsignedInteger('number_of_slots')->default(1);
            $table->decimal('total_amount', 10, 2)->default(0);
            // 'cancelled' is the client withdrawing a pending request themselves;
            // 'rejected' is the office declining it (or the hold expiring).
            $table->enum('approved_status', ['pending', 'approved', 'rejected', 'cancelled'])->default('pending');
            // Derived from the payments recorded against the reservation
            // (Payment::recomputeStatus), stored so lists and reports need no subquery.
            $table->enum('payment_status', ['unpaid', 'partial', 'paid'])->default('unpaid');
            $table->dateTime('created_at')->useCurrent();
            $table->foreign('user_id')->references('user_id')->on('users')->cascadeOnDelete();
            $table->foreign('lot_id')->references('lot_id')->on('cemetery_lots')->cascadeOnDelete();
            $table->index('user_id', 'idx_reservations_user');
            $table->index('lot_id', 'idx_reservations_lot');
            $table->index('reservation_date', 'idx_reservations_date');
            $table->index(['approved_status', 'created_at'], 'idx_reservations_status_created');
        });

        // Money recorded against a reservation; no online gateway. RESTRICT: a
        // reservation with payments cannot be deleted, so money records are never
        // lost as a side effect.
        Schema::create('payments', function (Blueprint $table) {
            $table->increments('payment_id');
            $table->unsignedInteger('reservation_id');
            $table->decimal('amount', 10, 2);
            $table->enum('method', ['cash', 'gcash', 'bank_transfer', 'cheque', 'other'])->default('cash');
            $table->string('reference_no', 50)->nullable();
            $table->date('payment_date');
            $table->string('notes', 255)->nullable();
            $table->unsignedInteger('recorded_by')->nullable();
            $table->dateTime('created_at')->useCurrent();
            $table->foreign('reservation_id')->references('reservation_id')->on('reservations')->restrictOnDelete();
            $table->foreign('recorded_by')->references('user_id')->on('users')->nullOnDelete();
            $table->index('reservation_id', 'idx_payments_reservation');
            $table->index('payment_date', 'idx_payments_date');
        });

        Schema::create('burial_records', function (Blueprint $table) {
            $table->increments('burial_id');
            $table->string('deceased_fullname', 255);
            $table->date('date_of_birth')->nullable();
            $table->date('date_of_death')->nullable();
            $table->date('burial_date');
            $table->unsignedInteger('lot_id');
            $table->enum('burial_type', ['single', 'double', 'family', 'cremation'])->default('single');
            $table->string('next_of_kin_name', 100)->nullable();
            $table->string('next_of_kin_phone', 15)->nullable();
            $table->enum('interment_status', ['scheduled', 'interred'])->default('scheduled');
            $table->dateTime('created_at')->useCurrent();
            $table->foreign('lot_id')->references('lot_id')->on('cemetery_lots')->cascadeOnDelete();
            $table->index('deceased_fullname', 'idx_burials_deceased');
            $table->index('burial_date', 'idx_burials_date');
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->increments('notification_id');
            $table->unsignedInteger('user_id');
            $table->string('message', 255);
            $table->enum('type', ['reservation', 'system'])->default('system');
            // The reservation a notice is about, so it can link there. Kept when
            // the reservation goes: the notice stays readable, without the link.
            $table->unsignedInteger('reservation_id')->nullable();
            $table->boolean('is_read')->default(false);
            $table->dateTime('created_at')->useCurrent();
            $table->foreign('user_id')->references('user_id')->on('users')->cascadeOnDelete();
            $table->foreign('reservation_id')->references('reservation_id')->on('reservations')->nullOnDelete();
            $table->index('user_id', 'idx_notifications_user');
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->increments('log_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->string('action', 100);
            $table->string('table_name', 50);
            $table->unsignedInteger('record_id')->nullable();
            // Where the request came from, and what it did: changed fields as
            // old/new pairs, or the identifying fields of a created or deleted
            // row. Password hashes are never written here (AuditLog::MASKED).
            $table->string('ip_address', 45)->nullable();
            $table->json('details')->nullable();
            $table->dateTime('created_at')->useCurrent();
            $table->foreign('user_id')->references('user_id')->on('users')->nullOnDelete();
            $table->index('user_id', 'idx_audit_user');
            $table->index('action', 'idx_audit_action');
        });

        Schema::create('login_attempts', function (Blueprint $table) {
            $table->increments('attempt_id');
            $table->string('ip_address', 45);
            $table->string('email', 100)->nullable();
            $table->dateTime('attempted_at')->useCurrent();
            $table->index(['ip_address', 'attempted_at'], 'idx_attempts_ip_time');
            $table->index(['email', 'attempted_at'], 'idx_attempts_email_time');
        });

        // Who holds a plot sold outside the online reservations: the office's
        // paper sales, encoded from the sales book. Only the name as the book
        // writes it; these owners have no account. `plot` is the sub-plot of a
        // multi-plot lot ("A", "B-C"). RESTRICT: an owned plot cannot be deleted.
        Schema::create('lot_owners', function (Blueprint $table) {
            $table->increments('owner_id');
            $table->unsignedInteger('lot_id');
            $table->string('plot', 10)->nullable();
            $table->string('owner_name', 255);
            $table->enum('payment_terms', ['cash', 'installment', 'F'])->nullable();
            $table->string('notes', 500)->nullable();
            $table->dateTime('created_at')->useCurrent();
            $table->foreign('lot_id')->references('lot_id')->on('cemetery_lots')->restrictOnDelete();
            $table->index('lot_id', 'idx_lot_owners_lot');
            $table->index('owner_name', 'idx_lot_owners_name');
        });
    }

    public function down(): void
    {
        Schema::disableForeignKeyConstraints();
        foreach (array_reverse(self::TABLES) as $table) {
            Schema::dropIfExists($table);
        }
        Schema::enableForeignKeyConstraints();
    }
};
