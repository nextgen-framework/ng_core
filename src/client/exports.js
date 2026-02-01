/**
 * NextGen Core - Client Exports
 * FiveM export wrappers for external resources
 */

// Core exports
exports('GetFramework', () => global.Framework);

exports('GetModule', (moduleName) => {
    return global.Framework.getModule(moduleName);
});

// RPC
exports('RegisterRPC', (name, handler) => {
    const rpc = global.Framework.getModule('rpc');
    if (!rpc) throw new Error('rpc module not loaded');
    return rpc.register(name, handler);
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

// Notification helpers (wrapper functions to preserve class methods)
exports('Notify', (message, type, duration) => {
    const notif = global.Framework.getModule('notifications');
    if (notif) notif.notify(message, type, duration);
});

exports('NotifySuccess', (message, duration) => {
    const notif = global.Framework.getModule('notifications');
    if (notif) notif.success(message, duration);
});

exports('NotifyInfo', (message, duration) => {
    const notif = global.Framework.getModule('notifications');
    if (notif) notif.info(message, duration);
});

exports('NotifyWarning', (message, duration) => {
    const notif = global.Framework.getModule('notifications');
    if (notif) notif.warning(message, duration);
});

exports('NotifyError', (message, duration) => {
    const notif = global.Framework.getModule('notifications');
    if (notif) notif.error(message, duration);
});
