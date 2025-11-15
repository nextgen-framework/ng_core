/**
 * NextGen Framework - Sync Manager Module
 * Synchronizes world state (weather, time, blackout, etc.) across all clients
 */

class SyncManager {
  constructor(framework) {
    this.framework = framework;
    this.logger = null;

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
    this.logger = this.framework.getModule('logger');

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
      const source = global.source;
      this.syncToPlayer(source);
    });

    this.log('Sync manager module initialized', 'info', {
      time: `${this.state.time.hour}:${String(this.state.time.minute).padStart(2, '0')}`,
      weather: this.state.weather.current
    });
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

    this.log('Time progression started', 'debug');
  }

  /**
   * Stop time progression
   */
  stopTime() {
    if (this.timeTimer) {
      clearInterval(this.timeTimer);
      this.timeTimer = null;
      this.log('Time progression stopped', 'debug');
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

    this.log(`Time set to ${hour}:${String(minute).padStart(2, '0')}`, 'info');
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

    this.log(`Time ${frozen ? 'frozen' : 'unfrozen'}`, 'info');
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

    this.log('Weather cycle started', 'debug');
  }

  /**
   * Stop weather cycle
   */
  stopWeatherCycle() {
    if (this.weatherTimer) {
      clearInterval(this.weatherTimer);
      this.weatherTimer = null;
      this.log('Weather cycle stopped', 'debug');
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
      this.log(`Invalid weather type: ${weatherType}`, 'warn');
      return;
    }

    if (transition) {
      this.state.weather.transition = weatherType;

      // Sync transition to all clients
      emitNet('ng-core:weather-transition', -1, weatherType, this.state.weather.transitionDuration);

      // Update current weather after transition
      setTimeout(() => {
        this.state.weather.current = weatherType;
        this.state.weather.transition = null;
      }, this.state.weather.transitionDuration);

      this.log(`Weather transitioning to ${weatherType}`, 'debug');
    } else {
      this.state.weather.current = weatherType;
      emitNet('ng-core:weather-set', -1, weatherType);
      this.log(`Weather set to ${weatherType}`, 'info');
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

    this.log(`Weather cycle ${enabled ? 'enabled' : 'disabled'}`, 'info');
  }

  // ================================
  // Blackout Management
  // ================================

  /**
   * Set blackout state
   */
  setBlackout(enabled) {
    this.state.blackout = enabled;
    emitNet('ng-core:blackout-set', -1, enabled);
    this.log(`Blackout ${enabled ? 'enabled' : 'disabled'}`, 'info');
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
    emitNet('ng-core:traffic-density-set', -1, this.state.trafficDensity);
    this.log(`Traffic density set to ${this.state.trafficDensity}`, 'info');
  }

  /**
   * Set pedestrian density (0.0 - 1.0)
   */
  setPedestrianDensity(density) {
    this.state.pedestrianDensity = Math.max(0, Math.min(1, density));
    emitNet('ng-core:pedestrian-density-set', -1, this.state.pedestrianDensity);
    this.log(`Pedestrian density set to ${this.state.pedestrianDensity}`, 'info');
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

    this.log('Client sync started', 'debug');
  }

  /**
   * Stop periodic sync
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      this.log('Client sync stopped', 'debug');
    }
  }

  /**
   * Sync current state to all clients
   */
  syncToAll() {
    this.syncTimeToAll(false);
    emitNet('ng-core:weather-set', -1, this.state.weather.current);
    emitNet('ng-core:blackout-set', -1, this.state.blackout);
    emitNet('ng-core:traffic-density-set', -1, this.state.trafficDensity);
    emitNet('ng-core:pedestrian-density-set', -1, this.state.pedestrianDensity);
  }

  /**
   * Sync current state to specific player
   */
  syncToPlayer(source) {
    emitNet('ng-core:time-set', source,
      this.state.time.hour,
      this.state.time.minute,
      this.state.time.second,
      this.state.time.frozen,
      false // No transition
    );
    emitNet('ng-core:weather-set', source, this.state.weather.current);
    emitNet('ng-core:blackout-set', source, this.state.blackout);
    emitNet('ng-core:traffic-density-set', source, this.state.trafficDensity);
    emitNet('ng-core:pedestrian-density-set', source, this.state.pedestrianDensity);
  }

  /**
   * Sync time to all clients
   */
  syncTimeToAll(transition) {
    emitNet('ng-core:time-set', -1,
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
      const db = this.framework.database;
      if (!db) return;

      const saved = await db.query('SELECT * FROM world_state WHERE id = 1');

      if (saved.length > 0) {
        const data = saved[0];
        this.state.time.hour = data.time_hour || 12;
        this.state.time.minute = data.time_minute || 0;
        this.state.weather.current = data.weather || 'CLEAR';
        this.state.blackout = data.blackout === 1;

        this.log('World state loaded from database', 'debug');
      }
    } catch (error) {
      this.log(`Failed to load world state: ${error.message}`, 'warn');
    }
  }

  /**
   * Save state to database
   */
  async saveState() {
    try {
      const db = this.framework.database;
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

      this.log('World state saved to database', 'debug');
    } catch (error) {
      this.log(`Failed to save world state: ${error.message}`, 'warn');
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

    this.log('Sync manager configuration updated', 'info');
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
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.utils.Log(`[Sync Manager] ${message}`, level);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.stopTime();
    this.stopWeatherCycle();
    this.stopSync();
    await this.saveState();
    this.log('Sync manager module destroyed', 'info');
  }
}

module.exports = SyncManager;
