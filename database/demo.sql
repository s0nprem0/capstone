-- Demo dataset for the tech demo.
--
-- Separate from schema.sql on purpose. schema.sql is the authoritative
-- definition of the database and a fresh `make migrate` has to reproduce it;
-- fake clients with invented names and hand-picked dates are presentation, not
-- schema, and folding them in would leave the adviser reading a seed section
-- full of fiction. Load schema.sql first, then this:
--
--   make migrate && make map-data && make demo
--
-- The rows below are not arbitrary. They satisfy the same invariants the
-- controllers enforce at runtime, because an adviser will click a coloured
-- plot and ask what is behind it:
--
--   * a lot is 'occupied' once its reservation has been approved, or when a
--     burial record claims the plot
--   * a lot is 'reserved' while an unapproved reservation holds it
--   * a lot is 'available' when no live reservation and no burial touch it
--   * number_of_slots stays within the lot's capacity (single 1, double 2,
--     family 4)
--
-- Every demo account uses the password demo1234. The seeded admin keeps
-- admin123. See DEMO.md for the walkthrough.

USE `cemetery_db`;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE `login_attempts`;
TRUNCATE TABLE `audit_logs`;
TRUNCATE TABLE `notifications`;
TRUNCATE TABLE `burial_records`;
TRUNCATE TABLE `payments`;
TRUNCATE TABLE `reservations`;
SET FOREIGN_KEY_CHECKS = 1;

-- ===== Staff and visitors =====
-- Re-runnable, so it has to clear the accounts it created last time. Ids are
-- explicit so the reservations below can name their owner directly, which also
-- makes user_id 1 the seeded admin: everything this file owns sits above it,
-- and that account is never touched.
DELETE FROM `users` WHERE `user_id` > 1;

INSERT INTO `users` (`user_id`, `fullname`, `email`, `phone`, `password`, `role`, `status`, `created_at`) VALUES
  (2, 'Elena Villanueva', 'staff@cemetery.test', '09170000002', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'staff', 'active', '2026-01-12 08:00:00'),
  (3, 'Rafael Mendoza', 'rafael.mendoza@cemetery.test', '09170000003', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'staff', 'active', '2026-01-12 08:05:00'),
  (4, 'Juan Dela Cruz', 'juan.delacruz@demo.test', '09171234567', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'user', 'active', '2026-02-10 09:00:00'),
  (5, 'Rosa Mercado', 'rosa.mercado@demo.test', '09181234567', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'user', 'active', '2026-02-11 09:00:00'),
  (6, 'Pedro Bautista', 'pedro.bautista@demo.test', '09191234567', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'user', 'active', '2026-03-01 09:00:00'),
  (7, 'Ana Reyes', 'ana.reyes@demo.test', '09201234567', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'user', 'active', '2026-03-02 09:00:00'),
  (8, 'Lito Garcia', 'lito.garcia@demo.test', '09211234567', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'user', 'active', '2026-03-03 09:00:00'),
  (9, 'Corazon Lim', 'corazon.lim@demo.test', '09221234567', '$2y$10$hcz2g9Aq0o1w5A0XKfZdN.BrDeCWFpQJbiJdvBN2IX/SJI.hHfqZ2', 'user', 'inactive', '2026-05-20 09:00:00');

-- ===== Reservations =====
-- Lot ids are looked up by code rather than assumed, so the file does not
-- depend on the order the lots happen to be inserted in. The codes are the
-- surveyed plots from database/survey/lots.sql, spread across the plan so the
-- demo shows colour in every part of the site rather than one corner.
--
-- Ids 1-17: approved, so their plots are occupied.
INSERT INTO `reservations`
  (`reservation_id`, `user_id`, `lot_id`, `reservation_date`, `purpose`, `number_of_slots`, `total_amount`, `approved_status`, `created_at`)
VALUES
  (1,  4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S1-012'),   '2026-02-14', 'Family plot for my parents',      2, 90000.00, 'approved', '2026-02-14 09:15:00'),
  (2,  5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S5-002'),   '2026-02-28', 'Single plot for my grandmother',  1, 45000.00, 'approved', '2026-02-28 10:20:00'),
  (3,  6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S8-004'),   '2026-03-10', 'Single plot',                      1, 45000.00, 'approved', '2026-03-10 14:05:00'),
  (4,  7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S12-045'),  '2026-03-22', 'Single plot for my mother',         1, 45000.00, 'approved', '2026-03-22 08:45:00'),
  (5,  8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S16-005'),  '2026-04-05', 'Single plot',                      1, 45000.00, 'approved', '2026-04-05 11:30:00'),
  (6,  4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S66-020'),  '2026-04-18', 'Family plot, four members',         4, 180000.00,'approved', '2026-04-18 09:10:00'),
  (7,  5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S26-002'),  '2026-05-02', 'Single plot',                      1, 45000.00, 'approved', '2026-05-02 13:25:00'),
  (8,  6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S30-003'),  '2026-05-16', 'Single plot',                      1, 45000.00, 'approved', '2026-05-16 10:00:00'),
  (9,  7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S2-015'),   '2026-05-30', 'Family plot, husband and wife',    2, 90000.00, 'approved', '2026-05-30 15:40:00'),
  (10, 8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S36-057'),  '2026-06-12', 'Single plot',                      1, 45000.00, 'approved', '2026-06-12 09:35:00'),
  (11, 4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S38-058'),  '2026-06-25', 'Single plot',                      1, 45000.00, 'approved', '2026-06-25 11:15:00'),
  (12, 5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S41-008'),  '2026-07-08', 'Single plot',                      1, 45000.00, 'approved', '2026-07-08 08:20:00'),
  (13, 6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S45-131'),  '2026-07-20', 'Single plot',                      1, 45000.00, 'approved', '2026-07-20 10:00:00'),
  (14, 7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S49-008'),  '2026-08-01', 'Single plot',                      1, 45000.00, 'approved', '2026-08-01 10:00:00'),
  (15, 8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S52-062'),  '2026-08-14', 'Single plot',                      1, 45000.00, 'approved', '2026-08-14 10:00:00'),
  (16, 5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S55-080'),  '2026-08-27', 'Single plot',                      1, 45000.00, 'approved', '2026-08-27 10:00:00'),
  (17, 4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S58-010'),  '2026-09-05', 'Single plot',                      1, 45000.00, 'approved', '2026-09-05 10:00:00');

-- Ids 18-20: still awaiting approval. These are what the dashboard queues up,
-- and their plots are held as reserved.
INSERT INTO `reservations`
  (`reservation_id`, `user_id`, `lot_id`, `reservation_date`, `purpose`, `number_of_slots`, `total_amount`, `approved_status`, `created_at`)
VALUES
  (18, 4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S67-010'),  '2026-09-10', 'Family plot, four members',  4, 180000.00,'pending', '2026-09-10 09:20:00'),
  (19, 6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S65-020'),  '2026-09-18', 'Single plot',              1, 45000.00, 'pending', '2026-09-18 14:50:00'),
  (20, 7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S65-092'),  '2026-09-24', 'Single plot for my sister', 1, 45000.00, 'pending', '2026-09-24 08:30:00');

-- Ids 21-22: rejected, which returned their plots to the available pool. They
-- stay on the plots' history but must not be holding anything.
INSERT INTO `reservations`
  (`reservation_id`, `user_id`, `lot_id`, `reservation_date`, `purpose`, `number_of_slots`, `total_amount`, `approved_status`, `created_at`)
VALUES
  (21, 8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S34-002'),  '2026-03-02', 'Single plot', 1, 45000.00, 'rejected', '2026-03-02 10:00:00'),
  (22, 9, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S43-008'),  '2026-06-05', 'Single plot', 1, 45000.00, 'rejected', '2026-06-05 10:00:00');

-- ===== Payments =====
-- Recorded against the reservations above so the payments report and the
-- reservation payment_status show every state: paid in full, partial, and
-- unpaid. Amounts never exceed the reservation's total_amount.
INSERT INTO `payments`
  (`payment_id`, `reservation_id`, `amount`, `method`, `reference_no`, `payment_date`, `notes`, `recorded_by`, `created_at`)
VALUES
  (1, 1,  45000.00, 'cash',          NULL,           '2026-02-14', 'Initial payment',       2, '2026-02-14 09:30:00'),
  (2, 1,  45000.00, 'gcash',         'GC-8821301',   '2026-03-01', 'Final payment',         2, '2026-03-01 10:05:00'),
  (3, 2,  45000.00, 'cash',          NULL,           '2026-02-28', 'Paid in full',          2, '2026-02-28 10:40:00'),
  (4, 3,  20000.00, 'bank_transfer', 'BPI-4471200',  '2026-03-12', 'Downpayment',           3, '2026-03-12 09:15:00'),
  (5, 6,  180000.00,'cheque',        'CHK-000341',   '2026-04-20', 'Paid in full by cheque',3, '2026-04-20 11:00:00'),
  (6, 9,  45000.00, 'gcash',         'GC-9004512',   '2026-06-02', 'First half',            2, '2026-06-02 14:10:00');

-- ===== Reservation payment status =====
-- Derived from the payments above in one place, so it can be checked by eye
-- against them rather than being a separate set of hand-picked values.
UPDATE `reservations` r SET `payment_status` = CASE
  WHEN COALESCE((SELECT SUM(p.`amount`) FROM `payments` p WHERE p.`reservation_id` = r.`reservation_id`), 0) <= 0 THEN 'unpaid'
  WHEN (SELECT SUM(p.`amount`) FROM `payments` p WHERE p.`reservation_id` = r.`reservation_id`) >= r.`total_amount` THEN 'paid'
  ELSE 'partial'
END;

-- ===== Burial records =====
-- Each next of kin is the client who holds the plot. S41-008 is still
-- scheduled, which is the third item the dashboard queues up.
INSERT INTO `burial_records`
  (`burial_id`, `deceased_fullname`, `date_of_birth`, `date_of_death`, `burial_date`, `lot_id`, `burial_type`, `next_of_kin_name`, `next_of_kin_phone`, `interment_status`, `created_at`)
VALUES
  (1, 'Ramon L. Reyes',         '1941-03-02', '2026-06-28', '2026-07-20', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S2-015'),  'family',   'Ana Reyes',          '09201234567', 'interred',  '2026-06-29 09:00:00'),
  (2, 'Jose M. Garcia',         '1950-11-11', '2026-07-19', '2026-08-05', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S36-057'), 'single',   'Lito Garcia',        '09211234567', 'interred',  '2026-07-20 09:00:00'),
  (3, 'Lourdes P. Dela Cruz',   '1946-05-17', '2026-08-10', '2026-08-25', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S38-058'), 'single',   'Juan Dela Cruz',     '09171234567', 'interred',  '2026-08-11 09:00:00'),
  (4, 'Ricardo P. Mercado',     '1952-09-30', '2026-09-02', '2026-10-28', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'S41-008'), 'single',   'Rosa Mercado',       '09181234567', 'scheduled', '2026-09-03 09:00:00');

-- ===== Lot status =====
-- Reset first, then derived from the reservations and burials above and set in
-- one place so it is easy to check against them by eye. Resetting first keeps a
-- reload deterministic no matter what state the plots were left in.
UPDATE `cemetery_lots` SET `status` = 'available';

UPDATE `cemetery_lots` SET `status` = 'occupied'
WHERE `lot_code` IN ('S1-012','S5-002','S8-004','S12-045','S16-005','S66-020','S26-002','S30-003','S2-015','S36-057','S38-058','S41-008','S45-131','S49-008','S52-062','S55-080','S58-010');

UPDATE `cemetery_lots` SET `status` = 'reserved'
WHERE `lot_code` IN ('S67-010','S65-020','S65-092');

-- ===== Notifications =====
-- Each notice names one of its client's real reservations and points at it,
-- so the Notifications page links through to the record.
INSERT INTO `notifications` (`user_id`, `message`, `type`, `reservation_id`, `is_read`, `created_at`) VALUES
  (4, 'Your reservation #1 for lot S1-012 has been approved.', 'reservation',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S1-012' AND r.user_id = 4 ORDER BY r.reservation_id DESC LIMIT 1), 1, '2026-02-14 11:00:00'),
  (4, 'Your reservation #18 for lot S67-010 is awaiting approval.', 'reservation',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S67-010' AND r.user_id = 4 ORDER BY r.reservation_id DESC LIMIT 1), 0, '2026-09-10 09:20:00'),
  (8, 'Your reservation #21 for lot S34-002 has been rejected.', 'reservation',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S34-002' AND r.user_id = 8 ORDER BY r.reservation_id DESC LIMIT 1), 1, '2026-03-04 10:00:00'),
  (5, 'Interment for lot S41-008 is scheduled on 2026-10-28.', 'system',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S41-008' AND r.user_id = 5 ORDER BY r.reservation_id DESC LIMIT 1), 0, '2026-09-03 09:05:00'),
  (6, 'Your reservation #3 for lot S8-004 has been approved.', 'reservation',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S8-004' AND r.user_id = 6 ORDER BY r.reservation_id DESC LIMIT 1), 1, '2026-03-10 15:00:00'),
  (6, 'Your reservation #13 for lot S45-131 has been approved.', 'reservation',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S45-131' AND r.user_id = 6 ORDER BY r.reservation_id DESC LIMIT 1), 1, '2026-07-20 11:00:00'),
  (7, 'Interment for lot S2-015 was completed.', 'system',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S2-015' AND r.user_id = 7 ORDER BY r.reservation_id DESC LIMIT 1), 1, '2026-07-20 18:00:00'),
  (8, 'Your reservation #15 for lot S52-062 has been approved.', 'reservation',
    (SELECT r.reservation_id FROM reservations r JOIN cemetery_lots l ON l.lot_id = r.lot_id
      WHERE l.lot_code = 'S52-062' AND r.user_id = 8 ORDER BY r.reservation_id DESC LIMIT 1), 1, '2026-08-14 11:00:00'),
  (1, 'Demo dataset loaded: 22 reservations, 4 burials.', 'system', NULL, 0, NOW());

-- ===== Audit trail =====
-- The entries the app itself would have written for the history above, with
-- the same action and table names the controllers log. Account, reservation
-- and payment entries are derived from those rows; the staff decisions are
-- listed by hand and line up with the notifications. The audit report lists
-- by log_id, so the whole set goes in sorted by time.
INSERT INTO `audit_logs` (`user_id`, `action`, `table_name`, `record_id`, `created_at`)
SELECT * FROM (
  SELECT 1 AS user_id, 'create' AS action, 'users' AS table_name, `user_id` AS record_id, `created_at` FROM `users` WHERE `role` = 'staff' AND `user_id` > 1
  UNION ALL
  SELECT NULL, 'register', 'users', `user_id`, `created_at` FROM `users` WHERE `role` = 'user' AND `user_id` > 1
  UNION ALL
  SELECT `user_id`, 'create', 'reservations', `reservation_id`, `created_at` FROM `reservations`
  UNION ALL
  SELECT `recorded_by`, 'create', 'payments', `payment_id`, `created_at` FROM `payments`
  UNION ALL
  VALUES
    ROW(2, 'approve', 'reservations',   1,    '2026-02-14 11:00:00'),
    ROW(2, 'approve', 'reservations',   2,    '2026-02-28 11:30:00'),
    ROW(3, 'approve', 'reservations',   3,    '2026-03-10 15:00:00'),
    ROW(2, 'reject',  'reservations',   21,   '2026-03-04 10:00:00'),
    ROW(2, 'approve', 'reservations',   4,    '2026-03-22 10:00:00'),
    ROW(3, 'approve', 'reservations',   5,    '2026-04-05 13:00:00'),
    ROW(2, 'approve', 'reservations',   6,    '2026-04-18 10:15:00'),
    ROW(3, 'approve', 'reservations',   7,    '2026-05-02 15:00:00'),
    ROW(2, 'approve', 'reservations',   8,    '2026-05-16 11:30:00'),
    ROW(3, 'approve', 'reservations',   9,    '2026-05-30 15:50:00'),
    ROW(2, 'reject',  'reservations',   22,   '2026-06-07 10:00:00'),
    ROW(2, 'approve', 'reservations',   10,   '2026-06-12 11:00:00'),
    ROW(3, 'approve', 'reservations',   11,   '2026-06-25 13:00:00'),
    ROW(2, 'create',  'burial_records', 1,    '2026-06-29 09:00:00'),
    ROW(2, 'approve', 'reservations',   12,   '2026-07-08 10:00:00'),
    ROW(3, 'create',  'burial_records', 2,    '2026-07-20 09:00:00'),
    ROW(3, 'approve', 'reservations',   13,   '2026-07-20 11:00:00'),
    ROW(2, 'update',  'burial_records', 1,    '2026-07-20 18:00:00'),
    ROW(2, 'approve', 'reservations',   14,   '2026-08-01 11:30:00'),
    ROW(3, 'update',  'burial_records', 2,    '2026-08-05 17:00:00'),
    ROW(2, 'create',  'burial_records', 3,    '2026-08-11 09:00:00'),
    ROW(3, 'approve', 'reservations',   15,   '2026-08-14 11:00:00'),
    ROW(2, 'update',  'burial_records', 3,    '2026-08-25 17:00:00'),
    ROW(3, 'approve', 'reservations',   16,   '2026-08-29 09:15:00'),
    ROW(1, 'backup_export', 'database', NULL, '2026-09-01 16:00:00'),
    ROW(2, 'create',  'burial_records', 4,    '2026-09-03 09:00:00'),
    ROW(2, 'approve', 'reservations',   17,   '2026-09-05 11:30:00')
) AS history
ORDER BY `created_at`;
