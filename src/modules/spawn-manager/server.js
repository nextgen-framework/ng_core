/**
 * NextGen Framework - Spawn Manager Module
 * Manages player spawn points and spawn logic
 */

class SpawnManager {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;
    this.playerManager = null;
    this.zoneManager = null;

    // Spawn points registry
    this.spawnPoints = new Map(); // spawnId => SpawnPoint
    this.spawnCategories = new Map(); // category => Set(spawnIds)

    // Player spawn tracking
    this.playerSpawns = new Map(); // source => last spawn location

    // Configuration
    this.config = {
      defaultCategory: 'default',
      enableLastPosition: true,
      lastPositionTimeout: 300000, // 5 minutes - save last position if player was online recently
      enableSpawnSelection: true,
      spawnFadeIn: true,
      spawnFadeDuration: 1500
    };

    // Default spawn points
    this.defaultSpawns = [
      {
        id: 'legion_square',
        name: 'Legion Square',
        category: 'default',
        coords: { x: 195.52, y: -933.38, z: 30.69, heading: 140.0 },
        metadata: {}
      },
      {
        id: 'sandy_shores',
        name: 'Sandy Shores',
        category: 'default',
        coords: { x: 1836.42, y: 3673.61, z: 34.28, heading: 210.0 },
        metadata: {}
      },
      {
        id: 'paleto_bay',
        name: 'Paleto Bay',
        category: 'default',
        coords: { x: -248.49, y: 6331.18, z: 32.43, heading: 45.0 },
        metadata: {}
      }
    ];
  }

  /**
   * Initialize spawn manager module
   */
  async init() {
    this.logger = this.framework.getModule('logger');
    this.playerManager = this.framework.getModule('player-manager');
    this.zoneManager = this.framework.getModule('zone-manager');

    // Register default spawn points
    this.registerDefaultSpawns();

    // Load custom spawn points from database
    await this.loadSpawnPoints();

    // Handle player spawn
    on('playerJoining', () => {
      setTimeout(() => this.handlePlayerSpawn(source), 1000);
    });

    // Save last position on disconnect
    on('playerDropped', () => {
      this.saveLastPosition(source);
    });

    // RPC handlers
    if (this.framework.rpc) {
      this.framework.rpc.register('spawn:getAvailableSpawns', this.getAvailableSpawnsForPlayer.bind(this));
      this.framework.rpc.register('spawn:selectSpawn', this.selectSpawn.bind(this));
    }

    this.log(`Spawn manager initialized with ${this.spawnPoints.size} spawn points`, 'info');
  }

  /**
   * Register default spawn points
   */
  registerDefaultSpawns() {
    for (const spawn of this.defaultSpawns) {
      this.registerSpawnPoint(
        spawn.id,
        spawn.name,
        spawn.coords,
        spawn.category,
        spawn.metadata
      );
    }
  }

  /**
   * Register a spawn point
   */
  registerSpawnPoint(id, name, coords, category = 'default', metadata = {}) {
    const spawnPoint = {
      id,
      name,
      coords, // { x, y, z, heading }
      category,
      metadata,
      enabled: true
    };

    this.spawnPoints.set(id, spawnPoint);

    // Add to category
    if (!this.spawnCategories.has(category)) {
      this.spawnCategories.set(category, new Set());
    }
    this.spawnCategories.get(category).add(id);

    this.log(`Registered spawn point: ${name} (${id})`, 'debug');

    return spawnPoint;
  }

  /**
   * Unregister spawn point
   */
  unregisterSpawnPoint(id) {
    const spawn = this.spawnPoints.get(id);
    if (!spawn) return false;

    // Remove from category
    const category = this.spawnCategories.get(spawn.category);
    if (category) {
      category.delete(id);
    }

    this.spawnPoints.delete(id);
    this.log(`Unregistered spawn point: ${id}`, 'debug');

    return true;
  }

  /**
   * Get spawn point by ID
   */
  getSpawnPoint(id) {
    return this.spawnPoints.get(id) || null;
  }

  /**
   * Get all spawn points
   */
  getAllSpawnPoints() {
    return Array.from(this.spawnPoints.values());
  }

  /**
   * Get spawn points by category
   */
  getSpawnPointsByCategory(category) {
    const spawnIds = this.spawnCategories.get(category);
    if (!spawnIds) return [];

    return Array.from(spawnIds)
      .map(id => this.spawnPoints.get(id))
      .filter(spawn => spawn && spawn.enabled);
  }

  /**
   * Handle player spawn
   */
  async handlePlayerSpawn(source) {
    // Check if player should spawn at last position
    if (this.config.enableLastPosition) {
      const lastPos = await this.getLastPosition(source);
      if (lastPos) {
        this.spawnPlayerAt(source, lastPos.coords);
        this.log(`Player ${source} spawned at last position`, 'debug');
        return;
      }
    }

    // If spawn selection is enabled, send available spawns to client
    if (this.config.enableSpawnSelection) {
      const availableSpawns = await this.getAvailableSpawnsForPlayer(source);
      emitNet('ng_core:spawn-select', source, availableSpawns);
    } else {
      // Spawn at default location
      const defaultSpawn = this.getDefaultSpawn();
      this.spawnPlayerAt(source, defaultSpawn.coords);
    }
  }

  /**
   * Get available spawn points for player
   */
  async getAvailableSpawnsForPlayer(source) {
    const spawns = [];

    // Get all enabled spawn points
    for (const spawn of this.spawnPoints.values()) {
      if (!spawn.enabled) continue;

      // Check if player has permission (can be extended by plugins)
      const hasPermission = await this.checkSpawnPermission(source, spawn);
      if (!hasPermission) continue;

      spawns.push({
        id: spawn.id,
        name: spawn.name,
        category: spawn.category,
        coords: spawn.coords
      });
    }

    return spawns;
  }

  /**
   * Check if player has permission to use spawn point
   */
  async checkSpawnPermission(source, spawn) {
    // Default: all players can use default spawns
    if (spawn.category === 'default') return true;

    // Can be extended by plugins via framework hooks
    const result = await this.framework.runHook(
      'spawn:checkPermission',
      source,
      spawn
    );

    // If any hook returns false, deny permission
    if (result && result.some(r => r === false)) {
      return false;
    }

    return true;
  }

  /**
   * Select spawn point
   */
  async selectSpawn(source, spawnId) {
    const spawn = this.spawnPoints.get(spawnId);

    if (!spawn || !spawn.enabled) {
      return { success: false, reason: 'invalid_spawn' };
    }

    // Check permission
    const hasPermission = await this.checkSpawnPermission(source, spawn);
    if (!hasPermission) {
      return { success: false, reason: 'no_permission' };
    }

    // Spawn player
    this.spawnPlayerAt(source, spawn.coords);

    return { success: true };
  }

  /**
   * Spawn player at coordinates
   */
  spawnPlayerAt(source, coords) {
    // Send spawn command to client
    emitNet('ng_core:spawn-at', source, coords, {
      fadeIn: this.config.spawnFadeIn,
      fadeDuration: this.config.spawnFadeDuration
    });

    // Track spawn
    this.playerSpawns.set(source, {
      coords,
      timestamp: Date.now()
    });

    this.log(`Player ${source} spawned at (${coords.x}, ${coords.y}, ${coords.z})`, 'debug');
  }

  /**
   * Get default spawn point
   */
  getDefaultSpawn() {
    const defaultSpawns = this.getSpawnPointsByCategory(this.config.defaultCategory);

    if (defaultSpawns.length === 0) {
      // Fallback to any spawn
      const allSpawns = this.getAllSpawnPoints();
      return allSpawns[0] || {
        coords: { x: 0, y: 0, z: 72, heading: 0 }
      };
    }

    // Random default spawn
    return defaultSpawns[Math.floor(Math.random() * defaultSpawns.length)];
  }

  /**
   * Get player's last position from database
   */
  async getLastPosition(source) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) return null;

      const identifier = player.getIdentifier('license');
      if (!identifier) return null;

      const result = await this.db.query(
        'SELECT x, y, z, heading, updated_at FROM player_positions WHERE identifier = ?',
        [identifier]
      );

      if (result.length === 0) return null;

      const pos = result[0];
      const lastUpdate = new Date(pos.updated_at).getTime();
      const timeSinceUpdate = Date.now() - lastUpdate;

      // Only use last position if player was online recently
      if (timeSinceUpdate > this.config.lastPositionTimeout) {
        return null;
      }

      return {
        coords: {
          x: pos.x,
          y: pos.y,
          z: pos.z,
          heading: pos.heading || 0
        }
      };
    } catch (error) {
      this.log(`Failed to get last position: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Save player's last position
   */
  async saveLastPosition(source) {
    try {
      const player = this.playerManager ? this.playerManager.get(source) : null;
      if (!player) return;

      const identifier = player.getIdentifier('license');
      if (!identifier) return;

      const ped = GetPlayerPed(source);
      const coords = GetEntityCoords(ped);
      const heading = GetEntityHeading(ped);

      await this.db.execute(
        'INSERT INTO player_positions (identifier, x, y, z, heading, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, NOW()) ' +
        'ON DUPLICATE KEY UPDATE x = ?, y = ?, z = ?, heading = ?, updated_at = NOW()',
        [identifier, coords[0], coords[1], coords[2], heading, coords[0], coords[1], coords[2], heading]
      );

      this.log(`Saved last position for player ${source}`, 'debug');
    } catch (error) {
      this.log(`Failed to save last position: ${error.message}`, 'error');
    }
  }

  /**
   * Load spawn points from database
   */
  async loadSpawnPoints() {
    try {
      const spawns = await this.db.query('SELECT * FROM spawn_points WHERE enabled = 1');

      for (const spawn of spawns) {
        this.registerSpawnPoint(
          spawn.id,
          spawn.name,
          {
            x: spawn.x,
            y: spawn.y,
            z: spawn.z,
            heading: spawn.heading
          },
          spawn.category,
          typeof spawn.metadata === 'string' ? JSON.parse(spawn.metadata) : spawn.metadata
        );
      }

      this.log(`Loaded ${spawns.length} spawn points from database`, 'debug');
    } catch (error) {
      this.log(`Failed to load spawn points: ${error.message}`, 'warn');
    }
  }

  /**
   * Save spawn point to database
   */
  async saveSpawnPoint(spawnPoint) {
    try {
      await this.db.execute(
        'INSERT INTO spawn_points (id, name, category, x, y, z, heading, metadata, enabled) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE name = ?, category = ?, x = ?, y = ?, z = ?, heading = ?, metadata = ?, enabled = ?',
        [
          spawnPoint.id,
          spawnPoint.name,
          spawnPoint.category,
          spawnPoint.coords.x,
          spawnPoint.coords.y,
          spawnPoint.coords.z,
          spawnPoint.coords.heading,
          JSON.stringify(spawnPoint.metadata),
          spawnPoint.enabled ? 1 : 0,
          spawnPoint.name,
          spawnPoint.category,
          spawnPoint.coords.x,
          spawnPoint.coords.y,
          spawnPoint.coords.z,
          spawnPoint.coords.heading,
          JSON.stringify(spawnPoint.metadata),
          spawnPoint.enabled ? 1 : 0
        ]
      );

      return { success: true };
    } catch (error) {
      this.log(`Failed to save spawn point: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Configure spawn manager
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.log('Spawn manager configuration updated', 'info');
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.utils.Log(`[Spawn Manager] ${message}`, level);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    // Save all player positions
    const players = GetPlayers();
    for (const source of players) {
      await this.saveLastPosition(parseInt(source));
    }

    this.spawnPoints.clear();
    this.spawnCategories.clear();
    this.playerSpawns.clear();

    this.log('Spawn manager module destroyed', 'info');
  }
}

module.exports = SpawnManager;
