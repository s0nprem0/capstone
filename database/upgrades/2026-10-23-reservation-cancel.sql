-- Lets a client withdraw their own pending reservation. Run once:
--   make upgrade FILE=database/upgrades/2026-10-23-reservation-cancel.sql
-- A fresh `make migrate` already has this.

USE `cemetery_db`;

ALTER TABLE `reservations`
  MODIFY `approved_status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending';
