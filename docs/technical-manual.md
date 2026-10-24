# Technical Manual

**Cemetery Reservation and Records Management System** — St. John Memorial
Garden & Parks.

For the end-user guide see [user-manual.md](user-manual.md); for the layered
diagram reconciled with the study see [architecture.md](architecture.md); for
the full security controls, privacy notes, and known risks see
[security.md](security.md).

---

## 1. Overview

A Laravel 12 REST backend with a React single-page front end, in MVC form:
Models are Eloquent, Views are the React pages, Controllers hold the request
logic. Laravel serves the JSON API under `/api` and the SPA shell for every
other path from one entry point.

| Layer | Technology |
| --- | --- |
| Backend | Laravel 12 on PHP ≥ 8.2, `declare(strict_types=1)`, PSR-4 `App\`, Eloquent over PDO |
| Database | MySQL 8.0, `utf8mb4`, schema authoritative in the migrations (`database/migrations`) |
| Frontend | React 18 SPA, Vite, pnpm (`pnpm@10.4.1`), `react-router-dom` v7, no TypeScript |
| Styling | Hand-written CSS in `resources/css/app.css` |
| Map | Pure SVG (traced survey layout + lot `<rect>`s); no Leaflet, no tiles |
| Dev environment | Docker/podman-compose (php, node, mysql) + Makefile |
| Tests | PHPUnit 11 unit and feature suite against a `cemetery_test` database |

## 2. Architecture

Six layers — see [architecture.md](architecture.md) for the diagram. Summary:

- **Presentation (React SPA, in the browser).** Page views under
  `resources/js/pages`, shared components under `resources/js/components`, the
  SVG map renderer, and the client runtime (`react-router-dom`, `AuthContext`,
  `lib/api.js`) that owns routing, session state, role guards, the CSRF header,
  and the `/api/map` cache. No business rules live here.
- **Entry point.** `public/index.php` boots Laravel. `routes/api.php` answers
  `/api/*`; `routes/web.php` returns the SPA shell (`resources/views/app.blade.php`,
  pointing at the built bundle in `public/dist` or the Vite dev server) for
  every other path.
- **Middleware** (`bootstrap/app.php`). Every response gets the security
  headers and gzip. The `api` group adds the encrypted session cookie, the CSRF
  check on POST, the sweep that expires unpaid holds, and the ETag/304
  conditional GET. Each route then carries `role:` middleware for RBAC.
  Every API error renders as `{"error": "..."}`.
- **Routing.** REST convention: `GET` list, `GET {id}`, `POST` create,
  `POST {id}` update, `POST {id}/delete` delete; `{id}` must be digits.
- **Models.** Eloquent models (`app/Models`), one per table, with the list
  queries (`search`, `detailed`, `withDetails`) and domain rules
  (`Lot::releaseIfFree`, `Payment::recomputeStatus`,
  `Reservation::expireStale`). All values are bound.
- **Validation.** Form Requests (`app/Http/Requests`) or `$request->validate()`
  for field rules; checks that depend on the database or the caller stay in
  the controller.
- **Views → API only.** The SPA calls `/api/*` and never the database.
  Authorization is enforced server-side regardless of the client-side guards.

## 3. Repository layout

```
public/index.php         Laravel entry point
app/
  Http/Controllers/      Request logic (auth, users, reservations, burials, …)
  Http/Middleware/       EnsureRole, VerifyCsrfToken, SecurityHeaders, Compress,
                         ExpireStaleReservations
  Http/Requests/         Form Request validation
  Models/                Eloquent models (data layer)
  Services/              DatabaseBackup (export, statement allowlist, restore)
  Support/               Dates, Svg, LoginThrottle, Tally
  Console/Commands/      map:verify
  Providers/             active-users auth provider, Secure-cookie detection
bootstrap/app.php        Middleware groups and JSON error rendering
config/                  Laravel config; cemetery.php holds reservation limits
routes/                  api.php (JSON API), web.php (SPA shell), console.php
database/migrations/     Authoritative schema
database/seeders/        Admin account + the 66 numbered survey sections
database/upgrades/       SQL upgrades for databases built before the migrations
database/survey/lots.sql Surveyed plots (loaded by `make map-data`)
database/demo.sql        Demo dataset (loaded by `make demo`)
resources/js/            React SPA (context, components, pages, lib, map)
resources/css/app.css    All styling
docs/                    This manual, the user manual, the architecture diagram
resources/views/         app.blade.php, the SPA shell
storage/                 Sessions, cache, logs (git-ignored contents)
tests/                   PHPUnit: Unit/ and Feature/
Dockerfile, docker/node.Dockerfile, docker/mysql/init.sql, docker-compose.yml, Makefile
```

## 4. Configuration

Configuration is read from real environment variables and the `.env` file at
the project root; real variables win, so compose's `DB_*` take precedence.
`make install` creates `.env` from `.env.example` and generates `APP_KEY`.

| Variable | Purpose | Example |
| --- | --- | --- |
| `DB_HOST` | MySQL host | `mysql` (compose) / `127.0.0.1` (XAMPP) |
| `DB_PORT` | MySQL port | `3306` |
| `DB_DATABASE` | Database name | `cemetery_db` |
| `DB_USERNAME` | MySQL user | `cemetery_user` |
| `DB_PASSWORD` | MySQL password | `secret` |
| `APP_KEY` | Encrypts and signs the session cookie; generate with `php artisan key:generate`, keep secret | `base64:…` |
| `APP_TIMEZONE` | Cemetery time zone for PHP and each MySQL connection: "today" in date checks, `created_at`, audit and notification times | `Asia/Manila` |
| `RESERVATION_MAX_PENDING` | Pending requests one visitor may hold at once; `0` = no limit | `3` |
| `RESERVATION_HOLD_DAYS` | Days an unpaid pending request holds its plot before it expires (checked on every API request); `0` = never | `7` |
| `APP_ENV`, `APP_DEBUG` | Laravel's environment and debug flags. API errors are always generic (details go to `storage/logs`); debug only affects non-API error pages. Use `production` / `false` when deployed | `local`, `true` |
| `SESSION_LIFETIME` | Idle minutes before a session expires | `120` |
| `SESSION_DRIVER`, `CACHE_STORE` | Kept on `file`, so a backup restore never touches sessions or cache | `file` |

Templates: `.env.example` (Docker/standalone) and `.env.xampp.example` (XAMPP).
`.env` is git-ignored; a fresh clone has none.

## 5. Running the system

### Containerized (Docker or podman-compose)

```bash
make setup      # up + install (.env, APP_KEY) + migrate + map-data
make demo       # optional: demo accounts and data
make build      # build the frontend into public/dist
```

Open http://localhost:8000 (the built app and the API). The Vite dev server on
http://localhost:5173 is optional and only for editing; it proxies `/api` to Laravel.
MySQL is on 3306, phpMyAdmin on 8080.

Common targets: `up`, `down`, `logs`, `install`, `build`, `migrate`, `upgrade`,
`map-data`, `demo`, `test`, `fresh`, `verify-map`, `php`, `node`, `mysql`. Under a bare
`podman-compose` install use `make DC="podman-compose" …` (see README).

### XAMPP (Apache + MySQL + PHP)

Place the project under `htdocs`, copy `.env.xampp.example` to `.env`, run
`composer install` and `php artisan key:generate`, create the `cemetery_db`
database and run `php artisan migrate --seed`, import
`database/survey/lots.sql`, then `pnpm install` and `pnpm build`. `storage/` and
`bootstrap/cache/` must be writable by Apache. Apache rewrites all requests into `public/`
via the root and `public/.htaccess`. Hot-reload dev: `XAMPP=1 pnpm dev`.

## 6. Database

Database `cemetery_db`, engine InnoDB, charset `utf8mb4`. The migrations are
authoritative: `make migrate` (`php artisan migrate:fresh --seed`) drops and
recreates every table and seeds the admin account and sections, so it
reproduces the whole database. Schema changes ship as new migrations, applied
to a database in use with `make upgrade` (`php artisan migrate`).

A database built from the pre-Laravel `schema.sql` is adopted as it is: the
first migration finds every table already present and records itself as run
without touching them. Apply any `database/upgrades/*.sql` the database is
missing first (`make upgrade FILE=...`); a database with only some of the
tables is refused.

### Tables

**users** — accounts and roles.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | INT UNSIGNED PK | auto-increment |
| `fullname` | VARCHAR(100) | indexed |
| `email` | VARCHAR(100) | unique, indexed |
| `phone` | VARCHAR(15) | nullable |
| `password` | VARCHAR(255) | bcrypt hash (`hashed` cast) |
| `role` | ENUM(admin, staff, user) | default `user` |
| `status` | ENUM(active, inactive) | default `active` |
| `created_at` | DATETIME | default now |

**cemetery_sections** — sections (rows of plots).

| Column | Type | Notes |
| --- | --- | --- |
| `section_id` | INT UNSIGNED PK | |
| `section_name` | VARCHAR(50) | |
| `location` | VARCHAR(100) | nullable |
| `description` | TEXT | nullable |
| `svg_viewbox` | VARCHAR(50) | crop region `x y w h` |
| `svg_image` | VARCHAR(255) | trace background path |
| `svg_points` | VARCHAR(1024) | outline polygon `"x y x y …"` |
| `section_number` | SMALLINT UNSIGNED | unique, plan's number |
| `is_locked` | TINYINT(1) | freezes outline + lot geometry |

**cemetery_lots** — plots.

| Column | Type | Notes |
| --- | --- | --- |
| `lot_id` | INT UNSIGNED PK | |
| `lot_code` | VARCHAR(20) | unique, e.g. `S9-060` |
| `section_id` | INT UNSIGNED | FK → sections (cascade delete) |
| `block` | VARCHAR(10) | nullable |
| `lot_type` | ENUM(single, double, family) | default `single` |
| `price` | DECIMAL(10,2) | nullable |
| `status` | ENUM(available, reserved, occupied) | indexed |
| `latitude`, `longitude` | DECIMAL | nullable (unused by the SVG map) |
| `svg_x`,`svg_y`,`svg_w`,`svg_h` | DECIMAL(6,2) | map geometry, 2-dp |
| `description` | TEXT | nullable |

**reservations** — plot reservations.

| Column | Type | Notes |
| --- | --- | --- |
| `reservation_id` | INT UNSIGNED PK | |
| `user_id` | INT UNSIGNED | FK → users |
| `lot_id` | INT UNSIGNED | FK → lots |
| `reservation_date` | DATE | indexed |
| `purpose` | VARCHAR(100) | nullable |
| `number_of_slots` | INT UNSIGNED | ≤ lot capacity |
| `total_amount` | DECIMAL(10,2) | stated value |
| `approved_status` | ENUM(pending, approved, rejected, cancelled) | default `pending`; `cancelled` = withdrawn by the client |
| `payment_status` | ENUM(unpaid, partial, paid) | derived from payments; default `unpaid` |
| `created_at` | DATETIME | |

**payments** — money recorded against a reservation.

| Column | Type | Notes |
| --- | --- | --- |
| `payment_id` | INT UNSIGNED PK | |
| `reservation_id` | INT UNSIGNED | FK → reservations (cascade delete) |
| `amount` | DECIMAL(10,2) | must be > 0 |
| `method` | ENUM(cash, gcash, bank_transfer, cheque, other) | default `cash` |
| `reference_no` | VARCHAR(50) | nullable |
| `payment_date` | DATE | indexed |
| `notes` | VARCHAR(255) | nullable |
| `recorded_by` | INT UNSIGNED | FK → users (set null on delete) |
| `created_at` | DATETIME | |

**burial_records** — interments.

| Column | Type | Notes |
| --- | --- | --- |
| `burial_id` | INT UNSIGNED PK | |
| `deceased_fullname` | VARCHAR(255) | indexed |
| `date_of_birth`, `date_of_death` | DATE | nullable |
| `burial_date` | DATE | indexed |
| `lot_id` | INT UNSIGNED | FK → lots |
| `burial_type` | ENUM(single, double, family, cremation) | |
| `next_of_kin_name` | VARCHAR(100) | nullable |
| `next_of_kin_phone` | VARCHAR(15) | nullable |
| `interment_status` | ENUM(scheduled, interred) | default `scheduled` |
| `created_at` | DATETIME | |

**lot_owners** — plots sold at the office rather than online: `owner_id`,
`lot_id` (FK, RESTRICT), `plot` (sub-plot, e.g. `A`), `owner_name` (as the
sales book writes it, co-owners separated by `/`), `payment_terms`
ENUM(`cash`,`installment`,`F`), `notes`, `created_at`. Staff/admin only; an
owner keeps the plot `occupied`.

**notifications** — per-user messages: `notification_id`, `user_id` (FK),
`message`, `type` ENUM(`reservation`,`system`), `is_read`, `created_at`.

**audit_logs** — activity trail: `log_id`, `user_id` (FK, null = system),
`action`, `table_name`, `record_id`, `created_at`.

**login_attempts** — brute-force limiter: `attempt_id`, `ip_address`, `email`,
`attempted_at`, indexed on (IP, time) and (email, time).

### Integrity rules enforced in code

- A plot is `occupied` once its reservation is approved, or when a burial record
  claims it; `reserved` while a pending reservation holds it; `available` only
  when nothing live touches it.
- Reserving locks the row (`SELECT … FOR UPDATE`) inside a transaction, so two
  requests cannot both claim a plot.
- Approving a reservation moves the plot `reserved → occupied`; rejecting,
  cancelling or deleting one returns the plot unless a burial already claims it.
- A client can cancel only their own pending reservation, and only while no
  payment is recorded against it; staff and admins are notified.
- `number_of_slots` cannot exceed the plot type's capacity (single 1 / double 2 /
  family 4).
- A burial record requires a `reserved` or `occupied` plot.
- A recorded owner (`lot_owners`) holds a plot `occupied` like a burial: the
  release after a rejected/deleted reservation leaves it alone, and it cannot
  be set back to available by hand. Removing the last owner releases it.

## 7. API reference

Base path `/api`. JSON in and out. Mutating requests need a CSRF token (see
§8). Access is enforced server-side on every route.

| Method & path | Access | Notes |
| --- | --- | --- |
| `GET /api/map` | Public | All sections + lots with SVG geometry and status counts |
| `GET /api/csrf-token` | Public | Returns `{ csrf_token }` |
| `POST /api/auth/register` | Public | Creates a `user`; signs them in |
| `POST /api/auth/login` | Public | Rate-limited → 429 after 5 failures per account (20 per IP) / 15 min |
| `POST /api/auth/logout` | Auth | Ends the session |
| `GET /api/auth/me` | Auth | Current user |
| `GET /api/users`, `GET /api/users/{id}` | admin, staff | Public fields only |
| `POST /api/users` | admin | Create account |
| `POST /api/users/{id}` | admin, staff, user (self) | Update; role/status rules per §8 |
| `POST /api/users/{id}/delete` | admin | Blocked if the user has reservations |
| `GET /api/reservations` | admin, staff | Search/filter via query |
| `GET /api/reservations/mine` | user | Own reservations only |
| `GET /api/reservations/{id}` | Auth | Own, or staff/admin |
| `POST /api/reservations` | user, staff, admin | Create; claims the plot transactionally |
| `POST /api/reservations/{id}` | admin, staff | Update date/purpose/slots/amount |
| `POST /api/reservations/{id}/approve` \| `/reject` | admin, staff | Pending only; reject takes an optional `reason` (≤ 150 chars) sent to the client |
| `POST /api/reservations/{id}/cancel` | user (own) | Pending and unpaid only |
| `POST /api/reservations/{id}/delete` | admin, staff | Releases the plot |
| `GET /api/payments` | admin, staff | List; filter by `reservation_id`, `q`, `method`, `from`, `to` |
| `GET /api/payments/mine` | Auth | A visitor's own payments |
| `GET /api/payments/{id}` | admin, staff | |
| `POST /api/payments` | admin, staff | Record a payment; recomputes `payment_status` |
| `POST /api/payments/{id}` | admin, staff | Update; recomputes `payment_status` |
| `POST /api/payments/{id}/delete` | admin | Recomputes `payment_status` |
| `GET /api/burial-records`, `GET /api/burial-records/{id}` | admin, staff | |
| `POST /api/burial-records` | admin, staff | Requires reserved/occupied plot |
| `POST /api/burial-records/{id}` | admin, staff | Update |
| `POST /api/burial-records/{id}/delete` | admin | |
| `GET /api/lots/{id}/owners` | admin, staff | Recorded owners of a plot |
| `POST /api/lots/{id}/owners` | admin, staff | Record an owner; refused if an online reservation holds the plot |
| `POST /api/lot-owners/{id}` | admin, staff | Update |
| `POST /api/lot-owners/{id}/delete` | admin | Releases the plot if nothing else holds it |
| `GET /api/notifications` | Auth | `{ notifications, unread_count }` |
| `GET /api/notifications/unread-count` | Auth | `{ unread_count }` (lightweight badge poll) |
| `POST /api/notifications/{id}/read` \| `/read-all` | Auth | |
| `GET /api/stats/dashboard` | admin, staff | Dashboard figures |
| `GET /api/reports/{reservations,burial-records,availability,payments,audit-logs,summary}` | admin, staff | See §9 |
| `GET /api/lots` | Public | Paginated (`limit` ≤ 1000, default 200; `offset`) |
| `GET /api/lots/available` | Public | Paginated as above |
| `GET /api/lots/{id}` | Public | Single lot |
| `POST /api/lots` | admin | Create (server allocates `lot_code` if omitted) |
| `POST /api/lots/import-grid` | admin | Bulk create from a lot array |
| `POST /api/lots/regrid` | admin | Reflow a section's lots into a grid |
| `POST /api/lots/{id}` | admin, staff | Update geometry/fields (blocked if section locked) |
| `POST /api/lots/{id}/delete` | admin | Blocked if reservations/burials refer to it |
| `GET /api/sections`, `GET /api/sections/{id}` | admin, staff | With counts |
| `POST /api/sections` | admin | |
| `POST /api/sections/{id}` | admin | Outline edits blocked while locked |
| `POST /api/sections/{id}/delete` | admin | Empty, unlocked sections only |
| `GET /api/backup/export` | admin | SQL dump download, audit-logged |
| `POST /api/backup/import` | admin | Restore from uploaded/`php://input` SQL |
| `GET /api/backup/summary` | admin | Record counts; last backup/restore/reset times |
| `POST /api/backup/reset` | admin | `{ password, confirm: "RESET" }`; clears transactional records, keeps accounts, plots and the audit log |

**Status codes.** `200` ok · `201` created · `304` not modified (conditional GET)
· `401` unauthenticated · `403` forbidden · `404` not found (also a non-numeric
`{id}`) · `405` method not allowed ·
`409` conflict (locked section, lot in use) · `419` invalid CSRF · `422`
validation error · `429` rate-limited · `500` server error.

## 8. Authentication, authorization, security

The authoritative guide, including the full permission matrix, personal-data
inventory, deployment checklist, and accepted risks, is
[security.md](security.md). Summary:

- **Passwords** are hashed with bcrypt (`Hash`, the `User` model's `hashed`
  cast) and checked by `Auth::attempt()`; the minimum length is 8 characters.
- **Sessions** are Laravel file sessions behind an encrypted cookie with
  `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when the request is HTTPS, and
  a browser-session lifetime, expiring after `SESSION_LIFETIME` idle minutes.
  The session id is regenerated on login/register; logout invalidates the
  session. Only active accounts resolve (`active-users` auth provider).
- **CSRF** — an `X-CSRF-Token` header is required on every `POST` except
  login/register. Invalid or missing → `419`. The client keeps the token in
  memory (never `localStorage`) and retries once automatically on `419`.
- **RBAC** — `role:` middleware on every route in `routes/api.php`, not just
  the UI. Only admins create accounts, change roles, delete accounts, delete
  burial records and payments, manage sections/lots beyond updates, and use
  backup/restore; staff may edit non-admin accounts and activate/deactivate
  them, but cannot manage `admin` accounts; a visitor may edit only their own
  profile. Nobody may change their own role, deactivate their own account, or
  delete themselves. A visitor can read only their own reservation; `mine`
  endpoints filter by the signed-in user's id.
- **Rate limiting** — 5 failed logins per account from one IP, or 20 per IP,
  per 15 minutes (`login_attempts`), then `429`. Blank fields are a `422` and
  are not counted; registration and public search are not throttled.
- **Input validation & uniqueness** — server-side, per endpoint (unique email,
  unique `lot_code`, valid dates/enums, capacity, coordinates). All SQL is
  parameterized with emulated prepares disabled.
- **Security headers** (`SecurityHeaders` middleware): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`; plus `Vary:
  Accept-Encoding` when compressing. HSTS and a script/style CSP are not set.
  JSON `GET` responses add `Cache-Control: private, no-cache` and an `ETag`.
  Laravel's default CORS middleware is removed; the API is same-origin only.
- **Audit trail** — `audit_logs` records registration, logins, logouts, and
  every create/update/approve/reject/cancel/delete, plus lot/section imports, regrids,
  and backup export/import. The report is readable by **staff and admins**.
- **Public read endpoints** — `/api/map`, `/api/lots*`, `/api/memorials` (and
  `/api/lots/{id}/memorials`) require no session. The map includes reserved and
  occupied plot statuses; the memorial search returns deceased name, date of
  death, and plot/section for interred records (see
  [security.md §12](security.md#12-personal-data-and-the-data-privacy-act-of-2012)).

## 9. Reports

`ReportController` computes each report per request:

- **reservations** — counts by status + up to 1000 rows.
- **burial-records** — counts by interment status + up to 1000 rows.
- **availability** — counts by lot status + up to 2000 rows (only the rendered
  columns); the page discloses "showing the first N of M" when capped.
- **payments** — total, count, this-month total, totals by method, + up to 1000
  rows.
- **audit-logs** — up to 200 most recent entries, plus the total; takes the
  optional `from` / `to` range below.
- **summary** — what the Reports page shows for a period: reservations received
  (by `created_at`) by approval status with their value, payments collected (by
  `payment_date`) by method, interments (by `burial_date`) by status, and plot
  availability now, overall and by section.

`from` and `to` are optional, inclusive `YYYY-MM-DD` dates; a malformed date or
`from` after `to` answers 422 rather than falling back to all time. A DATETIME
column is bounded by the start of the day after `to`, so all of that day counts.

Reports are not stored. The Reports page prints the period summary; the full
lists print and export as CSV from the Reservations, Payments and Burial Records
pages (`ExportActions`), keeping the page's filters. The CSV writer
(`resources/js/lib/csv.js`) writes a UTF-8 BOM for Excel, plain numbers and
`YYYY-MM-DD` dates, and prefixes any cell starting with `= + - @` with `'` so a
spreadsheet never runs user-entered text as a formula.

## 10. Cemetery map subsystem

- The map base is a traced survey SVG; `public/traces` holds the source.
- **Map data** comes from `GET /api/map`: every section plus its lots with
  `svg_x/y/w/h`, status, price, and the section outline (`svg_points`).
- **Rendering** (`CemeterySvgMap.jsx`): one `<rect>` per plot (class + `data-lot-id`
  on the rect), labels drawn only for the focused section, pan/zoom via the SVG
  `viewBox`. Colours come from the status palette; the legend and text labels
  mean colour is never the only signal.
- **Editors** — `SectionEditor` draws the section outline (`svg_points`);
  `LotEditor` places/moves/resizes plots and supports grid reflow and CSV
  import. Geometry is validated (`svgCoord`, point-in-polygon).
- **Geometry check** — `php artisan map:verify` (or `make verify-map`) asserts every
  plot's centre lies inside its section outline, no two plots overlap, and
  nothing falls outside the overall viewBox.

## 11. Performance characteristics

- JSON and HTML are **gzip-compressed** at the application layer
  (`Compress` middleware), which matters because neither the PHP dev server
  nor stock XAMPP compresses; `/api/map` drops from ~1.1 MB to ~55 KB.
- `GET` JSON responses carry an **`ETag`** and revalidate with an empty `304`.
- The SPA caches `GET /api/map` per session (`lib/api.js`) and clears it on any
  successful mutation.
- Pages are **lazy-loaded** per route; the entry bundle does not include the
  admin editors.
- `opcache` is enabled for the built-in PHP server.
- `/api/map` reads its ~6,800 plots with the query builder rather than Eloquent
  models, which keeps it as fast as before the move to Laravel (~80 ms).

## 12. Backup and restore

`BackupController`, with the SQL work in `App\Services\DatabaseBackup`:

- **Export** (`GET /api/backup/export`, admin) streams `DROP TABLE` + `CREATE
  TABLE` + `INSERT` for every table, wrapped in `SET FOREIGN_KEY_CHECKS=0/1`.
- **Import** (`POST /api/backup/import`, admin) reads an uploaded file or raw
  body, splits it into statements while honouring quotes and comments, checks
  each against the shapes the export writes, skips `audit_logs`, and executes
  them, playing a pre-restore dump back if one fails. Capped at 50 MB.
- **Reset** (`POST /api/backup/reset`, admin) deletes `payments`,
  `notifications`, `burial_records`, `lot_owners`, `reservations` and
  `login_attempts` and sets every lot `available`, in one transaction (row
  deletes, unlike a restore's DDL, can roll back). Needs the admin's password
  and `confirm: "RESET"`.

The migrations remain the authoritative definition — a fresh `make migrate`
reproduces the schema and seed regardless of any backup. A backup includes the
`migrations` table, so a restored database knows which migrations it has.

## 13. Build and verification

```bash
make build       # vite build -> public/dist (must pass)
make test        # PHPUnit unit + feature suite (cemetery_test database)
make verify-map  # surveyed-plot geometry check
```

Recommended before a demo/release:

- `make migrate && make map-data && make demo && make build` from a clean state,
- http://localhost:8000 loads with styling,
- an accessibility scan (axe-core) and a keyboard walk of the main screens.

## 14. Known deviations and maintenance notes

- **Payment is recorded manually.** There is no online gateway; `payments` rows
  are entered by staff/admin. `reservations.payment_status` is derived and
  stored via `Payment::recomputeStatus`, so recompute it whenever a payment
  changes or a reservation's `total_amount` changes.
- **External services: none.** Fonts are vendored, the map uses no tiles, and
  payment is manual, so the app makes no outbound requests.
- `users.role` is the three-value enum `admin/staff/user`; keep it aligned with
  the `role:` middleware in `routes/api.php`.
- The migrations stay authoritative; add a migration before building a feature
  so a fresh migrate reproduces the database.
- The test suite refuses to run against any database but `cemetery_test`
  (`tests/TestCase.php`); keep that guard.
