/**
 * NextGen Framework - Plugin Manager Module (Client-Side)
 * Dynamic plugin loading system for external plugins
 * Note: Client-side version doesn't support local file loading, only external resource-based plugins
 */

class PluginManager {
  constructor(framework) {
    this.framework = framework;
    this.plugins = new Map(); // External plugins
    this.pluginStates = new Map();
    this.externalPlugins = new Map(); // Track external resource-based plugins
    this.autoDetectionEnabled = false;
  }

  /**
   * Initialize the plugin manager module
   * This triggers Phase 3: Plugin loading
   */
  async init() {
    this.framework.log.info('Plugin Manager module initialized');

    // PHASE 3: Load plugins (external only on client)
    this.framework.log.info('Phase 3: Loading Plugins...');

    // Enable auto-detection for external resource-based plugins
    this.enableAutoDetection();
  }

  /**
   * Enable automatic detection of external resource-based plugins
   */
  enableAutoDetection() {
    if (this.autoDetectionEnabled) {
      this.framework.log.warn('Plugin auto-detection is already enabled');
      return;
    }

    this.autoDetectionEnabled = true;
    this.framework.log.info('Enabling plugin auto-detection for external resources...');

    // Listen for resource start events (client-side)
    on('onResourceStart', async (resourceName) => {
      // Don't process our own resource
      if (resourceName === GetCurrentResourceName()) {
        return;
      }

      // Check if this resource is an ng_core plugin
      await this.detectAndLoadExternalPlugin(resourceName);
    });

    // Listen for resource stop events
    on('onResourceStop', async (resourceName) => {
      // Don't process our own resource
      if (resourceName === GetCurrentResourceName()) {
        return;
      }

      // Unload the plugin if it was loaded
      if (this.externalPlugins.has(resourceName)) {
        await this.unloadExternalPlugin(resourceName);
      }
    });

    // Wait for all resources to be loaded before scanning
    this.framework.eventBus.on(this.framework.constants.Events.ALL_RESOURCES_LOADED, async () => {
      await this.scanExistingResources();
    });

    this.framework.log.info('Plugin auto-detection enabled successfully');
  }

  /**
   * Scan already started resources for ng_core plugins
   */
  async scanExistingResources() {
    this.framework.log.info('Scanning existing resources for ng_core plugins...');

    const numResources = GetNumResources();
    let detectedCount = 0;

    for (let i = 0; i < numResources; i++) {
      const resourceName = GetResourceByFindIndex(i);

      // Skip our own resource
      if (resourceName === GetCurrentResourceName()) {
        continue;
      }

      // Check if resource is running
      const state = GetResourceState(resourceName);
      if (state === 'started') {
        // Try to detect and load the plugin
        const loaded = await this.detectAndLoadExternalPlugin(resourceName);
        if (loaded) {
          detectedCount++;
        }
      }
    }

    if (detectedCount > 0) {
      this.framework.log.info(`Found and loaded ${detectedCount} external plugins`);
    }
  }

  /**
   * Detect and load an external plugin from a resource
   * @param {string} resourceName
   * @returns {boolean} True if plugin was loaded
   */
  async detectAndLoadExternalPlugin(resourceName) {
    // On client-side, we can't read files directly, so we rely on the server
    // to provide plugin metadata or use exports from the plugin resource

    // Check if the resource exports a plugin registration
    try {
      const pluginExport = exports[resourceName];
      if (pluginExport && typeof pluginExport.GetNGPlugin === 'function') {
        const pluginData = pluginExport.GetNGPlugin();
        if (pluginData) {
          await this.loadExternalPlugin(resourceName, pluginData.metadata, pluginData.instance);
          return true;
        }
      }
    } catch (error) {
      // Not a plugin, ignore
    }

    return false;
  }

  /**
   * Load an external plugin from a separate resource
   * @param {string} resourceName - Name of the plugin resource
   * @param {Object} metadata - Plugin metadata
   * @param {*} pluginInstance - Plugin instance (already created by the resource)
   */
  async loadExternalPlugin(resourceName, metadata, pluginInstance) {
    if (this.externalPlugins.has(resourceName)) {
      this.framework.log.warn(`External plugin "${resourceName}" is already loaded`);
      return;
    }

    this.framework.log.info(`Loading external plugin: ${resourceName}`);

    // Initialize the plugin
    if (typeof pluginInstance.init === 'function') {
      await pluginInstance.init(this.framework, {});
    }

    // Register the plugin
    this.externalPlugins.set(resourceName, {
      instance: pluginInstance,
      metadata,
      resourceName
    });

    this.framework.log.info(`External plugin loaded: ${metadata.name || resourceName}`);

    // Emit event
    this.framework.eventBus.emit('PLUGIN_LOADED', {
      name: metadata.name || resourceName,
      resourceName,
      metadata
    });
  }

  /**
   * Unload an external plugin
   * @param {string} resourceName
   */
  async unloadExternalPlugin(resourceName) {
    const plugin = this.externalPlugins.get(resourceName);
    if (!plugin) {
      return;
    }

    this.framework.log.info(`Unloading external plugin: ${resourceName}`);

    // Call destroy if available
    if (typeof plugin.instance.destroy === 'function') {
      try {
        await plugin.instance.destroy();
      } catch (error) {
        this.framework.log.error(`Error during plugin destroy for "${resourceName}": ${error.message}`);
      }
    }

    // Remove from registry
    this.externalPlugins.delete(resourceName);

    this.framework.log.info(`External plugin unloaded: ${resourceName}`);

    // Emit event
    this.framework.eventBus.emit('PLUGIN_UNLOADED', {
      resourceName
    });
  }

  /**
   * Register a plugin instance directly
   * @param {string} pluginName
   * @param {*} pluginInstance
   */
  async register(pluginName, pluginInstance) {
    if (this.plugins.has(pluginName)) {
      throw new Error(`Plugin "${pluginName}" is already registered`);
    }

    // Initialize if needed
    if (typeof pluginInstance.init === 'function') {
      await pluginInstance.init(this.framework, {});
    }

    this.plugins.set(pluginName, pluginInstance);
    this.pluginStates.set(pluginName, 'loaded');

    this.framework.log.info(`Plugin registered: ${pluginName}`);
  }

  /**
   * Get a loaded plugin
   * @param {string} pluginName
   */
  get(pluginName) {
    return this.plugins.get(pluginName) || this.externalPlugins.get(pluginName)?.instance;
  }

  /**
   * Check if a plugin is loaded
   * @param {string} pluginName
   * @returns {boolean}
   */
  has(pluginName) {
    return this.plugins.has(pluginName) || this.externalPlugins.has(pluginName);
  }

  /**
   * Unload a plugin
   * @param {string} pluginName
   */
  async unload(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      this.framework.log.warn(`Plugin "${pluginName}" is not loaded`);
      return;
    }

    this.framework.log.info(`Unloading plugin: ${pluginName}`);

    // Call destroy if available
    if (typeof plugin.destroy === 'function') {
      await plugin.destroy();
    }

    // Remove from registry
    this.plugins.delete(pluginName);
    this.pluginStates.delete(pluginName);

    this.framework.log.info(`Plugin unloaded: ${pluginName}`);
  }

  /**
   * Get all loaded plugins
   * @returns {Map}
   */
  getAll() {
    return this.plugins;
  }

  /**
   * Get all loaded plugin names
   * @returns {string[]}
   */
  getLoadedPlugins() {
    return Array.from(this.plugins.keys());
  }

  /**
   * Cleanup method
   */
  async destroy() {
    this.framework.log.info('Plugin Manager module destroyed');

    // Unload all plugins
    for (const [pluginName] of this.plugins) {
      await this.unload(pluginName);
    }

    // Unload all external plugins
    for (const [resourceName] of this.externalPlugins) {
      await this.unloadExternalPlugin(resourceName);
    }
  }
}

// Export for client-side (no module.exports in client)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PluginManager;
}

// Export to global scope for framework (FiveM client environment)
global.NgModule_plugin_manager = PluginManager;

// Self-register
global.Framework.register('plugin-manager', new PluginManager(global.Framework), 2);
