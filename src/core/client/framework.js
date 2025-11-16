/**
 * NextGen Framework - Ultra-Minimal Kernel (Client-Side)
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
  }

  /**
   * Initialize the framework
   * Phase 1: Core (EventBus)
   * Phase 2: Modules
   */
  async init() {
    try {
      // PHASE 1: Initialize ONLY the EventBus (kernel's minimal component)
      this.utils.Log('Phase 1: Initializing Core (EventBus)...', 'info');
      this.eventBus = new global.ClientEventBus();

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
    // Get module configuration (which modules to load)
    let modulesToLoad = this.config.ClientModules || [
      { name: 'resource-monitor', priority: 0 },
      { name: 'plugin-manager', priority: 1 },
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

    const path = require('path');
    const resourcePath = GetResourcePath(GetCurrentResourceName());

    for (const module of modulesToLoad) {
      const moduleName = module.name;
      try {
        // Load module class using require() (same as server-side)
        const modulePath = path.join(resourcePath, 'src/modules', moduleName, 'client.js');
        const ModuleClass = require(modulePath);

        if (!ModuleClass) {
          throw new Error(`Module class not exported`);
        }

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

  get pluginLoader() {
    return this.modules.get('plugin-manager');
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
}

// Export for client-side (no module.exports in client)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NextGenFramework;
}

// Make available globally for client-side
global.ClientNextGenFramework = NextGenFramework;
