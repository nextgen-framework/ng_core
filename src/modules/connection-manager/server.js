/**
 * NextGen Framework - Connection Manager Module
 * Manages player connection stages and lifecycle
 */

class ConnectionManager {
  constructor(framework) {
    this.framework = framework;
    this.logger = null;

    // Track player connection stages by LICENSE (not source which changes)
    this.playerStages = new Map(); // license -> { source, stage, ...stage data }
    this.playerData = new Map();   // license -> player data cache
    this.stuckClientMonitorInterval = null; // Store interval for cleanup

    // Cache for early client-ready signals (before waitForClientReady sets up resolver)
    this.earlyReadySignals = new Set();
  }

  /**
   * Initialize connection manager
   */
  async init() {
    this.logger = this.framework.getModule('logger');
    this.clientReadyResolvers = new Map();

    // Handle player drops
    this.framework.fivem.on('playerDropped', (reason) => {
      const src = source;
      this.handlePlayerDropped(src, reason);
    });

    // Handle client ready signals
    this.framework.fivem.onNet('ng_core:client-ready', () => {
      const clientSource = source;

      // Get player identifiers to match against waiting resolvers
      const player = this.framework.getModule('player-manager')?.get(clientSource);
      const license = player?.identifiers?.license;

      console.log(`[NextGen] [Connection] Received client-ready signal from ${clientSource} (${license})`);

      if (!license) {
        console.log(`[NextGen] [Connection] Could not get license for source ${clientSource}`);
        return;
      }

      // Verify player is in WAITING_CLIENT stage (prevent out-of-order or spoofed signals)
      const currentStage = this.getPlayerStageByLicense(license);
      if (currentStage !== this.framework.constants.PlayerStage.WAITING_CLIENT) {
        console.log(`[NextGen] [Connection] Ignoring client-ready from ${license} - wrong stage: ${currentStage}`);
        return;
      }

      // Find resolver by license
      const resolver = this.clientReadyResolvers.get(license);
      if (resolver) {
        resolver(true);
      } else {
        // Resolver not set up yet - cache the signal for waitForClientReady
        this.earlyReadySignals.add(license);
        console.log(`[NextGen] [Connection] Cached early client-ready signal for ${license}`);
      }
    });

    // Start stuck client detection monitor
    this.startStuckClientMonitor();

    this.log('Connection Manager initialized', 'info');
  }

  /**
   * Start intelligent stuck client monitor
   * Monitors connection progress and forces disconnect if clients are stuck
   */
  startStuckClientMonitor() {
    // Stage timeout limits (in milliseconds)
    const STAGE_TIMEOUTS = {
      [this.framework.constants.PlayerStage.CONNECTING]: 45000,    // 45 seconds
      [this.framework.constants.PlayerStage.LOADING]: 45000,       // 45 seconds
      [this.framework.constants.PlayerStage.WAITING_CLIENT]: 35000, // 35 seconds
      [this.framework.constants.PlayerStage.CHECKING]: 30000,      // 30 seconds
      [this.framework.constants.PlayerStage.READY]: 30000,         // 30 seconds
      [this.framework.constants.PlayerStage.SPAWNED]: Infinity     // Final stage, no timeout
    };

    // Monitor every 10 seconds
    this.stuckClientMonitorInterval = setInterval(() => {
      const now = Date.now();

      for (const [license, stageInfo] of this.playerStages.entries()) {
        const stage = stageInfo.stage;
        const stageStartTime = stageInfo.updatedAt || stageInfo.startedAt;
        const timeInStage = now - stageStartTime;
        const timeout = STAGE_TIMEOUTS[stage] || 60000; // Default 60s

        // Skip if stage has no timeout (SPAWNED)
        if (timeout === Infinity) continue;

        // Check if stuck in this stage for too long
        if (timeInStage > timeout) {
          const currentSource = this.getCurrentSource(license);
          const playerName = stageInfo.playerName || 'Unknown';

          console.log(`[NextGen] [Connection] STUCK CLIENT DETECTED: ${playerName} (${license}) stuck in stage '${stage}' for ${Math.round(timeInStage / 1000)}s`);

          // Force disconnect
          if (currentSource && this.isPlayerConnected(currentSource)) {
            console.log(`[NextGen] [Connection] Force disconnecting stuck client ${license} (source ${currentSource})`);
            DropPlayer(currentSource, 'Connection timeout - stuck in loading process');
          }

          // Cleanup
          this.cleanupPlayer(license);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Get current source for a license
   */
  getCurrentSource(license) {
    const playerManager = this.framework.getModule('player-manager');
    const player = playerManager?.getByLicense(license);
    return player?.source || null;
  }

  /**
   * Update stage progress for a player
   */
  updateStageProgress(source, progress, stage, message) {
    try {
      this.framework.fivem.emitNet('ng:loading:updateStageProgress', source, progress, stage, message);
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
   * NOW USES LICENSE AS PRIMARY IDENTIFIER
   */
  async startConnectionProcess(source, deferrals, identifiers) {
    try {
      const license = identifiers.license;
      const playerName = this.getPlayerName(source);

      // Set initial stage using license
      this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.CONNECTING, {
        source,
        identifiers,
        deferrals,
        playerName,
        startedAt: Date.now()
      });

      // Update loading screen (FiveM loading is 0-20%, framework stages are 20-100%)
      this.updateStageProgress(source, 20, 'loading', 'Loading player data...');

      // Check if player still connected
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${license} disconnected before loading stage`);
        this.cleanupPlayer(license);
        return false;
      }

      deferrals.update('Loading player data...');

      // Execute PLAYER_LOADING hook
      this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.LOADING);
      const loadingResult = await this.framework.events.pipe(
        this.framework.constants.Hooks.PLAYER_LOADING,
        { source, identifiers }
      );

      // Check for hook rejection
      if (loadingResult === false || (loadingResult && loadingResult.success === false)) {
        const reason = loadingResult?.reason || loadingResult?.error || 'Failed to load player data';
        deferrals.done(reason);
        this.cleanupPlayer(license);
        return false;
      }

      // Check if player still connected after loading
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${license} disconnected during loading stage`);
        this.cleanupPlayer(license);
        return false;
      }

      // Store any data returned by loading hooks
      if (loadingResult && typeof loadingResult === 'object') {
        this.playerData.set(license, loadingResult);
      }

      // Check if player still connected before permissions
      if (!this.isPlayerConnected(source)) {
        console.log(`[NextGen] [Connection] Player ${license} disconnected before permission check`);
        this.cleanupPlayer(license);
        return false;
      }

      // All pre-connection stages passed - allow client to connect
      // Post-connection stages will happen in continueConnectionProcess()
      deferrals.done();

      // Start post-connection stages asynchronously (after playerJoining)
      setImmediate(async () => {
        await this.continueConnectionProcess(source, identifiers, this.playerData.get(license));
      });

      return true;
    } catch (error) {
      const license = identifiers?.license;
      this.log(`Connection process failed for ${license || source}: ${error.message}`, 'error');
      deferrals.done(`Connection failed: ${error.message}`);
      if (license) {
        this.cleanupPlayer(license);
      }
      return false;
    }
  }

  /**
   * Continue connection process after player has joined
   * Handles post-connection stages: WAITING_CLIENT, CHECKING, READY, SPAWNED
   * NOW USES LICENSE AS PRIMARY IDENTIFIER
   */
  async continueConnectionProcess(oldSource, identifiers, playerData) {
    try {
      const license = identifiers.license;

      // Get the startedAt timestamp from existing stage info
      const oldStageInfo = this.playerStages.get(license);
      const startedAt = oldStageInfo?.startedAt || Date.now();
      const playerName = oldStageInfo?.playerName || 'Unknown';

      // Wait for player to be created in player-manager (playerJoining event creates it)
      const playerManager = this.framework.getModule('player-manager');
      let player = null;
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max

      while (!player && attempts < maxAttempts) {
        player = playerManager?.getByLicense(license);
        if (!player) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
      }

      if (!player) {
        console.log(`[NextGen] [Connection] Could not find player with license ${license} after ${attempts * 100}ms`);
        return false;
      }

      let currentSource = player.source;

      // Get player name from player object or source
      const actualPlayerName = player.getName ? player.getName() : this.getPlayerName(currentSource);
      console.log(`[NextGen] [Connection] Continuing connection process for ${license} (${actualPlayerName}, source ${currentSource}, was ${oldSource}, found after ${attempts * 100}ms)...`);

      // Set stage using license with actual player name
      this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.CONNECTING, { startedAt, playerName: actualPlayerName });

      // Update loading screen - waiting for client (20-50%)
      currentSource = this.getCurrentSource(license) || currentSource;
      this.updateStageProgress(currentSource, 50, 'waiting_client', 'Initializing client...');

      // Wait for client to signal it's ready (appearance applied)
      const clientReadyResult = await this.waitForClientReady(currentSource, identifiers);

      if (!clientReadyResult.success) {
        currentSource = this.getCurrentSource(license) || currentSource;
        console.log(`[NextGen] [Connection] Client ${license} failed to become ready: ${clientReadyResult.reason}`);
        this.cleanupPlayer(license);
        if (currentSource && this.isPlayerConnected(currentSource)) {
          DropPlayer(currentSource, clientReadyResult.reason || 'Client initialization failed');
        }
        return false;
      }

      // Update current source after client ready (may have changed)
      currentSource = this.getCurrentSource(license) || currentSource;
      console.log(`[NextGen] [Connection] Client ready for ${license} (source ${currentSource})`);

      // Update loading screen - checking permissions (50-70%)
      this.updateStageProgress(currentSource, 70, 'checking', 'Checking permissions...');

      // Execute PLAYER_CHECK_PERMISSIONS hook
      this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.CHECKING);
      const permissionResult = await this.framework.events.pipe(
        this.framework.constants.Hooks.PLAYER_CHECK_PERMISSIONS,
        { source: currentSource, identifiers, playerData }
      );

      // Check for hook rejection
      if (permissionResult === false || (permissionResult && permissionResult.success === false)) {
        currentSource = this.getCurrentSource(license) || currentSource;
        const reason = permissionResult?.reason || permissionResult?.error || 'Permission check failed';
        console.log(`[NextGen] [Connection] Permission check failed for ${license}: ${reason}`);
        this.cleanupPlayer(license);
        if (currentSource && this.isPlayerConnected(currentSource)) {
          DropPlayer(currentSource, reason);
        }
        return false;
      }

      // Update current source and check connection
      currentSource = this.getCurrentSource(license);
      if (!currentSource || !this.isPlayerConnected(currentSource)) {
        console.log(`[NextGen] [Connection] Player ${license} disconnected during permission check`);
        this.cleanupPlayer(license);
        return false;
      }

      // Update loading screen - preparing spawn (70-90%)
      this.updateStageProgress(currentSource, 90, 'ready', 'Preparing spawn...');

      // Execute PLAYER_READY_TO_SPAWN hook
      this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.READY);
      const readyResult = await this.framework.events.pipe(
        this.framework.constants.Hooks.PLAYER_READY_TO_SPAWN,
        { source: currentSource, identifiers, playerData }
      );

      // Check for hook rejection
      if (readyResult === false || (readyResult && readyResult.success === false)) {
        currentSource = this.getCurrentSource(license) || currentSource;
        const reason = readyResult?.reason || readyResult?.error || 'Spawn preparation failed';
        console.log(`[NextGen] [Connection] Spawn preparation failed for ${license}: ${reason}`);
        this.cleanupPlayer(license);
        if (currentSource && this.isPlayerConnected(currentSource)) {
          DropPlayer(currentSource, reason);
        }
        return false;
      }

      // Update current source and check connection
      currentSource = this.getCurrentSource(license);
      if (!currentSource || !this.isPlayerConnected(currentSource)) {
        console.log(`[NextGen] [Connection] Player ${license} disconnected before spawn`);
        this.cleanupPlayer(license);
        return false;
      }

      // Mark as spawned
      this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.SPAWNED);
      this.updateStageProgress(currentSource, 100, 'spawned', 'Welcome!');

      const stageInfo = this.playerStages.get(license);
      const totalTime = Date.now() - stageInfo.startedAt;
      console.log(`[NextGen] [Connection] Player ${license} completed all stages in ${totalTime}ms`);

      // Trigger spawn on client (ng_freemode will handle the actual spawn)
      this.framework.fivem.emitNet('ng_core:readyToSpawn', currentSource);

      // Execute PLAYER_SPAWNED hook
      await this.framework.events.pipe(
        this.framework.constants.Hooks.PLAYER_SPAWNED,
        { source: currentSource, identifiers, playerData: this.playerData.get(license) }
      );

      return true;
    } catch (error) {
      console.log(`[NextGen] [Connection] Post-connection process failed for ${license}: ${error.message}`);
      this.cleanupPlayer(license);
      const currentSource = this.getCurrentSource(license);
      if (currentSource && this.isPlayerConnected(currentSource)) {
        DropPlayer(currentSource, `Connection failed: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Wait for client to signal it's ready (framework initialized + appearance applied)
   */
  async waitForClientReady(playerSource, identifiers) {
    return new Promise((resolve) => {
      const license = identifiers.license;

      // Set waiting stage using license-based method
      this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.WAITING_CLIENT);
      console.log(`[NextGen] [Connection] Waiting for client ${playerSource} (${license}) to become ready...`);

      // Check if client-ready signal arrived early (before resolver was set up)
      if (this.earlyReadySignals.has(license)) {
        this.earlyReadySignals.delete(license);
        console.log(`[NextGen] [Connection] Client ${license} had early ready signal - resolving immediately`);
        resolve({ success: true });
        return;
      }

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
   * Set player stage (by license)
   */
  setPlayerStageByLicense(license, stage, data = {}) {
    const existing = this.playerStages.get(license) || {};
    const currentSource = this.getCurrentSource(license);
    const playerName = data.playerName || existing.playerName || this.getPlayerName(currentSource);

    this.playerStages.set(license, {
      ...existing,
      ...data,
      source: currentSource,
      playerName,
      stage,
      updatedAt: Date.now()
    });

    // Log state changes with player name
    console.log(`[NextGen] [Connection] Player ${playerName} (${license}) -> Stage: ${stage}`);
  }

  /**
   * Set player stage (legacy - redirects to license-based method)
   */
  setPlayerStage(source, stage, data = {}) {
    // Get license from player-manager
    const playerManager = this.framework.getModule('player-manager');
    const player = playerManager?.get(source);
    const license = player?.identifiers?.license || data.license;

    if (license) {
      this.setPlayerStageByLicense(license, stage, { ...data, source });
    } else {
      console.log(`[NextGen] [Connection] Warning: Could not get license for source ${source}`);
    }
  }

  /**
   * Get player name safely
   */
  getPlayerName(source) {
    if (!source) return 'Unknown';
    try {
      return GetPlayerName(source) || 'Unknown';
    } catch (e) {
      return 'Unknown';
    }
  }

  /**
   * Get player stage (by license)
   */
  getPlayerStageByLicense(license) {
    const stageInfo = this.playerStages.get(license);
    return stageInfo ? stageInfo.stage : null;
  }

  /**
   * Get player stage (legacy)
   */
  getPlayerStage(source) {
    const playerManager = this.framework.getModule('player-manager');
    const player = playerManager?.get(source);
    const license = player?.identifiers?.license;

    if (license) {
      return this.getPlayerStageByLicense(license);
    }
    return null;
  }

  /**
   * Get player data (by license)
   */
  getPlayerDataByLicense(license) {
    return this.playerData.get(license);
  }

  /**
   * Get player data (legacy - by source)
   */
  getPlayerData(source) {
    const playerManager = this.framework.getModule('player-manager');
    const player = playerManager?.get(source);
    const license = player?.identifiers?.license;

    if (license) {
      return this.getPlayerDataByLicense(license);
    }
    return null;
  }

  /**
   * Handle player dropped
   */
  handlePlayerDropped(source, reason) {
    const playerManager = this.framework.getModule('player-manager');
    const player = playerManager?.get(source);
    const license = player?.identifiers?.license;

    if (license) {
      const stage = this.getPlayerStageByLicense(license);
      if (stage) {
        this.log(`Player ${license} (source ${source}) dropped during stage: ${stage} (${reason})`, 'info');
        this.setPlayerStageByLicense(license, this.framework.constants.PlayerStage.DISCONNECTED);
      }

      // Clean up after a delay (in case resources need the data)
      setTimeout(() => {
        this.cleanupPlayer(license);
      }, 5000);
    }
  }

  /**
   * Clean up all tracking data for a player (centralized)
   * @param {string} license - Player license identifier
   */
  cleanupPlayer(license) {
    this.playerStages.delete(license);
    this.playerData.delete(license);
    this.clientReadyResolvers.delete(license);
    this.earlyReadySignals.delete(license);
  }

  /**
   * Check if player is ready (by license)
   */
  isPlayerReadyByLicense(license) {
    const stage = this.getPlayerStageByLicense(license);
    return stage === this.framework.constants.PlayerStage.SPAWNED;
  }

  /**
   * Check if player is ready (legacy)
   */
  isPlayerReady(source) {
    const playerManager = this.framework.getModule('player-manager');
    const player = playerManager?.get(source);
    const license = player?.identifiers?.license;

    if (license) {
      return this.isPlayerReadyByLicense(license);
    }
    return false;
  }

  /**
   * Get connection info
   */
  getConnectionInfo() {
    const stages = {};
    for (const [license, info] of this.playerStages.entries()) {
      stages[license] = {
        stage: info.stage,
        source: info.source,
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
      this.framework.log[level](`[ConnectionManager] ${message}`);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    // Clear monitor interval
    if (this.stuckClientMonitorInterval) {
      clearInterval(this.stuckClientMonitorInterval);
      this.stuckClientMonitorInterval = null;
    }

    this.playerStages.clear();
    this.playerData.clear();
    this.clientReadyResolvers.clear();
    this.earlyReadySignals.clear();
    this.log('Connection Manager destroyed', 'info');
  }
}

module.exports = ConnectionManager;

// Self-register
global.Framework.register('connection-manager', new ConnectionManager(global.Framework), 8);
