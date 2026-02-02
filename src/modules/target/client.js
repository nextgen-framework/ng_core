/**
 * NextGen Framework - Target Module (Client)
 * Raycast-based interaction system (like ox_target/qb-target)
 *
 * Features:
 * - Raycast detection for entities (peds, vehicles, objects)
 * - Zone-based targeting (integration with zone-manager)
 * - Model-specific options
 * - Entity-specific options
 * - Global entity type options
 * - Distance-based filtering
 * - Contextual interactions with canInteract callbacks
 * - Visual feedback (basic - expandable)
 */

class TargetManager {
  constructor(framework) {
    this.framework = framework;

    // Registered options
    this.modelOptions = new Map(); // model hash => options[]
    this.entityOptions = new Map(); // entity handle => options[]
    this.typeOptions = new Map(); // type (ped/vehicle/object) => options[]
    this.zoneOptions = new Map(); // zone name => options[]

    // Current state
    this.currentEntity = null;
    this.currentZone = null;
    this.currentOptions = [];
    this.isTargeting = false;

    // Configuration
    this.config = {
      maxDistance: 2.5,
      refreshRate: 100, // ms between raycast checks
      enableTrace: false, // Debug raycasts
      traceColor: [255, 0, 0, 200],

      // Raycast flags
      flags: 286, // Everything except peds (1), vehicles (2), peds (4), objects (16), pickups (256) = 279
                  // We'll customize: 1 | 2 | 4 | 16 = 23 (peds, vehicles, objects only)

      // Controls
      controls: {
        interact: 38, // E key
        cancel: 44    // Q key (if menu is open)
      }
    };

    // Thread control
    this.raycastThread = null;
  }

  async init() {
    this.framework.log.info('Target manager initialized');

    // Start raycast thread
    this.startRaycastThread();

    // Register key controls
    this.registerControls();
  }

  /**
   * Start the raycast detection thread
   */
  startRaycastThread() {
    if (this.raycastThread) return;

    this.raycastThread = setTick(() => {
      this.raycastCheck();
    });
  }

  /**
   * Stop the raycast detection thread
   */
  stopRaycastThread() {
    if (this.raycastThread) {
      clearTick(this.raycastThread);
      this.raycastThread = null;
    }
  }

  /**
   * Perform raycast check
   */
  async raycastCheck() {
    // Throttle checks
    await this.sleep(this.config.refreshRate);

    const playerPed = PlayerPedId();
    const playerCoords = GetEntityCoords(playerPed, true);
    const cameraCoords = GetGameplayCamCoord();
    const cameraRotation = GetGameplayCamRot(2);

    // Calculate direction from camera
    const direction = this.rotationToDirection(cameraRotation);
    const destination = [
      cameraCoords[0] + direction[0] * this.config.maxDistance,
      cameraCoords[1] + direction[1] * this.config.maxDistance,
      cameraCoords[2] + direction[2] * this.config.maxDistance
    ];

    // Perform raycast
    const rayHandle = StartShapeTestRay(
      cameraCoords[0], cameraCoords[1], cameraCoords[2],
      destination[0], destination[1], destination[2],
      23, // peds | vehicles | objects
      playerPed,
      0
    );

    const [hit, endCoords, surfaceNormal, entity] = GetShapeTestResult(rayHandle);

    // Debug trace
    if (this.config.enableTrace && hit === 1) {
      const [r, g, b, a] = this.config.traceColor;
      DrawLine(
        cameraCoords[0], cameraCoords[1], cameraCoords[2],
        endCoords[0], endCoords[1], endCoords[2],
        r, g, b, a
      );
    }

    // Check if we hit something
    if (hit === 1 && entity && DoesEntityExist(entity)) {
      const distance = GetDistanceBetweenCoords(
        playerCoords[0], playerCoords[1], playerCoords[2],
        endCoords[0], endCoords[1], endCoords[2],
        true
      );

      if (distance <= this.config.maxDistance) {
        await this.handleEntityHit(entity, distance, endCoords);
        return;
      }
    }

    // Check zones if no entity hit
    await this.checkZones(playerCoords);

    // Clear target if nothing found
    this.clearTarget();
  }

  /**
   * Handle entity hit by raycast
   */
  async handleEntityHit(entity, distance, coords) {
    // Get entity info
    const entityType = GetEntityType(entity);
    const model = GetEntityModel(entity);

    // Collect all applicable options
    const options = [];

    // 1. Entity-specific options
    if (this.entityOptions.has(entity)) {
      options.push(...this.entityOptions.get(entity));
    }

    // 2. Model-specific options
    if (this.modelOptions.has(model)) {
      options.push(...this.modelOptions.get(model));
    }

    // 3. Type-specific options
    const typeName = this.getEntityTypeName(entityType);
    if (this.typeOptions.has(typeName)) {
      options.push(...this.typeOptions.get(typeName));
    }

    // Filter options by distance and canInteract
    const validOptions = [];
    for (const option of options) {
      // Check distance
      if (option.distance && distance > option.distance) continue;

      // Check canInteract callback
      if (option.canInteract && !option.canInteract(entity, distance, coords)) continue;

      validOptions.push(option);
    }

    // Update target if options available
    if (validOptions.length > 0) {
      this.setTarget(entity, validOptions, 'entity');
    } else {
      this.clearTarget();
    }
  }

  /**
   * Check if player is in any registered zones
   */
  async checkZones(playerCoords) {
    const zoneManager = this.framework.getModule('zone-manager');
    if (!zoneManager) return;

    // Check all registered zone options
    for (const [zoneName, options] of this.zoneOptions.entries()) {
      const isInZone = zoneManager.isPlayerInZone(PlayerId(), zoneName);

      if (isInZone) {
        // Filter options by canInteract
        const validOptions = options.filter(opt => {
          return !opt.canInteract || opt.canInteract(null, 0, playerCoords);
        });

        if (validOptions.length > 0) {
          this.setTarget(zoneName, validOptions, 'zone');
          return;
        }
      }
    }
  }

  /**
   * Set current target
   */
  setTarget(target, options, type) {
    if (type === 'entity') {
      if (this.currentEntity === target) return; // Same target
      this.currentEntity = target;
      this.currentZone = null;
    } else if (type === 'zone') {
      if (this.currentZone === target) return; // Same zone
      this.currentZone = target;
      this.currentEntity = null;
    }

    this.currentOptions = options;
    this.isTargeting = true;

    // TODO: Show UI indicator (when ui module exists)
    // For now, just show a help text
    this.showHelpText();
  }

  /**
   * Clear current target
   */
  clearTarget() {
    if (!this.isTargeting) return;

    this.currentEntity = null;
    this.currentZone = null;
    this.currentOptions = [];
    this.isTargeting = false;

    // TODO: Hide UI indicator
  }

  /**
   * Show help text for current target
   */
  showHelpText() {
    if (this.currentOptions.length === 0) return;

    // Show simple help text (will be replaced by UI module later)
    const firstOption = this.currentOptions[0];
    BeginTextCommandDisplayHelp('STRING');
    AddTextComponentSubstringPlayerName(`~INPUT_CONTEXT~ ${firstOption.label}`);
    EndTextCommandDisplayHelp(0, false, true, -1);
  }

  /**
   * Register key controls
   */
  registerControls() {
    // Interact key (E)
    RegisterCommand('+target_interact', () => {
      if (this.isTargeting && this.currentOptions.length > 0) {
        this.handleInteract();
      }
    }, false);

    RegisterCommand('-target_interact', () => {}, false);
    RegisterKeyMapping('+target_interact', 'Target: Interact', 'keyboard', 'E');
  }

  /**
   * Handle interaction
   */
  handleInteract() {
    if (this.currentOptions.length === 1) {
      // Single option - execute directly
      this.executeOption(this.currentOptions[0]);
    } else {
      // Multiple options - show menu (TODO: when ui module exists)
      // For now, execute first option
      this.executeOption(this.currentOptions[0]);
    }
  }

  /**
   * Execute an option
   */
  executeOption(option) {
    if (!option.onSelect) return;

    // Call the option's callback
    if (this.currentEntity) {
      option.onSelect(this.currentEntity);
    } else if (this.currentZone) {
      option.onSelect(this.currentZone);
    }

    // Clear target after interaction
    this.clearTarget();
  }

  /**
   * Register options for specific models
   * @param {string|string[]|number|number[]} models - Model name(s) or hash(es)
   * @param {Object[]} options - Array of option objects
   */
  addModel(models, options) {
    if (!Array.isArray(models)) models = [models];

    for (let model of models) {
      // Convert string to hash if needed
      if (typeof model === 'string') {
        model = GetHashKey(model);
      }

      this.modelOptions.set(model, options);
    }

    this.framework.log.debug(`Registered ${options.length} options for ${models.length} models`);
  }

  /**
   * Register options for specific entity
   * @param {number} entity - Entity handle
   * @param {Object[]} options - Array of option objects
   */
  addEntity(entity, options) {
    this.entityOptions.set(entity, options);
    this.framework.log.debug(`Registered ${options.length} options for entity ${entity}`);
  }

  /**
   * Register options for entity types
   * @param {string} type - 'ped', 'vehicle', 'object'
   * @param {Object[]} options - Array of option objects
   */
  addEntityType(type, options) {
    this.typeOptions.set(type, options);
    this.framework.log.debug(`Registered ${options.length} options for type ${type}`);
  }

  /**
   * Register options for zones
   * @param {string} zoneName - Zone name (from zone-manager)
   * @param {Object[]} options - Array of option objects
   */
  addZone(zoneName, options) {
    this.zoneOptions.set(zoneName, options);
    this.framework.log.debug(`Registered ${options.length} options for zone ${zoneName}`);
  }

  /**
   * Remove model options
   */
  removeModel(models) {
    if (!Array.isArray(models)) models = [models];

    for (let model of models) {
      if (typeof model === 'string') {
        model = GetHashKey(model);
      }
      this.modelOptions.delete(model);
    }
  }

  /**
   * Remove entity options
   */
  removeEntity(entity) {
    this.entityOptions.delete(entity);
  }

  /**
   * Remove zone options
   */
  removeZone(zoneName) {
    this.zoneOptions.delete(zoneName);
  }

  /**
   * Convert rotation to direction vector
   */
  rotationToDirection(rotation) {
    const z = rotation[2] * (Math.PI / 180.0);
    const x = rotation[0] * (Math.PI / 180.0);
    const num = Math.abs(Math.cos(x));

    return [
      -Math.sin(z) * num,
      Math.cos(z) * num,
      Math.sin(x)
    ];
  }

  /**
   * Get entity type name from type number
   */
  getEntityTypeName(entityType) {
    switch (entityType) {
      case 1: return 'ped';
      case 2: return 'vehicle';
      case 3: return 'object';
      default: return 'unknown';
    }
  }

  /**
   * Enable/disable debug trace
   */
  setDebugTrace(enabled) {
    this.config.enableTrace = enabled;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async destroy() {
    this.stopRaycastThread();
    this.clearTarget();
    this.modelOptions.clear();
    this.entityOptions.clear();
    this.typeOptions.clear();
    this.zoneOptions.clear();
  }
}

// Export to global scope for framework (FiveM client environment)
if (typeof global !== "undefined") { global.NgModule_target = TargetManager; }

// Self-register
global.Framework.register('target', new TargetManager(global.Framework), 13);
