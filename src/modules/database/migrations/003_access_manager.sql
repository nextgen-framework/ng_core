-- Access Manager Tables
-- Vehicle Keys, Door States, Container Access, Property Keys, Generic Access

-- Vehicle Keys
CREATE TABLE IF NOT EXISTS `vehicle_keys` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `vehicle_id` VARCHAR(50) NOT NULL,
  `identifier` VARCHAR(100) NOT NULL,
  `granted_by` VARCHAR(100) NOT NULL,
  `granted_at` DATETIME NOT NULL,
  `expires_at` DATETIME NULL,
  UNIQUE KEY `unique_vehicle_key` (`vehicle_id`, `identifier`),
  INDEX `idx_vehicle_id` (`vehicle_id`),
  INDEX `idx_identifier` (`identifier`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Door States
CREATE TABLE IF NOT EXISTS `door_states` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `door_id` VARCHAR(100) NOT NULL UNIQUE,
  `locked` TINYINT(1) NOT NULL DEFAULT 1,
  `owner` VARCHAR(100) NULL,
  `created_at` DATETIME NOT NULL,
  `last_toggled_at` DATETIME NULL,
  `last_toggled_by` VARCHAR(100) NULL,
  INDEX `idx_door_id` (`door_id`),
  INDEX `idx_owner` (`owner`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Container Access
CREATE TABLE IF NOT EXISTS `container_access` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `container_id` VARCHAR(50) NOT NULL,
  `identifier` VARCHAR(100) NOT NULL,
  `granted_by` VARCHAR(100) NOT NULL,
  `granted_at` DATETIME NOT NULL,
  UNIQUE KEY `unique_container_access` (`container_id`, `identifier`),
  INDEX `idx_container_id` (`container_id`),
  INDEX `idx_identifier` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Property Keys
CREATE TABLE IF NOT EXISTS `property_keys` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` VARCHAR(50) NOT NULL,
  `identifier` VARCHAR(100) NOT NULL,
  `granted_by` VARCHAR(100) NOT NULL,
  `granted_at` DATETIME NOT NULL,
  `expires_at` DATETIME NULL,
  UNIQUE KEY `unique_property_key` (`property_id`, `identifier`),
  INDEX `idx_property_id` (`property_id`),
  INDEX `idx_identifier` (`identifier`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generic Access (for extensibility)
CREATE TABLE IF NOT EXISTS `generic_access` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `access_type` VARCHAR(50) NOT NULL COMMENT 'Type of resource (e.g., door, safe, terminal)',
  `resource_id` VARCHAR(100) NOT NULL COMMENT 'ID of the resource',
  `identifier` VARCHAR(100) NOT NULL,
  `granted_by` VARCHAR(100) NOT NULL,
  `granted_at` DATETIME NOT NULL,
  `metadata` JSON NULL COMMENT 'Additional metadata',
  UNIQUE KEY `unique_generic_access` (`access_type`, `resource_id`, `identifier`),
  INDEX `idx_access_type` (`access_type`),
  INDEX `idx_resource` (`resource_id`),
  INDEX `idx_identifier` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
