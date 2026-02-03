/**
 * NextGen Framework - Blip Manager Module (Server)
 * Persistent map blip management with categories and client sync
 */

class BlipManager {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        // All blips: id => blipData
        this.blips = new Map();

        // Category state: category => boolean (active)
        this.categories = new Map();

        // Auto-increment for runtime blips (negative IDs to distinguish from DB)
        this.runtimeId = -1;

        // Temp blip timers: id => timer
        this.tempTimers = new Map();
    }

    /**
     * Initialize blip manager
     */
    async init() {
        this.db = this.framework.getModule('database');

        // Load persistent blips from DB
        await this._loadFromDb();

        // Sync blips to players on connect
        this.framework.fivem.onNet('ng_core:blips:requestAll', () => {
            const src = global.source;
            this._syncToPlayer(src);
        });

        // RPC handlers
        const rpc = this.framework.getModule('rpc');
        if (rpc) {
            rpc.register('blips:getAll', () => {
                return this.getAllBlips();
            });
            rpc.register('blips:getByCategory', (source, category) => {
                return this.getBlipsByCategory(category);
            });
        }

        this.framework.log.info(`Blip manager initialized (${this.blips.size} blips loaded)`);
    }

    // ================================
    // CRUD Operations
    // ================================

    /**
     * Create a persistent blip (saved to DB)
     * @param {Object} data - Blip data
     * @param {string} data.name - Internal name
     * @param {string} [data.label] - Display label
     * @param {string} [data.type='static'] - Blip type
     * @param {string} [data.category='default'] - Category
     * @param {number} data.x - X coordinate
     * @param {number} data.y - Y coordinate
     * @param {number} data.z - Z coordinate
     * @param {number} [data.sprite=1] - GTA blip sprite
     * @param {number} [data.color=0] - GTA blip color
     * @param {number} [data.scale=1.0] - Blip scale
     * @param {boolean} [data.shortRange=true] - Short range only
     * @param {Object} [data.properties] - Extra properties
     * @returns {Object} { success, id }
     */
    async createBlip(data) {
        try {
            const result = await this.db.execute(
                `INSERT INTO ui_blips (name, label, type, category, x, y, z, sprite, color, scale, short_range, properties)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.name,
                    data.label || data.name,
                    data.type || 'static',
                    data.category || 'default',
                    data.x, data.y, data.z,
                    data.sprite || 1,
                    data.color || 0,
                    data.scale || 1.0,
                    data.shortRange !== false ? 1 : 0,
                    JSON.stringify(data.properties || {})
                ]
            );

            const blip = {
                id: result.insertId,
                name: data.name,
                label: data.label || data.name,
                type: data.type || 'static',
                category: data.category || 'default',
                x: data.x, y: data.y, z: data.z,
                sprite: data.sprite || 1,
                color: data.color || 0,
                scale: data.scale || 1.0,
                shortRange: data.shortRange !== false,
                properties: data.properties || {},
                isActive: true
            };

            this.blips.set(blip.id, blip);
            this._broadcastBlipAdd(blip);

            this.framework.log.debug(`Blip created: ${blip.name} (id: ${blip.id})`);
            return { success: true, id: blip.id };
        } catch (error) {
            this.framework.log.error(`Failed to create blip: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a runtime-only blip (not saved to DB)
     * @param {Object} data - Same as createBlip
     * @returns {Object} { success, id }
     */
    createRuntimeBlip(data) {
        const id = this.runtimeId--;

        const blip = {
            id,
            name: data.name || `runtime_${Math.abs(id)}`,
            label: data.label || data.name || '',
            type: data.type || 'dynamic',
            category: data.category || 'default',
            x: data.x, y: data.y, z: data.z,
            sprite: data.sprite || 1,
            color: data.color || 0,
            scale: data.scale || 1.0,
            shortRange: data.shortRange !== false,
            properties: data.properties || {},
            isActive: true
        };

        this.blips.set(id, blip);
        this._broadcastBlipAdd(blip);

        return { success: true, id };
    }

    /**
     * Create a temporary blip that auto-removes
     * @param {Object} data - Blip data
     * @param {number} duration - Duration in ms before removal
     * @returns {Object} { success, id }
     */
    createTempBlip(data, duration = 60000) {
        const result = this.createRuntimeBlip(data);
        if (!result.success) return result;

        const timer = setTimeout(() => {
            this.removeBlip(result.id);
            this.tempTimers.delete(result.id);
        }, duration);

        this.tempTimers.set(result.id, timer);
        return result;
    }

    /**
     * Remove a blip
     * @param {number} id - Blip ID
     */
    async removeBlip(id) {
        const blip = this.blips.get(id);
        if (!blip) return { success: false, reason: 'not_found' };

        // Remove from DB if persistent (positive ID)
        if (id > 0 && this.db) {
            try {
                await this.db.execute('DELETE FROM ui_blips WHERE id = ?', [id]);
            } catch (error) {
                this.framework.log.error(`Failed to delete blip from DB: ${error.message}`);
            }
        }

        // Clear temp timer if exists
        const timer = this.tempTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.tempTimers.delete(id);
        }

        this.blips.delete(id);
        this._broadcastBlipRemove(id);

        return { success: true };
    }

    /**
     * Update a blip
     * @param {number} id - Blip ID
     * @param {Object} data - Fields to update
     */
    async updateBlip(id, data) {
        const blip = this.blips.get(id);
        if (!blip) return { success: false, reason: 'not_found' };

        // Update fields
        const allowed = ['label', 'x', 'y', 'z', 'sprite', 'color', 'scale', 'shortRange', 'category', 'properties', 'isActive'];
        for (const key of allowed) {
            if (data[key] !== undefined) {
                blip[key] = data[key];
            }
        }

        // Persist if DB blip
        if (id > 0 && this.db) {
            try {
                await this.db.execute(
                    `UPDATE ui_blips SET label = ?, x = ?, y = ?, z = ?, sprite = ?, color = ?, scale = ?,
                     short_range = ?, category = ?, properties = ?, is_active = ? WHERE id = ?`,
                    [
                        blip.label, blip.x, blip.y, blip.z,
                        blip.sprite, blip.color, blip.scale,
                        blip.shortRange ? 1 : 0,
                        blip.category,
                        JSON.stringify(blip.properties || {}),
                        blip.isActive ? 1 : 0,
                        id
                    ]
                );
            } catch (error) {
                this.framework.log.error(`Failed to update blip in DB: ${error.message}`);
            }
        }

        this._broadcastBlipUpdate(blip);
        return { success: true };
    }

    // ================================
    // Queries
    // ================================

    /**
     * Get all active blips
     * @returns {Array}
     */
    getAllBlips() {
        const result = [];
        for (const blip of this.blips.values()) {
            if (blip.isActive) result.push(blip);
        }
        return result;
    }

    /**
     * Get blips by category
     * @param {string} category
     * @returns {Array}
     */
    getBlipsByCategory(category) {
        const result = [];
        for (const blip of this.blips.values()) {
            if (blip.category === category && blip.isActive) {
                result.push(blip);
            }
        }
        return result;
    }

    /**
     * Get a blip by ID
     * @param {number} id
     * @returns {Object|null}
     */
    getBlip(id) {
        return this.blips.get(id) || null;
    }

    // ================================
    // Client Sync
    // ================================

    /**
     * Sync all blips to a specific player
     */
    _syncToPlayer(source) {
        const blips = this.getAllBlips();
        this.framework.fivem.emitNet('ng_core:blips:syncAll', source, blips);
    }

    /**
     * Broadcast blip add to all clients
     */
    _broadcastBlipAdd(blip) {
        this.framework.fivem.emitNet('ng_core:blips:add', -1, blip);
    }

    /**
     * Broadcast blip remove to all clients
     */
    _broadcastBlipRemove(id) {
        this.framework.fivem.emitNet('ng_core:blips:remove', -1, id);
    }

    /**
     * Broadcast blip update to all clients
     */
    _broadcastBlipUpdate(blip) {
        this.framework.fivem.emitNet('ng_core:blips:update', -1, blip);
    }

    // ================================
    // Internal
    // ================================

    /**
     * Load persistent blips from database
     */
    async _loadFromDb() {
        if (!this.db || !this.db.isConnected()) return;

        try {
            const rows = await this.db.query('SELECT * FROM ui_blips WHERE is_active = 1');

            for (const row of rows) {
                this.blips.set(row.id, {
                    id: row.id,
                    name: row.name,
                    label: row.label,
                    type: row.type,
                    category: row.category,
                    x: row.x, y: row.y, z: row.z,
                    sprite: row.sprite,
                    color: row.color,
                    scale: row.scale,
                    shortRange: !!row.short_range,
                    properties: typeof row.properties === 'string' ? JSON.parse(row.properties) : (row.properties || {}),
                    isActive: true
                });
            }
        } catch (error) {
            this.framework.log.error(`Failed to load blips from DB: ${error.message}`);
        }
    }

    /**
     * Cleanup
     */
    async destroy() {
        for (const timer of this.tempTimers.values()) {
            clearTimeout(timer);
        }
        this.tempTimers.clear();
        this.blips.clear();
        this.categories.clear();
        this.framework.log.info('Blip manager destroyed');
    }
}

module.exports = BlipManager;

// Self-register
global.Framework.register('blip-manager', new BlipManager(global.Framework), 14);
