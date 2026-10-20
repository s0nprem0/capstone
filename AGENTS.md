# AGENTS.md — Web-Based Cemetery Reservation and Records Management System

Project guide for the **Cemetery Reservation and Records Management System** for St. John Memorial Garden & Parks. This is a capstone study project. Most modules are implemented end-to-end (see "Current state" below); the remaining ones are built out module-by-module against the system described here.

## Project overview
- Plain PHP (>= 8.1) backend using PDO only — no Laravel/Symfony. Lightweight custom MVC.
- React 18 SPA + Vite (pnpm) frontend, `react-router-dom` v7.
- MySQL 8.0, `utf8mb4`. Schema is authoritative in `database/schema.sql`.
- Containerized dev environment (PHP, Node, MySQL) via `docker-compose.yml` + Makefile.
- Leaflet.js + OpenStreetMap replaced by a pure SVG digital map (traced layout + grid lot boxes, no map tiles).

## Tech stack (mandatory)
- Backend: PHP >= 8.1, PDO prepared statements only (no value concatenation into SQL), `declare(strict_types=1)`, PSR-4 `App\`.
- Database: MySQL 8.0, `utf8mb4`.
- Frontend: React 18 SPA + Vite, pnpm, `react-router-dom` v7. Styling in `resources/css/app.css`. No TypeScript.
- Mapping: pure SVG digital map (traced layout paths + grid lot `<rect>`s, rendered client-side; no Leaflet, no tiles).
- Client-side storage: localStorage (drafts / non-sensitive), sessionStorage (active auth flags), JSON (API interchange). No sensitive data in localStorage.
- Containerization: `docker-compose.yml` (php:8000, node:5173, mysql:3306) + Makefile workflow.

## Architecture
- Six layers: user access (browser) → presentation (React SPA) → application (PHP controllers + API) → data (MySQL) → external services (none) → infrastructure.
- Client-Server + MVC: Models = data layer, Views = React pages, Controllers = request logic.
- Single front controller `public/index.php`: serves JSON API under `/api`; serves the built Vite bundle (or dev server) for all other routes.
- The presentation layer is browser-only (`resources/js/`): page views, shared components, the SVG map renderer, and the client runtime (router, `AuthContext`, `lib/api.js`). It holds no business rules and calls only `/api/*`.
- The study's layered architecture diagram is reproduced and reconciled with the build in `docs/architecture.md`: it adds the Administrator actor and the Presentation Layer the diagram omits, and matches the diagram's Payment Monitoring module (now implemented).

## Project structure
```
├── public/index.php          # Front controller (API + SPA)
├── src/
│   ├── bootstrap.php         # Loads .env + autoloader
│   ├── Config/Database.php   # PDO singleton (mysql, utf8mb4)
│   ├── Core/                 # Router, Session, Csrf, Auth, Response, RateLimiter
│   ├── Controllers/          # Request logic (auth, lots, reservations, burials, reports, backup, ...)
│   └── Models/               # Data layer (Model base + entities)
├── database/schema.sql       # Authoritative schema + seed data
├── resources/
│   ├── js/                   # React SPA (contexts, components, pages/)
│   └── css/app.css           # All styling
├── Dockerfile                # PHP 8.3-cli + composer
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
make install   # composer install + pnpm install (in containers)
make migrate   # apply database/schema.sql to MySQL
make map-data  # apply database/survey/lots.sql (70 surveyed sections, 6734 plots)
make demo      # apply database/demo.sql (demo clients, reservations, burials)
```
- React dev server: http://localhost:5173 (proxies `/api` to PHP)
- PHP server: http://localhost:8000
- MySQL: localhost:3306 (db `cemetery_db`)

## Current state
Implemented end-to-end (API + React page + server-side RBAC on every route):

- Auth/RBAC — register, login, logout, session auth with CSRF, roles `admin` / `staff` / `user`, login rate limiting
- Sections & lots — CRUD, SVG grid import, and a lot map editor
- SVG cemetery map — traced layout, pan/zoom/fly-to, status colouring, reserve-from-map
- Reservations — submission, admin/staff approval restricted to pending rows, transactional lot claim; approval is what moves a lot from `reserved` to `occupied`, and rejecting or deleting one returns the plot unless a burial record already claims it
- Payments — manual recording (cash / GCash / bank transfer / cheque / other) against a reservation, with a derived `reservations.payment_status` (`unpaid` / `partial` / `paid`); recording a payment does not gate approval; staff/admin record, a visitor sees their own payments; revenue stat on the dashboard and a payments report. No online gateway
- Burial records, notifications, debounced search/filters, reports, dashboards, audit trail
- Backup/restore — admin-only SQL export/import, audit-logged

Payments were re-added on request (they had been cut after the early sprints). `reservations.payment_status` is derived from the `payments` rows via `Payment::recomputeStatus` and stored, so it must be recomputed whenever a payment changes or a reservation's `total_amount` changes.

Still open: Documents, concession/ownership records, record-level notes and expiration tracking, responsive layout polish. Extend `database/schema.sql` per the "Data model" section below before building them; it stays authoritative, so a fresh `make migrate` must reproduce the whole database.

## Roles & permissions (RBAC) — from the study
- **Administrator** (`admin`): everything — manage user/staff accounts, roles, permissions, access levels; approve/reject reservations; manage sections and lots; generate reports; backup/restore; view audit logs.
- **Staff** (`staff`): process reservations, manage burial records, manage user accounts (view/update/status), generate reports.
- **Visitor/Client** (`user`): register, log in, view public cemetery map, make reservations, track reservation status, manage their registration info.
- **Public** (not logged in): view cemetery map (available/occupied plots only); must log in to reserve.

`users.role` must become `ENUM('admin','staff','user')` (client).

## Data model (extend `database/schema.sql` consistently)
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
- `/api/reservations/{id}/approve`, `/api/reservations/{id}/reject`
- `/api/payments` CRUD (`mine` for a visitor's own), staff/admin records
- `/api/notifications` (mine, mark read)
- `/api/reports/*` (reservations, burial-records, availability, payments, audit-logs, summary; `summary` and `audit-logs` take an optional `from`/`to` date range)
- `/api/backup/export`, `/api/backup/import`
- `/api/stats/dashboard`
- `/api/map` (sections + lots with SVG grid coordinates and status)

Always respond with proper HTTP status codes; validate inputs server-side; never trust client input; RBAC enforced on every route, not just in the UI.

## Frontend pages/routes (match the study's interface figures)
- Public: `/` (cemetery map, available/occupied plots, no login), `/login`, `/register`.
- Visitor (auth, role `user`): `/visitor/reserve`, `/visitor/reservations` (My Reservations), `/visitor/profile` (Registration Info).
- Staff: `/staff` (Dashboard), `/staff/reservations`, `/staff/payments`, `/staff/burial-records`, `/staff/users`, `/staff/reports`.
- Admin: `/admin` (Dashboard), `/admin/reservations`, `/admin/payments`, `/admin/burial-records`, `/admin/users`, `/admin/reports`, `/admin/sections`, `/admin/lots`, `/admin/settings` (backup/restore).
- Guard routes by role; redirect unauthorized users; extend the existing `Layout.jsx` sidebar with role-aware navigation.

## Security (study + Data Privacy Act 2012)
- Hash passwords with `password_hash()` / verify with `password_verify()`.
- PDO prepared statements everywhere.
- Server-side RBAC on every mutation and read endpoint.
- Session-based auth with secure flags; CSRF protection on mutating requests.
- Input validation/sanitization on client and server; uniqueness checks prevent duplicate users and double-booked lots.
- Minimize collected personal data; restrict access by role; retain audit trail.

## Conventions & quality bar
- PHP: `declare(strict_types=1)`, PSR-4 `App\`, existing style.
- React: function components + hooks, existing import style; do not introduce TypeScript.
- No unnecessary comments; keep code clean and idiomatic.
- Commit in logical chunks with conventional commit messages (`feat:`, `fix:`, `refactor:`).
- Verify with the Makefile workflow: `make up`, `make install`, `make migrate`, `make map-data`; smoke-test API via curl; `pnpm build` must pass.
- Keep `database/schema.sql` authoritative so a fresh `make migrate` reproduces the full database.

## Software engineering process (Agile — Scrum)
The project follows an iterative Agile (Scrum) process:

- **Product backlog:** the study's modules are tracked as prioritized user stories/epics (see backlog order below). Groomed continuously — reprioritize as the study or adviser feedback evolves.
- **Sprints:** 1–2 week iterations. Sprint planning pulls top-priority items from the backlog into the sprint; each sprint must end with a working, testable increment.
- **Ceremonies:** daily standups; sprint review (demo the increment to the team/adviser); retrospective (adjust the process, celebrate wins, note improvements).
- **Scope:** requirements are confirmed incrementally against the study; acceptance criteria are written per user story before implementation starts.

### Definition of Done (per story / per sprint)
1. **Implemented end-to-end:** API + frontend working, matching the story's acceptance criteria.
2. **Tested:** unit tests for core logic; integration smoke-tests of the API via curl; `pnpm build` passes; a fresh `make migrate` reproduces the database.
3. **Secure:** RBAC enforced server-side on the route, inputs validated, audit-logged where required.
4. **Idiomatic:** conventions met — PDO prepared statements, `declare(strict_types=1)`, PSR-4, React hooks/function components, conventional commits.
5. **Verifiable:** runs in the dev environment (`make up`), demoable in the sprint review.

### Prioritized backlog order (build smallest vertical slices first)
Auth/RBAC → Sections/Lots → Cemetery Map → Reservations → Burial Records → Notifications → Search → Reports → Dashboards → Backup/Restore. Payments were cut after the early sprints and re-added later on request (see "Current state"). Priorities may shift between sprints based on feedback; each story ships as a complete vertical slice rather than a full layer.

When finished, summarize what was built per module and sprint, how to run it, and what remains for the study's actual deployment phase.