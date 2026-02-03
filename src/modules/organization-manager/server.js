/**
 * NextGen Framework - Organization Manager Module
 * Manages organizations/jobs (police, hospital, gangs, businesses)
 * Handles employees, grades, duty status, and player org cache
 */

class OrganizationManager {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        // Organization cache: orgId => { id, name, type, label, metadata }
        this.organizations = new Map();

        // Player organizations cache: source => [{ orgId, orgName, grade, metadata }]
        this.playerOrganizations = new Map();

        // Duty tracking: source => Set<orgId>
        this.dutyStatus = new Map();
    }

    /**
     * Initialize organization manager module
     */
    async init() {
        this.db = this.framework.getModule('database');

        // Load all organizations into cache
        await this.loadOrganizations();

        // Handle character selection — load player's orgs
        this.framework.events.on('character:selected', async ({ source, character }) => {
            await this._loadPlayerOrganizations(source, character.id);
        });

        // Handle player drop — cleanup cache + duty
        this.framework.fivem.on('playerDropped', () => {
            this._handlePlayerDropped(source);
        });

        // RPC handlers
        const rpc = this.framework.getModule('rpc');
        if (rpc) {
            rpc.register('org:getMyOrgs', this.getPlayerOrgsRPC.bind(this));
            rpc.register('org:getOrg', this.getOrgRPC.bind(this));
            rpc.register('org:getEmployees', this.getEmployeesRPC.bind(this));
        }

        this.framework.log.info('Organization manager initialized');
    }

    // ================================
    // Organization CRUD
    // ================================

    /**
     * Load all organizations into cache
     */
    async loadOrganizations() {
        try {
            const orgs = await this.db.query('SELECT * FROM organizations');
            this.organizations.clear();

            for (const org of orgs) {
                this.organizations.set(org.id, this._parseOrg(org));
            }

            this.framework.log.debug(`Loaded ${orgs.length} organizations`);
        } catch (error) {
            this.framework.log.error(`Failed to load organizations: ${error.message}`);
        }
    }

    /**
     * Create a new organization
     * @param {string} name - Unique name (e.g. 'police')
     * @param {string} type - Type (e.g. 'government', 'business', 'gang')
     * @param {string} label - Display label (e.g. 'Los Santos Police Department')
     * @param {Object} metadata - Extra data
     * @returns {Object} { success, organization }
     */
    async createOrganization(name, type, label, metadata = {}) {
        try {
            const result = await this.db.execute(
                'INSERT INTO organizations (name, type, label, metadata) VALUES (?, ?, ?, ?)',
                [name, type, label, JSON.stringify(metadata)]
            );

            const org = { id: result.insertId, name, type, label, metadata };
            this.organizations.set(org.id, org);

            this.framework.log.info(`Created organization: ${label} (${name})`);
            return { success: true, organization: org };
        } catch (error) {
            this.framework.log.error(`Failed to create organization: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get organization by ID (from cache)
     * @param {number} orgId
     * @returns {Object|null}
     */
    getOrganization(orgId) {
        return this.organizations.get(orgId) || null;
    }

    /**
     * Get organization by name (from cache)
     * @param {string} name
     * @returns {Object|null}
     */
    getOrganizationByName(name) {
        for (const org of this.organizations.values()) {
            if (org.name === name) return org;
        }
        return null;
    }

    /**
     * Get all organizations of a type
     * @param {string} type
     * @returns {Array}
     */
    getOrganizationsByType(type) {
        const result = [];
        for (const org of this.organizations.values()) {
            if (org.type === type) result.push(org);
        }
        return result;
    }

    /**
     * Get all organizations
     * @returns {Array}
     */
    getAllOrganizations() {
        return Array.from(this.organizations.values());
    }

    /**
     * Update organization properties
     * @param {number} orgId
     * @param {Object} data - Fields to update (label, type, metadata)
     * @returns {Object} { success }
     */
    async updateOrganization(orgId, data) {
        const allowed = ['label', 'type', 'metadata'];
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

        values.push(orgId);

        try {
            await this.db.execute(
                `UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`,
                values
            );

            // Update cache
            const cached = this.organizations.get(orgId);
            if (cached) {
                if (data.label !== undefined) cached.label = data.label;
                if (data.type !== undefined) cached.type = data.type;
                if (data.metadata !== undefined) cached.metadata = data.metadata;
            }

            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to update organization ${orgId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete an organization
     * @param {number} orgId
     * @returns {Object} { success }
     */
    async deleteOrganization(orgId) {
        try {
            await this.db.execute('DELETE FROM organizations WHERE id = ?', [orgId]);
            this.organizations.delete(orgId);

            // Cleanup player caches referencing this org
            for (const [source, orgs] of this.playerOrganizations) {
                const filtered = orgs.filter(o => o.orgId !== orgId);
                if (filtered.length !== orgs.length) {
                    this.playerOrganizations.set(source, filtered);
                }
            }

            // Cleanup duty
            for (const [, duties] of this.dutyStatus) {
                duties.delete(orgId);
            }

            this.framework.log.info(`Deleted organization ${orgId}`);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ================================
    // Employee Management
    // ================================

    /**
     * Add employee to organization
     * @param {number} orgId
     * @param {number} characterId
     * @param {number} grade
     * @param {Object} metadata
     * @returns {Object} { success }
     */
    async addEmployee(orgId, characterId, grade = 0, metadata = {}) {
        try {
            await this.db.execute(
                'INSERT INTO organization_employees (org_id, char_id, grade, metadata) VALUES (?, ?, ?, ?)',
                [orgId, characterId, grade, JSON.stringify(metadata)]
            );

            // Update player cache if online
            this._updatePlayerCacheAdd(characterId, orgId, grade, metadata);

            this.framework.log.debug(`Added employee ${characterId} to org ${orgId} (grade ${grade})`);

            // Emit event
            this.framework.events.emit('organization:employee-added', orgId, characterId, grade);

            return { success: true };
        } catch (error) {
            this.framework.log.error(`Failed to add employee: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Remove employee from organization
     * @param {number} orgId
     * @param {number} characterId
     * @returns {Object} { success }
     */
    async removeEmployee(orgId, characterId) {
        try {
            await this.db.execute(
                'DELETE FROM organization_employees WHERE org_id = ? AND char_id = ?',
                [orgId, characterId]
            );

            // Update player cache if online
            this._updatePlayerCacheRemove(characterId, orgId);

            // Remove duty if on duty
            this._removeDutyByCharId(characterId, orgId);

            this.framework.log.debug(`Removed employee ${characterId} from org ${orgId}`);

            // Emit event
            this.framework.events.emit('organization:employee-removed', orgId, characterId);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Set employee grade
     * @param {number} orgId
     * @param {number} characterId
     * @param {number} grade
     * @returns {Object} { success }
     */
    async setGrade(orgId, characterId, grade) {
        try {
            await this.db.execute(
                'UPDATE organization_employees SET grade = ? WHERE org_id = ? AND char_id = ?',
                [grade, orgId, characterId]
            );

            // Update player cache if online
            this._updatePlayerCacheGrade(characterId, orgId, grade);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all employees of an organization
     * @param {number} orgId
     * @returns {Array}
     */
    async getEmployees(orgId) {
        try {
            const employees = await this.db.query(
                `SELECT oe.*, c.firstname, c.lastname
                 FROM organization_employees oe
                 JOIN characters c ON c.id = oe.char_id
                 WHERE oe.org_id = ?
                 ORDER BY oe.grade DESC`,
                [orgId]
            );

            return employees.map(e => ({
                ...e,
                metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata || {})
            }));
        } catch (error) {
            this.framework.log.error(`Failed to get employees for org ${orgId}: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if character is employee of organization
     * @param {number} orgId
     * @param {number} characterId
     * @returns {boolean}
     */
    async isEmployee(orgId, characterId) {
        try {
            const result = await this.db.query(
                'SELECT 1 FROM organization_employees WHERE org_id = ? AND char_id = ? LIMIT 1',
                [orgId, characterId]
            );
            return result.length > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get employee grade
     * @param {number} orgId
     * @param {number} characterId
     * @returns {number|null}
     */
    async getEmployeeGrade(orgId, characterId) {
        try {
            const result = await this.db.query(
                'SELECT grade FROM organization_employees WHERE org_id = ? AND char_id = ? LIMIT 1',
                [orgId, characterId]
            );
            return result.length > 0 ? result[0].grade : null;
        } catch (error) {
            return null;
        }
    }

    // ================================
    // Player Organization Cache
    // ================================

    /**
     * Load player organizations on character selection
     * @param {number} source
     * @param {number} characterId
     */
    async _loadPlayerOrganizations(source, characterId) {
        try {
            const rows = await this.db.query(
                `SELECT oe.org_id, oe.grade, oe.metadata, o.name AS org_name
                 FROM organization_employees oe
                 JOIN organizations o ON o.id = oe.org_id
                 WHERE oe.char_id = ?`,
                [characterId]
            );

            const orgs = rows.map(r => ({
                orgId: r.org_id,
                orgName: r.org_name,
                grade: r.grade,
                metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {})
            }));

            this.playerOrganizations.set(source, orgs);
            this.framework.log.debug(`Loaded ${orgs.length} organizations for source ${source}`);
        } catch (error) {
            this.framework.log.error(`Failed to load player orgs: ${error.message}`);
            this.playerOrganizations.set(source, []);
        }
    }

    /**
     * Get player's organizations (from cache)
     * @param {number} source
     * @returns {Array}
     */
    getPlayerOrganizations(source) {
        return this.playerOrganizations.get(source) || [];
    }

    /**
     * Check if player is in organization (from cache)
     * @param {number} source
     * @param {number} orgId
     * @returns {boolean}
     */
    isPlayerInOrg(source, orgId) {
        const orgs = this.playerOrganizations.get(source);
        if (!orgs) return false;
        return orgs.some(o => o.orgId === orgId);
    }

    /**
     * Get player's grade in organization (from cache)
     * @param {number} source
     * @param {number} orgId
     * @returns {number|null}
     */
    getPlayerGrade(source, orgId) {
        const orgs = this.playerOrganizations.get(source);
        if (!orgs) return null;
        const entry = orgs.find(o => o.orgId === orgId);
        return entry ? entry.grade : null;
    }

    // ================================
    // Duty System
    // ================================

    /**
     * Toggle duty for a player in an organization
     * @param {number} source
     * @param {number} orgId
     * @returns {Object} { success, onDuty }
     */
    toggleDuty(source, orgId) {
        if (!this.isPlayerInOrg(source, orgId)) {
            return { success: false, reason: 'not_member' };
        }

        if (!this.dutyStatus.has(source)) {
            this.dutyStatus.set(source, new Set());
        }

        const duties = this.dutyStatus.get(source);
        let onDuty;

        if (duties.has(orgId)) {
            duties.delete(orgId);
            onDuty = false;
        } else {
            duties.add(orgId);
            onDuty = true;
        }

        // Emit event
        this.framework.events.emit('organization:duty-toggled', source, orgId, onDuty);
        this.framework.fivem.emitNet('ng_core:duty-toggled', source, orgId, onDuty);

        this.framework.log.debug(`Player ${source} duty ${onDuty ? 'on' : 'off'} for org ${orgId}`);

        return { success: true, onDuty };
    }

    /**
     * Check if player is on duty for an organization
     * @param {number} source
     * @param {number} orgId
     * @returns {boolean}
     */
    isDuty(source, orgId) {
        const duties = this.dutyStatus.get(source);
        return duties ? duties.has(orgId) : false;
    }

    /**
     * Get all players on duty for an organization
     * @param {number} orgId
     * @returns {Array<number>} Array of source IDs
     */
    getOnDutyPlayers(orgId) {
        const result = [];
        for (const [source, duties] of this.dutyStatus) {
            if (duties.has(orgId)) {
                result.push(source);
            }
        }
        return result;
    }

    // ================================
    // RPC Handlers
    // ================================

    /**
     * RPC: Get player's organizations
     */
    async getPlayerOrgsRPC(source) {
        return this.getPlayerOrganizations(source);
    }

    /**
     * RPC: Get organization by ID
     */
    async getOrgRPC(source, orgId) {
        return this.getOrganization(orgId);
    }

    /**
     * RPC: Get employees of an organization
     */
    async getEmployeesRPC(source, orgId) {
        return await this.getEmployees(orgId);
    }

    // ================================
    // Internal Helpers
    // ================================

    /**
     * Parse organization row from DB (JSON fields)
     */
    _parseOrg(row) {
        return {
            ...row,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {})
        };
    }

    /**
     * Update player cache when employee is added
     */
    _updatePlayerCacheAdd(characterId, orgId, grade, metadata) {
        const source = this._findSourceByCharId(characterId);
        if (source === null) return;

        const orgs = this.playerOrganizations.get(source) || [];
        const org = this.organizations.get(orgId);

        orgs.push({
            orgId,
            orgName: org ? org.name : null,
            grade,
            metadata
        });

        this.playerOrganizations.set(source, orgs);
    }

    /**
     * Update player cache when employee is removed
     */
    _updatePlayerCacheRemove(characterId, orgId) {
        const source = this._findSourceByCharId(characterId);
        if (source === null) return;

        const orgs = this.playerOrganizations.get(source);
        if (!orgs) return;

        this.playerOrganizations.set(source, orgs.filter(o => o.orgId !== orgId));
    }

    /**
     * Update player cache when grade changes
     */
    _updatePlayerCacheGrade(characterId, orgId, grade) {
        const source = this._findSourceByCharId(characterId);
        if (source === null) return;

        const orgs = this.playerOrganizations.get(source);
        if (!orgs) return;

        const entry = orgs.find(o => o.orgId === orgId);
        if (entry) entry.grade = grade;
    }

    /**
     * Remove duty for a character (by charId) in a specific org
     */
    _removeDutyByCharId(characterId, orgId) {
        const source = this._findSourceByCharId(characterId);
        if (source === null) return;

        const duties = this.dutyStatus.get(source);
        if (duties) duties.delete(orgId);
    }

    /**
     * Find player source by character ID (via character-manager)
     * @param {number} characterId
     * @returns {number|null}
     */
    _findSourceByCharId(characterId) {
        const charManager = this.framework.getModule('character-manager');
        if (!charManager) return null;

        // Search active characters for matching ID
        for (const [source, char] of charManager.activeCharacters || new Map()) {
            if (char && char.id === characterId) return source;
        }
        return null;
    }

    // ================================
    // Lifecycle
    // ================================

    /**
     * Handle player disconnect — cleanup cache + duty
     */
    _handlePlayerDropped(source) {
        this.playerOrganizations.delete(source);
        this.dutyStatus.delete(source);
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.organizations.clear();
        this.playerOrganizations.clear();
        this.dutyStatus.clear();
        this.framework.log.info('Organization manager destroyed');
    }
}

module.exports = OrganizationManager;

// Self-register
global.Framework.register('organization-manager', new OrganizationManager(global.Framework), 16);
