/**
 * NextGen Framework - Connection Manager (Client)
 * Client-side connection handling.
 * Note: The client-ready signal is sent by character-appearance module
 * after appearance is applied (ng_core|connection/client-ready).
 */

class ConnectionManagerClient {
    constructor(framework) {
        this.framework = framework;
    }

    /**
     * Initialize connection manager client
     */
    init() {
        this.framework.log.debug('[Connection Manager] Client initialized');
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.framework.log.info('Connection Manager client destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionManagerClient;
}

// Self-register
global.Framework.register('connection-manager', new ConnectionManagerClient(global.Framework), 5);
