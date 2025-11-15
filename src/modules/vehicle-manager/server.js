/**
 * NextGen Framework - Vehicle Manager Module
 * Manages vehicle ownership, spawning, and storage
 */

class VehicleManager {
  constructor(framework) {
    this.framework = framework;
    this.db = framework.database;
    this.logger = null;
    this.accessManager = null;

    // Spawned vehicles cache
    this.spawnedVehicles = new Map(); // vehicleId => { netId, plate, owner }
  }

  async init() {
    this.logger = this.framework.getModule('logger');
    this.accessManager = this.framework.getModule('access-manager');

    this.log('Vehicle manager initialized', 'info');
  }

  async createVehicle(plate, model, ownerType, ownerId, metadata = {}) {
    try {
      const result = await this.db.execute(
        'INSERT INTO vehicles (plate, model, owner_type, owner_id, metadata) VALUES (?, ?, ?, ?, ?)',
        [plate, model, ownerType, ownerId, JSON.stringify(metadata)]
      );

      this.log(`Created vehicle: ${plate}`, 'info');
      return { success: true, vehicleId: result.insertId };
    } catch (error) {
      this.log(`Failed to create vehicle: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  async getVehicle(vehicleId) {
    try {
      const vehicles = await this.db.query('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
      if (vehicles.length === 0) return null;

      const vehicle = vehicles[0];
      return {
        ...vehicle,
        metadata: typeof vehicle.metadata === 'string' ? JSON.parse(vehicle.metadata) : vehicle.metadata
      };
    } catch (error) {
      this.log(`Failed to get vehicle: ${error.message}`, 'error');
      return null;
    }
  }

  async getPlayerVehicles(ownerType, ownerId) {
    try {
      const vehicles = await this.db.query(
        'SELECT * FROM vehicles WHERE owner_type = ? AND owner_id = ?',
        [ownerType, ownerId]
      );

      return vehicles.map(v => ({
        ...v,
        metadata: typeof v.metadata === 'string' ? JSON.parse(v.metadata) : v.metadata
      }));
    } catch (error) {
      this.log(`Failed to get player vehicles: ${error.message}`, 'error');
      return [];
    }
  }

  async deleteVehicle(vehicleId) {
    try {
      await this.db.execute('DELETE FROM vehicles WHERE id = ?', [vehicleId]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    }
  }

  async destroy() {
    this.spawnedVehicles.clear();
  }
}

module.exports = VehicleManager;
