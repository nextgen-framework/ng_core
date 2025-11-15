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
    this.framework.utils.Log('Plugin Manager module initialized', 'info');

    // PHASE 3: Load plugins (external only on client)
    this.framework.utils.Log('Phase 3: Loading Plugins...', 'info');

    // Enable auto-detection for external resource-based plugins
    this.enableAutoDetection();
  }

  /**
   * Enable automatic detection of external resource-based plugins
   */
  enableAutoDetection() {
    if (this.autoDetectionEnabled) {
      this.framework.utils.Log('Plugin auto-detection is already enabled', 'warn');
      return;
    }

    this.autoDetectionEnabled = true;
    this.framework.utils.Log('Enabling plugin auto-detection for external resources...', 'info');

    // Listen for resource start events (client-side)
    on('onResourceStart', async (resourceName) => {
      // Don't process our own resource
      if (resourceName === GetCurrentResourceName()) {
        return;
      }

      // Check if this resource is an ng-core plugin
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

    // Scan already started resources for plugins
    setImmediate(async () => {
      await this.scanExistingResources();
    });

    this.framework.utils.Log('Plugin auto-detection enabled successfully', 'info');
  }

  /**
   * Scan already started resources for ng-core plugins
   */
  async scanExistingResources() {
    this.framework.utils.Log('Scanning existing resources for ng-core plugins...', 'info');

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
      this.framework.utils.Log(`Found and loaded ${detectedCount} external plugins`, 'info');
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
      this.framework.utils.Log(`External plugin "${resourceName}" is already loaded`, 'warn');
      return;
    }

    this.framework.utils.Log(`Loading external plugin: ${resourceName}`, 'info');

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

    this.framework.utils.Log(`External plugin loaded: ${metadata.name || resourceName}`, 'info');

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

    this.framework.utils.Log(`Unloading external plugin: ${resourceName}`, 'info');

    // Call destroy if available
    if (typeof plugin.instance.destroy === 'function') {
      try {
        await plugin.instance.destroy();
      } catch (error) {
        this.framework.utils.Log(`Error during plugin destroy for "${resourceName}": ${error.message}`, 'error');
      }
    }

    // Remove from registry
    this.externalPlugins.delete(resourceName);

    this.framework.utils.Log(`External plugin unloaded: ${resourceName}`, 'info');

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

    this.framework.utils.Log(`Plugin registered: ${pluginName}`, 'info');
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
      this.framework.utils.Log(`Plugin "${pluginName}" is not loaded`, 'warn');
      return;
    }

    this.framework.utils.Log(`Unloading plugin: ${pluginName}`, 'info');

    // Call destroy if available
    if (typeof plugin.destroy === 'function') {
      await plugin.destroy();
    }

    // Remove from registry
    this.plugins.delete(pluginName);
    this.pluginStates.delete(pluginName);

    this.framework.utils.Log(`Plugin unloaded: ${pluginName}`, 'info');
  }

  /**
   * Get all loaded plugins
   * @returns {Map}
   */
  getAll() {
    return this.plugins;
  }

  /**
   * Cleanup method
   */
  async destroy() {
    this.framework.utils.Log('Plugin Manager module destroyed', 'info');

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

// Make available globally for client-side
global.ClientModule_plugin_manager = PluginManager;
