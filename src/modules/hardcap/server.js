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

    console.log(`[NextGen] [Hardcap] Module initialized - Max players: ${this.maxClients}`);
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
    on('playerConnecting', (name, setKickReason, deferrals) => {

      // Check if server is at or over the limit
      if (this.playerCount >= this.maxClients) {
        console.log(`[NextGen] [Hardcap] Server full (${this.playerCount}/${this.maxClients}) - Player ${name} will be queued`);

        // Get queue module and add player to queue
        const queueModule = this.framework.getModule('queue');
        if (queueModule) {
          // Queue module will handle the player
          // Don't cancel the event, let queue module take over
          return;
        } else {
          // No queue module available, reject connection
          console.log(`[NextGen] [Hardcap] No queue module - Denied connection from ${name}`);
          setKickReason(`This server is full (${this.maxClients}/${this.maxClients} players online). No queue available.`);
          CancelEvent();
          return;
        }
      }

      console.log(`[NextGen] [Hardcap] Player connecting: ${name} (${this.playerCount + 1}/${this.maxClients})`);
    });

    // Handle player activation (when fully loaded)
    this.framework.onNet('hardcap:playerActivated', () => {

      if (!this.activePlayers.has(source)) {
        this.playerCount++;
        this.activePlayers.set(source, true);
        console.log(`[NextGen] [Hardcap] Player activated - Total: ${this.playerCount}/${this.maxClients}`);
      }
    });

    // Handle player disconnect
    on('playerDropped', (reason) => {
      const src = global.source;
      if (this.activePlayers.has(src)) {
        this.playerCount--;
        this.activePlayers.delete(src);
        console.log(`[NextGen] [Hardcap] Player dropped - Total: ${this.playerCount}/${this.maxClients}`);
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
}

module.exports = HardcapModule;

// Self-register
global.Framework.register('hardcap', new HardcapModule(global.Framework), 10);
