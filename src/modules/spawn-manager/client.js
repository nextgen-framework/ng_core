/**
 * NextGen Framework - Spawn Manager (Client)
 * Handles player spawning mechanics (model, position, collision, fade).
 * Spawn decisions (where, when) are made by plugins on the server side.
 */

class SpawnManagerClient {
    constructor(framework) {
        this.framework = framework;
        this.hasSpawned = false;

        // Pre-registered at script load time (cerulean)
        this.netEvents = ['ng_core:spawn-at'];
    }

    /**
     * Initialize spawn manager client
     */
    init() {
        this.framework.onNet('ng_core:spawn-at', this.onSpawnAt.bind(this));

        // Freeze player until spawn
        const ped = PlayerPedId();
        if (ped && DoesEntityExist(ped)) {
            FreezeEntityPosition(ped, true);
            SetEntityVisible(ped, false, false);
        }

        this.framework.log.debug('[Spawn Manager] Client initialized');
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

        // Load model only if explicitly provided in options
        if (options?.model) {
            await this.loadModel(options.model);
        }

        const playerPed = PlayerPedId();
        await this.spawnPlayer(playerPed, coords, options || {});
    }

    /**
     * Load and apply any ped model (freemode, story, animal, etc.)
     * @param {string} modelName - Model name or hash
     * @returns {Promise<boolean>} Whether the model was loaded
     */
    async loadModel(modelName) {
        const modelHash = typeof modelName === 'number' ? modelName : GetHashKey(modelName);

        if (!IsModelInCdimage(modelHash) || !IsModelValid(modelHash)) {
            this.framework.log.debug(`[Spawn Manager] Invalid model: ${modelName}`);
            return false;
        }

        RequestModel(modelHash);

        let attempts = 0;
        while (!HasModelLoaded(modelHash) && attempts < 100) {
            await this.delay(10);
            attempts++;
        }

        if (!HasModelLoaded(modelHash)) {
            this.framework.log.debug(`[Spawn Manager] Failed to load model: ${modelName}`);
            return false;
        }

        SetPlayerModel(PlayerId(), modelHash);
        SetModelAsNoLongerNeeded(modelHash);
        return true;
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

        // Ground Z correction to prevent spawning under map
        const [found, groundZ] = GetGroundZFor_3dCoord(coords.x, coords.y, coords.z + 100.0, false);
        if (found) {
            SetEntityCoordsNoOffset(playerPed, coords.x, coords.y, groundZ + 1.0, false, false, false);
            await this.delay(50);
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

        // Shut down FiveM loading screen
        ShutdownLoadingScreen();
        ShutdownLoadingScreenNui();

        this.framework.log.debug(`[Spawn Manager] Spawned at (${coords.x}, ${coords.y}, ${coords.z})`);

        // Trigger FiveM playerSpawned event
        emit('playerSpawned');

        // Trigger event for other modules
        this.framework.fivem.emit('ng_core:player-spawned', coords);
    }

    /**
     * Check if player has spawned
     * @returns {boolean}
     */
    hasPlayerSpawned() {
        return this.hasSpawned;
    }

    /**
     * Helper delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.hasSpawned = false;
        this.framework.log.info('Spawn Manager client destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpawnManagerClient;
}

// Self-register
global.Framework.register('spawn-manager', new SpawnManagerClient(global.Framework), 15);
