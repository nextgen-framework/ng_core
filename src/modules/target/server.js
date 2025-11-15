/**
 * NextGen Framework - Target Module (Server)
 * Server-side validation and logging for target interactions
 *
 * This module is optional but provides:
 * - Validation of client interactions
 * - Logging of target interactions
 * - Server-side option registration
 * - Anti-cheat integration
 */

class TargetManager {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;

    // Server-registered options (for validation)
    this.serverOptions = new Map(); // optionId => { type, validator }

    // Interaction logging
    this.config = {
      logInteractions: true,
      validateInteractions: true
    };
  }

  async init() {
    this.logger = this.framework.getModule('logger');

    // Register RPC handlers
    this.registerRPC();

    this.log('Target manager (server) initialized', 'info');
  }

  registerRPC() {
    const rpc = this.framework.getModule('rpc');
    if (!rpc) return;

    // Validate interaction
    rpc.register('target:validateInteraction', async (source, data) => {
      return await this.validateInteraction(source, data);
    });

    // Log interaction
    rpc.register('target:logInteraction', async (source, data) => {
      this.logInteraction(source, data);
      return { success: true };
    });
  }

  /**
   * Register a server-side option for validation
   * @param {string} optionId - Unique option identifier
   * @param {Object} config - { type, validator, metadata }
   */
  registerOption(optionId, config) {
    this.serverOptions.set(optionId, {
      type: config.type || 'generic',
      validator: config.validator || null,
      metadata: config.metadata || {}
    });

    this.log(`Registered server option: ${optionId}`, 'debug');
  }

  /**
   * Validate an interaction from client
   * @param {number} source - Player source
   * @param {Object} data - { optionId, entity, zone, distance }
   */
  async validateInteraction(source, data) {
    if (!this.config.validateInteractions) {
      return { valid: true };
    }

    const { optionId, entity, zone, distance } = data;

    // Check if option is registered
    const option = this.serverOptions.get(optionId);
    if (!option) {
      // Not registered server-side, allow by default
      return { valid: true };
    }

    // Run custom validator if provided
    if (option.validator) {
      try {
        const result = await option.validator(source, data);
        if (!result) {
          this.log(`Interaction validation failed for ${source}: ${optionId}`, 'warn');
          return { valid: false, reason: 'Validation failed' };
        }
      } catch (error) {
        this.log(`Validator error for ${optionId}: ${error.message}`, 'error');
        return { valid: false, reason: 'Validator error' };
      }
    }

    // Basic checks
    if (entity) {
      // Verify entity exists
      if (!DoesEntityExist(entity)) {
        return { valid: false, reason: 'Entity does not exist' };
      }

      // Verify distance (anti-cheat)
      const playerPed = GetPlayerPed(source);
      const playerCoords = GetEntityCoords(playerPed);
      const entityCoords = GetEntityCoords(entity);
      const actualDistance = GetDistanceBetweenCoords(
        playerCoords[0], playerCoords[1], playerCoords[2],
        entityCoords[0], entityCoords[1], entityCoords[2],
        true
      );

      if (actualDistance > 5.0) { // Max reasonable distance
        this.log(`Distance check failed for ${source}: ${actualDistance}m`, 'warn');
        return { valid: false, reason: 'Too far from entity' };
      }
    }

    return { valid: true };
  }

  /**
   * Log an interaction
   */
  logInteraction(source, data) {
    if (!this.config.logInteractions) return;

    const { optionId, entity, zone, label } = data;

    this.log(
      `Player ${source} interacted: ${label || optionId} (entity: ${entity || 'none'}, zone: ${zone || 'none'})`,
      'debug'
    );

    // Could store in database for analytics
    // await this.db.execute('INSERT INTO interaction_logs ...', [...]);
  }

  /**
   * Get interaction statistics
   */
  async getInteractionStats() {
    // Could query database for analytics
    return {
      total: 0,
      byType: {}
    };
  }

  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, { module: 'target', ...metadata });
    } else {
      console.log(`[Target] ${message}`);
    }
  }

  async destroy() {
    this.serverOptions.clear();
  }
}

module.exports = TargetManager;
