-- NextGen Framework - Core module tables
-- admins, characters, balances, persistent_entities, server_logs,
-- whitelist, queue_settings, containers, container_items, world_state,
-- vehicles, organizations, organization_employees, generic_access

-- ================================
-- Layer 0-2 : Foundation / Infrastructure
-- ================================

-- logger module
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

-- persistence module
CREATE TABLE IF NOT EXISTS persistent_entities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    model VARCHAR(64) NOT NULL,
    x DOUBLE NOT NULL DEFAULT 0,
    y DOUBLE NOT NULL DEFAULT 0,
    z DOUBLE NOT NULL DEFAULT 0,
    heading FLOAT NOT NULL DEFAULT 0,
    metadata JSON DEFAULT NULL,
    net_id INT DEFAULT NULL,
    created_by VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_persistent_entities_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- Layer 8-9 : Connection
-- ================================

-- whitelist sub-module
CREATE TABLE IF NOT EXISTS whitelist (
    identifier VARCHAR(128) PRIMARY KEY,
    added_by VARCHAR(64) DEFAULT NULL,
    reason VARCHAR(255) DEFAULT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active TINYINT(1) NOT NULL DEFAULT 1,
    removed_by VARCHAR(64) DEFAULT NULL,
    removed_at TIMESTAMP NULL DEFAULT NULL,
    removal_reason VARCHAR(255) DEFAULT NULL,
    INDEX idx_whitelist_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- queue module
CREATE TABLE IF NOT EXISTS queue_settings (
    identifier VARCHAR(128) PRIMARY KEY,
    queue_type VARCHAR(32) DEFAULT NULL,
    priority INT NOT NULL DEFAULT 100,
    reason VARCHAR(255) DEFAULT NULL,
    added_by VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- Layer 10 : Core Systems
-- ================================

-- admin-manager module
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(128) NOT NULL,
    permission_level INT NOT NULL DEFAULT 1,
    added_by VARCHAR(64) DEFAULT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uk_admins_identifier (identifier),
    INDEX idx_admins_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sync-manager module
CREATE TABLE IF NOT EXISTS world_state (
    id INT PRIMARY KEY DEFAULT 1,
    time_hour TINYINT UNSIGNED NOT NULL DEFAULT 12,
    time_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
    weather VARCHAR(20) NOT NULL DEFAULT 'CLEAR',
    blackout TINYINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO world_state (id) VALUES (1);

-- access-manager module (single generic table)
CREATE TABLE IF NOT EXISTS generic_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    access_type VARCHAR(32) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    identifier VARCHAR(128) NOT NULL,
    granted_by VARCHAR(64) DEFAULT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON DEFAULT NULL,
    UNIQUE KEY uk_generic_access (access_type, resource_id, identifier),
    INDEX idx_generic_access_type (access_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================
-- Layer 14 : Character Systems
-- ================================

-- character-manager module
CREATE TABLE IF NOT EXISTS characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(128) NOT NULL,
    data JSON DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_characters_identifier (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- balances-manager module
CREATE TABLE IF NOT EXISTS balances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(128) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_balances_identifier (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- container-manager module
CREATE TABLE IF NOT EXISTS containers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    owner VARCHAR(128) NOT NULL,
    slots INT NOT NULL DEFAULT 20,
    max_weight INT NOT NULL DEFAULT 50000,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_containers_owner (owner),
    INDEX idx_containers_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS container_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    container_id INT NOT NULL,
    slot INT NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    metadata JSON DEFAULT NULL,
    UNIQUE KEY uk_container_items_slot (container_id, slot),
    INDEX idx_container_items_item (item_id),
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ================================
-- Layer 17 : High-Level
-- ================================

-- vehicle-manager module
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plate VARCHAR(8) NOT NULL,
    model VARCHAR(64) NOT NULL,
    owner_type VARCHAR(20) NOT NULL DEFAULT 'character',
    owner_id INT NOT NULL,
    garage VARCHAR(64) DEFAULT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'stored',
    position JSON DEFAULT NULL,
    customization JSON DEFAULT NULL,
    fuel INT NOT NULL DEFAULT 100,
    engine_health FLOAT NOT NULL DEFAULT 1000.0,
    body_health FLOAT NOT NULL DEFAULT 1000.0,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_vehicles_plate (plate),
    INDEX idx_vehicles_owner (owner_type, owner_id),
    INDEX idx_vehicles_garage (garage),
    INDEX idx_vehicles_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- organization-manager module
CREATE TABLE IF NOT EXISTS organizations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'business',
    label VARCHAR(128) NOT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_organizations_name (name),
    INDEX idx_organizations_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    org_id INT NOT NULL,
    char_id INT NOT NULL,
    grade INT NOT NULL DEFAULT 0,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_org_employees (org_id, char_id),
    INDEX idx_org_employees_char (char_id),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (char_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
