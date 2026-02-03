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
    { name: 'logger', priority: 1 },            // Persistent logging (DB + Discord webhooks)
    { name: 'resource-monitor', priority: 1 },  // Monitor all resources
    { name: 'plugin-manager', priority: 2 },    // Manage plugins
    { name: 'persistence', priority: 3 },       // Persistence manager (after database)
    { name: 'rpc', priority: 5 },
    { name: 'whitelist', priority: 8 },         // Whitelist (before player-manager) - Disabled by default, enable with setr ngcore_whitelist_enabled "true"
    { name: 'connection-manager', priority: 8 }, // Connection stages manager (before queue)
    { name: 'queue', priority: 9 },             // Queue (after whitelist, before player-manager)
    { name: 'hardcap', priority: 10 },          // Enforce player limit (after queue, works with queue module)
    { name: 'player-manager', priority: 10 },   // Player lifecycle
    { name: 'entity-manager', priority: 10 },   // Entity management
    { name: 'access-manager', priority: 11 },   // Access control (keys, doors, locks)
    { name: 'admin-manager', priority: 11 },    // Admin tools
    { name: 'sync-manager', priority: 11 },     // World state sync (weather, time)
    { name: 'instance-manager', priority: 12 }, // Instance isolation (routing buckets)
    { name: 'session-manager', priority: 12 },  // Session management (races, missions)
    { name: 'zone-manager', priority: 12 },     // Zone management system
    { name: 'target', priority: 13 },           // Target system (raycast interactions)
    { name: 'blip-manager', priority: 14 },    // Map blips (in-memory)
    { name: 'text-3d', priority: 14 },         // 3D text points (in-memory)
    // Note: item-registry is shared-only (no server.js)
    { name: 'container-manager', priority: 14 }, // Inventory system
    { name: 'character-manager', priority: 14 }, // Character management
    { name: 'character-appearance', priority: 14 }, // Character appearance & skins
    { name: 'balances-manager', priority: 15 },  // Generic account & balance system
    { name: 'spawn-manager', priority: 15 },    // Player spawn system
    { name: 'chat-commands', priority: 15 },    // Chat command system
    { name: 'organization-manager', priority: 16 }, // Organizations/jobs
    { name: 'vehicle-manager', priority: 17 },  // Vehicle management
    { name: 'performance', priority: 20 }       // Performance monitoring
  ],

  // Module loading configuration (Client-Side)
  ClientModules: [
    { name: 'resource-monitor', priority: 0 },
    { name: 'plugin-manager', priority: 2 },
    { name: 'cache', priority: 2 },             // Native value caching (early load)
    { name: 'tick-manager', priority: 3 },      // Tick management with cleanup
    { name: 'rpc', priority: 5 },
    { name: 'sync-manager', priority: 11 },     // World state sync (client)
    { name: 'instance-manager', priority: 12 }, // Instance management (client)
    { name: 'session-manager', priority: 12 },  // Session management (client)
    { name: 'zone-manager', priority: 12 },     // Zone management system (client)
    { name: 'target', priority: 13 },           // Target system (client)
    { name: 'blip-manager', priority: 14 },    // Map blips (client)
    { name: 'text-3d', priority: 14 },         // 3D text renderer (client)
    { name: 'character-appearance', priority: 14 }, // Character appearance (client)
    { name: 'spawn-manager', priority: 15 },    // Spawn management (client)
    { name: 'progress', priority: 15 },         // Progress bars (client)
    { name: 'menu', priority: 15 },             // Native menus (client)
    { name: 'hud', priority: 15 },              // HUD framework (client)
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

// Available via global.NGCore.Config / Framework.config

// Make available globally
global.NGCore = global.NGCore || {};
global.NGCore.Config = Config;

// Register as service + backward compat direct access
if (global.Framework) {
    global.Framework.register('config', Config);
    global.Framework.config = Config;
}
