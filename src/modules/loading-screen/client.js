/**
 * NextGen Framework - Loading Screen Module (Client)
 * Low-level loading screen control (natives wrapper).
 */

class LoadingScreenClient {
    constructor(framework) {
        this.framework = framework;
        this.hasShutdown = false;
    }

    /**
     * Initialize loading screen module
     */
    init() {
        this.framework.log.debug('[Loading Screen] Client initialized');
    }

    /**
     * Shutdown all loading screens (native + NUI)
     */
    shutdown() {
        if (this.hasShutdown) return;
        this.hasShutdown = true;

        ShutdownLoadingScreen();
        ShutdownLoadingScreenNui();

        this.framework.log.debug('[Loading Screen] All loading screens shutdown');
    }

    /**
     * Check if loading screen is active
     * @returns {boolean}
     */
    isActive() {
        return GetIsLoadingScreenActive();
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.hasShutdown = false;
        this.framework.log.info('Loading Screen client destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingScreenClient;
}

// Self-register with high priority (needed early by spawn-manager)
global.Framework.register('loading-screen', new LoadingScreenClient(global.Framework), 5);
