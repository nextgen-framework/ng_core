/**
 * NextGen Framework - Ultra-Minimal Kernel
 * Loads optional modules dynamically
 */

class NextGenFramework {
  constructor() {
    this.version = '1.0.0';
    this.modules = new Map();
    this.hooks = new Map();
    this.config = global.NGCore?.Config || global.NextGenConfig;
    this.utils = global.NGCore?.Utils || global.NextGenUtils;
    this.constants = global.NGCore?.Constants || global.NextGenConstants;

    // Core: Only EventBus (ultra-minimal)
    this.eventBus = null;

    // Consolidated native event handlers (optimization to avoid max listeners warning)
    this.nativeHandlers = new Map();
    this.setupNativeEventListeners();
  }

  /**
   * Setup consolidated native FiveM event listeners
   * This is an optimization: instead of 11+ modules each calling on('playerDropped'),
   * we have ONE listener that distributes to all registered handlers
   */
  setupNativeEventListeners() {
    // Consolidated playerDropped listener
    on('playerDropped', (reason) => {
      // Note: 'source' is a magic global variable in FiveM event handlers
      const handlers = this.nativeHandlers.get('playerDropped') || [];
      handlers.forEach(handler => {
        try {
          handler(source, reason);
        } catch (error) {
          this.utils.Log(`playerDropped handler error: ${error.message}`, 'error');
        }
      });
    });
  }

  /**
   * Register a handler for a native FiveM event (consolidated)
   * Modules should use this instead of calling on() directly for better performance
   * @param {string} eventName - The native event name (e.g., 'playerDropped')
   * @param {Function} handler - The handler function
   */
  onNative(eventName, handler) {
    if (!this.nativeHandlers.has(eventName)) {
      this.nativeHandlers.set(eventName, []);
    }
    this.nativeHandlers.get(eventName).push(handler);
  }

  /**
   * Initialize the framework
   * Phase 1: Core (EventBus)
   * Phase 2: Modules
   */
  async init() {
    try {
      const path = require('path');
      const resourcePath = GetResourcePath(GetCurrentResourceName());

      // PHASE 1: Initialize ONLY the EventBus (kernel's minimal component)
      this.utils.Log('Phase 1: Initializing Core (EventBus)...', 'info');
      this.eventBus = new (require(path.join(resourcePath, 'src/core/server/event-bus.js')))();

      // PHASE 2: Load optional modules
      this.utils.Log('Phase 2: Loading Modules...', 'info');
      await this.loadModules();

      this.utils.Log('Framework initialized successfully!', 'info');
      this.eventBus.emit(this.constants.Events.FRAMEWORK_READY);

    } catch (error) {
      this.utils.Log(`Framework initialization failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Load optional modules dynamically
   * Modules are loaded in priority order (lower priority number = loads first)
   */
  async loadModules() {
    const path = require('path');
    const resourcePath = GetResourcePath(GetCurrentResourceName());

    // Get module configuration (which modules to load)
    let modulesToLoad = this.config.Modules || [
      { name: 'plugin-manager', priority: 0 },
      { name: 'player-manager', priority: 10 },
      { name: 'entity-manager', priority: 10 },
      { name: 'rpc', priority: 5 }
    ];

    // Normalize config to support both old format (string array) and new format (object array)
    modulesToLoad = modulesToLoad.map(module => {
      if (typeof module === 'string') {
        return { name: module, priority: 100 }; // Default priority for backward compatibility
      }
      return module;
    });

    // Sort modules by priority (lower number = higher priority = loads first)
    modulesToLoad.sort((a, b) => a.priority - b.priority);

    this.utils.Log(`Loading ${modulesToLoad.length} modules (sorted by priority)...`, 'info');

    for (const module of modulesToLoad) {
      const moduleName = module.name;
      try {
        const modulePath = path.join(resourcePath, 'src/modules', moduleName, 'server.js');

        // Check if server.js exists (some modules are client-only or shared-only)
        const fs = require('fs');
        if (!fs.existsSync(modulePath)) {
          this.utils.Log(`Module ${moduleName} has no server.js (skipping server-side load)`, 'debug');
          continue;
        }

        const ModuleClass = require(modulePath);

        // Instantiate and initialize module
        const moduleInstance = new ModuleClass(this);
        await moduleInstance.init?.();

        this.modules.set(moduleName, moduleInstance);
        this.utils.Log(`Module loaded: ${moduleName} (priority: ${module.priority})`, 'info');
      } catch (error) {
        this.utils.Log(`Failed to load module ${moduleName}: ${error.message}`, 'warn');
      }
    }
  }

  /**
   * Get a loaded module
   * @param {string} moduleName
   * @returns {*}
   */
  getModule(moduleName) {
    return this.modules.get(moduleName);
  }

  /**
   * Register a hook
   * @param {string} hookName
   * @param {Function} callback
   */
  registerHook(hookName, callback) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push(callback);
  }

  /**
   * Run all hooks for a given name
   * @param {string} hookName
   * @param {...*} args
   */
  async runHook(hookName, ...args) {
    const callbacks = this.hooks.get(hookName) || [];
    for (const callback of callbacks) {
      try {
        await callback(...args);
      } catch (error) {
        this.utils.Log(`Hook ${hookName} error: ${error.message}`, 'error');
      }
    }
  }

  // ===== Convenience accessors for common modules =====
  // These provide backward compatibility and easy access

  get database() {
    return this.modules.get('database');
  }

  get db() {
    return this.modules.get('database'); // Alias
  }

  get pluginLoader() {
    return this.modules.get('plugin-manager');
  }

  get playerPool() {
    return this.modules.get('player-manager');
  }

  get entityPool() {
    return this.modules.get('entity-manager');
  }

  get rpc() {
    return this.modules.get('rpc');
  }

  get resourceMonitor() {
    return this.modules.get('resource-monitor');
  }

  // ===== Module API pass-throughs =====

  async use(pluginName, options = {}) {
    const pluginManager = this.modules.get('plugin-manager');
    if (!pluginManager) {
      throw new Error('plugin-manager module not loaded');
    }
    return await pluginManager.load(pluginName, options);
  }

  getPlugin(pluginName) {
    const pluginManager = this.modules.get('plugin-manager');
    if (!pluginManager) return null;
    return pluginManager.plugins?.get(pluginName);
  }

  registerRPC(name, handler) {
    const rpcModule = this.modules.get('rpc');
    if (!rpcModule) {
      throw new Error('rpc module not loaded');
    }
    return rpcModule.register(name, handler);
  }

  getPlayer(source) {
    const playerManager = this.modules.get('player-manager');
    if (!playerManager) return null;
    return playerManager.get(source);
  }

  getPlayers() {
    const playerManager = this.modules.get('player-manager');
    if (!playerManager) return new Map();
    return playerManager.getAll();
  }
}

// Export
module.exports = NextGenFramework;
