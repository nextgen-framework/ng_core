-- World State Table (Sync Manager)
-- Stores current world state for persistence across restarts

CREATE TABLE IF NOT EXISTS `world_state` (
  `id` INT PRIMARY KEY DEFAULT 1,
  `time_hour` INT NOT NULL DEFAULT 12,
  `time_minute` INT NOT NULL DEFAULT 0,
  `weather` VARCHAR(20) NOT NULL DEFAULT 'CLEAR',
  `blackout` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL,
  CHECK (`id` = 1) -- Ensure only one row
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default state
INSERT IGNORE INTO `world_state` (`id`, `time_hour`, `time_minute`, `weather`, `blackout`, `updated_at`)
VALUES (1, 12, 0, 'CLEAR', 0, NOW());
