-- NextGen Framework - World state table for Sync Manager module

CREATE TABLE IF NOT EXISTS world_state (
    id INT PRIMARY KEY DEFAULT 1,
    time_hour TINYINT UNSIGNED NOT NULL DEFAULT 12,
    time_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
    weather VARCHAR(20) NOT NULL DEFAULT 'CLEAR',
    blackout TINYINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default row
INSERT IGNORE INTO world_state (id) VALUES (1);
