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
    this.clientReadyResolvers = new Map();

    // Handle player drops
    this.framework.onNative('playerDropped', (source, reason) => {
      this.handlePlayerDropped(source, reason);
    });

    // Handle client ready signals
    onNet('ng_core:client-ready', () => {
      const clientSource = source;

      // Get player identifiers to match against waiting resolvers
      const player = this.framework.getModule('player-manager')?.get(clientSource);
      const license = player?.identifiers?.license;

      console.log(`[NextGen] [Connection] Received client-ready signal from ${clientSource} (${license})`);

      // Find resolver by license
      if (license) {
        const resolver = this.clientReadyResolvers.get(license);
        if (resolver) {
          resolver(true);
        } else {
          console.log(`[NextGen] [Connection] No resolver found for license ${license}`);
        }
      } else {
        console.log(`[NextGen] [Connection] Could not get license for source ${clientSource}`);
      }
    });

    this.log('Connection Manager initialized', 'info');
  }

  /**
   * Update loading screen progress for a player
   */
  updateLoadingProgress(source, progress, stage, message) {
    try {
      emitNet('ng:loading:updateProgress', source, progress, stage, message);
    } catch (error) {
      // Silently fail if player disconnected
    }
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

      // Update loading screen (FiveM loading is 0-20%, framework stages are 20-100%)
      this.updateLoadingProgress(source, 20, 'loading', 'Loading player data...');

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

      // All pre-connection stages passed - allow client to connect
      // Post-connection stages will happen in continueConnectionProcess()
      deferrals.done();

      // Start post-connection stages asynchronously (after playerJoining)
      setImmediate(async () => {
        await this.continueConnectionProcess(source, identifiers, loadingResult.data);
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
   * Continue connection process after player has joined
   * Handles post-connection stages: WAITING_CLIENT, CHECKING, READY, SPAWNED
   */
  async continueConnectionProcess(oldSource, identifiers, playerData) {
    try {
      // Get the startedAt timestamp from oldSource before it's deleted
      const oldStageInfo = this.playerStages.get(oldSource);
      const startedAt = oldStageInfo?.startedAt || Date.now();

      // Wait for player to be created in player-manager (playerJoining event creates it)
      const playerManager = this.framework.getModule('player-manager');
      let player = null;
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max

      while (!player && attempts < maxAttempts) {
        player = playerManager?.getByLicense(identifiers.license);
        if (!player) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
      }

      if (!player) {
        console.log(`[NextGen] [Connection] Could not find player with license ${identifiers.license} after ${attempts * 100}ms`);
        return false;
      }

      const source = player.source;
      console.log(`[NextGen] [Connection] Continuing connection process for ${source} (was ${oldSource}, found after ${attempts * 100}ms)...`);

      // Transfer startedAt to new source
      this.setPlayerStage(source, this.framework.constants.PlayerStage.CONNECTING, { startedAt });

      // Update loading screen - waiting for client (20-50%)
      this.updateLoadingProgress(source, 50, 'waiting_client', 'Initializing client...');

      // Wait for client to signal it's ready (appearance applied)
      const clientReadyResult = await this.waitForClientReady(source, identifiers);

      if (!clientReadyResult.success) {
        console.log(`[NextGen] [Connection] Client ${source} failed to become ready: ${clientReadyResult.reason}`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        DropPlayer(source, clientReadyResult.reason || 'Client initialization failed');
        return false;
      }

      // Update loading screen - checking permissions (50-70%)
      this.updateLoadingProgress(source, 70, 'checking', 'Checking permissions...');

      // Execute PLAYER_CHECK_PERMISSIONS hook
      const permissionResult = await this.executeStage(
        source,
        this.framework.constants.PlayerStage.CHECKING,
        this.framework.constants.Hooks.PLAYER_CHECK_PERMISSIONS,
        { source, identifiers, playerData }
      );

      if (!permissionResult.success) {
        console.log(`[NextGen] [Connection] Permission check failed for ${source}`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        DropPlayer(source, permissionResult.reason || 'Permission check failed');
        return false;
      }

      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${source} disconnected during permission check`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      // Update loading screen - preparing spawn (70-90%)
      this.updateLoadingProgress(source, 90, 'ready', 'Preparing spawn...');

      // Execute PLAYER_READY_TO_SPAWN hook
      const readyResult = await this.executeStage(
        source,
        this.framework.constants.PlayerStage.READY,
        this.framework.constants.Hooks.PLAYER_READY_TO_SPAWN,
        { source, identifiers, playerData }
      );

      if (!readyResult.success) {
        console.log(`[NextGen] [Connection] Spawn preparation failed for ${source}`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        DropPlayer(source, readyResult.reason || 'Failed to prepare spawn');
        return false;
      }

      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${source} disconnected before spawn`);
        this.playerStages.delete(source);
        this.playerData.delete(source);
        return false;
      }

      // Mark as spawned
      this.setPlayerStage(source, this.framework.constants.PlayerStage.SPAWNED);
      this.updateLoadingProgress(source, 100, 'spawned', 'Welcome!');

      const stageInfo = this.playerStages.get(source);
      const totalTime = Date.now() - stageInfo.startedAt;
      console.log(`[NextGen] [Connection] Player ${identifiers.license} completed all stages in ${totalTime}ms`);

      // Execute PLAYER_SPAWNED hook
      await this.framework.runHook(
        this.framework.constants.Hooks.PLAYER_SPAWNED,
        { source, identifiers, playerData: this.playerData.get(source) }
      );

      return true;
    } catch (error) {
      console.log(`[NextGen] [Connection] Post-connection process failed for ${source}: ${error.message}`);
      this.playerStages.delete(source);
      this.playerData.delete(source);
      DropPlayer(source, `Connection failed: ${error.message}`);
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
   * Wait for client to signal it's ready (framework initialized + appearance applied)
   */
  async waitForClientReady(playerSource, identifiers) {
    return new Promise((resolve) => {
      // Set waiting stage
      this.setPlayerStage(playerSource, this.framework.constants.PlayerStage.WAITING_CLIENT);
      const license = identifiers.license;
      console.log(`[NextGen] [Connection] Waiting for client ${playerSource} (${license}) to become ready...`);

      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log(`[NextGen] [Connection] Client ${playerSource} (${license}) ready timeout`);
          this.clientReadyResolvers.delete(license);
          resolve({
            success: false,
            reason: 'Client initialization timeout'
          });
        }
      }, 30000); // 30 second timeout

      // Store the resolve function using LICENSE as key (source changes from 65536 to 1)
      if (!this.clientReadyResolvers) {
        this.clientReadyResolvers = new Map();
      }
      this.clientReadyResolvers.set(license, (success) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.clientReadyResolvers.delete(license);
          console.log(`[NextGen] [Connection] Client ${license} ready signal accepted`);
          resolve({ success });
        }
      });
    });
  }

  /**
   * Set player stage
   */
  setPlayerStage(source, stage, data = {}) {
    const existing = this.playerStages.get(source) || {};
    const playerName = this.getPlayerName(source);

    this.playerStages.set(source, {
      ...existing,
      ...data,
      stage,
      updatedAt: Date.now()
    });

    // Log state changes with player name
    console.log(`[NextGen] [Connection] Player ${playerName} (${source}) -> Stage: ${stage}`);
  }

  /**
   * Get player name safely
   */
  getPlayerName(source) {
    try {
      return GetPlayerName(source) || `Unknown (${source})`;
    } catch (e) {
      return `Unknown (${source})`;
    }
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
