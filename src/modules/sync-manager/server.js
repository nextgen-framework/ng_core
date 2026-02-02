/**
 * NextGen Framework - Sync Manager Module
 * Synchronizes world state (weather, time, blackout, etc.) across all clients
 */

class SyncManager {
  constructor(framework) {
    this.framework = framework;

    // World state
    this.state = {
      time: {
        hour: 12,
        minute: 0,
        second: 0,
        frozen: false,
        syncInterval: 60000 // Sync every minute
      },
      weather: {
        current: 'CLEAR',
        transition: null,
        transitionDuration: 45000, // 45 seconds default
        cycle: true,
        cycleDuration: 600000 // 10 minutes per weather
      },
      blackout: false,
      trafficDensity: 1.0,
      pedestrianDensity: 1.0
    };

    // Weather types available in GTA V
    this.weatherTypes = [
      'EXTRASUNNY', 'CLEAR', 'NEUTRAL', 'SMOG', 'FOGGY',
      'OVERCAST', 'CLOUDS', 'CLEARING', 'RAIN', 'THUNDER',
      'SNOW', 'BLIZZARD', 'SNOWLIGHT', 'XMAS', 'HALLOWEEN'
    ];

    // Weather cycle (realistic progression)
    this.weatherCycle = [
      'CLEAR', 'CLEAR', 'CLEAR', // Mostly clear
      'EXTRASUNNY',
      'CLOUDS', 'CLOUDS',
      'OVERCAST',
      'RAIN', // Less rain
      'CLEARING',
      'CLEAR'
    ];

    // Timers
    this.timeTimer = null;
    this.weatherTimer = null;
    this.syncTimer = null;
  }

  /**
   * Initialize sync manager module
   */
  async init() {

    // Load saved state from database (optional)
    await this.loadState();

    // Start time progression
    if (!this.state.time.frozen) {
      this.startTime();
    }

    // Start weather cycle
    if (this.state.weather.cycle) {
      this.startWeatherCycle();
    }

    // Start sync to clients
    this.startSync();

    // Handle player connecting
    on('playerJoining', () => {
      // Note: 'source' is a magic global variable in FiveM event handlers
      this.syncToPlayer(source);
    });

    this.framework.log.info('Sync manager module initialized');
  }

  // ================================
  // Time Management
  // ================================

  /**
   * Start time progression
   */
  startTime() {
    if (this.timeTimer) return;

    this.timeTimer = setInterval(() => {
      this.advanceTime();
    }, 1000); // Update every second

    this.framework.log.debug('Time progression started');
  }

  /**
   * Stop time progression
   */
  stopTime() {
    if (this.timeTimer) {
      clearInterval(this.timeTimer);
      this.timeTimer = null;
      this.framework.log.debug('Time progression stopped');
    }
  }

  /**
   * Advance time by one second
   */
  advanceTime() {
    if (this.state.time.frozen) return;

    this.state.time.second++;

    if (this.state.time.second >= 60) {
      this.state.time.second = 0;
      this.state.time.minute++;
    }

    if (this.state.time.minute >= 60) {
      this.state.time.minute = 0;
      this.state.time.hour++;
    }

    if (this.state.time.hour >= 24) {
      this.state.time.hour = 0;
    }
  }

  /**
   * Set game time
   */
  setTime(hour, minute, transition = false) {
    this.state.time.hour = hour;
    this.state.time.minute = minute;
    this.state.time.second = 0;

    this.syncTimeToAll(transition);

    this.framework.log.info(`Time set to ${hour}:${String(minute).padStart(2, '0')}`);
  }

  /**
   * Freeze time
   */
  freezeTime(frozen = true) {
    this.state.time.frozen = frozen;

    if (frozen) {
      this.stopTime();
    } else {
      this.startTime();
    }

    this.framework.log.info(`Time ${frozen ? 'frozen' : 'unfrozen'}`);
  }

  /**
   * Get current time
   */
  getTime() {
    return {
      hour: this.state.time.hour,
      minute: this.state.time.minute,
      second: this.state.time.second,
      frozen: this.state.time.frozen
    };
  }

  // ================================
  // Weather Management
  // ================================

  /**
   * Start weather cycle
   */
  startWeatherCycle() {
    if (this.weatherTimer) return;

    this.weatherTimer = setInterval(() => {
      this.cycleWeather();
    }, this.state.weather.cycleDuration);

    this.framework.log.debug('Weather cycle started');
  }

  /**
   * Stop weather cycle
   */
  stopWeatherCycle() {
    if (this.weatherTimer) {
      clearInterval(this.weatherTimer);
      this.weatherTimer = null;
      this.framework.log.debug('Weather cycle stopped');
    }
  }

  /**
   * Cycle to next weather
   */
  cycleWeather() {
    const currentIndex = this.weatherCycle.indexOf(this.state.weather.current);
    const nextIndex = (currentIndex + 1) % this.weatherCycle.length;
    const nextWeather = this.weatherCycle[nextIndex];

    this.setWeather(nextWeather, true);
  }

  /**
   * Set weather
   */
  setWeather(weatherType, transition = true) {
    if (!this.weatherTypes.includes(weatherType)) {
      this.framework.log.warn(`Invalid weather type: ${weatherType}`);
      return;
    }

    if (transition) {
      this.state.weather.transition = weatherType;

      // Sync transition to all clients
      this.framework.fivem.emitNet('ng_core:weather-transition', -1, weatherType, this.state.weather.transitionDuration);

      // Update current weather after transition
      setTimeout(() => {
        this.state.weather.current = weatherType;
        this.state.weather.transition = null;
      }, this.state.weather.transitionDuration);

      this.framework.log.debug(`Weather transitioning to ${weatherType}`);
    } else {
      this.state.weather.current = weatherType;
      this.framework.fivem.emitNet('ng_core:weather-set', -1, weatherType);
      this.framework.log.info(`Weather set to ${weatherType}`);
    }
  }

  /**
   * Get current weather
   */
  getWeather() {
    return {
      current: this.state.weather.current,
      transition: this.state.weather.transition,
      cycle: this.state.weather.cycle
    };
  }

  /**
   * Enable/disable weather cycle
   */
  setWeatherCycle(enabled) {
    this.state.weather.cycle = enabled;

    if (enabled) {
      this.startWeatherCycle();
    } else {
      this.stopWeatherCycle();
    }

    this.framework.log.info(`Weather cycle ${enabled ? 'enabled' : 'disabled'}`);
  }

  // ================================
  // Blackout Management
  // ================================

  /**
   * Set blackout state
   */
  setBlackout(enabled) {
    this.state.blackout = enabled;
    this.framework.fivem.emitNet('ng_core:blackout-set', -1, enabled);
    this.framework.log.info(`Blackout ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get blackout state
   */
  getBlackout() {
    return this.state.blackout;
  }

  // ================================
  // Traffic & Pedestrian Density
  // ================================

  /**
   * Set traffic density (0.0 - 1.0)
   */
  setTrafficDensity(density) {
    this.state.trafficDensity = Math.max(0, Math.min(1, density));
    this.framework.fivem.emitNet('ng_core:traffic-density-set', -1, this.state.trafficDensity);
    this.framework.log.info(`Traffic density set to ${this.state.trafficDensity}`);
  }

  /**
   * Set pedestrian density (0.0 - 1.0)
   */
  setPedestrianDensity(density) {
    this.state.pedestrianDensity = Math.max(0, Math.min(1, density));
    this.framework.fivem.emitNet('ng_core:pedestrian-density-set', -1, this.state.pedestrianDensity);
    this.framework.log.info(`Pedestrian density set to ${this.state.pedestrianDensity}`);
  }

  // ================================
  // Synchronization
  // ================================

  /**
   * Start periodic sync to all clients
   */
  startSync() {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      this.syncTimeToAll(false);
    }, this.state.time.syncInterval);

    this.framework.log.debug('Client sync started');
  }

  /**
   * Stop periodic sync
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      this.framework.log.debug('Client sync stopped');
    }
  }

  /**
   * Sync current state to all clients
   */
  syncToAll() {
    this.syncTimeToAll(false);
    this.framework.fivem.emitNet('ng_core:weather-set', -1, this.state.weather.current);
    this.framework.fivem.emitNet('ng_core:blackout-set', -1, this.state.blackout);
    this.framework.fivem.emitNet('ng_core:traffic-density-set', -1, this.state.trafficDensity);
    this.framework.fivem.emitNet('ng_core:pedestrian-density-set', -1, this.state.pedestrianDensity);
  }

  /**
   * Sync current state to specific player
   */
  syncToPlayer(source) {
    this.framework.fivem.emitNet('ng_core:time-set', source,
      this.state.time.hour,
      this.state.time.minute,
      this.state.time.second,
      this.state.time.frozen,
      false // No transition
    );
    this.framework.fivem.emitNet('ng_core:weather-set', source, this.state.weather.current);
    this.framework.fivem.emitNet('ng_core:blackout-set', source, this.state.blackout);
    this.framework.fivem.emitNet('ng_core:traffic-density-set', source, this.state.trafficDensity);
    this.framework.fivem.emitNet('ng_core:pedestrian-density-set', source, this.state.pedestrianDensity);
  }

  /**
   * Sync time to all clients
   */
  syncTimeToAll(transition) {
    this.framework.fivem.emitNet('ng_core:time-set', -1,
      this.state.time.hour,
      this.state.time.minute,
      this.state.time.second,
      this.state.time.frozen,
      transition
    );
  }

  // ================================
  // State Persistence
  // ================================

  /**
   * Load state from database
   */
  async loadState() {
    try {
      const db = this.framework.getModule('database');
      if (!db) return;

      const saved = await db.query('SELECT * FROM world_state WHERE id = 1');

      if (saved.length > 0) {
        const data = saved[0];
        this.state.time.hour = data.time_hour || 12;
        this.state.time.minute = data.time_minute || 0;
        this.state.weather.current = data.weather || 'CLEAR';
        this.state.blackout = data.blackout === 1;

        this.framework.log.debug('World state loaded from database');
      }
    } catch (error) {
      this.framework.log.warn(`Failed to load world state: ${error.message}`);
    }
  }

  /**
   * Save state to database
   */
  async saveState() {
    try {
      const db = this.framework.getModule('database');
      if (!db) return;

      await db.execute(
        'INSERT INTO world_state (id, time_hour, time_minute, weather, blackout, updated_at) ' +
        'VALUES (1, ?, ?, ?, ?, NOW()) ' +
        'ON DUPLICATE KEY UPDATE time_hour = ?, time_minute = ?, weather = ?, blackout = ?, updated_at = NOW()',
        [
          this.state.time.hour,
          this.state.time.minute,
          this.state.weather.current,
          this.state.blackout ? 1 : 0,
          this.state.time.hour,
          this.state.time.minute,
          this.state.weather.current,
          this.state.blackout ? 1 : 0
        ]
      );

      this.framework.log.debug('World state saved to database');
    } catch (error) {
      this.framework.log.warn(`Failed to save world state: ${error.message}`);
    }
  }

  // ================================
  // Configuration
  // ================================

  /**
   * Configure sync manager
   */
  configure(config) {
    if (config.time) {
      this.state.time = { ...this.state.time, ...config.time };
    }
    if (config.weather) {
      this.state.weather = { ...this.state.weather, ...config.weather };
    }
    if (config.blackout !== undefined) {
      this.state.blackout = config.blackout;
    }
    if (config.trafficDensity !== undefined) {
      this.state.trafficDensity = config.trafficDensity;
    }
    if (config.pedestrianDensity !== undefined) {
      this.state.pedestrianDensity = config.pedestrianDensity;
    }

    this.framework.log.info('Sync manager configuration updated');
  }

  /**
   * Get current state
   */
  getState() {
    return {
      time: this.getTime(),
      weather: this.getWeather(),
      blackout: this.state.blackout,
      trafficDensity: this.state.trafficDensity,
      pedestrianDensity: this.state.pedestrianDensity
    };
  }


  /**
   * Cleanup
   */
  async destroy() {
    this.stopTime();
    this.stopWeatherCycle();
    this.stopSync();
    await this.saveState();
    this.framework.log.info('Sync manager module destroyed');
  }
}

module.exports = SyncManager;

// Self-register
global.Framework.register('sync-manager', new SyncManager(global.Framework), 11);
