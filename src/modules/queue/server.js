/**
 * NextGen Framework - Queue Module
 * Connection queue system with priority support
 */

class Queue {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;
    this.whitelist = null;

    // Queue state
    this.queue = [];
    this.connecting = new Set();
    this.priorities = new Map();

    // Configuration
    this.config = {
      enabled: true,
      maxPlayers: GetConvarInt('sv_maxclients', 32),
      reservedSlots: 2, // Reserved for high priority
      connectTimeout: 120000, // 2 minutes
      updateInterval: 5000 // 5 seconds
    };

    // Position update timer
    this.updateTimer = null;
  }

  /**
   * Initialize queue module
   */
  async init() {
    this.logger = this.framework.getModule('logger');
    this.whitelist = this.framework.getModule('whitelist');

    // Load priorities from database
    await this.loadPriorities();

    // Register connecting hook
    this.framework.registerHook(
      this.framework.constants.Hooks.BEFORE_PLAYER_JOIN,
      this.handleConnection.bind(this)
    );

    // Start position update loop
    this.startUpdateLoop();

    // Handle player drops
    on('playerDropped', () => {
      const source = global.source;
      this.removeFromQueue(source);
      this.connecting.delete(source);
      this.processQueue();
    });

    this.log(`Queue module initialized (max: ${this.config.maxPlayers}, reserved: ${this.config.reservedSlots})`, 'info');
  }

  /**
   * Load priority settings from database
   */
  async loadPriorities() {
    try {
      const priorities = await this.db.query('SELECT identifier, priority FROM queue_settings');

      this.priorities.clear();
      for (const entry of priorities) {
        this.priorities.set(entry.identifier, entry.priority);
      }

      this.log(`Loaded ${priorities.length} queue priorities`, 'debug');
    } catch (error) {
      this.log(`Failed to load queue priorities: ${error.message}`, 'error');
    }
  }

  /**
   * Handle player connection attempt
   */
  async handleConnection(source, deferrals) {
    if (!this.config.enabled) {
      return; // Queue disabled
    }

    const identifiers = this.getPlayerIdentifiers(source);
    const playerCount = GetNumPlayerIndices();

    // Check if server is full
    const isServerFull = playerCount >= this.config.maxPlayers;
    const priority = this.getPlayerPriority(identifiers);
    const hasReservedSlot = priority < 100 && playerCount >= (this.config.maxPlayers - this.config.reservedSlots);

    if (!isServerFull && !hasReservedSlot) {
      // Server has space, allow connection
      this.connecting.add(source);
      return;
    }

    // Add to queue
    const queueEntry = {
      source,
      identifiers,
      priority,
      joinedAt: Date.now(),
      deferrals
    };

    this.addToQueue(queueEntry);
    this.log(`Player ${identifiers.license} added to queue (priority: ${priority}, position: ${this.getQueuePosition(source)})`, 'info');
  }

  /**
   * Add player to queue (sorted by priority)
   */
  addToQueue(entry) {
    // Remove if already in queue
    this.removeFromQueue(entry.source);

    // Insert in priority order
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (entry.priority < this.queue[i].priority) {
        this.queue.splice(i, 0, entry);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.queue.push(entry);
    }

    // Update player's position
    this.updateQueuePosition(entry);
  }

  /**
   * Remove player from queue
   */
  removeFromQueue(source) {
    const index = this.queue.findIndex(e => e.source === source);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Process queue - let next player connect
   */
  processQueue() {
    if (this.queue.length === 0) return;

    const playerCount = GetNumPlayerIndices();
    const availableSlots = this.config.maxPlayers - playerCount;

    if (availableSlots <= 0) return;

    // Let next player(s) connect
    for (let i = 0; i < Math.min(availableSlots, this.queue.length); i++) {
      const entry = this.queue[i];

      // Check timeout
      if (Date.now() - entry.joinedAt > this.config.connectTimeout) {
        this.removeFromQueue(entry.source);
        entry.deferrals.done('Connection timeout');
        this.log(`Player ${entry.identifiers.license} timed out in queue`, 'warn');
        continue;
      }

      // Allow connection
      this.removeFromQueue(entry.source);
      this.connecting.add(entry.source);
      entry.deferrals.done();

      this.log(`Player ${entry.identifiers.license} allowed to connect from queue`, 'info');
    }
  }

  /**
   * Update queue positions for all players
   */
  updateQueuePositions() {
    for (let i = 0; i < this.queue.length; i++) {
      const entry = this.queue[i];
      this.updateQueuePosition(entry, i + 1);
    }
  }

  /**
   * Update single player's queue position
   */
  updateQueuePosition(entry, position = null) {
    if (position === null) {
      position = this.getQueuePosition(entry.source);
    }

    const waitTime = Math.ceil((position * 30) / 60); // Estimated wait in minutes
    const priorityText = entry.priority < 100 ? ' (Priority)' : '';

    entry.deferrals.update(`\n🎮 NextGen Server\n\n` +
      `Queue Position: ${position}/${this.queue.length}${priorityText}\n` +
      `Estimated Wait: ~${waitTime} min\n\n` +
      `Server: ${GetNumPlayerIndices()}/${this.config.maxPlayers} players\n` +
      `\nPlease wait...`
    );
  }

  /**
   * Get player's position in queue
   */
  getQueuePosition(source) {
    const index = this.queue.findIndex(e => e.source === source);
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Get player's priority based on identifiers
   */
  getPlayerPriority(identifiers) {
    let priority = 100; // Default priority

    // Check each identifier for priority
    for (const [type, value] of Object.entries(identifiers)) {
      const identifier = `${type}:${value}`;
      const p = this.priorities.get(identifier);
      if (p !== undefined && p < priority) {
        priority = p;
      }
    }

    // Whitelisted players get higher priority
    if (this.whitelist) {
      for (const [type, value] of Object.entries(identifiers)) {
        const identifier = `${type}:${value}`;
        if (this.whitelist.isWhitelisted(identifier)) {
          priority = Math.min(priority, 50);
          break;
        }
      }
    }

    return priority;
  }

  /**
   * Set player priority
   */
  async setPriority(identifier, priority, reason = null, setBy = 'system') {
    try {
      await this.db.execute(
        'INSERT INTO queue_settings (identifier, priority, reason, added_by) VALUES (?, ?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE priority = ?, reason = ?, added_by = ?',
        [identifier, priority, reason, setBy, priority, reason, setBy]
      );

      this.priorities.set(identifier, priority);
      this.log(`Set queue priority for ${identifier}: ${priority}`, 'info');

      // Reorder queue
      this.queue.sort((a, b) => a.priority - b.priority);
      this.updateQueuePositions();

      return { success: true };
    } catch (error) {
      this.log(`Failed to set priority: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove player priority
   */
  async removePriority(identifier) {
    try {
      await this.db.execute('DELETE FROM queue_settings WHERE identifier = ?', [identifier]);
      this.priorities.delete(identifier);
      this.log(`Removed queue priority for ${identifier}`, 'info');
      return { success: true };
    } catch (error) {
      this.log(`Failed to remove priority: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get queue info
   */
  getInfo() {
    return {
      enabled: this.config.enabled,
      queueLength: this.queue.length,
      playersOnline: GetNumPlayerIndices(),
      maxPlayers: this.config.maxPlayers,
      reservedSlots: this.config.reservedSlots,
      queue: this.queue.map(e => ({
        identifiers: e.identifiers,
        priority: e.priority,
        position: this.getQueuePosition(e.source),
        waitTime: Math.floor((Date.now() - e.joinedAt) / 1000)
      }))
    };
  }

  /**
   * Start update loop
   */
  startUpdateLoop() {
    this.updateTimer = setInterval(() => {
      this.updateQueuePositions();
      this.processQueue();
    }, this.config.updateInterval);
  }

  /**
   * Stop update loop
   */
  stopUpdateLoop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Enable queue
   */
  enable() {
    this.config.enabled = true;
    this.log('Queue enabled', 'info');
  }

  /**
   * Disable queue
   */
  disable() {
    this.config.enabled = false;

    // Clear queue and let everyone in
    for (const entry of this.queue) {
      entry.deferrals.done();
    }
    this.queue = [];

    this.log('Queue disabled - all queued players allowed', 'warn');
  }

  /**
   * Configure queue
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.log('Queue configuration updated', 'info');
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
      this.framework.utils.Log(`[Queue] ${message}`, level);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.stopUpdateLoop();

    // Let all queued players know
    for (const entry of this.queue) {
      entry.deferrals.done('Server shutting down');
    }

    this.log('Queue module destroyed', 'info');
  }
}

module.exports = Queue;
