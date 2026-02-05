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
        this.netEvents = ['ng_core|spawn/at'];
    }

    /**
     * Initialize spawn manager client
     */
    init() {
        this.framework.onNet('ng_core|spawn/at', this.onSpawnAt.bind(this));

        // Release player when loading transition completes (cross-resource event)
        on('playerSpawned', () => {
            const ped = PlayerPedId();
            FreezeEntityPosition(ped, false);
            SetPlayerInvincible(PlayerId(), false);
            this.framework.log.debug('[Spawn Manager] Player released');
        });

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
     * Spawn player at coordinates with transition
     */
    async spawnPlayer(playerPed, coords, options) {
        const startTime = Date.now();
        console.log(`[Spawn Manager] START spawn at ${coords.x}, ${coords.y}, ${coords.z}`);

        // Request collision at spawn point
        RequestCollisionAtCoord(coords.x, coords.y, coords.z);

        // Set player position
        SetEntityCoordsNoOffset(playerPed, coords.x, coords.y, coords.z, false, false, false);
        SetEntityHeading(playerPed, coords.heading || 0);
        console.log(`[Spawn Manager] Position set (+${Date.now() - startTime}ms)`);

        // Wait for collision to load (max 2s)
        let attempts = 0;
        while (!HasCollisionLoadedAroundEntity(playerPed) && attempts < 20) {
            await this.delay(100);
            attempts++;
        }
        console.log(`[Spawn Manager] Collision loaded after ${attempts} attempts (+${Date.now() - startTime}ms)`);

        // Ground Z correction
        const [found, groundZ] = GetGroundZFor_3dCoord(coords.x, coords.y, coords.z + 1.0, false);
        if (found && Math.abs(groundZ - coords.z) < 3.0) {
            SetEntityCoordsNoOffset(playerPed, coords.x, coords.y, groundZ + 1.0, false, false, false);
        }
        console.log(`[Spawn Manager] Ground Z done (+${Date.now() - startTime}ms)`);

        // Protect ped during transition
        SetPlayerInvincible(PlayerId(), true);
        FreezeEntityPosition(playerPed, true);
        SetEntityVisible(playerPed, true, false);
        NetworkSetEntityInvisibleToNetwork(playerPed, false);

        // Reset camera
        RenderScriptCams(false, false, 0, true, true);

        this.hasSpawned = true;

        // Kill loading screens and signal spawn complete
        console.log(`[Spawn Manager] Killing loading screens (+${Date.now() - startTime}ms)`);
        ShutdownLoadingScreen();
        ShutdownLoadingScreenNui();
        DoScreenFadeIn(0);

        // Signal spawn complete (cross-resource)
        this.framework.fivem.triggerEvent('playerSpawned');
        console.log('[Spawn Manager] playerSpawned event triggered');
        console.log(`[Spawn Manager] DONE (+${Date.now() - startTime}ms)`);

        this.framework.log.debug(`[Spawn Manager] Spawned at (${coords.x}, ${coords.y}, ${coords.z})`);
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
