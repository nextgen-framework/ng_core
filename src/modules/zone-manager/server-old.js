/**
 * NextGen Framework - Zone Manager Module (Server-Side)
 * Ultra-performant zone management with spatial partitioning
 */

const { ZoneFactory } = require('./shared/types.js');
const { QuadTree, SpatialGrid } = require('./shared/spatial.js');

class ZoneManagerModule {
  constructor(framework) {
    this.framework = framework;

    // Zone storage
    this.zones = new Map();
    this.zoneIdCounter = 1;

    // Spatial partitioning
    // Default: 10km x 10km map centered at 0,0 (covers most of LS)
    this.spatialMethod = 'grid'; // 'grid' or 'quadtree'
    this.spatial = null;

    // Performance tracking
    this.stats = {
      totalChecks: 0,
      totalZones: 0,
      avgCheckTime: 0,
      lastUpdate: Date.now()
    };

    // Update configuration
    this.updateInterval = 100; // ms between player checks
    this.maxChecksPerTick = 50; // Max player checks per update
    this._updateTimer = null;
    this._playerCheckQueue = [];
  }

  /**
   * Initialize the zone manager module
   */
  async init() {
    this.framework.log.info('Zone Manager Module initializing...');

    // Initialize spatial partitioning
    this.initializeSpatial();

    // Start player update loop
    this.startUpdateLoop();

    // Register events
    this.registerEvents();

    // Register RPC handlers
    this.registerRPC();

    this.framework.log.info('Zone Manager Module initialized');
  }

  /**
   * Initialize spatial partitioning system
   */
  initializeSpatial(options = {}) {
    const method = options.method || this.spatialMethod;
    const bounds = options.bounds || {
      minX: -5000,
      minY: -5000,
      maxX: 5000,
      maxY: 5000
    };

    if (method === 'quadtree') {
      this.spatial = new QuadTree(bounds, {
        capacity: options.capacity || 10,
        maxDepth: options.maxDepth || 8
      });
      this.framework.log.info('Using QuadTree spatial partitioning');
    } else {
      // Grid is faster for most use cases
      this.spatial = new SpatialGrid(bounds, options.cellSize || 100);
      this.framework.log.info('Using Grid spatial partitioning');
    }

    this.spatialMethod = method;
  }

  /**
   * Start the player update loop
   */
  startUpdateLoop() {
    this._updateTimer = setInterval(() => {
      this.updatePlayers();
    }, this.updateInterval);
  }

  /**
   * Stop the player update loop
   */
  stopUpdateLoop() {
    if (this._updateTimer) {
      clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
  }

  /**
   * Update all players (check zones)
   */
  updatePlayers() {
    const startTime = Date.now();

    // Get all players
    const players = this.framework.getPlayers();

    let checksPerformed = 0;

    players.forEach((player, source) => {
      if (checksPerformed >= this.maxChecksPerTick) return;

      // Get player position
      const ped = GetPlayerPed(source);
      if (!ped || ped === 0) return;

      const coords = GetEntityCoords(ped);
      const x = coords[0];
      const y = coords[1];
      const z = coords[2];

      // Query nearby zones using spatial partitioning
      const nearbyZones = this.spatial.query(x, y, 500); // 500m radius

      // Check each nearby zone
      for (let i = 0; i < nearbyZones.length; i++) {
        nearbyZones[i].checkPlayer(source, x, y, z, player);
        checksPerformed++;
      }
    });

    // Update stats
    const elapsed = Date.now() - startTime;
    this.stats.totalChecks += checksPerformed;
    this.stats.avgCheckTime = (this.stats.avgCheckTime * 0.9) + (elapsed * 0.1);
    this.stats.lastUpdate = Date.now();
  }

  /**
   * Register framework events
   */
  registerEvents() {
    // Clean up zone data when player disconnects
    this.framework.eventBus.on('PLAYER_DISCONNECTED', (data) => {
      this.zones.forEach(zone => {
        zone.removePlayer(data.source);
      });
    });
  }

  /**
   * Register RPC handlers
   */
  registerRPC() {
    // Allow client to query zones at position
    this.framework.rpc.register('zone:query', (source, x, y, range) => {
      const zones = this.spatial.query(x, y, range || 100);
      return zones.map(z => ({
        id: z.id,
        name: z.name,
        type: z.constructor.name.replace('Zone', '').toLowerCase()
      }));
    });

    // Get zone info
    this.framework.rpc.register('zone:getInfo', (source, zoneId) => {
      const zone = this.getZone(zoneId);
      if (!zone) return null;

      return {
        id: zone.id,
        name: zone.name,
        type: zone.constructor.name.replace('Zone', '').toLowerCase(),
        enabled: zone.enabled,
        playersInside: zone.getPlayersInside().size,
        data: zone.data
      };
    });
  }

  /**
   * Create a new zone
   * @param {string} type - Zone type (circle, rectangle, polygon, composite)
   * @param {Object} data - Zone configuration
   * @returns {Zone}
   */
  create(type, data) {
    const id = data.id || this.zoneIdCounter++;
    const zone = ZoneFactory.create(id, type, data);

    this.zones.set(zone.id, zone);
    this.spatial.insert(zone);
    this.stats.totalZones = this.zones.size;

    this.framework.log.info(`Zone created: ${zone.name} (${type})`);

    // Emit event
    this.framework.eventBus.emit('ZONE_CREATED', { zone });

    return zone;
  }

  /**
   * Get zone by ID
   * @param {string|number} id
   * @returns {Zone|null}
   */
  getZone(id) {
    return this.zones.get(id) || null;
  }

  /**
   * Get zone by name
   * @param {string} name
   * @returns {Zone|null}
   */
  getZoneByName(name) {
    for (const [id, zone] of this.zones) {
      if (zone.name === name) return zone;
    }
    return null;
  }

  /**
   * Remove zone
   * @param {string|number} id
   * @returns {boolean}
   */
  remove(id) {
    const zone = this.zones.get(id);
    if (!zone) return false;

    this.spatial.remove(zone);
    this.zones.delete(id);
    zone.destroy();
    this.stats.totalZones = this.zones.size;

    this.framework.log.info(`Zone removed: ${zone.name}`);

    // Emit event
    this.framework.eventBus.emit('ZONE_REMOVED', { zoneId: id });

    return true;
  }

  /**
   * Update zone (after modifying properties)
   * @param {Zone} zone
   */
  updateZone(zone) {
    this.spatial.update(zone);

    // Emit event
    this.framework.eventBus.emit('ZONE_UPDATED', { zone });
  }

  /**
   * Check if player is in zone
   * @param {number} source - Player source
   * @param {string|number} zoneId
   * @returns {boolean}
   */
  isPlayerInZone(source, zoneId) {
    const zone = this.getZone(zoneId);
    if (!zone) return false;

    return zone.getPlayersInside().has(source);
  }

  /**
   * Get all zones player is currently in
   * @param {number} source - Player source
   * @returns {Array<Zone>}
   */
  getPlayerZones(source) {
    const playerZones = [];

    this.zones.forEach(zone => {
      if (zone.getPlayersInside().has(source)) {
        playerZones.push(zone);
      }
    });

    return playerZones;
  }

  /**
   * Get all players in zone
   * @param {string|number} zoneId
   * @returns {Array<number>}
   */
  getPlayersInZone(zoneId) {
    const zone = this.getZone(zoneId);
    if (!zone) return [];

    return Array.from(zone.getPlayersInside());
  }

  /**
   * Query zones near position
   * @param {number} x
   * @param {number} y
   * @param {number} range
   * @returns {Array<Zone>}
   */
  queryZones(x, y, range) {
    return this.spatial.query(x, y, range);
  }

  /**
   * Get all zones
   * @returns {Array<Zone>}
   */
  getAllZones() {
    return Array.from(this.zones.values());
  }

  /**
   * Clear all zones
   */
  clearAll() {
    this.zones.forEach(zone => zone.destroy());
    this.zones.clear();
    this.spatial.clear();
    this.stats.totalZones = 0;

    this.framework.log.info('All zones cleared');

    // Emit event
    this.framework.eventBus.emit('ZONES_CLEARED');
  }

  /**
   * Enable/disable zone
   * @param {string|number} zoneId
   * @param {boolean} enabled
   */
  setZoneEnabled(zoneId, enabled) {
    const zone = this.getZone(zoneId);
    if (!zone) return false;

    zone.enabled = enabled;
    this.framework.log.info(`Zone ${zone.name} ${enabled ? 'enabled' : 'disabled'}`);

    return true;
  }

  /**
   * Get performance statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      spatial: this.spatial.getStats(),
      updateInterval: this.updateInterval,
      maxChecksPerTick: this.maxChecksPerTick
    };
  }

  /**
   * Rebuild spatial partitioning (useful after many zone updates)
   */
  rebuildSpatial() {
    this.framework.log.info('Rebuilding spatial partitioning...');
    const startTime = Date.now();

    this.spatial.rebuild();

    const elapsed = Date.now() - startTime;
    this.framework.log.info(`Spatial partitioning rebuilt in ${elapsed}ms`);
  }

  /**
   * Export zones to JSON
   * @returns {string}
   */
  exportZones() {
    const zonesData = [];

    this.zones.forEach(zone => {
      const data = {
        id: zone.id,
        name: zone.name,
        type: zone.constructor.name.replace('Zone', '').toLowerCase(),
        data: zone.data,
        enabled: zone.enabled
      };

      // Add type-specific data
      if (zone.center) {
        data.center = zone.center;
      }
      if (zone.radius !== undefined) {
        data.radius = zone.radius;
      }
      if (zone.width !== undefined) {
        data.width = zone.width;
        data.height = zone.height;
      }
      if (zone.points) {
        data.points = zone.points;
      }
      if (zone.minZ !== undefined && zone.minZ !== -Infinity) {
        data.minZ = zone.minZ;
      }
      if (zone.maxZ !== undefined && zone.maxZ !== Infinity) {
        data.maxZ = zone.maxZ;
      }

      zonesData.push(data);
    });

    return JSON.stringify(zonesData, null, 2);
  }

  /**
   * Import zones from JSON
   * @param {string} json
   */
  importZones(json) {
    try {
      const zonesData = JSON.parse(json);

      for (let i = 0; i < zonesData.length; i++) {
        const zoneData = zonesData[i];
        this.create(zoneData.type, zoneData);
      }

      this.framework.log.info(`Imported ${zonesData.length} zones`);
    } catch (error) {
      this.framework.log.error(`Failed to import zones: ${error.message}`);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.stopUpdateLoop();
    this.clearAll();
    this.framework.log.info('Zone Manager Module destroyed');
  }
}

module.exports = ZoneManagerModule;
