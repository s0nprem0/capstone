# Tech demo runbook

Everything needed to get the system to a demonstrable state, and a suggested
order to show it in.

## Run it

```bash
make setup     # .env (if absent) + up + install + migrate + map-data
make demo      # load the demo dataset
make build     # build the frontend bundle
```

`make setup` collapses the bring-up steps and writes `.env` from `.env.example`
if it is missing (the file is gitignored, so a clean clone has none; under Docker
it is optional since compose injects `DB_*`). Running the steps by hand:

```bash
make up && make install && make migrate && make map-data && make demo && make build
```

On a bare Podman install, use `make DC="podman-compose" setup` (see the Podman
notes in [README.md](README.md)).

Then open **http://localhost:8000**. The bundle is built into `public/dist`,
inside the docroot the PHP server serves from, so :8000 is the only address you
need — the Vite dev server on :5173 is optional and only useful while editing.

If you would rather show the project with no client data at all, run
`make migrate && make map-data` and stop there. That gives 6734 available plots,
one admin, and an empty queue.

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

6734 plots across 70 sections: **6714 available, 17 occupied, 3 reserved**. That
split is chosen so all three status colours are visible on the map at once,
which is the thing the redesign is about.

The plots are the real survey of St. John Memorial Garden & Parks, read from
the scanned plan `public/traces/survey-lines.png` and its clean redraw
`public/traces/cemetery-base.png` by `tools/trace_plan.py`. Each cell the plan
draws becomes a plot — 6734, which is what the drawing says rather than what a
threshold recovered — and the fold in the paper is never taken for a line (see
`database/survey/README.md`). The map base is a render of that same scan, so
plots and plan land on each other exactly. A lot code is
`S<section number>-<position in section>`, e.g. `S3-001`.

Every section in the surveyed set holds at least one plot. Two of them,
**North Strip A** and **North Strip B**, sit outside the numbered blocks; the
rest are the numbered `Section 3`–`Section 68` rows.

22 reservations covering every status the schema allows — 3 awaiting approval,
17 approved, 2 rejected. 4 burial records, 3 interred and 1 scheduled. 9 users,
one of them inactive. 63 audit-log entries.

The rows are internally consistent on purpose, because the obvious question
about a coloured plot is what is behind it:

- a plot is `occupied` once its reservation has been approved, or when a burial
  record claims it
- a plot is `reserved` while an unapproved reservation holds it
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
   available one, pick a date and submit. Only their own reservations are
   listed, and the plot they chose turns amber on the map while it is held.
3. **Sign in as `staff@cemetery.test`** — the staff dashboard. The occupancy
   plan shows where the pressure is; the rail beside it queues the three
   reservations awaiting approval and the interment still scheduled. Work the
   queue: approve a reservation and watch the plot change colour on the map.
4. **The bidirectional link** — from a reservation row, open the plot on the
   map. The plot's detail pane links back to the reservation. It is the same
   state in the URL, so the address bar is shareable.
5. **Reports** — reservations, burial records, availability, audit log. The
   audit log is the record of the actions just taken.
6. **Sign in as `admin@cemetery.test`** — users, sections and lots, and
   backup/restore (admin only; staff get 403 on it, worth saying out loud).

Steps 3 and 4 are the ones to slow down on. Everything else is context.

## Before you present

- [ ] `make migrate && make map-data && make demo && make build` from a clean checkout
- [ ] http://localhost:8000 loads with styling, not a blank page
- [ ] `bash /tmp/opencode/demo-walk.sh` passes, if you have it
- [ ] browser zoom at 100%; the layout is built for 1366x768 and up

## Resetting

```bash
make migrate   # drops every table and reloads schema.sql
make map-data  # reloads the surveyed sections and plots
```

`migrate` is destructive by design — that is what makes it able to put the
database back the way the schema says it should be. `make demo` is re-runnable
on its own: it truncates the transactional tables first and reloads them, and
leaves sections, plots and the admin account alone. `map-data` replaces the
plots rather than adding to them, so it is the step to run after editing the
survey trace — but it takes the reservations and burials with it, because those
hang off the plots. Load `make demo` after it, not before.

The demo dataset lives in `database/demo.sql` rather than `schema.sql` on
purpose. `schema.sql` is the authoritative definition of the database and a
fresh `make migrate` has to reproduce it; invented clients with hand-picked
dates are presentation, not schema.
