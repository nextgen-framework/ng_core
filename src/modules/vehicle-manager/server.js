/**
 * NextGen Framework - Vehicle Manager Module
 * Manages vehicle ownership, spawning, garage storage, and state
 */

class VehicleManager {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        // Spawned vehicles tracking: netId => { vehicleId, plate, owner, source }
        this.spawnedVehicles = new Map();

        // Reverse lookup: vehicleId => netId
        this.vehicleNetIds = new Map();

        // Player spawned vehicles: source => Set<vehicleId>
        this.playerVehicles = new Map();
    }

    /**
     * Initialize vehicle manager module
     */
    async init() {
        this.db = this.framework.getModule('database');

        // Handle player drop — despawn their vehicles
        this.framework.fivem.on('playerDropped', () => {
            this._handlePlayerDropped(source);
        });

        // RPC handlers
        const rpc = this.framework.getModule('rpc');
        if (rpc) {
            rpc.register('vehicle:getMyVehicles', this.getPlayerVehiclesRPC.bind(this));
            rpc.register('vehicle:getVehicle', this.getVehicleRPC.bind(this));
        }

        this.framework.log.info('Vehicle manager initialized');
    }

    // ================================
    // Vehicle CRUD
    // ================================

    /**
     * Create a new vehicle
     * @param {string} plate - License plate (unique)
     * @param {string} model - Vehicle model name
     * @param {string} ownerType - 'character' or 'organization'
     * @param {number} ownerId - Owner ID
     * @param {Object} metadata - Extra data
     * @returns {Object} { success, vehicleId }
     */
    async createVehicle(plate, model, ownerType, ownerId, metadata = {}) {
        try {
            const result = await this.db.execute(
                'INSERT INTO vehicles (plate, model, owner_type, owner_id, metadata) VALUES (?, ?, ?, ?, ?)',
                [plate, model, ownerType, ownerId, JSON.stringify(metadata)]
            );

            this.framework.log.info(`Created vehicle: ${plate} (${model})`);
            return { success: true, vehicleId: result.insertId };
        } catch (error) {
            this.framework.log.error(`Failed to create vehicle: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get vehicle by ID
     * @param {number} vehicleId
     * @returns {Object|null}
     */
    async getVehicle(vehicleId) {
        try {
            const vehicles = await this.db.query(
                'SELECT * FROM vehicles WHERE id = ?',
                [vehicleId]
            );
            if (vehicles.length === 0) return null;

            return this._parseVehicle(vehicles[0]);
        } catch (error) {
            this.framework.log.error(`Failed to get vehicle: ${error.message}`);
            return null;
        }
    }

    /**
     * Get vehicle by plate
     * @param {string} plate
     * @returns {Object|null}
     */
    async getVehicleByPlate(plate) {
        try {
            const vehicles = await this.db.query(
                'SELECT * FROM vehicles WHERE plate = ?',
                [plate]
            );
            if (vehicles.length === 0) return null;

            return this._parseVehicle(vehicles[0]);
        } catch (error) {
            this.framework.log.error(`Failed to get vehicle by plate: ${error.message}`);
            return null;
        }
    }

    /**
     * Get all vehicles for an owner
     * @param {string} ownerType
     * @param {number} ownerId
     * @returns {Array}
     */
    async getOwnerVehicles(ownerType, ownerId) {
        try {
            const vehicles = await this.db.query(
                'SELECT * FROM vehicles WHERE owner_type = ? AND owner_id = ?',
                [ownerType, ownerId]
            );

            return vehicles.map(v => this._parseVehicle(v));
        } catch (error) {
            this.framework.log.error(`Failed to get owner vehicles: ${error.message}`);
            return [];
        }
    }

    /**
     * Get vehicles by garage
     * @param {string} garage - Garage name
     * @param {string} [ownerType] - Optional filter
     * @param {number} [ownerId] - Optional filter
     * @returns {Array}
     */
    async getVehiclesByGarage(garage, ownerType = null, ownerId = null) {
        try {
            let query = 'SELECT * FROM vehicles WHERE garage = ? AND state = ?';
            const params = [garage, 'stored'];

            if (ownerType && ownerId) {
                query += ' AND owner_type = ? AND owner_id = ?';
                params.push(ownerType, ownerId);
            }

            const vehicles = await this.db.query(query, params);
            return vehicles.map(v => this._parseVehicle(v));
        } catch (error) {
            this.framework.log.error(`Failed to get garage vehicles: ${error.message}`);
            return [];
        }
    }

    /**
     * Update vehicle properties
     * @param {number} vehicleId
     * @param {Object} data - Fields to update (fuel, engine_health, body_health, customization, position, metadata)
     */
    async updateVehicle(vehicleId, data) {
        const allowed = ['fuel', 'engine_health', 'body_health', 'customization', 'position', 'metadata', 'garage', 'state'];
        const fields = [];
        const values = [];

        for (const key of allowed) {
            if (data[key] !== undefined) {
                fields.push(`${key} = ?`);
                const val = (typeof data[key] === 'object') ? JSON.stringify(data[key]) : data[key];
                values.push(val);
            }
        }

        if (fields.length === 0) return { success: false, reason: 'no_fields' };

        values.push(vehicleId);

        try {
            await this.db.execute(
                `UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to update vehicle ${vehicleId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a vehicle
     * @param {number} vehicleId
     */
    async deleteVehicle(vehicleId) {
        // Despawn if currently out
        this._despawnByVehicleId(vehicleId);

        try {
            await this.db.execute('DELETE FROM vehicles WHERE id = ?', [vehicleId]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Transfer vehicle ownership
     * @param {number} vehicleId
     * @param {string} newOwnerType
     * @param {number} newOwnerId
     */
    async transferOwnership(vehicleId, newOwnerType, newOwnerId) {
        try {
            await this.db.execute(
                'UPDATE vehicles SET owner_type = ?, owner_id = ? WHERE id = ?',
                [newOwnerType, newOwnerId, vehicleId]
            );

            this.framework.log.info(`Vehicle ${vehicleId} transferred to ${newOwnerType}:${newOwnerId}`);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ================================
    // Garage Operations
    // ================================

    /**
     * Store vehicle in garage
     * @param {number} vehicleId
     * @param {string} garage - Garage name
     */
    async storeVehicle(vehicleId, garage) {
        // Despawn if currently spawned
        this._despawnByVehicleId(vehicleId);

        try {
            await this.db.execute(
                'UPDATE vehicles SET state = ?, garage = ?, position = NULL WHERE id = ?',
                ['stored', garage, vehicleId]
            );

            this.framework.log.debug(`Vehicle ${vehicleId} stored in ${garage}`);

            // Emit event
            this.framework.events.emit('vehicle:stored', vehicleId, garage);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Retrieve vehicle from garage (mark as out)
     * @param {number} vehicleId
     * @param {number} source - Player source (for tracking)
     * @param {Object} position - { x, y, z, heading }
     * @returns {Object} { success, vehicle }
     */
    async retrieveVehicle(vehicleId, source, position) {
        const vehicle = await this.getVehicle(vehicleId);
        if (!vehicle) return { success: false, reason: 'vehicle_not_found' };
        if (vehicle.state !== 'stored') return { success: false, reason: 'vehicle_not_stored' };

        try {
            await this.db.execute(
                'UPDATE vehicles SET state = ?, position = ? WHERE id = ?',
                ['out', JSON.stringify(position), vehicleId]
            );

            // Track as spawned
            this._trackSpawn(vehicleId, vehicle.plate, source, null);

            this.framework.log.debug(`Vehicle ${vehicleId} retrieved from ${vehicle.garage}`);

            // Emit event — client should spawn the actual entity
            this.framework.fivem.emitNet('ng_core:vehicle-spawned', source, vehicle.model, position, vehicle);

            return { success: true, vehicle };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Impound a vehicle
     * @param {number} vehicleId
     */
    async impoundVehicle(vehicleId) {
        this._despawnByVehicleId(vehicleId);

        try {
            await this.db.execute(
                'UPDATE vehicles SET state = ?, position = NULL WHERE id = ?',
                ['impounded', vehicleId]
            );

            this.framework.log.debug(`Vehicle ${vehicleId} impounded`);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ================================
    // Spawn Tracking
    // ================================

    /**
     * Track a spawned vehicle
     * @param {number} vehicleId - DB vehicle ID
     * @param {string} plate
     * @param {number} source - Player who spawned it
     * @param {number|null} netId - Network entity ID (set later by client)
     */
    _trackSpawn(vehicleId, plate, source, netId) {
        const data = { vehicleId, plate, source, netId };

        if (netId) {
            this.spawnedVehicles.set(netId, data);
        }

        this.vehicleNetIds.set(vehicleId, netId);

        if (!this.playerVehicles.has(source)) {
            this.playerVehicles.set(source, new Set());
        }
        this.playerVehicles.get(source).add(vehicleId);
    }

    /**
     * Update netId for a tracked vehicle (called after client spawns entity)
     * @param {number} vehicleId
     * @param {number} netId
     */
    setVehicleNetId(vehicleId, netId) {
        const oldNetId = this.vehicleNetIds.get(vehicleId);
        if (oldNetId) {
            this.spawnedVehicles.delete(oldNetId);
        }

        this.vehicleNetIds.set(vehicleId, netId);

        // Find existing data
        for (const [, data] of this.spawnedVehicles) {
            if (data.vehicleId === vehicleId) {
                data.netId = netId;
                this.spawnedVehicles.set(netId, data);
                return;
            }
        }

        // New entry
        this.spawnedVehicles.set(netId, { vehicleId, netId, plate: null, source: null });
    }

    /**
     * Despawn tracking by vehicleId
     */
    _despawnByVehicleId(vehicleId) {
        const netId = this.vehicleNetIds.get(vehicleId);

        if (netId) {
            this.spawnedVehicles.delete(netId);
        }
        this.vehicleNetIds.delete(vehicleId);

        // Remove from player tracking
        for (const [, vehicles] of this.playerVehicles) {
            vehicles.delete(vehicleId);
        }
    }

    /**
     * Get spawned vehicle data by netId
     * @param {number} netId
     * @returns {Object|null}
     */
    getSpawnedVehicle(netId) {
        return this.spawnedVehicles.get(netId) || null;
    }

    /**
     * Check if a vehicle is currently spawned
     * @param {number} vehicleId
     * @returns {boolean}
     */
    isVehicleSpawned(vehicleId) {
        return this.vehicleNetIds.has(vehicleId);
    }

    // ================================
    // Utilities
    // ================================

    /**
     * Generate a random plate
     * @returns {string} 8-char plate (e.g. "AB12CD34")
     */
    generatePlate() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const digits = '0123456789';
        let plate = '';

        for (let i = 0; i < 8; i++) {
            plate += (i % 2 === 0)
                ? chars[Math.floor(Math.random() * chars.length)]
                : digits[Math.floor(Math.random() * digits.length)];
        }

        return plate;
    }

    /**
     * Parse vehicle row from DB (JSON fields)
     */
    _parseVehicle(row) {
        return {
            ...row,
            position: typeof row.position === 'string' ? JSON.parse(row.position) : row.position,
            customization: typeof row.customization === 'string' ? JSON.parse(row.customization) : row.customization,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
        };
    }

    // ================================
    // RPC Handlers
    // ================================

    /**
     * RPC: Get player's vehicles
     */
    async getPlayerVehiclesRPC(source) {
        const playerManager = this.framework.getModule('player-manager');
        const player = playerManager ? playerManager.get(source) : null;
        if (!player) return [];

        const charManager = this.framework.getModule('character-manager');
        const char = charManager ? charManager.getActiveCharacter(source) : null;
        if (!char) return [];

        return await this.getOwnerVehicles('character', char.id);
    }

    /**
     * RPC: Get vehicle by ID
     */
    async getVehicleRPC(source, vehicleId) {
        return await this.getVehicle(vehicleId);
    }

    // ================================
    // Lifecycle
    // ================================

    /**
     * Handle player disconnect — despawn their vehicles
     */
    _handlePlayerDropped(source) {
        const vehicles = this.playerVehicles.get(source);
        if (!vehicles) return;

        for (const vehicleId of [...vehicles]) {
            this._despawnByVehicleId(vehicleId);
        }

        this.playerVehicles.delete(source);
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.spawnedVehicles.clear();
        this.vehicleNetIds.clear();
        this.playerVehicles.clear();
        this.framework.log.info('Vehicle manager destroyed');
    }
}

module.exports = VehicleManager;

// Self-register
global.Framework.register('vehicle-manager', new VehicleManager(global.Framework), 17);
