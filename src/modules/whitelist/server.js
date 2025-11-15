/**
 * NextGen Framework - Whitelist Module
 * Server whitelist management with database storage
 */

class Whitelist {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;

    // In-memory cache for fast lookups
    this.whitelistedPlayers = new Set();

    // Check convar for whitelist enable/disable (default: false for development)
    this.enabled = GetConvar('ngcore_whitelist_enabled', 'false') === 'true';
  }

  /**
   * Initialize whitelist module
   */
  async init() {
    this.logger = this.framework.getModule('logger');

    // Load whitelist from database
    await this.loadWhitelist();

    // Register player connecting hook
    this.framework.registerHook(
      this.framework.constants.Hooks.BEFORE_PLAYER_JOIN,
      this.checkWhitelist.bind(this)
    );

    const count = this.whitelistedPlayers.size;
    const status = this.enabled ? 'ENABLED' : 'DISABLED';
    this.log(`Whitelist module initialized - ${status} (${count} whitelisted players)`, 'info');

    if (!this.enabled) {
      this.log('Whitelist is DISABLED - all players can connect. Set setr ngcore_whitelist_enabled "true" to enable.', 'warn');
    }
  }

  /**
   * Load whitelist from database into memory
   */
  async loadWhitelist() {
    try {
      const whitelist = await this.db.query('SELECT identifier FROM whitelist WHERE active = 1');

      this.whitelistedPlayers.clear();

      for (const entry of whitelist) {
        this.whitelistedPlayers.add(entry.identifier);
      }

      this.log(`Loaded ${whitelist.length} whitelisted players from database`, 'debug');
    } catch (error) {
      this.log(`Failed to load whitelist: ${error.message}`, 'error');
    }
  }

  /**
   * Check if player is whitelisted (called before player joins)
   */
  async checkWhitelist(source, deferrals) {
    if (!this.enabled) {
      return; // Whitelist disabled
    }

    const identifiers = this.getPlayerIdentifiers(source);

    // Check if any identifier is whitelisted
    for (const [type, value] of Object.entries(identifiers)) {
      const identifier = `${type}:${value}`;

      if (this.isWhitelisted(identifier)) {
        this.log(`Player ${identifiers.license} whitelisted (${type})`, 'debug');
        return; // Allow join
      }
    }

    // Not whitelisted - deny join
    this.log(`Player ${identifiers.license} denied (not whitelisted)`, 'warn', {
      identifiers
    });

    deferrals.done(`You are not whitelisted on this server.\n\nYour identifiers:\n${
      Object.entries(identifiers).map(([k,v]) => `${k}: ${v}`).join('\n')
    }\n\nContact server administrators to request whitelist.`);
  }

  /**
   * Check if identifier is whitelisted (in-memory lookup)
   */
  isWhitelisted(identifier) {
    return this.whitelistedPlayers.has(identifier);
  }

  /**
   * Add player to whitelist
   */
  async add(identifier, addedBy = 'system', reason = null) {
    try {
      // Insert into database
      await this.db.execute(
        'INSERT INTO whitelist (identifier, added_by, reason, added_at) VALUES (?, ?, ?, NOW())',
        [identifier, addedBy, reason]
      );

      // Add to memory cache
      this.whitelistedPlayers.add(identifier);

      this.log(`Added ${identifier} to whitelist`, 'info', { addedBy, reason });

      return { success: true };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, reason: 'already_whitelisted' };
      }

      this.log(`Failed to add ${identifier} to whitelist: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Remove player from whitelist
   */
  async remove(identifier, removedBy = 'system', reason = null) {
    try {
      // Mark as inactive in database (soft delete)
      const result = await this.db.execute(
        'UPDATE whitelist SET active = 0, removed_by = ?, removed_at = NOW(), removal_reason = ? WHERE identifier = ?',
        [removedBy, reason, identifier]
      );

      if (result.affectedRows === 0) {
        return { success: false, reason: 'not_found' };
      }

      // Remove from memory cache
      this.whitelistedPlayers.delete(identifier);

      this.log(`Removed ${identifier} from whitelist`, 'info', { removedBy, reason });

      return { success: true };
    } catch (error) {
      this.log(`Failed to remove ${identifier} from whitelist: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Check if player is whitelisted by any identifier
   */
  async checkPlayer(source) {
    const identifiers = this.getPlayerIdentifiers(source);

    for (const [type, value] of Object.entries(identifiers)) {
      const identifier = `${type}:${value}`;
      if (this.isWhitelisted(identifier)) {
        return { whitelisted: true, identifier, type };
      }
    }

    return { whitelisted: false };
  }

  /**
   * Get all whitelisted players
   */
  async getAll() {
    try {
      return await this.db.query(
        'SELECT identifier, added_by, added_at, reason FROM whitelist WHERE active = 1 ORDER BY added_at DESC'
      );
    } catch (error) {
      this.log(`Failed to get whitelist: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Enable whitelist
   */
  enable() {
    this.enabled = true;
    this.log('Whitelist enabled', 'info');
  }

  /**
   * Disable whitelist
   */
  disable() {
    this.enabled = false;
    this.log('Whitelist disabled', 'warn');
  }

  /**
   * Check if whitelist is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Reload whitelist from database
   */
  async reload() {
    await this.loadWhitelist();
    this.log('Whitelist reloaded', 'info');
  }

  /**
   * Get player identifiers
   */
  getPlayerIdentifiers(source) {
    const identifiers = {};
    const numIdentifiers = GetNumPlayerIdentifiers(source);

    for (let i = 0; i < numIdentifiers; i++) {
      const identifier = GetPlayerIdentifier(source, i);
      const [type, value] = identifier.split(':');
      identifiers[type] = value;
    }

    return identifiers;
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.utils.Log(`[Whitelist] ${message}`, level);
    }
  }
}

module.exports = Whitelist;
