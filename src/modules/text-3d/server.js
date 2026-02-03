/**
 * NextGen Framework - 3D Text Module (Server)
 * Persistent 3D text points with groups and client sync
 */

class Text3DManager {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        // All points: id => pointData
        this.points = new Map();

        // Group visibility: groupName => boolean
        this.groups = new Map();

        // Auto-increment for runtime points (negative IDs)
        this.runtimeId = -1;
    }

    /**
     * Initialize 3D text manager
     */
    async init() {
        this.db = this.framework.getModule('database');

        // Load persistent points from DB
        await this._loadFromDb();

        // Sync points to players on connect
        this.framework.fivem.onNet('ng_core:text3d:requestAll', () => {
            const src = global.source;
            this._syncToPlayer(src);
        });

        // RPC handlers
        const rpc = this.framework.getModule('rpc');
        if (rpc) {
            rpc.register('text3d:getAll', () => {
                return this.getAllPoints();
            });
        }

        this.framework.log.info(`3D text manager initialized (${this.points.size} points loaded)`);
    }

    // ================================
    // CRUD Operations
    // ================================

    /**
     * Create a persistent 3D text point (saved to DB)
     * @param {Object} data
     * @param {string} data.text - Text to display
     * @param {number} data.x - X coordinate
     * @param {number} data.y - Y coordinate
     * @param {number} data.z - Z coordinate
     * @param {string} [data.group='default'] - Group name
     * @param {number} [data.font=0] - GTA font ID
     * @param {number} [data.scale=0.35] - Text scale
     * @param {Object} [data.color] - { r, g, b, a }
     * @param {number} [data.renderDistance=20.0] - Max render distance
     * @returns {Object} { success, id }
     */
    async createPoint(data) {
        const color = data.color || { r: 255, g: 255, b: 255, a: 255 };

        try {
            const result = await this.db.execute(
                `INSERT INTO text3d_points (text, x, y, z, group_name, font, scale, color_r, color_g, color_b, color_a, render_distance)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.text,
                    data.x, data.y, data.z,
                    data.group || 'default',
                    data.font || 0,
                    data.scale || 0.35,
                    color.r, color.g, color.b, color.a,
                    data.renderDistance || 20.0
                ]
            );

            const point = {
                id: result.insertId,
                text: data.text,
                x: data.x, y: data.y, z: data.z,
                group: data.group || 'default',
                font: data.font || 0,
                scale: data.scale || 0.35,
                color,
                renderDistance: data.renderDistance || 20.0,
                isActive: true
            };

            this.points.set(point.id, point);
            this._broadcastPointAdd(point);

            this.framework.log.debug(`3D text created: "${data.text}" (id: ${point.id})`);
            return { success: true, id: point.id };
        } catch (error) {
            this.framework.log.error(`Failed to create 3D text: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a runtime-only 3D text point (not saved to DB)
     * @param {Object} data - Same as createPoint
     * @returns {Object} { success, id }
     */
    createRuntimePoint(data) {
        const id = this.runtimeId--;
        const color = data.color || { r: 255, g: 255, b: 255, a: 255 };

        const point = {
            id,
            text: data.text,
            x: data.x, y: data.y, z: data.z,
            group: data.group || 'default',
            font: data.font || 0,
            scale: data.scale || 0.35,
            color,
            renderDistance: data.renderDistance || 20.0,
            isActive: true
        };

        this.points.set(id, point);
        this._broadcastPointAdd(point);

        return { success: true, id };
    }

    /**
     * Remove a 3D text point
     * @param {number} id
     */
    async removePoint(id) {
        if (!this.points.has(id)) return { success: false, reason: 'not_found' };

        // Delete from DB if persistent
        if (id > 0 && this.db) {
            try {
                await this.db.execute('DELETE FROM text3d_points WHERE id = ?', [id]);
            } catch (error) {
                this.framework.log.error(`Failed to delete 3D text from DB: ${error.message}`);
            }
        }

        this.points.delete(id);
        this._broadcastPointRemove(id);

        return { success: true };
    }

    /**
     * Update a 3D text point
     * @param {number} id
     * @param {Object} data - Fields to update
     */
    async updatePoint(id, data) {
        const point = this.points.get(id);
        if (!point) return { success: false, reason: 'not_found' };

        // Update fields
        if (data.text !== undefined) point.text = data.text;
        if (data.x !== undefined) point.x = data.x;
        if (data.y !== undefined) point.y = data.y;
        if (data.z !== undefined) point.z = data.z;
        if (data.group !== undefined) point.group = data.group;
        if (data.font !== undefined) point.font = data.font;
        if (data.scale !== undefined) point.scale = data.scale;
        if (data.color !== undefined) point.color = data.color;
        if (data.renderDistance !== undefined) point.renderDistance = data.renderDistance;
        if (data.isActive !== undefined) point.isActive = data.isActive;

        // Persist if DB point
        if (id > 0 && this.db) {
            try {
                await this.db.execute(
                    `UPDATE text3d_points SET text = ?, x = ?, y = ?, z = ?, group_name = ?, font = ?,
                     scale = ?, color_r = ?, color_g = ?, color_b = ?, color_a = ?, render_distance = ?, is_active = ?
                     WHERE id = ?`,
                    [
                        point.text, point.x, point.y, point.z,
                        point.group, point.font, point.scale,
                        point.color.r, point.color.g, point.color.b, point.color.a,
                        point.renderDistance, point.isActive ? 1 : 0, id
                    ]
                );
            } catch (error) {
                this.framework.log.error(`Failed to update 3D text in DB: ${error.message}`);
            }
        }

        this._broadcastPointUpdate(point);
        return { success: true };
    }

    // ================================
    // Groups
    // ================================

    /**
     * Toggle group visibility
     * @param {string} groupName
     * @param {boolean} visible
     */
    toggleGroup(groupName, visible) {
        this.groups.set(groupName, visible);
        this.framework.fivem.emitNet('ng_core:text3d:groupToggle', -1, groupName, visible);
    }

    /**
     * Check if a group is visible
     * @param {string} groupName
     * @returns {boolean}
     */
    isGroupVisible(groupName) {
        return this.groups.get(groupName) !== false;
    }

    // ================================
    // Queries
    // ================================

    /**
     * Get all active points
     * @returns {Array}
     */
    getAllPoints() {
        const result = [];
        for (const point of this.points.values()) {
            if (point.isActive && this.isGroupVisible(point.group)) {
                result.push(point);
            }
        }
        return result;
    }

    /**
     * Get a point by ID
     * @param {number} id
     * @returns {Object|null}
     */
    getPoint(id) {
        return this.points.get(id) || null;
    }

    // ================================
    // Client Sync
    // ================================

    _syncToPlayer(source) {
        const points = this.getAllPoints();
        const groupStates = Object.fromEntries(this.groups);
        this.framework.fivem.emitNet('ng_core:text3d:syncAll', source, points, groupStates);
    }

    _broadcastPointAdd(point) {
        this.framework.fivem.emitNet('ng_core:text3d:add', -1, point);
    }

    _broadcastPointRemove(id) {
        this.framework.fivem.emitNet('ng_core:text3d:remove', -1, id);
    }

    _broadcastPointUpdate(point) {
        this.framework.fivem.emitNet('ng_core:text3d:update', -1, point);
    }

    // ================================
    // Internal
    // ================================

    async _loadFromDb() {
        if (!this.db || !this.db.isConnected()) return;

        try {
            const rows = await this.db.query('SELECT * FROM text3d_points WHERE is_active = 1');

            for (const row of rows) {
                this.points.set(row.id, {
                    id: row.id,
                    text: row.text,
                    x: row.x, y: row.y, z: row.z,
                    group: row.group_name,
                    font: row.font,
                    scale: row.scale,
                    color: { r: row.color_r, g: row.color_g, b: row.color_b, a: row.color_a },
                    renderDistance: row.render_distance,
                    isActive: true
                });
            }
        } catch (error) {
            this.framework.log.error(`Failed to load 3D text from DB: ${error.message}`);
        }
    }

    async destroy() {
        this.points.clear();
        this.groups.clear();
        this.framework.log.info('3D text manager destroyed');
    }
}

module.exports = Text3DManager;

// Self-register
global.Framework.register('text-3d', new Text3DManager(global.Framework), 14);
