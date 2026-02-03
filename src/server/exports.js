/**
 * NextGen Core - Server Exports
 * FiveM export wrappers for external resources
 */

const fw = global.Framework;

// Note: GetFramework, GetModule, CallModule, CallPlugin are in main.js (kernel)

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

// Blip management
fw.expose('blip-manager', {
    'CreateBlip': 'createBlip',
    'CreateRuntimeBlip': 'createRuntimeBlip',
    'CreateTempBlip': 'createTempBlip',
    'RemoveBlip': 'removeBlip',
    'UpdateBlip': 'updateBlip',
});

// 3D Text management
fw.expose('text-3d', {
    'CreateText3D': 'createPoint',
    'CreateRuntimeText3D': 'createRuntimePoint',
    'RemoveText3D': 'removePoint',
    'UpdateText3D': 'updatePoint',
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
