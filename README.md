# Cemetery Reservation and Records Management System

Web-based system for **St. John Memorial Garden & Parks** — a capstone project for managing cemetery lot reservations, payments, burial records, and visitor accounts.

Plain PHP (PDO) backend + React 18 SPA (Vite + pnpm) frontend, containerized with Docker.

## Tech stack

- **Backend:** PHP >= 8.1, PDO prepared statements only, lightweight custom MVC (`App\`)
- **Database:** MySQL 8.0, `utf8mb4` — schema authoritative in `database/schema.sql`
- **Frontend:** React 18 SPA, Vite, pnpm (pinned `pnpm@10.4.1`), `react-router-dom` v6
- **Mapping:** Leaflet.js + OpenStreetMap tiles
- **Containerization:** Docker Compose (PHP, Node, MySQL) + Makefile

## Features

### Implemented
- **Authentication & RBAC** — register, login, logout, session-based auth with CSRF protection (`password_hash` / `password_verify`), roles: `admin`, `staff`, `user`
- **User management** — admin creates/updates users, activates/deactivates accounts, assigns roles
- **Cemetery map** — Leaflet + OSM with lots color-coded by status (available/reserved/occupied), popups with details, reserve flow from the map
- **Reservations** — client submission, staff/admin approval/rejection, automatic lot locking (available → reserved)
- **Audit trail** — logs logins and every create/update/approve/delete action

### Roadmap
Payments & receipt validation → Burial records → Notifications → Search/filter → Reports → Dashboards → Backup/restore

## Getting started

### Prerequisites
- Docker + Docker Compose
- Make (optional — or run the docker commands directly)

### 1. Start the stack
```bash
make up            # docker compose up -d --build
```

### 2. Install dependencies
```bash
make install       # composer install + pnpm install (in containers)
```

### 3. Initialize the database
The schema (including seed data) auto-loads on first MySQL start. To (re)apply it manually:

```bash
docker compose exec -T mysql mysql -u cemetery_user -psecret -e "DROP DATABASE IF EXISTS cemetery_db;"
docker compose exec -T mysql mysql -u cemetery_user -psecret < database/schema.sql
```

### 4. Run the app
| Service | URL | Purpose |
| --- | --- | --- |
| React dev server | http://localhost:5173 | Hot-reload development |
| PHP (production build) | http://localhost:8000 | Serves built bundle + `/api` |

For production mode, build the frontend first:
```bash
docker compose exec node pnpm build
```

## Default accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@cemetery.test` | `admin123` |

Additional users are created via the app (User Management) or `POST /api/auth/register`.

## Project structure

```
├── public/index.php          # Front controller (JSON API + SPA)
├── src/
│   ├── bootstrap.php         # Env + autoloader
│   ├── Config/Database.php   # PDO singleton
│   ├── Core/                 # Router, Session, Csrf, Auth, Response
│   ├── Controllers/          # Request logic
│   └── Models/               # Data layer (Model base + entities)
├── database/schema.sql       # Authoritative schema + seed data
├── resources/
│   ├── js/                   # React SPA (contexts, components, pages, lib)
│   └── css/app.css           # All styling
├── docker-compose.yml        # php / node / mysql services
├── Dockerfile                # PHP 8.3-cli + composer
├── docker/node.Dockerfile    # Node 22 + pnpm
└── Makefile                  # up, down, install, migrate, fresh, ...
```

## API overview

RESTful JSON under `/api`. Mutations require a CSRF token (`GET /api/csrf-token` → send as `X-CSRF-Token` header).

| Endpoint | Method | Access |
| --- | --- | --- |
| `/api/auth/register` | POST | Public |
| `/api/auth/login` | POST | Public |
| `/api/auth/logout` | POST | Auth |
| `/api/auth/me` | GET | Auth |
| `/api/users` | GET/POST | admin, staff |
| `/api/users/{id}` | GET/POST | admin, staff |
| `/api/map` | GET | Public |
| `/api/lots` | GET | Public |
| `/api/lots/available` | GET | Public |
| `/api/reservations` | GET | admin, staff |
| `/api/reservations/mine` | GET | user |
| `/api/reservations` | POST | Auth |
| `/api/reservations/{id}/approve` | POST | admin, staff |
| `/api/reservations/{id}/reject` | POST | admin, staff |

## Development workflow

```bash
make logs        # tail container logs
make php         # shell into PHP container
make node        # shell into Node container
make mysql       # interactive MySQL shell
make fresh       # rebuild everything from scratch
```

## Security

- All SQL via PDO prepared statements
- Passwords hashed with `password_hash()` (bcrypt)
- Server-side RBAC on every protected route (not just UI)
- CSRF token required on all mutating requests
- Sessions with HttpOnly/SameSite cookies
- Input validation and uniqueness checks server-side
- Personal data minimized per the Data Privacy Act of 2012; audit trail retained

## Conventions

- PHP: `declare(strict_types=1)`, PSR-4 `App\`, existing style
- React: function components + hooks, no TypeScript
- Conventional commits (`feat:`, `fix:`, `refactor:`, ...)
- `database/schema.sql` stays authoritative — a fresh import reproduces the whole DB