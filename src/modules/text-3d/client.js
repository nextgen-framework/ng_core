/**
 * NextGen Framework - 3D Text Module (Client)
 * Renders 3D floating text using native GTA draw functions
 */

class Text3DRenderer {
    constructor(framework) {
        this.framework = framework;

        // All text points: id => pointData
        this.points = new Map();

        // Group visibility: groupName => boolean
        this.groupState = new Map();

        // Render thread handle
        this.renderThread = null;

        // Player position cache (updated less frequently)
        this.playerPos = null;
        this.posUpdateThread = null;
    }

    /**
     * Initialize 3D text renderer
     */
    async init() {
        // Request all points from server
        this.framework.fivem.emitNet('ng_core:text3d:requestAll');

        // Server sync events
        this.framework.fivem.onNet('ng_core:text3d:syncAll', (points, groupStates) => {
            this._handleSyncAll(points, groupStates);
        });

        this.framework.fivem.onNet('ng_core:text3d:add', (point) => {
            this.points.set(point.id, point);
        });

        this.framework.fivem.onNet('ng_core:text3d:remove', (id) => {
            this.points.delete(id);
        });

        this.framework.fivem.onNet('ng_core:text3d:update', (point) => {
            this.points.set(point.id, point);
        });

        this.framework.fivem.onNet('ng_core:text3d:groupToggle', (groupName, visible) => {
            this.groupState.set(groupName, visible);
        });

        // Start render thread
        this._startRenderThread();

        // Start position update thread (less frequent)
        this._startPosUpdateThread();

        this.framework.log.info('3D text renderer initialized');
    }

    // ================================
    // Public API
    // ================================

    /**
     * Create a client-only text point (not synced to server)
     * @param {Object} data - Point data
     * @returns {number} Local point ID
     */
    createLocalPoint(data) {
        const id = -(Date.now() + Math.floor(Math.random() * 1000));
        const color = data.color || { r: 255, g: 255, b: 255, a: 255 };

        this.points.set(id, {
            id,
            text: data.text,
            x: data.x, y: data.y, z: data.z,
            group: data.group || 'local',
            font: data.font || 0,
            scale: data.scale || 0.35,
            color,
            renderDistance: data.renderDistance || 20.0,
            isActive: true
        });

        return id;
    }

    /**
     * Remove a local text point
     * @param {number} id
     */
    removeLocalPoint(id) {
        this.points.delete(id);
    }

    /**
     * Toggle group visibility on client
     * @param {string} groupName
     * @param {boolean} visible
     */
    toggleGroup(groupName, visible) {
        this.groupState.set(groupName, visible);
    }

    // ================================
    // Render Thread
    // ================================

    _startRenderThread() {
        if (this.renderThread) return;

        this.renderThread = setTick(() => {
            this._render();
        });
    }

    _startPosUpdateThread() {
        if (this.posUpdateThread) return;

        this.posUpdateThread = setTick(async () => {
            const ped = PlayerPedId();
            const coords = GetEntityCoords(ped, true);
            this.playerPos = { x: coords[0], y: coords[1], z: coords[2] };
            await this._sleep(200);
        });
    }

    /**
     * Main render function — called every frame
     */
    _render() {
        if (!this.playerPos || this.points.size === 0) return;

        const camCoords = GetGameplayCamCoord();
        const camFwd = this._getCameraForward();

        for (const point of this.points.values()) {
            if (!point.isActive) continue;

            // Check group visibility
            if (this.groupState.get(point.group) === false) continue;

            // Distance culling
            const dx = point.x - this.playerPos.x;
            const dy = point.y - this.playerPos.y;
            const dz = point.z - this.playerPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const maxDist = point.renderDistance || 20.0;

            if (distSq > maxDist * maxDist) continue;

            // Camera frustum check (dot product)
            const toCamX = point.x - camCoords[0];
            const toCamY = point.y - camCoords[1];
            const toCamZ = point.z - camCoords[2];
            const dot = toCamX * camFwd[0] + toCamY * camFwd[1] + toCamZ * camFwd[2];

            if (dot < 0) continue; // Behind camera

            // Draw the text
            this._drawText3D(point);
        }
    }

    /**
     * Draw a 3D text point using native GTA functions
     */
    _drawText3D(point) {
        const { text, x, y, z, font, scale, color } = point;

        SetDrawOrigin(x, y, z, 0);

        SetTextFont(font);
        SetTextScale(scale, scale);
        SetTextColour(color.r, color.g, color.b, color.a);
        SetTextOutline();
        SetTextCentre(true);

        // Use BeginTextCommandDisplayText for proper 3D text
        BeginTextCommandDisplayText('STRING');
        AddTextComponentSubstringPlayerName(text);
        EndTextCommandDisplayText(0.0, 0.0);

        ClearDrawOrigin();
    }

    /**
     * Get camera forward vector
     */
    _getCameraForward() {
        const rot = GetGameplayCamRot(2);
        const rZ = rot[2] * (Math.PI / 180.0);
        const rX = rot[0] * (Math.PI / 180.0);
        const cosX = Math.abs(Math.cos(rX));

        return [
            -Math.sin(rZ) * cosX,
            Math.cos(rZ) * cosX,
            Math.sin(rX)
        ];
    }

    // ================================
    // Internal
    // ================================

    _handleSyncAll(points, groupStates) {
        this.points.clear();
        for (const point of points) {
            this.points.set(point.id, point);
        }

        this.groupState.clear();
        if (groupStates) {
            for (const [name, visible] of Object.entries(groupStates)) {
                this.groupState.set(name, visible);
            }
        }

        this.framework.log.debug(`Synced ${points.length} 3D text points from server`);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async destroy() {
        if (this.renderThread) {
            clearTick(this.renderThread);
            this.renderThread = null;
        }
        if (this.posUpdateThread) {
            clearTick(this.posUpdateThread);
            this.posUpdateThread = null;
        }
        this.points.clear();
        this.groupState.clear();
        this.framework.log.info('3D text renderer destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Text3DRenderer;
}

// Self-register
global.Framework.register('text-3d', new Text3DRenderer(global.Framework), 14);
