/**
 * NextGen Framework - Remove money-manager tables
 * Economy moved to plugin-side (character metadata + GTA natives)
 */
module.exports = {
    async up(db) {
        const playerMoney = await db.query("SHOW TABLES LIKE 'player_money'");
        if (playerMoney.length > 0) {
            await db.execute('DROP TABLE player_money');
        }

        const transactions = await db.query("SHOW TABLES LIKE 'transactions'");
        if (transactions.length > 0) {
            await db.execute('DROP TABLE transactions');
        }
    }
};
