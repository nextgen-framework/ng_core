/**
 * NextGen Framework - Queue Module
 * Connection queue system with priority support
 */

class Queue {
  constructor(framework) {
    this.framework = framework;
    this.db = null;
    this.whitelist = null;

    // Queue state
    this.queue = [];
    this.connecting = new Set();
    this.priorities = new Map(); // identifier -> priority number (static, from database)
    this.queueTypes = new Map(); // identifier -> queue type (static, from database)
    this.typeConfigs = new Map(); // queue type -> config (priority level, reserved slots)

    // Dynamic assignments (temporary, in-memory only)
    this.dynamicPriorities = new Map(); // identifier -> priority number (temporary)
    this.dynamicQueueTypes = new Map(); // identifier -> queue type (temporary)

    // Configuration
    this.config = {
      enabled: true,
      maxPlayers: GetConvarInt('sv_maxclients', 32),
      reservedSlots: 2, // Reserved for high priority
      connectTimeout: 120000, // 2 minutes
      updateInterval: 1000, // 1 second - for animated queue cards
      forceQueue: GetConvar('ngcore_queue_force', 'false') === 'true' // Force everyone into queue for testing
    };

    // Position update timer
    this.updateTimer = null;
  }

  /**
   * Initialize queue module
   */
  async init() {
    this.db = this.framework.getModule('database');
    this.whitelist = this.framework.getModule('whitelist');
    this.connectionManager = this.framework.getModule('connection-manager');

    // Load player priorities and queue types from database
    await this.loadPriorities();

    // Register connecting hook
    this.framework.events.on(
      this.framework.constants.Hooks.BEFORE_PLAYER_JOIN,
      this.handleConnection.bind(this)
    );

    // Start position update loop
    this.startUpdateLoop();

    // Handle player drops
    this.framework.fivem.on('playerDropped', () => {
      const src = source;
      this.handlePlayerDrop(src);
    });

    const forceQueueMsg = this.config.forceQueue ? ' [FORCE QUEUE MODE - TESTING]' : '';
    this.framework.log.info(`Queue module initialized (max: ${this.config.maxPlayers}, reserved: ${this.config.reservedSlots})${forceQueueMsg}`);
  }

  /**
   * Register a new queue type (for external resources)
   * Types are stored in-memory only (no database persistence)
   */
  registerQueueType(typeName, priority, reservedSlots = 0, displayName = null) {
    if (!displayName) {
      displayName = typeName.charAt(0).toUpperCase() + typeName.slice(1);
    }

    this.typeConfigs.set(typeName, {
      priority,
      reservedSlots,
      displayName
    });

    this.framework.log.info(`Registered queue type: ${typeName} (priority: ${priority}, reserved: ${reservedSlots})`);
    return { success: true };
  }

  /**
   * Unregister a queue type
   */
  unregisterQueueType(typeName) {
    if (this.typeConfigs.has(typeName)) {
      this.typeConfigs.delete(typeName);
      this.framework.log.info(`Unregistered queue type: ${typeName}`);
      return { success: true };
    }
    return { success: false, error: 'Queue type not found' };
  }

  /**
   * Load priority settings from database
   */
  async loadPriorities() {
    try {
      const priorities = await this.db.query('SELECT identifier, priority, queue_type FROM queue_settings');

      this.priorities.clear();
      this.queueTypes.clear();
      for (const entry of priorities) {
        this.priorities.set(entry.identifier, entry.priority);
        if (entry.queue_type) {
          this.queueTypes.set(entry.identifier, entry.queue_type);
        }
      }

      this.framework.log.debug(`Loaded ${priorities.length} queue priorities`);
    } catch (error) {
      this.framework.log.error(`Failed to load queue priorities: ${error.message}`);
    }
  }

  /**
   * Handle player connection attempt
   * @param {Object} data - { source, deferrals }
   */
  async handleConnection(data) {
    const { source, deferrals } = data;
    if (!this.config.enabled) {
      return data; // Queue disabled - pass through
    }

    const identifiers = this.getPlayerIdentifiers(source);
    const playerCount = GetNumPlayerIndices();

    // Check if server is full
    const isServerFull = playerCount >= this.config.maxPlayers;
    let { priority, queueType } = this.getPlayerPriority(identifiers);

    // Allow external resources to implement custom queue logic
    // This hook can be used to dynamically assign queue types based on custom logic
    const hookResult = await this.framework.events.pipe('QUEUE_CALCULATE_PRIORITY', {
      source,
      identifiers,
      priority,
      queueType,
      isServerFull,
      playerCount,
      maxPlayers: this.config.maxPlayers
    });

    // If hook modified priority/type, use those values
    if (hookResult && hookResult.priority !== undefined) {
      priority = hookResult.priority;
    }
    if (hookResult && hookResult.queueType !== undefined) {
      queueType = hookResult.queueType;
    }

    const typeConfig = queueType ? this.typeConfigs.get(queueType) : null;
    const hasReservedSlot = typeConfig && typeConfig.reservedSlots > 0 && playerCount >= (this.config.maxPlayers - typeConfig.reservedSlots);

    // Force queue mode - always put in queue for testing
    if (!this.config.forceQueue && !isServerFull && !hasReservedSlot) {
      // Server has space, allow connection through stages
      this.connecting.add(source);

      // Log direct connection to console
      const displayType = typeConfig ? typeConfig.displayName : (queueType || 'Default');
      console.log(`[NextGen] [Queue] Player connecting: ${identifiers.license} | Queue: ${displayType} | Priority: ${priority} | Direct connection (${playerCount + 1}/${this.config.maxPlayers})`);

      // Start connection process through connection-manager
      if (this.connectionManager) {
        await this.connectionManager.startConnectionProcess(source, deferrals, identifiers);
      } else {
        // Fallback if connection-manager not available
        deferrals.done();
      }

      return;
    }

    // Add to queue
    const queueEntry = {
      source,
      identifiers,
      priority,
      queueType,
      joinedAt: Date.now(),
      deferrals
    };

    this.addToQueue(queueEntry);

    const position = this.getQueuePosition(source);
    const queueTypeStr = queueType ? `type: ${queueType}, ` : '';
    this.framework.log.info(`Player ${identifiers.license} added to queue (${queueTypeStr}priority: ${priority}, position: ${position}/${this.queue.length})`);

    // Also log to console for visibility
    const typeConfigForLog = queueType ? this.typeConfigs.get(queueType) : null;
    const displayType = typeConfigForLog ? typeConfigForLog.displayName : (queueType || 'Default');
    console.log(`[NextGen] [Queue] Player connecting: ${identifiers.license} | Queue: ${displayType} | Priority: ${priority} | Position: ${position}/${this.queue.length}`);
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
  async processQueue() {
    if (this.queue.length === 0) return;

    const playerCount = GetNumPlayerIndices();
    const availableSlots = this.config.maxPlayers - playerCount;

    // In force queue mode, ignore slot availability (always process queue)
    if (!this.config.forceQueue && availableSlots <= 0) return;

    // Collect entries to process (avoid splice during iteration)
    const toProcess = [];
    const toTimeout = [];
    const slotsToFill = this.config.forceQueue ? this.queue.length : Math.min(availableSlots, this.queue.length);
    let processed = 0;

    for (let i = 0; i < this.queue.length && processed < slotsToFill; i++) {
      const entry = this.queue[i];

      // Check timeout
      if (Date.now() - entry.joinedAt > this.config.connectTimeout) {
        toTimeout.push(entry);
        continue;
      }

      // In force queue mode, require minimum 10 seconds in queue for testing
      const minQueueTime = this.config.forceQueue ? 10000 : 0;
      const timeInQueue = Date.now() - entry.joinedAt;

      if (timeInQueue < minQueueTime) {
        continue;
      }

      toProcess.push(entry);
      processed++;
    }

    // Handle timeouts
    for (const entry of toTimeout) {
      this.removeFromQueue(entry.source);
      entry.deferrals.done('Connection timeout');
      this.framework.log.warn(`Player ${entry.identifiers.license} timed out in queue`);
    }

    // Process allowed entries
    for (const entry of toProcess) {
      this.removeFromQueue(entry.source);
      this.connecting.add(entry.source);

      // Log to console
      const typeConfig = entry.queueType ? this.typeConfigs.get(entry.queueType) : null;
      const displayType = typeConfig ? typeConfig.displayName : (entry.queueType || 'Default');
      console.log(`[NextGen] [Queue] Player allowed from queue: ${entry.identifiers.license} | Queue: ${displayType} | Priority: ${entry.priority} | Waited: ${Math.floor((Date.now() - entry.joinedAt) / 1000)}s`);

      this.framework.log.info(`Player ${entry.identifiers.license} allowed to connect from queue`);

      // Notify plugins (ng_queue) to cleanup animation state
      this.framework.fivem.emit('ng:queue:playerExitQueue', entry.source);

      // Start connection process through connection-manager
      if (this.connectionManager) {
        await this.connectionManager.startConnectionProcess(entry.source, entry.deferrals, entry.identifiers);
      } else {
        entry.deferrals.done();
      }
    }
  }

  /**
   * Update queue positions for all players
   */
  /**
   * Re-sort queue and update all positions
   */
  resortAndUpdate() {
    this.queue.sort((a, b) => a.priority - b.priority);
    for (let i = 0; i < this.queue.length; i++) {
      this.updateQueuePosition(this.queue[i], i + 1);
    }
  }

  /**
   * Update single player's queue position
   */
  updateQueuePosition(entry, position = null) {
    if (position === null) {
      position = this.getQueuePosition(entry.source);
    }

    // Get queue type display name
    let queueTypeDisplay = 'Default';
    if (entry.queueType) {
      const typeConfig = this.typeConfigs.get(entry.queueType);
      queueTypeDisplay = typeConfig ? typeConfig.displayName : entry.queueType;
    }

    // Emit event for ng_queue to handle card presentation
    this.framework.fivem.emit('ng:queue:updatePosition', {
      source: entry.source,
      deferrals: entry.deferrals,
      position: position,
      total: this.queue.length,
      playerCount: GetNumPlayerIndices(),
      maxPlayers: this.config.maxPlayers,
      queueType: queueTypeDisplay,
      priority: entry.priority,
      joinedAt: entry.joinedAt // Add timestamp for elapsed time calculation
    });

    // Update loading screen with queue status
    const queueMessage = `Position ${position}/${this.queue.length}`;
    try {
      this.framework.fivem.emitNet('ng:loading:updateStageProgress', entry.source, 0, 'queue', queueMessage);
    } catch (error) {
      // Silently fail if player disconnected
    }
  }

  /**
   * Get player's position in queue
   */
  getQueuePosition(source) {
    const index = this.queue.findIndex(e => e.source === source);
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Get player's priority based on identifiers and queue type
   * Priority order: dynamic > static > whitelist > default
   */
  getPlayerPriority(identifiers) {
    let priority = 100; // Default priority
    let queueType = null; // No default queue type
    let isDynamic = false;

    // Check each identifier for queue type and priority
    for (const [type, value] of Object.entries(identifiers)) {
      const identifier = `${type}:${value}`;

      // Check for DYNAMIC priority/type first (highest priority)
      const dynamicPriority = this.dynamicPriorities.get(identifier);
      if (dynamicPriority !== undefined && dynamicPriority < priority) {
        priority = dynamicPriority;
        isDynamic = true;
      }

      const dynamicType = this.dynamicQueueTypes.get(identifier);
      if (dynamicType && this.typeConfigs.has(dynamicType)) {
        const typeConfig = this.typeConfigs.get(dynamicType);
        if (typeConfig.priority < priority) {
          priority = typeConfig.priority;
          queueType = dynamicType;
          isDynamic = true;
        }
      }

      // Check for STATIC priority setting (only if no dynamic override)
      if (!isDynamic) {
        const p = this.priorities.get(identifier);
        if (p !== undefined && p < priority) {
          priority = p;
        }

        // Check for STATIC queue type assignment
        const qt = this.queueTypes.get(identifier);
        if (qt && this.typeConfigs.has(qt)) {
          const typeConfig = this.typeConfigs.get(qt);
          if (typeConfig.priority < priority) {
            priority = typeConfig.priority;
            queueType = qt;
          }
        }
      }
    }

    // Whitelisted players get higher priority (if whitelist is enabled and no dynamic/static override)
    if (!isDynamic && this.whitelist && this.whitelist.isEnabled && this.whitelist.isEnabled()) {
      for (const [type, value] of Object.entries(identifiers)) {
        const identifier = `${type}:${value}`;
        if (this.whitelist.isWhitelisted(identifier)) {
          // Give whitelisted players priority 50 by default
          if (priority > 50) {
            priority = 50;
          }
          break;
        }
      }
    }

    return { priority, queueType };
  }

  /**
   * Set player priority or queue type
   */
  async setPriority(identifier, priority, reason = null, setBy = 'system', queueType = null) {
    try {
      // If queueType is provided, use its priority
      if (queueType && this.typeConfigs.has(queueType)) {
        priority = this.typeConfigs.get(queueType).priority;
      }

      await this.db.execute(
        'INSERT INTO queue_settings (identifier, queue_type, priority, reason, added_by) VALUES (?, ?, ?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE queue_type = ?, priority = ?, reason = ?, added_by = ?',
        [identifier, queueType, priority, reason, setBy, queueType, priority, reason, setBy]
      );

      this.priorities.set(identifier, priority);
      if (queueType) {
        this.queueTypes.set(identifier, queueType);
      }

      this.framework.log.info(`Set queue ${queueType ? `type '${queueType}'` : `priority ${priority}`} for ${identifier}`);

      this.resortAndUpdate();

      return { success: true };
    } catch (error) {
      this.framework.log.error(`Failed to set priority: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set player queue type (static, persisted to database)
   */
  async setQueueType(identifier, queueType, reason = null, setBy = 'system') {
    if (!this.typeConfigs.has(queueType)) {
      return { success: false, error: `Unknown queue type: ${queueType}` };
    }

    return await this.setPriority(identifier, null, reason, setBy, queueType);
  }

  /**
   * Set dynamic priority (temporary, in-memory only)
   */
  setDynamicPriority(identifier, priority, queueType = null) {
    this.dynamicPriorities.set(identifier, priority);

    if (queueType) {
      if (!this.typeConfigs.has(queueType)) {
        return { success: false, error: `Unknown queue type: ${queueType}` };
      }
      this.dynamicQueueTypes.set(identifier, queueType);
    }

    this.framework.log.info(`Set dynamic queue ${queueType ? `type '${queueType}'` : `priority ${priority}`} for ${identifier}`);

    this.resortAndUpdate();

    return { success: true };
  }

  /**
   * Set dynamic queue type (temporary, in-memory only)
   */
  setDynamicQueueType(identifier, queueType) {
    if (!this.typeConfigs.has(queueType)) {
      return { success: false, error: `Unknown queue type: ${queueType}` };
    }

    const typeConfig = this.typeConfigs.get(queueType);
    return this.setDynamicPriority(identifier, typeConfig.priority, queueType);
  }

  /**
   * Remove dynamic assignment
   */
  removeDynamicAssignment(identifier) {
    const hadPriority = this.dynamicPriorities.has(identifier);
    const hadType = this.dynamicQueueTypes.has(identifier);

    this.dynamicPriorities.delete(identifier);
    this.dynamicQueueTypes.delete(identifier);

    if (hadPriority || hadType) {
      this.framework.log.info(`Removed dynamic queue assignment for ${identifier}`);

      this.resortAndUpdate();

      return { success: true };
    }

    return { success: false, error: 'No dynamic assignment found' };
  }

  /**
   * Remove player priority (static, from database)
   */
  async removePriority(identifier) {
    try {
      await this.db.execute('DELETE FROM queue_settings WHERE identifier = ?', [identifier]);
      this.priorities.delete(identifier);
      this.queueTypes.delete(identifier);
      this.framework.log.info(`Removed queue priority for ${identifier}`);
      return { success: true };
    } catch (error) {
      this.framework.log.error(`Failed to remove priority: ${error.message}`);
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
      queueTypes: Array.from(this.typeConfigs.entries()).map(([name, config]) => ({
        name,
        priority: config.priority,
        reservedSlots: config.reservedSlots,
        displayName: config.displayName
      })),
      queue: this.queue.map(e => ({
        identifiers: e.identifiers,
        priority: e.priority,
        queueType: e.queueType,
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
      this.resortAndUpdate();
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
    this.framework.log.info('Queue enabled');
  }

  /**
   * Disable queue
   */
  disable() {
    this.config.enabled = false;
    this.stopUpdateLoop();

    // Clear queue and let everyone in
    for (const entry of this.queue) {
      entry.deferrals.done();
    }
    this.queue = [];

    this.framework.log.warn('Queue disabled - all queued players allowed');
  }

  /**
   * Configure queue
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.framework.log.info('Queue configuration updated');
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
   * Handle player drop - cleanup queue, connecting set, and dynamic assignments
   */
  handlePlayerDrop(playerSource) {
    // Finalize deferral if player was in queue (prevents deferral leak)
    const queueEntry = this.queue.find(e => e.source === playerSource);
    if (queueEntry) {
      try {
        queueEntry.deferrals.done('Player disconnected');
      } catch (e) {
        // Deferral may already be finalized
      }
    }

    this.removeFromQueue(playerSource);
    this.connecting.delete(playerSource);

    // Cleanup dynamic assignments for this player's identifiers
    try {
      const identifiers = this.getPlayerIdentifiers(playerSource);
      for (const [type, value] of Object.entries(identifiers)) {
        const identifier = `${type}:${value}`;
        this.dynamicPriorities.delete(identifier);
        this.dynamicQueueTypes.delete(identifier);
      }
    } catch (e) {
      // Player may already be fully disconnected, identifiers unavailable
    }

    this.processQueue();
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

    this.framework.log.info('Queue module destroyed');
  }
}

module.exports = Queue;

// Self-register
global.Framework.register('queue', new Queue(global.Framework), 9);
