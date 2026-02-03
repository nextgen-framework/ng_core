/**
 * NextGen Framework - Tick Manager Module (Client-Side)
 * Manages ticks with automatic cleanup and performance optimization
 *
 * Based on: fivem/threads - "Track ticks for cleanup"
 * Based on: patterns/performance - "Conditional Tick Activation"
 */

class TickManager {
  constructor(framework) {
    this.framework = framework;

    // Track all ticks
    this.ticks = new Map(); // id => { tickId, name, callback, active, createdAt }

    // Track intervals
    this.intervals = new Map(); // id => { intervalId, name, callback, ms }

    // Auto-increment ID
    this._nextId = 1;

    // Performance tracking
    this.stats = {
      totalTicks: 0,
      activeTicks: 0,
      totalIntervals: 0
    };
  }

  /**
   * Initialize tick manager
   */
  async init() {
    // Cleanup on resource stop
    this.framework.fivem.on('onResourceStop', (resourceName) => {
      if (resourceName === GetCurrentResourceName()) {
        this.destroyAll();
      }
    });

    this.framework.log.info('Tick Manager initialized');
  }

  // ============================================
  // Tick Management
  // ============================================

  /**
   * Create a new tick
   * @param {string} name - Identifier for the tick
   * @param {Function} callback - Function to run every frame
   * @param {boolean} startActive - Start immediately (default: true)
   * @returns {number} Tick ID
   */
  create(name, callback, startActive = true) {
    const id = this._nextId++;

    const tickData = {
      id,
      name,
      callback,
      tickId: null,
      active: false,
      createdAt: GetGameTimer()
    };

    this.ticks.set(id, tickData);
    this.stats.totalTicks++;

    if (startActive) {
      this.start(id);
    }

    return id;
  }

  /**
   * Start a tick
   * @param {number} id - Tick ID
   * @returns {boolean}
   */
  start(id) {
    const tick = this.ticks.get(id);
    if (!tick) return false;
    if (tick.active) return true;

    tick.tickId = setTick(tick.callback);
    tick.active = true;
    this.stats.activeTicks++;

    return true;
  }

  /**
   * Stop a tick (but keep it registered)
   * @param {number} id - Tick ID
   * @returns {boolean}
   */
  stop(id) {
    const tick = this.ticks.get(id);
    if (!tick) return false;
    if (!tick.active) return true;

    clearTick(tick.tickId);
    tick.tickId = null;
    tick.active = false;
    this.stats.activeTicks--;

    return true;
  }

  /**
   * Toggle tick on/off
   * @param {number} id - Tick ID
   * @returns {boolean} New active state
   */
  toggle(id) {
    const tick = this.ticks.get(id);
    if (!tick) return false;

    if (tick.active) {
      this.stop(id);
      return false;
    } else {
      this.start(id);
      return true;
    }
  }

  /**
   * Destroy a tick completely
   * @param {number} id - Tick ID
   * @returns {boolean}
   */
  destroy(id) {
    const tick = this.ticks.get(id);
    if (!tick) return false;

    if (tick.active) {
      clearTick(tick.tickId);
      this.stats.activeTicks--;
    }

    this.ticks.delete(id);
    this.stats.totalTicks--;

    return true;
  }

  /**
   * Check if tick is active
   * @param {number} id - Tick ID
   * @returns {boolean}
   */
  isActive(id) {
    const tick = this.ticks.get(id);
    return tick ? tick.active : false;
  }

  // ============================================
  // Interval Management
  // ============================================

  /**
   * Create a new interval
   * @param {string} name - Identifier
   * @param {Function} callback - Function to run
   * @param {number} ms - Interval in milliseconds
   * @returns {number} Interval ID
   */
  createInterval(name, callback, ms) {
    const id = this._nextId++;

    const intervalId = setInterval(callback, ms);

    this.intervals.set(id, {
      id,
      name,
      callback,
      intervalId,
      ms
    });

    this.stats.totalIntervals++;

    return id;
  }

  /**
   * Destroy an interval
   * @param {number} id - Interval ID
   * @returns {boolean}
   */
  destroyInterval(id) {
    const interval = this.intervals.get(id);
    if (!interval) return false;

    clearInterval(interval.intervalId);
    this.intervals.delete(id);
    this.stats.totalIntervals--;

    return true;
  }

  // ============================================
  // Throttled Tick (Performance Pattern)
  // ============================================

  /**
   * Create a throttled tick that runs at most once per interval
   * @param {string} name - Identifier
   * @param {Function} callback - Function to run
   * @param {number} throttleMs - Minimum ms between calls
   * @returns {number} Tick ID
   */
  createThrottled(name, callback, throttleMs = 100) {
    let lastRun = 0;

    return this.create(name, () => {
      const now = GetGameTimer();
      if (now - lastRun < throttleMs) return;
      lastRun = now;
      callback();
    });
  }

  /**
   * Create a distance-based tick (runs more often when close)
   * Based on: patterns/performance - "Distance-based updates"
   * @param {string} name - Identifier
   * @param {Function} callback - Function receiving distance
   * @param {number} targetX
   * @param {number} targetY
   * @param {number} targetZ
   * @param {Object} options - { near: 0, medium: 500, far: 2000 }
   * @returns {number} Tick ID
   */
  createDistanceBased(name, callback, targetX, targetY, targetZ, options = {}) {
    const { near = 0, medium = 500, far = 2000 } = options;
    let lastRun = 0;

    return this.create(name, () => {
      const now = GetGameTimer();
      const ped = PlayerPedId();
      const coords = GetEntityCoords(ped, false);

      const distance = GetDistanceBetweenCoords(
        coords[0], coords[1], coords[2],
        targetX, targetY, targetZ,
        true
      );

      // Determine throttle based on distance
      let throttle;
      if (distance < 10) {
        throttle = near;
      } else if (distance < 50) {
        throttle = medium;
      } else {
        throttle = far;
      }

      if (now - lastRun < throttle) return;
      lastRun = now;

      callback(distance);
    });
  }

  // ============================================
  // Safe Tick (Error Handling)
  // ============================================

  /**
   * Create a tick with error handling
   * Based on: fivem/threads - "Safe Tick Wrapper"
   * @param {string} name - Identifier
   * @param {Function} callback
   * @returns {number} Tick ID
   */
  createSafe(name, callback) {
    return this.create(name, () => {
      try {
        callback();
      } catch (error) {
        this.framework.log.error(`[TickManager] Error in tick "${name}": ${error.message}`);
      }
    });
  }

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Stop all ticks
   */
  stopAll() {
    for (const [id] of this.ticks) {
      this.stop(id);
    }
  }

  /**
   * Start all ticks
   */
  startAll() {
    for (const [id] of this.ticks) {
      this.start(id);
    }
  }

  /**
   * Destroy all ticks and intervals
   */
  destroyAll() {
    for (const [id, tick] of this.ticks) {
      if (tick.active) {
        clearTick(tick.tickId);
      }
    }
    this.ticks.clear();

    for (const [id, interval] of this.intervals) {
      clearInterval(interval.intervalId);
    }
    this.intervals.clear();

    this.stats = { totalTicks: 0, activeTicks: 0, totalIntervals: 0 };

    this.framework.log.info('All ticks and intervals destroyed');
  }

  /**
   * Get stats
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      ticks: Array.from(this.ticks.values()).map(t => ({
        id: t.id,
        name: t.name,
        active: t.active
      })),
      intervals: Array.from(this.intervals.values()).map(i => ({
        id: i.id,
        name: i.name,
        ms: i.ms
      }))
    };
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.destroyAll();
    this.framework.log.info('Tick Manager destroyed');
  }
}

// Export for client-side
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TickManager;
}

// Self-register
global.Framework.register('tick-manager', new TickManager(global.Framework), 3);
