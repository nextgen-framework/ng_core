/**
 * NextGen Framework - Money Manager Module
 * Manages player money, transactions, and economy
 */

class MoneyManager {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;
    this.playerManager = null;

    // Money cache for online players
    this.playerMoney = new Map(); // source => { cash, bank, blackMoney }

    // Configuration
    this.config = {
      startingCash: 5000,
      startingBank: 10000,
      maxCash: 999999999,
      maxBank: 999999999,
      enableBlackMoney: true,
      enableTransactionLog: true,
      currencies: ['cash', 'bank', 'black_money'],
      transactionRetentionDays: 90
    };
  }

  /**
   * Initialize money manager module
   */
  async init() {
    this.logger = this.framework.getModule('logger');
    this.playerManager = this.framework.getModule('player-manager');

    // Handle player joining
    on('playerJoining', async () => {
      const source = global.source;
      await this.loadPlayerMoney(source);
    });

    // Handle player dropping
    on('playerDropped', async () => {
      const source = global.source;
      await this.savePlayerMoney(source);
      this.playerMoney.delete(source);
    });

    this.log('Money manager module initialized', 'info');
  }

  // ================================
  // Player Money Management
  // ================================

  /**
   * Load player money from database
   */
  async loadPlayerMoney(source) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) return false;

      const identifier = player.getIdentifier('license');
      if (!identifier) return false;

      let money = await this.db.query(
        'SELECT cash, bank, black_money FROM player_money WHERE identifier = ?',
        [identifier]
      );

      if (money.length === 0) {
        // Create new money record
        await this.db.execute(
          'INSERT INTO player_money (identifier, cash, bank, black_money) VALUES (?, ?, ?, ?)',
          [identifier, this.config.startingCash, this.config.startingBank, 0]
        );

        this.playerMoney.set(source, {
          cash: this.config.startingCash,
          bank: this.config.startingBank,
          black_money: 0
        });
      } else {
        this.playerMoney.set(source, {
          cash: money[0].cash || 0,
          bank: money[0].bank || 0,
          black_money: money[0].black_money || 0
        });
      }

      this.log(`Loaded money for player ${source}`, 'debug');
      return true;
    } catch (error) {
      this.log(`Failed to load player money: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Save player money to database
   */
  async savePlayerMoney(source) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) return false;

      const identifier = player.getIdentifier('license');
      if (!identifier) return false;

      const money = this.playerMoney.get(source);
      if (!money) return false;

      await this.db.execute(
        'UPDATE player_money SET cash = ?, bank = ?, black_money = ? WHERE identifier = ?',
        [money.cash, money.bank, money.black_money, identifier]
      );

      this.log(`Saved money for player ${source}`, 'debug');
      return true;
    } catch (error) {
      this.log(`Failed to save player money: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Get player money
   */
  getMoney(source, type = 'cash') {
    const money = this.playerMoney.get(source);
    if (!money) return 0;

    return money[type] || 0;
  }

  /**
   * Get all player money
   */
  getAllMoney(source) {
    return this.playerMoney.get(source) || {
      cash: 0,
      bank: 0,
      black_money: 0
    };
  }

  /**
   * Set player money (use with caution)
   */
  async setMoney(source, type, amount, reason = 'admin') {
    const money = this.playerMoney.get(source);
    if (!money) return { success: false, reason: 'player_not_found' };

    if (!this.config.currencies.includes(type)) {
      return { success: false, reason: 'invalid_currency' };
    }

    const oldAmount = money[type];
    money[type] = Math.max(0, Math.min(amount, this.getMaxAmount(type)));

    // Save to database
    await this.savePlayerMoney(source);

    // Log transaction
    if (this.config.enableTransactionLog) {
      await this.logTransaction(source, null, type, amount - oldAmount, 'set', reason);
    }

    // Sync to client
    emitNet('ng-core:money-update', source, type, money[type]);

    this.log(`Set ${type} for player ${source}: ${oldAmount} -> ${money[type]}`, 'info', { reason });

    return { success: true, newAmount: money[type] };
  }

  /**
   * Add money to player
   */
  async addMoney(source, type, amount, reason = null) {
    if (amount <= 0) return { success: false, reason: 'invalid_amount' };

    const money = this.playerMoney.get(source);
    if (!money) return { success: false, reason: 'player_not_found' };

    if (!this.config.currencies.includes(type)) {
      return { success: false, reason: 'invalid_currency' };
    }

    const oldAmount = money[type];
    const maxAmount = this.getMaxAmount(type);
    const newAmount = Math.min(oldAmount + amount, maxAmount);
    const actualAdded = newAmount - oldAmount;

    if (actualAdded === 0) {
      return { success: false, reason: 'max_amount_reached' };
    }

    money[type] = newAmount;

    // Save to database
    await this.savePlayerMoney(source);

    // Log transaction
    if (this.config.enableTransactionLog) {
      await this.logTransaction(source, null, type, actualAdded, 'add', reason);
    }

    // Sync to client
    emitNet('ng-core:money-update', source, type, money[type]);

    this.log(`Added ${actualAdded} ${type} to player ${source}`, 'debug', { reason });

    return { success: true, added: actualAdded, newAmount: money[type] };
  }

  /**
   * Remove money from player
   */
  async removeMoney(source, type, amount, reason = null) {
    if (amount <= 0) return { success: false, reason: 'invalid_amount' };

    const money = this.playerMoney.get(source);
    if (!money) return { success: false, reason: 'player_not_found' };

    if (!this.config.currencies.includes(type)) {
      return { success: false, reason: 'invalid_currency' };
    }

    if (money[type] < amount) {
      return { success: false, reason: 'insufficient_funds' };
    }

    const oldAmount = money[type];
    money[type] = oldAmount - amount;

    // Save to database
    await this.savePlayerMoney(source);

    // Log transaction
    if (this.config.enableTransactionLog) {
      await this.logTransaction(source, null, type, -amount, 'remove', reason);
    }

    // Sync to client
    emitNet('ng-core:money-update', source, type, money[type]);

    this.log(`Removed ${amount} ${type} from player ${source}`, 'debug', { reason });

    return { success: true, removed: amount, newAmount: money[type] };
  }

  /**
   * Transfer money between players
   */
  async transferMoney(fromSource, toSource, type, amount, reason = null) {
    if (amount <= 0) return { success: false, reason: 'invalid_amount' };

    // Check if sender has enough
    if (!this.canAfford(fromSource, type, amount)) {
      return { success: false, reason: 'insufficient_funds' };
    }

    // Remove from sender
    const removeResult = await this.removeMoney(fromSource, type, amount, `transfer_to_${toSource}`);
    if (!removeResult.success) return removeResult;

    // Add to receiver
    const addResult = await this.addMoney(toSource, type, amount, `transfer_from_${fromSource}`);
    if (!addResult.success) {
      // Rollback sender
      await this.addMoney(fromSource, type, amount, 'transfer_rollback');
      return addResult;
    }

    // Log transaction
    if (this.config.enableTransactionLog) {
      await this.logTransaction(fromSource, toSource, type, amount, 'transfer', reason);
    }

    this.log(`Transferred ${amount} ${type} from ${fromSource} to ${toSource}`, 'info', { reason });

    return { success: true, amount };
  }

  /**
   * Check if player can afford amount
   */
  canAfford(source, type, amount) {
    const money = this.playerMoney.get(source);
    if (!money) return false;

    return money[type] >= amount;
  }

  /**
   * Deposit cash to bank
   */
  async depositToBank(source, amount) {
    if (amount <= 0) return { success: false, reason: 'invalid_amount' };

    const money = this.playerMoney.get(source);
    if (!money) return { success: false, reason: 'player_not_found' };

    if (money.cash < amount) {
      return { success: false, reason: 'insufficient_cash' };
    }

    // Check bank limit
    if (money.bank + amount > this.config.maxBank) {
      return { success: false, reason: 'bank_limit_reached' };
    }

    money.cash -= amount;
    money.bank += amount;

    await this.savePlayerMoney(source);

    // Log transaction
    if (this.config.enableTransactionLog) {
      await this.logTransaction(source, null, 'bank', amount, 'deposit', 'atm');
    }

    emitNet('ng-core:money-update', source, 'cash', money.cash);
    emitNet('ng-core:money-update', source, 'bank', money.bank);

    this.log(`Player ${source} deposited ${amount} to bank`, 'debug');

    return { success: true, newCash: money.cash, newBank: money.bank };
  }

  /**
   * Withdraw from bank to cash
   */
  async withdrawFromBank(source, amount) {
    if (amount <= 0) return { success: false, reason: 'invalid_amount' };

    const money = this.playerMoney.get(source);
    if (!money) return { success: false, reason: 'player_not_found' };

    if (money.bank < amount) {
      return { success: false, reason: 'insufficient_bank' };
    }

    // Check cash limit
    if (money.cash + amount > this.config.maxCash) {
      return { success: false, reason: 'cash_limit_reached' };
    }

    money.bank -= amount;
    money.cash += amount;

    await this.savePlayerMoney(source);

    // Log transaction
    if (this.config.enableTransactionLog) {
      await this.logTransaction(source, null, 'cash', amount, 'withdraw', 'atm');
    }

    emitNet('ng-core:money-update', source, 'cash', money.cash);
    emitNet('ng-core:money-update', source, 'bank', money.bank);

    this.log(`Player ${source} withdrew ${amount} from bank`, 'debug');

    return { success: true, newCash: money.cash, newBank: money.bank };
  }

  // ================================
  // Transaction Logging
  // ================================

  /**
   * Log transaction to database
   */
  async logTransaction(fromSource, toSource, type, amount, transactionType, reason) {
    try {
      const fromPlayer = fromSource ? (this.playerManager ? this.playerManager.get(fromSource) : null) : null;
      const toPlayer = toSource ? (this.playerManager ? this.playerManager.get(toSource) : null) : null;

      const fromIdentifier = fromPlayer ? fromPlayer.getIdentifier('license') : null;
      const toIdentifier = toPlayer ? toPlayer.getIdentifier('license') : null;

      await this.db.execute(
        'INSERT INTO transactions (from_identifier, to_identifier, type, amount, transaction_type, reason, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [fromIdentifier, toIdentifier, type, amount, transactionType, reason]
      );
    } catch (error) {
      this.log(`Failed to log transaction: ${error.message}`, 'error');
    }
  }

  /**
   * Get player transactions
   */
  async getTransactions(source, limit = 50) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) return [];

      const identifier = player.getIdentifier('license');
      if (!identifier) return [];

      const transactions = await this.db.query(
        'SELECT * FROM transactions WHERE from_identifier = ? OR to_identifier = ? ORDER BY created_at DESC LIMIT ?',
        [identifier, identifier, limit]
      );

      return transactions;
    } catch (error) {
      this.log(`Failed to get transactions: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Clean old transactions
   */
  async cleanOldTransactions() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.transactionRetentionDays);

      const result = await this.db.execute(
        'DELETE FROM transactions WHERE created_at < ?',
        [cutoffDate]
      );

      this.log(`Cleaned ${result.affectedRows} old transactions`, 'info');
      return result.affectedRows;
    } catch (error) {
      this.log(`Failed to clean old transactions: ${error.message}`, 'error');
      return 0;
    }
  }

  // ================================
  // Utility Methods
  // ================================

  /**
   * Get max amount for currency type
   */
  getMaxAmount(type) {
    if (type === 'bank') return this.config.maxBank;
    if (type === 'cash' || type === 'black_money') return this.config.maxCash;
    return this.config.maxCash;
  }

  /**
   * Format money amount
   */
  formatMoney(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  /**
   * Configure money manager
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.log('Money manager configuration updated', 'info');
  }

  /**
   * Get statistics
   */
  async getStats() {
    try {
      const stats = await this.db.query(
        'SELECT ' +
        'COUNT(*) as total_accounts, ' +
        'SUM(cash) as total_cash, ' +
        'SUM(bank) as total_bank, ' +
        'SUM(black_money) as total_black_money, ' +
        'AVG(cash) as avg_cash, ' +
        'AVG(bank) as avg_bank ' +
        'FROM player_money'
      );

      return stats[0] || {};
    } catch (error) {
      this.log(`Failed to get stats: ${error.message}`, 'error');
      return {};
    }
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.utils.Log(`[Money Manager] ${message}`, level);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    // Save all player money
    for (const source of this.playerMoney.keys()) {
      await this.savePlayerMoney(source);
    }

    this.playerMoney.clear();
    this.log('Money manager module destroyed', 'info');
  }
}

module.exports = MoneyManager;
