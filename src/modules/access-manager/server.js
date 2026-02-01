/**
 * NextGen Framework - Access Manager Module
 * Handles doors, vehicle keys, container access, and generic permissions
 */

class AccessManager {
  constructor(framework) {
    this.framework = framework;
    this.db = null;
    this.logger = null;

    // In-memory access caches for fast lookups
    this.vehicleKeys = new Map(); // vehicleId => Set(identifiers)
    this.doorStates = new Map(); // doorId => { locked: boolean, owner: identifier }
    this.containerAccess = new Map(); // containerId => Set(identifiers)
    this.propertyKeys = new Map(); // propertyId => Set(identifiers)

    // Generic access permissions
    this.accessPermissions = new Map(); // `type:id` => Set(identifiers)

    // Configuration
    this.config = {
      enableDoors: true,
      enableVehicles: true,
      enableContainers: true,
      enableProperties: true,
      defaultLockState: true, // Doors locked by default
      maxKeysPerVehicle: 5,
      maxKeysPerProperty: 10,
      keyExpirationDays: 0 // 0 = never expire
    };
  }

  /**
   * Initialize access manager module
   */
  async init() {
    this.logger = this.framework.getModule('logger');
    this.db = this.framework.getModule('database');

    // Load all access data from database
    await this.loadVehicleKeys();
    await this.loadDoorStates();
    await this.loadContainerAccess();
    await this.loadPropertyKeys();
    await this.loadGenericAccess();

    this.log('Access manager module initialized', 'info', {
      vehicles: this.vehicleKeys.size,
      doors: this.doorStates.size,
      containers: this.containerAccess.size,
      properties: this.propertyKeys.size
    });
  }

  // ================================
  // Vehicle Keys Management
  // ================================

  /**
   * Load vehicle keys from database
   */
  async loadVehicleKeys() {
    try {
      const keys = await this.db.query('SELECT vehicle_id, identifier FROM vehicle_keys WHERE expires_at IS NULL OR expires_at > NOW()');

      this.vehicleKeys.clear();
      for (const key of keys) {
        if (!this.vehicleKeys.has(key.vehicle_id)) {
          this.vehicleKeys.set(key.vehicle_id, new Set());
        }
        this.vehicleKeys.get(key.vehicle_id).add(key.identifier);
      }

      this.log(`Loaded ${keys.length} vehicle keys`, 'debug');
    } catch (error) {
      this.log(`Failed to load vehicle keys: ${error.message}`, 'error');
    }
  }

  /**
   * Give vehicle key to player
   */
  async giveVehicleKey(vehicleId, identifier, grantedBy = 'system', permanent = true) {
    try {
      // Check max keys limit
      const currentKeys = this.vehicleKeys.get(vehicleId);
      if (currentKeys && currentKeys.size >= this.config.maxKeysPerVehicle) {
        return { success: false, reason: 'max_keys_reached' };
      }

      const expiresAt = permanent ? null : new Date(Date.now() + (this.config.keyExpirationDays * 24 * 60 * 60 * 1000));

      await this.db.execute(
        'INSERT INTO vehicle_keys (vehicle_id, identifier, granted_by, granted_at, expires_at) VALUES (?, ?, ?, NOW(), ?)',
        [vehicleId, identifier, grantedBy, expiresAt]
      );

      // Update cache
      if (!this.vehicleKeys.has(vehicleId)) {
        this.vehicleKeys.set(vehicleId, new Set());
      }
      this.vehicleKeys.get(vehicleId).add(identifier);

      this.log(`Granted vehicle key: ${vehicleId} to ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, reason: 'already_has_key' };
      }
      this.log(`Failed to give vehicle key: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Remove vehicle key from player
   */
  async removeVehicleKey(vehicleId, identifier) {
    try {
      const result = await this.db.execute(
        'DELETE FROM vehicle_keys WHERE vehicle_id = ? AND identifier = ?',
        [vehicleId, identifier]
      );

      if (result.affectedRows === 0) {
        return { success: false, reason: 'key_not_found' };
      }

      // Update cache
      const keys = this.vehicleKeys.get(vehicleId);
      if (keys) {
        keys.delete(identifier);
        if (keys.size === 0) {
          this.vehicleKeys.delete(vehicleId);
        }
      }

      this.log(`Removed vehicle key: ${vehicleId} from ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      this.log(`Failed to remove vehicle key: ${error.message}`, 'error');
      return { success: false, reason: 'database_error', error: error.message };
    }
  }

  /**
   * Check if player has vehicle key
   */
  hasVehicleKey(vehicleId, identifier) {
    const keys = this.vehicleKeys.get(vehicleId);
    return keys ? keys.has(identifier) : false;
  }

  /**
   * Get all vehicle keys for a player
   */
  getPlayerVehicleKeys(identifier) {
    const playerKeys = [];
    for (const [vehicleId, keys] of this.vehicleKeys.entries()) {
      if (keys.has(identifier)) {
        playerKeys.push(vehicleId);
      }
    }
    return playerKeys;
  }

  /**
   * Get all key holders for a vehicle
   */
  getVehicleKeyHolders(vehicleId) {
    const keys = this.vehicleKeys.get(vehicleId);
    return keys ? Array.from(keys) : [];
  }

  // ================================
  // Door Lock Management
  // ================================

  /**
   * Load door states from database
   */
  async loadDoorStates() {
    try {
      const doors = await this.db.query('SELECT door_id, locked, owner FROM door_states');

      this.doorStates.clear();
      for (const door of doors) {
        this.doorStates.set(door.door_id, {
          locked: door.locked === 1,
          owner: door.owner
        });
      }

      this.log(`Loaded ${doors.length} door states`, 'debug');
    } catch (error) {
      this.log(`Failed to load door states: ${error.message}`, 'error');
    }
  }

  /**
   * Register a door
   */
  async registerDoor(doorId, owner, locked = true) {
    try {
      await this.db.execute(
        'INSERT INTO door_states (door_id, locked, owner, created_at) VALUES (?, ?, ?, NOW()) ' +
        'ON DUPLICATE KEY UPDATE locked = ?, owner = ?',
        [doorId, locked, owner, locked, owner]
      );

      this.doorStates.set(doorId, { locked, owner });

      this.log(`Registered door: ${doorId}`, 'debug');
      return { success: true };
    } catch (error) {
      this.log(`Failed to register door: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle door lock state
   */
  async toggleDoorLock(doorId, identifier) {
    const doorState = this.doorStates.get(doorId);

    if (!doorState) {
      return { success: false, reason: 'door_not_found' };
    }

    // Check if player has access
    if (doorState.owner !== identifier && !await this.hasAccess('door', doorId, identifier)) {
      return { success: false, reason: 'access_denied' };
    }

    const newState = !doorState.locked;

    try {
      await this.db.execute(
        'UPDATE door_states SET locked = ?, last_toggled_at = NOW(), last_toggled_by = ? WHERE door_id = ?',
        [newState, identifier, doorId]
      );

      doorState.locked = newState;

      this.log(`Door ${doorId} ${newState ? 'locked' : 'unlocked'} by ${identifier}`, 'debug');

      // Sync to all clients
      this.framework.fivem.emitNet('ng_core:door-state-changed', -1, doorId, newState);

      return { success: true, locked: newState };
    } catch (error) {
      this.log(`Failed to toggle door: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get door state
   */
  getDoorState(doorId) {
    return this.doorStates.get(doorId) || { locked: this.config.defaultLockState, owner: null };
  }

  /**
   * Check if door is locked
   */
  isDoorLocked(doorId) {
    const state = this.doorStates.get(doorId);
    return state ? state.locked : this.config.defaultLockState;
  }

  // ================================
  // Container Access Management
  // ================================

  /**
   * Load container access from database
   */
  async loadContainerAccess() {
    try {
      const access = await this.db.query('SELECT container_id, identifier FROM container_access');

      this.containerAccess.clear();
      for (const entry of access) {
        if (!this.containerAccess.has(entry.container_id)) {
          this.containerAccess.set(entry.container_id, new Set());
        }
        this.containerAccess.get(entry.container_id).add(entry.identifier);
      }

      this.log(`Loaded ${access.length} container access entries`, 'debug');
    } catch (error) {
      this.log(`Failed to load container access: ${error.message}`, 'error');
    }
  }

  /**
   * Grant container access to player
   */
  async grantContainerAccess(containerId, identifier, grantedBy = 'system') {
    try {
      await this.db.execute(
        'INSERT INTO container_access (container_id, identifier, granted_by, granted_at) VALUES (?, ?, ?, NOW())',
        [containerId, identifier, grantedBy]
      );

      if (!this.containerAccess.has(containerId)) {
        this.containerAccess.set(containerId, new Set());
      }
      this.containerAccess.get(containerId).add(identifier);

      this.log(`Granted container access: ${containerId} to ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, reason: 'already_has_access' };
      }
      this.log(`Failed to grant container access: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke container access from player
   */
  async revokeContainerAccess(containerId, identifier) {
    try {
      const result = await this.db.execute(
        'DELETE FROM container_access WHERE container_id = ? AND identifier = ?',
        [containerId, identifier]
      );

      if (result.affectedRows === 0) {
        return { success: false, reason: 'access_not_found' };
      }

      const access = this.containerAccess.get(containerId);
      if (access) {
        access.delete(identifier);
        if (access.size === 0) {
          this.containerAccess.delete(containerId);
        }
      }

      this.log(`Revoked container access: ${containerId} from ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      this.log(`Failed to revoke container access: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if player has container access
   */
  hasContainerAccess(containerId, identifier) {
    const access = this.containerAccess.get(containerId);
    return access ? access.has(identifier) : false;
  }

  // ================================
  // Property Keys Management
  // ================================

  /**
   * Load property keys from database
   */
  async loadPropertyKeys() {
    try {
      const keys = await this.db.query('SELECT property_id, identifier FROM property_keys WHERE expires_at IS NULL OR expires_at > NOW()');

      this.propertyKeys.clear();
      for (const key of keys) {
        if (!this.propertyKeys.has(key.property_id)) {
          this.propertyKeys.set(key.property_id, new Set());
        }
        this.propertyKeys.get(key.property_id).add(key.identifier);
      }

      this.log(`Loaded ${keys.length} property keys`, 'debug');
    } catch (error) {
      this.log(`Failed to load property keys: ${error.message}`, 'error');
    }
  }

  /**
   * Give property key to player
   */
  async givePropertyKey(propertyId, identifier, grantedBy = 'system', permanent = true) {
    try {
      // Check max keys limit
      const currentKeys = this.propertyKeys.get(propertyId);
      if (currentKeys && currentKeys.size >= this.config.maxKeysPerProperty) {
        return { success: false, reason: 'max_keys_reached' };
      }

      const expiresAt = permanent ? null : new Date(Date.now() + (this.config.keyExpirationDays * 24 * 60 * 60 * 1000));

      await this.db.execute(
        'INSERT INTO property_keys (property_id, identifier, granted_by, granted_at, expires_at) VALUES (?, ?, ?, NOW(), ?)',
        [propertyId, identifier, grantedBy, expiresAt]
      );

      if (!this.propertyKeys.has(propertyId)) {
        this.propertyKeys.set(propertyId, new Set());
      }
      this.propertyKeys.get(propertyId).add(identifier);

      this.log(`Granted property key: ${propertyId} to ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, reason: 'already_has_key' };
      }
      this.log(`Failed to give property key: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove property key from player
   */
  async removePropertyKey(propertyId, identifier) {
    try {
      const result = await this.db.execute(
        'DELETE FROM property_keys WHERE property_id = ? AND identifier = ?',
        [propertyId, identifier]
      );

      if (result.affectedRows === 0) {
        return { success: false, reason: 'key_not_found' };
      }

      const keys = this.propertyKeys.get(propertyId);
      if (keys) {
        keys.delete(identifier);
        if (keys.size === 0) {
          this.propertyKeys.delete(propertyId);
        }
      }

      this.log(`Removed property key: ${propertyId} from ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      this.log(`Failed to remove property key: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if player has property key
   */
  hasPropertyKey(propertyId, identifier) {
    const keys = this.propertyKeys.get(propertyId);
    return keys ? keys.has(identifier) : false;
  }

  // ================================
  // Generic Access Management
  // ================================

  /**
   * Load generic access permissions from database
   */
  async loadGenericAccess() {
    try {
      const access = await this.db.query('SELECT access_type, resource_id, identifier FROM generic_access');

      this.accessPermissions.clear();
      for (const entry of access) {
        const key = `${entry.access_type}:${entry.resource_id}`;
        if (!this.accessPermissions.has(key)) {
          this.accessPermissions.set(key, new Set());
        }
        this.accessPermissions.get(key).add(entry.identifier);
      }

      this.log(`Loaded ${access.length} generic access entries`, 'debug');
    } catch (error) {
      this.log(`Failed to load generic access: ${error.message}`, 'error');
    }
  }

  /**
   * Grant generic access permission
   */
  async grantAccess(accessType, resourceId, identifier, grantedBy = 'system', metadata = {}) {
    try {
      await this.db.execute(
        'INSERT INTO generic_access (access_type, resource_id, identifier, granted_by, granted_at, metadata) VALUES (?, ?, ?, ?, NOW(), ?)',
        [accessType, resourceId, identifier, grantedBy, JSON.stringify(metadata)]
      );

      const key = `${accessType}:${resourceId}`;
      if (!this.accessPermissions.has(key)) {
        this.accessPermissions.set(key, new Set());
      }
      this.accessPermissions.get(key).add(identifier);

      this.log(`Granted access: ${accessType}:${resourceId} to ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, reason: 'already_has_access' };
      }
      this.log(`Failed to grant access: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke generic access permission
   */
  async revokeAccess(accessType, resourceId, identifier) {
    try {
      const result = await this.db.execute(
        'DELETE FROM generic_access WHERE access_type = ? AND resource_id = ? AND identifier = ?',
        [accessType, resourceId, identifier]
      );

      if (result.affectedRows === 0) {
        return { success: false, reason: 'access_not_found' };
      }

      const key = `${accessType}:${resourceId}`;
      const access = this.accessPermissions.get(key);
      if (access) {
        access.delete(identifier);
        if (access.size === 0) {
          this.accessPermissions.delete(key);
        }
      }

      this.log(`Revoked access: ${accessType}:${resourceId} from ${identifier}`, 'info');

      return { success: true };
    } catch (error) {
      this.log(`Failed to revoke access: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if player has generic access
   */
  hasAccess(accessType, resourceId, identifier) {
    const key = `${accessType}:${resourceId}`;
    const access = this.accessPermissions.get(key);
    return access ? access.has(identifier) : false;
  }

  /**
   * Get all access entries for a player
   */
  getPlayerAccess(identifier) {
    const playerAccess = [];

    for (const [key, identifiers] of this.accessPermissions.entries()) {
      if (identifiers.has(identifier)) {
        const [accessType, resourceId] = key.split(':');
        playerAccess.push({ accessType, resourceId });
      }
    }

    return playerAccess;
  }

  // ================================
  // Utility Methods
  // ================================

  /**
   * Configure access manager
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.log('Access manager configuration updated', 'info');
  }

  /**
   * Reload all access data
   */
  async reload() {
    await this.loadVehicleKeys();
    await this.loadDoorStates();
    await this.loadContainerAccess();
    await this.loadPropertyKeys();
    await this.loadGenericAccess();
    this.log('Access manager data reloaded', 'info');
  }

  /**
   * Get access statistics
   */
  getStats() {
    return {
      vehicleKeys: this.vehicleKeys.size,
      doors: this.doorStates.size,
      containers: this.containerAccess.size,
      properties: this.propertyKeys.size,
      genericAccess: this.accessPermissions.size
    };
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.log[level](`[Access Manager] ${message}`);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.vehicleKeys.clear();
    this.doorStates.clear();
    this.containerAccess.clear();
    this.propertyKeys.clear();
    this.accessPermissions.clear();
    this.log('Access manager module destroyed', 'info');
  }
}

module.exports = AccessManager;

// Self-register
global.Framework.register('access-manager', new AccessManager(global.Framework), 11);
