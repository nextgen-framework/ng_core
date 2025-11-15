-- Money Manager Tables

-- Player money accounts
CREATE TABLE IF NOT EXISTS `player_money` (
  `identifier` VARCHAR(100) PRIMARY KEY,
  `cash` INT NOT NULL DEFAULT 0,
  `bank` INT NOT NULL DEFAULT 0,
  `black_money` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cash` (`cash`),
  INDEX `idx_bank` (`bank`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
