/**
 * NextGen Framework - Vehicle Manager Module
 * Manages vehicle ownership, spawning, and storage
 */

class VehicleManager {
  constructor(framework) {
    this.framework = framework;
    this.db = null;
    this.accessManager = null;

    // Spawned vehicles cache
    this.spawnedVehicles = new Map(); // vehicleId => { netId, plate, owner }
  }

  async init() {
    this.db = this.framework.getModule('database');
    this.accessManager = this.framework.getModule('access-manager');

    this.framework.log.info('Vehicle manager initialized');
  }

  async createVehicle(plate, model, ownerType, ownerId, metadata = {}) {
    try {
      const result = await this.db.execute(
        'INSERT INTO vehicles (plate, model, owner_type, owner_id, metadata) VALUES (?, ?, ?, ?, ?)',
        [plate, model, ownerType, ownerId, JSON.stringify(metadata)]
      );

      this.framework.log.info(`Created vehicle: ${plate}`);
      return { success: true, vehicleId: result.insertId };
    } catch (error) {
      this.framework.log.error(`Failed to create vehicle: ${error.message}`);
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
      this.framework.log.error(`Failed to get vehicle: ${error.message}`);
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
      this.framework.log.error(`Failed to get player vehicles: ${error.message}`);
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


  async destroy() {
    this.spawnedVehicles.clear();
  }
}

module.exports = VehicleManager;

// Self-register
global.Framework.register('vehicle-manager', new VehicleManager(global.Framework), 17);
