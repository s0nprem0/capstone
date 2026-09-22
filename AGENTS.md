# AGENTS.md — Web-Based Cemetery Reservation and Records Management System

Project guide for the **Cemetery Reservation and Records Management System** for St. John Memorial Garden & Parks. This is a capstone study project. The repo is a working **boilerplate** that will be built out module-by-module into the full system described below.

## Project overview
- Plain PHP (>= 8.1) backend using PDO only — no Laravel/Symfony. Lightweight custom MVC.
- React 18 SPA + Vite (pnpm) frontend, `react-router-dom` v6.
- MySQL 8.0, `utf8mb4`. Schema is authoritative in `database/schema.sql`.
- Containerized dev environment (PHP, Node, MySQL) via `docker-compose.yml` + Makefile.
- Leaflet.js + OpenStreetMap replaced by a pure SVG digital map (traced layout + grid lot boxes, no map tiles).

## Tech stack (mandatory)
- Backend: PHP >= 8.1, PDO prepared statements only (no value concatenation into SQL), `declare(strict_types=1)`, PSR-4 `App\`.
- Database: MySQL 8.0, `utf8mb4`.
- Frontend: React 18 SPA + Vite, pnpm, `react-router-dom` v6. Styling in `resources/css/app.css`. No TypeScript.
- Mapping: pure SVG digital map (traced layout paths + grid lot `<rect>`s, rendered client-side; no Leaflet, no tiles).
- Client-side storage: localStorage (drafts / non-sensitive), sessionStorage (active auth flags), JSON (API interchange). No sensitive data in localStorage.
- Containerization: `docker-compose.yml` (php:8000, node:5173, mysql:3306) + Makefile workflow.

## Architecture
- Client-Server + MVC: Models = data layer, Views = React pages, Controllers = request logic.
- Single front controller `public/index.php`: serves JSON API under `/api`; serves the built Vite bundle (or dev server) for all other routes.

## Project structure (current boilerplate)
```
├── public/index.php          # Front controller (API + SPA)
├── src/
│   ├── bootstrap.php         # Loads .env + autoloader
│   ├── Config/Database.php   # PDO singleton (mysql, utf8mb4)
│   ├── Core/Router.php       # Router with {param} support, json()/input() helpers
│   ├── Controllers/          # Request logic (ReservationController, LotController)
│   └── Models/               # Data layer (Model base, Lot, Reservation)
├── database/schema.sql       # Authoritative schema
├── resources/
│   ├── js/                   # React SPA (App, Layout, pages/)
│   └── css/app.css           # All styling
├── Dockerfile                # PHP 8.3-cli + composer
├── docker/node.Dockerfile    # Node 22 + pnpm
├── docker-compose.yml        # php / node / mysql services
├── Makefile                  # up, down, install, migrate, fresh, ...
├── package.json              # packageManager pinned to pnpm@10.4.1
├── .npmrc                    # allows esbuild build script (pnpm 10+)
└── pnpm-lock.yaml            # committed for frozen installs
```

## Getting started
```bash
make up        # docker compose up -d --build
make install   # composer install + pnpm install (in containers)
make migrate   # apply database/schema.sql to MySQL
```
- React dev server: http://localhost:5173 (proxies `/api` to PHP)
- PHP server: http://localhost:8000
- MySQL: localhost:3306 (db `cemetery_db`)

## Current state (gaps to close)
Existing: base Router/Model/Database; generic CRUD controllers for **lots and reservations**; React skeleton (`Dashboard`, `Reservations`, `NewReservation`, `Cemetery`, `Records`) with stub pages.

Missing entirely: authentication/RBAC, burial records, notifications, search/filter, reports, payment receipt upload + validation, backup/restore, dashboards. The schema (`database/schema.sql`) is the initial baseline and must be extended per the "Data model" section below before feature work. The SVG digital map (sections + grid lots) is implemented.

## Roles & permissions (RBAC) — from the study
- **Administrator** (`admin`): everything — manage user/staff accounts, roles, permissions, access levels; approve/reject reservations; manage sections and lots; generate reports; backup/restore; view audit logs.
- **Staff** (`staff`): process reservations, validate payments, manage burial records, manage user accounts (view/update/status), generate reports.
- **Visitor/Client** (`user`): register, log in, view public cemetery map, make reservations, track reservation status, view their payments, manage their registration info.
- **Public** (not logged in): view cemetery map (available/occupied plots only); must log in to reserve.

`users.role` must become `ENUM('admin','staff','user')` (client).

## Data model (extend `database/schema.sql` consistently)
The current schema uses `sections` / `lots` / `reservations` / `burial_records` / `payments`. Align to the study's ERD while adding required fields:
- `users.role` → `ENUM('admin','staff','user')`; `users.password` → `VARCHAR(255)` (for `password_hash()`).
- ERD tables/columns as designed: `users` (fullname, email, phone, role, status), `cemetery_sections`, `cemetery_lots` (lot_code, section_id, block, lot_type, price, status), `reservations` (user_id, lot_id, reservation_date, purpose, number_of_slots, total_amount, payment_status, approved_status), `payments` (reservation_id, amount, payment_method gcash/card/cash, reference_no, payment_status), `audit_logs` (user_id, action, table_name, record_id).
- Add `burial_records` table: deceased full name, DOB, DOD, burial date, `lot_id` FK, burial type, owner/next-of-kin contact, interment status, `created_at`.
- Add `notifications` table: `user_id` FK, message, type, `is_read`, `created_at`.
- Extend `payments` with receipt fields: `receipt_path`, `validated_by` (FK users), `validated_at`.
- Indexes on searchable columns (fullname/name, dates, lot_code).
- Keep both `payment_status` and `approved_status` on reservations.

## API design
RESTful JSON under `/api`, consistent with Router conventions (GET list, GET `{id}`, POST create, POST `{id}` update, POST `{id}/delete`). To add:
- `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `/api/burial-records` CRUD
- `/api/reservations/{id}/approve`, `/api/reservations/{id}/reject`
- `/api/payments/{id}/upload-receipt`, `/api/payments/{id}/validate`
- `/api/notifications` (mine, mark read)
- `/api/reports/*` (reservations, burial-records, payments, audit-logs, availability)
- `/api/backup/export`, `/api/backup/import`
- `/api/stats/dashboard`
- `/api/map` (sections + lots with SVG grid coordinates and status)

Always respond with proper HTTP status codes; validate inputs server-side; never trust client input; RBAC enforced on every route, not just in the UI.

## Frontend pages/routes (match the study's interface figures)
- Public: `/` (cemetery map, available/occupied plots, no login), `/login`, `/register`.
- Visitor (auth, role `user`): `/visitor/reserve`, `/visitor/reservations` (My Reservations), `/visitor/payments` (My Payments), `/visitor/profile` (Registration Info).
- Staff: `/staff` (Dashboard), `/staff/reservations`, `/staff/burial-records`, `/staff/users`, `/staff/reports`.
- Admin: `/admin` (Dashboard), `/admin/reservations`, `/admin/burial-records`, `/admin/users`, `/admin/reports`, `/admin/settings` (backup/restore).
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
- Verify with the Makefile workflow: `make up`, `make install`, `make migrate`; smoke-test API via curl; `pnpm build` must pass.
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
Auth/RBAC → Sections/Lots → Cemetery Map → Reservations → Payments → Burial Records → Notifications → Search → Reports → Dashboards → Backup/Restore. Priorities may shift between sprints based on feedback; each story ships as a complete vertical slice rather than a full layer.

When finished, summarize what was built per module and sprint, how to run it, and what remains for the study's actual deployment phase.