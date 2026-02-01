/**
 * NextGen Framework - Zone Manager Math Utilities
 * Ultra-optimized vector and geometry calculations
 */

class ZoneMath {
  /**
   * Calculate squared distance between two 2D points (avoids sqrt)
   * ~2x faster than distance calculation
   */
  static distanceSquared2D(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  /**
   * Calculate squared distance between two 3D points (avoids sqrt)
   */
  static distanceSquared3D(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Calculate actual distance between two 2D points
   */
  static distance2D(x1, y1, x2, y2) {
    return Math.sqrt(this.distanceSquared2D(x1, y1, x2, y2));
  }

  /**
   * Calculate actual distance between two 3D points
   */
  static distance3D(x1, y1, z1, x2, y2, z2) {
    return Math.sqrt(this.distanceSquared3D(x1, y1, z1, x2, y2, z2));
  }

  /**
   * Check if point is inside circle (2D)
   * @param {number} px - Point X
   * @param {number} py - Point Y
   * @param {number} cx - Circle center X
   * @param {number} cy - Circle center Y
   * @param {number} radius - Circle radius
   * @returns {boolean}
   */
  static pointInCircle(px, py, cx, cy, radius) {
    const distSq = this.distanceSquared2D(px, py, cx, cy);
    return distSq <= radius * radius;
  }

  /**
   * Check if point is inside sphere (3D)
   * @param {number} px - Point X
   * @param {number} py - Point Y
   * @param {number} pz - Point Z
   * @param {number} cx - Sphere center X
   * @param {number} cy - Sphere center Y
   * @param {number} cz - Sphere center Z
   * @param {number} radius - Sphere radius
   * @returns {boolean}
   */
  static pointInSphere(px, py, pz, cx, cy, cz, radius) {
    const distSq = this.distanceSquared3D(px, py, pz, cx, cy, cz);
    return distSq <= radius * radius;
  }

  /**
   * Check if point is inside AABB (Axis-Aligned Bounding Box)
   * @param {number} px - Point X
   * @param {number} py - Point Y
   * @param {number} pz - Point Z (optional)
   * @param {number} minX - Box min X
   * @param {number} minY - Box min Y
   * @param {number} minZ - Box min Z (optional)
   * @param {number} maxX - Box max X
   * @param {number} maxY - Box max Y
   * @param {number} maxZ - Box max Z (optional)
   * @returns {boolean}
   */
  static pointInAABB(px, py, pz, minX, minY, minZ, maxX, maxY, maxZ) {
    if (pz === undefined) {
      // 2D check
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    }
    // 3D check
    return px >= minX && px <= maxX &&
           py >= minY && py <= maxY &&
           pz >= minZ && pz <= maxZ;
  }

  /**
   * Check if point is inside polygon (2D) using ray casting algorithm
   * Optimized version with early exit
   * @param {number} px - Point X
   * @param {number} py - Point Y
   * @param {Array<{x: number, y: number}>} points - Polygon vertices
   * @returns {boolean}
   */
  static pointInPolygon(px, py, points) {
    if (points.length < 3) return false;

    let inside = false;
    const len = points.length;

    for (let i = 0, j = len - 1; i < len; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;

      const intersect = ((yi > py) !== (yj > py)) &&
                       (px < (xj - xi) * (py - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Calculate AABB (bounding box) for a polygon
   * @param {Array<{x: number, y: number}>} points - Polygon vertices
   * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
   */
  static calculatePolygonAABB(points) {
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Check if two AABBs intersect
   * @param {Object} box1 - First box {minX, minY, maxX, maxY}
   * @param {Object} box2 - Second box {minX, minY, maxX, maxY}
   * @returns {boolean}
   */
  static aabbIntersects(box1, box2) {
    return !(box1.maxX < box2.minX ||
             box1.minX > box2.maxX ||
             box1.maxY < box2.minY ||
             box1.minY > box2.maxY);
  }

  /**
   * Linear interpolation
   * @param {number} a - Start value
   * @param {number} b - End value
   * @param {number} t - Interpolation factor (0-1)
   * @returns {number}
   */
  static lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Clamp value between min and max
   * @param {number} value - Value to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number}
   */
  static clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Rotate point around origin (2D)
   * @param {number} x - Point X
   * @param {number} y - Point Y
   * @param {number} angle - Angle in radians
   * @returns {{x: number, y: number}}
   */
  static rotatePoint(x, y, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos
    };
  }

  /**
   * Calculate polygon centroid
   * @param {Array<{x: number, y: number}>} points - Polygon vertices
   * @returns {{x: number, y: number}}
   */
  static calculateCentroid(points) {
    if (points.length === 0) return { x: 0, y: 0 };

    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < points.length; i++) {
      sumX += points[i].x;
      sumY += points[i].y;
    }

    return {
      x: sumX / points.length,
      y: sumY / points.length
    };
  }

  /**
   * Calculate polygon area (signed)
   * @param {Array<{x: number, y: number}>} points - Polygon vertices
   * @returns {number}
   */
  static calculatePolygonArea(points) {
    if (points.length < 3) return 0;

    let area = 0;
    const len = points.length;

    for (let i = 0; i < len; i++) {
      const j = (i + 1) % len;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    return Math.abs(area / 2);
  }

  /**
   * Check if point is inside rotated rectangle
   * @param {number} px - Point X
   * @param {number} py - Point Y
   * @param {number} cx - Rectangle center X
   * @param {number} cy - Rectangle center Y
   * @param {number} width - Rectangle width
   * @param {number} height - Rectangle height
   * @param {number} rotation - Rotation in radians
   * @returns {boolean}
   */
  static pointInRotatedRectangle(px, py, cx, cy, width, height, rotation) {
    // Translate point to origin
    const translatedX = px - cx;
    const translatedY = py - cy;

    // Rotate point back
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    // Check if in AABB
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return rotatedX >= -halfWidth && rotatedX <= halfWidth &&
           rotatedY >= -halfHeight && rotatedY <= halfHeight;
  }

  /**
   * Get closest point on line segment to a point
   * @param {number} px - Point X
   * @param {number} py - Point Y
   * @param {number} x1 - Line start X
   * @param {number} y1 - Line start Y
   * @param {number} x2 - Line end X
   * @param {number} y2 - Line end Y
   * @returns {{x: number, y: number, distance: number}}
   */
  static closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      // Segment is a point
      return {
        x: x1,
        y: y1,
        distance: this.distance2D(px, py, x1, y1)
      };
    }

    // Calculate projection parameter
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = this.clamp(t, 0, 1);

    // Calculate closest point
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    return {
      x: closestX,
      y: closestY,
      distance: this.distance2D(px, py, closestX, closestY)
    };
  }
}

// Export for both environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZoneMath;
}

if (typeof global !== 'undefined') {
  global.ZoneMath = ZoneMath;
}
