fx_version 'cerulean'
game 'gta5'

name 'NextGen Core'
description 'Ultra-Generic & Dynamic FiveM Core'
author 'NextGen Team'
version '1.0.0'

-- Dependencies
dependencies {
    'oxmysql'
}

-- Module shared files (loaded before everything)
-- These don't use Framework, pure utility code
shared_scripts {
    'src/modules/zone-manager/shared/math.js',
    'src/modules/zone-manager/shared/types.js',
    'src/modules/zone-manager/shared/spatial.js',
    'src/modules/zone-manager/shared/polygon.js',
    'src/modules/zone-manager/shared/rtree.js',
    'src/modules/zone-manager/shared/cache.js',
    'src/modules/zone-manager/shared/stats.js',
    'src/modules/item-registry/shared.js',
    'src/modules/database/shared/collection.js'
}

-- Server: kernel → shared → modules → exports
server_scripts {
    'src/main.js',
    'src/shared/*.js',
    'src/modules/**/server.js',
    'src/server/exports.js'
}

-- Client: kernel → shared → modules → exports
client_scripts {
    'src/main.js',
    'src/shared/*.js',
    'src/modules/**/client.js',
    'src/client/exports.js'
}

-- Files streamed to client (for cross-resource @ng_core/ references)
files {
    'src/bridge.js'
}

server_exports {
    'GetFramework',
    'IsReady',
    'GetVersion',
    'GetModule',
    'GetModuleList',
    'RegisterCommand',
    'SendMessage',
    'BroadcastMessage',
    'RegisterPlugin',
    'LoadPluginFromResource',
    'IsPluginLoaded',
    'GetLoadedPlugins',
    'GetPluginState',
    'Queue_RegisterType',
    'Queue_UnregisterType',
    'Queue_SetPlayerType',
    'Queue_SetPlayerPriority',
    'Queue_RemovePlayer',
    'Queue_GetInfo',
    'Queue_SetDynamicPriority',
    'Queue_SetDynamicType',
    'Queue_RemoveDynamic',
    'CallModule',
    'CallPlugin'
}

client_exports {
    'GetFramework',
    'IsReady',
    'GetVersion',
    'GetModule',
    'GetModuleList',
    'RegisterRPC',
    'RegisterPlugin',
    'LoadPluginFromResource',
    'IsPluginLoaded',
    'GetLoadedPlugins',
    'Notify',
    'NotifySuccess',
    'NotifyInfo',
    'NotifyWarning',
    'NotifyError'
}
