/**
 * NextGen Core - Server Exports
 * FiveM export wrappers for external resources
 */

const fw = global.Framework;

// Core exports (manual - not module methods)
exports('GetFramework', () => fw);
exports('GetModule', (name) => fw.getModule(name));

// Chat commands
fw.expose('chat-commands', {
    'RegisterCommand': 'register',
    'SendMessage': { method: 'sendMessage', fallback: null },
    'BroadcastMessage': { method: 'broadcast', fallback: null },
});

// Plugin management
fw.expose('plugin-manager', {
    'RegisterPlugin': 'register',
    'LoadPluginFromResource': 'loadFromResource',
    'IsPluginLoaded': { method: 'isLoaded', fallback: false },
    'GetLoadedPlugins': { method: 'getLoadedPlugins', fallback: [] },
    'GetPluginState': { method: 'getState', fallback: 'UNLOADED' },
});

// Queue management
fw.expose('queue', {
    'Queue_RegisterType': 'registerQueueType',
    'Queue_UnregisterType': 'unregisterQueueType',
    'Queue_SetPlayerType': 'setQueueType',
    'Queue_SetPlayerPriority': 'setPriority',
    'Queue_RemovePlayer': 'removePriority',
    'Queue_GetInfo': 'getInfo',
    'Queue_SetDynamicPriority': 'setDynamicPriority',
    'Queue_SetDynamicType': 'setDynamicQueueType',
    'Queue_RemoveDynamic': 'removeDynamicAssignment',
});
