/**
 * NextGen Framework - Spawn Manager (Client)
 * Handles player spawning on client side
 */

class SpawnManagerClient {
  constructor(framework) {
    this.framework = framework;
    this.hasSpawned = false;
  }

  /**
   * Initialize spawn manager client
   */
  init() {
    // Listen for spawn events
    onNet('ng_core:spawn-at', this.onSpawnAt.bind(this));
    onNet('ng_core:spawn-select', this.onSpawnSelect.bind(this));

    // Freeze player until spawn
    FreezeEntityPosition(PlayerPedId(), true);
    SetEntityVisible(PlayerPedId(), false, false);

    console.log('[Spawn Manager] Client initialized');
  }

  /**
   * Handle spawn at specific coordinates
   */
  onSpawnAt(coords, options) {
    const playerPed = PlayerPedId();

    // Fade out if needed
    if (options.fadeIn) {
      DoScreenFadeOut(500);
      setTimeout(() => {
        this.spawnPlayer(playerPed, coords, options);
      }, 500);
    } else {
      this.spawnPlayer(playerPed, coords, options);
    }
  }

  /**
   * Spawn player at coordinates
   */
  spawnPlayer(playerPed, coords, options) {
    // Set player position
    RequestCollisionAtCoord(coords.x, coords.y, coords.z);
    SetEntityCoordsNoOffset(playerPed, coords.x, coords.y, coords.z, false, false, false);
    SetEntityHeading(playerPed, coords.heading || 0);

    // Wait for collision to load
    let attempts = 0;
    const checkCollision = setInterval(() => {
      attempts++;

      if (HasCollisionLoadedAroundEntity(playerPed) || attempts > 100) {
        clearInterval(checkCollision);

        // Unfreeze and show player
        FreezeEntityPosition(playerPed, false);
        SetEntityVisible(playerPed, true, false);

        // Network culling
        NetworkSetEntityInvisibleToNetwork(playerPed, false);
        SetPlayerInvincible(playerPed, false);

        // Camera
        RenderScriptCams(false, false, 0, true, true);
        SetCamActive(GetDefaultCam(), true);

        // Fade in
        if (options.fadeIn) {
          DoScreenFadeIn(options.fadeDuration || 1500);
        }

        this.hasSpawned = true;

        console.log(`[Spawn Manager] Spawned at (${coords.x}, ${coords.y}, ${coords.z})`);

        // Trigger event for other modules
        emit('ng_core:player-spawned', coords);
      }
    }, 100);
  }

  /**
   * Handle spawn selection UI
   */
  onSpawnSelect(availableSpawns) {
    // This would show a UI for spawn selection
    // For now, just pick the first spawn
    if (availableSpawns.length > 0) {
      const spawn = availableSpawns[0];
      emitNet('ng_core:spawn-selected', spawn.id);
    }
  }

  /**
   * Check if player has spawned
   */
  hasPlayerSpawned() {
    return this.hasSpawned;
  }
}

// Export for framework
module.exports = SpawnManagerClient;
