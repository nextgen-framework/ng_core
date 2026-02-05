/**
 * NextGen Framework - Spawn Manager Module
 * Thin primitive for spawning players at coordinates.
 * All spawn logic (where to spawn, position persistence) belongs in plugins.
 *
 * Hooks (FiveM events for cross-resource):
 *   ng_core|spawn/at:before (source, coords, options) - before spawn, can listen to modify
 *   ng_core|spawn/at:after (source, coords, options) - after spawn complete
 */

class SpawnManager {
    constructor(framework) {
        this.framework = framework;

        // Configuration
        this.config = {
            spawnFadeIn: true,
            spawnFadeDuration: 1500
        };

        // Pending spawns (for :after hook)
        this.pendingSpawns = new Map(); // source => { coords, options }
    }

    /**
     * Initialize spawn manager module
     */
    async init() {
        // Listen for spawn complete from client
        this.framework.fivem.onNet('ng_core|spawn/complete', () => {
            const src = global.source;
            this.onSpawnComplete(src);
        });

        this.framework.log.info('Spawn manager initialized');
    }

    /**
     * Called when client signals spawn is complete
     */
    onSpawnComplete(source) {
        const pending = this.pendingSpawns.get(source);
        if (!pending) return;

        this.pendingSpawns.delete(source);

        // Emit :after hook for cross-resource listeners
        this.framework.fivem.emit('ng_core|spawn/at:after', source, pending.coords, pending.options);
        this.framework.log.debug(`[Spawn Manager] Player ${source} spawn complete, :after hook emitted`);
    }

    /**
     * Spawn player at coordinates
     * @param {number} source - Player source
     * @param {Object} coords - { x, y, z, heading }
     * @param {Object} [options] - { fadeIn, fadeDuration, model }
     *
     * Hooks can modify options to add health/armor:
     *   ng_core|spawn/at:before - listeners can add options.health, options.armor
     */
    async spawnPlayerAt(source, coords, options = {}) {
        const finalOptions = {
            fadeIn: options.fadeIn ?? this.config.spawnFadeIn,
            fadeDuration: options.fadeDuration ?? this.config.spawnFadeDuration,
            model: options.model
        };

        this.framework.log.debug(`[Spawn Manager] spawnPlayerAt called for ${source} at (${coords.x}, ${coords.y}, ${coords.z})`);

        // Emit :before hook - listeners can modify finalOptions (add health, armor, etc.)
        this.framework.fivem.emit('ng_core|spawn/at:before', source, coords, finalOptions);
        this.framework.log.debug(`[Spawn Manager] :before hook done, health=${finalOptions.health}, armor=${finalOptions.armor}`);

        // Store for :after hook
        this.pendingSpawns.set(source, { coords, options: finalOptions });

        // Send spawn to client (with any modifications from hooks)
        this.framework.fivem.emitNet('ng_core|spawn/at', source, coords, finalOptions);
    }

    /**
     * Configure spawn manager
     * @param {Object} config - { spawnFadeIn, spawnFadeDuration }
     */
    configure(config) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.framework.log.info('Spawn manager destroyed');
    }
}

module.exports = SpawnManager;

// Self-register
global.Framework.register('spawn-manager', new SpawnManager(global.Framework), 15);
