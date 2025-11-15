-- NextGen Framework - Initial Database Schema
-- Creates core tables for framework functionality

-- Players table (basic player data)
CREATE TABLE IF NOT EXISTS players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL UNIQUE COMMENT 'Primary identifier (license)',
  steam VARCHAR(255) DEFAULT NULL,
  discord VARCHAR(255) DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON DEFAULT NULL COMMENT 'Custom player metadata',
  INDEX idx_identifier (identifier),
  INDEX idx_steam (steam),
  INDEX idx_discord (discord),
  INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Characters table (multi-character system)
CREATE TABLE IF NOT EXISTS characters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  firstname VARCHAR(50) NOT NULL,
  lastname VARCHAR(50) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(10) NOT NULL,
  height INT DEFAULT 180,
  last_position JSON DEFAULT NULL COMMENT '{x, y, z, heading}',
  metadata JSON DEFAULT NULL COMMENT 'Custom character data (appearance, status, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  INDEX idx_player (player_id),
  INDEX idx_fullname (firstname, lastname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Containers table (inventory/storage abstraction)
CREATE TABLE IF NOT EXISTS containers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL COMMENT 'player, vehicle, stash, property, drop',
  owner_type VARCHAR(50) DEFAULT NULL COMMENT 'character, organization, vehicle, property',
  owner_id INT DEFAULT NULL COMMENT 'ID of the owner',
  max_weight DECIMAL(10, 2) DEFAULT 50.0,
  max_slots INT DEFAULT 50,
  metadata JSON DEFAULT NULL COMMENT 'Container-specific data (position for drops, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_owner (owner_type, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Container items table
CREATE TABLE IF NOT EXISTS container_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  container_id INT NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  slot INT DEFAULT NULL,
  metadata JSON DEFAULT NULL COMMENT 'Item-specific data (durability, ammo, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
  INDEX idx_container (container_id),
  INDEX idx_item (item_name),
  INDEX idx_slot (container_id, slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plate VARCHAR(20) NOT NULL UNIQUE,
  model VARCHAR(50) NOT NULL,
  owner_type VARCHAR(50) DEFAULT NULL COMMENT 'character, organization',
  owner_id INT DEFAULT NULL,
  garage VARCHAR(50) DEFAULT NULL COMMENT 'Garage name where vehicle is stored',
  state VARCHAR(20) DEFAULT 'out' COMMENT 'out, stored, impounded',
  position JSON DEFAULT NULL COMMENT '{x, y, z, heading} if out',
  customization JSON DEFAULT NULL COMMENT 'Vehicle customization data',
  fuel DECIMAL(5, 2) DEFAULT 100.0,
  engine_health DECIMAL(7, 2) DEFAULT 1000.0,
  body_health DECIMAL(7, 2) DEFAULT 1000.0,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_plate (plate),
  INDEX idx_owner (owner_type, owner_id),
  INDEX idx_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Organizations table (jobs, gangs, companies)
CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL COMMENT 'police, hospital, gang, business, etc.',
  label VARCHAR(100) NOT NULL,
  metadata JSON DEFAULT NULL COMMENT 'Organization-specific data (zones, vehicles, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Organization employees table
CREATE TABLE IF NOT EXISTS organization_employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  char_id INT NOT NULL,
  grade INT NOT NULL DEFAULT 0,
  metadata JSON DEFAULT NULL COMMENT 'Employee-specific data (hire_date, permissions, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (char_id) REFERENCES characters(id) ON DELETE CASCADE,
  UNIQUE KEY unique_employee (org_id, char_id),
  INDEX idx_org (org_id),
  INDEX idx_char (char_id),
  INDEX idx_grade (grade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transactions table (money transfers)
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_type VARCHAR(50) DEFAULT NULL COMMENT 'character, organization, system',
  from_id INT DEFAULT NULL,
  to_type VARCHAR(50) DEFAULT NULL,
  to_id INT DEFAULT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'cash, bank, crypto, etc.',
  reason VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_from (from_type, from_id),
  INDEX idx_to (to_type, to_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  char_id INT NOT NULL,
  type VARCHAR(50) NOT NULL COMMENT 'driver, weapon, business, etc.',
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  FOREIGN KEY (char_id) REFERENCES characters(id) ON DELETE CASCADE,
  UNIQUE KEY unique_license (char_id, type),
  INDEX idx_char (char_id),
  INDEX idx_type (type),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
