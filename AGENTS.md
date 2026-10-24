# AGENTS.md — Web-Based Cemetery Reservation and Records Management System

Project guide for the **Cemetery Reservation and Records Management System** for St. John Memorial Garden & Parks. This is a capstone study project. Most modules are implemented end-to-end (see "Current state" below); the remaining ones are built out module-by-module against the system described here.

## Project overview
- Laravel 12 backend (PHP >= 8.2): Eloquent models, controllers, Form Requests, route middleware. It replaced the earlier plain-PHP custom MVC, keeping the same `/api` contract.
- React 18 SPA + Vite (pnpm) frontend, `react-router-dom` v7.
- MySQL 8.0, `utf8mb4`. Schema is authoritative in the Laravel migrations (`database/migrations/`).
- Containerized dev environment (PHP, Node, MySQL) via `docker-compose.yml` + Makefile.
- Leaflet.js + OpenStreetMap replaced by a pure SVG digital map (traced layout + grid lot boxes, no map tiles).

## Tech stack (mandatory)
- Backend: Laravel 12, PHP >= 8.2, Eloquent / query builder with bound values only (no value concatenation into SQL, raw fragments are fixed strings), `declare(strict_types=1)`, PSR-4 `App\` → `app/`.
- Database: MySQL 8.0, `utf8mb4`.
- Frontend: React 18 SPA + Vite, pnpm, `react-router-dom` v7. Styling in `resources/css/app.css`. No TypeScript.
- Mapping: pure SVG digital map (traced layout paths + grid lot `<rect>`s, rendered client-side; no Leaflet, no tiles).
- Client-side storage: localStorage (drafts / non-sensitive), sessionStorage (active auth flags), JSON (API interchange). No sensitive data in localStorage.
- Containerization: `docker-compose.yml` (php:8000 via `php artisan serve`, node:5173, mysql:3306) + Makefile workflow.
- Tests: PHPUnit (`tests/Unit`, `tests/Feature`) against the `cemetery_test` database (`make test`).

## Architecture
- Six layers: user access (browser) → presentation (React SPA) → application (Laravel controllers + API) → data (MySQL) → external services (none) → infrastructure.
- Client-Server + MVC: Models = data layer, Views = React pages, Controllers = request logic.
- Single entry point `public/index.php` (Laravel): `routes/api.php` serves the JSON API under `/api`; `routes/web.php` serves the SPA shell (`resources/views/app.blade.php`, built Vite bundle or dev server) for all other paths.
- `bootstrap/app.php` defines the `api` middleware group (session, CSRF, hold-expiry sweep, ETag), the global security headers and gzip, the `role` middleware alias, and renders every API error as `{"error": "..."}`.
- The presentation layer is browser-only (`resources/js/`): page views, shared components, the SVG map renderer, and the client runtime (router, `AuthContext`, `lib/api.js`). It holds no business rules and calls only `/api/*`.
- The study's layered architecture diagram is reproduced and reconciled with the build in `docs/architecture.md`: it adds the Administrator actor and the Presentation Layer the diagram omits, and matches the diagram's Payment Monitoring module (now implemented).

## Project structure
```
├── public/index.php          # Laravel entry point
├── app/
│   ├── Http/Controllers/     # Request logic (auth, lots, reservations, burials, reports, backup, ...)
│   ├── Http/Middleware/      # EnsureRole (RBAC), VerifyCsrfToken, SecurityHeaders, Compress, ExpireStaleReservations
│   ├── Http/Requests/        # Form Request validation
│   ├── Models/               # Eloquent models (data layer)
│   ├── Services/             # DatabaseBackup
│   ├── Support/              # Dates, Svg, LoginThrottle, Tally
│   └── Console/Commands/     # map:verify
├── bootstrap/app.php         # Middleware groups, exception rendering
├── config/                   # Laravel config + cemetery.php (reservation limits)
├── routes/                   # api.php, web.php, console.php (reservations:expire)
├── database/
│   ├── migrations/           # Authoritative schema
│   ├── seeders/              # Admin account + survey sections
│   └── upgrades/             # SQL upgrades for pre-Laravel databases only
├── resources/
│   ├── js/                   # React SPA (contexts, components, pages/)
│   ├── css/app.css           # All styling
│   └── views/app.blade.php   # SPA shell
├── tests/                    # PHPUnit Unit/ + Feature/
├── Dockerfile                # PHP 8.3-cli + composer, php artisan serve
├── docker/node.Dockerfile    # Node 22 + pnpm
├── docker-compose.yml        # php / node / mysql services
├── Makefile                  # up, down, install, build, migrate, fresh, ...
├── package.json              # packageManager pinned to pnpm@10.4.1
├── .npmrc                    # allows esbuild build script (pnpm 10+)
└── pnpm-lock.yaml            # committed for frozen installs
```

## Getting started
```bash
make up        # docker compose up -d
make install   # .env + APP_KEY, composer install + pnpm install (in containers)
make migrate   # php artisan migrate:fresh --seed (drops every table)
make map-data  # apply database/survey/lots.sql (70 surveyed sections, 6769 plots)
make demo      # apply database/demo.sql (demo clients, reservations, burials)
```
- React dev server: http://localhost:5173 (proxies `/api` to PHP)
- Laravel (php artisan serve): http://localhost:8000
- MySQL: localhost:3306 (db `cemetery_db`)

## Current state
Implemented end-to-end (API + React page + server-side RBAC on every route):

- Auth/RBAC — register, login, logout, session auth with CSRF, roles `admin` / `staff` / `user`, login rate limiting
- Sections & lots — CRUD, SVG grid import, and a lot map editor
- SVG cemetery map — traced layout, pan/zoom/fly-to, status colouring, reserve-from-map
- Reservations — submission, admin/staff approval restricted to pending rows, transactional lot claim; approval is what moves a lot from `reserved` to `occupied`, and rejecting or deleting one returns the plot only when no other pending/approved reservation or burial record holds it; a reservation with payments cannot be deleted; a visitor may hold `RESERVATION_MAX_PENDING` (3) pending requests, and an unpaid pending request expires after `RESERVATION_HOLD_DAYS` (7)
- Payments — manual recording (cash / GCash / bank transfer / cheque / other) against a reservation, with a derived `reservations.payment_status` (`unpaid` / `partial` / `paid`); recording a payment does not gate approval; staff/admin record, a visitor sees their own payments; revenue stat on the dashboard and a payments report. No online gateway
- Burial records (capped at the lot's capacity, cremations excepted; recording one marks the lot `occupied`), notifications, debounced search/filters, reports, dashboards, audit trail
- Lot ownership — `lot_owners` for plots sold at the office (paper sales), staff/admin only (owner names are never public); shown and edited in the map's plot panel; an owner holds the plot `occupied` like a burial does; removing one is admin-only. The office's handwritten sales book is migrated by staff encoding it through Burial Records and the Owners panel (the study's data-migration step); there is no ledger import or ledger module, and `database/ledger/` (local transcription notes and photos, personal data) stays gitignored
- Backup/restore — admin-only SQL export/import, audit-logged; import accepts only the export's own statements, never touches `audit_logs`, and plays back a pre-restore dump if it fails partway

Payments were re-added on request (they had been cut after the early sprints). `reservations.payment_status` is derived from the `payments` rows via `Payment::recomputeStatus` and stored, so it must be recomputed whenever a payment changes or a reservation's `total_amount` changes.

Still open: Documents, concession terms beyond ownership (expiry, transfers), record-level notes and expiration tracking, responsive layout polish. Add a migration per the "Data model" section below before building them; the migrations stay authoritative, so a fresh `make migrate` must reproduce the whole database.

The backend moved from plain PHP to Laravel 12 with the API contract unchanged (routes, roles, JSON shapes, status codes, error messages, session cookie + `X-CSRF-Token`); the one visible difference is that a non-numeric `{id}` answers 404 instead of 400. The SPA needed no changes.

## Roles & permissions (RBAC) — from the study
- **Administrator** (`admin`): everything — manage user/staff accounts, roles, permissions, access levels; approve/reject reservations; manage sections and lots; generate reports; backup/restore; view audit logs.
- **Staff** (`staff`): process reservations, manage burial records and payments, manage visitor accounts (view/update/status; staff and admin accounts are admin-only), generate reports including the audit log.
- **Visitor/Client** (`user`): register, log in, view public cemetery map, make reservations, track reservation status, manage their registration info.
- **Public** (not logged in): view the cemetery map and plot statuses (available/reserved/occupied) and search interred memorials; must log in to reserve. No owner or next-of-kin details are exposed.

`users.role` must become `ENUM('admin','staff','user')` (client).

## Data model (extend through new migrations)
The current schema uses `users` / `cemetery_sections` / `cemetery_lots` / `reservations` / `payments` / `burial_records` / `notifications` / `audit_logs` / `login_attempts`, aligned to the study's ERD:
- `users.role` → `ENUM('admin','staff','user')`; `users.password` → `VARCHAR(255)` (for `password_hash()`).
- ERD tables/columns as designed: `users` (fullname, email, phone, role, status), `cemetery_sections`, `cemetery_lots` (lot_code, section_id, block, lot_type, price, status), `reservations` (user_id, lot_id, reservation_date, purpose, number_of_slots, total_amount, approved_status, payment_status), `audit_logs` (user_id, action, table_name, record_id).
- `payments` table: `reservation_id` FK, `amount`, `method` (`cash` | `gcash` | `bank_transfer` | `cheque` | `other`), `reference_no`, `payment_date`, `notes`, `recorded_by` FK, `created_at`.
- `burial_records` table: deceased full name, DOB, DOD, burial date, `lot_id` FK, burial type, owner/next-of-kin contact, interment status, `created_at`.
- `notifications` table: `user_id` FK, message, type (`reservation` | `system`), `is_read`, `created_at`.
- Indexes on searchable columns (fullname/name, dates, lot_code).
- `reservations.total_amount` and `cemetery_lots.price` record the stated value of the booking; `reservations.payment_status` summarises the payments recorded against it.

## API design
RESTful JSON under `/api`, consistent with Router conventions (GET list, GET `{id}`, POST create, POST `{id}` update, POST `{id}/delete`). To add:
- `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `/api/burial-records` CRUD
- `/api/reservations/{id}/approve`, `/api/reservations/{id}/reject`, `/api/reservations/{id}/cancel` (the client's own pending, unpaid request)
- `/api/payments` CRUD (`mine` for a visitor's own), staff/admin records
- `/api/notifications` (mine, mark read)
- `/api/reports/*` (reservations, burial-records, availability, payments, audit-logs, summary; `summary` and `audit-logs` take an optional `from`/`to` date range)
- `/api/backup/export`, `/api/backup/import`
- `/api/stats/dashboard`
- `/api/map` (sections + lots with SVG grid coordinates and status)

Always respond with proper HTTP status codes; validate inputs server-side; never trust client input; RBAC enforced on every route, not just in the UI. Register each route in `routes/api.php` inside the `role:` middleware group for the roles allowed; errors are `{"error": "..."}` (return `$this->error(...)`, throw a `ValidationException`, or `abort()`).

## Frontend pages/routes (match the study's interface figures)
- Public: `/` (cemetery map with available/reserved/occupied plot statuses, memorial search, no login), `/login`, `/register`.
- Visitor (auth, role `user`): `/visitor/reserve`, `/visitor/reservations` (My Reservations), `/visitor/profile` (Registration Info).
- Staff: `/staff` (Dashboard), `/staff/reservations`, `/staff/payments`, `/staff/burial-records`, `/staff/users`, `/staff/reports`.
- Admin: `/admin` (Dashboard), `/admin/reservations`, `/admin/payments`, `/admin/burial-records`, `/admin/users`, `/admin/reports`, `/admin/sections`, `/admin/lots`, `/admin/settings` (backup/restore).
- Guard routes by role; redirect unauthorized users; extend the existing `Layout.jsx` sidebar with role-aware navigation.

## Security (study + Data Privacy Act 2012)
- Full controls, permission matrix, privacy inventory, deployment checklist, and accepted risks: `docs/security.md`. Keep it in sync with auth, routes, headers, personal-data fields, and backups.
- Hash passwords with bcrypt (the `User` model's `hashed` cast / `Hash`); verify through `Auth::attempt()` / `Hash::check()`; minimum 8 characters.
- Eloquent / query builder with bound values everywhere (PDO, `ATTR_EMULATE_PREPARES` off); identifiers never come from request input.
- Server-side RBAC on every mutation and read endpoint; ownership checks on a visitor's own records; never trust client-side route guards.
- Laravel session auth (file driver, encrypted cookie, `APP_KEY` secret) with `HttpOnly`, `SameSite=Lax`, `Secure` when HTTPS, 120-minute idle timeout, and ID regeneration on login; only active accounts resolve (`active-users` provider). CSRF token required on every `POST` except login/register (`VerifyCsrfToken`). No CORS.
- Input validation/sanitization on client and server; uniqueness checks prevent duplicate users and double-booked lots.
- Security headers (`SecurityHeaders` middleware): `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, referrer and permissions policies. HSTS and script/style CSP are deployment TODOs.
- Audit trail for logins, failed logins, logouts, and every create/update/approve/reject/cancel/delete, with the client IP and the changed values (`AuditLog::changes`/`snapshot`; secrets masked); readable by staff and admins. Schema changes ship as new Laravel migrations (`make upgrade` applies them, keeping data); `database/upgrades/*.sql` exists only to bring a pre-Laravel database up to the point the first migration adopts.
- Minimize collected personal data; restrict access by role; document public disclosures (map statuses, memorial search); define retention/erasure before deployment.
- Backup/restore is admin-only and audit-logged; import runs export-format SQL (an allowlist of statement shapes) as the app DB user, so review files and use a least-privilege DB account.

## Conventions & quality bar
- PHP: Laravel idioms (Eloquent, Form Requests / `$request->validate()`, middleware, `DB::transaction` + `lockForUpdate()` for claims), `declare(strict_types=1)`, PSR-4 `App\`, existing style. Keep `$timestamps = false` and no date casts on models: the SPA reads `created_at` as MySQL's `Y-m-d H:i:s`. Big read-only payloads (the map) use the query builder, not models.
- React: function components + hooks, existing import style; do not introduce TypeScript.
- No unnecessary comments; keep code clean and idiomatic.
- Commit in logical chunks with conventional commit messages (`feat:`, `fix:`, `refactor:`).
- Verify with the Makefile workflow: `make up`, `make install`, `make migrate`, `make map-data`; `make test` must pass; smoke-test API via curl; `pnpm build` must pass.
- Keep the migrations authoritative so a fresh `make migrate` reproduces the full database.
- The test suite must only ever touch `cemetery_test` (`phpunit.xml` forces it; `tests/TestCase.php` refuses anything else).

## Software engineering process (Agile — Scrum)
The project follows an iterative Agile (Scrum) process:

- **Product backlog:** the study's modules are tracked as prioritized user stories/epics (see backlog order below). Groomed continuously — reprioritize as the study or adviser feedback evolves.
- **Sprints:** 1–2 week iterations. Sprint planning pulls top-priority items from the backlog into the sprint; each sprint must end with a working, testable increment.
- **Ceremonies:** daily standups; sprint review (demo the increment to the team/adviser); retrospective (adjust the process, celebrate wins, note improvements).
- **Scope:** requirements are confirmed incrementally against the study; acceptance criteria are written per user story before implementation starts.

### Definition of Done (per story / per sprint)
1. **Implemented end-to-end:** API + frontend working, matching the story's acceptance criteria.
2. **Tested:** PHPUnit unit tests for core logic and feature tests for the API (`make test`); integration smoke-tests of the API via curl; `pnpm build` passes; a fresh `make migrate` reproduces the database.
3. **Secure:** RBAC enforced server-side on the route, inputs validated, audit-logged where required.
4. **Idiomatic:** conventions met — Laravel idioms with bound queries, `declare(strict_types=1)`, PSR-4, React hooks/function components, conventional commits.
5. **Verifiable:** runs in the dev environment (`make up`), demoable in the sprint review.

### Prioritized backlog order (build smallest vertical slices first)
Auth/RBAC → Sections/Lots → Cemetery Map → Reservations → Burial Records → Notifications → Search → Reports → Dashboards → Backup/Restore. Payments were cut after the early sprints and re-added later on request (see "Current state"). Priorities may shift between sprints based on feedback; each story ships as a complete vertical slice rather than a full layer.

When finished, summarize what was built per module and sprint, how to run it, and what remains for the study's actual deployment phase.