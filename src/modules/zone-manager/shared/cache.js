/**
 * NextGen Framework - LRU Cache System
 * High-performance caching for zone queries
 */

/**
 * LRU Cache Entry
 */
class CacheEntry {
  constructor(value) {
    this.value = value;
    this.timestamp = Date.now();
    this.hitCount = 0;
    this.lastAccess = Date.now();
  }

  touch() {
    this.lastAccess = Date.now();
    this.hitCount++;
  }

  isExpired(maxAge) {
    return Date.now() - this.timestamp > maxAge;
  }
}

/**
 * LRU Cache with TTL support
 */
class LRUCache {
  constructor(maxSize = 1000, maxAge = 5000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge; // milliseconds
    this.cache = new Map();

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0
    };
  }

  /**
   * Get value from cache
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (entry.isExpired(this.maxAge)) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    entry.touch();
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    // Remove if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }

    this.cache.set(key, new CacheEntry(value));
  }

  /**
   * Check if key exists and not expired
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete key from cache
   * @param {string} key
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.expirations = 0;
  }

  /**
   * Get cache size
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const toDelete = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
      this.stats.expirations++;
    }

    return toDelete.length;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: (hitRate * 100).toFixed(2) + '%',
      evictions: this.stats.evictions,
      expirations: this.stats.expirations
    };
  }

  /**
   * Get top N most accessed entries
   * @param {number} n
   * @returns {Array}
   */
  getTopEntries(n = 10) {
    const entries = Array.from(this.cache.entries());

    return entries
      .map(([key, entry]) => ({
        key,
        hitCount: entry.hitCount,
        age: Date.now() - entry.timestamp
      }))
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, n);
  }
}

/**
 * Zone Query Cache
 * Specialized cache for zone queries with spatial awareness
 */
class ZoneQueryCache extends LRUCache {
  constructor(maxSize = 1000, maxAge = 500) {
    super(maxSize, maxAge);
    this.gridSize = 50; // Grid cell size for spatial bucketing
  }

  /**
   * Generate cache key for position query
   * @param {number} x
   * @param {number} y
   * @param {number} range
   * @returns {string}
   */
  _getQueryKey(x, y, range) {
    // Bucket positions into grid cells
    const gridX = Math.floor(x / this.gridSize);
    const gridY = Math.floor(y / this.gridSize);
    const gridRange = Math.ceil(range / this.gridSize);

    return `query_${gridX}_${gridY}_${gridRange}`;
  }

  /**
   * Get cached zones for position
   * @param {number} x
   * @param {number} y
   * @param {number} range
   * @returns {Array<Zone>|null}
   */
  getQuery(x, y, range) {
    const key = this._getQueryKey(x, y, range);
    return this.get(key);
  }

  /**
   * Cache zones for position
   * @param {number} x
   * @param {number} y
   * @param {number} range
   * @param {Array<Zone>} zones
   */
  setQuery(x, y, range, zones) {
    const key = this._getQueryKey(x, y, range);
    this.set(key, zones);
  }

  /**
   * Generate cache key for player-zone check
   * @param {number} playerId
   * @param {number|string} zoneId
   * @returns {string}
   */
  _getPlayerZoneKey(playerId, zoneId) {
    return `player_${playerId}_zone_${zoneId}`;
  }

  /**
   * Get cached player-zone state
   * @param {number} playerId
   * @param {number|string} zoneId
   * @returns {boolean|null}
   */
  getPlayerZoneState(playerId, zoneId) {
    const key = this._getPlayerZoneKey(playerId, zoneId);
    return this.get(key);
  }

  /**
   * Cache player-zone state
   * @param {number} playerId
   * @param {number|string} zoneId
   * @param {boolean} isInside
   */
  setPlayerZoneState(playerId, zoneId, isInside) {
    const key = this._getPlayerZoneKey(playerId, zoneId);
    this.set(key, isInside);
  }

  /**
   * Invalidate all cache entries for a zone
   * @param {number|string} zoneId
   */
  invalidateZone(zoneId) {
    const toDelete = [];

    for (const [key] of this.cache) {
      if (key.includes(`zone_${zoneId}`)) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }

    return toDelete.length;
  }

  /**
   * Invalidate all cache entries for a player
   * @param {number} playerId
   */
  invalidatePlayer(playerId) {
    const toDelete = [];

    for (const [key] of this.cache) {
      if (key.includes(`player_${playerId}`)) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }

    return toDelete.length;
  }
}

/**
 * Player Position Cache
 * Tracks player positions for delta detection
 */
class PlayerPositionCache {
  constructor() {
    this.positions = new Map();
    this.velocities = new Map();
  }

  /**
   * Update player position and calculate delta
   * @param {number} playerId
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {Object} {moved: boolean, distance: number, velocity: number}
   */
  update(playerId, x, y, z) {
    const lastPos = this.positions.get(playerId);
    const now = Date.now();

    if (!lastPos) {
      this.positions.set(playerId, { x, y, z, timestamp: now });
      return { moved: true, distance: 0, velocity: 0 };
    }

    // Calculate distance
    const dx = x - lastPos.x;
    const dy = y - lastPos.y;
    const dz = z - lastPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Calculate velocity (units per second)
    const deltaTime = (now - lastPos.timestamp) / 1000;
    const velocity = deltaTime > 0 ? distance / deltaTime : 0;

    // Update position
    this.positions.set(playerId, { x, y, z, timestamp: now });
    this.velocities.set(playerId, velocity);

    return {
      moved: distance > 0.1, // 10cm threshold
      distance,
      velocity
    };
  }

  /**
   * Get player velocity
   * @param {number} playerId
   * @returns {number}
   */
  getVelocity(playerId) {
    return this.velocities.get(playerId) || 0;
  }

  /**
   * Check if player moved significantly
   * @param {number} playerId
   * @param {number} x
   * @param {number} y
   * @param {number} threshold - Minimum distance to consider moved
   * @returns {boolean}
   */
  hasMovedSignificantly(playerId, x, y, threshold = 2.0) {
    const lastPos = this.positions.get(playerId);
    if (!lastPos) return true;

    const dx = x - lastPos.x;
    const dy = y - lastPos.y;
    const distSq = dx * dx + dy * dy;

    return distSq > threshold * threshold;
  }

  /**
   * Remove player from cache
   * @param {number} playerId
   */
  remove(playerId) {
    this.positions.delete(playerId);
    this.velocities.delete(playerId);
  }

  /**
   * Clear all positions
   */
  clear() {
    this.positions.clear();
    this.velocities.clear();
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    const velocities = Array.from(this.velocities.values());
    const avgVelocity = velocities.length > 0
      ? velocities.reduce((a, b) => a + b, 0) / velocities.length
      : 0;

    const maxVelocity = velocities.length > 0
      ? Math.max(...velocities)
      : 0;

    return {
      trackedPlayers: this.positions.size,
      avgVelocity: avgVelocity.toFixed(2),
      maxVelocity: maxVelocity.toFixed(2)
    };
  }
}

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LRUCache,
    ZoneQueryCache,
    PlayerPositionCache,
    CacheEntry
  };
}

// Export for FiveM shared scripts (global scope)
if (typeof global !== 'undefined') {
  global.LRUCache = LRUCache;
  global.ZoneQueryCache = ZoneQueryCache;
  global.PlayerPositionCache = PlayerPositionCache;
  global.CacheEntry = CacheEntry;
}
