/**
 * NextGen Core - Shared Configuration
 * Runs on both Server and Client
 */

const Config = {
  // Core info
  Name: 'NextGen Core',
  Version: '1.0.0',

  // Debug mode
  Debug: GetConvar('ngcore_debug', 'false') === 'true',

  // Module loading configuration with priority (Server-Side)
  // Lower priority number = loads first (0 = highest priority)
  Modules: [
    { name: 'database', priority: 0 },          // Load FIRST - Layer 0 Foundation
    { name: 'logger', priority: 0 },            // Logger - Layer 0 Foundation
    { name: 'resource-monitor', priority: 1 },  // Monitor all resources
    { name: 'plugin-manager', priority: 2 },    // Manage plugins
    { name: 'persistence', priority: 3 },       // Persistence manager (after database)
    { name: 'rpc', priority: 5 },
    // { name: 'whitelist', priority: 8 },         // Whitelist (before player-manager) - DISABLED FOR DEVELOPMENT
    { name: 'queue', priority: 9 },             // Queue (after whitelist, before player-manager)
    { name: 'access-manager', priority: 11 },   // Access control (keys, doors, locks)
    { name: 'admin-manager', priority: 11 },    // Admin tools
    { name: 'player-manager', priority: 10 },
    { name: 'entity-manager', priority: 10 },
    { name: 'sync-manager', priority: 11 },     // World state sync (weather, time)
    { name: 'instance-manager', priority: 12 }, // Instance isolation (routing buckets)
    { name: 'session-manager', priority: 12 },  // Session management (races, missions)
    { name: 'zone-manager', priority: 12 },     // Zone management system
    { name: 'target', priority: 13 },           // Target system (raycast interactions)
    // Note: item-registry is shared-only (no server.js)
    { name: 'container-manager', priority: 14 }, // Inventory system
    { name: 'character-manager', priority: 14 }, // Character management
    { name: 'money-manager', priority: 15 },    // Money & economy
    { name: 'organization-manager', priority: 16 }, // Organizations/jobs
    { name: 'vehicle-manager', priority: 17 },  // Vehicle management
    { name: 'spawn-manager', priority: 15 },    // Player spawn system
    { name: 'chat-commands', priority: 15 },    // Chat command system
    { name: 'performance', priority: 20 }       // Performance monitoring
  ],

  // Module loading configuration (Client-Side)
  ClientModules: [
    { name: 'resource-monitor', priority: 0 },
    { name: 'plugin-manager', priority: 1 },
    { name: 'rpc', priority: 5 },
    { name: 'sync-manager', priority: 11 },     // World state sync (client)
    { name: 'instance-manager', priority: 12 }, // Instance management (client)
    { name: 'session-manager', priority: 12 },  // Session management (client)
    { name: 'zone-manager', priority: 12 },     // Zone management system (client)
    { name: 'target', priority: 13 },           // Target system (client)
    { name: 'spawn-manager', priority: 15 },    // Spawn management (client)
    { name: 'notifications', priority: 15 },    // Notification system
    { name: 'performance', priority: 20 }       // Performance monitoring
  ],

  // Plugin directories
  PluginDirectories: ['plugins'],

  // Default settings (can be overridden by plugins)
  Defaults: {
    MaxPlayers: GetConvarInt('sv_maxclients', 32),
    ServerName: GetConvar('sv_hostname', 'NextGen Server')
  }
};

// Export config
if (typeof exports !== 'undefined') {
  exports('GetConfig', () => Config);
}

// Make available globally
global.NGCore = global.NGCore || {};
global.NGCore.Config = Config;
