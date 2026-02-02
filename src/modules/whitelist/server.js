/**
 * NextGen Framework - Whitelist Module
 * Server whitelist management with database storage
 */

class Whitelist {
  constructor(framework) {
    this.framework = framework;
    this.db = null;

    // In-memory cache for fast lookups
    this.whitelistedPlayers = new Set();

    // Check convar for whitelist enable/disable (default: false for development)
    this.enabled = GetConvar('ngcore_whitelist_enabled', 'false') === 'true';
  }

  /**
   * Initialize whitelist module
   */
  async init() {
    this.db = this.framework.getModule('database');

    // Load whitelist from database
    await this.loadWhitelist();

    // Register player connecting hook
    this.framework.events.on(
      this.framework.constants.Hooks.BEFORE_PLAYER_JOIN,
      this.checkWhitelist.bind(this)
    );

    const count = this.whitelistedPlayers.size;
    const status = this.enabled ? 'ENABLED' : 'DISABLED';
    this.framework.log.info(`Whitelist module initialized - ${status} (${count} whitelisted players)`);

    if (!this.enabled) {
      this.framework.log.warn('Whitelist is DISABLED - all players can connect. Set setr ngcore_whitelist_enabled "true" to enable.');
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

      this.framework.log.debug(`Loaded ${whitelist.length} whitelisted players from database`);
    } catch (error) {
      this.framework.log.error(`Failed to load whitelist: ${error.message}`);
    }
  }

  /**
   * Check if player is whitelisted (called before player joins)
   * @param {Object} data - { source, deferrals }
   */
  async checkWhitelist(data) {
    const { source, deferrals } = data;
    if (!this.enabled) {
      return data; // Whitelist disabled - pass through
    }

    const identifiers = this.getPlayerIdentifiers(source);

    // Check if any identifier is whitelisted
    for (const [type, value] of Object.entries(identifiers)) {
      const identifier = `${type}:${value}`;

      if (this.isWhitelisted(identifier)) {
        this.framework.log.debug(`Player ${identifiers.license} whitelisted (${type})`);
        return; // Allow join
      }
    }

    // Not whitelisted - deny join
    this.framework.log.warn(`Player ${identifiers.license} denied (not whitelisted)`);

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

      this.framework.log.info(`Added ${identifier} to whitelist`);

      return { success: true };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, reason: 'already_whitelisted' };
      }

      this.framework.log.error(`Failed to add ${identifier} to whitelist: ${error.message}`);
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

      this.framework.log.info(`Removed ${identifier} from whitelist`);

      return { success: true };
    } catch (error) {
      this.framework.log.error(`Failed to remove ${identifier} from whitelist: ${error.message}`);
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
      this.framework.log.error(`Failed to get whitelist: ${error.message}`);
      return [];
    }
  }

  /**
   * Enable whitelist
   */
  enable() {
    this.enabled = true;
    this.framework.log.info('Whitelist enabled');
  }

  /**
   * Disable whitelist
   */
  disable() {
    this.enabled = false;
    this.framework.log.warn('Whitelist disabled');
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
    this.framework.log.info('Whitelist reloaded');
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
   * Cleanup
   */
  destroy() {
    this.whitelistedPlayers.clear();
  }
}

module.exports = Whitelist;

// Self-register
global.Framework.register('whitelist', new Whitelist(global.Framework), 8);
