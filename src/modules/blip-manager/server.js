/**
 * NextGen Framework - Blip Manager Module (Server)
 * In-memory map blip management with categories and client sync
 * No database — plugins register blips via API at runtime
 */

class BlipManager {
    constructor(framework) {
        this.framework = framework;

        // All blips: id => blipData
        this.blips = new Map();

        // Category state: category => boolean (active)
        this.categories = new Map();

        // Auto-increment ID
        this.nextId = 1;

        // Temp blip timers: id => timer
        this.tempTimers = new Map();
    }

    /**
     * Initialize blip manager
     */
    async init() {
        // Sync blips to players on connect
        this.framework.fivem.onNet('ng_core|blips/request-all', () => {
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

        this.framework.log.info('Blip manager initialized');
    }

    // ================================
    // CRUD Operations
    // ================================

    /**
     * Create a blip
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
    createBlip(data) {
        const id = this.nextId++;

        const blip = {
            id,
            name: data.name || `blip_${id}`,
            label: data.label || data.name || '',
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

        this.blips.set(id, blip);
        this._broadcastBlipAdd(blip);

        this.framework.log.debug(`Blip created: ${blip.name} (id: ${id})`);
        return { success: true, id };
    }

    /**
     * Create a temporary blip that auto-removes
     * @param {Object} data - Blip data
     * @param {number} duration - Duration in ms before removal
     * @returns {Object} { success, id }
     */
    createTempBlip(data, duration = 60000) {
        const result = this.createBlip({ ...data, type: 'temp' });
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
     * @returns {Object}
     */
    removeBlip(id) {
        if (!this.blips.has(id)) return { success: false, reason: 'not_found' };

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
     * @returns {Object}
     */
    updateBlip(id, data) {
        const blip = this.blips.get(id);
        if (!blip) return { success: false, reason: 'not_found' };

        const allowed = ['label', 'x', 'y', 'z', 'sprite', 'color', 'scale', 'shortRange', 'category', 'properties', 'isActive'];
        for (const key of allowed) {
            if (data[key] !== undefined) {
                blip[key] = data[key];
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
        this.framework.fivem.emitNet('ng_core|blips/sync-all', source, blips);
    }

    _broadcastBlipAdd(blip) {
        this.framework.fivem.emitNet('ng_core|blips/add', -1, blip);
    }

    _broadcastBlipRemove(id) {
        this.framework.fivem.emitNet('ng_core|blips/remove', -1, id);
    }

    _broadcastBlipUpdate(blip) {
        this.framework.fivem.emitNet('ng_core|blips/update', -1, blip);
    }

    // ================================
    // Cleanup
    // ================================

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
