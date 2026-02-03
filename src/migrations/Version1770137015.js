/**
 * NextGen Framework - Rename accounts to balances
 */
module.exports = {
    async up(db) {
        const oldTable = await db.query("SHOW TABLES LIKE 'accounts'");
        if (oldTable.length === 0) return;

        await db.execute('RENAME TABLE accounts TO balances');
    }
};
