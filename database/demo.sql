-- Demo dataset for the tech demo.
--
-- Separate from schema.sql on purpose. schema.sql is the authoritative
-- definition of the database and a fresh `make migrate` has to reproduce it;
-- fake clients with invented names and hand-picked dates are presentation, not
-- schema, and folding them in would leave the adviser reading a seed section
-- full of fiction. Load schema.sql first, then this:
--
--   make migrate && make demo
--
-- The rows below are not arbitrary. They satisfy the same invariants the
-- controllers enforce at runtime, because an adviser will click a coloured
-- plot and ask what is behind it:
--
--   * a lot is 'occupied' only when a reservation is fully paid, or a burial
--     record claims the plot
--   * a lot is 'reserved' only while a live (not rejected) reservation holds it
--   * a lot is 'available' only when no live reservation and no burial touch it
--   * reservation.payment_status follows Payment::totals(): 'paid' when the
--     collected total reaches total_amount, 'failed' when every payment was
--     rejected, 'pending' otherwise
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
-- depend on the order schema.sql happens to insert the plots in.
--
-- Ids 1-12: approved and fully paid, so their plots are occupied.
INSERT INTO `reservations`
  (`reservation_id`, `user_id`, `lot_id`, `reservation_date`, `purpose`, `number_of_slots`, `total_amount`, `payment_status`, `approved_status`, `created_at`)
VALUES
  (1,  4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'A-001'), '2026-02-14', 'Family plot for my parents',      2, 51000.00, 'paid', 'approved', '2026-02-14 09:15:00'),
  (2,  5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'A-004'), '2026-02-28', 'Single plot for my grandmother',  1, 15000.00, 'paid', 'approved', '2026-02-28 10:20:00'),
  (3,  6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'A-007'), '2026-03-10', 'Single plot',                      1, 15000.00, 'paid', 'approved', '2026-03-10 14:05:00'),
  (4,  7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'A-012'), '2026-03-22', 'Single plot for my mother',         1, 15000.00, 'paid', 'approved', '2026-03-22 08:45:00'),
  (5,  8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'A-018'), '2026-04-05', 'Single plot',                      1, 15000.00, 'paid', 'approved', '2026-04-05 11:30:00'),
  (6,  4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'B-002'), '2026-04-18', 'Family plot, four members',         4, 194400.00,'paid', 'approved', '2026-04-18 09:10:00'),
  (7,  5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'B-005'), '2026-05-02', 'Single plot',                      1, 18000.00, 'paid', 'approved', '2026-05-02 13:25:00'),
  (8,  6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'B-009'), '2026-05-16', 'Single plot',                      1, 18000.00, 'paid', 'approved', '2026-05-16 10:00:00'),
  (9,  7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-001'), '2026-05-30', 'Double plot, husband and wife',    2, 51000.00, 'paid', 'approved', '2026-05-30 15:40:00'),
  (10, 8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-006'), '2026-06-12', 'Single plot',                      1, 15000.00, 'paid', 'approved', '2026-06-12 09:35:00'),
  (11, 4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-011'), '2026-06-25', 'Single plot',                      1, 15000.00, 'paid', 'approved', '2026-06-25 11:15:00'),
  (12, 5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-014'), '2026-07-08', 'Single plot',                      1, 15000.00, 'paid', 'approved', '2026-07-08 08:20:00');

-- Ids 13-17: approved, but the balance is still outstanding, so the plots stay
-- reserved. 15 has a payment still awaiting validation and 17 had its only
-- payment rejected, which is what puts the reservation itself on 'failed'.
INSERT INTO `reservations`
  (`reservation_id`, `user_id`, `lot_id`, `reservation_date`, `purpose`, `number_of_slots`, `total_amount`, `payment_status`, `approved_status`, `created_at`)
VALUES
  (13, 6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'D-003'), '2026-07-20', 'Single plot', 1, 12000.00, 'pending', 'approved', '2026-07-20 10:00:00'),
  (14, 7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'D-008'), '2026-08-01', 'Single plot', 1, 12000.00, 'pending', 'approved', '2026-08-01 10:00:00'),
  (15, 8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'D-015'), '2026-08-14', 'Single plot', 1, 12000.00, 'pending', 'approved', '2026-08-14 10:00:00'),
  (16, 5, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'D-022'), '2026-08-27', 'Single plot', 1, 12000.00, 'failed',  'approved', '2026-08-27 10:00:00'),
  (17, 4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'D-030'), '2026-09-05', 'Single plot', 1, 12000.00, 'pending', 'approved', '2026-09-05 10:00:00');

-- Ids 18-20: still awaiting approval. These are what the dashboard queues up,
-- and their plots are held as reserved.
INSERT INTO `reservations`
  (`reservation_id`, `user_id`, `lot_id`, `reservation_date`, `purpose`, `number_of_slots`, `total_amount`, `payment_status`, `approved_status`, `created_at`)
VALUES
  (18, 4, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'E-002'), '2026-09-10', 'Family plot, four members',  4, 86400.00, 'pending', 'pending', '2026-09-10 09:20:00'),
  (19, 6, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'E-004'), '2026-09-18', 'Single plot',              1, 8000.00,  'pending', 'pending', '2026-09-18 14:50:00'),
  (20, 7, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'E-007'), '2026-09-24', 'Single plot for my sister', 1, 8000.00,  'pending', 'pending', '2026-09-24 08:30:00');

-- Ids 21-22: rejected, which returned their plots to the available pool. They
-- stay on the plots' history but must not be holding anything.
INSERT INTO `reservations`
  (`reservation_id`, `user_id`, `lot_id`, `reservation_date`, `purpose`, `number_of_slots`, `total_amount`, `payment_status`, `approved_status`, `created_at`)
VALUES
  (21, 8, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'A-020'), '2026-03-02', 'Single plot', 1, 15000.00, 'pending', 'rejected', '2026-03-02 10:00:00'),
  (22, 9, (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'B-012'), '2026-06-05', 'Single plot', 1, 18000.00, 'pending', 'rejected', '2026-06-05 10:00:00');

-- ===== Payments =====
-- One settled payment per paid reservation. Amounts for 13-15 and 17 are
-- instalments, deliberately short of total_amount, so the plots stay reserved.
INSERT INTO `payments`
  (`payment_id`, `reservation_id`, `amount`, `payment_method`, `reference_no`, `payment_date`, `payment_status`, `validated_by`, `validated_at`)
VALUES
  (1,  1,  51000.00,  'gcash', 'GC-2602148841', '2026-02-14 09:40:00', 'paid',    2, '2026-02-14 11:00:00'),
  (2,  2,  15000.00,  'card',  '4242-8810-2211', '2026-02-28 10:45:00', 'paid',    2, '2026-02-28 13:15:00'),
  (3,  3,  15000.00,  'cash',  NULL,             '2026-03-10 14:20:00', 'paid',    3, '2026-03-10 15:00:00'),
  (4,  4,  15000.00,  'gcash', 'GC-2603229017', '2026-03-22 09:00:00', 'paid',    2, '2026-03-22 09:40:00'),
  (5,  5,  15000.00,  'cash',  NULL,             '2026-04-05 11:45:00', 'paid',    3, '2026-04-05 13:30:00'),
  (6,  6,  194400.00, 'card',  '4242-8810-6640', '2026-04-18 09:30:00', 'paid',    2, '2026-04-18 12:00:00'),
  (7,  7,  18000.00,  'gcash', 'GC-2605021177', '2026-05-02 13:40:00', 'paid',    2, '2026-05-02 14:20:00'),
  (8,  8,  18000.00,  'cash',  NULL,             '2026-05-16 10:15:00', 'paid',    3, '2026-05-16 11:00:00'),
  (9,  9,  51000.00,  'card',  '4242-8810-3390', '2026-05-30 15:55:00', 'paid',    2, '2026-05-30 16:30:00'),
  (10, 10, 15000.00,  'gcash', 'GC-2606124432', '2026-06-12 09:50:00', 'paid',    2, '2026-06-12 10:30:00'),
  (11, 11, 15000.00,  'cash',  NULL,             '2026-06-25 11:30:00', 'paid',    3, '2026-06-25 13:00:00'),
  (12, 12, 15000.00,  'gcash', 'GC-2607087702', '2026-07-08 08:35:00', 'paid',    2, '2026-07-08 09:05:00'),
  -- Instalments: 6,000 of 12,000 on 13 and 14, 3,000 on 17. 15 is recorded
  -- but not yet validated, so it is the one payment sitting in the queue.
  (13, 13, 6000.00,   'gcash', 'GC-2607205510', '2026-07-20 10:20:00', 'paid',    2, '2026-07-20 11:00:00'),
  (14, 14, 6000.00,   'card',  '4242-8810-9021', '2026-08-01 10:25:00', 'paid',    2, '2026-08-01 11:10:00'),
  (15, 15, 4000.00,   'gcash', 'GC-2608143390', '2026-08-14 10:30:00', 'pending', NULL, NULL),
  (16, 16, 12000.00,  'card',  '4242-8810-1174', '2026-08-27 10:35:00', 'failed',  3, '2026-08-29 09:15:00'),
  (17, 17, 3000.00,   'cash',  NULL,             '2026-09-05 10:25:00', 'paid',    2, '2026-09-05 11:20:00');

-- ===== Burial records =====
-- C-014 is still scheduled, which is the third item the dashboard queues up.
INSERT INTO `burial_records`
  (`burial_id`, `deceased_fullname`, `date_of_birth`, `date_of_death`, `burial_date`, `lot_id`, `burial_type`, `next_of_kin_name`, `next_of_kin_phone`, `interment_status`, `created_at`)
VALUES
  (1, 'Ramon L. Aquino',        '1941-03-02', '2026-06-28', '2026-07-20', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-001'), 'double',   'Teresa S. Aquino',   '09171230001', 'interred',  '2026-06-29 09:00:00'),
  (2, 'Jose Rizal Mercado',     '1950-11-11', '2026-07-19', '2026-08-05', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-006'), 'single',   'Rosa G. Mercado',    '09181230002', 'interred',  '2026-07-20 09:00:00'),
  (3, 'Lourdes P. Santos',      '1946-05-17', '2026-08-10', '2026-08-25', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-011'), 'single',   'Ana R. Santos',      '09201230003', 'interred',  '2026-08-11 09:00:00'),
  (4, 'Ricardo P. Dela Cruz',   '1952-09-30', '2026-09-02', '2026-10-12', (SELECT lot_id FROM cemetery_lots WHERE lot_code = 'C-014'), 'single',   'Juan C. Dela Cruz',  '09171230004', 'scheduled', '2026-09-03 09:00:00');

-- ===== Lot status =====
-- Reset first, then derived from the reservations and burials above and set in
-- one place so it is easy to check against them by eye. Resetting first keeps a
-- reload deterministic no matter what state the plots were left in.
UPDATE `cemetery_lots` SET `status` = 'available';

UPDATE `cemetery_lots` SET `status` = 'occupied'
WHERE `lot_code` IN ('A-001','A-004','A-007','A-012','A-018','B-002','B-005','B-009','C-001','C-006','C-011','C-014');

UPDATE `cemetery_lots` SET `status` = 'reserved'
WHERE `lot_code` IN ('D-003','D-008','D-015','D-022','D-030','E-002','E-004','E-007');

-- ===== Notifications =====
INSERT INTO `notifications` (`user_id`, `message`, `type`, `is_read`, `created_at`) VALUES
  (4, 'Your reservation for lot A-001 was approved.',                    'reservation', 1, '2026-02-14 11:00:00'),
  (4, 'Payment of PHP 51,000.00 for lot A-001 was received.',            'payment',     1, '2026-02-14 11:05:00'),
  (4, 'Your reservation for lot E-002 is awaiting approval.',            'reservation', 0, '2026-09-10 09:20:00'),
  (5, 'Your reservation for lot A-020 was rejected.',                    'reservation', 1, '2026-03-04 10:00:00'),
  (5, 'Interment for lot C-014 is scheduled on 2026-10-12.',            'system',      0, '2026-09-03 09:05:00'),
  (6, 'Your reservation for lot A-007 was approved.',                    'reservation', 1, '2026-03-10 15:00:00'),
  (6, 'Payment of PHP 6,000.00 received as a downpayment for lot D-003.', 'payment',    1, '2026-07-20 11:00:00'),
  (7, 'Interment for lot C-001 was completed.',                         'system',      1, '2026-07-20 18:00:00'),
  (8, 'Your payment for lot D-015 is awaiting validation.',             'payment',     0, '2026-08-14 10:30:00'),
  (1, 'Demo dataset loaded: 22 reservations, 17 payments, 4 burials.',    'system',      0, NOW());

-- ===== Audit trail =====
-- A believable back-history so the audit report is not a single login row.
INSERT INTO `audit_logs` (`user_id`, `action`, `table_name`, `record_id`, `created_at`) VALUES
  (1, 'create', 'sections', 1, '2026-01-12 08:10:00'),
  (1, 'create', 'sections', 2, '2026-01-12 08:12:00'),
  (1, 'create', 'sections', 3, '2026-01-12 08:14:00'),
  (1, 'create', 'sections', 4, '2026-01-12 08:16:00'),
  (1, 'create', 'sections', 5, '2026-01-12 08:18:00'),
  (1, 'import', 'lots',     NULL, '2026-01-14 09:00:00'),
  (2, 'approve', 'reservations', 1,  '2026-02-14 11:00:00'),
  (2, 'validate', 'payments',    1,  '2026-02-14 11:00:00'),
  (2, 'approve', 'reservations', 6,  '2026-04-18 10:15:00'),
  (2, 'validate', 'payments',    6,  '2026-04-18 12:00:00'),
  (3, 'approve', 'reservations', 9,  '2026-05-30 15:50:00'),
  (2, 'create', 'burial_records', 1, '2026-06-29 09:00:00'),
  (2, 'update', 'burial_records', 1, '2026-07-20 18:00:00'),
  (3, 'reject', 'reservations', 16, '2026-08-29 09:15:00'),
  (3, 'create', 'burial_records', 2, '2026-07-20 09:00:00'),
  (2, 'create', 'burial_records', 3, '2026-08-11 09:00:00'),
  (2, 'create', 'burial_records', 4, '2026-09-03 09:00:00'),
  (2, 'reject', 'reservations', 21, '2026-03-04 10:00:00'),
  (2, 'reject', 'reservations', 22, '2026-06-07 10:00:00'),
  (1, 'export', 'database',  NULL, '2026-09-01 16:00:00');
