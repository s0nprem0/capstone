# Tech demo runbook

Everything needed to get the system to a demonstrable state, and a suggested
order to show it in.

## Run it

```bash
make up        # docker compose up -d
make install   # composer install + pnpm install
make migrate   # reset the database to database/schema.sql
make demo      # load the demo dataset
make build     # build the frontend bundle
```

Then open **http://localhost:8000**. The bundle is built into `public/dist`,
inside the docroot the PHP server serves from, so :8000 is the only address you
need — the Vite dev server on :5173 is optional and only useful while editing.

If you would rather show the project with no client data at all, run
`make migrate` and stop there. That gives 305 available plots, one admin, and
an empty queue.

## Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@cemetery.test` | `admin123` |
| Staff | `staff@cemetery.test` | `demo1234` |
| Staff | `rafael.mendoza@cemetery.test` | `demo1234` |
| Visitor | `juan.delacruz@demo.test` | `demo1234` |
| Visitor | `rosa.mercado@demo.test` | `demo1234` |
| Visitor | `pedro.bautista@demo.test` | `demo1234` |
| Visitor | `ana.reyes@demo.test` | `demo1234` |
| Visitor | `lito.garcia@demo.test` | `demo1234` |

`corazon.lim@demo.test` exists but is inactive — logging in as them returns
"Invalid credentials or inactive account", which is the point.

All demo accounts share one password so nothing has to be memorised on the spot.

## What is in the dataset

305 plots across 12 sections: **285 available, 12 occupied, 8 reserved**. That
split is chosen so all three status colours are visible on the map at once,
which is the thing the redesign is about.

22 reservations covering every status the schema allows — 3 awaiting approval,
17 approved, 2 rejected — and every payment state: 12 fully paid, 4 with a
balance outstanding, 1 whose payment was rejected, 1 with a payment still
sitting unvalidated. 17 payments across GCash, card and cash, totalling
**₱452,400** collected. 4 burial records, 3 interred and 1 scheduled. 9 users,
one of them inactive. 20 audit-log entries.

The rows are internally consistent on purpose, because the obvious question
about a coloured plot is what is behind it:

- a plot is `occupied` only when its reservation is fully paid, or a burial
  record claims it
- a plot is `reserved` only while a live reservation holds it
- a plot is `available` only when no live reservation and no burial touch it
- `number_of_slots` never exceeds the plot's capacity

`database/demo.sql` documents each rule at the top of the file, and the load
sets plot status in one place at the bottom so it can be checked against the
reservations by eye.

## Suggested walkthrough

Roughly eight minutes, in this order.

1. **As a guest, open http://localhost:8000** — the public cemetery map. Click
   through the sections, filter by status, search a plot code. Nothing is
   behind a login. Sign in to a plot to see it prompt you to log in.
2. **Log in as `juan.delacruz@demo.test`** — a visitor. Reserve a plot: pick an
   available one, choose a payment method, submit. Their own reservations and
   payments are the only ones listed.
3. **Sign in as `staff@cemetery.test`** — the staff dashboard. The occupancy
   plan shows where the pressure is; the rail beside it queues the three
   reservations awaiting approval, the payment awaiting validation, and the
   interment still scheduled. Work the queue: approve a reservation, validate
   a payment, and watch the plot change colour on the map.
4. **The bidirectional link** — from a reservation row, open the plot on the
   map. The plot's detail pane links back to the reservation. It is the same
   state in the URL, so the address bar is shareable.
5. **Reports** — reservations, payments, burial records, availability, audit
   log. The audit log is the record of the actions just taken.
6. **Sign in as `admin@cemetery.test`** — users, sections and lots, and
   backup/restore (admin only; staff get 403 on it, worth saying out loud).

Steps 3 and 4 are the ones to slow down on. Everything else is context.

## Before you present

- [ ] `make migrate && make demo && make build` from a clean checkout
- [ ] http://localhost:8000 loads with styling, not a blank page
- [ ] `bash /tmp/opencode/demo-walk.sh` passes, if you have it
- [ ] browser zoom at 100%; the layout is built for 1366x768 and up

## Resetting

```bash
make migrate   # drops every table and reloads schema.sql
```

`migrate` is destructive by design — that is what makes it able to put the
database back the way the schema says it should be. `make demo` is re-runnable
on its own: it truncates the transactional tables first and reloads them, and
leaves sections, plots and the admin account alone.

The demo dataset lives in `database/demo.sql` rather than `schema.sql` on
purpose. `schema.sql` is the authoritative definition of the database and a
fresh `make migrate` has to reproduce it; invented clients with hand-picked
dates are presentation, not schema.
