/**
 * NextGen Framework - Sync Manager (Client)
 * Handles world state synchronization on client
 */

class SyncManagerClient {
  constructor(framework) {
    this.framework = framework;
  }

  /**
   * Initialize sync manager client
   */
  init() {
    // Listen for time updates
    this.framework.onNet('ng_core:time-set', this.onTimeSet.bind(this));

    // Listen for weather updates
    this.framework.onNet('ng_core:weather-set', this.onWeatherSet.bind(this));
    this.framework.onNet('ng_core:weather-transition', this.onWeatherTransition.bind(this));

    // Listen for blackout updates
    this.framework.onNet('ng_core:blackout-set', this.onBlackoutSet.bind(this));

    // Listen for density updates
    this.framework.onNet('ng_core:traffic-density-set', this.onTrafficDensitySet.bind(this));
    this.framework.onNet('ng_core:pedestrian-density-set', this.onPedestrianDensitySet.bind(this));

    console.log('[Sync Manager] Client initialized');
  }

  /**
   * Handle time set event
   */
  onTimeSet(hour, minute, second, frozen, transition) {
    if (transition) {
      // Smooth transition to new time
      NetworkOverrideClockTime(hour, minute, second);
    } else {
      // Instant time change
      NetworkOverrideClockTime(hour, minute, second);
    }

    if (frozen) {
      PauseClock(true);
    } else {
      PauseClock(false);
    }
  }

  /**
   * Handle weather set event
   */
  onWeatherSet(weatherType) {
    SetWeatherTypeNow(weatherType);
    SetWeatherTypePersist(weatherType);
  }

  /**
   * Handle weather transition event
   */
  onWeatherTransition(weatherType, duration) {
    SetWeatherTypeOverTime(weatherType, duration / 1000);

    setTimeout(() => {
      SetWeatherTypePersist(weatherType);
    }, duration);
  }

  /**
   * Handle blackout event
   */
  onBlackoutSet(enabled) {
    SetArtificialLightsState(enabled);
    SetArtificialLightsStateAffectsVehicles(false); // Don't affect vehicle lights
  }

  /**
   * Handle traffic density event
   */
  onTrafficDensitySet(density) {
    SetVehicleDensityMultiplierThisFrame(density);
    SetRandomVehicleDensityMultiplierThisFrame(density);
    SetParkedVehicleDensityMultiplierThisFrame(density);
  }

  /**
   * Handle pedestrian density event
   */
  onPedestrianDensitySet(density) {
    SetPedDensityMultiplierThisFrame(density);
    SetScenarioPedDensityMultiplierThisFrame(density, density);
  }
}

// Export to global scope for framework (FiveM client environment)
if (typeof global !== "undefined") { global.NgModule_sync_manager = SyncManagerClient; }

// Self-register
global.Framework.register('sync-manager', new SyncManagerClient(global.Framework), 11);
