/**
 * NextGen Framework - R-tree Implementation
 * High-performance R-tree for spatial indexing (O(log n))
 * Optimized for FiveM zone management
 */

// FiveM shared scripts - ZoneMath is available globally

/**
 * R-tree Node
 */
class RTreeNode {
  constructor(maxEntries = 9, minEntries = 4) {
    this.maxEntries = maxEntries;
    this.minEntries = minEntries;
    this.children = [];
    this.leaf = true;
    this.bbox = null;
    this.height = 1;
  }

  /**
   * Calculate bounding box of all children
   */
  calculateBBox() {
    if (this.children.length === 0) {
      this.bbox = null;
      return;
    }

    const first = this.children[0].bbox;
    this.bbox = {
      minX: first.minX,
      minY: first.minY,
      maxX: first.maxX,
      maxY: first.maxY
    };

    for (let i = 1; i < this.children.length; i++) {
      const bbox = this.children[i].bbox;
      if (bbox.minX < this.bbox.minX) this.bbox.minX = bbox.minX;
      if (bbox.minY < this.bbox.minY) this.bbox.minY = bbox.minY;
      if (bbox.maxX > this.bbox.maxX) this.bbox.maxX = bbox.maxX;
      if (bbox.maxY > this.bbox.maxY) this.bbox.maxY = bbox.maxY;
    }
  }
}

/**
 * R-tree Entry
 */
class RTreeEntry {
  constructor(zone) {
    this.zone = zone;
    this.bbox = zone.getAABB();
  }
}

/**
 * R-tree Implementation
 */
class RTree {
  constructor(maxEntries = 9) {
    this.maxEntries = Math.max(4, maxEntries);
    this.minEntries = Math.max(2, Math.ceil(this.maxEntries * 0.4));

    this.root = new RTreeNode(this.maxEntries, this.minEntries);
    this.data = new Map(); // zoneId -> entry for O(1) access

    this._insertPath = [];
  }

  /**
   * Insert zone into R-tree
   * @param {Zone} zone
   */
  insert(zone) {
    const entry = new RTreeEntry(zone);
    this.data.set(zone.id, entry);

    this._insert(entry, this.root.height - 1);

    return this;
  }

  /**
   * Internal insert
   */
  _insert(entry, level) {
    const bbox = entry.bbox;
    const insertPath = this._insertPath;

    // Find the best node to insert into
    let node = this._chooseSubtree(bbox, this.root, level, insertPath);

    node.children.push(entry);
    node.calculateBBox();

    // Split if necessary
    while (level >= 0) {
      if (insertPath[level].children.length > this.maxEntries) {
        this._split(insertPath, level);
        level--;
      } else break;
    }

    // Adjust bounding boxes
    this._adjustParentBBoxes(bbox, insertPath, level);

    insertPath.length = 0;
  }

  /**
   * Choose best subtree to insert into (minimize area enlargement)
   */
  _chooseSubtree(bbox, node, level, path) {
    while (true) {
      path.push(node);

      if (node.leaf || path.length - 1 === level) break;

      let minArea = Infinity;
      let minEnlargement = Infinity;
      let targetNode = null;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const area = this._bboxArea(child.bbox);
        const enlargement = this._enlargedArea(bbox, child.bbox) - area;

        // Choose child with least enlargement
        if (enlargement < minEnlargement) {
          minEnlargement = enlargement;
          minArea = area;
          targetNode = child;
        } else if (enlargement === minEnlargement) {
          // Tie-break: choose smaller area
          if (area < minArea) {
            minArea = area;
            targetNode = child;
          }
        }
      }

      node = targetNode || node.children[0];
    }

    return node;
  }

  /**
   * Split node using R* split algorithm
   */
  _split(insertPath, level) {
    const node = insertPath[level];
    const m = node.children.length;
    const M = this.maxEntries;

    this._chooseSplitAxis(node);

    const splitIndex = this._chooseSplitIndex(node);

    const newNode = new RTreeNode(M, this.minEntries);
    newNode.leaf = node.leaf;
    newNode.height = node.height;
    newNode.children = node.children.splice(splitIndex);

    node.calculateBBox();
    newNode.calculateBBox();

    if (level) {
      insertPath[level - 1].children.push(newNode);
    } else {
      this._splitRoot(node, newNode);
    }
  }

  /**
   * Choose split axis (X or Y) that minimizes perimeter
   */
  _chooseSplitAxis(node) {
    const compareMinX = (a, b) => a.bbox.minX - b.bbox.minX;
    const compareMinY = (a, b) => a.bbox.minY - b.bbox.minY;

    const m = this.minEntries;
    const M = this.maxEntries;

    const xMargin = this._allDistMargin(node, m, M, compareMinX);
    const yMargin = this._allDistMargin(node, m, M, compareMinY);

    // Sort by axis with minimum margin
    if (xMargin < yMargin) {
      node.children.sort(compareMinX);
    } else {
      node.children.sort(compareMinY);
    }
  }

  /**
   * Choose split index that minimizes overlap
   */
  _chooseSplitIndex(node) {
    const m = this.minEntries;
    const M = this.maxEntries;

    let minOverlap = Infinity;
    let minArea = Infinity;
    let index = m;

    for (let i = m; i <= M - m; i++) {
      const bbox1 = this._distBBox(node, 0, i);
      const bbox2 = this._distBBox(node, i, M);

      const overlap = this._intersectionArea(bbox1, bbox2);
      const area = this._bboxArea(bbox1) + this._bboxArea(bbox2);

      if (overlap < minOverlap) {
        minOverlap = overlap;
        index = i;
        minArea = area;
      } else if (overlap === minOverlap && area < minArea) {
        minArea = area;
        index = i;
      }
    }

    return index;
  }

  /**
   * Calculate margin value for all distributions
   */
  _allDistMargin(node, m, M, compare) {
    node.children.sort(compare);

    let margin = 0;

    for (let i = m; i <= M - m; i++) {
      const bbox1 = this._distBBox(node, 0, i);
      const bbox2 = this._distBBox(node, i, M);
      margin += this._bboxMargin(bbox1) + this._bboxMargin(bbox2);
    }

    return margin;
  }

  /**
   * Get bounding box for distribution
   */
  _distBBox(node, k, p) {
    const bbox = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    for (let i = k; i < p; i++) {
      const childBBox = node.children[i].bbox;
      if (childBBox.minX < bbox.minX) bbox.minX = childBBox.minX;
      if (childBBox.minY < bbox.minY) bbox.minY = childBBox.minY;
      if (childBBox.maxX > bbox.maxX) bbox.maxX = childBBox.maxX;
      if (childBBox.maxY > bbox.maxY) bbox.maxY = childBBox.maxY;
    }

    return bbox;
  }

  /**
   * Split root node
   */
  _splitRoot(node, newNode) {
    const newRoot = new RTreeNode(this.maxEntries, this.minEntries);
    newRoot.leaf = false;
    newRoot.height = node.height + 1;
    newRoot.children = [node, newNode];
    newRoot.calculateBBox();

    this.root = newRoot;
  }

  /**
   * Adjust parent bounding boxes
   */
  _adjustParentBBoxes(bbox, path, level) {
    for (let i = level; i >= 0; i--) {
      const node = path[i];
      const nodeBBox = node.bbox;

      if (bbox.minX < nodeBBox.minX) nodeBBox.minX = bbox.minX;
      if (bbox.minY < nodeBBox.minY) nodeBBox.minY = bbox.minY;
      if (bbox.maxX > nodeBBox.maxX) nodeBBox.maxX = bbox.maxX;
      if (bbox.maxY > nodeBBox.maxY) nodeBBox.maxY = bbox.maxY;
    }
  }

  /**
   * Remove zone from R-tree
   * @param {Zone} zone
   */
  remove(zone) {
    const entry = this.data.get(zone.id);
    if (!entry) return false;

    this.data.delete(zone.id);

    const bbox = entry.bbox;
    const path = [];
    const node = this._findNode(entry, this.root, path);

    if (!node) return false;

    // Remove entry
    const index = node.children.indexOf(entry);
    node.children.splice(index, 1);

    // Condense tree
    this._condense(path);

    return true;
  }

  /**
   * Find node containing entry
   */
  _findNode(entry, node, path) {
    if (!node) return null;

    if (node.leaf) {
      if (node.children.indexOf(entry) !== -1) {
        path.push(node);
        return node;
      }
      return null;
    }

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];

      if (ZoneMath.aabbIntersects(entry.bbox, child.bbox)) {
        path.push(node);
        const found = this._findNode(entry, child, path);
        if (found) return found;
        path.pop();
      }
    }

    return null;
  }

  /**
   * Condense tree after removal
   */
  _condense(path) {
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i];

      if (node.children.length === 0) {
        if (i > 0) {
          const parent = path[i - 1];
          const index = parent.children.indexOf(node);
          parent.children.splice(index, 1);
        } else {
          this.root = new RTreeNode(this.maxEntries, this.minEntries);
        }
      } else {
        node.calculateBBox();
      }
    }
  }

  /**
   * Search for zones in bounding box
   * @param {Object} bbox - {minX, minY, maxX, maxY}
   * @returns {Array<Zone>}
   */
  search(bbox) {
    const results = [];
    this._search(bbox, this.root, results);
    return results;
  }

  /**
   * Internal search
   */
  _search(bbox, node, results) {
    if (!node) return;

    if (node.leaf) {
      for (let i = 0; i < node.children.length; i++) {
        const entry = node.children[i];
        if (ZoneMath.aabbIntersects(bbox, entry.bbox)) {
          results.push(entry.zone);
        }
      }
    } else {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (ZoneMath.aabbIntersects(bbox, child.bbox)) {
          this._search(bbox, child, results);
        }
      }
    }
  }

  /**
   * Get zone by ID
   */
  get(zoneId) {
    const entry = this.data.get(zoneId);
    return entry ? entry.zone : null;
  }

  /**
   * Update zone (remove and re-insert)
   */
  update(zone) {
    this.remove(zone);
    this.insert(zone);
  }

  /**
   * Clear all zones
   */
  clear() {
    this.root = new RTreeNode(this.maxEntries, this.minEntries);
    this.data.clear();
  }

  /**
   * Get all zones
   */
  all() {
    const results = [];
    this._all(this.root, results);
    return results;
  }

  /**
   * Internal all
   */
  _all(node, results) {
    if (node.leaf) {
      for (let i = 0; i < node.children.length; i++) {
        results.push(node.children[i].zone);
      }
    } else {
      for (let i = 0; i < node.children.length; i++) {
        this._all(node.children[i], results);
      }
    }
  }

  /**
   * Get number of zones
   */
  size() {
    return this.data.size;
  }

  /**
   * Calculate bounding box area
   */
  _bboxArea(bbox) {
    return (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY);
  }

  /**
   * Calculate bounding box margin (perimeter)
   */
  _bboxMargin(bbox) {
    return (bbox.maxX - bbox.minX) + (bbox.maxY - bbox.minY);
  }

  /**
   * Calculate enlarged area
   */
  _enlargedArea(bbox, targetBBox) {
    return (Math.max(bbox.maxX, targetBBox.maxX) - Math.min(bbox.minX, targetBBox.minX)) *
           (Math.max(bbox.maxY, targetBBox.maxY) - Math.min(bbox.minY, targetBBox.minY));
  }

  /**
   * Calculate intersection area
   */
  _intersectionArea(bbox1, bbox2) {
    const minX = Math.max(bbox1.minX, bbox2.minX);
    const minY = Math.max(bbox1.minY, bbox2.minY);
    const maxX = Math.min(bbox1.maxX, bbox2.maxX);
    const maxY = Math.min(bbox1.maxY, bbox2.maxY);

    return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  }

  /**
   * Get tree statistics
   */
  getStats() {
    const stats = {
      totalZones: this.data.size,
      height: this.root.height,
      nodeCount: 0,
      leafCount: 0,
      avgChildrenPerNode: 0
    };

    this._countNodes(this.root, stats);

    stats.avgChildrenPerNode = stats.nodeCount > 0
      ? (stats.totalZones / stats.leafCount).toFixed(2)
      : 0;

    return stats;
  }

  /**
   * Count nodes recursively
   */
  _countNodes(node, stats) {
    stats.nodeCount++;

    if (node.leaf) {
      stats.leafCount++;
    } else {
      for (let i = 0; i < node.children.length; i++) {
        this._countNodes(node.children[i], stats);
      }
    }
  }
}

// Export
// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RTree;
}

// Export for FiveM shared scripts (global scope)
if (typeof global !== 'undefined') {
  global.RTree = RTree;
}
