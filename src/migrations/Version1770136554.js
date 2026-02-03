/**
 * NextGen Framework - Add balances table for balances-manager
 */
module.exports = {
    async up(db) {
        const tables = await db.query("SHOW TABLES LIKE 'balances'");
        if (tables.length > 0) return;

        // Skip if old name exists (will be renamed by next migration)
        const oldTable = await db.query("SHOW TABLES LIKE 'accounts'");
        if (oldTable.length > 0) return;

        await db.execute(`
            CREATE TABLE balances (
                id INT AUTO_INCREMENT PRIMARY KEY,
                identifier VARCHAR(128) NOT NULL,
                balance BIGINT NOT NULL DEFAULT 0,
                metadata JSON DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_balances_identifier (identifier)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }
};
