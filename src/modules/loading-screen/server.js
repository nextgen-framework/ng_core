/**
 * NextGen Framework - Loading Screen Module (Server)
 * Sends loading stage updates to clients during connection process.
 */

class LoadingScreenServer {
    constructor(framework) {
        this.framework = framework;
    }

    /**
     * Initialize loading screen module
     */
    async init() {
        this.framework.log.info('Loading Screen server initialized');
    }

    /**
     * Update loading stage for a player
     * @param {number} source - Player source
     * @param {string} stage - Stage name (connecting, loading, waiting_client, checking, ready, spawning, spawned)
     * @param {string} [message] - Optional custom message
     */
    setStage(source, stage, message) {
        this.framework.fivem.emitNet('ng_core|loading-screen/stage', source, stage, message);
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.framework.log.info('Loading Screen server destroyed');
    }
}

module.exports = LoadingScreenServer;

// Self-register
global.Framework.register('loading-screen', new LoadingScreenServer(global.Framework), 5);
