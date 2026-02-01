/**
 * NextGen Framework - Entity Manager Module
 * Generic entity management system using State Bags
 */

class EntityManager {
  constructor(framework) {
    this.framework = framework;
    this.entities = new Map();
    this.entityIdCounter = 0;
  }

  /**
   * Initialize the entity manager module
   */
  async init() {
    this.framework.log.info('Entity Manager module initialized');
  }

  /**
   * Create a networked entity
   * @param {string} type - Entity type (vehicle, ped, object, etc.)
   * @param {Object} data - Entity creation data
   * @returns {Promise<*>}
   */
  async create(type, data = {}) {
    const entityId = this.generateEntityId();
    const entity = new Entity(entityId, type, data, this.framework);

    await entity.init();

    this.entities.set(entityId, entity);
    global.NextGenUtils.Log(`Entity ${entityId} (${type}) created`, 'info');

    return entity;
  }

  /**
   * Remove an entity
   * @param {string} entityId
   */
  async remove(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) {
      global.NextGenUtils.Log(`Entity ${entityId} not found in pool`, 'warn');
      return;
    }

    await entity.destroy();
    this.entities.delete(entityId);

    global.NextGenUtils.Log(`Entity ${entityId} removed from pool`, 'info');
  }

  /**
   * Get an entity by ID
   * @param {string} entityId
   * @returns {*}
   */
  get(entityId) {
    return this.entities.get(entityId);
  }

  /**
   * Get all entities
   * @returns {Map<string, *>}
   */
  getAll() {
    return this.entities;
  }

  /**
   * Get entities by type
   * @param {string} type
   * @returns {Array<*>}
   */
  getByType(type) {
    const results = [];
    for (const entity of this.entities.values()) {
      if (entity.type === type) {
        results.push(entity);
      }
    }
    return results;
  }

  /**
   * Find entities by predicate
   * @param {Function} predicate
   * @returns {Array<*>}
   */
  find(predicate) {
    const results = [];
    for (const entity of this.entities.values()) {
      if (predicate(entity)) {
        results.push(entity);
      }
    }
    return results;
  }

  /**
   * Get entity count
   * @returns {number}
   */
  count() {
    return this.entities.size;
  }

  /**
   * Execute callback for each entity
   * @param {Function} callback
   */
  forEach(callback) {
    this.entities.forEach(callback);
  }

  /**
   * Generate unique entity ID
   * @returns {string}
   */
  generateEntityId() {
    return `entity_${++this.entityIdCounter}_${Date.now()}`;
  }
}

/**
 * Entity class - represents a generic networked entity
 * Can be extended by plugins for custom entity types
 */
class Entity {
  constructor(entityId, type, data, framework) {
    this.id = entityId;
    this.type = type;
    this.framework = framework;
    this.data = data;

    // Network ID (set after entity is spawned)
    this.networkId = null;
    this.handle = null;

    // State bag
    this.stateBag = null;

    // Custom metadata (plugin-defined)
    this.metadata = {};
  }

  /**
   * Initialize entity
   */
  async init() {
    // Entities are typically spawned client-side
    // Server just manages the state and metadata
    global.NextGenUtils.Log(`Entity ${this.id} (${this.type}) initialized`, 'info');
  }

  /**
   * Destroy entity
   */
  async destroy() {
    // If entity has a network ID, delete it
    if (this.networkId && DoesEntityExist(NetworkGetEntityFromNetworkId(this.networkId))) {
      DeleteEntity(NetworkGetEntityFromNetworkId(this.networkId));
    }

    this.metadata = {};
    global.NextGenUtils.Log(`Entity ${this.id} destroyed`, 'info');
  }

  /**
   * Set the network ID of this entity
   * @param {number} networkId
   */
  setNetworkId(networkId) {
    this.networkId = networkId;
    this.handle = NetworkGetEntityFromNetworkId(networkId);

    // Get state bag for this entity
    if (this.handle) {
      this.stateBag = Entity.state[this.handle];
    }
  }

  /**
   * Get state bag value
   * @param {string} key
   * @returns {*}
   */
  getState(key) {
    if (!this.stateBag) return null;
    return this.stateBag[key];
  }

  /**
   * Set state bag value
   * @param {string} key
   * @param {*} value
   * @param {boolean} replicated
   */
  setState(key, value, replicated = true) {
    if (!this.stateBag) {
      global.NextGenUtils.Log(`Cannot set state on entity ${this.id}: no state bag`, 'warn');
      return;
    }
    this.stateBag.set(key, value, replicated);
  }

  /**
   * Get entity coordinates (if spawned)
   * @returns {number[]|null}
   */
  getCoords() {
    if (!this.handle || !DoesEntityExist(this.handle)) return null;
    return GetEntityCoords(this.handle);
  }

  /**
   * Set entity coordinates (if spawned)
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setCoords(x, y, z) {
    if (!this.handle || !DoesEntityExist(this.handle)) {
      global.NextGenUtils.Log(`Cannot set coords on entity ${this.id}: entity not spawned`, 'warn');
      return;
    }
    SetEntityCoords(this.handle, x, y, z, false, false, false, false);
  }

  /**
   * Get entity rotation (if spawned)
   * @returns {number[]|null}
   */
  getRotation() {
    if (!this.handle || !DoesEntityExist(this.handle)) return null;
    return GetEntityRotation(this.handle);
  }

  /**
   * Set entity rotation (if spawned)
   * @param {number} pitch
   * @param {number} roll
   * @param {number} yaw
   */
  setRotation(pitch, roll, yaw) {
    if (!this.handle || !DoesEntityExist(this.handle)) {
      global.NextGenUtils.Log(`Cannot set rotation on entity ${this.id}: entity not spawned`, 'warn');
      return;
    }
    SetEntityRotation(this.handle, pitch, roll, yaw, 2, true);
  }

  /**
   * Get entity heading (if spawned)
   * @returns {number|null}
   */
  getHeading() {
    if (!this.handle || !DoesEntityExist(this.handle)) return null;
    return GetEntityHeading(this.handle);
  }

  /**
   * Set entity heading (if spawned)
   * @param {number} heading
   */
  setHeading(heading) {
    if (!this.handle || !DoesEntityExist(this.handle)) {
      global.NextGenUtils.Log(`Cannot set heading on entity ${this.id}: entity not spawned`, 'warn');
      return;
    }
    SetEntityHeading(this.handle, heading);
  }

  /**
   * Check if entity exists
   * @returns {boolean}
   */
  exists() {
    return this.handle && DoesEntityExist(this.handle);
  }

  /**
   * Set metadata
   * @param {string} key
   * @param {*} value
   */
  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  /**
   * Get metadata
   * @param {string} key
   * @returns {*}
   */
  getMetadata(key) {
    return this.metadata[key];
  }

  /**
   * Check if has metadata
   * @param {string} key
   * @returns {boolean}
   */
  hasMetadata(key) {
    return key in this.metadata;
  }

  /**
   * Remove metadata
   * @param {string} key
   */
  removeMetadata(key) {
    delete this.metadata[key];
  }

  /**
   * Get all metadata
   * @returns {Object}
   */
  getAllMetadata() {
    return { ...this.metadata };
  }
}

module.exports = EntityManager;

// Self-register
global.Framework.register('entity-manager', new EntityManager(global.Framework), 10);
