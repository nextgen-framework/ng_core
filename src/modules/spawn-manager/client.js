/**
 * NextGen Framework - Spawn Manager (Client)
 * Handles player spawning on client side
 */

class SpawnManagerClient {
  constructor(framework) {
    this.framework = framework;
    this.hasSpawned = false;
    this.defaultModel = 'mp_m_freemode_01';

    // Pre-registered at script load time (cerulean)
    this.netEvents = ['ng_core:spawn-at', 'ng_core:spawn-select'];
  }

  /**
   * Initialize spawn manager client
   */
  init() {
    // Listen for spawn events
    this.framework.onNet('ng_core:spawn-at', this.onSpawnAt.bind(this));
    this.framework.onNet('ng_core:spawn-select', this.onSpawnSelect.bind(this));

    // Freeze player until spawn
    const ped = PlayerPedId();
    if (ped && DoesEntityExist(ped)) {
      FreezeEntityPosition(ped, true);
      SetEntityVisible(ped, false, false);
    }

    console.log('[Spawn Manager] Client initialized');
  }

  /**
   * Handle spawn at specific coordinates
   */
  async onSpawnAt(coords, options) {
    // Fade out if needed
    if (options && options.fadeIn) {
      DoScreenFadeOut(500);
      await this.delay(500);
    }

    // Ensure player has a valid ped model
    await this.ensurePlayerModel(options?.model || this.defaultModel);

    const playerPed = PlayerPedId();
    await this.spawnPlayer(playerPed, coords, options || {});
  }

  /**
   * Ensure player has a valid ped model loaded
   */
  async ensurePlayerModel(modelName) {
    const modelHash = GetHashKey(modelName);

    // Check if model is valid
    if (!IsModelInCdimage(modelHash) || !IsModelValid(modelHash)) {
      console.log(`[Spawn Manager] Invalid model: ${modelName}, using default`);
      return;
    }

    // Request model
    RequestModel(modelHash);

    // Wait for model to load
    let attempts = 0;
    while (!HasModelLoaded(modelHash) && attempts < 100) {
      await this.delay(10);
      attempts++;
    }

    if (!HasModelLoaded(modelHash)) {
      console.log(`[Spawn Manager] Failed to load model: ${modelName}`);
      return;
    }

    // Set player model
    SetPlayerModel(PlayerId(), modelHash);
    SetModelAsNoLongerNeeded(modelHash);

    console.log(`[Spawn Manager] Player model set: ${modelName}`);
  }

  /**
   * Spawn player at coordinates
   */
  async spawnPlayer(playerPed, coords, options) {
    // Request collision at spawn point
    RequestCollisionAtCoord(coords.x, coords.y, coords.z);

    // Set player position
    SetEntityCoordsNoOffset(playerPed, coords.x, coords.y, coords.z, false, false, false);
    SetEntityHeading(playerPed, coords.heading || 0);

    // Wait for collision to load
    let attempts = 0;
    while (!HasCollisionLoadedAroundEntity(playerPed) && attempts < 100) {
      await this.delay(100);
      attempts++;
    }

    // Unfreeze and show player
    FreezeEntityPosition(playerPed, false);
    SetEntityVisible(playerPed, true, false);

    // Network culling
    NetworkSetEntityInvisibleToNetwork(playerPed, false);
    SetPlayerInvincible(PlayerId(), false);

    // Reset camera
    RenderScriptCams(false, false, 0, true, true);

    // Fade in
    if (options.fadeIn) {
      DoScreenFadeIn(options.fadeDuration || 1500);
    }

    this.hasSpawned = true;

    console.log(`[Spawn Manager] Spawned at (${coords.x}, ${coords.y}, ${coords.z})`);

    // Trigger event for other modules
    this.framework.fivem.emit('ng_core:player-spawned', coords);
  }

  /**
   * Helper delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle spawn selection UI
   */
  onSpawnSelect(availableSpawns) {
    // This would show a UI for spawn selection
    // For now, just pick the first spawn
    if (availableSpawns.length > 0) {
      const spawn = availableSpawns[0];
      this.framework.fivem.emitNet('ng_core:spawn-selected', spawn.id);
    }
  }

  /**
   * Check if player has spawned
   */
  hasPlayerSpawned() {
    return this.hasSpawned;
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpawnManagerClient;
}

// Self-register
global.Framework.register('spawn-manager', new SpawnManagerClient(global.Framework), 15);
