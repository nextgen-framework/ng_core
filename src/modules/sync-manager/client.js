/**
 * NextGen Framework - Sync Manager (Client)
 * Handles world state synchronization on client
 */

class SyncManagerClient {
    constructor(framework) {
        this.framework = framework;
        this.trafficDensity = 1.0;
        this.pedestrianDensity = 1.0;
        this._densityTick = null;
    }

    /**
     * Initialize sync manager client
     */
    init() {
        // Listen for time updates
        this.framework.onNet('ng_core|sync/time-set', this.onTimeSet.bind(this));

        // Listen for weather updates
        this.framework.onNet('ng_core|sync/weather-set', this.onWeatherSet.bind(this));
        this.framework.onNet('ng_core|sync/weather-transition', this.onWeatherTransition.bind(this));

        // Listen for blackout updates
        this.framework.onNet('ng_core|sync/blackout-set', this.onBlackoutSet.bind(this));

        // Listen for density updates
        this.framework.onNet('ng_core|sync/traffic-density-set', this.onTrafficDensitySet.bind(this));
        this.framework.onNet('ng_core|sync/pedestrian-density-set', this.onPedestrianDensitySet.bind(this));

        // Request full sync from server (client is ready)
        this.framework.emitNet('ng_core|sync/request');

        this.framework.log.debug('[SyncManager] Client initialized');
    }

    /**
     * Handle time set event
     * @param {number} hour
     * @param {number} minute
     * @param {number} second
     * @param {boolean} frozen
     */
    onTimeSet(hour, minute, second, frozen) {
        NetworkOverrideClockTime(hour, minute, second);
        PauseClock(frozen);
    }

    /**
     * Handle weather set event
     * @param {string} weatherType
     */
    onWeatherSet(weatherType) {
        SetWeatherTypeNow(weatherType);
        SetWeatherTypePersist(weatherType);
    }

    /**
     * Handle weather transition event
     * @param {string} weatherType
     * @param {number} duration - Duration in milliseconds
     */
    onWeatherTransition(weatherType, duration) {
        SetWeatherTypeOverTime(weatherType, duration / 1000);

        setTimeout(() => {
            SetWeatherTypePersist(weatherType);
        }, duration);
    }

    /**
     * Handle blackout event
     * @param {boolean} enabled
     */
    onBlackoutSet(enabled) {
        SetArtificialLightsState(enabled);
        SetArtificialLightsStateAffectsVehicles(!enabled);
    }

    /**
     * Handle traffic density event
     * @param {number} density - 0.0 to 1.0
     */
    onTrafficDensitySet(density) {
        this.trafficDensity = density;
        this._ensureDensityTick();
    }

    /**
     * Handle pedestrian density event
     * @param {number} density - 0.0 to 1.0
     */
    onPedestrianDensitySet(density) {
        this.pedestrianDensity = density;
        this._ensureDensityTick();
    }

    /**
     * Start density tick if needed (ThisFrame natives must run every frame)
     */
    _ensureDensityTick() {
        if (this._densityTick) return;

        this._densityTick = setTick(() => {
            // Traffic
            SetVehicleDensityMultiplierThisFrame(this.trafficDensity);
            SetRandomVehicleDensityMultiplierThisFrame(this.trafficDensity);
            SetParkedVehicleDensityMultiplierThisFrame(this.trafficDensity);

            // Pedestrians
            SetPedDensityMultiplierThisFrame(this.pedestrianDensity);
            SetScenarioPedDensityMultiplierThisFrame(this.pedestrianDensity, this.pedestrianDensity);

            // Stop tick when both are back to default
            if (this.trafficDensity === 1.0 && this.pedestrianDensity === 1.0) {
                clearTick(this._densityTick);
                this._densityTick = null;
            }
        });
    }

    /**
     * Cleanup
     */
    async destroy() {
        if (this._densityTick) {
            clearTick(this._densityTick);
            this._densityTick = null;
        }
        this.trafficDensity = 1.0;
        this.pedestrianDensity = 1.0;
        this.framework.log.info('Sync Manager client destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncManagerClient;
}

// Self-register
global.Framework.register('sync-manager', new SyncManagerClient(global.Framework), 11);
