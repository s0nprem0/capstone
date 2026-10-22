-- Brings an existing database to the lot-ownership schema. Run once, after
-- 2026-10-22-integrity-and-audit.sql:
--   make upgrade FILE=database/upgrades/2026-10-23-lot-owners.sql
-- A fresh `make migrate` already has all of this.
--
-- DOWNLOAD A BACKUP FIRST (Settings > Download Backup). This removes the
-- earlier ledger load: its 27 "Handwritten ledger" sections held copies of
-- surveyed plots (B5-01 beside S5-001), off the map, so a plot the ledger
-- sold still showed as available. Their burials and owners go with them;
-- staff encode the sales book's records onto the real plots through Burial
-- Records and the map's Owners panel. If any reservation or payment was made
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

CREATE TABLE `lot_owners` (
  `owner_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lot_id` INT UNSIGNED NOT NULL,
  `plot` VARCHAR(10) NULL,
  `owner_name` VARCHAR(255) NOT NULL,
  `payment_terms` ENUM('cash', 'installment', 'F') NULL,
  `notes` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lot_id`) REFERENCES `cemetery_lots`(`lot_id`) ON DELETE RESTRICT,
  KEY `idx_lot_owners_lot` (`lot_id`),
  KEY `idx_lot_owners_name` (`owner_name`)
) ENGINE=InnoDB;
