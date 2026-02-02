/**
 * NextGen Framework - Persistence Module
 * Centralized auto-save and persistence management for all modules
 *
 * This module provides:
 * - Auto-save scheduling for modules
 * - Graceful shutdown handling
 * - Save on player disconnect
 * - Manual save triggers
 * - Save queue management
 */

class PersistenceManager {
  constructor(framework) {
    this.framework = framework;
    this.db = null;

    // Registered save handlers from modules
    this.saveHandlers = new Map(); // moduleName => { handler, interval, lastSave }

    // Save intervals
    this.intervals = new Map(); // moduleName => intervalId

    // Configuration
    this.config = {
      defaultInterval: 300000, // 5 minutes default
      saveOnDisconnect: true,
      saveOnShutdown: true,
      batchSaveDelay: 1000, // Delay between batch saves to avoid DB overload
      maxRetries: 3
    };

    // Save queue for player-specific data
    this.saveQueue = new Set(); // Set of sources pending save
    this.isSaving = false;
  }

  async init() {
    this.db = this.framework.getModule('database');

    // Register event handlers
    this.registerEvents();

    this.framework.log.info('Persistence manager initialized');
  }

  registerEvents() {
    // Save on player disconnect
    if (this.config.saveOnDisconnect) {
      on('playerDropped', async (reason) => {
        const src = global.source;
        await this.savePlayerData(src, 'disconnect');
      });
    }

    // Save on resource stop (graceful shutdown)
    if (this.config.saveOnShutdown) {
      on('onResourceStop', async (resourceName) => {
        if (resourceName === GetCurrentResourceName()) {
          await this.saveAll('shutdown');
        }
      });
    }
  }

  /**
   * Register a save handler for a module
   * @param {string} moduleName - Name of the module
   * @param {Function} handler - Save handler function (async)
   * @param {Object} options - Options { interval, saveOnDisconnect }
   */
  register(moduleName, handler, options = {}) {
    const interval = options.interval || this.config.defaultInterval;
    const saveOnDisconnect = options.saveOnDisconnect !== false;

    this.saveHandlers.set(moduleName, {
      handler,
      interval,
      saveOnDisconnect,
      lastSave: Date.now()
    });

    // Start auto-save interval if interval > 0
    if (interval > 0) {
      this.startAutoSave(moduleName);
    }

    this.framework.log.debug(`Registered save handler for ${moduleName} (interval: ${interval}ms)`);
  }

  /**
   * Unregister a save handler
   * @param {string} moduleName
   */
  unregister(moduleName) {
    this.stopAutoSave(moduleName);
    this.saveHandlers.delete(moduleName);
    this.framework.log.debug(`Unregistered save handler for ${moduleName}`);
  }

  /**
   * Start auto-save interval for a module
   * @param {string} moduleName
   */
  startAutoSave(moduleName) {
    const saveData = this.saveHandlers.get(moduleName);
    if (!saveData || saveData.interval <= 0) return;

    // Clear existing interval if any
    this.stopAutoSave(moduleName);

    // Create new interval
    const intervalId = setInterval(async () => {
      try {
        await this.saveModule(moduleName, 'auto-save');
      } catch (error) {
        this.framework.log.error(`Auto-save failed for ${moduleName}: ${error.message}`);
      }
    }, saveData.interval);

    this.intervals.set(moduleName, intervalId);
    this.framework.log.debug(`Started auto-save for ${moduleName}`);
  }

  /**
   * Stop auto-save interval for a module
   * @param {string} moduleName
   */
  stopAutoSave(moduleName) {
    const intervalId = this.intervals.get(moduleName);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(moduleName);
      this.framework.log.debug(`Stopped auto-save for ${moduleName}`);
    }
  }

  /**
   * Save a specific module's data
   * @param {string} moduleName
   * @param {string} reason - Reason for save (auto-save, manual, disconnect, shutdown)
   */
  async saveModule(moduleName, reason = 'manual') {
    const saveData = this.saveHandlers.get(moduleName);
    if (!saveData) {
      this.framework.log.warn(`No save handler registered for ${moduleName}`);
      return { success: false, error: 'No handler registered' };
    }

    const startTime = Date.now();
    let retries = 0;
    let lastError = null;

    // Retry logic
    while (retries < this.config.maxRetries) {
      try {
        await saveData.handler();

        saveData.lastSave = Date.now();
        const duration = Date.now() - startTime;

        this.framework.log.debug(`Saved ${moduleName} data (${reason}) in ${duration}ms`);
        return { success: true, duration };
      } catch (error) {
        lastError = error;
        retries++;

        if (retries < this.config.maxRetries) {
          this.framework.log.warn(`Save failed for ${moduleName} (attempt ${retries}/${this.config.maxRetries}): ${error.message}`);
          await this.sleep(1000 * retries); // Exponential backoff
        }
      }
    }

    // All retries failed
    this.framework.log.error(`Save failed for ${moduleName} after ${this.config.maxRetries} attempts: ${lastError.message}`);
    return { success: false, error: lastError.message };
  }

  /**
   * Save player-specific data from all modules
   * @param {number} source - Player source
   * @param {string} reason
   */
  async savePlayerData(source, reason = 'manual') {
    const startTime = Date.now();
    const results = [];

    for (const [moduleName, saveData] of this.saveHandlers.entries()) {
      if (!saveData.saveOnDisconnect && reason === 'disconnect') {
        continue; // Skip modules that don't save on disconnect
      }

      try {
        // Call handler with source parameter
        await saveData.handler(source);
        results.push({ module: moduleName, success: true });
      } catch (error) {
        this.framework.log.error(`Failed to save player data for ${moduleName}: ${error.message}`);
        results.push({ module: moduleName, success: false, error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    this.framework.log.debug(`Saved player ${source} data from ${successCount}/${results.length} modules (${reason}) in ${duration}ms`);
    return { success: true, results, duration };
  }

  /**
   * Save all data from all registered modules
   * @param {string} reason
   */
  async saveAll(reason = 'manual') {
    if (this.isSaving) {
      this.framework.log.warn('Save already in progress, skipping');
      return { success: false, error: 'Save in progress' };
    }

    this.isSaving = true;
    const startTime = Date.now();
    const results = [];

    this.framework.log.info(`Starting full save (${reason})...`);

    for (const moduleName of this.saveHandlers.keys()) {
      const result = await this.saveModule(moduleName, reason);
      results.push({ module: moduleName, ...result });

      // Add delay between saves to avoid DB overload
      if (this.config.batchSaveDelay > 0) {
        await this.sleep(this.config.batchSaveDelay);
      }
    }

    this.isSaving = false;
    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    this.framework.log.info(`Full save completed: ${successCount}/${results.length} modules in ${duration}ms`);
    return { success: true, results, duration };
  }

  /**
   * Get save status for all modules
   */
  getStatus() {
    const status = [];

    for (const [moduleName, saveData] of this.saveHandlers.entries()) {
      const timeSinceLastSave = Date.now() - saveData.lastSave;
      const hasInterval = this.intervals.has(moduleName);

      status.push({
        module: moduleName,
        interval: saveData.interval,
        lastSave: saveData.lastSave,
        timeSinceLastSave,
        autoSaveEnabled: hasInterval,
        saveOnDisconnect: saveData.saveOnDisconnect
      });
    }

    return status;
  }

  /**
   * Manual save trigger (can be called via command)
   */
  async triggerManualSave() {
    return await this.saveAll('manual');
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async destroy() {
    // Save all data before destroying
    await this.saveAll('destroy');

    // Stop all intervals
    for (const moduleName of this.intervals.keys()) {
      this.stopAutoSave(moduleName);
    }

    // Clear handlers
    this.saveHandlers.clear();
    this.intervals.clear();
  }
}

module.exports = PersistenceManager;

// Self-register
global.Framework.register('persistence', new PersistenceManager(global.Framework), 3);
