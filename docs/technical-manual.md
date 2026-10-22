# Technical Manual

**Cemetery Reservation and Records Management System** — St. John Memorial
Garden & Parks.

For the end-user guide see [user-manual.md](user-manual.md); for the layered
diagram reconciled with the study see [architecture.md](architecture.md); for
the full security controls, privacy notes, and known risks see
[security.md](security.md).

---

## 1. Overview

A plain-PHP REST backend with a React single-page front end. There is no
framework: a small custom MVC (Models → PDO, Views → React pages, Controllers →
request logic) behind one front controller.

| Layer | Technology |
| --- | --- |
| Backend | PHP ≥ 8.1, `declare(strict_types=1)`, PSR-4 `App\`, PDO only |
| Database | MySQL 8.0, `utf8mb4`, schema authoritative in `database/schema.sql` |
| Frontend | React 18 SPA, Vite, pnpm (`pnpm@10.4.1`), `react-router-dom` v7, no TypeScript |
| Styling | Hand-written CSS in `resources/css/app.css` |
| Map | Pure SVG (traced survey layout + lot `<rect>`s); no Leaflet, no tiles |
| Dev environment | Docker/podman-compose (php, node, mysql) + Makefile |

## 2. Architecture

Six layers — see [architecture.md](architecture.md) for the diagram. Summary:

- **Presentation (React SPA, in the browser).** Page views under
  `resources/js/pages`, shared components under `resources/js/components`, the
  SVG map renderer, and the client runtime (`react-router-dom`, `AuthContext`,
  `lib/api.js`) that owns routing, session state, role guards, the CSRF header,
  and the `/api/map` cache. No business rules live here.
- **Front controller.** `public/index.php` serves the JSON API under `/api` and,
  for every other path, the built SPA shell (`public/dist`) or the Vite dev
  server. One entry point, one place for security headers and routing.
- **Routing.** `App\Core\Router` matches method + path, with `{id}` params
  coerced to int. REST convention: `GET` list, `GET {id}`, `POST` create,
  `POST {id}` update, `POST {id}/delete` delete.
- **Models.** `App\Models\Model` provides `find`, `create`, `update`, `delete`,
  `findBy`; entity models add their own queries. All values are bound.
- **Views → API only.** The SPA calls `/api/*` and never the database.
  Authorization is enforced server-side regardless of the client-side guards.

## 3. Repository layout

```
public/index.php         Front controller (API + SPA shell)
src/
  bootstrap.php          Loads .env (optional) + Composer autoloader
  Config/Database.php    PDO singleton (utf8mb4, no emulated prepares)
  Core/                  Router, Session, Csrf, Auth, Response, RateLimiter, Headers
  Controllers/           Request logic (auth, users, reservations, burials, …)
  Models/                Data layer (Model base + entities)
database/schema.sql      Authoritative schema + seed (admin account, sections)
database/survey/lots.sql Surveyed plots (loaded by `make map-data`)
database/demo.sql        Demo dataset (loaded by `make demo`)
resources/js/            React SPA (context, components, pages, lib, map)
resources/css/app.css    All styling
docs/                    This manual, the user manual, the architecture diagram
Dockerfile, docker/node.Dockerfile, docker-compose.yml, Makefile
verify-map.php           Geometry checker for the surveyed plots
```

## 4. Configuration

Configuration is read from real environment variables and, optionally, a `.env`
file at the project root (`src/bootstrap.php` calls `Dotenv::safeLoad()` — the
file may be absent; `DB_*` still come from the environment, e.g. compose).

| Variable | Purpose | Example |
| --- | --- | --- |
| `DB_HOST` | MySQL host | `mysql` (compose) / `127.0.0.1` (XAMPP) |
| `DB_PORT` | MySQL port | `3306` |
| `DB_DATABASE` | Database name | `cemetery_db` |
| `DB_USERNAME` | MySQL user | `cemetery_user` |
| `DB_PASSWORD` | MySQL password | `secret` |
| `APP_TIMEZONE` | Cemetery time zone, used for "today" in date checks (PHP runs in UTC) | `Asia/Manila` |
| `RESERVATION_MAX_PENDING` | Pending requests one visitor may hold at once; `0` = no limit | `3` |
| `RESERVATION_HOLD_DAYS` | Days an unpaid pending request holds its plot before it expires (checked on every API request); `0` = never | `7` |
| `APP_ENV`, `APP_DEBUG` | Reserved environment flags; the app does not read them (errors are always generic, details go to the server log) | `local`, `true` |

Templates: `.env.example` (Docker/standalone) and `.env.xampp.example` (XAMPP).
`.env` is git-ignored; a fresh clone has none.

## 5. Running the system

### Containerized (Docker or podman-compose)

```bash
make setup      # .env (if absent) + up + install + migrate + map-data
make demo       # optional: demo accounts and data
make build      # build the frontend into public/dist
```

Open http://localhost:8000 (the built app and the API). The Vite dev server on
http://localhost:5173 is optional and only for editing; it proxies `/api` to PHP.
MySQL is on 3306, phpMyAdmin on 8080.

Common targets: `up`, `down`, `logs`, `install`, `build`, `migrate`, `map-data`,
`demo`, `fresh`, `verify-map`, `php`, `node`, `mysql`. Under a bare
`podman-compose` install use `make DC="podman-compose" …` (see README).

### XAMPP (Apache + MySQL + PHP)

Place the project under `htdocs`, copy `.env.xampp.example` to `.env`, create the
database and import `database/schema.sql`, run `composer install` and
`pnpm install`, then `pnpm build`. Apache rewrites all requests into `public/`
via the root and `public/.htaccess`. Hot-reload dev: `XAMPP=1 pnpm dev`.

## 6. Database

Database `cemetery_db`, engine InnoDB, charset `utf8mb4`. `database/schema.sql`
is authoritative: it drops and recreates every table, so a fresh `make migrate`
reproduces the whole database.

### Tables

**users** — accounts and roles.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | INT UNSIGNED PK | auto-increment |
| `fullname` | VARCHAR(100) | indexed |
| `email` | VARCHAR(100) | unique, indexed |
| `phone` | VARCHAR(15) | nullable |
| `password` | VARCHAR(255) | bcrypt hash (`password_hash`) |
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
| `approved_status` | ENUM(pending, approved, rejected) | default `pending` |
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
- Approving a reservation moves the plot `reserved → occupied`; rejecting or
  deleting one returns the plot unless a burial already claims it.
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
| `POST /api/auth/login` | Public | Rate-limited → 429 after 5 failures / 15 min |
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
| `POST /api/reservations/{id}/approve` \| `/reject` | admin, staff | Pending only |
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

**Status codes.** `200` ok · `201` created · `304` not modified (conditional GET)
· `400` bad request · `401` unauthenticated · `403` forbidden · `404` not found ·
`409` conflict (locked section, lot in use) · `419` invalid CSRF · `422`
validation error · `429` rate-limited · `500` server error.

## 8. Authentication, authorization, security

The authoritative guide, including the full permission matrix, personal-data
inventory, deployment checklist, and accepted risks, is
[security.md](security.md). Summary:

- **Passwords** are hashed with `password_hash()` (bcrypt) and checked with
  `password_verify()`; the minimum length is 8 characters.
- **Sessions** are PHP sessions with `HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Secure` when `$_SERVER['HTTPS']` is set, and a zero lifetime (browser
  session). The session id is regenerated on login/register; logout destroys
  the session. There is no application-level idle timeout.
- **CSRF** — an `X-CSRF-Token` header is required on every `POST` except
  login/register. Invalid or missing → `419`. The client keeps the token in
  memory (never `localStorage`) and retries once automatically on `419`.
- **RBAC** — `Auth::requireRole([...])` guards each controller method, not just
  the UI. Only admins create accounts, change roles, delete accounts, delete
  burial records and payments, manage sections/lots beyond updates, and use
  backup/restore; staff may edit non-admin accounts and activate/deactivate
  them, but cannot manage `admin` accounts; a visitor may edit only their own
  profile. Nobody may change their own role, deactivate their own account, or
  delete themselves. A visitor can read only their own reservation; `mine`
  endpoints filter by `Auth::id()`.
- **Rate limiting** — 5 failed logins per IP per 15 minutes (`login_attempts`),
  then `429`. The limit is per IP only; registration and public search are not
  throttled.
- **Input validation & uniqueness** — server-side, per endpoint (unique email,
  unique `lot_code`, valid dates/enums, capacity, coordinates). All SQL is
  parameterized with emulated prepares disabled.
- **Security headers** (`Core/Headers`): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`; plus `Vary:
  Accept-Encoding` when compressing. HSTS and a script/style CSP are not set.
  JSON `GET` responses add `Cache-Control: private, no-cache` and an `ETag`.
- **Audit trail** — `audit_logs` records registration, logins, logouts, and
  every create/update/approve/reject/delete, plus lot/section imports, regrids,
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
- **Geometry check** — `php verify-map.php` (or `make verify-map`) asserts every
  plot's centre lies inside its section outline, no two plots overlap, and
  nothing falls outside the overall viewBox.

## 11. Performance characteristics

- JSON and HTML are **gzip-compressed** at the application layer
  (`Core/Headers::compress`), which matters because neither the PHP dev server
  nor stock XAMPP compresses; `/api/map` drops from ~1.1 MB to ~55 KB.
- `GET` JSON responses carry an **`ETag`** and revalidate with an empty `304`.
- The SPA caches `GET /api/map` per session (`lib/api.js`) and clears it on any
  successful mutation.
- Pages are **lazy-loaded** per route; the entry bundle does not include the
  admin editors.
- `opcache` is enabled for the built-in PHP server.

## 12. Backup and restore

`BackupController`:

- **Export** (`GET /api/backup/export`, admin) streams `DROP TABLE` + `CREATE
  TABLE` + `INSERT` for every table, wrapped in `SET FOREIGN_KEY_CHECKS=0/1`.
- **Import** (`POST /api/backup/import`, admin) reads an uploaded file or raw
  body, splits it into statements while honouring quotes and comments, and
  executes them. Capped at 50 MB.

`database/schema.sql` remains the authoritative definition — a fresh
`make migrate` reproduces the schema and seed regardless of any backup.

## 13. Build and verification

```bash
make build       # vite build -> public/dist (must pass)
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
  the guards in the controllers.
- `database/schema.sql` stays authoritative; extend it before adding features so
  a fresh migrate reproduces the database.
