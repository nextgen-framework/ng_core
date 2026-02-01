-- NextGen Framework - Whitelist & Queue Tables
-- Security & access control tables

-- Whitelist table
CREATE TABLE IF NOT EXISTS whitelist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL UNIQUE COMMENT 'license:xxx, steam:xxx, discord:xxx, etc.',
  active TINYINT(1) DEFAULT 1,
  added_by VARCHAR(255) DEFAULT NULL COMMENT 'Who added this player',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT DEFAULT NULL COMMENT 'Why player was whitelisted',
  removed_by VARCHAR(255) DEFAULT NULL,
  removed_at TIMESTAMP DEFAULT NULL,
  removal_reason TEXT DEFAULT NULL,
  INDEX idx_identifier (identifier),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Queue table (for when server is full)
CREATE TABLE IF NOT EXISTS queue_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL UNIQUE,
  queue_type VARCHAR(50) DEFAULT 'normal' COMMENT 'Type of queue: normal, priority, vip, staff',
  priority INT DEFAULT 100 COMMENT 'Lower number = higher priority',
  reason VARCHAR(255) DEFAULT NULL COMMENT 'Why they have priority',
  added_by VARCHAR(255) DEFAULT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_identifier (identifier),
  INDEX idx_priority (priority),
  INDEX idx_queue_type (queue_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
