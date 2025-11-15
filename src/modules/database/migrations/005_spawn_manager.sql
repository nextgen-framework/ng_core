-- Spawn Manager Tables

-- Player last positions
CREATE TABLE IF NOT EXISTS `player_positions` (
  `identifier` VARCHAR(100) PRIMARY KEY,
  `x` FLOAT NOT NULL,
  `y` FLOAT NOT NULL,
  `z` FLOAT NOT NULL,
  `heading` FLOAT NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Spawn points
CREATE TABLE IF NOT EXISTS `spawn_points` (
  `id` VARCHAR(50) PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'default',
  `x` FLOAT NOT NULL,
  `y` FLOAT NOT NULL,
  `z` FLOAT NOT NULL,
  `heading` FLOAT NOT NULL DEFAULT 0,
  `metadata` JSON NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  INDEX `idx_category` (`category`),
  INDEX `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
