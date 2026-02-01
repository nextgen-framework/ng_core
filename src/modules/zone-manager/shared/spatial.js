/**
 * NextGen Framework - Spatial Partitioning
 * Quadtree implementation for O(log n) zone lookup
 */

// FiveM shared scripts - ZoneMath is available globally

/**
 * Quadtree Node
 */
class QuadTreeNode {
  constructor(bounds, capacity, maxDepth, depth = 0) {
    this.bounds = bounds; // {minX, minY, maxX, maxY}
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;

    this.zones = [];
    this.divided = false;
    this.children = null;
  }

  /**
   * Insert zone into quadtree
   * @param {Zone} zone
   * @returns {boolean}
   */
  insert(zone) {
    const aabb = zone.getAABB();

    // Zone doesn't intersect this node
    if (!ZoneMath.aabbIntersects(aabb, this.bounds)) {
      return false;
    }

    // If not divided and under capacity, add here
    if (!this.divided && this.zones.length < this.capacity) {
      this.zones.push(zone);
      return true;
    }

    // Subdivide if needed
    if (!this.divided && this.depth < this.maxDepth) {
      this.subdivide();
    }

    // Try to insert in children
    if (this.divided) {
      let inserted = false;
      for (let i = 0; i < 4; i++) {
        if (this.children[i].insert(zone)) {
          inserted = true;
        }
      }
      return inserted;
    }

    // At max depth, add to this node even if over capacity
    this.zones.push(zone);
    return true;
  }

  /**
   * Subdivide node into 4 children
   */
  subdivide() {
    const { minX, minY, maxX, maxY } = this.bounds;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    this.children = [
      // Top-left
      new QuadTreeNode(
        { minX, minY, maxX: midX, maxY: midY },
        this.capacity,
        this.maxDepth,
        this.depth + 1
      ),
      // Top-right
      new QuadTreeNode(
        { minX: midX, minY, maxX, maxY: midY },
        this.capacity,
        this.maxDepth,
        this.depth + 1
      ),
      // Bottom-left
      new QuadTreeNode(
        { minX, minY: midY, maxX: midX, maxY },
        this.capacity,
        this.maxDepth,
        this.depth + 1
      ),
      // Bottom-right
      new QuadTreeNode(
        { minX: midX, minY: midY, maxX, maxY },
        this.capacity,
        this.maxDepth,
        this.depth + 1
      )
    ];

    // Move existing zones to children
    const oldZones = this.zones;
    this.zones = [];
    this.divided = true;

    for (let i = 0; i < oldZones.length; i++) {
      for (let j = 0; j < 4; j++) {
        this.children[j].insert(oldZones[i]);
      }
    }
  }

  /**
   * Query zones near a point
   * @param {number} x
   * @param {number} y
   * @param {number} range - Search radius
   * @param {Array} found - Accumulator array
   * @returns {Array<Zone>}
   */
  query(x, y, range, found = []) {
    // Create search bounds
    const searchBounds = {
      minX: x - range,
      minY: y - range,
      maxX: x + range,
      maxY: y + range
    };

    // Check if search area intersects this node
    if (!ZoneMath.aabbIntersects(searchBounds, this.bounds)) {
      return found;
    }

    // Add zones from this node
    for (let i = 0; i < this.zones.length; i++) {
      if (!found.includes(this.zones[i])) {
        found.push(this.zones[i]);
      }
    }

    // Query children
    if (this.divided) {
      for (let i = 0; i < 4; i++) {
        this.children[i].query(x, y, range, found);
      }
    }

    return found;
  }

  /**
   * Query zones in a rectangular area
   * @param {{minX, minY, maxX, maxY}} bounds
   * @param {Array} found - Accumulator array
   * @returns {Array<Zone>}
   */
  queryRect(bounds, found = []) {
    // Check if search area intersects this node
    if (!ZoneMath.aabbIntersects(bounds, this.bounds)) {
      return found;
    }

    // Add zones from this node
    for (let i = 0; i < this.zones.length; i++) {
      if (!found.includes(this.zones[i])) {
        found.push(this.zones[i]);
      }
    }

    // Query children
    if (this.divided) {
      for (let i = 0; i < 4; i++) {
        this.children[i].queryRect(bounds, found);
      }
    }

    return found;
  }

  /**
   * Remove a zone from the tree
   * @param {Zone} zone
   * @returns {boolean}
   */
  remove(zone) {
    const aabb = zone.getAABB();

    // Zone doesn't intersect this node
    if (!ZoneMath.aabbIntersects(aabb, this.bounds)) {
      return false;
    }

    // Try to remove from this node
    const index = this.zones.indexOf(zone);
    if (index > -1) {
      this.zones.splice(index, 1);
      return true;
    }

    // Try to remove from children
    if (this.divided) {
      let removed = false;
      for (let i = 0; i < 4; i++) {
        if (this.children[i].remove(zone)) {
          removed = true;
        }
      }
      return removed;
    }

    return false;
  }

  /**
   * Clear all zones from tree
   */
  clear() {
    this.zones = [];
    if (this.divided) {
      for (let i = 0; i < 4; i++) {
        this.children[i].clear();
      }
      this.children = null;
      this.divided = false;
    }
  }

  /**
   * Get total number of zones in tree
   * @returns {number}
   */
  count() {
    let total = this.zones.length;
    if (this.divided) {
      for (let i = 0; i < 4; i++) {
        total += this.children[i].count();
      }
    }
    return total;
  }

  /**
   * Get tree statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      depth: this.depth,
      zones: this.zones.length,
      divided: this.divided,
      nodes: 1
    };

    if (this.divided) {
      let childrenStats = {
        totalZones: 0,
        totalNodes: 0,
        maxDepth: this.depth
      };

      for (let i = 0; i < 4; i++) {
        const childStats = this.children[i].getStats();
        childrenStats.totalZones += childStats.zones;
        childrenStats.totalNodes += childStats.nodes;
        if (childStats.depth > childrenStats.maxDepth) {
          childrenStats.maxDepth = childStats.depth;
        }
      }

      stats.childrenZones = childrenStats.totalZones;
      stats.nodes += childrenStats.totalNodes;
      stats.maxDepth = childrenStats.maxDepth;
    }

    return stats;
  }
}

/**
 * Quadtree for spatial partitioning
 */
class QuadTree {
  constructor(bounds, options = {}) {
    this.bounds = bounds;
    this.capacity = options.capacity || 10;
    this.maxDepth = options.maxDepth || 8;

    this.root = new QuadTreeNode(bounds, this.capacity, this.maxDepth);
    this._zoneMap = new Map(); // For quick zone lookup by ID
  }

  /**
   * Insert zone into quadtree
   * @param {Zone} zone
   */
  insert(zone) {
    if (this.root.insert(zone)) {
      this._zoneMap.set(zone.id, zone);
      return true;
    }
    return false;
  }

  /**
   * Remove zone from quadtree
   * @param {Zone} zone
   */
  remove(zone) {
    if (this.root.remove(zone)) {
      this._zoneMap.delete(zone.id);
      return true;
    }
    return false;
  }

  /**
   * Get zone by ID
   * @param {string|number} id
   * @returns {Zone|null}
   */
  getZone(id) {
    return this._zoneMap.get(id) || null;
  }

  /**
   * Query zones near a point
   * @param {number} x
   * @param {number} y
   * @param {number} range - Search radius
   * @returns {Array<Zone>}
   */
  query(x, y, range) {
    return this.root.query(x, y, range);
  }

  /**
   * Query zones in a rectangular area
   * @param {{minX, minY, maxX, maxY}} bounds
   * @returns {Array<Zone>}
   */
  queryRect(bounds) {
    return this.root.queryRect(bounds);
  }

  /**
   * Update zone in quadtree (remove and re-insert)
   * @param {Zone} zone
   */
  update(zone) {
    this.remove(zone);
    this.insert(zone);
  }

  /**
   * Clear all zones
   */
  clear() {
    this.root.clear();
    this._zoneMap.clear();
  }

  /**
   * Get all zones
   * @returns {Array<Zone>}
   */
  getAllZones() {
    return Array.from(this._zoneMap.values());
  }

  /**
   * Get number of zones
   * @returns {number}
   */
  count() {
    return this._zoneMap.size;
  }

  /**
   * Rebuild tree (useful after many updates)
   */
  rebuild() {
    const zones = this.getAllZones();
    this.clear();
    for (let i = 0; i < zones.length; i++) {
      this.insert(zones[i]);
    }
  }

  /**
   * Get tree statistics
   * @returns {Object}
   */
  getStats() {
    const rootStats = this.root.getStats();
    return {
      totalZones: this.count(),
      ...rootStats,
      bounds: this.bounds,
      capacity: this.capacity,
      maxDepth: this.maxDepth
    };
  }
}

/**
 * Grid-based spatial partitioning (simpler, faster for uniform distributions)
 */
class SpatialGrid {
  constructor(bounds, cellSize) {
    this.bounds = bounds;
    this.cellSize = cellSize;

    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
    this.rows = Math.ceil((bounds.maxY - bounds.minY) / cellSize);

    this.grid = new Map();
    this._zoneMap = new Map();
  }

  /**
   * Get cell key for coordinates
   * @param {number} x
   * @param {number} y
   * @returns {string}
   */
  _getCellKey(x, y) {
    const col = Math.floor((x - this.bounds.minX) / this.cellSize);
    const row = Math.floor((y - this.bounds.minY) / this.cellSize);
    return `${col},${row}`;
  }

  /**
   * Get all cell keys that AABB overlaps
   * @param {{minX, minY, maxX, maxY}} aabb
   * @returns {Array<string>}
   */
  _getCellKeys(aabb) {
    const minCol = Math.floor((aabb.minX - this.bounds.minX) / this.cellSize);
    const minRow = Math.floor((aabb.minY - this.bounds.minY) / this.cellSize);
    const maxCol = Math.floor((aabb.maxX - this.bounds.minX) / this.cellSize);
    const maxRow = Math.floor((aabb.maxY - this.bounds.minY) / this.cellSize);

    const keys = [];
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        keys.push(`${col},${row}`);
      }
    }
    return keys;
  }

  /**
   * Insert zone into grid
   * @param {Zone} zone
   */
  insert(zone) {
    const aabb = zone.getAABB();
    const keys = this._getCellKeys(aabb);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!this.grid.has(key)) {
        this.grid.set(key, new Set());
      }
      this.grid.get(key).add(zone);
    }

    this._zoneMap.set(zone.id, { zone, keys });
  }

  /**
   * Remove zone from grid
   * @param {Zone} zone
   */
  remove(zone) {
    const data = this._zoneMap.get(zone.id);
    if (!data) return false;

    for (let i = 0; i < data.keys.length; i++) {
      const cell = this.grid.get(data.keys[i]);
      if (cell) {
        cell.delete(zone);
        if (cell.size === 0) {
          this.grid.delete(data.keys[i]);
        }
      }
    }

    this._zoneMap.delete(zone.id);
    return true;
  }

  /**
   * Query zones near a point
   * @param {number} x
   * @param {number} y
   * @param {number} range
   * @returns {Array<Zone>}
   */
  query(x, y, range) {
    const searchBounds = {
      minX: x - range,
      minY: y - range,
      maxX: x + range,
      maxY: y + range
    };

    const keys = this._getCellKeys(searchBounds);
    const found = new Set();

    for (let i = 0; i < keys.length; i++) {
      const cell = this.grid.get(keys[i]);
      if (cell) {
        cell.forEach(zone => found.add(zone));
      }
    }

    return Array.from(found);
  }

  /**
   * Get zone by ID
   * @param {string|number} id
   * @returns {Zone|null}
   */
  getZone(id) {
    const data = this._zoneMap.get(id);
    return data ? data.zone : null;
  }

  /**
   * Update zone
   * @param {Zone} zone
   */
  update(zone) {
    this.remove(zone);
    this.insert(zone);
  }

  /**
   * Clear all zones
   */
  clear() {
    this.grid.clear();
    this._zoneMap.clear();
  }

  /**
   * Get all zones
   * @returns {Array<Zone>}
   */
  getAllZones() {
    return Array.from(this._zoneMap.values()).map(d => d.zone);
  }

  /**
   * Get number of zones
   * @returns {number}
   */
  count() {
    return this._zoneMap.size;
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    let totalCells = 0;
    let usedCells = 0;
    let maxZonesPerCell = 0;
    let totalZonesInCells = 0;

    totalCells = this.cols * this.rows;
    usedCells = this.grid.size;

    this.grid.forEach(cell => {
      const size = cell.size;
      totalZonesInCells += size;
      if (size > maxZonesPerCell) {
        maxZonesPerCell = size;
      }
    });

    return {
      totalZones: this.count(),
      totalCells,
      usedCells,
      cellSize: this.cellSize,
      maxZonesPerCell,
      avgZonesPerCell: usedCells > 0 ? totalZonesInCells / usedCells : 0
    };
  }
}

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QuadTree,
    QuadTreeNode,
    SpatialGrid
  };
}

// Export for FiveM shared scripts (global scope)
if (typeof global !== 'undefined') {
  global.QuadTree = QuadTree;
  global.QuadTreeNode = QuadTreeNode;
  global.SpatialGrid = SpatialGrid;
}
