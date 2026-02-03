/**
 * NextGen Framework - Hardcap Module (Server)
 * Enforces player limit to prevent server overload
 */

class HardcapModule {
  constructor(framework) {
    this.framework = framework;
    this.playerCount = 0;
    this.activePlayers = new Map();

    // Get max clients from convar
    this.maxClients = GetConvarInt('sv_maxclients', 32);

    this.framework.log.info(`[Hardcap] Module initialized - Max players: ${this.maxClients}`);
  }

  /**
   * Initialize the module
   */
  init() {
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Handle player connecting
    this.framework.fivem.on('playerConnecting', (name, setKickReason, deferrals) => {

      // Check if server is at or over the limit
      if (this.playerCount >= this.maxClients) {
        this.framework.log.info(`[Hardcap] Server full (${this.playerCount}/${this.maxClients}) - Player ${name} will be queued`);

        // Get queue module and add player to queue
        const queueModule = this.framework.getModule('queue');
        if (queueModule) {
          // Queue module will handle the player
          // Don't cancel the event, let queue module take over
          return;
        } else {
          // No queue module available, reject connection
          this.framework.log.warn(`[Hardcap] No queue module - Denied connection from ${name}`);
          setKickReason(`This server is full (${this.maxClients}/${this.maxClients} players online). No queue available.`);
          CancelEvent();
          return;
        }
      }

      this.framework.log.info(`[Hardcap] Player connecting: ${name} (${this.playerCount + 1}/${this.maxClients})`);
    });

    // Handle player activation (when fully loaded)
    this.framework.fivem.onNet('hardcap:playerActivated', () => {
      const src = source;

      if (!this.activePlayers.has(src)) {
        this.playerCount++;
        this.activePlayers.set(src, true);
        this.framework.log.info(`[Hardcap] Player activated - Total: ${this.playerCount}/${this.maxClients}`);
      }
    });

    // Handle player disconnect
    this.framework.fivem.on('playerDropped', (reason) => {
      const src = source;
      if (this.activePlayers.has(src)) {
        this.playerCount--;
        this.activePlayers.delete(src);
        this.framework.log.info(`[Hardcap] Player dropped - Total: ${this.playerCount}/${this.maxClients}`);
      }
    });
  }

  /**
   * Get current player count
   */
  getPlayerCount() {
    return this.playerCount;
  }

  /**
   * Get max players
   */
  getMaxPlayers() {
    return this.maxClients;
  }

  /**
   * Check if server is full
   */
  isFull() {
    return this.playerCount >= this.maxClients;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.activePlayers.clear();
    this.playerCount = 0;
  }
}

module.exports = HardcapModule;

// Self-register
global.Framework.register('hardcap', new HardcapModule(global.Framework), 10);
