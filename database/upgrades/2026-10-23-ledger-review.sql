-- Moves an existing database to the ledger review pipeline. Run once, after
-- 2026-10-22-integrity-and-audit.sql:
--   make upgrade FILE=database/upgrades/2026-10-23-ledger-review.sql
--   make ledger-import
-- A fresh `make migrate` already has the new tables.
--
-- DOWNLOAD A BACKUP FIRST (Settings > Download Backup). This removes the
-- earlier ledger load: its 27 "Handwritten ledger" sections held copies of
-- surveyed plots (B5-01 beside S5-001), so a plot the ledger sold still showed
-- as available on the map. Their owners and burials are not lost: they come
-- back from database/ledger/old/*.csv through `make ledger-import`, as rows for
-- staff to review onto the real plots. If any reservation or payment was made
-- against a ledger copy, the lot delete below stops with a foreign-key error
-- and nothing after it runs; move that reservation first.

USE `cemetery_db`;

DELETE b FROM `burial_records` b
  JOIN `cemetery_lots` l ON l.`lot_id` = b.`lot_id`
  JOIN `cemetery_sections` s ON s.`section_id` = l.`section_id`
  WHERE s.`location` = 'Handwritten ledger';

-- The earlier table: every row in it was on a ledger copy.
DROP TABLE IF EXISTS `lot_owners`;

DELETE l FROM `cemetery_lots` l
  JOIN `cemetery_sections` s ON s.`section_id` = l.`section_id`
  WHERE s.`location` = 'Handwritten ledger';

DELETE FROM `cemetery_sections` WHERE `location` = 'Handwritten ledger';

ALTER TABLE `burial_records` ADD COLUMN `source` VARCHAR(120) NULL AFTER `interment_status`;

CREATE TABLE `lot_owners` (
  `owner_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lot_id` INT UNSIGNED NOT NULL,
  `plot` VARCHAR(10) NULL,
  `owner_name` VARCHAR(255) NOT NULL,
  `payment_terms` ENUM('cash', 'installment', 'F') NULL,
  `notes` VARCHAR(500) NULL,
  `source` VARCHAR(120) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lot_id`) REFERENCES `cemetery_lots`(`lot_id`) ON DELETE RESTRICT,
  KEY `idx_lot_owners_lot` (`lot_id`),
  KEY `idx_lot_owners_name` (`owner_name`)
) ENGINE=InnoDB;

CREATE TABLE `ledger_rows` (
  `row_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `row_key` CHAR(40) NOT NULL,
  `kind` ENUM('owner', 'burial') NOT NULL,
  `book` VARCHAR(10) NOT NULL,
  `photo` VARCHAR(50) NULL,
  `block_label` VARCHAR(120) NOT NULL,
  `lot` VARCHAR(20) NOT NULL,
  `plot` VARCHAR(10) NULL,
  `name` VARCHAR(255) NOT NULL,
  `terms` VARCHAR(20) NULL,
  `date_text` VARCHAR(50) NULL,
  `burial_date` DATE NULL,
  `notes` VARCHAR(500) NULL,
  `doubt` VARCHAR(500) NULL,
  `lot_id` INT UNSIGNED NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `review_note` VARCHAR(255) NULL,
  `record_id` INT UNSIGNED NULL,
  `reviewed_by` INT UNSIGNED NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_ledger_row_key` (`row_key`),
  KEY `idx_ledger_status` (`status`, `kind`),
  KEY `idx_ledger_lot` (`lot_id`),
  FOREIGN KEY (`lot_id`) REFERENCES `cemetery_lots`(`lot_id`) ON DELETE SET NULL,
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB;
