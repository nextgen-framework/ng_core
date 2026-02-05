/**
 * NextGen Framework - Balances Manager Module
 * Generic account & balance system
 *
 * Table schema: balances(id, identifier, balance, metadata, created_at, updated_at)
 *   identifier = flexible key (ACC-0001, character:123, organization:5, license:xxx, etc.)
 *   balance    = BIGINT (cents/units, no floats)
 *   metadata   = extensible JSON (label, type, config, etc.)
 *
 * Plugins handle: account holders, transactions, banking logic, display
 */

class BalancesManager {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        // In-memory cache: identifier => account
        this.cache = new Map();
    }

    /**
     * Initialize balances manager
     */
    async init() {
        this.db = this.framework.getModule('database');

        // RPC handlers
        const rpc = this.framework.getModule('rpc');
        if (rpc) {
            rpc.register('balances:getAccount', this.getAccountByIdentifier.bind(this));
            rpc.register('balances:getBalance', async (identifier) => {
                const account = await this.getAccountByIdentifier(identifier);
                return account ? account.balance : 0;
            });
        }

        this.framework.log.info('Balances manager initialized');
    }

    // ================================
    // Account CRUD
    // ================================

    /**
     * Create a new account
     * @param {string} identifier - Unique account identifier
     * @param {Object} [options] - { balance, metadata }
     * @returns {Promise<Object>} { success, account } or { success: false, reason }
     */
    async createAccount(identifier, options = {}) {
        if (!identifier || typeof identifier !== 'string') {
            return { success: false, reason: 'invalid_identifier' };
        }

        try {
            const existing = await this.getAccountByIdentifier(identifier);
            if (existing) {
                return { success: false, reason: 'account_exists' };
            }

            const balance = Math.max(0, parseInt(options.balance) || 0);
            const metadata = options.metadata || null;

            const result = await this.db.execute(
                'INSERT INTO balances (identifier, balance, metadata) VALUES (?, ?, ?)',
                [identifier, balance, metadata ? JSON.stringify(metadata) : null]
            );

            const account = {
                id: result.insertId,
                identifier,
                balance,
                metadata: metadata || {}
            };

            this.cache.set(identifier, account);
            this.framework.log.info(`Account created: ${identifier} (balance: ${balance})`);

            return { success: true, account };
        } catch (error) {
            this.framework.log.error(`Failed to create account: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Get account by identifier
     * @param {string} identifier - Account identifier
     * @returns {Promise<Object|null>}
     */
    async getAccountByIdentifier(identifier) {
        if (this.cache.has(identifier)) {
            return this.cache.get(identifier);
        }

        try {
            const rows = await this.db.query(
                'SELECT id, identifier, balance, metadata, created_at, updated_at FROM balances WHERE identifier = ?',
                [identifier]
            );

            if (rows.length === 0) return null;

            const row = rows[0];
            const account = {
                id: row.id,
                identifier: row.identifier,
                balance: row.balance,
                metadata: this._parseJson(row.metadata),
                created_at: row.created_at,
                updated_at: row.updated_at
            };

            this.cache.set(identifier, account);
            return account;
        } catch (error) {
            this.framework.log.error(`Failed to get account: ${error.message}`);
            return null;
        }
    }

    /**
     * Get account by ID
     * @param {number} accountId - Account ID
     * @returns {Promise<Object|null>}
     */
    async getAccountById(accountId) {
        try {
            const rows = await this.db.query(
                'SELECT id, identifier, balance, metadata, created_at, updated_at FROM balances WHERE id = ?',
                [accountId]
            );

            if (rows.length === 0) return null;

            const row = rows[0];
            const account = {
                id: row.id,
                identifier: row.identifier,
                balance: row.balance,
                metadata: this._parseJson(row.metadata),
                created_at: row.created_at,
                updated_at: row.updated_at
            };

            this.cache.set(account.identifier, account);
            return account;
        } catch (error) {
            this.framework.log.error(`Failed to get account by ID: ${error.message}`);
            return null;
        }
    }

    /**
     * Delete account
     * @param {string} identifier - Account identifier
     * @returns {Promise<Object>}
     */
    async deleteAccount(identifier) {
        try {
            const account = await this.getAccountByIdentifier(identifier);
            if (!account) {
                return { success: false, reason: 'account_not_found' };
            }

            await this.db.execute('DELETE FROM balances WHERE id = ?', [account.id]);
            this.cache.delete(identifier);

            this.framework.log.info(`Account deleted: ${identifier}`);
            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to delete account: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Update account metadata (merge)
     * @param {string} identifier - Account identifier
     * @param {Object} metadata - Key-value pairs to merge
     * @returns {Promise<Object>}
     */
    async updateMetadata(identifier, metadata) {
        try {
            const account = await this.getAccountByIdentifier(identifier);
            if (!account) {
                return { success: false, reason: 'account_not_found' };
            }

            account.metadata = { ...account.metadata, ...metadata };

            await this.db.execute(
                'UPDATE balances SET metadata = ? WHERE id = ?',
                [JSON.stringify(account.metadata), account.id]
            );

            this.cache.set(identifier, account);
            return { success: true, account };
        } catch (error) {
            this.framework.log.error(`Failed to update metadata: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    // ================================
    // Balance Operations
    // ================================

    /**
     * Get balance
     * @param {string} identifier - Account identifier
     * @returns {Promise<number>}
     */
    async getBalance(identifier) {
        const account = await this.getAccountByIdentifier(identifier);
        return account ? account.balance : 0;
    }

    /**
     * Add balance to account
     * @param {string} identifier - Account identifier
     * @param {number} amount - Amount to add (must be > 0)
     * @param {string} [reason] - Reason (for plugins to use in events)
     * @returns {Promise<Object>}
     */
    async addBalance(identifier, amount, reason) {
        amount = parseInt(amount);
        if (!amount || amount <= 0) {
            return { success: false, reason: 'invalid_amount' };
        }

        try {
            const account = await this.getAccountByIdentifier(identifier);
            if (!account) {
                return { success: false, reason: 'account_not_found' };
            }

            const oldBalance = account.balance;
            const newBalance = oldBalance + amount;

            await this.db.execute(
                'UPDATE balances SET balance = ? WHERE id = ?',
                [newBalance, account.id]
            );

            account.balance = newBalance;
            this.cache.set(identifier, account);

            await this.framework.events.pipe('balances:changed', {
                identifier, oldBalance, newBalance, amount, operation: 'add', reason
            });

            // Emit FiveM event for cross-resource listeners
            this.framework.fivem.emit('ng_core|balance/changed', identifier, oldBalance, newBalance, amount, 'add', reason);

            return { success: true, balance: newBalance };
        } catch (error) {
            this.framework.log.error(`Failed to add balance: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Remove balance from account
     * @param {string} identifier - Account identifier
     * @param {number} amount - Amount to remove (must be > 0)
     * @param {string} [reason] - Reason
     * @returns {Promise<Object>}
     */
    async removeBalance(identifier, amount, reason) {
        amount = parseInt(amount);
        if (!amount || amount <= 0) {
            return { success: false, reason: 'invalid_amount' };
        }

        try {
            const account = await this.getAccountByIdentifier(identifier);
            if (!account) {
                return { success: false, reason: 'account_not_found' };
            }

            if (account.balance < amount) {
                return { success: false, reason: 'insufficient_funds' };
            }

            const oldBalance = account.balance;
            const newBalance = oldBalance - amount;

            await this.db.execute(
                'UPDATE balances SET balance = ? WHERE id = ?',
                [newBalance, account.id]
            );

            account.balance = newBalance;
            this.cache.set(identifier, account);

            await this.framework.events.pipe('balances:changed', {
                identifier, oldBalance, newBalance, amount, operation: 'remove', reason
            });

            // Emit FiveM event for cross-resource listeners
            this.framework.fivem.emit('ng_core|balance/changed', identifier, oldBalance, newBalance, amount, 'remove', reason);

            return { success: true, balance: newBalance };
        } catch (error) {
            this.framework.log.error(`Failed to remove balance: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Set balance directly (admin/system use)
     * @param {string} identifier - Account identifier
     * @param {number} amount - New balance
     * @param {string} [reason] - Reason
     * @returns {Promise<Object>}
     */
    async setBalance(identifier, amount, reason) {
        amount = parseInt(amount);
        if (isNaN(amount) || amount < 0) {
            return { success: false, reason: 'invalid_amount' };
        }

        try {
            const account = await this.getAccountByIdentifier(identifier);
            if (!account) {
                return { success: false, reason: 'account_not_found' };
            }

            const oldBalance = account.balance;

            await this.db.execute(
                'UPDATE balances SET balance = ? WHERE id = ?',
                [amount, account.id]
            );

            account.balance = amount;
            this.cache.set(identifier, account);

            await this.framework.events.pipe('balances:changed', {
                identifier, oldBalance, newBalance: amount, amount: amount - oldBalance, operation: 'set', reason
            });

            // Emit FiveM event for cross-resource listeners
            this.framework.fivem.emit('ng_core|balance/changed', identifier, oldBalance, amount, amount - oldBalance, 'set', reason);

            return { success: true, balance: amount };
        } catch (error) {
            this.framework.log.error(`Failed to set balance: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Transfer between two accounts
     * @param {string} fromIdentifier - Source account
     * @param {string} toIdentifier - Destination account
     * @param {number} amount - Amount to transfer
     * @param {string} [reason] - Reason
     * @returns {Promise<Object>}
     */
    async transfer(fromIdentifier, toIdentifier, amount, reason) {
        amount = parseInt(amount);
        if (!amount || amount <= 0) {
            return { success: false, reason: 'invalid_amount' };
        }

        try {
            const fromAccount = await this.getAccountByIdentifier(fromIdentifier);
            if (!fromAccount) {
                return { success: false, reason: 'from_account_not_found' };
            }

            const toAccount = await this.getAccountByIdentifier(toIdentifier);
            if (!toAccount) {
                return { success: false, reason: 'to_account_not_found' };
            }

            if (fromAccount.balance < amount) {
                return { success: false, reason: 'insufficient_funds' };
            }

            const fromNewBalance = fromAccount.balance - amount;
            const toNewBalance = toAccount.balance + amount;

            await this.db.execute(
                'UPDATE balances SET balance = ? WHERE id = ?',
                [fromNewBalance, fromAccount.id]
            );
            await this.db.execute(
                'UPDATE balances SET balance = ? WHERE id = ?',
                [toNewBalance, toAccount.id]
            );

            fromAccount.balance = fromNewBalance;
            toAccount.balance = toNewBalance;
            this.cache.set(fromIdentifier, fromAccount);
            this.cache.set(toIdentifier, toAccount);

            await this.framework.events.pipe('balances:transfer', {
                from: fromIdentifier, to: toIdentifier, amount, reason,
                fromBalance: fromNewBalance, toBalance: toNewBalance
            });

            // Emit FiveM event for cross-resource listeners
            this.framework.fivem.emit('ng_core|balance/transfer', fromIdentifier, toIdentifier, amount, fromNewBalance, toNewBalance, reason);

            return { success: true, fromBalance: fromNewBalance, toBalance: toNewBalance };
        } catch (error) {
            this.framework.log.error(`Failed to transfer: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Check if account can afford amount
     * @param {string} identifier - Account identifier
     * @param {number} amount - Amount to check
     * @returns {Promise<boolean>}
     */
    async canAfford(identifier, amount) {
        const balance = await this.getBalance(identifier);
        return balance >= amount;
    }

    // ================================
    // Query
    // ================================

    /**
     * Find accounts by identifier pattern
     * @param {string} pattern - SQL LIKE pattern (e.g., 'character:%')
     * @returns {Promise<Array>}
     */
    async findAccounts(pattern) {
        try {
            const rows = await this.db.query(
                'SELECT id, identifier, balance, metadata, created_at, updated_at FROM balances WHERE identifier LIKE ?',
                [pattern]
            );

            return rows.map(row => ({
                id: row.id,
                identifier: row.identifier,
                balance: row.balance,
                metadata: this._parseJson(row.metadata),
                created_at: row.created_at,
                updated_at: row.updated_at
            }));
        } catch (error) {
            this.framework.log.error(`Failed to find accounts: ${error.message}`);
            return [];
        }
    }

    /**
     * Get or create account (upsert)
     * @param {string} identifier - Account identifier
     * @param {Object} [defaults] - Default options if creating
     * @returns {Promise<Object|null>} Account object
     */
    async getOrCreate(identifier, defaults = {}) {
        const existing = await this.getAccountByIdentifier(identifier);
        if (existing) return existing;

        const result = await this.createAccount(identifier, defaults);
        return result.success ? result.account : null;
    }

    // ================================
    // Utility
    // ================================

    /**
     * Parse JSON field
     */
    _parseJson(value) {
        if (!value) return {};
        return typeof value === 'string' ? JSON.parse(value) : value;
    }

    /**
     * Invalidate cache for identifier
     */
    invalidateCache(identifier) {
        this.cache.delete(identifier);
    }

    /**
     * Clear entire cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get statistics
     */
    async getStats() {
        try {
            const stats = await this.db.query(
                'SELECT COUNT(*) as total_accounts, SUM(balance) as total_balance, AVG(balance) as avg_balance FROM balances'
            );
            return stats[0] || {};
        } catch (error) {
            this.framework.log.error(`Failed to get stats: ${error.message}`);
            return {};
        }
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.cache.clear();
        this.framework.log.info('Balances manager destroyed');
    }
}

module.exports = BalancesManager;

// Self-register
global.Framework.register('balances-manager', new BalancesManager(global.Framework), 15);
