module.exports = {
  env: {
    es2021: true,
    node: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  globals: {
    // FiveM/CitizenFX common globals
    on: 'readonly',
    emit: 'readonly',
    onNet: 'readonly',
    emitNet: 'readonly',
    addEventHandler: 'readonly',
    removeEventHandler: 'readonly',
    setTick: 'readonly',
    clearTick: 'readonly',
    setImmediate: 'readonly',
    clearImmediate: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    RegisterCommand: 'readonly',
    GetResourcePath: 'readonly',
    GetCurrentResourceName: 'readonly',
    GetNumPlayerIndices: 'readonly',
    GetPlayerName: 'readonly',
    GetPlayerPed: 'readonly',
    GetEntityCoords: 'readonly',
    GetEntityRotation: 'readonly',
    GetEntityHeading: 'readonly',
    SetEntityCoords: 'readonly',
    SetEntityRotation: 'readonly',
    SetEntityHeading: 'readonly',
    DoesEntityExist: 'readonly',
    DeleteEntity: 'readonly',
    NetworkGetEntityFromNetworkId: 'readonly',
    GetConvar: 'readonly',
    GetConvarInt: 'readonly',
    SetConvar: 'readonly',
    TriggerEvent: 'readonly',
    TriggerServerEvent: 'readonly',
    TriggerClientEvent: 'readonly',
    TriggerLatentClientEvent: 'readonly',
    AddEventHandler: 'readonly',
    RegisterNetEvent: 'readonly',
    CancelEvent: 'readonly',
    WasEventCanceled: 'readonly',
    GetInvokingResource: 'readonly',
    IsPlayerAceAllowed: 'readonly',
    IsDuplicityVersion: 'readonly',
    PerformHttpRequest: 'readonly',
    SetRoutingBucketPopulationEnabled: 'readonly',
    SetRoutingBucketEntityLockdownMode: 'readonly',
    SetPlayerRoutingBucket: 'readonly',
    GetPlayerRoutingBucket: 'readonly',
    GetPlayerIdentifiers: 'readonly',
    GetPlayerTokens: 'readonly',
    GetPlayerEndpoint: 'readonly',
    GetPlayerPing: 'readonly',
    DropPlayer: 'readonly',
    ExecuteCommand: 'readonly',
    GetNumPlayerIdentifiers: 'readonly',
    GetPlayerIdentifier: 'readonly',
    GetPlayers: 'readonly',
    GetHostId: 'readonly',
    NetworkIsSessionStarted: 'readonly',
    PlayerPedId: 'readonly',
    PlayerId: 'readonly',
    GetDistanceBetweenCoords: 'readonly',
    DrawMarker: 'readonly',
    DrawLine: 'readonly',
    SetDrawOrigin: 'readonly',
    ClearDrawOrigin: 'readonly',
    SetTextScale: 'readonly',
    SetTextFont: 'readonly',
    SetTextProportional: 'readonly',
    SetTextColour: 'readonly',
    SetTextOutline: 'readonly',
    SetTextEntry: 'readonly',
    AddTextComponentString: 'readonly',
    DrawText: 'readonly',
    Citizen: 'readonly',
    global: 'writable',
    // FiveM exports
    exports: 'readonly',
    // Shared classes (defined in shared files, loaded by fxmanifest)
    Collection: 'readonly',
    ZoneFactory: 'readonly',
    RTree: 'readonly',
    ZoneQueryCache: 'readonly',
    PlayerPositionCache: 'readonly',
    ZoneStats: 'readonly',
    PerfTimerPool: 'readonly',
    ZoneMath: 'readonly',
    fastPointInPolygon: 'readonly',
    SpatialGrid: 'readonly',
    // Client-side natives
    GetGameplayCamCoord: 'readonly',
    GetGameplayCamRot: 'readonly',
    StartShapeTestRay: 'readonly',
    GetShapeTestResult: 'readonly',
    GetEntityType: 'readonly',
    GetEntityModel: 'readonly',
    BeginTextCommandDisplayHelp: 'readonly',
    AddTextComponentSubstringPlayerName: 'readonly',
    EndTextCommandDisplayHelp: 'readonly',
    RegisterKeyMapping: 'readonly',
    GetHashKey: 'readonly',
    SetArtificialLightsState: 'readonly',
    SetArtificialLightsStateAffectsVehicles: 'readonly',
    SetVehicleDensityMultiplierThisFrame: 'readonly',
    SetRandomVehicleDensityMultiplierThisFrame: 'readonly',
    SetParkedVehicleDensityMultiplierThisFrame: 'readonly',
    SetPedDensityMultiplierThisFrame: 'readonly',
    SetScenarioPedDensityMultiplierThisFrame: 'readonly',
    BeginTextCommandPrint: 'readonly',
    BeginTextCommandThefeedPost: 'readonly',
    DoScreenFadeIn: 'readonly',
    DoScreenFadeOut: 'readonly',
    DrawNotification: 'readonly',
    DrawRect: 'readonly',
    EndTextCommandPrint: 'readonly',
    EndTextCommandThefeedPostMessagetext: 'readonly',
    EndTextCommandThefeedPostTicker: 'readonly',
    FreezeEntityPosition: 'readonly',
    GetDefaultCam: 'readonly',
    GetEntityHealth: 'readonly',
    GetGameTimer: 'readonly',
    GetNumPlayerTokens: 'readonly',
    GetNumResources: 'readonly',
    GetPedArmour: 'readonly',
    GetPlayerLastMsg: 'readonly',
    GetPlayerServerId: 'readonly',
    GetPlayerToken: 'readonly',
    GetResourceByFindIndex: 'readonly',
    GetResourceState: 'readonly',
    HasCollisionLoadedAroundEntity: 'readonly',
    NetworkOverrideClockTime: 'readonly',
    NetworkSetEntityInvisibleToNetwork: 'readonly',
    PauseClock: 'readonly',
    Player: 'readonly',
    RenderScriptCams: 'readonly',
    RequestCollisionAtCoord: 'readonly',
    SetCamActive: 'readonly',
    SetEntityCoordsNoOffset: 'readonly',
    SetEntityVisible: 'readonly',
    SetNotificationBackgroundColor: 'readonly',
    SetNotificationTextEntry: 'readonly',
    SetPlayerInvincible: 'readonly',
    SetTextDropshadow: 'readonly',
    SetTextDropShadow: 'readonly',
    SetTextEdge: 'readonly',
    SetWeatherTypeNow: 'readonly',
    SetWeatherTypeOverTime: 'readonly',
    SetWeatherTypePersist: 'readonly',
    module: 'readonly'
  },
  rules: {
    // Detect wrong framework methods
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="executeHook"]',
        message: '❌ this.framework.executeHook does not exist. Use: this.framework.runHook'
      },
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="triggerHook"]',
        message: '❌ this.framework.triggerHook does not exist. Use: this.framework.runHook'
      },
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="callHook"]',
        message: '❌ this.framework.callHook does not exist. Use: this.framework.runHook'
      },
      {
        selector: 'MemberExpression[object.property.name="framework"][property.name="emitHook"]',
        message: '❌ this.framework.emitHook does not exist. Use: this.framework.runHook'
      }
    ],
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off'
  },
  overrides: [
    {
      // Client-side specific rules
      files: ['**/client.js'],
      env: {
        browser: true,
        node: false
      },
      rules: {
        // Prevent require() in client code
        'no-restricted-globals': [
          'error',
          {
            name: 'require',
            message: '❌ require() is NOT available in FiveM client environment'
          }
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'CallExpression[callee.name="require"]',
            message: '❌ require() is NOT available in FiveM client environment. Use global exports instead.'
          }
        ]
      }
    },
    {
      // Server-side specific rules
      files: ['**/server.js'],
      env: {
        node: true
      },
      globals: {
        // FiveM server-side magic globals
        source: 'readonly'  // Player source in event handlers
      }
    }
  ]
};
