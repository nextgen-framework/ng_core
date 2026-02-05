/**
 * NextGen Framework - Instance Manager Module
 * Manages routing buckets for player isolation (instances, apartments, missions, etc.)
 */

class InstanceManager {
  constructor(framework) {
    this.framework = framework;

    // Instance tracking
    this.instances = new Map(); // instanceId => Instance object
    this.playerInstances = new Map(); // source => instanceId
    this.routingBuckets = new Map(); // routingBucket => instanceId

    // Configuration
    this.config = {
      maxInstances: 1000,
      defaultBucket: 0, // Public world
      autoCleanupEmpty: true,
      autoCleanupDelay: 60000, // 1 minute
      instanceTypes: ['apartment', 'mission', 'heist', 'race', 'custom'],
      maxPlayersPerInstance: 32
    };

    // Bucket allocation
    this.nextBucket = 1; // Start from 1 (0 is public)
    this.freeBuckets = []; // Recycled buckets

    // Server-side invitation tracking (prevent unauthorized joins)
    this._pendingInvites = new Map(); // source => Set<instanceId>
  }

  /**
   * Initialize instance manager module
   */
  async init() {
    // Reset all players to public bucket on resource restart (prevent limbo)
    const players = getPlayers();
    for (const playerId of players) {
      SetPlayerRoutingBucket(parseInt(playerId), this.config.defaultBucket);
    }

    // Handle player drops
    this.framework.fivem.on('playerDropped', () => {
      this._handlePlayerDropped(source);
    });

    // Handle client-initiated actions (with server-side validation)
    this.framework.onNet('ng_core|instance/request-leave', () => {
      this.removePlayerFromInstance(source);
    });

    this.framework.onNet('ng_core|instance/accept-invite', (instanceId) => {
      // Validate invitation exists server-side
      const invites = this._pendingInvites.get(source);
      if (!invites || !invites.has(instanceId)) {
        this.framework.log.warn(`Player ${source} tried to accept invalid invite for ${instanceId}`);
        return;
      }
      invites.delete(instanceId);
      this.addPlayerToInstance(source, instanceId);
    });

    this.framework.log.info('Instance manager module initialized');
  }

  /**
   * Create a new instance
   */
  async createInstance(type, owner = null, metadata = {}) {
    if (this.instances.size >= this.config.maxInstances) {
      return { success: false, reason: 'max_instances_reached' };
    }

    const instanceId = this.generateInstanceId();
    const routingBucket = this.allocateBucket();

    const instance = {
      id: instanceId,
      type,
      owner,
      routingBucket,
      players: new Set(),
      createdAt: Date.now(),
      metadata,
      locked: false,
      maxPlayers: metadata.maxPlayers || this.config.maxPlayersPerInstance
    };

    this.instances.set(instanceId, instance);
    this.routingBuckets.set(routingBucket, instanceId);

    // Set routing bucket properties
    SetRoutingBucketPopulationEnabled(routingBucket, false); // Disable auto-population
    SetRoutingBucketEntityLockdownMode(routingBucket, 'relaxed'); // Allow entity creation

    this.framework.log.info(`Created instance: ${instanceId} (type: ${type}, bucket: ${routingBucket})`);

    return { success: true, instanceId, routingBucket };
  }

  /**
   * Delete an instance
   */
  async deleteInstance(instanceId, force = false) {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      return { success: false, reason: 'instance_not_found' };
    }

    // Check if instance has players
    if (instance.players.size > 0 && !force) {
      return { success: false, reason: 'instance_not_empty' };
    }

    // Remove all players if force (copy Set to avoid modification during iteration)
    if (force) {
      for (const source of [...instance.players]) {
        await this.removePlayerFromInstance(source);
      }
    }

    // Free the routing bucket
    this.freeBucket(instance.routingBucket);

    // Clean up
    this.instances.delete(instanceId);
    this.routingBuckets.delete(instance.routingBucket);

    this.framework.log.info(`Deleted instance: ${instanceId}`);

    return { success: true };
  }

  /**
   * Add player to instance
   */
  async addPlayerToInstance(source, instanceId) {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      return { success: false, reason: 'instance_not_found' };
    }

    // Check if instance is locked
    if (instance.locked) {
      return { success: false, reason: 'instance_locked' };
    }

    // Check max players
    if (instance.players.size >= instance.maxPlayers) {
      return { success: false, reason: 'instance_full' };
    }

    // Remove from current instance first
    const currentInstance = this.playerInstances.get(source);
    if (currentInstance) {
      await this.removePlayerFromInstance(source);
    }

    // Cancel pending cleanup for this instance
    if (instance._cleanupTimer) {
      clearTimeout(instance._cleanupTimer);
      instance._cleanupTimer = null;
    }

    // Add to new instance
    instance.players.add(source);
    this.playerInstances.set(source, instanceId);

    // Set player's routing bucket
    SetPlayerRoutingBucket(source, instance.routingBucket);

    this.framework.log.debug(`Player ${source} joined instance ${instanceId}`);

    // Emit event
    this.framework.fivem.emitNet('ng_core|instance/joined', source, instanceId, instance.type);

    return { success: true, routingBucket: instance.routingBucket };
  }

  /**
   * Remove player from instance
   * @param {number} source - Player source
   * @param {boolean} [silent=false] - Skip emitNet (used when player already disconnected)
   */
  async removePlayerFromInstance(source, silent = false) {
    const instanceId = this.playerInstances.get(source);

    if (!instanceId) {
      return { success: false, reason: 'player_not_in_instance' };
    }

    const instance = this.instances.get(instanceId);

    if (!instance) {
      // Instance was deleted, just clean up player tracking
      this.playerInstances.delete(source);
      if (!silent) SetPlayerRoutingBucket(source, this.config.defaultBucket);
      return { success: true };
    }

    // Remove from instance
    instance.players.delete(source);
    this.playerInstances.delete(source);

    // Return to public world (skip if player already disconnected)
    if (!silent) {
      SetPlayerRoutingBucket(source, this.config.defaultBucket);
      this.framework.fivem.emitNet('ng_core|instance/left', source, instanceId);
    }

    this.framework.log.debug(`Player ${source} left instance ${instanceId}`);

    // Auto cleanup if empty
    if (this.config.autoCleanupEmpty && instance.players.size === 0) {
      this._scheduleCleanup(instance);
    }

    return { success: true };
  }

  /**
   * Transfer player between instances
   */
  async transferPlayer(source, targetInstanceId) {
    return await this.addPlayerToInstance(source, targetInstanceId);
  }

  /**
   * Get player's current instance
   */
  getPlayerInstance(source) {
    const instanceId = this.playerInstances.get(source);
    if (!instanceId) return null;

    return this.instances.get(instanceId);
  }

  /**
   * Get instance by ID
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Get all instances
   */
  getAllInstances() {
    return Array.from(this.instances.values());
  }

  /**
   * Get instances by type
   */
  getInstancesByType(type) {
    return this.getAllInstances().filter(i => i.type === type);
  }

  /**
   * Get instances by owner
   */
  getInstancesByOwner(owner) {
    return this.getAllInstances().filter(i => i.owner === owner);
  }

  /**
   * Lock instance (prevent new players)
   */
  lockInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, reason: 'instance_not_found' };
    }

    instance.locked = true;
    this.framework.log.debug(`Instance ${instanceId} locked`);

    return { success: true };
  }

  /**
   * Unlock instance
   */
  unlockInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, reason: 'instance_not_found' };
    }

    instance.locked = false;
    this.framework.log.debug(`Instance ${instanceId} unlocked`);

    return { success: true };
  }

  /**
   * Set instance metadata
   */
  setInstanceMetadata(instanceId, metadata) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, reason: 'instance_not_found' };
    }

    instance.metadata = { ...instance.metadata, ...metadata };

    return { success: true };
  }

  /**
   * Get instance metadata
   */
  getInstanceMetadata(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;

    return instance.metadata;
  }

  /**
   * Invite player to instance
   */
  async invitePlayer(source, instanceId) {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      return { success: false, reason: 'instance_not_found' };
    }

    // Track invitation server-side
    if (!this._pendingInvites.has(source)) {
      this._pendingInvites.set(source, new Set());
    }
    this._pendingInvites.get(source).add(instanceId);

    // Send invitation to client
    this.framework.fivem.emitNet('ng_core|instance/invite', source, instanceId, instance.type, instance.metadata);

    this.framework.log.debug(`Player ${source} invited to instance ${instanceId}`);

    return { success: true };
  }

  /**
   * Check if player is in same instance as another player
   */
  arePlayersInSameInstance(source1, source2) {
    const instance1 = this.playerInstances.get(source1);
    const instance2 = this.playerInstances.get(source2);

    return instance1 && instance2 && instance1 === instance2;
  }

  /**
   * Get players in same instance
   */
  getPlayersInInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return [];

    return Array.from(instance.players);
  }

  /**
   * Broadcast event to instance
   */
  broadcastToInstance(instanceId, eventName, ...args) {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    for (const source of instance.players) {
      this.framework.fivem.emitNet(eventName, source, ...args);
    }
  }

  /**
   * Schedule cleanup for empty instance (stores ref to prevent accumulation)
   * @param {Object} instance - Instance object
   */
  _scheduleCleanup(instance) {
    if (instance._cleanupTimer) {
      clearTimeout(instance._cleanupTimer);
    }

    instance._cleanupTimer = setTimeout(() => {
      instance._cleanupTimer = null;
      if (instance.players.size === 0) {
        this.framework.log.debug(`Auto-cleaning empty instance: ${instance.id}`);
        this.deleteInstance(instance.id);
      }
    }, this.config.autoCleanupDelay);
  }

  /**
   * Handle player leaving server (silent: don't emitNet to disconnected player)
   */
  _handlePlayerDropped(source) {
    this._pendingInvites.delete(source);

    const instanceId = this.playerInstances.get(source);
    if (instanceId) {
      this.removePlayerFromInstance(source, true);
    }
  }

  /**
   * Generate unique instance ID
   */
  generateInstanceId() {
    return `instance_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Allocate routing bucket
   */
  allocateBucket() {
    // Reuse freed bucket if available
    if (this.freeBuckets.length > 0) {
      return this.freeBuckets.pop();
    }

    // Allocate new bucket
    return this.nextBucket++;
  }

  /**
   * Free routing bucket for reuse
   */
  freeBucket(bucket) {
    if (bucket !== this.config.defaultBucket) {
      this.freeBuckets.push(bucket);
    }
  }

  /**
   * Get instance statistics
   */
  getStats() {
    return {
      totalInstances: this.instances.size,
      totalPlayers: this.playerInstances.size,
      bucketCount: this.nextBucket - 1,
      freeBuckets: this.freeBuckets.length,
      instancesByType: this.config.instanceTypes.reduce((acc, type) => {
        acc[type] = this.getInstancesByType(type).length;
        return acc;
      }, {})
    };
  }

  /**
   * Configure instance manager
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.framework.log.info('Instance manager configuration updated');
  }


  /**
   * Cleanup
   */
  async destroy() {
    // Return all players to public world
    for (const source of this.playerInstances.keys()) {
      SetPlayerRoutingBucket(source, this.config.defaultBucket);
    }

    this.instances.clear();
    this.playerInstances.clear();
    this.routingBuckets.clear();
    this.freeBuckets = [];

    this.framework.log.info('Instance manager module destroyed');
  }
}

module.exports = InstanceManager;

// Self-register
global.Framework.register('instance-manager', new InstanceManager(global.Framework), 12);
