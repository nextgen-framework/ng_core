-- NextGen Framework - Server logs table for Logger module

CREATE TABLE IF NOT EXISTS server_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    resource VARCHAR(64) DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_server_logs_level (level),
    INDEX idx_server_logs_resource (resource),
    INDEX idx_server_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
