# User Manual

**Cemetery Reservation and Records Management System**
for **St. John Memorial Garden & Parks**

This manual explains how to use the system, screen by screen, for each type of
user. No technical knowledge is assumed.

---

## 1. About the system

The system lets you:

- view the cemetery map and see which plots are **available**, **reserved**, or
  **occupied**;
- reserve a plot online and track whether it has been approved;
- record payments against a reservation (staff and administrator);
- keep burial (interment) records;
- send and receive notifications;
- generate printable reports, including a payments report; and
- export or restore a full backup of the data (administrator only).

The map is drawn from the cemetery's actual survey plan, so the plots you see
match the ground.

## 2. Getting started

### Opening the system

1. Open a web browser (Chrome, Edge, Firefox, or Safari), on a computer, tablet,
   or phone.
2. Go to the address given to you by the office — for a local installation it is
   **http://localhost:8000**.
3. The cemetery map opens. You do **not** need an account to look at it.

### Signing in

1. Choose **Sign In** at the bottom of the left-hand menu.
2. Enter your **Email** and **Password**, then choose **Sign In**.
3. If the details are wrong, a red message appears at the top of the form
   explaining the problem.

After five failed attempts from the same computer, sign-in is paused for
15 minutes as a security measure.

### Creating an account

1. On the sign-in page, choose the **Register** link.
2. Fill in your **Full Name**, **Email**, **Phone** (optional), **Password**, and
   **Confirm Password**. The password must be at least 8 characters.
3. Choose **Create account**. You are signed in and taken to the **Reserve a
   Lot** page.

### Signing out

Choose **Logout** at the bottom of the left-hand menu.

### Menus you will see

The left-hand menu changes with your role:

| You are… | The menu offers |
| --- | --- |
| Not signed in | Cemetery Map, Sign In |
| Visitor / Client | Cemetery Map, Reserve a Lot, My Reservations, Account settings, Notifications |
| Staff | Dashboard, Cemetery Map, Notifications, Reservations, Payments, Burial Records, Users, Reports |
| Administrator | everything Staff has, plus Sections, Lots, and Settings |

On a phone or narrow window, the menu is hidden behind the **☰** button at the
top-left. Tap it to open the menu; tap outside it, press **Esc**, or use the
**×** button to close it.

## 3. The cemetery map (everyone)

Open **Cemetery Map** (the home page). Everyone, signed in or not, can see it.

- **Sections** — the list on the left. Choose **Overview** to see the whole
  cemetery, or a section name to zoom into that section.
- **Filter** — type a lot code (for example `S9-060`) into the search box to
  find a specific plot, or choose **All Lots**, **Available**, **Reserved**, or
  **Occupied** to show only plots in that state.
- **Display** — the **Survey plan** switch turns the scanned survey picture on
  or off underneath the plots.
- **Legend** — the colours used on the map, with a count of each. Colour is never
  the only cue: each plot also shows its status in words when you open it.
- **Plot list** — when a section is open, or a search has matches, this list
  shows each plot as a button. This is the keyboard-friendly way to pick a plot:
  highlight a row with **Tab** and press **Enter**.
- **Map controls** — the **+**, **−**, and **⌂** (fit to view) buttons on the
  map. You can also drag to pan and pinch or scroll to zoom.

**To see a plot's details**, click it on the map or choose it in the plot list.
The panel on the right shows the plot code, section, block, type, price, and
status.

- If the plot is **available**, choose **Reserve this plot** (signed-in visitors)
  or **Sign in to reserve**.
- Staff and administrators also see the interment record filed against the plot.

## 4. Visitor / Client

### Reserving a plot

1. Open **Reserve a Lot** (or choose **Reserve this plot** on the map).
2. **Cemetery Lot** — pick an available plot. The list is grouped by section and
   shows the code and price.
3. **Reservation Date** — choose a date. Past dates are not allowed.
4. **Purpose** — optional note.
5. **Number of Slots** — how many spaces you need. The maximum depends on the
   plot type (single = 1, double = 2, family = 4).
6. Check the summary and the **Total**, then choose **Submit Reservation**.

The plot is immediately **held** for you (it turns amber on the map) while it
waits for approval. You will be notified when it is approved or rejected.

### My Reservations

Open **My Reservations** to see your own reservations only. Each row shows the
ID, plot, section, date, number of slots, amount, approval status, and **payment
status** (with how much has been paid of the total). Choose the plot code to see
it on the map. Use the search box or the **All approvals** dropdown to narrow the
list.

### Account settings

Open **Account settings** to update your **Registration info** (name, email, phone) and to
change your **Password**. Changing your password requires your current password.
Your role and account status can only be changed by an administrator.

### Notifications

The **Notifications** item shows a small number when you have unread messages.
Open it to read them. Choose **Mark read** on a single message or **Mark all
read** at the top.

## 5. Staff

### Dashboard

The dashboard gives a quick picture of the cemetery:

- **Occupancy** — a simplified plan and a bar showing how full the cemetery is.
- **Key figures** — totals for plots, reservations, approved reservations,
  burial records, and users.
- **Pending work** — links to any reservations awaiting approval or interments
  still scheduled.

### Reservations

Open **Reservations** for the full queue. Search by lot, client, section, date,
or status, or filter by approval. For each **pending** reservation you can:

- **Approve** — the plot becomes **Occupied** and the client is notified.
- **Reject** — the plot is released back to **Available** and the client is
  notified. You will be asked to confirm.

Only pending reservations can be approved or rejected.

### Payments

Open **Payments** to record and review payments taken at the office. Choose
**Record Payment** and fill in the form:

- **Reservation** — pick the reservation the payment is for. Each option shows the
  client, the reservation's payment status, and the remaining balance.
- **Amount (₱)** — how much was received.
- **Method** — Cash, GCash, Bank transfer, Cheque, or Other.
- **Payment Date** — when it was received.
- **Reference No.** — the GCash/bank/cheque reference, if any.
- **Notes** — optional.

The table lists every recorded payment (date, reservation, client, amount,
method, reference, who recorded it). Use the search box or the method filter to
narrow it. Choose **Edit** to correct a payment; **Delete** (administrators only)
removes one.

Recording a payment updates the reservation's **payment status** automatically —
**Unpaid**, **Partial**, or **Paid** — and the client is notified. Approving a
reservation is a separate step and is not blocked by payment.

### Burial Records

Open **Burial Records** — the **Register of Interments**. Choose **New Entry** to
file a burial, or **Edit** on an existing row.

Enter the deceased's full name, dates of birth and death, the burial date, the
burial type, the next of kin's name and phone, and the interment status
(**Scheduled** or **Interred**).

> **Plot ID** is the *number* of the plot, not its code. To find it, open the
> plot on the map and read the `lot=` number in the address bar, or use the
> number shown in list views.

A burial can only be filed against a plot that is **Reserved** or **Occupied** —
a free plot cannot host a burial. Use the search and the status/type dropdowns to
find entries. **Delete** removes an entry permanently and asks for confirmation.

### Users

Open **Users** to view accounts and their status. Search by name, email, phone,
role, or status, or filter by role and status. Staff can **Edit** a visitor
account, including setting its **Status** to Active or Inactive (an inactive
account cannot sign in). Admin accounts can only be managed by an administrator.

### Reports

Open **Reports** and choose a period — **This month**, **Last month**,
**This year**, **All time**, or your own **From** and **To** dates. The page shows,
for that period:

- **Reservations received** — by approval status, and the value booked.
- **Payments collected** — the total and a breakdown by method.
- **Interments** — scheduled and interred.
- **Plot availability** — as of today, for the whole cemetery and by section.
- **Audit log** — system activity in the period, with **Export CSV**.

**Print** prints the page for the chosen period.

For a full list, open **Reservations**, **Payments** or **Burial Records**, narrow
it with the search and filters, and use **Print** or **Export CSV** there. Both
keep your filters, and the printout notes which filters were applied.

## 6. Administrator

Administrators have everything Staff have, plus the following.

### Sections

Open **Sections** to manage the cemetery's sections (rows of plots). You can:

- **Add Section** — name, location, SVG view box, and description.
- **Edit** a section's details.
- **Edit outline** — open the **Section Editor**, where you draw or adjust the
  section's boundary on the survey plan. Changes save automatically; the editor
  shows **Saved ✓** when they do.
- **Edit lots** — open the **Lot Editor** for that section.
- **Reflow lots** — redraw the section's lots into a tidy grid inside its
  outline.
- **Lock / Unlock** — locking freezes the section's outline and lot geometry so
  it cannot be changed by accident. A locked section cannot be edited, reflowed,
  or deleted until it is unlocked.
- **Delete** — only empty sections can be deleted.

### Lot Editor

The **Lot Editor** shows the survey plan with the section's plots on top.

- **Pick a section** by typing its name in **Section**, or step through them
  with the arrow buttons beside it. **Find a lot** jumps to a plot by its code.
- **Highlight** available, reserved or occupied plots with the status chips; the
  others fade so you can see, for example, which plots are still free.
- **Select** a plot by clicking it. **Shift+click** adds or removes plots, and
  **Shift+drag** on an empty part of the map selects every plot in a box.
  **Ctrl+A** selects the whole section, or only the highlighted plots.
- **Move** the selection by dragging it or with the arrow keys (**Alt** for fine
  steps). **Shift+arrows** or the corner handle resize a single plot. Exact
  position and size can also be typed in the panel. Traced plots keep their
  outline when moved or resized.
- **Edit details** in the side panel. Fields save when you leave them or press
  **Enter**; **Esc** puts the saved value back. With several plots selected the
  panel sets type, price, block or status on all of them at once.
- **Add beside** (or **Ctrl+D**) adds a plot next to the selected one with the
  same size, type and price. With nothing selected, **Add lot** places one in
  the first free space. The next free lot code is assigned automatically.
- **Undo** and **Redo** (**Ctrl+Z**, **Ctrl+Shift+Z**) step back and forward
  through moves and edits in this visit. **Reflow grid** redraws every plot as
  an even grid and cannot be undone, so it asks first.
- **Delete** removes the selected plots; any plot linked to a reservation or
  burial record is kept and named in the message.

The header shows whether changes are waiting, saving or saved. A change the
server refuses (for example a lot code already in use) is put back and
explained. On a **locked** section, plots cannot be moved, added or deleted, but
their details can still be edited. The panel's **Keyboard and mouse** list has
every shortcut.

### Settings — Backup & Restore

Open **Settings**.

- **Backup** — choose **Download Backup (.sql)** to save a full copy of the
  database (structure and data) to your computer. Keep it somewhere safe.
- **Restore** — choose a `.sql` backup file, then **Restore Backup** and confirm.
  **This replaces all current data with the backup** and cannot be undone.

Backups and restores are recorded in the audit log.

## 7. Common tasks — quick reference

| I want to… | Go to | Then |
| --- | --- | --- |
| See which plots are free | Cemetery Map | Filter → **Available** |
| Reserve a plot | Cemetery Map or Reserve a Lot | pick a plot, choose a date, Submit |
| Check my reservation | My Reservations | read the Approval column |
| Approve a reservation | Reservations (staff) | **Approve** on a pending row |
| File a burial | Burial Records (staff) | **New Entry** |
| Record a payment | Payments (staff) | **Record Payment**, pick the reservation and amount |
| Generate a report | Reports (staff) | choose a period, **Print** |
| Export a list | Reservations, Payments or Burial Records (staff) | filter, then **Export CSV** or **Print** |
| Add a staff account | Users (admin) | **Add User** |
| Back up the data | Settings (admin) | **Download Backup (.sql)** |

## 8. Troubleshooting

| Problem | What to do |
| --- | --- |
| "Invalid credentials or inactive account" | Check the email and password. If it still fails, your account may be deactivated — ask an administrator. |
| "Too many failed login attempts" | Wait 15 minutes and try again. |
| "Lot is not available" | Someone else reserved it first. Choose another plot. |
| "Lot capacity exceeded" | Reduce the number of slots to the maximum shown for that plot type. |
| "A burial record requires a reserved or occupied lot" | Reserve and get the plot approved before filing a burial. |
| A page shows **Can't reach the server** | The system is temporarily unavailable. Check your connection and try again, or contact the office. |
| A red banner repeats a validation message | Correct the field it names; the message clears as soon as the value is valid. |

## 9. Glossary

| Term | Meaning |
| --- | --- |
| **Plot / Lot** | A single burial space. Identified by a code such as `S9-060`. |
| **Section** | A row or block of plots, numbered as on the survey plan. |
| **Available** | No live reservation and no burial — free to reserve. |
| **Reserved** | Held by a reservation that is awaiting approval. |
| **Occupied** | Approved reservation, or a burial has been filed against the plot. |
| **Pending / Approved / Rejected** | The state of a reservation. |
| **Unpaid / Partial / Paid** | How much of a reservation's total has been recorded as paid. |
| **Interment** | The burial itself; **Scheduled** or **Interred**. |
| **Block** | An optional sub-label within a section. |
