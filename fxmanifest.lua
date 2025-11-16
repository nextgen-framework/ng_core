fx_version 'cerulean'
game 'gta5'

name 'NextGen Core'
description 'Ultra-Generic & Dynamic FiveM Core - Build Anything'
author 'NextGen Team'
version '1.0.0'

-- Dependencies
dependencies {
  'oxmysql'
}
-- Note: oxmysql wraps mysql2 internally for FiveM compatibility

-- Shared scripts (runs on both server and client)
shared_scripts {
  'src/core/shared/config.js',
  'src/core/shared/utils.js',
  'src/core/shared/constants.js',
  'src/modules/item-registry/shared.js',
  'src/modules/zone-manager/shared/math.js',
  'src/modules/zone-manager/shared/types.js',
  'src/modules/zone-manager/shared/spatial.js',
  'src/modules/zone-manager/shared/polygon.js',
  'src/modules/zone-manager/shared/rtree.js',
  'src/modules/zone-manager/shared/cache.js',
  'src/modules/zone-manager/shared/stats.js'
}

-- Server scripts
server_scripts {
  'src/modules/database/shared/collection.js',
  'src/modules/database/server.js',
  'src/modules/logger/server.js',
  'src/modules/persistence/server.js',
  'src/modules/whitelist/server.js',
  'src/modules/queue/server.js',
  'src/modules/access-manager/server.js',
  'src/modules/admin-manager/server.js',
  'src/modules/sync-manager/server.js',
  'src/modules/instance-manager/server.js',
  'src/modules/session-manager/server.js',
  'src/modules/zone-manager/server.js',
  'src/modules/target/server.js',
  'src/modules/container-manager/server.js',
  'src/modules/character-manager/server.js',
  'src/modules/character-appearance/server.js',
  'src/modules/money-manager/server.js',
  'src/modules/organization-manager/server.js',
  'src/modules/vehicle-manager/server.js',
  'src/modules/spawn-manager/server.js',
  'src/core/server/main.js'
}

-- Tests have been moved to the ng-test external plugin

-- Client scripts
client_scripts {
  'src/core/client/event-bus.js',
  'src/core/client/framework.js',
  'src/modules/resource-monitor/client.js',
  'src/modules/plugin-manager/client.js',
  'src/modules/rpc/client.js',
  'src/modules/sync-manager/client.js',
  'src/modules/instance-manager/client.js',
  'src/modules/session-manager/client.js',
  'src/modules/zone-manager/client.js',
  'src/modules/target/client.js',
  'src/modules/spawn-manager/client.js',
  'src/modules/character-appearance/client.js',
  'src/modules/notifications/client.js',
  'src/modules/performance/client.js',
  'src/core/client/main.js'
}

-- Exports
exports {
  'GetFramework',
  'GetConfig'
}

server_exports {
  'GetFramework',
  'IsReady',
  'GetModule',
  'RegisterCommand',
  'SendMessage',
  'BroadcastMessage',
  'RegisterPlugin',
  'LoadPluginFromResource'
}

client_exports {
  'GetFramework',
  'IsReady',
  'GetModule',
  'RegisterRPC',
  'RegisterPlugin',
  'LoadPluginFromResource'
}
