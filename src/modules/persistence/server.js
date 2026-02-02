/**
 * NextGen Framework - Persistence Module
 * World entity lifecycle manager (objects, vehicles, peds)
 *
 * Responsibilities:
 * - Track world entities registered by modules/plugins
 * - Periodic position save for moving entities (dirty flag)
 * - On-demand save for static entities and metadata changes
 * - Respawn all persisted entities on server start
 * - Respawn entities despawned by OneSync
 */

const VALID_TYPES = ['vehicle', 'ped', 'object'];

class PersistenceManager {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        // Tracked entities: persistenceId => entity data
        this.entities = new Map();

        // netId => persistenceId reverse lookup
        this.netIdIndex = new Map();

        // Dirty flags for position changes
        this.dirtyPosition = new Set(); // Set of persistenceId

        // Dirty flags for metadata changes
        this.dirtyMetadata = new Set(); // Set of persistenceId

        // Save interval handle
        this.saveIntervalId = null;

        // OneSync check interval handle
        this.checkIntervalId = null;

        // Configuration
        this.config = {
            saveInterval: 30000,       // 30s default position save
            checkInterval: 10000,      // 10s check for despawned entities
            maxRetries: 3
        };
    }

    async init() {
        this.db = this.framework.getModule('database');

        if (this.db?.isConnected()) {
            await this.loadFromDB();
        }

        this.startIntervals();
        this.registerEvents();

        this.framework.log.info(`Persistence manager initialized (${this.entities.size} entities loaded)`);
    }

    /**
     * Load all persisted entities from DB and spawn them
     */
    async loadFromDB() {
        const rows = await this.db.query('SELECT * FROM persistent_entities');
        if (!rows || rows.length === 0) return;

        for (const row of rows) {
            const netId = await this.spawnEntity(row.type, row.model, row.x, row.y, row.z, row.heading);
            if (netId === null) continue;

            const entity = {
                id: row.id,
                type: row.type,
                model: row.model,
                coords: { x: row.x, y: row.y, z: row.z },
                heading: row.heading,
                metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
                netId,
                static: false,
                createdBy: row.created_by
            };

            this.entities.set(row.id, entity);
            this.netIdIndex.set(netId, row.id);

            // Notify modules to apply their metadata
            this.framework.emit('persistence:spawned', {
                id: row.id,
                type: row.type,
                model: row.model,
                netId,
                metadata: entity.metadata
            });
        }
    }

    /**
     * Spawn a GTA entity by type
     * @param {string} type - vehicle, ped, object
     * @param {string} model - Model name or hash
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} heading
     * @returns {number|null} netId or null on failure
     */
    async spawnEntity(type, model, x, y, z, heading) {
        try {
            const hash = typeof model === 'string' ? GetHashKey(model) : model;

            let entityId;
            switch (type) {
                case 'vehicle':
                    entityId = CreateVehicle(hash, x, y, z, heading, true, true);
                    break;
                case 'ped':
                    entityId = CreatePed(4, hash, x, y, z, heading, true, true);
                    break;
                case 'object':
                    entityId = CreateObject(hash, x, y, z, true, true, false);
                    break;
                default:
                    this.framework.log.error(`Unknown entity type: ${type}`);
                    return null;
            }

            if (!entityId || entityId === 0) {
                this.framework.log.error(`Failed to spawn ${type} (model: ${model})`);
                return null;
            }

            return NetworkGetNetworkIdFromEntity(entityId);
        } catch (error) {
            this.framework.log.error(`Spawn error for ${type}: ${error.message}`);
            return null;
        }
    }

    registerEvents() {
        this.framework.fivem.on('onResourceStop', async (resourceName) => {
            if (resourceName === GetCurrentResourceName()) {
                await this.saveAll();
            }
        });
    }

    startIntervals() {
        // Periodic position save for moving entities
        this.saveIntervalId = setInterval(async () => {
            await this.saveDirtyPositions();
        }, this.config.saveInterval);

        // Check for despawned entities (OneSync)
        this.checkIntervalId = setInterval(() => {
            this.checkDespawned();
        }, this.config.checkInterval);
    }

    /**
     * Register a world entity for persistence
     * @param {number} netId - Network entity ID
     * @param {Object} data - { type, model, coords, heading, metadata }
     * @param {Object} options - { static, saveInterval }
     * @returns {number|null} persistenceId
     */
    async register(netId, data, options = {}) {
        if (!VALID_TYPES.includes(data.type)) {
            this.framework.log.error(`Invalid entity type: ${data.type}`);
            return null;
        }

        const isStatic = options.static || false;

        // Insert into DB
        let id = null;
        if (this.db?.isConnected()) {
            const result = await this.db.execute(
                'INSERT INTO persistent_entities (type, model, x, y, z, heading, metadata, net_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    data.type,
                    data.model,
                    data.coords.x,
                    data.coords.y,
                    data.coords.z,
                    data.heading || 0,
                    JSON.stringify(data.metadata || {}),
                    netId,
                    data.createdBy || null
                ]
            );
            id = result.insertId;
        }

        if (!id) return null;

        const entity = {
            id,
            type: data.type,
            model: data.model,
            coords: { ...data.coords },
            heading: data.heading || 0,
            metadata: data.metadata || {},
            netId,
            static: isStatic,
            createdBy: data.createdBy || null
        };

        this.entities.set(id, entity);
        this.netIdIndex.set(netId, id);

        this.framework.log.debug(`Registered ${data.type} (id: ${id}, netId: ${netId})`);
        return id;
    }

    /**
     * Save entity immediately (position + metadata)
     * @param {number} id - Persistence ID
     */
    async save(id) {
        const entity = this.entities.get(id);
        if (!entity) return false;

        this.updateEntityPosition(entity);

        if (!this.db?.isConnected()) return false;

        await this.db.execute(
            'UPDATE persistent_entities SET x = ?, y = ?, z = ?, heading = ?, metadata = ?, net_id = ?, updated_at = NOW() WHERE id = ?',
            [entity.coords.x, entity.coords.y, entity.coords.z, entity.heading, JSON.stringify(entity.metadata), entity.netId, entity.id]
        );

        this.dirtyPosition.delete(id);
        this.dirtyMetadata.delete(id);
        return true;
    }

    /**
     * Remove a persisted entity
     * @param {number} id - Persistence ID
     */
    async remove(id) {
        const entity = this.entities.get(id);
        if (!entity) return false;

        if (this.db?.isConnected()) {
            await this.db.execute('DELETE FROM persistent_entities WHERE id = ?', [id]);
        }

        this.netIdIndex.delete(entity.netId);
        this.entities.delete(id);
        this.dirtyPosition.delete(id);
        this.dirtyMetadata.delete(id);

        this.framework.log.debug(`Removed ${entity.type} (id: ${id})`);
        return true;
    }

    /**
     * Update entity metadata (marks dirty for next save)
     * @param {number} id - Persistence ID
     * @param {Object} metadata - New metadata (merged)
     */
    updateMetadata(id, metadata) {
        const entity = this.entities.get(id);
        if (!entity) return false;

        entity.metadata = { ...entity.metadata, ...metadata };
        this.dirtyMetadata.add(id);
        return true;
    }

    /**
     * Get all entities of a type
     * @param {string} type
     * @returns {Array}
     */
    getByType(type) {
        const results = [];
        for (const entity of this.entities.values()) {
            if (entity.type === type) results.push(entity);
        }
        return results;
    }

    /**
     * Get entity by persistence ID
     * @param {number} id
     * @returns {Object|null}
     */
    get(id) {
        return this.entities.get(id) || null;
    }

    /**
     * Get entity by netId
     * @param {number} netId
     * @returns {Object|null}
     */
    getByNetId(netId) {
        const id = this.netIdIndex.get(netId);
        if (id === undefined) return null;
        return this.entities.get(id) || null;
    }

    /**
     * Read current position from GTA entity and update in-memory
     * @param {Object} entity
     */
    updateEntityPosition(entity) {
        if (!entity.netId) return;

        const entityId = NetworkGetEntityFromNetworkId(entity.netId);
        if (!entityId || entityId === 0) return;

        const coords = GetEntityCoords(entityId);
        const heading = GetEntityHeading(entityId);

        if (coords[0] !== entity.coords.x || coords[1] !== entity.coords.y || coords[2] !== entity.coords.z) {
            entity.coords = { x: coords[0], y: coords[1], z: coords[2] };
            entity.heading = heading;
            this.dirtyPosition.add(entity.id);
        }
    }

    /**
     * Save all dirty positions to DB (periodic)
     */
    async saveDirtyPositions() {
        if (!this.db?.isConnected()) return;

        // Update positions from GTA for non-static entities
        for (const entity of this.entities.values()) {
            if (!entity.static) {
                this.updateEntityPosition(entity);
            }
        }

        // Batch save dirty positions
        const dirtyIds = [...this.dirtyPosition];
        if (dirtyIds.length === 0 && this.dirtyMetadata.size === 0) return;

        for (const id of dirtyIds) {
            const entity = this.entities.get(id);
            if (!entity) continue;

            const includeMetadata = this.dirtyMetadata.has(id);

            if (includeMetadata) {
                await this.db.execute(
                    'UPDATE persistent_entities SET x = ?, y = ?, z = ?, heading = ?, metadata = ?, updated_at = NOW() WHERE id = ?',
                    [entity.coords.x, entity.coords.y, entity.coords.z, entity.heading, JSON.stringify(entity.metadata), id]
                );
                this.dirtyMetadata.delete(id);
            } else {
                await this.db.execute(
                    'UPDATE persistent_entities SET x = ?, y = ?, z = ?, heading = ?, updated_at = NOW() WHERE id = ?',
                    [entity.coords.x, entity.coords.y, entity.coords.z, entity.heading, id]
                );
            }
        }

        this.dirtyPosition.clear();

        // Save remaining dirty metadata (entities not in dirtyPosition)
        for (const id of [...this.dirtyMetadata]) {
            const entity = this.entities.get(id);
            if (!entity) continue;

            await this.db.execute(
                'UPDATE persistent_entities SET metadata = ?, updated_at = NOW() WHERE id = ?',
                [JSON.stringify(entity.metadata), id]
            );
        }

        this.dirtyMetadata.clear();

        if (dirtyIds.length > 0) {
            this.framework.log.debug(`Saved ${dirtyIds.length} dirty positions`);
        }
    }

    /**
     * Check for despawned entities and respawn them
     */
    checkDespawned() {
        for (const entity of this.entities.values()) {
            if (!entity.netId) continue;

            const entityId = NetworkGetEntityFromNetworkId(entity.netId);
            if (entityId && entityId !== 0 && DoesEntityExist(entityId)) continue;

            // Entity despawned by OneSync - respawn
            this.respawnEntity(entity);
        }
    }

    /**
     * Respawn a despawned entity
     * @param {Object} entity
     */
    async respawnEntity(entity) {
        this.framework.log.debug(`Respawning ${entity.type} (id: ${entity.id})`);

        // Remove old netId mapping
        this.netIdIndex.delete(entity.netId);

        const newNetId = await this.spawnEntity(entity.type, entity.model, entity.coords.x, entity.coords.y, entity.coords.z, entity.heading);
        if (newNetId === null) {
            entity.netId = null;
            return;
        }

        entity.netId = newNetId;
        this.netIdIndex.set(newNetId, entity.id);

        // Notify modules to re-apply metadata
        this.framework.emit('persistence:spawned', {
            id: entity.id,
            type: entity.type,
            model: entity.model,
            netId: newNetId,
            metadata: entity.metadata
        });
    }

    /**
     * Save all entities to DB
     */
    async saveAll() {
        if (!this.db?.isConnected()) return;

        // Update all non-static positions
        for (const entity of this.entities.values()) {
            if (!entity.static) {
                this.updateEntityPosition(entity);
            }
        }

        // Batch save all
        const promises = [];
        for (const entity of this.entities.values()) {
            promises.push(
                this.db.execute(
                    'UPDATE persistent_entities SET x = ?, y = ?, z = ?, heading = ?, metadata = ?, net_id = ?, updated_at = NOW() WHERE id = ?',
                    [entity.coords.x, entity.coords.y, entity.coords.z, entity.heading, JSON.stringify(entity.metadata), entity.netId, entity.id]
                ).catch(err => this.framework.log.error(`Save failed for entity ${entity.id}: ${err.message}`))
            );
        }

        await Promise.all(promises);

        this.dirtyPosition.clear();
        this.dirtyMetadata.clear();

        this.framework.log.info(`Saved ${this.entities.size} entities`);
    }

    /**
     * Get status/stats
     */
    getStatus() {
        const byType = {};
        for (const entity of this.entities.values()) {
            byType[entity.type] = (byType[entity.type] || 0) + 1;
        }

        return {
            total: this.entities.size,
            byType,
            dirtyPositions: this.dirtyPosition.size,
            dirtyMetadata: this.dirtyMetadata.size
        };
    }

    async destroy() {
        // Stop intervals first
        if (this.saveIntervalId) clearInterval(this.saveIntervalId);
        if (this.checkIntervalId) clearInterval(this.checkIntervalId);

        // Save everything
        await this.saveAll();

        // Clear
        this.entities.clear();
        this.netIdIndex.clear();
        this.dirtyPosition.clear();
        this.dirtyMetadata.clear();
    }
}

module.exports = PersistenceManager;

// Self-register
global.Framework.register('persistence', new PersistenceManager(global.Framework), 3);
