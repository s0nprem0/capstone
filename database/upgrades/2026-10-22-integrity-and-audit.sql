-- Brings a database created from an older schema.sql up to date without
-- wiping it (make migrate drops every table). Run once:
--   make upgrade FILE=database/upgrades/2026-10-22-integrity-and-audit.sql
-- A fresh `make migrate` already includes all of this.

USE `cemetery_db`;

-- A reservation with payments can no longer be deleted out from under them.
-- Two statements: MySQL will not drop and re-add a key of the same name in one.
ALTER TABLE `payments` DROP FOREIGN KEY `payments_ibfk_1`;
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`reservation_id`)
    REFERENCES `reservations`(`reservation_id`) ON DELETE RESTRICT;

-- The pending-hold expiry sweep looks pending requests up by age.
ALTER TABLE `reservations`
  ADD KEY `idx_reservations_status_created` (`approved_status`, `created_at`);

-- Where each audited request came from, and what it changed.
ALTER TABLE `audit_logs`
  ADD COLUMN `ip_address` VARCHAR(45) NULL AFTER `record_id`,
  ADD COLUMN `details` JSON NULL AFTER `ip_address`;
