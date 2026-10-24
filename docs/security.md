# Security

**Cemetery Reservation and Records Management System** — St. John Memorial
Garden & Parks.

How the system protects accounts, cemetery records, and personal data; what is
enforced in code; and what remains an accepted risk before production
deployment. For the architecture see [architecture.md](architecture.md), for the
API and schema see [technical-manual.md](technical-manual.md), and for the user
view see [user-manual.md](user-manual.md).

**Last reviewed:** 2026-10-20. Update this file whenever authentication,
authorization, routes, headers, personal-data fields, or backup behaviour change.

---

## 1. Scope and assets

Protected assets, in order of sensitivity:

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Account credentials | `users.password` (bcrypt hash), Laravel session, `APP_KEY` | Account takeover, staff/admin abuse |
| Personal data | `users`, `reservations`, `payments`, `burial_records`, `lot_owners`, `notifications` | Data Privacy Act of 2012 (RA 10173) obligations |
| Cemetery records | `cemetery_sections`, `cemetery_lots`, `reservations`, `burial_records`, `lot_owners` | Financial and legal records; plot ownership |
| Audit trail | `audit_logs`, `login_attempts` | Accountability and incident investigation |
| Database backups | SQL export (download) | Contains all of the above, including password hashes |
| Application secrets | `.env` / process environment (`DB_*`) | Direct database access |

There are **no external services**: no payment gateway, no map tiles, no
analytics, and no third-party fonts at runtime. The browser only talks to the
application origin.

## 2. Actors and trust boundaries

| Actor | Trust | Can reach |
| --- | --- | --- |
| Public (not signed in) | Untrusted | Public map and memorial read endpoints, login/register |
| Visitor (`user`) | Authenticated, untrusted input | Own profile, reservations, payments, notifications |
| Staff (`staff`) | Authenticated, trusted operator | Reservation, payment, burial, user, report operations |
| Administrator (`admin`) | Authenticated, highest trust | Everything, including roles, deletes, and backup/restore |
| Office network / host | Trusted infrastructure | MySQL and the PHP process |

Boundaries where input must never be trusted:

- **Browser → Laravel** (`public/index.php`, `routes/api.php`): every parameter,
  header, JSON body, query string, and uploaded file.
- **Laravel → MySQL** (`App\Models\*`, the query builder): all SQL is
  parameterized; identifiers come from code, never from request values.
- **Admin → backup/restore**: an administrator can upload a backup that is
  executed as the application's database user. Only the statement shapes the
  export writes are accepted (section 11), but it is still a privileged,
  high-impact action.
- **Public internet → deployment**: TLS termination, firewall, and service
  exposure are deployment responsibilities (section 13).

## 3. Roles and permissions

Authorization is enforced server-side on every route: `routes/api.php` puts
each route behind the `role:` middleware (`App\Http\Middleware\EnsureRole`)
for the roles that may call it, and the controllers add the ownership checks.
Client-side route guards (`resources/js/components/RouteGuards.jsx`) only
improve the experience; bypassing them gains nothing. The "Enforced in" column
names the controller; its role comes from the route's middleware group.

| Capability | Public | `user` | `staff` | `admin` | Enforced in |
| --- | --- | --- | --- | --- | --- |
| View map, plots, public memorial search | yes | yes | yes | yes | `MapController`, `LotController`, `BurialRecordController::memorials` |
| View all reservations | – | – | yes | yes | `ReservationController::index` |
| View own reservation | – | own only | yes | yes | `ReservationController::show` |
| Create reservation | – | own only | any visitor | any visitor | `ReservationController::store` |
| Update, approve, reject, delete reservation (delete only while it has no payments) | – | – | yes | yes | `ReservationController` |
| Cancel reservation (pending, no payments) | – | own only | – | – | `ReservationController::cancel` |
| View all payments | – | – | yes | yes | `PaymentController::index` |
| View own payments | – | yes | – | – | `PaymentController::mine` |
| Record/update payment | – | – | yes | yes | `PaymentController` |
| Delete payment | – | – | – | yes | `PaymentController::destroy` |
| View burial records | – | – | yes | yes | `BurialRecordController` |
| Create/update burial record | – | – | yes | yes | `BurialRecordController` |
| Delete burial record | – | – | – | yes | `BurialRecordController::destroy` |
| View/record/update plot owners | – | – | yes | yes | `LotOwnerController` |
| Remove plot owner | – | – | – | yes | `LotOwnerController::destroy` |
| View users | – | own profile via `/auth/me` | yes | yes | `UserController` |
| Update user | – | own profile only | own profile and visitor accounts | all accounts | `UserController::update` |
| Create/delete user, assign roles | – | – | – | yes | `UserController` |
| View sections | – | – | yes | yes | `SectionController` |
| Create/update/delete sections | – | – | – | yes | `SectionController` |
| View plots | yes | yes | yes | yes | `LotController` |
| Update plot | – | – | yes | yes | `LotController::update` |
| Create/delete/import/regrid plots | – | – | – | yes | `LotController` |
| Dashboard and reports | – | – | yes | yes | `StatsController`, `ReportController` |
| Audit-log report | – | – | yes | yes | `ReportController::auditLogs` |
| Backup export/import, record summary, reset records | – | – | – | yes | `BackupController` |
| Own notifications | – | yes | yes | yes | `NotificationController` |

Additional account-safety rules in `UserController`:

- Staff can see staff and admin accounts in the user list but can edit only
  their own and visitor (`user`) accounts, so one staff member cannot reset
  another's password or deactivate them.
- Only an administrator can change a role; nobody can change their own role.
- Nobody can deactivate or delete their own account.
- A user with reservations cannot be deleted; deactivate the account instead.
- Changing your **own** password requires the current password. Staff/admin
  password resets for another account do not; staff can reset only visitor
  passwords.
- Visitors can update only their own name, email, phone, and password.

## 4. Authentication

- **Registration** (`POST /api/auth/register`) creates a `user` account, hashes
  the password with bcrypt (the `User` model's `hashed` cast), validates the email
  (`RegisterRequest`),
  enforces an 8-character minimum, and rejects duplicate emails. Successful
  registration starts a session.
- **Login** (`POST /api/auth/login`) checks the bcrypt hash through
  `Auth::attempt()`, whose `active-users` provider finds only accounts with
  `users.status = 'active'`. A hash made at a lower bcrypt cost is rehashed at
  the current one on a successful login. A success
  regenerates the session ID and clears failed attempts for that account from
  that IP. A blank email or password is a `422` and is not counted.
- **Logout** (`POST /api/auth/logout`) writes an audit entry, invalidates the
  session and issues a new CSRF token.
- **Throttling** (`App\Support\LoginThrottle`): 5 failed attempts on one account from
  one IP address, or 20 from one IP address across all accounts, in a rolling
  15-minute window, tracked in `login_attempts`. The next attempt answers HTTP
  429. Keying on the account keeps one clerk's typos from locking out every desk
  behind the office's shared address.
- **Failure messages**: login answers the same "Incorrect email or password"
  for a wrong password and an unknown account, avoiding account enumeration at
  the login form, and warns when 2 or fewer attempts remain. A deactivated
  account is named only when the correct password is given, which tells a
  guesser nothing. Registration does disclose whether an email is already registered.
- **No password reset, email verification, or MFA** is implemented. There is no
  self-service recovery; an administrator or staff member resets the password.

## 5. Sessions

Laravel's session (`config/session.php`, file driver under
`storage/framework/sessions`) sets the cookie
`cemetery-reservation-system-session`, encrypted with `APP_KEY`:

| Attribute | Value |
| --- | --- |
| `HttpOnly` | yes |
| `SameSite` | `Lax` |
| `Secure` | set when the request arrived over HTTPS (`AppServiceProvider`), unless `SESSION_SECURE_COOKIE` says otherwise |
| `Path` | `/` |
| Cookie lifetime | session cookie; ends when the browser closes (`SESSION_EXPIRE_ON_CLOSE`) |
| Idle timeout | `SESSION_LIFETIME` minutes (120) without a request, enforced server-side |

The session ID is regenerated on login and registration, and the session is
invalidated on logout. The auth guard re-reads the account on every request
through the `active-users` provider, which ignores `inactive` accounts, so
deactivating an account ends its open sessions on their next request.

**Limitations:** there is no absolute session lifetime: a session kept active
lasts until the browser closes or the user logs out. Anyone holding `APP_KEY`
can forge session cookies, so treat it as a secret.

## 6. Authorization

- The `role:` route middleware runs before any protected controller and answers
  `401` when unauthenticated, `403` when the role is wrong.
- Ownership checks supplement roles: a visitor may read only their own
  reservation (`ReservationController::show`); `mine` endpoints always filter by
  `Auth::id()`, never by a client-supplied user ID.
- A visitor cannot book for another user: `store` accepts `user_id` from staff
  and admins, but forces `Auth::id()` for visitors.
- Every state-changing route except login/register is a `POST` covered by the
  CSRF middleware.
- Unknown API paths return `404`; unhandled exceptions return a generic
  `500` and are logged server-side (`storage/logs`). Every API error, whatever
  raised it, renders as `{"error": "..."}` (`bootstrap/app.php`), so stack
  traces never reach the client from `/api`.

Routes reachable without a session: `GET /api/map`, `GET /api/csrf-token`,
`GET /api/lots`, `GET /api/lots/available`, `GET /api/lots/{id}`,
`GET /api/lots/{id}/memorials`, `GET /api/memorials`,
`POST /api/auth/login`, `POST /api/auth/register`.

## 7. CSRF

`App\Http\Middleware\VerifyCsrfToken` (Laravel's `ValidateCsrfToken`) rejects
any `POST` to a non-public route without a valid `X-CSRF-Token` header,
answering `419`. The token is a 40-character random string stored in the
session and compared with `hash_equals()`; the `XSRF-TOKEN` cookie is not sent.

- Login and registration are exempt because they create the session.
- The SPA fetches the token from `GET /api/csrf-token`, caches it in memory, and
  retries once on `419` (`resources/js/lib/api.js`). The token is never written
  to `localStorage`.
- `GET` requests are not state-changing, so they do not require a token.
- There are no cross-origin CORS headers; Laravel's default CORS middleware is
  removed, so the API is same-origin only.

## 8. Input validation and injection

- **SQL**: Eloquent and the query builder over PDO with
  `ATTR_EMULATE_PREPARES => false`; all values are bound. Raw fragments
  (`selectRaw`, `whereRaw`) are fixed strings chosen by code with bound values,
  identifiers come from model classes, and lot pagination limits are clamped in
  `Lot::window`.
  The backup restore path is the deliberate exception (section 11).
- **Types and formats**: route `{id}` values must be digits (`Route::pattern`),
  anything else is a `404`; emails use `FILTER_VALIDATE_EMAIL` (`email:filter`);
  dates must be real `YYYY-MM-DD` calendar dates; enums are checked
  against allowlists; phone numbers and password length are validated. Text,
  numbers and plot geometry are checked against their column's width and range
  (a `422`, never a database `500`), ids must be integers rather than cast
  (`["5"]` is refused, not read as `1`), and a list where text is expected
  (`?q[]=`) is refused or ignored. Search terms are matched literally: `%` and
  `_` are escaped in every `LIKE` (`App\Support\Search`).
- **Uniqueness and integrity**: duplicate emails and `lot_code`s are rejected;
  reservation capacity is checked against the lot type; lot claiming uses a
  transaction with `SELECT ... FOR UPDATE`, as do burials (against the plot's
  capacity) and payments (against their reservation, which the hold expiry
  also locks); a grid import is all or nothing; burials require a reserved or
  occupied plot, fit within its capacity (cremations excepted), mark it
  occupied, and have birth, death and burial dates in order; a plot held by a
  pending or approved reservation or a burial cannot be set back to
  available by hand.
- **Output**: React escapes interpolated text; the frontend does not use
  `dangerouslySetInnerHTML`. CSV exports prefix cells beginning with `= + - @`
  with `'` to prevent spreadsheet formula injection.
- **Client-side validation** mirrors the server rules but is never the only
  check.

Validation is implemented per endpoint: Form Requests (`app/Http/Requests`) or
`$request->validate()` for field rules, and explicit checks in the controller
for rules that depend on the database or the caller. Blank strings are not
converted to null (`ConvertEmptyStringsToNull` is off), because several updates
read `""` as "clear this field". New endpoints must repeat the same checks; see
the conventions in `AGENTS.md`.

## 9. HTTP security headers and caching

`App\Http\Middleware\SecurityHeaders` applies these to every response Laravel
sends (JSON, the SPA shell, errors):

| Header | Value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

`X-Frame-Options` and `frame-ancestors` both deny framing. JSON
`GET` responses also send `Cache-Control: private, no-cache` and an `ETag`
(`cache.headers` middleware), so per-user data is revalidated rather than
shared. Responses are gzip-compressed at the application layer when the client
accepts it (`Compress`). Static files under `public/` are served by the web
server directly and carry only the headers it adds.

**Not set:** `Strict-Transport-Security` (HSTS) and a script/style
`Content-Security-Policy`. The current CSP only controls framing; it does not
restrict script or style sources. Add HSTS at the TLS terminator and tighten the
CSP once the Vite asset graph and inline styles are audited.

## 10. Audit logging

`audit_logs` records the actor (`user_id`), action, table, record ID, client IP
address, timestamp, and `details`: for an update, each changed field as an
old/new pair; for a create or delete, the fields that identify the row (a
deleted payment keeps its amount, method and reservation). Password hashes and
traced map outlines are recorded only as "changed" (`AuditLog::MASKED`).
Entries are written for:

- registration (actor null), login, logout, and failed logins (actor null,
  with the email that was tried);
- expiry of an unpaid pending reservation (actor null);
- create/update/approve/reject/cancel/delete on reservations;
- create/update/delete on payments and burial records;
- create/update/delete/import/regrid on lots and sections;
- create/update/delete on users;
- create/update/delete on plot owners;
- backup export, import, failed imports, and record resets (with the counts
  cleared).

The audit report is available to **staff and administrators** at
`GET /api/reports/audit-logs` (an optional date range, paged with `limit` and
`offset`; the Reports page exports every page to CSV). There is no delete or
edit endpoint for audit rows, and a restore does not touch them (section 11).

**Limitations:** the user agent is not recorded. An entry names its actor by
`user_id`, so after a restore that changes who holds an ID, older entries show
the name of the account that holds it now. Anyone with direct database access
can still edit the table; for tamper evidence, ship the log off the host.

## 11. Backup and restore

- `GET /api/backup/export` and `POST /api/backup/import` are admin-only and
  audit-logged.
- The export is a SQL dump of every table, including **password hashes and
  personal data**. Store and transfer it as sensitive material.
- Import accepts a file upload or a raw request body up to 50 MB. The file must
  start with the export's header line, and every statement must be one the
  export writes (`SET NAMES`, `SET FOREIGN_KEY_CHECKS`, `DROP TABLE IF EXISTS`,
  `CREATE TABLE`, `INSERT INTO`); anything else rejects the whole file before
  a statement runs.
- Statements for `audit_logs` are skipped, so a restore can neither erase nor
  rewrite the audit trail; the live log is kept as it is.
- MySQL commits DDL on its own, so a restore cannot be one transaction. The
  current database is dumped first; if a statement fails part-way, that dump is
  played back and the response says the database was put back. Only if the
  play-back itself fails is the database left partial (HTTP 500), and the
  admin must restore the last good file. Error details go to the server log,
  not the response.
- `login_attempts` and Laravel's `migrations` table are not in the export's
  fixed table order but are included via the `SHOW TABLES` fallback. Sessions
  and cache are files, not tables, so a restore does not sign anyone out.
- The dump, statement allowlist and roll-back live in
  `App\Services\DatabaseBackup`.
- `POST /api/backup/reset` (admin) deletes reservations, payments, burial
  records, plot owners, notifications and sign-in attempts, and sets every plot
  available, in one transaction. It requires the administrator's own password
  and the typed word `RESET`; users, sections, plots and `audit_logs` are kept,
  and the reset is logged with the counts it cleared. Download a backup first:
  only a restore undoes it.
- `GET /api/backup/summary` (admin) returns record counts and the last backup,
  restore and reset times from the audit log.

Operational rules:

- Treat a backup file as a credential: encrypt it at rest, restrict who can
  download it, and delete old copies on a schedule.
- Only restore backups you produced or have reviewed. A file in the export
  format can still drop tables or insert arbitrary accounts.
- Prefer restoring from the `mysql` client against a separate maintenance user
  during a maintenance window, rather than through the web endpoint.
- Test a restore on a copy before relying on the backup.

## 12. Personal data and the Data Privacy Act of 2012

| Table | Personal data |
| --- | --- |
| `users` | Full name, email, phone, bcrypt password hash, role, status |
| `reservations` | User, plot, reservation date, free-text purpose, amount |
| `payments` | Amount, method, reference number, notes, recording staff member |
| `burial_records` | Deceased name, birth/death dates, burial date, plot, type, next-of-kin name and phone |
| `lot_owners` | Owner and co-owner names as the sales book writes them, sub-plot, payment terms, notes |
| `database/ledger/` (local files, gitignored, not used by the app) | Photos and transcription notes of the handwritten sales book, and earlier database dumps with password hashes; keep off shared drives and delete after encoding |
| `notifications` | Message text, recipient |
| `audit_logs` | Actor, action, record ID, IP address, timestamp; changed values (which can include names, emails, phones and amounts) and the email tried on a failed login |
| `login_attempts` | IP address, attempted email, timestamp |

**Public disclosures** (by design, but must be covered by the site's privacy
notice):

- The public map returns every plot's code, block, type, price, description,
  geometry, and status, **including reserved and occupied** plots. It does not
  return owner or next-of-kin details.
- `GET /api/memorials?q=...` (minimum 3 characters) and
  `GET /api/lots/{id}/memorials` return the deceased's name, date of death, plot
  code, and section for records whose interment status is `interred`. They do
  not return birth dates or next-of-kin details, and are capped at 50 results.
- Interments encoded from the sales book are filed like any other, so those
  marked `interred` join the public memorial search. Plot owners are never
  public.

**Minimization already in place:** the reservation draft in `localStorage`
deliberately omits the free-text purpose; the app makes no analytics or
third-party requests; session data is not stored in `localStorage`; API
responses strip password hashes (`User::$hidden`).

**Gaps to close before production:**

- No privacy notice or consent capture at registration.
- No retention schedule: `audit_logs` and `login_attempts` grow indefinitely.
- No data-subject access/erasure workflow. A user with reservations cannot be
  deleted, and burial/audit records are retained for legal and accountability
  reasons.
- No encryption at rest configured for MySQL or backup files; rely on host disk
  encryption until then.
- No role-based field redaction inside burial records for staff; staff see full
  next-of-kin details.

## 13. Deployment hardening checklist

The repository defaults are for local development only. Before deploying:

- [ ] Serve only over HTTPS and redirect HTTP to HTTPS. Enable HSTS at the
      proxy/web server. Keep the app's `Secure` cookie working behind a proxy by
      trusting it (`$middleware->trustProxies(...)` in `bootstrap/app.php`), or
      set `SESSION_SECURE_COOKIE=true`.
- [ ] Change the seeded administrator password (`admin@cemetery.test` /
      `admin123`) and every default database credential.
- [ ] Keep `.env` out of version control and readable only by the PHP user
      (the repo already git-ignores it). Never commit real secrets.
- [ ] Generate a fresh `APP_KEY` for the deployment (`php artisan key:generate`)
      and set `APP_ENV=production`, `APP_DEBUG=false`; with debug on, a
      non-API error page shows stack traces and configuration.
- [ ] Run `php artisan config:cache` and `route:cache`, and make `storage/` and
      `bootstrap/cache/` writable by the PHP user only.
- [ ] Create a dedicated MySQL user for the app with only the privileges the app
      needs. Use a separate, temporary user for restore if DDL is required.
- [ ] Do not expose MySQL (`3306`) or phpMyAdmin (`8080`) to the internet. The
      compose file publishes both for development; remove those mappings in
      production.
- [ ] Use Apache/nginx with PHP-FPM, not the PHP built-in server used by the
      dev container. Set `display_errors=Off`, `expose_php=Off`, and log errors
      to a protected file.
- [ ] Review `SESSION_LIFETIME` (idle timeout, 120 minutes by default) for the
      office's workstations.
- [ ] Encrypt and access-control backups; keep copies off the application host;
      test a restore.
- [ ] Apply OS, PHP, and MySQL security updates; restrict inbound ports with a
      firewall; run the app and database as separate, least-privileged accounts.
- [ ] Publish a privacy notice, consent language at registration, a retention
      schedule, and a data-subject request contact.
- [ ] Review user accounts and roles, deactivate leavers, and monitor audit
      logs, 429s, and 500s.
- [ ] Run `php artisan schedule:run` from cron every minute so
      `reservations:expire` runs even when the API is idle.
- [ ] Add automated security checks (`composer audit`, `pnpm audit`,
      `make test`, `pnpm build`, API smoke tests) to the release routine.

## 14. Known limitations and accepted risks

| Risk | Impact | Current mitigation / status |
| --- | --- | --- |
| No MFA | A stolen password is enough to sign in | Rate limiting only; planned for deployment |
| No password reset or email verification | No self-service recovery; addresses unverified | Admin/staff reset; document process |
| Password minimum is 8 characters, no complexity rule | Weak passwords possible | bcrypt hashing; consider a stronger policy |
| Login throttling is per IP (per account, plus a per-address ceiling) | Distributed attacks across many addresses bypass it | 5 per account / 20 per address per 15 min; add per-account throttling across addresses |
| Registration and public memorial search are not rate-limited | Account spam and name/plot scraping | Add throttling and monitoring |
| Registration reveals whether an email exists | Account enumeration | Generic login message; consider a neutral registration response |
| No absolute session timeout | A stolen cookie in active use stays valid until logout/browser close | 120-minute idle timeout; add an absolute limit if required |
| `Secure` cookie follows the request's HTTPS detection | Missing flag behind an untrusted proxy | Trust the proxy or set `SESSION_SECURE_COOKIE=true` |
| `APP_KEY` signs and encrypts session cookies | A leaked key lets an attacker forge sessions | Keep `.env` private; rotate the key (`APP_PREVIOUS_KEYS`) if exposed |
| No HSTS or script-level CSP | Weaker transport/clickjacking hardening | XFO/CSP frame denial in place; add at deployment |
| Backup import runs export-format SQL as the app DB user | A crafted file can replace any table's data if an admin account is abused | Admin-only, CSRF-protected, 50 MB cap, statement allowlist, audit log preserved; review files, use least privilege |
| Public memorial search exposes deceased names, dates, and plots | Privacy exposure beyond the family | Intentional feature; requires privacy notice and policy |
| No retention/erasure workflow | Indefinite retention of personal data | Manual operations; define a schedule |
| No encryption at rest | Disk/host compromise exposes data | Host disk encryption recommended |
| Audit trail lacks the user agent | Harder investigations | IP and before/after values are recorded; add the user agent if required |
| Seeded admin and compose credentials are public | Trivial takeover if unchanged | Change before deployment |
| Dev services (MySQL, phpMyAdmin) are published | Direct database exposure | Development only; remove in production |

## 15. Verification

Quick checks against a running dev instance:

```bash
# Security headers on a public JSON response
curl -sI http://localhost:8000/api/map | grep -iE 'x-frame|x-content|csp|referrer|permissions'

# Unauthenticated protected endpoint -> 401
curl -i http://localhost:8000/api/users

# Mutation without a CSRF token -> 419
curl -i -X POST http://localhost:8000/api/reservations \
  -H 'Content-Type: application/json' -d '{}'

# Get a token, then call an admin-only endpoint as a visitor -> 403
curl -c /tmp/cj -s http://localhost:8000/api/csrf-token
# (sign in with a visitor account, sending the token as X-CSRF-Token,
#  then reuse the cookie jar against /api/backup/export)
```

RBAC, CSRF-exempt routes, ownership checks, the login throttle and the backup
allowlist are also covered by the PHPUnit suite (`make test`, `tests/Feature`),
which runs against its own `cemetery_test` database. Do not run the
login-throttle test against a production instance.

## 16. Reporting and change control

- Report suspected vulnerabilities privately to the project maintainer; do not
  open a public issue with exploit details.
- Re-review this document at the end of any sprint that changes authentication,
  roles, a route guard, headers, personal-data fields, or backups.
- Keep the migrations authoritative: new personal-data columns must be
  added to section 12 and any new public read endpoint must be listed in
  section 6.
