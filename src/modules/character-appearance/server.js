/**
 * NextGen Framework - Character Appearance Module (Server-Side)
 * Manages player ped models and character appearance
 */

class CharacterAppearanceModule {
  constructor(framework) {
    this.framework = framework;
    this.playerAppearances = new Map();
  }

  /**
   * Initialize the character appearance module
   */
  async init() {
    this.registerEvents();
    this.registerHooks();
    this.framework.log.info('Character Appearance Module initialized');
  }

  /**
   * Register events
   */
  registerEvents() {
    // When player spawns, send their appearance
    this.framework.onNet('ng_core:request-appearance', () => {
      const playerSource = source;
      this.sendAppearance(playerSource);
    });

    // Save appearance from client
    this.framework.onNet('ng_core:save-appearance', (appearance) => {
      const playerSource = source;
      this.saveAppearance(playerSource, appearance);
    });
  }

  /**
   * Register framework hooks
   */
  registerHooks() {
    // Load appearance during LOADING stage
    this.framework.events.on(
      this.framework.constants.Hooks.PLAYER_LOADING,
      async (data) => {
        // Extract source from data object
        const playerSource = data?.source;

        // Validate source before processing
        if (!playerSource || typeof playerSource !== 'number') {
          this.framework.log.warn(`Invalid source in PLAYER_LOADING hook: ${playerSource}`);
          return;
        }

        this.framework.log.info(`Loading appearance for player ${playerSource}...`);

        // Load or create default appearance
        await this.loadAppearance(playerSource);

        // Send appearance to client
        this.sendAppearance(playerSource);
      }
    );
  }

  /**
   * Load player appearance from database or create default
   */
  async loadAppearance(source) {
    // Note: During PLAYER_LOADING stage, the player object doesn't exist in player-manager yet
    // The player object is created later in playerJoining event
    // For now, we just load a default appearance
    // Later this can load from database based on identifiers from the hook data

    const defaultAppearance = this.getDefaultAppearance();

    this.playerAppearances.set(source, defaultAppearance);
    this.framework.log.info(`Appearance loaded for player ${source}`);
  }

  /**
   * Get default appearance
   */
  getDefaultAppearance() {
    return {
      model: 'mp_m_freemode_01', // Default male multiplayer ped
      components: {
        0: { drawable: 0, texture: 0 },   // Face
        1: { drawable: 0, texture: 0 },   // Mask
        2: { drawable: 0, texture: 0 },   // Hair
        3: { drawable: 15, texture: 0 },  // Torso/Arms
        4: { drawable: 14, texture: 0 },  // Legs
        5: { drawable: 0, texture: 0 },   // Bag
        6: { drawable: 5, texture: 0 },   // Shoes
        7: { drawable: 0, texture: 0 },   // Accessories
        8: { drawable: 15, texture: 0 },  // Undershirt
        9: { drawable: 0, texture: 0 },   // Armor
        10: { drawable: 0, texture: 0 },  // Decals
        11: { drawable: 15, texture: 0 }  // Top
      },
      props: {
        0: { drawable: -1, texture: 0 },  // Hat
        1: { drawable: -1, texture: 0 },  // Glasses
        2: { drawable: -1, texture: 0 },  // Ear accessories
        6: { drawable: -1, texture: 0 },  // Watch
        7: { drawable: -1, texture: 0 }   // Bracelet
      },
      headBlend: {
        shapeFirst: 0,
        shapeSecond: 0,
        skinFirst: 0,
        skinSecond: 0,
        shapeMix: 0.5,
        skinMix: 0.5
      },
      headOverlay: {},
      faceFeatures: {},
      hairColor: [0, 0]
    };
  }

  /**
   * Send appearance to player
   */
  sendAppearance(source) {
    // Validate source before proceeding
    if (!source || source < 0 || typeof source !== 'number') {
      this.framework.log.warn(`Invalid source in sendAppearance: ${source}`);
      return;
    }

    const appearance = this.playerAppearances.get(source) || this.getDefaultAppearance();

    this.framework.fivem.emitNet('ng_core:apply-appearance', source, appearance);
    this.framework.log.info(`Appearance sent to player ${source}`);
  }

  /**
   * Save player appearance
   */
  saveAppearance(source, appearance) {
    this.playerAppearances.set(source, appearance);

    // Later: Save to database here
    this.framework.log.info(`Appearance saved for player ${source}`);
  }

  /**
   * Get player appearance
   */
  getAppearance(source) {
    return this.playerAppearances.get(source);
  }

  /**
   * Set player model
   */
  setPlayerModel(source, model) {
    const appearance = this.playerAppearances.get(source) || this.getDefaultAppearance();
    appearance.model = model;
    this.playerAppearances.set(source, appearance);
    this.sendAppearance(source);
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.framework.log.info('Character Appearance Module destroyed');
    this.playerAppearances.clear();
  }
}

module.exports = CharacterAppearanceModule;

// Self-register
global.Framework.register('character-appearance', new CharacterAppearanceModule(global.Framework), 14);
