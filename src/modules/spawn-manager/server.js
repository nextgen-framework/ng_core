/**
 * NextGen Framework - Spawn Manager Module
 * Thin primitive for spawning players at coordinates.
 * All spawn logic (where to spawn, position persistence) belongs in plugins.
 */

class SpawnManager {
    constructor(framework) {
        this.framework = framework;

        // Configuration
        this.config = {
            spawnFadeIn: true,
            spawnFadeDuration: 1500
        };
    }

    /**
     * Initialize spawn manager module
     */
    async init() {
        this.framework.log.info('Spawn manager initialized');
    }

    /**
     * Spawn player at coordinates
     * @param {number} source - Player source
     * @param {Object} coords - { x, y, z, heading }
     * @param {Object} [options] - { fadeIn, fadeDuration, model }
     */
    spawnPlayerAt(source, coords, options = {}) {
        this.framework.fivem.emitNet('ng_core|spawn/at', source, coords, {
            fadeIn: options.fadeIn ?? this.config.spawnFadeIn,
            fadeDuration: options.fadeDuration ?? this.config.spawnFadeDuration,
            model: options.model
        });
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
