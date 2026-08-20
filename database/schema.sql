-- Cemetery Reservation and Records Management System
-- Database Schema

CREATE DATABASE IF NOT EXISTS `cemetery_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `cemetery_db`;

-- Sections of the cemetery
CREATE TABLE `sections` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Individual lots within sections
CREATE TABLE `lots` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `section_id` INT UNSIGNED NOT NULL,
  `lot_number` VARCHAR(50) NOT NULL,
  `status` ENUM('available', 'reserved', 'occupied') DEFAULT 'available',
  `type` ENUM('standard', 'double', 'cremation', 'mausoleum') DEFAULT 'standard',
  `price` DECIMAL(10,2) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_lot` (`section_id`, `lot_number`)
) ENGINE=InnoDB;

-- Reservations
CREATE TABLE `reservations` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lot_id` INT UNSIGNED NOT NULL,
  `deceased_name` VARCHAR(255) NOT NULL,
  `date_of_birth` DATE NULL,
  `date_of_death` DATE NULL,
  `contact_name` VARCHAR(255) NOT NULL,
  `contact_email` VARCHAR(255) NULL,
  `contact_phone` VARCHAR(50) NULL,
  `relationship` VARCHAR(100) NULL,
  `status` ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
  `reserved_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Burial records
CREATE TABLE `burial_records` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `reservation_id` INT UNSIGNED NOT NULL,
  `lot_id` INT UNSIGNED NOT NULL,
  `deceased_name` VARCHAR(255) NOT NULL,
  `date_of_birth` DATE NULL,
  `date_of_death` DATE NULL,
  `burial_date` DATE NOT NULL,
  `cause_of_death` VARCHAR(255) NULL,
  `funeral_home` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Payments
CREATE TABLE `payments` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `reservation_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `payment_method` ENUM('cash', 'check', 'card', 'bank_transfer') NOT NULL,
  `reference_number` VARCHAR(100) NULL,
  `paid_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Sample sections
INSERT INTO `sections` (`name`, `description`) VALUES
  ('Section A', 'General burial plots'),
  ('Section B', 'Garden of Peace'),
  ('Section C', 'Cremation niches'),
  ('Section D', 'Mausoleum wing');
