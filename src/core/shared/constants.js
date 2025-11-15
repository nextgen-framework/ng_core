/**
 * NextGen Framework - Shared Constants
 * Runs on both Server and Client
 */

const Constants = {
  // Event names
  Events: {
    // Framework lifecycle
    FRAMEWORK_READY: 'nextgen:framework:ready',
    ALL_PLUGINS_LOADED: 'nextgen:plugins:all_loaded',
    ALL_RESOURCES_LOADED: 'nextgen:server:all_resources_loaded',
    PLUGIN_LOADED: 'nextgen:plugin:loaded',
    PLUGIN_UNLOADED: 'nextgen:plugin:unloaded',

    // Player events
    PLAYER_CONNECTING: 'nextgen:player:connecting',
    PLAYER_CONNECTED: 'nextgen:player:connected',
    PLAYER_DISCONNECTING: 'nextgen:player:disconnecting',
    PLAYER_DROPPED: 'nextgen:player:dropped',

    // State events
    STATE_CHANGED: 'nextgen:state:changed',

    // RPC events
    RPC_REQUEST: 'nextgen:rpc:request',
    RPC_RESPONSE: 'nextgen:rpc:response'
  },

  // Hook names
  Hooks: {
    BEFORE_PLUGIN_LOAD: 'before:plugin:load',
    AFTER_PLUGIN_LOAD: 'after:plugin:load',
    BEFORE_PLAYER_JOIN: 'before:player:join',
    AFTER_PLAYER_JOIN: 'after:player:join',
    BEFORE_PLAYER_LEAVE: 'before:player:leave',
    AFTER_PLAYER_LEAVE: 'after:player:leave'
  },

  // Plugin states
  PluginState: {
    UNLOADED: 'unloaded',
    LOADING: 'loading',
    LOADED: 'loaded',
    ERROR: 'error'
  }
};

// Export constants
if (typeof exports !== 'undefined') {
  exports('GetConstants', () => Constants);
}

// Make available globally
global.NGCore = global.NGCore || {};
global.NGCore.Constants = Constants;

// Legacy support
global.NextGenConstants = Constants;
