/**
 * NextGen Core - Client Exports
 * FiveM export wrappers for external resources
 */

const fw = global.Framework;

// Note: GetFramework, IsReady, GetVersion, GetModule, GetModuleList are in main.js (kernel)

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

// Progress
fw.expose('progress', {
    'StartProgress': 'start',
    'CancelProgress': 'cancel',
    'IsProgressActive': { method: 'isActive', fallback: false },
});

// Menu
fw.expose('menu', {
    'OpenMenu': 'open',
    'CloseMenu': 'closeAll',
    'IsMenuOpen': { method: 'isOpen', fallback: false },
});

// HUD
fw.expose('hud', {
    'ShowHud': 'showAll',
    'HideHud': 'hideAll',
    'RegisterHudComponent': 'registerComponent',
    'UpdateHudComponent': 'updateComponent',
});
