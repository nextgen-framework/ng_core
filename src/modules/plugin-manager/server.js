/**
 * NextGen Framework - Plugin Manager Module
 * Dynamic plugin loading system for external plugins
 */

const fs = require('fs');
const path = require('path');

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

    // PHASE 3: Load plugins (both internal and external)
    this.framework.log.info('Phase 3: Loading Plugins...');

    // Auto-load internal plugins from directories
    await this.autoLoad();

    // Enable auto-detection for external resource-based plugins
    this.enableAutoDetection();
  }

  /**
   * Auto-load internal plugins from plugin directories
   * Note: This is for internal plugins, NOT modules (modules are loaded by framework)
   */
  async autoLoad() {
    const directories = this.framework.config.PluginDirectories || ['plugins'];

    for (const dir of directories) {
      const pluginPath = path.resolve(GetResourcePath(GetCurrentResourceName()), dir);

      // Silently skip if directory doesn't exist (optional plugins directory)
      if (!fs.existsSync(pluginPath)) {
        continue;
      }

      const entries = fs.readdirSync(pluginPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginName = entry.name;
          const pluginDir = path.join(pluginPath, pluginName);

          // Look for plugin entry point (index.js or server.js)
          const possibleEntryPoints = ['index.js', 'server.js', 'main.js'];
          let entryPoint = null;

          for (const fileName of possibleEntryPoints) {
            const filePath = path.join(pluginDir, fileName);
            if (fs.existsSync(filePath)) {
              entryPoint = filePath;
              break;
            }
          }

          if (entryPoint) {
            try {
              await this.load(pluginName, {}, entryPoint);
            } catch (error) {
              this.framework.log.error(`Failed to auto-load internal plugin "${pluginName}": ${error.message}`);
            }
          }
        }
      }
    }
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

    // Listen for resource start events
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

    // Wait for all resources to be loaded before scanning (priority sorting on full set)
    this.framework.eventBus.on(this.framework.constants.Events.ALL_RESOURCES_LOADED, async () => {
      await this.scanExistingResources();
    });

    this.framework.log.info('Plugin auto-detection enabled successfully');
  }

  /**
   * Scan already started resources for ng_core plugins
   * Plugins are loaded in priority order (lower number = loads first)
   */
  async scanExistingResources() {
    this.framework.log.info('Scanning existing resources for ng_core plugins...');

    const numResources = GetNumResources();
    const detectedPlugins = [];

    // First pass: Detect all plugins and collect their metadata
    for (let i = 0; i < numResources; i++) {
      const resourceName = GetResourceByFindIndex(i);

      // Skip our own resource
      if (resourceName === GetCurrentResourceName()) {
        continue;
      }

      // Check if resource is running
      const state = GetResourceState(resourceName);
      if (state === 'started') {
        // Try to detect the plugin (without loading yet)
        const pluginInfo = await this.detectPlugin(resourceName);
        if (pluginInfo) {
          detectedPlugins.push(pluginInfo);
        }
      }
    }

    // Sort plugins by priority (lower number = higher priority = loads first)
    detectedPlugins.sort((a, b) => {
      const priorityA = a.metadata.priority || 100; // Default priority if not specified
      const priorityB = b.metadata.priority || 100;
      return priorityA - priorityB;
    });

    // Second pass: Load plugins in priority order
    let loadedPlugins = 0;
    for (const pluginInfo of detectedPlugins) {
      try {
        await this.loadExternalPlugin(
          pluginInfo.resourceName,
          pluginInfo.pluginPath,
          pluginInfo.metadata
        );
        loadedPlugins++;
      } catch (error) {
        this.framework.log.error(
          `Failed to load plugin ${pluginInfo.resourceName}: ${error.message}`
        );
      }
    }

    if (loadedPlugins > 0) {
      this.framework.log.info(`Found and loaded ${loadedPlugins} existing plugin(s) (sorted by priority)`);
    } else {
      this.framework.log.info('No existing plugins found');
    }

    // Emit event that all plugins have been loaded
    this.framework.eventBus.emit(this.framework.constants.Events.ALL_PLUGINS_LOADED);
    this.framework.log.info('All plugins loaded successfully');
  }

  /**
   * Detect if a resource is an ng_core plugin (without loading it)
   * @param {string} resourceName - FiveM resource name
   * @returns {Promise<Object|null>} Plugin info or null if not a plugin
   */
  async detectPlugin(resourceName) {
    try {
      const resourcePath = GetResourcePath(resourceName);

      if (!resourcePath) {
        return null;
      }

      // Check if the resource has a marker file indicating it's an ng_core plugin
      const markerPath = path.join(resourcePath, 'ng-plugin.json');

      if (!fs.existsSync(markerPath)) {
        return null;
      }

      // Read plugin metadata
      const pluginMetadata = JSON.parse(fs.readFileSync(markerPath, 'utf8'));

      // Get plugin entry point path
      const pluginPath = path.join(resourcePath, pluginMetadata.entry || 'server.js');

      if (!fs.existsSync(pluginPath)) {
        throw new Error(`Plugin entry point not found: ${pluginMetadata.entry || 'server.js'}`);
      }

      return {
        resourceName,
        pluginPath,
        metadata: pluginMetadata
      };

    } catch (error) {
      this.framework.log.error(`Failed to detect plugin from resource "${resourceName}": ${error.message}`);
      return null;
    }
  }

  /**
   * Detect if a resource is an ng_core plugin and load it
   * @param {string} resourceName - FiveM resource name
   * @returns {Promise<boolean>} True if plugin was detected and loaded
   */
  async detectAndLoadExternalPlugin(resourceName) {
    try {
      const resourcePath = GetResourcePath(resourceName);

      if (!resourcePath) {
        // Resource not found or not started yet
        return false;
      }

      // Check if the resource has a marker file indicating it's an ng_core plugin
      const markerPath = path.join(resourcePath, 'ng-plugin.json');

      if (!fs.existsSync(markerPath)) {
        // Not an ng_core plugin, skip
        return false;
      }

      // Read plugin metadata
      const pluginMetadata = JSON.parse(fs.readFileSync(markerPath, 'utf8'));

      // Load the plugin from the resource
      const pluginPath = path.join(resourcePath, pluginMetadata.entry || 'server.js');

      if (!fs.existsSync(pluginPath)) {
        throw new Error(`Plugin entry point not found: ${pluginMetadata.entry || 'server.js'}`);
      }

      // Load and initialize the plugin
      await this.loadExternalPlugin(resourceName, pluginPath, pluginMetadata);
      return true;

    } catch (error) {
      this.framework.log.error(`Failed to detect/load plugin from resource "${resourceName}": ${error.message}`);
      return false;
    }
  }

  /**
   * Load an external plugin from a resource
   * @param {string} resourceName - Resource name
   * @param {string} pluginPath - Path to plugin file
   * @param {Object} metadata - Plugin metadata
   */
  async loadExternalPlugin(resourceName, pluginPath, metadata = {}) {
    // Skip if plugin already self-registered via Bridge
    if (this.plugins.has(resourceName)) {
      this.framework.log.info(`Plugin "${resourceName}" already registered (self-init)`);
      return;
    }

    try {
      this.pluginStates.set(resourceName, this.framework.constants.PluginState.LOADING);

      // Run before-load hook
      await this.framework.events.pipe(
        this.framework.constants.Hooks.BEFORE_PLUGIN_LOAD,
        resourceName,
        metadata
      );

      // Clear require cache
      delete require.cache[require.resolve(pluginPath)];

      // Load plugin module
      const pluginModule = require(pluginPath);

      // Display plugin banner
      this._displayPluginBanner(resourceName, metadata);

      // Initialize plugin
      let pluginInstance = null;

      if (typeof pluginModule === 'function') {
        pluginInstance = new pluginModule(this.framework, metadata);
        // Call init() if it exists
        if (typeof pluginInstance.init === 'function') {
          await pluginInstance.init();
        }
      } else if (typeof pluginModule === 'object') {
        pluginInstance = pluginModule;
        if (typeof pluginModule.init === 'function') {
          await pluginModule.init(this.framework, metadata);
        }
      } else {
        throw new Error(`Invalid plugin format for "${resourceName}"`);
      }

      // Store plugin instance
      this.plugins.set(resourceName, pluginInstance);
      this.externalPlugins.set(resourceName, {
        instance: pluginInstance,
        metadata,
        resourceName
      });
      this.pluginStates.set(resourceName, this.framework.constants.PluginState.LOADED);

      this.framework.log.info(`External plugin "${resourceName}" loaded successfully (auto-detected)`);

      // Run after-load hook
      await this.framework.events.pipe(
        this.framework.constants.Hooks.AFTER_PLUGIN_LOAD,
        resourceName,
        pluginInstance
      );

      // Emit plugin loaded event
      this.framework.eventBus.emit(
        this.framework.constants.Events.PLUGIN_LOADED,
        resourceName,
        pluginInstance
      );

    } catch (error) {
      this.pluginStates.set(resourceName, this.framework.constants.PluginState.ERROR);
      this.framework.log.error(`Failed to load external plugin "${resourceName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Unload an external plugin when its resource stops
   * @param {string} resourceName - Resource name
   */
  async unloadExternalPlugin(resourceName) {
    const pluginInfo = this.externalPlugins.get(resourceName);

    if (!pluginInfo) {
      return;
    }

    try {
      this.framework.log.info(`Unloading external plugin: ${resourceName}`);

      const plugin = pluginInfo.instance;

      // Call plugin's destroy/unload method if it exists
      if (typeof plugin.destroy === 'function') {
        await plugin.destroy();
      } else if (typeof plugin.unload === 'function') {
        await plugin.unload();
      }

      // Remove from all maps
      this.plugins.delete(resourceName);
      this.externalPlugins.delete(resourceName);
      this.pluginStates.set(resourceName, this.framework.constants.PluginState.UNLOADED);

      this.framework.log.info(`External plugin "${resourceName}" unloaded successfully`);

      // Emit plugin unloaded event
      this.framework.eventBus.emit(
        this.framework.constants.Events.PLUGIN_UNLOADED,
        resourceName
      );

    } catch (error) {
      this.framework.log.error(`Failed to unload external plugin "${resourceName}": ${error.message}`);
    }
  }

  /**
   * Load a plugin
   * @param {string} pluginName
   * @param {Object} options
   * @param {string} [customPath] - Custom path to plugin file
   * @returns {Promise<*>}
   */
  async load(pluginName, options = {}, customPath = null) {
    // Check if already loaded
    if (this.plugins.has(pluginName)) {
      this.framework.log.warn(`Plugin "${pluginName}" is already loaded`);
      return this.plugins.get(pluginName);
    }

    // Set state to loading
    this.pluginStates.set(pluginName, this.framework.constants.PluginState.LOADING);

    try {
      // Run before-load hook
      await this.framework.events.pipe(
        this.framework.constants.Hooks.BEFORE_PLUGIN_LOAD,
        pluginName,
        options
      );

      // Resolve plugin path
      let pluginPath;
      if (customPath) {
        pluginPath = customPath;
      } else {
        pluginPath = this.resolvePluginPath(pluginName);
      }

      if (!fs.existsSync(pluginPath)) {
        throw new Error(`Plugin file not found: ${pluginPath}`);
      }

      // Clear require cache for hot reload
      delete require.cache[require.resolve(pluginPath)];

      // Load plugin module
      const pluginModule = require(pluginPath);

      // Initialize plugin
      let pluginInstance = null;

      if (typeof pluginModule === 'function') {
        // Plugin is a class or factory function
        pluginInstance = new pluginModule(this.framework, options);
      } else if (typeof pluginModule === 'object') {
        // Plugin is an object with init method
        pluginInstance = pluginModule;
        if (typeof pluginModule.init === 'function') {
          await pluginModule.init(this.framework, options);
        }
      } else {
        throw new Error(`Invalid plugin format for "${pluginName}"`);
      }

      // Store plugin instance
      this.plugins.set(pluginName, pluginInstance);
      this.pluginStates.set(pluginName, this.framework.constants.PluginState.LOADED);

      this.framework.log.info(`Plugin "${pluginName}" loaded successfully`);

      // Run after-load hook
      await this.framework.events.pipe(
        this.framework.constants.Hooks.AFTER_PLUGIN_LOAD,
        pluginName,
        pluginInstance
      );

      // Emit plugin loaded event
      this.framework.eventBus.emit(
        this.framework.constants.Events.PLUGIN_LOADED,
        pluginName,
        pluginInstance
      );

      return pluginInstance;

    } catch (error) {
      this.pluginStates.set(pluginName, this.framework.constants.PluginState.ERROR);
      this.framework.log.error(`Failed to load plugin "${pluginName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Load a plugin from an external FiveM resource
   * @param {string} resourceName - The FiveM resource name
   * @param {Object} options - Plugin options
   * @returns {Promise<*>}
   */
  async loadFromResource(resourceName, options = {}) {
    try {
      const resourcePath = GetResourcePath(resourceName);

      if (!resourcePath) {
        throw new Error(`Resource "${resourceName}" not found or not started`);
      }

      // Look for plugin entry point
      const possibleFiles = ['server.js', 'index.js', 'main.js'];
      let pluginPath = null;

      for (const fileName of possibleFiles) {
        const filePath = path.join(resourcePath, fileName);
        if (fs.existsSync(filePath)) {
          pluginPath = filePath;
          break;
        }
      }

      if (!pluginPath) {
        throw new Error(`No valid entry point found in resource "${resourceName}"`);
      }

      this.framework.log.info(`Loading external plugin from resource: ${resourceName}`);

      return await this.load(resourceName, options, pluginPath);

    } catch (error) {
      this.framework.log.error(`Failed to load plugin from resource "${resourceName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Register a plugin from external resource (called by the external resource)
   * @param {string} pluginName - Plugin name
   * @param {*} pluginInstance - Plugin instance
   * @returns {Promise<void>}
   */
  async register(pluginName, pluginInstance) {
    if (this.plugins.has(pluginName)) {
      this.framework.log.warn(`Plugin "${pluginName}" is already registered`);
      return;
    }

    try {
      // Run before-load hook
      await this.framework.events.pipe(
        this.framework.constants.Hooks.BEFORE_PLUGIN_LOAD,
        pluginName,
        {}
      );

      // Store plugin instance
      this.plugins.set(pluginName, pluginInstance);
      this.pluginStates.set(pluginName, this.framework.constants.PluginState.LOADED);

      this.framework.log.info(`External plugin "${pluginName}" registered successfully`);

      // Run after-load hook
      await this.framework.events.pipe(
        this.framework.constants.Hooks.AFTER_PLUGIN_LOAD,
        pluginName,
        pluginInstance
      );

      // Emit plugin loaded event
      this.framework.eventBus.emit(
        this.framework.constants.Events.PLUGIN_LOADED,
        pluginName,
        pluginInstance
      );

    } catch (error) {
      this.pluginStates.set(pluginName, this.framework.constants.PluginState.ERROR);
      this.framework.log.error(`Failed to register plugin "${pluginName}": ${error.message}`);
      throw error;
    }
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

    try {
      // Call plugin's destroy/unload method if it exists
      if (typeof plugin.destroy === 'function') {
        await plugin.destroy();
      } else if (typeof plugin.unload === 'function') {
        await plugin.unload();
      }

      // Remove from loaded plugins
      this.plugins.delete(pluginName);
      this.pluginStates.set(pluginName, this.framework.constants.PluginState.UNLOADED);

      this.framework.log.info(`Plugin "${pluginName}" unloaded successfully`);

      // Emit plugin unloaded event
      this.framework.eventBus.emit(
        this.framework.constants.Events.PLUGIN_UNLOADED,
        pluginName
      );

    } catch (error) {
      this.framework.log.error(`Failed to unload plugin "${pluginName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Reload a plugin
   * @param {string} pluginName
   * @param {Object} options
   */
  async reload(pluginName, options = {}) {
    await this.unload(pluginName);
    return await this.load(pluginName, options);
  }

  /**
   * Resolve plugin file path
   * @param {string} pluginName
   * @returns {string}
   */
  resolvePluginPath(pluginName) {
    const directories = this.framework.config.PluginDirectories || ['plugins'];
    const possibleFiles = ['index.js', 'server.js', 'main.js'];

    for (const dir of directories) {
      const resourcePath = GetResourcePath(GetCurrentResourceName());
      const pluginDir = path.join(resourcePath, dir, pluginName);

      for (const fileName of possibleFiles) {
        const filePath = path.join(pluginDir, fileName);
        if (fs.existsSync(filePath)) {
          return filePath;
        }
      }
    }

    throw new Error(`Could not resolve plugin path for "${pluginName}"`);
  }

  /**
   * Get plugin state
   * @param {string} pluginName
   * @returns {string}
   */
  getState(pluginName) {
    return this.pluginStates.get(pluginName) || this.framework.constants.PluginState.UNLOADED;
  }

  /**
   * Check if plugin is loaded
   * @param {string} pluginName
   * @returns {boolean}
   */
  isLoaded(pluginName) {
    return this.plugins.has(pluginName);
  }

  /**
   * Get all loaded plugin names
   * @returns {string[]}
   */
  getLoadedPlugins() {
    return Array.from(this.plugins.keys());
  }

  /**
   * Display plugin banner with name and version
   * @param {string} resourceName - Resource name
   * @param {Object} metadata - Plugin metadata from ng-plugin.json
   * @private
   */
  _displayPluginBanner(resourceName, metadata) {
    const name = metadata.name || resourceName;
    const version = metadata.version || '1.0.0';

    // Calculate banner width based on content
    const titleLine = `${name} - v${version}`;
    const width = Math.max(titleLine.length, 40) + 4;
    const separator = '='.repeat(width);

    // Center the text
    const centerText = (text) => {
      const padding = Math.max(0, width - text.length - 2);
      const leftPad = Math.floor(padding / 2);
      const rightPad = Math.ceil(padding / 2);
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    };

    console.log('');
    console.log(separator);
    console.log(centerText(titleLine));
    console.log(separator);
    console.log('');
  }
}

module.exports = PluginManager;

// Self-register
global.Framework.register('plugin-manager', new PluginManager(global.Framework), 2);
