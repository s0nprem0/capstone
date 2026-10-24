# Cemetery Reservation and Records Management System

Web-based system for **St. John Memorial Garden & Parks** — a capstone project for managing cemetery lot reservations, burial records, and visitor accounts.

Laravel 12 (PHP 8.3) API backend + React 18 SPA (Vite + pnpm) frontend, containerized with Docker.

## Tech stack

- **Backend:** Laravel 12 on PHP >= 8.2 — Eloquent models, Form Request validation, route middleware for RBAC (`App\`)
- **Database:** MySQL 8.0, `utf8mb4` — schema authoritative in the Laravel migrations (`database/migrations/`)
- **Frontend:** React 18 SPA, Vite, pnpm (pinned `pnpm@10.4.1`), `react-router-dom` v7
- **Mapping:** pure SVG digital map — traced layout paths + grid lot boxes rendered client-side (no map tiles)
- **Containerization:** Docker Compose (PHP, Node, MySQL) + Makefile
- **Tests:** PHPUnit unit and feature suite (`make test`)

## Features

### Implemented
- **Authentication & RBAC** — register, login, logout, session-based auth with CSRF protection (bcrypt via Laravel's `Hash`), roles `admin` / `staff` / `user`, role-guarded routes and server-side checks on every protected endpoint; login rate-limited to 5 failed attempts per account and address per 15 minutes (HTTP 429)
- **Cemetery map** — pure SVG digital map (traced layout + grid lots) color-coded by status, pan/zoom/fly-to navigation, lot details drawer, reserve flow from the map
- **Reservations** — client submission, staff/admin approval/rejection, automatic lot locking (available → reserved on submission, reserved → occupied on approval), capacity checks per lot type; lot claim is transactional (`SELECT … FOR UPDATE`) so concurrent requests cannot double-book a lot. Rejecting or deleting a reservation returns its plot to the available pool unless a burial record already claims it
- **Payments** — staff/admin record manual payments (cash, GCash, bank transfer, cheque, other) against a reservation; the reservation's derived `payment_status` (`unpaid` / `partial` / `paid`) and paid/balance figures update automatically. Recording a payment does not gate approval. Visitors see the payment status on their own reservations; revenue appears on the dashboard and in a payments report. No online gateway
- **Burial records** — deceased details, lot assignment, burial type, interment status; creation requires a reserved or occupied lot (a free lot cannot host a burial)
- **Notifications** — per-user messages on reservation and payment events, unread badge and mark-read
- **Search & filters** — debounced search and status/type/date filters across users, reservations, payments, burial records, and lots
- **Reports** — a printable summary for any period (reservations, payments, interments, availability by section, audit log); the Reservations, Payments and Burial Records lists print and export as CSV with their filters
- **Dashboards** — stats cards + recent activity for staff/admin
- **User management** — admin creates/updates users, activates/deactivates accounts, assigns roles; visitors manage their own profile and password
- **Backup & restore** — admin-only SQL export/import, audit-logged
- **Audit trail** — logs logins and every create/update/approve/reject/delete action
- **Section management** — admin CRUD for `cemetery_sections` (name, location, description, SVG view box) with per-section lot/status counts and a guard that blocks deleting non-empty sections

### Remaining gaps
- Responsive layout polish before production deployment

## Architecture

A layered client–server system: React 18 SPA → REST API (`/api`, Laravel routes in
`routes/api.php`) → MySQL 8, with Eloquent Models behind the Controllers. Every
other path serves the SPA shell (`routes/web.php`).

The study's layered architecture diagram, reconciled with the code, is in
[docs/architecture.md](docs/architecture.md). It matches the diagram's Payment
Monitoring module and Payment Records datastore, and adds the **Administrator
actor** the diagram omits (the system's RBAC has `admin` / `staff` / `user`).

## Getting started

### Prerequisites
- Docker + Docker Compose
- Make (optional — or run the docker commands directly)

### 1. Start the stack
```bash
make setup         # up + install (.env, APP_KEY) + migrate + map-data
```
`make setup` is the one-shot path from a clean clone. To run the steps yourself:

```bash
make up            # docker compose up -d
```

`.env` is gitignored, so a fresh checkout has none. `make install` copies
`.env.example` into place and generates the `APP_KEY` Laravel signs session
cookies with. Under Docker, `docker-compose.yml` supplies `DB_*` as environment
variables, which take precedence over `.env`.

### 2. Install dependencies
```bash
make install       # .env + APP_KEY, composer install + pnpm install (in containers)
```

### 3. Initialize the database
The schema is the Laravel migrations; the seeder adds the admin account and the
survey sections. To build the database, or reset it to the schema at any time:

```bash
make migrate      # php artisan migrate:fresh --seed (drops every table)
make map-data     # load the 70 surveyed sections and 6769 plots
make demo         # optional: load the demo dataset for a walkthrough
```

`make migrate` is destructive by design — that is what lets it put a database
back the way the schema says it should be. To apply a new migration and keep the
data, run `make upgrade` (`php artisan migrate`). For demo accounts and a suggested
walkthrough see [DEMO.md](DEMO.md).

### 4. Run the app
| Service | URL | Purpose |
| --- | --- | --- |
| React dev server | http://localhost:5173 | Hot-reload development |
| Laravel (production build) | http://localhost:8000 | Serves built bundle + `/api` (`php artisan serve`) |

For production mode, build the frontend first:
```bash
make build         # docker compose exec node pnpm build
```

The bundle is written to `public/dist`, inside the docroot the PHP server (and
Apache, under XAMPP) serves from, so :8000 needs nothing else running.

## Running with Podman

Podman runs the same stack. Where the `docker` CLI is a shim over `podman-compose`
(Podman Desktop, or a `docker` wrapper), the Makefile works unchanged. For a bare
`podman-compose` install, point the Makefile at it:

```bash
make DC="podman-compose" setup
```

Two host-side notes for a bare Podman install:

- **Image short names.** Podman does not default to Docker Hub; `php:8.3-cli` and
  friends fail to resolve. Add a search registry in `~/.config/containers/registries.conf`:
  ```toml
  unqualified-search-registries = ["docker.io"]
  ```
- **Rootless builds.** Rootless Podman maps container root to your host user, so the
  node image's `node` user cannot write the bind-mounted workspace and `pnpm build`
  fails with `EACCES`. The Makefile detects this and runs the build as root, which
  maps back to you. No change is needed if you use rootful Podman or Docker.

## Running with XAMPP (no Docker)

An alternative to Docker using a local XAMPP install (Apache + MySQL + PHP).

### Prerequisites
- XAMPP with Apache, MySQL, and PHP >= 8.2, which Laravel 12 requires (Control Panel: start **Apache** and **MySQL**)
- Node.js + pnpm
- Composer

### 1. Install the project
Place the project folder in XAMPP's web root:
```
C:\xampp\htdocs\cemetery-system\
```

### 2. Configure the environment
```bash
copy .env.xampp.example .env     # Windows
# or: cp .env.xampp.example .env # macOS/Linux
```
This points the app at XAMPP's MySQL (`127.0.0.1:3306`, user `root`, no password).

### 3. Install dependencies
```bash
composer install
php artisan key:generate
pnpm install
```

### 4. Create the database
Create database `cemetery_db` (utf8mb4) in phpMyAdmin (http://localhost/phpmyadmin), then:
```bash
php artisan migrate --seed
C:\xampp\mysql\bin\mysql -u root cemetery_db -e "source database/survey/lots.sql"
```
(`source` rather than `< file`, which PowerShell does not support.)

### 5. Build the frontend
Apache serves the built bundle through `public/index.php`:
```bash
pnpm build
```

### 6. Run
Apache rewrites all requests into `public/` (via the root `.htaccess`). Open:

```
http://localhost/cemetery-system
```

### Dev mode (hot reload)
Run Vite alongside Apache and let it proxy `/api` to the XAMPP server:
```bash
XAMPP=1 pnpm dev
```
Then open http://localhost:5173. (`XAMPP=1` makes Vite proxy `/api` to `http://localhost:80`.)

> **Note:** The root `.htaccess` and `public/.htaccess` are only needed by Apache/XAMPP. When using Docker they are ignored.

## Default accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@cemetery.test` | `admin123` |

Additional users are created via the app (User Management) or `POST /api/auth/register`.

## Project structure

```
├── app/
│   ├── Http/Controllers/      # Request logic, one controller per module
│   ├── Http/Middleware/       # role (RBAC), CSRF, security headers, gzip, hold expiry
│   ├── Http/Requests/         # Form Request validation
│   ├── Models/                # Eloquent models (data layer)
│   ├── Services/              # DatabaseBackup (export/restore)
│   ├── Support/               # Dates, Svg geometry, LoginThrottle, Tally
│   └── Console/Commands/      # map:verify
├── bootstrap/app.php          # Middleware groups, JSON error rendering
├── config/                    # Laravel config + cemetery.php (reservation limits)
├── routes/
│   ├── api.php                # JSON API, role middleware per route
│   ├── web.php                # SPA shell for every other path
│   └── console.php            # reservations:expire (scheduled hourly)
├── database/
│   ├── migrations/            # Authoritative schema
│   ├── seeders/               # Admin account + survey sections
│   ├── survey/lots.sql        # Surveyed plots (make map-data)
│   ├── demo.sql               # Demo dataset (make demo)
│   └── upgrades/              # SQL upgrades for pre-Laravel databases
├── public/
│   ├── index.php              # Laravel entry point
│   └── .htaccess              # Apache/XAMPP routing to index.php
├── resources/
│   ├── js/                    # React SPA (contexts, components, pages, lib)
│   ├── css/app.css            # All styling
│   └── views/app.blade.php    # SPA shell (built bundle or Vite dev entry)
├── tests/                     # PHPUnit: Unit/ and Feature/
├── docker-compose.yml         # php / node / mysql services
├── Dockerfile                 # PHP 8.3-cli + composer, php artisan serve
├── docker/node.Dockerfile     # Node 22 + pnpm
├── docs/
│   ├── architecture.md        # layered architecture reconciled with the build
│   ├── security.md            # controls, permission matrix, privacy, known risks
│   ├── user-manual.md         # end-user guide, per role
│   └── technical-manual.md    # architecture, data model, API, deployment
├── DEMO.md                    # tech demo runbook + demo accounts
├── .htaccess                  # Apache/XAMPP: redirect into public/
├── .env.example               # Docker/standalone env template
├── .env.xampp.example         # XAMPP env template
└── Makefile                   # up, down, install, build, migrate, demo, test, fresh, ...
```

## API overview

RESTful JSON under `/api`. Mutations require a CSRF token (`GET /api/csrf-token` → send as `X-CSRF-Token` header).

| Endpoint | Method | Access |
| --- | --- | --- |
| `/api/auth/register`, `/api/auth/login` | POST | Public (login rate-limited → 429 after 5 failures/15 min) |
| `/api/auth/logout`, `/api/auth/me` | POST / GET | Auth |
| `/api/map` | GET | Public |
| `/api/lots`, `/api/lots/available` | GET | Public |
| `/api/lots` | POST | admin |
| `/api/lots/import-grid` | POST | admin |
| `/api/lots/{id}` | GET | Public |
| `/api/lots/{id}` | POST | admin, staff |
| `/api/lots/{id}/delete` | POST | admin |
| `/api/sections`, `/api/sections/{id}` | GET | admin, staff |
| `/api/sections` | POST | admin |
| `/api/sections/{id}` | POST | admin |
| `/api/sections/{id}/delete` | POST | admin |
| `/api/users`, `/api/users/{id}` | GET | admin, staff |
| `/api/users` | POST | admin |
| `/api/users/{id}` | POST | admin, staff, user (self) |
| `/api/users/{id}/delete` | POST | admin |
| `/api/reservations` | GET | admin, staff |
| `/api/reservations/mine` | GET | user |
| `/api/reservations` | POST | Auth |
| `/api/reservations/{id}`, `/api/reservations/{id}/delete` | POST | admin, staff |
| `/api/reservations/{id}/approve`, `/api/reservations/{id}/reject` | POST | admin, staff |
| `/api/payments` | GET/POST | admin, staff |
| `/api/payments/mine` | GET | Auth (own) |
| `/api/payments/{id}` | POST | admin, staff |
| `/api/payments/{id}/delete` | POST | admin |
| `/api/burial-records` | GET/POST | admin, staff |
| `/api/burial-records/{id}` | POST | admin, staff |
| `/api/burial-records/{id}/delete` | POST | admin |
| `/api/notifications` | GET | Auth |
| `/api/notifications/{id}/read`, `/api/notifications/read-all` | POST | Auth |
| `/api/stats/dashboard` | GET | admin, staff |
| `/api/reports/{reservations,burial-records,availability,payments,audit-logs,summary}` | GET | admin, staff |
| `/api/backup/export` | GET | admin |
| `/api/backup/import` | POST | admin |

## Development workflow

```bash
make setup       # one-shot: up + install + migrate + map-data
make logs        # tail container logs
make php         # shell into PHP container
make node        # shell into Node container
make mysql       # interactive MySQL shell
make build       # build the frontend bundle
make migrate     # reset the database to the schema (migrate:fresh --seed)
make upgrade     # apply new migrations, keeping the data
make test        # PHPUnit suite against the cemetery_test database
make verify-map  # check plot geometry (php artisan map:verify)
make demo        # load the demo dataset
make fresh       # rebuild everything from scratch
```

## Testing

The PHPUnit suite runs against its own `cemetery_test` database and refuses to
touch `cemetery_db`. Full instructions, including running part of the suite and
an API smoke test for bash and PowerShell, are in
[docs/technical-manual.md §13](docs/technical-manual.md#13-testing-and-verification).

**Linux (Docker or Podman)**
```bash
make test                            # creates cemetery_test if missing, runs the suite
DB_HOST=127.0.0.1 php artisan test   # or with host PHP 8.2+, against the container's MySQL
```

**Windows (Docker Desktop, PowerShell, no `make`)**
```powershell
docker compose exec -T mysql mysql -u root -proot -e "CREATE DATABASE IF NOT EXISTS cemetery_test DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON cemetery_test.* TO 'cemetery_user'@'%';"
docker compose exec -T php php artisan test
```

**Windows (XAMPP)**, with MySQL started in the Control Panel:
```powershell
C:\xampp\mysql\bin\mysql -u root -e "CREATE DATABASE IF NOT EXISTS cemetery_test DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
C:\xampp\php\php.exe artisan test
```

The database line is needed once. `pnpm build` must also pass (`make build`).

## Security

The full controls, permission matrix, privacy notes, deployment checklist, and
accepted risks are in **[docs/security.md](docs/security.md)**. Summary:

- All SQL through Eloquent / the query builder with bound parameters (PDO, `ATTR_EMULATE_PREPARES` off); identifiers never come from request input
- Passwords hashed with bcrypt (Laravel `Hash`, `hashed` cast; minimum 8 characters)
- Server-side RBAC on every protected route (not just UI), plus ownership checks on a visitor's own records
- CSRF token (`X-CSRF-Token`) required on every `POST` except login/register; invalid → `419`
- Sessions with `HttpOnly`, `SameSite=Lax`, and `Secure` when HTTPS; ID regenerated on login
- Login rate limiting (5 failed attempts per account and address, 20 per address, per 15 minutes) against brute force
- Security headers on JSON API and SPA responses (`SecurityHeaders` middleware); no CORS (same-origin only): `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, referrer and permissions policies
- Input validation and uniqueness checks server-side
- Data-integrity rules: lots are claimed atomically (no double-booking), approval is what turns a held plot into an occupied one, burials require a reserved/occupied lot
- Audit trail of logins, logouts, and every create/update/approve/reject/delete, viewable by staff and admins
- Personal data minimized per the Data Privacy Act of 2012; public memorial search and plot statuses are disclosed by design

Known gaps before production (no MFA, no password reset, no retention/erasure
workflow, no HSTS/script CSP, admin restore runs the export's SQL as the app DB user) are listed in
[section 14 of the security guide](docs/security.md#14-known-limitations-and-accepted-risks).

## Conventions

- PHP: Laravel conventions, `declare(strict_types=1)`, PSR-4 `App\`, existing style
- React: function components + hooks, no TypeScript
- Conventional commits (`feat:`, `fix:`, `refactor:`, ...)
- The migrations stay authoritative — `make migrate` reproduces the whole schema; schema changes ship as new migrations