-- NextGen Framework - UI Modules Tables
-- blip-manager: persistent map blips
-- text-3d: persistent 3D text points

CREATE TABLE IF NOT EXISTS ui_blips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    label VARCHAR(255),
    type VARCHAR(50) DEFAULT 'static',
    category VARCHAR(50) DEFAULT 'default',
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    z FLOAT NOT NULL,
    sprite INT DEFAULT 1,
    color INT DEFAULT 0,
    scale FLOAT DEFAULT 1.0,
    short_range TINYINT(1) DEFAULT 1,
    properties JSON,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS text3d_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text VARCHAR(500) NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    z FLOAT NOT NULL,
    group_name VARCHAR(100) DEFAULT 'default',
    font INT DEFAULT 0,
    scale FLOAT DEFAULT 0.35,
    color_r INT DEFAULT 255,
    color_g INT DEFAULT 255,
    color_b INT DEFAULT 255,
    color_a INT DEFAULT 255,
    render_distance FLOAT DEFAULT 20.0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
