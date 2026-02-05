/**
 * NextGen Framework - Access Manager Module
 * Generic access control system — single table `generic_access`
 *
 * Schema: generic_access(id, access_type, resource_id, identifier, granted_by, granted_at, metadata)
 *   access_type  = category of access (vehicle, container, property, door, or any custom type)
 *   resource_id  = target resource identifier
 *   identifier   = who has access (player, org, etc.)
 *   metadata     = JSON (expires_at, locked state, extra data)
 *
 * Convention: identifier='_state' stores resource state (e.g. door locked/unlocked)
 */

class AccessManager {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        // Single unified cache: `type:resourceId` => Map<identifier, metadata>
        this.access = new Map();
    }

    /**
     * Initialize access manager
     */
    async init() {
        this.db = this.framework.getModule('database');

        if (this.db && this.db.isConnected()) {
            await this._loadFromDb();
        } else {
            this.framework.log.warn('Database not available, starting without persistence');
        }

        this.framework.log.info(`Access manager initialized (${this._countEntries()} entries loaded)`);
    }

    // ================================
    // Core CRUD
    // ================================

    /**
     * Grant access
     * @param {string} accessType - Type of access (vehicle, container, property, door, ...)
     * @param {string} resourceId - Resource identifier
     * @param {string} identifier - Who gets access
     * @param {string} [grantedBy='system'] - Who granted the access
     * @param {Object} [metadata={}] - Extra data (expires_at, etc.)
     * @returns {Object} { success } or { success: false, reason }
     */
    async grantAccess(accessType, resourceId, identifier, grantedBy = 'system', metadata = {}) {
        try {
            const metadataJson = JSON.stringify(metadata);

            await this.db.execute(
                `INSERT INTO generic_access (access_type, resource_id, identifier, granted_by, granted_at, metadata)
                 VALUES (?, ?, ?, ?, NOW(), ?)
                 ON DUPLICATE KEY UPDATE metadata = ?, granted_by = ?`,
                [accessType, resourceId, identifier, grantedBy, metadataJson, metadataJson, grantedBy]
            );

            this._cacheSet(accessType, resourceId, identifier, metadata);

            this.framework.log.debug(`Access granted: ${accessType}:${resourceId} to ${identifier}`);
            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to grant access: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Revoke access
     * @param {string} accessType - Type of access
     * @param {string} resourceId - Resource identifier
     * @param {string} identifier - Who loses access
     * @returns {Object}
     */
    async revokeAccess(accessType, resourceId, identifier) {
        try {
            const result = await this.db.execute(
                'DELETE FROM generic_access WHERE access_type = ? AND resource_id = ? AND identifier = ?',
                [accessType, resourceId, identifier]
            );

            if (result.affectedRows === 0) {
                return { success: false, reason: 'access_not_found' };
            }

            this._cacheDelete(accessType, resourceId, identifier);

            this.framework.log.debug(`Access revoked: ${accessType}:${resourceId} from ${identifier}`);
            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to revoke access: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Revoke all access for a resource
     * @param {string} accessType - Type of access
     * @param {string} resourceId - Resource identifier
     * @returns {Object}
     */
    async revokeAllAccess(accessType, resourceId) {
        try {
            await this.db.execute(
                'DELETE FROM generic_access WHERE access_type = ? AND resource_id = ?',
                [accessType, resourceId]
            );

            const key = `${accessType}:${resourceId}`;
            this.access.delete(key);

            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to revoke all access: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    /**
     * Check if identifier has access
     * @param {string} accessType
     * @param {string} resourceId
     * @param {string} identifier
     * @returns {boolean}
     */
    hasAccess(accessType, resourceId, identifier) {
        const key = `${accessType}:${resourceId}`;
        const entries = this.access.get(key);
        if (!entries) return false;

        const meta = entries.get(identifier);
        if (!meta) return false;

        // Check expiration
        if (meta.expires_at) {
            if (new Date(meta.expires_at) < new Date()) {
                entries.delete(identifier);
                return false;
            }
        }

        return true;
    }

    /**
     * Get metadata for an access entry
     * @param {string} accessType
     * @param {string} resourceId
     * @param {string} identifier
     * @returns {Object|null}
     */
    getAccessMetadata(accessType, resourceId, identifier) {
        const key = `${accessType}:${resourceId}`;
        const entries = this.access.get(key);
        if (!entries) return null;
        return entries.get(identifier) || null;
    }

    /**
     * Update metadata for an access entry (merge)
     * @param {string} accessType
     * @param {string} resourceId
     * @param {string} identifier
     * @param {Object} metadata - Key-value pairs to merge
     * @returns {Object}
     */
    async updateMetadata(accessType, resourceId, identifier, metadata) {
        const existing = this.getAccessMetadata(accessType, resourceId, identifier);
        if (!existing) return { success: false, reason: 'access_not_found' };

        const merged = { ...existing, ...metadata };

        try {
            await this.db.execute(
                'UPDATE generic_access SET metadata = ? WHERE access_type = ? AND resource_id = ? AND identifier = ?',
                [JSON.stringify(merged), accessType, resourceId, identifier]
            );

            this._cacheSet(accessType, resourceId, identifier, merged);
            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to update metadata: ${error.message}`);
            return { success: false, reason: 'database_error' };
        }
    }

    // ================================
    // Query
    // ================================

    /**
     * Get all identifiers with access to a resource
     * @param {string} accessType
     * @param {string} resourceId
     * @returns {Array<string>}
     */
    getAccessHolders(accessType, resourceId) {
        const key = `${accessType}:${resourceId}`;
        const entries = this.access.get(key);
        if (!entries) return [];

        const holders = [];
        for (const [identifier] of entries) {
            if (identifier !== '_state') holders.push(identifier);
        }
        return holders;
    }

    /**
     * Get all resources an identifier has access to (by type)
     * @param {string} accessType
     * @param {string} identifier
     * @returns {Array<string>} resource IDs
     */
    getAccessByIdentifier(accessType, identifier) {
        const resources = [];
        const prefix = `${accessType}:`;

        for (const [key, entries] of this.access) {
            if (key.startsWith(prefix) && entries.has(identifier)) {
                resources.push(key.slice(prefix.length));
            }
        }

        return resources;
    }

    /**
     * Get all access entries for a player (all types)
     * @param {string} identifier
     * @returns {Array<{accessType, resourceId}>}
     */
    getPlayerAccess(identifier) {
        const result = [];

        for (const [key, entries] of this.access) {
            if (entries.has(identifier)) {
                const idx = key.indexOf(':');
                if (idx === -1) continue;
                result.push({
                    accessType: key.slice(0, idx),
                    resourceId: key.slice(idx + 1)
                });
            }
        }

        return result;
    }

    // ================================
    // Door Convenience Methods
    // ================================

    /**
     * Register a door (stores state in metadata)
     * @param {string} doorId
     * @param {string} owner
     * @param {boolean} [locked=true]
     */
    async registerDoor(doorId, owner, locked = true) {
        return this.grantAccess('door', doorId, '_state', 'system', {
            locked, owner
        });
    }

    /**
     * Toggle door lock state
     * @param {string} doorId
     * @param {string} identifier - Who is toggling
     */
    async toggleDoorLock(doorId, identifier) {
        const state = this.getAccessMetadata('door', doorId, '_state');
        if (!state) return { success: false, reason: 'door_not_found' };

        // Check access: owner or has door access
        if (state.owner !== identifier && !this.hasAccess('door', doorId, identifier)) {
            return { success: false, reason: 'access_denied' };
        }

        const newLocked = !state.locked;

        const result = await this.updateMetadata('door', doorId, '_state', {
            locked: newLocked,
            last_toggled_at: new Date().toISOString(),
            last_toggled_by: identifier
        });

        if (result.success) {
            this.framework.fivem.emitNet('ng_core|access/door-state-changed', -1, doorId, newLocked);
            this.framework.log.debug(`Door ${doorId} ${newLocked ? 'locked' : 'unlocked'} by ${identifier}`);
        }

        return { success: result.success, locked: newLocked };
    }

    /**
     * Get door state
     * @param {string} doorId
     * @returns {{ locked: boolean, owner: string|null }}
     */
    getDoorState(doorId) {
        const state = this.getAccessMetadata('door', doorId, '_state');
        if (!state) return { locked: true, owner: null };
        return { locked: !!state.locked, owner: state.owner || null };
    }

    /**
     * Check if door is locked
     * @param {string} doorId
     * @returns {boolean}
     */
    isDoorLocked(doorId) {
        const state = this.getAccessMetadata('door', doorId, '_state');
        return state ? !!state.locked : true;
    }

    // ================================
    // Internal
    // ================================

    /**
     * Load all access from database
     */
    async _loadFromDb() {
        try {
            const rows = await this.db.query(
                'SELECT access_type, resource_id, identifier, metadata FROM generic_access'
            );

            this.access.clear();
            for (const row of rows) {
                const meta = this._parseJson(row.metadata);
                this._cacheSet(row.access_type, row.resource_id, row.identifier, meta);
            }

            this.framework.log.debug(`Loaded ${rows.length} access entries`);
        } catch (error) {
            this.framework.log.error(`Failed to load access data: ${error.message}`);
        }
    }

    _cacheSet(accessType, resourceId, identifier, metadata) {
        const key = `${accessType}:${resourceId}`;
        if (!this.access.has(key)) {
            this.access.set(key, new Map());
        }
        this.access.get(key).set(identifier, metadata || {});
    }

    _cacheDelete(accessType, resourceId, identifier) {
        const key = `${accessType}:${resourceId}`;
        const entries = this.access.get(key);
        if (entries) {
            entries.delete(identifier);
            if (entries.size === 0) this.access.delete(key);
        }
    }

    _countEntries() {
        let count = 0;
        for (const entries of this.access.values()) {
            count += entries.size;
        }
        return count;
    }

    _parseJson(value) {
        if (!value) return {};
        return typeof value === 'string' ? JSON.parse(value) : value;
    }

    /**
     * Reload all data
     */
    async reload() {
        await this._loadFromDb();
        this.framework.log.info('Access manager data reloaded');
    }

    /**
     * Get statistics
     */
    getStats() {
        const stats = {};
        for (const [key, entries] of this.access) {
            const type = key.split(':')[0];
            stats[type] = (stats[type] || 0) + entries.size;
        }
        stats.total = this._countEntries();
        return stats;
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.access.clear();
        this.framework.log.info('Access manager destroyed');
    }
}

module.exports = AccessManager;

// Self-register
global.Framework.register('access-manager', new AccessManager(global.Framework), 11);
