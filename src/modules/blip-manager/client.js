/**
 * NextGen Framework - Blip Manager Module (Client)
 * Renders native GTA blips synced from server
 */

class BlipRenderer {
    constructor(framework) {
        this.framework = framework;

        // Server blip ID => native GTA handle
        this.handles = new Map();

        // Category visibility: category => boolean
        this.categoryState = new Map();
    }

    /**
     * Initialize blip renderer
     */
    async init() {
        // Request all blips from server
        this.framework.fivem.emitNet('ng_core:blips:requestAll');

        // Listen for server sync events
        this.framework.fivem.onNet('ng_core:blips:syncAll', (blips) => {
            this._handleSyncAll(blips);
        });

        this.framework.fivem.onNet('ng_core:blips:add', (blip) => {
            this._createNativeBlip(blip);
        });

        this.framework.fivem.onNet('ng_core:blips:remove', (id) => {
            this._removeNativeBlip(id);
        });

        this.framework.fivem.onNet('ng_core:blips:update', (blip) => {
            this._updateNativeBlip(blip);
        });

        this.framework.log.info('Blip renderer initialized');
    }

    // ================================
    // Public API
    // ================================

    /**
     * Create a client-only blip (not synced to server)
     * @param {Object} data - Blip data with x, y, z, sprite, color, scale, label, shortRange
     * @returns {number} Native blip handle
     */
    createLocalBlip(data) {
        const handle = AddBlipForCoord(data.x, data.y, data.z);

        if (data.sprite !== undefined) SetBlipSprite(handle, data.sprite);
        if (data.color !== undefined) SetBlipColour(handle, data.color);
        if (data.scale !== undefined) SetBlipScale(handle, data.scale);
        if (data.shortRange !== false) SetBlipAsShortRange(handle, true);

        if (data.label) {
            BeginTextCommandSetBlipName('STRING');
            AddTextComponentSubstringPlayerName(data.label);
            EndTextCommandSetBlipName(handle);
        }

        return handle;
    }

    /**
     * Remove a local blip by native handle
     * @param {number} handle - Native blip handle
     */
    removeLocalBlip(handle) {
        if (DoesBlipExist(handle)) {
            RemoveBlip(handle);
        }
    }

    /**
     * Toggle category visibility
     * @param {string} category
     * @param {boolean} visible
     */
    toggleCategory(category, visible) {
        this.categoryState.set(category, visible);

        for (const [id, handle] of this.handles) {
            // We need to track blip data to know category
            // For now, just show/hide based on cached data
            if (DoesBlipExist(handle)) {
                SetBlipAlpha(handle, visible ? 255 : 0);
            }
        }
    }

    /**
     * Check if a category is visible
     * @param {string} category
     * @returns {boolean}
     */
    isCategoryVisible(category) {
        return this.categoryState.get(category) !== false;
    }

    // ================================
    // Internal - Native Blip Management
    // ================================

    /**
     * Handle full sync from server
     */
    _handleSyncAll(blips) {
        // Clear existing
        this._removeAll();

        // Create all blips
        for (const blip of blips) {
            this._createNativeBlip(blip);
        }

        this.framework.log.debug(`Synced ${blips.length} blips from server`);
    }

    /**
     * Create a native GTA blip from server data
     */
    _createNativeBlip(blip) {
        // Check category visibility
        if (!this.isCategoryVisible(blip.category)) return;

        // Remove existing if re-creating
        if (this.handles.has(blip.id)) {
            this._removeNativeBlip(blip.id);
        }

        const handle = AddBlipForCoord(blip.x, blip.y, blip.z);

        SetBlipSprite(handle, blip.sprite || 1);
        SetBlipColour(handle, blip.color || 0);
        SetBlipScale(handle, blip.scale || 1.0);
        SetBlipAsShortRange(handle, blip.shortRange !== false);

        if (blip.label) {
            BeginTextCommandSetBlipName('STRING');
            AddTextComponentSubstringPlayerName(blip.label);
            EndTextCommandSetBlipName(handle);
        }

        this.handles.set(blip.id, handle);
    }

    /**
     * Remove a native blip by server ID
     */
    _removeNativeBlip(id) {
        const handle = this.handles.get(id);
        if (handle && DoesBlipExist(handle)) {
            RemoveBlip(handle);
        }
        this.handles.delete(id);
    }

    /**
     * Update a native blip from server data
     */
    _updateNativeBlip(blip) {
        const handle = this.handles.get(blip.id);

        if (!handle || !DoesBlipExist(handle)) {
            // Blip doesn't exist, create it
            this._createNativeBlip(blip);
            return;
        }

        // Update properties
        SetBlipCoords(handle, blip.x, blip.y, blip.z);
        SetBlipSprite(handle, blip.sprite || 1);
        SetBlipColour(handle, blip.color || 0);
        SetBlipScale(handle, blip.scale || 1.0);
        SetBlipAsShortRange(handle, blip.shortRange !== false);

        if (blip.label) {
            BeginTextCommandSetBlipName('STRING');
            AddTextComponentSubstringPlayerName(blip.label);
            EndTextCommandSetBlipName(handle);
        }
    }

    /**
     * Remove all native blips
     */
    _removeAll() {
        for (const [id, handle] of this.handles) {
            if (DoesBlipExist(handle)) {
                RemoveBlip(handle);
            }
        }
        this.handles.clear();
    }

    /**
     * Cleanup
     */
    async destroy() {
        this._removeAll();
        this.categoryState.clear();
        this.framework.log.info('Blip renderer destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlipRenderer;
}

// Self-register
global.Framework.register('blip-manager', new BlipRenderer(global.Framework), 14);
