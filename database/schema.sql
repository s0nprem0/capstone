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
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  FOREIGN KEY (`lot_id`) REFERENCES `cemetery_lots`(`lot_id`) ON DELETE CASCADE,
  KEY `idx_reservations_user` (`user_id`),
  KEY `idx_reservations_lot` (`lot_id`),
  KEY `idx_reservations_date` (`reservation_date`)
) ENGINE=InnoDB;

-- 5. BURIAL_RECORDS
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

-- 6. NOTIFICATIONS
CREATE TABLE `notifications` (
  `notification_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `type` ENUM('reservation', 'system') NOT NULL DEFAULT 'system',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  KEY `idx_notifications_user` (`user_id`)
) ENGINE=InnoDB;

-- 7. AUDIT_LOGS
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

-- 8. LOGIN_ATTEMPTS (brute-force rate limiting)
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
INSERT INTO `cemetery_sections` (`section_name`, `location`, `description`, `svg_viewbox`, `section_number`) VALUES
  ('Section 3', NULL, 'Survey section 3', '0 847 4096 84', 3),
  ('Section 4', NULL, 'Survey section 4', '0 936 4096 84', 4),
  ('Section 5', NULL, 'Survey section 5', '0 1025 4096 84', 5),
  ('Section 6', NULL, 'Survey section 6', '0 1101 4096 84', 6),
  ('Section 7', NULL, 'Survey section 7', '0 1181 4096 84', 7),
  ('Section 8', NULL, 'Survey section 8', '0 1270 4096 84', 8),
  ('Section 9', NULL, 'Survey section 9', '0 1359 4096 84', 9),
  ('Section 10', NULL, 'Survey section 10', '0 1435 4096 84', 10),
  ('Section 11', NULL, 'Survey section 11', '0 1516 4096 84', 11),
  ('Section 12', NULL, 'Survey section 12', '0 847 4096 84', 12),
  ('Section 13', NULL, 'Survey section 13', '0 936 4096 84', 13),
  ('Section 14', NULL, 'Survey section 14', '0 1025 4096 84', 14),
  ('Section 15', NULL, 'Survey section 15', '0 1101 4096 84', 15),
  ('Section 16', NULL, 'Survey section 16', '0 1181 4096 84', 16),
  ('Section 17', NULL, 'Survey section 17', '0 1270 4096 84', 17),
  ('Section 18', NULL, 'Survey section 18', '0 1359 4096 84', 18),
  ('Section 19', NULL, 'Survey section 19', '0 1435 4096 84', 19),
  ('Section 20', NULL, 'Survey section 20', '0 1524 4096 84', 20),
  ('Section 21', NULL, 'Survey section 21', '0 1392 4096 84', 21),
  ('Section 22', NULL, 'Survey section 22', '0 1392 4096 84', 22),
  ('Section 23', NULL, 'Survey section 23', '0 1392 4096 84', 23),
  ('Section 24', NULL, 'Survey section 24', '0 1449 4096 84', 24),
  ('Section 25', NULL, 'Survey section 25', '0 1624 4096 84', 25),
  ('Section 26', NULL, 'Survey section 26', '0 1713 4096 84', 26),
  ('Section 27', NULL, 'Survey section 27', '0 1802 4096 84', 27),
  ('Section 28', NULL, 'Survey section 28', '0 1878 4096 84', 28),
  ('Section 29', NULL, 'Survey section 29', '0 1958 4096 84', 29),
  ('Section 30', NULL, 'Survey section 30', '0 2047 4096 84', 30),
  ('Section 31', NULL, 'Survey section 31', '0 2136 4096 84', 31),
  ('Section 32', NULL, 'Survey section 32', '0 1622 4096 84', 32),
  ('Section 33', NULL, 'Survey section 33', '0 1698 4096 84', 33),
  ('Section 34', NULL, 'Survey section 34', '0 1787 4096 84', 34),
  ('Section 35', NULL, 'Survey section 35', '0 1867 4096 84', 35),
  ('Section 36', NULL, 'Survey section 36', '0 1956 4096 84', 36),
  ('Section 37', NULL, 'Survey section 37', '0 2035 4096 84', 37),
  ('Section 38', NULL, 'Survey section 38', '0 2112 4096 84', 38),
  ('Section 39', NULL, 'Survey section 39', '0 2193 4096 84', 39),
  ('Section 40', NULL, 'Survey section 40', '0 2274 4096 84', 40),
  ('Section 41', NULL, 'Survey section 41', '0 2360 4096 84', 41),
  ('Section 42', NULL, 'Survey section 42', '0 864 4096 84', 42),
  ('Section 43', NULL, 'Survey section 43', '0 952 4096 84', 43),
  ('Section 44', NULL, 'Survey section 44', '0 1038 4096 84', 44),
  ('Section 45', NULL, 'Survey section 45', '0 1101 4096 84', 45),
  ('Section 46', NULL, 'Survey section 46', '0 1194 4096 84', 46),
  ('Section 47', NULL, 'Survey section 47', '0 1283 4096 84', 47),
  ('Section 48', NULL, 'Survey section 48', '0 1366 4096 84', 48),
  ('Section 49', NULL, 'Survey section 49', '0 1449 4096 84', 49),
  ('Section 50', NULL, 'Survey section 50', '0 1533 4096 84', 50),
  ('Section 51', NULL, 'Survey section 51', '0 1610 4096 84', 51),
  ('Section 52', NULL, 'Survey section 52', '0 1684 4096 84', 52),
  ('Section 53', NULL, 'Survey section 53', '0 1760 4096 84', 53),
  ('Section 54', NULL, 'Survey section 54', '0 1857 4096 84', 54),
  ('Section 55', NULL, 'Survey section 55', '0 1933 4096 84', 55),
  ('Section 56', NULL, 'Survey section 56', '0 1373 4096 84', 56),
  ('Section 57', NULL, 'Survey section 57', '0 1453 4096 84', 57),
  ('Section 58', NULL, 'Survey section 58', '0 1529 4096 84', 58),
  ('Section 59', NULL, 'Survey section 59', '0 1609 4096 84', 59),
  ('Section 60', NULL, 'Survey section 60', '0 1681 4096 84', 60),
  ('Section 61', NULL, 'Survey section 61', '0 1766 4096 84', 61),
  ('Section 62', NULL, 'Survey section 62', '0 1844 4096 84', 62),
  ('Section 63', NULL, 'Survey section 63', '0 1922 4096 84', 63),
  ('Section 64', NULL, 'Survey section 64', '0 1624 4096 84', 64),
  ('Section 65', NULL, 'Survey section 65', '0 2086 4096 84', 65),
  ('Section 66', NULL, 'Survey section 66', '0 2300 4096 84', 66),
  ('Section 67', NULL, 'Survey section 67', '0 2513 4096 84', 67),
  ('Section 68', NULL, 'Survey section 68', '0 2716 4096 84', 68);
