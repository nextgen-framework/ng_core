/**
 * NextGen Framework - Polygon Operations (Shared)
 * Simple point-in-polygon check for shared/client use
 */

/**
 * Fast point-in-polygon using ray casting algorithm
 * @param {number} x - Point X coordinate
 * @param {number} y - Point Y coordinate
 * @param {Array<{x: number, y: number}>} points - Polygon vertices
 * @returns {boolean}
 */
function fastPointInPolygon(x, y, points) {
  if (points.length < 3) return false;

  let inside = false;
  const len = points.length;

  for (let i = 0, j = len - 1; i < len; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
                     (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

// Export for FiveM shared scripts (global scope)
if (typeof global !== 'undefined') {
  global.fastPointInPolygon = fastPointInPolygon;
}

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fastPointInPolygon
  };
}
