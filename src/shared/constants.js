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
    AFTER_PLAYER_LEAVE: 'after:player:leave',
    QUEUE_CALCULATE_PRIORITY: 'queue:calculate:priority',

    // Player connection stages
    PLAYER_CONNECTING: 'player:connecting',           // Initial connection (queue check)
    PLAYER_LOADING: 'player:loading',                 // Loading stage (SQL queries, data loading)
    PLAYER_WAITING_CLIENT: 'player:waiting:client',   // Waiting for client to be ready (framework + appearance)
    PLAYER_CHECK_PERMISSIONS: 'player:check:permissions', // Permission/whitelist checks
    PLAYER_READY_TO_SPAWN: 'player:ready:spawn',     // Ready to spawn (all checks passed)
    PLAYER_SPAWNED: 'player:spawned'                  // Player has spawned in game
  },

  // Player connection stages
  PlayerStage: {
    CONNECTING: 'connecting',       // In queue or connecting
    LOADING: 'loading',            // Loading player data (SQL, etc.)
    WAITING_CLIENT: 'waiting_client', // Waiting for client ready
    CHECKING: 'checking',          // Running permission/whitelist checks
    READY: 'ready',                // Ready to spawn
    SPAWNED: 'spawned',            // Spawned in game
    DISCONNECTED: 'disconnected'   // Disconnected
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

// Register as service + backward compat direct access
if (global.Framework) {
    global.Framework.register('constants', Constants);
    global.Framework.constants = Constants;
}
