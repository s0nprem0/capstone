-- Cemetery Reservation and Records Management System
-- Database Schema (aligned to study ERD + required additions)

CREATE DATABASE IF NOT EXISTS `cemetery_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `cemetery_db`;

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
  `description` TEXT NULL
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
  `description` TEXT NULL,
  FOREIGN KEY (`section_id`) REFERENCES `cemetery_sections`(`section_id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_lot_code` (`lot_code`),
  KEY `idx_lots_status` (`status`)
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
  `payment_status` ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  `approved_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
  FOREIGN KEY (`lot_id`) REFERENCES `cemetery_lots`(`lot_id`) ON DELETE CASCADE,
  KEY `idx_reservations_user` (`user_id`),
  KEY `idx_reservations_lot` (`lot_id`),
  KEY `idx_reservations_date` (`reservation_date`)
) ENGINE=InnoDB;

-- 5. PAYMENTS
CREATE TABLE `payments` (
  `payment_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `reservation_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `payment_method` ENUM('gcash', 'card', 'cash') NOT NULL,
  `reference_no` VARCHAR(100) NULL,
  `payment_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payment_status` ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  `receipt_path` VARCHAR(255) NULL,
  `validated_by` INT UNSIGNED NULL,
  `validated_at` DATETIME NULL,
  FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`reservation_id`) ON DELETE CASCADE,
  FOREIGN KEY (`validated_by`) REFERENCES `users`(`user_id`) ON DELETE SET NULL
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
  `type` ENUM('reservation', 'payment', 'system') NOT NULL DEFAULT 'system',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
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

-- ===== Seed data =====
-- Default admin (password: admin123)
INSERT INTO `users` (`fullname`, `email`, `phone`, `password`, `role`, `status`) VALUES
  ('System Administrator', 'admin@cemetery.test', '09170000001', '$2y$10$By0J7o/86O1M19BODiwRGOq6EcnSjZehzxdQVrDiEOe1lW2tTA2Rq', 'admin', 'active');

INSERT INTO `cemetery_sections` (`section_name`, `location`, `description`) VALUES
  ('Section A', 'North wing', 'General burial plots'),
  ('Section B', 'East garden', 'Garden of Peace'),
  ('Section C', 'West wing', 'Cremation niches'),
  ('Section D', 'South wing', 'Mausoleum wing');

INSERT INTO `cemetery_lots` (`lot_code`, `section_id`, `block`, `lot_type`, `price`, `status`, `latitude`, `longitude`) VALUES
  ('A-001', 1, 'A', 'single', 15000.00, 'available', 14.59950000, 120.98420000),
  ('A-002', 1, 'A', 'single', 15000.00, 'available', 14.59952000, 120.98423000),
  ('A-003', 1, 'A', 'double', 25000.00, 'available', 14.59954000, 120.98426000),
  ('B-001', 2, 'B', 'single', 18000.00, 'available', 14.59970000, 120.98440000),
  ('B-002', 2, 'B', 'family', 40000.00, 'available', 14.59972000, 120.98443000),
  ('C-001', 3, 'C', 'single', 8000.00, 'available', 14.59990000, 120.98460000);