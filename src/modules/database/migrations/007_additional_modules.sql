-- Additional Modules Tables
-- Character Manager, Organization Manager, Vehicle Manager, Admin Manager

-- Admins table
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `identifier` VARCHAR(100) NOT NULL UNIQUE,
  `permission_level` INT NOT NULL DEFAULT 1,
  `added_by` VARCHAR(100) NOT NULL,
  `added_at` DATETIME NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  INDEX `idx_identifier` (`identifier`),
  INDEX `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
