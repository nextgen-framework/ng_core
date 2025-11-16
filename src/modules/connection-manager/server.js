/**
 * NextGen Framework - Connection Manager Module
 * Manages player connection stages and lifecycle
 */

class ConnectionManager {
  constructor(framework) {
    this.framework = framework;
    this.logger = null;

    // Track player connection stages
    this.playerStages = new Map(); // source -> stage info
    this.playerData = new Map();   // source -> player data cache
  }

  /**
   * Initialize connection manager
   */
  async init() {
    this.logger = this.framework.getModule('logger');

    // Handle player drops
    this.framework.onNative('playerDropped', (source, reason) => {
      this.handlePlayerDropped(source, reason);
    });

    this.log('Connection Manager initialized', 'info');
  }

  /**
   * Check if player is still connected
   */
  isPlayerConnected(source) {
    try {
      // Try to get player name - if player disconnected, this will fail
      const name = GetPlayerName(source);
      return name !== null && name !== undefined && name !== '';
    } catch (e) {
      return false;
    }
  }

  /**
   * Start player connection process
   * Called after queue allows connection
   */
  async startConnectionProcess(source, deferrals, identifiers) {
    try {
      // Set initial stage
      this.setPlayerStage(source, this.framework.constants.PlayerStage.CONNECTING, {
        identifiers,
        deferrals,
        startedAt: Date.now()
      });

      // Check if player still connected
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${source} disconnected before loading stage`);
        this.playerStages.delete(source);
        return false;
      }

      deferrals.update('Loading player data...');

      // Execute PLAYER_LOADING hook
      const loadingResult = await this.executeStage(
        source,
        this.framework.constants.PlayerStage.LOADING,
        this.framework.constants.Hooks.PLAYER_LOADING,
        { source, identifiers }
      );

      if (!loadingResult.success) {
        deferrals.done(loadingResult.reason || 'Failed to load player data');
        this.playerStages.delete(source);
        return false;
      }

      // Check if player still connected after loading
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${source} disconnected during loading stage`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      // Store any data returned by loading hooks
      if (loadingResult.data) {
        this.playerData.set(source, loadingResult.data);
      }

      // Check if player still connected before permissions
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${source} disconnected before permission check`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      deferrals.update('Checking permissions...');

      // Execute PLAYER_CHECK_PERMISSIONS hook
      const permissionResult = await this.executeStage(
        source,
        this.framework.constants.PlayerStage.CHECKING,
        this.framework.constants.Hooks.PLAYER_CHECK_PERMISSIONS,
        { source, identifiers, playerData: loadingResult.data }
      );

      if (!permissionResult.success) {
        deferrals.done(permissionResult.reason || 'Permission check failed');
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      // Check if player still connected after permissions
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${source} disconnected during permission check`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      deferrals.update('Preparing to spawn...');

      // Execute PLAYER_READY_TO_SPAWN hook
      const readyResult = await this.executeStage(
        source,
        this.framework.constants.PlayerStage.READY,
        this.framework.constants.Hooks.PLAYER_READY_TO_SPAWN,
        { source, identifiers, playerData: loadingResult.data }
      );

      if (!readyResult.success) {
        deferrals.done(readyResult.reason || 'Failed to prepare spawn');
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      // Final check before allowing spawn
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${source} disconnected before spawn`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      // All stages passed - allow connection
      deferrals.done();

      // Mark as spawned (will be confirmed by client)
      this.setPlayerStage(source, this.framework.constants.PlayerStage.SPAWNED);

      const totalTime = Date.now() - this.playerStages.get(source).startedAt;
      console.log(`[NextGen] [Connection] Player ${identifiers.license} completed all stages in ${totalTime}ms`);

      // Execute PLAYER_SPAWNED hook (after spawn)
      setImmediate(async () => {
        await this.framework.runHook(
          this.framework.constants.Hooks.PLAYER_SPAWNED,
          { source, identifiers, playerData: this.playerData.get(source) }
        );
      });

      return true;
    } catch (error) {
      this.log(`Connection process failed for source ${source}: ${error.message}`, 'error');
      deferrals.done(`Connection failed: ${error.message}`);
      this.playerStages.delete(source);
      this.playerData.delete(source);
      return false;
    }
  }

  /**
   * Execute a connection stage
   */
  async executeStage(source, stage, hookName, data) {
    try {
      this.setPlayerStage(source, stage, data);

      const hookResult = await this.framework.runHook(hookName, data);

      // Check if any hook rejected the connection
      if (hookResult === false) {
        return {
          success: false,
          reason: 'Stage rejected by hook'
        };
      }

      // If hook returned an object with success: false, reject
      if (hookResult && hookResult.success === false) {
        return {
          success: false,
          reason: hookResult.reason || hookResult.error || 'Stage failed'
        };
      }

      // Stage passed
      return {
        success: true,
        data: hookResult || {}
      };
    } catch (error) {
      this.log(`Stage ${stage} failed: ${error.message}`, 'error');
      return {
        success: false,
        reason: `Stage error: ${error.message}`
      };
    }
  }

  /**
   * Set player stage
   */
  setPlayerStage(source, stage, data = {}) {
    const existing = this.playerStages.get(source) || {};
    this.playerStages.set(source, {
      ...existing,
      ...data,
      stage,
      updatedAt: Date.now()
    });

    this.log(`Player ${source} -> ${stage}`, 'debug');
  }

  /**
   * Get player stage
   */
  getPlayerStage(source) {
    const stageInfo = this.playerStages.get(source);
    return stageInfo ? stageInfo.stage : null;
  }

  /**
   * Get player data
   */
  getPlayerData(source) {
    return this.playerData.get(source);
  }

  /**
   * Handle player dropped
   */
  handlePlayerDropped(source, reason) {
    const stage = this.getPlayerStage(source);

    if (stage) {
      this.log(`Player ${source} dropped during stage: ${stage} (${reason})`, 'info');
      this.setPlayerStage(source, this.framework.constants.PlayerStage.DISCONNECTED);
    }

    // Clean up after a delay (in case resources need the data)
    setTimeout(() => {
      this.playerStages.delete(source);
      this.playerData.delete(source);
    }, 5000);
  }

  /**
   * Check if player is ready
   */
  isPlayerReady(source) {
    const stage = this.getPlayerStage(source);
    return stage === this.framework.constants.PlayerStage.SPAWNED;
  }

  /**
   * Get connection info
   */
  getConnectionInfo() {
    const stages = {};
    for (const [source, info] of this.playerStages.entries()) {
      stages[source] = {
        stage: info.stage,
        duration: Date.now() - info.startedAt
      };
    }
    return {
      totalConnecting: this.playerStages.size,
      stages
    };
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.utils.Log(`[ConnectionManager] ${message}`, level);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.playerStages.clear();
    this.playerData.clear();
    this.log('Connection Manager destroyed', 'info');
  }
}

module.exports = ConnectionManager;
