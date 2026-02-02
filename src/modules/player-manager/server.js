/**
 * NextGen Framework - Player Manager Module
 * Generic player management system using State Bags
 */

class PlayerManager {
  constructor(framework) {
    this.framework = framework;
    this.players = new Map();
  }

  /**
   * Initialize the player manager module
   * Registers FiveM player events
   */
  async init() {
    this.registerEvents();
    this.framework.log.info('Player Manager module initialized');
  }

  /**
   * Register player events
   */
  registerEvents() {
    // Player connecting
    on('playerConnecting', async (name, setKickReason, deferrals) => {
      const playerSource = source;
      deferrals.defer();
      deferrals.update('Checking with framework...');

      try {
        // Run hooks - pass single object (pipe only accepts one data arg)
        await this.framework.events.pipe(this.framework.constants.Hooks.BEFORE_PLAYER_JOIN, { source: playerSource, deferrals });

        // Queue/connection-manager handles deferrals - don't call done() here
        // deferrals.done(); will be called by queue or connection-manager
      } catch (error) {
        this.framework.log.error(`Player connection error: ${error.message}`);
        deferrals.done(error.message);
      }
    });

    // Player joined
    on('playerJoining', async () => {
      // Capture source before async operations to avoid scope issues
      const playerSource = source;
      await this.create(playerSource);
      this.framework.eventBus.emit(this.framework.constants.Events.PLAYER_CONNECTED, playerSource);
      await this.framework.events.pipe(this.framework.constants.Hooks.AFTER_PLAYER_JOIN, playerSource);
    });

    // Player dropped
    on('playerDropped', async (reason) => {
      const playerSource = source;

      await this.framework.events.pipe(this.framework.constants.Hooks.BEFORE_PLAYER_LEAVE, { source: playerSource, reason });
      await this.remove(playerSource);
      this.framework.eventBus.emit(this.framework.constants.Events.PLAYER_DROPPED, playerSource, reason);
      await this.framework.events.pipe(this.framework.constants.Hooks.AFTER_PLAYER_LEAVE, { source: playerSource, reason });
    });
  }

  /**
   * Create a player instance
   * @param {number} source
   * @returns {Promise<*>}
   */
  async create(source) {
    if (this.players.has(source)) {
      this.framework.log.warn(`Player ${source} already exists in pool`);
      return this.players.get(source);
    }

    const player = new PlayerClass(source, this.framework);
    await player.init();

    this.players.set(source, player);
    this.framework.log.info(`Player ${source} added to pool`);

    return player;
  }

  /**
   * Remove a player from the pool
   * @param {number} source
   */
  async remove(source) {
    // Ignore invalid sources (can happen if player drops during connection)
    if (!source || source === null || source === undefined) {
      return;
    }

    const player = this.players.get(source);
    if (!player) {
      this.framework.log.warn(`Player ${source} not found in pool`);
      return;
    }

    // Call player cleanup
    await player.destroy();

    this.players.delete(source);
    this.framework.log.info(`Player ${source} removed from pool`);
  }

  /**
   * Get a player by source
   * @param {number} source
   * @returns {*}
   */
  get(source) {
    return this.players.get(source);
  }

  /**
   * Get a player by license identifier
   * @param {string} license
   * @returns {*}
   */
  getByLicense(license) {
    for (const player of this.players.values()) {
      if (player.identifiers && player.identifiers.license === license) {
        return player;
      }
    }
    return null;
  }

  /**
   * Get all players
   * @returns {Map<number, *>}
   */
  getAll() {
    return this.players;
  }

  /**
   * Get all player sources
   * @returns {number[]}
   */
  getAllSources() {
    return Array.from(this.players.keys());
  }

  /**
   * Get player count
   * @returns {number}
   */
  count() {
    return this.players.size;
  }

  /**
   * Find players by predicate
   * @param {Function} predicate
   * @returns {Array<*>}
   */
  find(predicate) {
    const results = [];
    for (const player of this.players.values()) {
      if (predicate(player)) {
        results.push(player);
      }
    }
    return results;
  }

  /**
   * Execute callback for each player
   * @param {Function} callback
   */
  forEach(callback) {
    this.players.forEach(callback);
  }
}

/**
 * Player class - represents a single player
 * Uses State Bags for data synchronization
 */
class PlayerClass {
  constructor(source, framework) {
    this.source = source;
    this.framework = framework;

    // Get player state bag (using global Player from FiveM)
    this.stateBag = Player(source).state;

    // Cache common identifiers
    this.identifiers = {};
    this.name = GetPlayerName(source);
    this.endpoints = [];
    this.ping = 0;

    // Custom data (plugin-defined)
    this.data = {};
  }

  /**
   * Initialize player
   */
  async init() {
    // Parse identifiers
    const numIdentifiers = GetNumPlayerIdentifiers(this.source);
    for (let i = 0; i < numIdentifiers; i++) {
      const identifier = GetPlayerIdentifier(this.source, i);
      const [type, value] = identifier.split(':');
      this.identifiers[type] = value;
    }

    // Parse endpoints
    const numEndpoints = GetNumPlayerTokens(this.source);
    for (let i = 0; i < numEndpoints; i++) {
      this.endpoints.push(GetPlayerToken(this.source, i));
    }

    // Set initial ping
    this.ping = GetPlayerPing(this.source);

    this.framework.log.info(`Player ${this.source} (${this.name}) initialized`);
  }

  /**
   * Destroy/cleanup player
   */
  async destroy() {
    // Clear custom data
    this.data = {};

    this.framework.log.info(`Player ${this.source} destroyed`);
  }

  /**
   * Get state bag value
   * @param {string} key
   * @returns {*}
   */
  getState(key) {
    return this.stateBag[key];
  }

  /**
   * Set state bag value (replicated to client)
   * @param {string} key
   * @param {*} value
   * @param {boolean} replicated - Whether to replicate to client (default: true)
   */
  setState(key, value, replicated = true) {
    this.stateBag.set(key, value, replicated);
  }

  /**
   * Get identifier by type
   * @param {string} type - e.g., 'license', 'steam', 'discord'
   * @returns {string|undefined}
   */
  getIdentifier(type) {
    return this.identifiers[type];
  }

  /**
   * Get all identifiers
   * @returns {Object}
   */
  getIdentifiers() {
    return { ...this.identifiers };
  }

  /**
   * Get player name
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Get player ping
   * @returns {number}
   */
  getPing() {
    this.ping = GetPlayerPing(this.source);
    return this.ping;
  }

  /**
   * Get player last message timestamp
   * @returns {number}
   */
  getLastMsg() {
    return GetPlayerLastMsg(this.source);
  }

  /**
   * Drop player with reason
   * @param {string} reason
   */
  drop(reason) {
    DropPlayer(this.source, reason);
  }

  /**
   * Get player's current ped
   * @returns {number}
   */
  getPed() {
    return GetPlayerPed(this.source);
  }

  /**
   * Get player's coordinates
   * @returns {number[]} [x, y, z]
   */
  getCoords() {
    const ped = this.getPed();
    return GetEntityCoords(ped);
  }

  /**
   * Set player's coordinates
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setCoords(x, y, z) {
    const ped = this.getPed();
    SetEntityCoords(ped, x, y, z, false, false, false, false);
  }

  /**
   * Get player's routing bucket
   * @returns {number}
   */
  getRoutingBucket() {
    return GetPlayerRoutingBucket(this.source);
  }

  /**
   * Set player's routing bucket (instance isolation)
   * @param {number} bucket
   */
  setRoutingBucket(bucket) {
    SetPlayerRoutingBucket(this.source, bucket);
  }

  /**
   * Trigger client event for this player
   * @param {string} eventName
   * @param {...*} args
   */
  triggerEvent(eventName, ...args) {
    this.framework.fivem.emitNet(eventName, this.source, ...args);
  }

  /**
   * Call RPC on this player's client
   * @param {string} rpcName
   * @param {...*} args
   * @returns {Promise<*>}
   */
  async callRPC(rpcName, ...args) {
    const rpc = this.framework.getModule('rpc');
    if (!rpc) return null;
    return await rpc.callClient(rpcName, this.source, ...args);
  }

  /**
   * Set custom data (plugin-defined)
   * @param {string} key
   * @param {*} value
   */
  setData(key, value) {
    this.data[key] = value;
  }

  /**
   * Get custom data
   * @param {string} key
   * @returns {*}
   */
  getData(key) {
    return this.data[key];
  }

  /**
   * Check if has custom data
   * @param {string} key
   * @returns {boolean}
   */
  hasData(key) {
    return key in this.data;
  }

  /**
   * Remove custom data
   * @param {string} key
   */
  removeData(key) {
    delete this.data[key];
  }
}

module.exports = PlayerManager;

// Self-register
global.Framework.register('player-manager', new PlayerManager(global.Framework), 10);
