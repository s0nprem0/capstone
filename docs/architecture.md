# System architecture

A reconciliation of the study's layered architecture diagram with the system as
built. The layers and application modules match; the differences are called out
under [Deviations from the study diagram](#deviations-from-the-study-diagram).

## Layers

```mermaid
flowchart TB
  subgraph L1["1 · User Access Layer"]
    direction LR
    A1["Administrator"]
    A2["Cemetery Staff"]
    A3["Client / Visitor"]
    A4["Web Browser<br/>Chrome · Edge · Firefox · Safari"]
  end

  subgraph L2["2 · Presentation Layer — React 18 SPA"]
    direction LR
    P1["Page Views<br/>resources/js/pages<br/>Cemetery · Reservations · Payments · Burial Records"]
    P2["Shared Components<br/>Layout · RouteGuards · ConfirmButton"]
    P3["Cemetery Map Renderer<br/>CemeterySvgMap.jsx<br/>pure SVG, pan/zoom"]
    P4["Client Runtime<br/>react-router-dom · AuthContext · lib/api.js<br/>role guards · CSRF header · /api/map cache"]
  end

  subgraph L3["3 · Application Layer — Laravel 12 (PHP)"]
    direction LR
    M1["Authentication Module<br/>AuthController · session guard · VerifyCsrfToken · LoginThrottle"]
    M2["Reservation Management<br/>ReservationController"]
    M2b["Payment Monitoring<br/>PaymentController"]
    M3["Burial Records Management<br/>BurialRecordController"]
    M4["Cemetery Plot and Mapping<br/>Map / Lot / Section controllers"]
    M5["Notification Module<br/>NotificationController"]
    M6["Report Generation<br/>ReportController · StatsController"]
    M7["User and System Management<br/>User / Section / Backup controllers"]
    M8["API Interface Layer<br/>routes/api.php · role middleware (REST /api)"]
  end

  subgraph L4["4 · Data Layer — MySQL 8.0"]
    direction LR
    D0[("Database Server")]
    D1["Client Data<br/>users"]
    D2["Reservation Data<br/>reservations"]
    D3["Burial Records<br/>burial_records"]
    D4["Plot Status Data<br/>cemetery_sections · cemetery_lots"]
    D5["Notification Data<br/>notifications"]
    D6["Activity Logs<br/>audit_logs · login_attempts"]
    D7["Payment Records<br/>payments"]
  end

  subgraph L5["5 · External Services"]
    direction LR
    X1["None — no map tiles, font vendored, in-app notifications.<br/>The app makes zero external requests."]
  end

  subgraph L6["6 · Infrastructure Layer"]
    direction LR
    I1["Web Server<br/>Apache (XAMPP) or php artisan serve"]
    I2["Application Server<br/>PHP 8.3"]
    I3["Database Server<br/>MySQL 8.0"]
    I4["File Storage<br/>public/traces · public/fonts"]
    I5["Backup and Recovery<br/>BackupController · DatabaseBackup"]
  end

  A1 --> A4
  A2 --> A4
  A3 --> A4
  A4 --> P1
  P1 --> P2
  P1 --> P3
  P1 --> P4
  P4 --> M8
  M1 --> M8
  M2 --> M8
  M2b --> M8
  M3 --> M8
  M4 --> M8
  M5 --> M8
  M6 --> M8
  M7 --> M8
  M8 --> D0
  D0 --- D1
  D0 --- D2
  D0 --- D3
  D0 --- D4
  D0 --- D5
  D0 --- D6
  D0 --- D7
  I1 --> I2
  I2 --> I3
  I3 --> I5
  I2 --> I4
```

## Presentation layer (what runs in the browser)

The presentation layer is the React single-page app served from `public/dist`.
It holds no business rules — it renders state and forwards intent — and it is the
layer the user never sees as "code", only as screens.

| Piece | Where | Responsibility |
| --- | --- | --- |
| Page views | `resources/js/pages/` | One component per screen; 15 routes, lazy-loaded so the public map does not carry the admin editors |
| Shared components | `resources/js/components/` | `Layout` (sidebar, nav), `RouteGuards`, `ConfirmButton`, `EmptyState`, `Loading`, `PasswordInput` |
| Map renderer | `CemeterySvgMap.jsx` | Draws the survey as SVG; pan/zoom, status colouring, plot selection |
| Client runtime | `react-router-dom`, `AuthContext`, `lib/api.js` | Client-side routing, session state, role-based route guards, the `X-CSRF-Token` header, and the per-session `/api/map` cache |

## Data model

| Study datastore | Table(s) |
| --- | --- |
| Client data | `users` |
| Reservation data | `reservations` |
| Payment records | `payments` |
| Burial records | `burial_records` |
| Plot status data | `cemetery_sections`, `cemetery_lots` |
| Notification data | `notifications` |
| Activity logs | `audit_logs`, `login_attempts` |
| Report / backup data | none stored — reports are generated on demand and backups stream as a download |

The migrations define the tables and the seeder adds the 66 numbered sections; `database/survey/lots.sql` (loaded by
`make map-data`) adds the traced plots and brings the set to **70 sections and
6,769 plots**, including two perimeter blocks, *North Strip A* and *North Strip B*.

## Deviations from the study diagram

- **The Administrator actor is added to the user access layer.** The study
  diagram lists only Client/Visitor and Cemetery Staff; the system's RBAC has
  three roles — `admin`, `staff`, `user` — with the administrator managing
  users, sections, lots, reports, and backup/restore.
- **External Services is empty.** There is no external integration: the map is
  pure SVG (no tiles), the only font is vendored under `public/fonts`, and
  notifications are in-app. Payment is recorded manually, not through a gateway,
  so it needs no external service either. The layer exists but holds nothing.
- **File Storage is static assets only.** `public/traces` (map plan) and
  `public/fonts`; there is no user document store. Restore accepts an uploaded
  `.sql` file transiently and does not retain it.
- **Report / Backup data is not a datastore.** Reports are computed per request
  from the live tables; a backup is generated on demand through
  `BackupController` (`App\Services\DatabaseBackup`) and downloaded, not
  persisted server-side. Sessions and cache are files under `storage/`, not
  tables, so a restore never touches them.

## Infrastructure

The infrastructure chain matches the diagram: web server → PHP application →
MySQL, with file storage for static assets and backup/restore on the side. The
application is a Laravel 12 app with one entry point, `public/index.php`:
`routes/api.php` answers `/api/*` with JSON and `routes/web.php` returns the SPA
shell for every other path. In the containerized dev environment the web server
is PHP's built-in server (`php artisan serve`); under XAMPP it is Apache with the
`.htaccess` rewrites (see [../README.md](../README.md)).

Inside the application layer a request passes the `api` middleware group
(`bootstrap/app.php`): cookies and session, the CSRF check on POST, the sweep
that expires unpaid holds, and the conditional-GET ETag; then the route's
`role:` middleware (RBAC), then the controller. Security headers and gzip wrap
every response. Errors of every kind render as `{"error": "..."}`, the one
shape the SPA reads.
