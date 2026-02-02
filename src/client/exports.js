/**
 * NextGen Core - Client Exports
 * FiveM export wrappers for external resources
 */

const fw = global.Framework;

// Core exports (manual - not module methods)
exports('GetFramework', () => fw);
exports('IsReady', () => fw.isReady());
exports('GetVersion', () => GetResourceMetadata(GetCurrentResourceName(), 'version', 0) || '0.0.0');
exports('GetModule', (name) => fw.getModule(name));
exports('GetModuleList', () => fw.list());

// RPC
fw.expose('rpc', {
    'RegisterRPC': 'register',
});

// Plugin management
fw.expose('plugin-manager', {
    'RegisterPlugin': 'register',
    'LoadPluginFromResource': 'loadFromResource',
    'IsPluginLoaded': { method: 'has', fallback: false },
    'GetLoadedPlugins': { method: 'getLoadedPlugins', fallback: [] },
});

// Notifications
fw.expose('notifications', {
    'Notify': { method: 'notify', fallback: null },
    'NotifySuccess': { method: 'success', fallback: null },
    'NotifyInfo': { method: 'info', fallback: null },
    'NotifyWarning': { method: 'warning', fallback: null },
    'NotifyError': { method: 'error', fallback: null },
});
