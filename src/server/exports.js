/**
 * NextGen Core - Server Exports
 * FiveM export wrappers for external resources
 */

// Core exports (override kernel defaults with ng_core specifics)
exports('GetFramework', () => global.Framework);

exports('GetModule', (moduleName) => {
    return global.Framework.getModule(moduleName);
});

// Chat commands
exports('RegisterCommand', (name, callback, options) => {
    const chatCommands = global.Framework.getModule('chat-commands');
    if (!chatCommands) throw new Error('chat-commands module not loaded');
    return chatCommands.register(name, callback, options);
});

exports('SendMessage', (source, message, color) => {
    const chatCommands = global.Framework.getModule('chat-commands');
    if (chatCommands) chatCommands.sendMessage(source, message, color);
});

exports('BroadcastMessage', (message, color) => {
    const chatCommands = global.Framework.getModule('chat-commands');
    if (chatCommands) chatCommands.broadcast(message, color);
});

// Plugin management
exports('RegisterPlugin', async (pluginName, pluginInstance) => {
    const pluginManager = global.Framework.getModule('plugin-manager');
    if (!pluginManager) throw new Error('plugin-manager module not loaded');
    return await pluginManager.register(pluginName, pluginInstance);
});

exports('LoadPluginFromResource', async (resourceName, options) => {
    const pluginManager = global.Framework.getModule('plugin-manager');
    if (!pluginManager) throw new Error('plugin-manager module not loaded');
    return await pluginManager.loadFromResource(resourceName, options);
});

// Queue management
exports('Queue_RegisterType', (typeName, priority, reservedSlots = 0, displayName = null) => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return queue.registerQueueType(typeName, priority, reservedSlots, displayName);
});

exports('Queue_UnregisterType', (typeName) => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return queue.unregisterQueueType(typeName);
});

exports('Queue_SetPlayerType', async (identifier, queueType, reason = null, setBy = 'system') => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return await queue.setQueueType(identifier, queueType, reason, setBy);
});

exports('Queue_SetPlayerPriority', async (identifier, priority, reason = null, setBy = 'system') => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return await queue.setPriority(identifier, priority, reason, setBy);
});

exports('Queue_RemovePlayer', async (identifier) => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return await queue.removePriority(identifier);
});

exports('Queue_GetInfo', () => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return queue.getInfo();
});

exports('Queue_SetDynamicPriority', (identifier, priority, queueType = null) => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return queue.setDynamicPriority(identifier, priority, queueType);
});

exports('Queue_SetDynamicType', (identifier, queueType) => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return queue.setDynamicQueueType(identifier, queueType);
});

exports('Queue_RemoveDynamic', (identifier) => {
    const queue = global.Framework.getModule('queue');
    if (!queue) throw new Error('Queue module not available');
    return queue.removeDynamicAssignment(identifier);
});
