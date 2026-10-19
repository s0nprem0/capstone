-- Cemetery Reservation and Records Management System
-- Database Schema (aligned to study ERD + required additions)

CREATE DATABASE IF NOT EXISTS `cemetery_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `cemetery_db`;

-- ===== Reset =====
-- Without this the file only ever works on a virgin volume: on an existing
-- database every CREATE TABLE below fails with "table already exists" and the
-- old rows survive, so `make migrate` cannot be used to sync a database back
-- to the schema it is supposed to reproduce. Dropped child-first so the
-- foreign keys do not have to be chased one at a time.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `login_attempts`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `burial_records`;
DROP TABLE IF EXISTS `reservations`;
-- Left over from the removed payments module: a database migrated before the
-- removal still carries the table, and the backup export walks SHOW TABLES.
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `cemetery_lots`;
DROP TABLE IF EXISTS `cemetery_sections`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. USERS
CREATE TABLE `users` (
  `user_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `fullname` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(15) NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'staff', 'user') NOT NULL DEFAULT 'user',
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_fullname` (`fullname`),
  KEY `idx_users_email` (`email`)
) ENGINE=InnoDB;

-- 2. CEMETERY_SECTIONS
CREATE TABLE `cemetery_sections` (
  `section_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `section_name` VARCHAR(50) NOT NULL,
  `location` VARCHAR(100) NULL,
  `description` TEXT NULL,
  `svg_viewbox` VARCHAR(50) NOT NULL DEFAULT '0 0 4096 3072' COMMENT 'SVG crop region (x y w h) in map space',
  `svg_image` VARCHAR(255) NULL COMMENT 'trace background image path',
  `svg_points` VARCHAR(1024) NULL COMMENT 'SVG polygon outline "x y x y ..." in map space (drawn with the section editor)',
  `section_number` SMALLINT UNSIGNED NULL COMMENT 'number printed on the survey plan; NULL until the section is placed on the plan',
  `is_locked` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Freezes the outline and lot geometry until unlocked',
  UNIQUE KEY `uq_section_number` (`section_number`)
) ENGINE=InnoDB;

-- 3. CEMETERY_LOTS
CREATE TABLE `cemetery_lots` (
  `lot_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lot_code` VARCHAR(20) NOT NULL,
  `section_id` INT UNSIGNED NOT NULL,
  `block` VARCHAR(10) NULL,
  `lot_type` ENUM('single', 'double', 'family') NOT NULL DEFAULT 'single',
  `price` DECIMAL(10,2) NULL,
  `status` ENUM('available', 'reserved', 'occupied') NOT NULL DEFAULT 'available',
  `latitude` DECIMAL(10,8) NULL,
  `longitude` DECIMAL(11,8) NULL,
  -- Two decimals because surveyed lots are scaled out of the trace's 4096-wide
  -- canvas. At the survey's pitch a plot is only about 7 map units across, so
  -- rounding to whole units would move it by a seventh of its own width.
  `svg_x` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `svg_y` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `svg_w` DECIMAL(6,2) NOT NULL DEFAULT 40.00,
  `svg_h` DECIMAL(6,2) NOT NULL DEFAULT 40.00,
  `svg_points` VARCHAR(512) NULL COMMENT 'Outline "x y x y ..." of a plot that is not an upright rectangle (tilted perimeter rows, plots cut by a diagonal walk); svg_x..svg_h is then its bounding box',
  `description` TEXT NULL,
  FOREIGN KEY (`section_id`) REFERENCES `cemetery_sections`(`section_id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_lot_code` (`lot_code`),
  KEY `idx_lots_status` (`status`),
  KEY `idx_lots_svg` (`section_id`, `svg_x`, `svg_y`)
) ENGINE=InnoDB;

-- 4. RESERVATIONS
CREATE TABLE `reservations` (
  `reservation_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `lot_id` INT UNSIGNED NOT NULL,
  `reservation_date` DATE NOT NULL,
  `purpose` VARCHAR(100) NULL,
  `number_of_slots` INT UNSIGNED NOT NULL DEFAULT 1,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `approved_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  -- Derived from the payments recorded against the reservation (see
  -- Payment::recomputeStatus). Stored rather than computed on read so the
  -- reservations list and reports do not each add a subquery.
  `payment_status` ENUM('unpaid', 'partial', 'paid') NOT NULL DEFAULT 'unpaid',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  FOREIGN KEY (`lot_id`) REFERENCES `cemetery_lots`(`lot_id`) ON DELETE CASCADE,
  KEY `idx_reservations_user` (`user_id`),
  KEY `idx_reservations_lot` (`lot_id`),
  KEY `idx_reservations_date` (`reservation_date`)
) ENGINE=InnoDB;

-- 5. PAYMENTS
-- Money recorded against a reservation. Recording a payment does not gate
-- approval; it only tracks what has been paid against total_amount. Method is a
-- manual record of how it was taken (no online gateway).
CREATE TABLE `payments` (
  `payment_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `reservation_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `method` ENUM('cash', 'gcash', 'bank_transfer', 'cheque', 'other') NOT NULL DEFAULT 'cash',
  `reference_no` VARCHAR(50) NULL,
  `payment_date` DATE NOT NULL,
  `notes` VARCHAR(255) NULL,
  `recorded_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`reservation_id`) ON DELETE CASCADE,
  FOREIGN KEY (`recorded_by`) REFERENCES `users`(`user_id`) ON DELETE SET NULL,
  KEY `idx_payments_reservation` (`reservation_id`),
  KEY `idx_payments_date` (`payment_date`)
) ENGINE=InnoDB;

-- 6. BURIAL_RECORDS
CREATE TABLE `burial_records` (
  `burial_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `deceased_fullname` VARCHAR(255) NOT NULL,
  `date_of_birth` DATE NULL,
  `date_of_death` DATE NULL,
  `burial_date` DATE NOT NULL,
  `lot_id` INT UNSIGNED NOT NULL,
  `burial_type` ENUM('single', 'double', 'family', 'cremation') NOT NULL DEFAULT 'single',
  `next_of_kin_name` VARCHAR(100) NULL,
  `next_of_kin_phone` VARCHAR(15) NULL,
  `interment_status` ENUM('scheduled', 'interred') NOT NULL DEFAULT 'scheduled',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lot_id`) REFERENCES `cemetery_lots`(`lot_id`) ON DELETE CASCADE,
  KEY `idx_burials_deceased` (`deceased_fullname`),
  KEY `idx_burials_date` (`burial_date`)
) ENGINE=InnoDB;

-- 7. NOTIFICATIONS
CREATE TABLE `notifications` (
  `notification_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `type` ENUM('reservation', 'system') NOT NULL DEFAULT 'system',
  -- The reservation a notice is about, so it can link there. Kept when the
  -- reservation goes: the notice stays readable, just without the link.
  `reservation_id` INT UNSIGNED NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`reservation_id`) ON DELETE SET NULL,
  KEY `idx_notifications_user` (`user_id`)
) ENGINE=InnoDB;

-- 8. AUDIT_LOGS
CREATE TABLE `audit_logs` (
  `log_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NULL,
  `action` VARCHAR(100) NOT NULL,
  `table_name` VARCHAR(50) NOT NULL,
  `record_id` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL,
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`)
) ENGINE=InnoDB;

-- 9. LOGIN_ATTEMPTS (brute-force rate limiting)
CREATE TABLE `login_attempts` (
  `attempt_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ip_address` VARCHAR(45) NOT NULL,
  `email` VARCHAR(100) NULL,
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_attempts_ip_time` (`ip_address`, `attempted_at`),
  KEY `idx_attempts_email_time` (`email`, `attempted_at`)
) ENGINE=InnoDB;

-- ===== Seed data =====
-- Default admin (password: admin123)
INSERT INTO `users` (`fullname`, `email`, `phone`, `password`, `role`, `status`) VALUES
  ('System Administrator', 'admin@cemetery.test', '09170000001', '$2y$10$By0J7o/86O1M19BODiwRGOq6EcnSjZehzxdQVrDiEOe1lW2tTA2Rq', 'admin', 'active');

-- Sections as numbered on the survey plan. Each circled number is one section
-- (a row of plots). section_number is the plan's number and svg_viewbox is a
-- small crop around that number for the section detail view; the plan itself is
-- drawn in public/traces/survey-lines.png and used as the map base.
-- Lots are not seeded: they are placed against the survey scan through the Lot
-- Editor, which overlays the scan, so geometry stays in the scan's own pixels.
INSERT INTO `cemetery_sections` (`section_name`, `location`, `description`, `svg_viewbox`, `section_number`, `svg_points`) VALUES
  ('Section 3', NULL, 'Survey section 3', '0 876 4096 65', 3, '542 882 1042 882 1042 935 542 935'),
  ('Section 4', NULL, 'Survey section 4', '0 931 4096 96', 4, '541 937 1042 937 1042 1021 541 1021'),
  ('Section 5', NULL, 'Survey section 5', '0 1015 4096 96', 5, '540 1021 1041 1021 1041 1105 540 1105'),
  ('Section 6', NULL, 'Survey section 6', '0 1100 4096 93', 6, '520 1106 1040 1106 1040 1187 520 1187'),
  ('Section 7', NULL, 'Survey section 7', '0 1184 4096 95', 7, '519 1190 1039 1190 1039 1273 519 1273'),
  ('Section 8', NULL, 'Survey section 8', '0 1269 4096 91', 8, '518 1275 1038 1275 1038 1354 518 1354'),
  ('Section 9', NULL, 'Survey section 9', '0 1352 4096 94', 9, '517 1358 1037 1358 1037 1440 517 1440'),
  ('Section 10', NULL, 'Survey section 10', '0 1437 4096 97', 10, '516 1443 1021 1443 1021 1528 516 1528'),
  ('Section 11', NULL, 'Survey section 11', '0 1524 4096 54', 11, '516 1530 986 1530 986 1572 516 1572'),
  ('Section 12', NULL, 'Survey section 12', '0 894 4096 56', 12, '1100 900 1506 900 1506 944 1100 944'),
  ('Section 13', NULL, 'Survey section 13', '0 935 4096 99', 13, '1100 941 1507 941 1507 1028 1100 1028'),
  ('Section 14', NULL, 'Survey section 14', '0 1020 4096 98', 14, '1101 1026 1507 1026 1507 1112 1101 1112'),
  ('Section 15', NULL, 'Survey section 15', '0 1104 4096 98', 15, '1101 1110 1528 1110 1528 1196 1101 1196'),
  ('Section 16', NULL, 'Survey section 16', '0 1187 4096 96', 16, '1102 1193 1560 1193 1560 1277 1102 1277'),
  ('Section 17', NULL, 'Survey section 17', '0 1270 4096 93', 17, '1102 1276 1680 1276 1680 1357 1102 1357'),
  ('Section 18', NULL, 'Survey section 18', '0 1352 4096 95', 18, '1103 1358 1614 1358 1614 1441 1103 1441'),
  ('Section 19', NULL, 'Survey section 19', '0 1437 4096 97', 19, '1024 1443 1560 1443 1560 1528 1024 1528'),
  ('Section 20', NULL, 'Survey section 20', '0 1522 4096 53', 20, '990 1528 1680 1528 1680 1569 990 1569'),
  ('Section 21', NULL, 'Survey section 21', '0 1353 4096 94', 21, '1581 1359 1680 1359 1680 1441 1581 1441'),
  ('Section 22', NULL, 'Survey section 22', '0 0 4096 84', 22, NULL),
  ('Section 23', NULL, 'Survey section 23', '0 1411 4096 49', 23, '2070 1417 2113 1417 2113 1454 2070 1454'),
  ('Section 24', NULL, 'Survey section 24', '0 1449 4096 137', 24, '1563 1456 2164 1456 2164 1578 1563 1578'),
  ('Section 25', NULL, 'Survey section 25', '0 1666 4096 53', 25, '496 1672 1183 1672 1183 1713 496 1713'),
  ('Section 26', NULL, 'Survey section 26', '0 1699 4096 142', 26, '496 1707 1233 1707 1233 1834 496 1834'),
  ('Section 27', NULL, 'Survey section 27', '0 1790 4096 102', 27, '496 1796 1216 1796 1216 1886 496 1886'),
  ('Section 28', NULL, 'Survey section 28', '0 1874 4096 106', 28, '475 1880 1216 1880 1216 1974 475 1974'),
  ('Section 29', NULL, 'Survey section 29', '0 0 4096 84', 29, NULL),
  ('Section 30', NULL, 'Survey section 30', '0 2040 4096 112', 30, '478 2046 1232 2046 1232 2146 478 2146'),
  ('Section 31', NULL, 'Survey section 31', '0 2127 4096 106', 31, '496 2133 1231 2133 1231 2227 496 2227'),
  ('Section 32', NULL, 'Survey section 32', '0 1619 4096 124', 32, '1187 1626 2008 1626 2008 1737 1187 1737'),
  ('Section 33', NULL, 'Survey section 33', '0 1690 4096 138', 33, '1134 1697 2007 1697 2007 1820 1134 1820'),
  ('Section 34', NULL, 'Survey section 34', '0 1772 4096 140', 34, '1134 1779 2008 1779 2008 1904 1134 1904'),
  ('Section 35', NULL, 'Survey section 35', '0 1858 4096 139', 35, '1152 1865 2007 1865 2007 1989 1152 1989'),
  ('Section 36', NULL, 'Survey section 36', '0 1941 4096 138', 36, '1285 1948 2007 1948 2007 2071 1285 2071'),
  ('Section 37', NULL, 'Survey section 37', '0 2023 4096 134', 37, '1133 2030 2339 2030 2339 2150 1133 2150'),
  ('Section 38', NULL, 'Survey section 38', '0 2103 4096 115', 38, '1113 2109 2278 2109 2278 2212 1113 2212'),
  ('Section 39', NULL, 'Survey section 39', '0 2182 4096 110', 39, '1577 2188 2569 2188 2569 2286 1577 2286'),
  ('Section 40', NULL, 'Survey section 40', '0 0 4096 84', 40, NULL),
  ('Section 41', NULL, 'Survey section 41', '0 2393 4096 98', 41, '1826 2399 1990 2399 1990 2485 1826 2485'),
  ('Section 42', NULL, 'Survey section 42', '0 867 4096 139', 42, '2007 874 3097 874 3097 998 2007 998'),
  ('Section 43', NULL, 'Survey section 43', '0 949 4096 136', 43, '2022 956 3130 956 3130 1077 2022 1077'),
  ('Section 44', NULL, 'Survey section 44', '0 1031 4096 92', 44, '2040 1037 3157 1037 3157 1117 2040 1117'),
  ('Section 45', NULL, 'Survey section 45', '0 1113 4096 90', 45, '2007 1119 3189 1119 3189 1197 2007 1197'),
  ('Section 46', NULL, 'Survey section 46', '0 1192 4096 51', 46, '2042 1198 3205 1198 3205 1237 2042 1237'),
  ('Section 47', NULL, 'Survey section 47', '0 1313 4096 48', 47, '2241 1319 3116 1319 3116 1355 2241 1355'),
  ('Section 48', NULL, 'Survey section 48', '0 1408 4096 52', 48, '2116 1414 2684 1414 2684 1454 2116 1454'),
  ('Section 49', NULL, 'Survey section 49', '0 1450 4096 91', 49, '2167 1456 2700 1456 2700 1535 2167 1535'),
  ('Section 50', NULL, 'Survey section 50', '0 1530 4096 96', 50, '2071 1536 2700 1536 2700 1620 2071 1620'),
  ('Section 51', NULL, 'Survey section 51', '0 1610 4096 88', 51, '1976 1616 2669 1616 2669 1692 1976 1692'),
  ('Section 52', NULL, 'Survey section 52', '0 1684 4096 97', 52, '2061 1690 2717 1690 2717 1775 2061 1775'),
  ('Section 53', NULL, 'Survey section 53', '0 1765 4096 97', 53, '1929 1771 2670 1771 2670 1856 1929 1856'),
  ('Section 54', NULL, 'Survey section 54', '0 1847 4096 97', 54, '2061 1853 2702 1853 2702 1938 2061 1938'),
  ('Section 55', NULL, 'Survey section 55', '0 1923 4096 161', 55, '2063 1932 2743 1932 2743 2076 2063 2076'),
  ('Section 56', NULL, 'Survey section 56', '0 1368 4096 92', 56, '2687 1374 3225 1374 3225 1454 2687 1454'),
  ('Section 57', NULL, 'Survey section 57', '0 1447 4096 93', 57, '2671 1453 3227 1453 3227 1534 2671 1534'),
  ('Section 58', NULL, 'Survey section 58', '0 1529 4096 91', 58, '2671 1535 3260 1535 3260 1614 2671 1614'),
  ('Section 59', NULL, 'Survey section 59', '0 1606 4096 88', 59, '2671 1612 3210 1612 3210 1688 2671 1688'),
  ('Section 60', NULL, 'Survey section 60', '0 1684 4096 91', 60, '2689 1690 3347 1690 3347 1769 2689 1769'),
  ('Section 61', NULL, 'Survey section 61', '0 1758 4096 98', 61, '2672 1764 3413 1764 3413 1850 2672 1850'),
  ('Section 62', NULL, 'Survey section 62', '0 1839 4096 97', 62, '2625 1845 3472 1845 3472 1930 2625 1930'),
  ('Section 63', NULL, 'Survey section 63', '0 1914 4096 159', 63, '2673 1923 3507 1923 3507 2065 2673 2065'),
  ('Section 64', NULL, 'Survey section 64', '0 1606 4096 85', 64, '3199 1612 3318 1612 3318 1685 3199 1685'),
  ('Section 65', NULL, 'Survey section 65', '0 2045 4096 198', 65, '2106 2056 3417 2056 3417 2233 2106 2233'),
  ('Section 66', NULL, 'Survey section 66', '0 0 4096 84', 66, NULL),
  ('Section 67', NULL, 'Survey section 67', '0 0 4096 84', 67, NULL),
  ('Section 68', NULL, 'Survey section 68', '0 0 4096 84', 68, NULL);
