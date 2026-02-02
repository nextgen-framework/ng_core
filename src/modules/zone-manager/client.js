/**
 * NextGen Framework - Zone Manager Module (Client-Side)
 * Client-side zone checking and visualization
 */

// FiveM client - globals are available from shared scripts

class ZoneManagerClientModule {
  constructor(framework) {
    this.framework = framework;

    // Zone storage (client-side zones only)
    this.zones = new Map();
    this.zoneIdCounter = 1;

    // Spatial partitioning (for local zones)
    this.spatial = new SpatialGrid({
      minX: -5000,
      minY: -5000,
      maxX: 5000,
      maxY: 5000
    }, 100);

    // Visualization
    this.visualizationEnabled = false;
    this.showDebugInfo = false;
    this.visualizedZones = new Set();

    // Performance
    this.updateInterval = 100; // ms
    this._updateTimer = null;
    this._drawTimer = null;
  }

  /**
   * Initialize the zone manager client module
   */
  async init() {
    console.log('[ZoneManager] Client module initializing...');

    // Start update loop
    this.startUpdateLoop();

    // Register RPC handlers
    this.registerRPC();

    // Register commands
    this.registerCommands();

    console.log('[ZoneManager] Client module initialized');
  }

  /**
   * Start the update loop
   */
  startUpdateLoop() {
    this._updateTimer = setInterval(() => {
      this.update();
    }, this.updateInterval);

    // Separate draw loop for visualization (every frame)
    this._drawTimer = setTick(() => {
      if (this.visualizationEnabled) {
        this.drawZones();
      }
    });
  }

  /**
   * Stop the update loop
   */
  stopUpdateLoop() {
    if (this._updateTimer) {
      clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
    if (this._drawTimer) {
      clearTick(this._drawTimer);
      this._drawTimer = null;
    }
  }

  /**
   * Update player position and check zones
   */
  update() {
    const playerPed = PlayerPedId();
    if (!playerPed || playerPed === 0) return;

    const coords = GetEntityCoords(playerPed, false);
    const x = coords[0];
    const y = coords[1];
    const z = coords[2];

    // Query nearby zones
    const nearbyZones = this.spatial.query(x, y, 500);

    // Check each zone
    for (let i = 0; i < nearbyZones.length; i++) {
      const zone = nearbyZones[i];
      const localPlayerId = PlayerId();
      zone.checkPlayer(localPlayerId, x, y, z, { id: localPlayerId });
    }
  }

  /**
   * Draw zone visualization
   */
  drawZones() {
    const playerPed = PlayerPedId();
    if (!playerPed || playerPed === 0) return;

    const playerCoords = GetEntityCoords(playerPed, false);

    this.visualizedZones.forEach(zoneId => {
      const zone = this.zones.get(zoneId);
      if (!zone || !zone.enabled) return;

      this.drawZone(zone, playerCoords);
    });
  }

  /**
   * Draw a single zone
   * @param {Zone} zone
   * @param {Array} playerCoords
   */
  drawZone(zone, playerCoords) {
    const distance = GetDistanceBetweenCoords(
      playerCoords[0], playerCoords[1], playerCoords[2],
      zone.center?.x || 0, zone.center?.y || 0, zone.center?.z || 0,
      true
    );

    // Don't draw if too far
    if (distance > 500) return;

    // Check if player is inside
    const isInside = zone.contains(playerCoords[0], playerCoords[1], playerCoords[2]);
    const color = isInside ? [0, 255, 0, 100] : [255, 255, 255, 50];

    // Draw based on zone type
    if (zone.constructor.name === 'CircleZone') {
      this.drawCircleZone(zone, color);
    } else if (zone.constructor.name === 'RectangleZone') {
      this.drawRectangleZone(zone, color);
    } else if (zone.constructor.name === 'PolygonZone') {
      this.drawPolygonZone(zone, color);
    }

    // Draw debug info
    if (this.showDebugInfo && zone.center) {
      this.drawZoneDebugInfo(zone, isInside);
    }
  }

  /**
   * Draw circle zone
   */
  drawCircleZone(zone, color) {
    const center = zone.center;
    const z = center.z;

    // Draw circle at ground level
    DrawMarker(
      1, // Cylinder marker
      center.x, center.y, z - 1.0,
      0.0, 0.0, 0.0,
      0.0, 0.0, 0.0,
      zone.radius * 2, zone.radius * 2, 2.0,
      color[0], color[1], color[2], color[3],
      false, false, 2, false, null, null, false
    );

    // Draw border
    const segments = 32;
    for (let i = 0; i < segments; i++) {
      const angle1 = (i / segments) * Math.PI * 2;
      const angle2 = ((i + 1) / segments) * Math.PI * 2;

      const x1 = center.x + Math.cos(angle1) * zone.radius;
      const y1 = center.y + Math.sin(angle1) * zone.radius;
      const x2 = center.x + Math.cos(angle2) * zone.radius;
      const y2 = center.y + Math.sin(angle2) * zone.radius;

      DrawLine(x1, y1, z, x2, y2, z, 255, 255, 255, 200);
    }
  }

  /**
   * Draw rectangle zone
   */
  drawRectangleZone(zone, color) {
    const center = zone.center;
    const z = center.z;

    // Draw rectangle
    DrawMarker(
      1, // Cylinder marker (will look like box from above)
      center.x, center.y, z - 1.0,
      0.0, 0.0, 0.0,
      0.0, 0.0, zone.rotation * (180 / Math.PI),
      zone.width, zone.height, 2.0,
      color[0], color[1], color[2], color[3],
      false, false, 2, false, null, null, false
    );

    // Draw border (corners)
    const corners = zone._getCorners();
    for (let i = 0; i < corners.length; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % corners.length];
      DrawLine(p1.x, p1.y, z, p2.x, p2.y, z, 255, 255, 255, 200);
    }
  }

  /**
   * Draw polygon zone
   */
  drawPolygonZone(zone, color) {
    const z = zone.centroid.y; // Use centroid for Z

    // Draw filled polygon (approximation with marker)
    DrawMarker(
      28, // Generic marker
      zone.centroid.x, zone.centroid.y, z - 1.0,
      0.0, 0.0, 0.0,
      0.0, 0.0, 0.0,
      5.0, 5.0, 2.0,
      color[0], color[1], color[2], color[3],
      false, false, 2, false, null, null, false
    );

    // Draw polygon edges
    const points = zone.points;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      DrawLine(p1.x, p1.y, z, p2.x, p2.y, z, 255, 255, 255, 200);
    }
  }

  /**
   * Draw zone debug info
   */
  drawZoneDebugInfo(zone, isInside) {
    const center = zone.center || zone.centroid;
    if (!center) return;

    // Draw text above zone
    SetDrawOrigin(center.x, center.y, (center.z || 0) + 2.0, 0);

    SetTextScale(0.35, 0.35);
    SetTextFont(4);
    SetTextProportional(true);
    SetTextColour(255, 255, 255, 255);
    SetTextOutline();
    SetTextEntry('STRING');
    AddTextComponentString(`${zone.name}\n${isInside ? 'INSIDE' : 'OUTSIDE'}`);
    DrawText(0.0, 0.0);

    ClearDrawOrigin();
  }

  /**
   * Register RPC handlers
   */
  registerRPC() {
    const rpc = this.framework.getModule('rpc');
    if (!rpc) return;

    // Sync zone from server
    rpc.register('zone:sync', (zoneData) => {
      this.createFromData(zoneData);
    });

    // Remove zone
    rpc.register('zone:remove', (zoneId) => {
      this.remove(zoneId);
    });
  }

  /**
   * Register debug commands
   */
  registerCommands() {
    // Toggle visualization
    RegisterCommand('zones', () => {
      this.visualizationEnabled = !this.visualizationEnabled;
      const notif = this.framework.getModule('notifications');
      if (notif) {
        notif.info(`Zone visualization ${this.visualizationEnabled ? 'enabled' : 'disabled'}`);
      }
    }, false);

    // Toggle debug info
    RegisterCommand('zonesdebug', () => {
      this.showDebugInfo = !this.showDebugInfo;
      const notif = this.framework.getModule('notifications');
      if (notif) {
        notif.info(`Zone debug info ${this.showDebugInfo ? 'enabled' : 'disabled'}`);
      }
    }, false);
  }

  /**
   * Create a new client-side zone
   * @param {string} type - Zone type
   * @param {Object} data - Zone configuration
   * @returns {Zone}
   */
  create(type, data) {
    const id = data.id || this.zoneIdCounter++;
    const zone = ZoneFactory.create(id, type, data);

    this.zones.set(zone.id, zone);
    this.spatial.insert(zone);

    console.log(`[ZoneManager] Client zone created: ${zone.name} (${type})`);

    return zone;
  }

  /**
   * Create zone from server data
   * @param {Object} data
   */
  createFromData(data) {
    return this.create(data.type, data);
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
   * Remove zone
   * @param {string|number} id
   * @returns {boolean}
   */
  remove(id) {
    const zone = this.zones.get(id);
    if (!zone) return false;

    this.spatial.remove(zone);
    this.zones.delete(id);
    this.visualizedZones.delete(id);
    zone.destroy();

    console.log(`[ZoneManager] Client zone removed: ${zone.name}`);

    return true;
  }

  /**
   * Enable visualization for zone
   * @param {string|number} zoneId
   */
  visualizeZone(zoneId) {
    this.visualizedZones.add(zoneId);
  }

  /**
   * Disable visualization for zone
   * @param {string|number} zoneId
   */
  hideZone(zoneId) {
    this.visualizedZones.delete(zoneId);
  }

  /**
   * Enable visualization for all zones
   */
  visualizeAll() {
    this.zones.forEach((zone, id) => {
      this.visualizedZones.add(id);
    });
    this.visualizationEnabled = true;
  }

  /**
   * Disable visualization for all zones
   */
  hideAll() {
    this.visualizedZones.clear();
    this.visualizationEnabled = false;
  }

  /**
   * Query zones at position
   * @param {number} x
   * @param {number} y
   * @param {number} range
   * @returns {Array<Zone>}
   */
  queryZones(x, y, range) {
    return this.spatial.query(x, y, range);
  }

  /**
   * Check if player is in zone
   * @param {string|number} zoneId
   * @returns {boolean}
   */
  isPlayerInZone(zoneId) {
    const zone = this.getZone(zoneId);
    if (!zone) return false;

    const playerPed = PlayerPedId();
    if (!playerPed || playerPed === 0) return false;

    const coords = GetEntityCoords(playerPed, false);
    return zone.contains(coords[0], coords[1], coords[2]);
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
    this.visualizedZones.clear();

    console.log('[ZoneManager] All client zones cleared');
  }

  /**
   * Get performance statistics
   * @returns {Object}
   */
  getStats() {
    return {
      totalZones: this.zones.size,
      visualizedZones: this.visualizedZones.size,
      visualizationEnabled: this.visualizationEnabled,
      showDebugInfo: this.showDebugInfo,
      spatial: this.spatial.getStats()
    };
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.stopUpdateLoop();
    this.clearAll();
    console.log('[ZoneManager] Client module destroyed');
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZoneManagerClientModule;
}

// Self-register
global.Framework.register('zone-manager', new ZoneManagerClientModule(global.Framework), 12);
