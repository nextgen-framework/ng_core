/**
 * NextGen Framework - Loading Screen Module (Client)
 * Manages the full player initialization lifecycle from pre-connection to spawn.
 * Provides loading screen control and stage tracking.
 */

class LoadingScreenClient {
    constructor(framework) {
        this.framework = framework;

        // Stage tracking
        this.currentStage = 'connecting';
        this.progress = 0;
        this.hasShutdown = false;

        // Stage definitions with progress ranges
        this.stages = {
            connecting: { min: 0, max: 20, label: 'Connecting...' },
            loading: { min: 20, max: 40, label: 'Loading player data...' },
            waiting_client: { min: 40, max: 60, label: 'Initializing client...' },
            checking: { min: 60, max: 75, label: 'Checking permissions...' },
            ready: { min: 75, max: 90, label: 'Preparing spawn...' },
            spawning: { min: 90, max: 100, label: 'Spawning...' },
            spawned: { min: 100, max: 100, label: 'Welcome!' }
        };
    }

    /**
     * Initialize loading screen module
     */
    init() {
        // Listen for stage updates from server
        this.framework.fivem.onNet('ng_core|loading-screen/stage', (stage, message) => {
            this.setStage(stage, message);
        });

        this.framework.log.debug('[Loading Screen] Client initialized');
    }

    /**
     * Set current loading stage
     * @param {string} stage - Stage name
     * @param {string} [message] - Optional custom message
     */
    setStage(stage, message) {
        if (this.hasShutdown) return;

        const stageInfo = this.stages[stage];
        if (!stageInfo) {
            this.framework.log.warn(`[Loading Screen] Unknown stage: ${stage}`);
            return;
        }

        this.currentStage = stage;
        this.progress = stageInfo.max;

        this.framework.log.debug(`[Loading Screen] Stage: ${stage} (${this.progress}%)`);

        // Emit event for external listeners (ng_loading UI)
        this.framework.fivem.triggerEvent('ng_core|loading-screen/updated', {
            stage,
            progress: this.progress,
            message: message || stageInfo.label
        });
    }

    /**
     * Set progress within current stage
     * @param {number} percent - Progress percentage (0-100 within stage range)
     */
    setProgress(percent) {
        if (this.hasShutdown) return;

        const stageInfo = this.stages[this.currentStage];
        if (!stageInfo) return;

        // Map percent to stage range
        const range = stageInfo.max - stageInfo.min;
        this.progress = stageInfo.min + (range * percent / 100);

        this.framework.fivem.triggerEvent('ng_core|loading-screen/updated', {
            stage: this.currentStage,
            progress: this.progress,
            message: stageInfo.label
        });
    }

    /**
     * Get current stage
     * @returns {string}
     */
    getStage() {
        return this.currentStage;
    }

    /**
     * Get current progress
     * @returns {number}
     */
    getProgress() {
        return this.progress;
    }

    /**
     * Check if loading screen is active (FiveM native)
     * @returns {boolean}
     */
    isActive() {
        return GetIsLoadingScreenActive();
    }

    /**
     * Shutdown all loading screens (native + NUI)
     */
    shutdown() {
        if (this.hasShutdown) return;
        this.hasShutdown = true;

        this.currentStage = 'spawned';
        this.progress = 100;

        ShutdownLoadingScreen();
        ShutdownLoadingScreenNui();

        this.framework.log.debug('[Loading Screen] All loading screens shutdown');
    }

    /**
     * Reset state (for reconnection scenarios)
     */
    reset() {
        this.currentStage = 'connecting';
        this.progress = 0;
        this.hasShutdown = false;
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.reset();
        this.framework.log.info('Loading Screen client destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingScreenClient;
}

// Self-register with high priority (needed early)
global.Framework.register('loading-screen', new LoadingScreenClient(global.Framework), 5);
