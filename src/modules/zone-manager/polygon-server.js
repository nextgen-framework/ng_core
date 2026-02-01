/**
 * NextGen Framework - Optimized Polygon Operations
 * Uses polygon-lookup and point-in-polygon for maximum performance
 */

const PolygonLookup = require('polygon-lookup');
const pointInPolygon = require('point-in-polygon');

/**
 * Optimized Polygon Spatial Index
 * Uses polygon-lookup for ultra-fast spatial queries
 */
class OptimizedPolygonIndex {
  constructor() {
    this.polygons = new Map(); // zoneId -> polygon data
    this.featureCollection = null;
    this.lookup = null;
    this.needsRebuild = false;
  }

  /**
   * Add polygon to index
   * @param {string} zoneId - Zone identifier
   * @param {Array} points - Array of {x, y} points
   * @param {Object} metadata - Additional zone data
   */
  add(zoneId, points, metadata = {}) {
    // Convert points to GeoJSON format [lng, lat] (using x, y as coords)
    const coordinates = points.map(p => [p.x, p.y]);

    // Close the polygon if not already closed
    if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
        coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
      coordinates.push([...coordinates[0]]);
    }

    this.polygons.set(zoneId, {
      points,
      coordinates,
      metadata
    });

    this.needsRebuild = true;
  }

  /**
   * Remove polygon from index
   * @param {string} zoneId
   * @returns {boolean} - True if removed
   */
  remove(zoneId) {
    const removed = this.polygons.delete(zoneId);
    if (removed) {
      this.needsRebuild = true;
    }
    return removed;
  }

  /**
   * Rebuild the spatial index
   * Call this after adding/removing polygons before querying
   */
  rebuild() {
    if (!this.needsRebuild) return;

    const features = [];

    this.polygons.forEach((data, zoneId) => {
      features.push({
        type: 'Feature',
        properties: {
          zoneId,
          ...data.metadata
        },
        geometry: {
          type: 'Polygon',
          coordinates: [data.coordinates]
        }
      });
    });

    this.featureCollection = {
      type: 'FeatureCollection',
      features
    };

    // Create new lookup index
    if (features.length > 0) {
      this.lookup = new PolygonLookup(this.featureCollection);
    } else {
      this.lookup = null;
    }

    this.needsRebuild = false;
  }

  /**
   * Find which polygon(s) contain a point
   * @param {number} x
   * @param {number} y
   * @returns {Array} - Array of zone IDs that contain the point
   */
  query(x, y) {
    if (this.needsRebuild) {
      this.rebuild();
    }

    if (!this.lookup) return [];

    // Query using polygon-lookup (ultra-fast R-tree based)
    const result = this.lookup.search(x, y);

    if (!result) return [];

    // Return zone IDs
    if (Array.isArray(result)) {
      return result.map(feature => feature.properties.zoneId);
    } else {
      return [result.properties.zoneId];
    }
  }

  /**
   * Clear all polygons
   */
  clear() {
    this.polygons.clear();
    this.featureCollection = null;
    this.lookup = null;
    this.needsRebuild = false;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalPolygons: this.polygons.size,
      needsRebuild: this.needsRebuild,
      hasIndex: this.lookup !== null
    };
  }
}

/**
 * Fast point-in-polygon check using optimized library
 * @param {number} x
 * @param {number} y
 * @param {Array} points - Array of {x, y} points
 * @returns {boolean}
 */
function fastPointInPolygon(x, y, points) {
  // Convert to format expected by point-in-polygon: [[x1, y1], [x2, y2], ...]
  const polygon = points.map(p => [p.x, p.y]);

  // Use optimized point-in-polygon library
  return pointInPolygon([x, y], polygon);
}

/**
 * Check if polygon is valid (at least 3 points)
 * @param {Array} points
 * @returns {boolean}
 */
function isValidPolygon(points) {
  return Array.isArray(points) && points.length >= 3;
}

/**
 * Calculate polygon area (for validation/optimization)
 * @param {Array} points - Array of {x, y} points
 * @returns {number} - Area (can be negative if clockwise)
 */
function calculatePolygonArea(points) {
  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area / 2);
}

/**
 * Simplify polygon using Douglas-Peucker algorithm
 * Useful for reducing point count while maintaining shape
 * @param {Array} points - Array of {x, y} points
 * @param {number} tolerance - Simplification tolerance
 * @returns {Array} - Simplified points
 */
function simplifyPolygon(points, tolerance = 1.0) {
  if (points.length < 3) return points;

  // Douglas-Peucker implementation
  function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);

    const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);

    let closestX, closestY;
    if (u < 0) {
      closestX = lineStart.x;
      closestY = lineStart.y;
    } else if (u > 1) {
      closestX = lineEnd.x;
      closestY = lineEnd.y;
    } else {
      closestX = lineStart.x + u * dx;
      closestY = lineStart.y + u * dy;
    }

    return Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
  }

  function douglasPeucker(points, tolerance) {
    if (points.length < 3) return points;

    let maxDistance = 0;
    let maxIndex = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const distance = perpendicularDistance(points[i], points[0], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxDistance > tolerance) {
      const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
      const right = douglasPeucker(points.slice(maxIndex), tolerance);
      return left.slice(0, -1).concat(right);
    } else {
      return [points[0], points[end]];
    }
  }

  const simplified = douglasPeucker(points, tolerance);

  // Ensure we keep at least 3 points
  return simplified.length >= 3 ? simplified : points;
}

/**
 * Convert polygon to convex hull (useful for performance)
 * @param {Array} points - Array of {x, y} points
 * @returns {Array} - Convex hull points
 */
function convexHull(points) {
  if (points.length < 3) return points;

  // Sort points lexicographically
  const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

  // Andrew's monotone chain algorithm
  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
      lower.pop();
    }
    lower.push(sorted[i]);
  }

  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
      upper.pop();
    }
    upper.push(sorted[i]);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Export
module.exports = {
  OptimizedPolygonIndex,
  fastPointInPolygon,
  isValidPolygon,
  calculatePolygonArea,
  simplifyPolygon,
  convexHull
};
