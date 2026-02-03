/**
 * NextGen Framework - Ensure balances table exists
 * Handles both fresh install and rename from legacy 'accounts' table
 */
module.exports = {
    async up(db) {
        const balances = await db.query("SHOW TABLES LIKE 'balances'");
        if (balances.length > 0) return;

        // Rename legacy table if it exists
        const accounts = await db.query("SHOW TABLES LIKE 'accounts'");
        if (accounts.length > 0) {
            await db.execute('RENAME TABLE accounts TO balances');
            return;
        }

        // Fresh install — create table
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
