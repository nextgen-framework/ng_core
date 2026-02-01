/**
 * NextGen Framework - Character Appearance Module (Client-Side)
 * Handles character model and appearance on client
 */

class CharacterAppearanceClient {
  constructor(framework) {
    this.framework = framework;
    this.currentAppearance = null;
    this.isApplying = false;

    // Pre-registered at script load time (cerulean)
    this.netEvents = ['ng_core:apply-appearance'];
  }

  /**
   * Initialize character appearance client
   */
  init() {
    this.registerEvents();
    console.log('[Character Appearance] Client initialized');

    // Request appearance from server now that we're ready to receive it
    this.requestAppearance();
  }

  /**
   * Request appearance from server
   */
  requestAppearance() {
    console.log('[Character Appearance] Requesting appearance from server...');
    this.framework.fivem.emitNet('ng_core:request-appearance');
  }

  /**
   * Register network events
   */
  registerEvents() {
    // Apply appearance when received from server
    this.framework.onNet('ng_core:apply-appearance', async (appearance) => {
      console.log('[Character Appearance] Received appearance from server');
      this.currentAppearance = appearance;

      // Apply appearance immediately
      await this.onApplyAppearance(appearance);
      console.log('[Character Appearance] Appearance applied');
    });
  }

  /**
   * Handle apply appearance event
   */
  async onApplyAppearance(appearance) {
    if (this.isApplying) {
      console.log('[Character Appearance] Already applying appearance, skipping...');
      return;
    }

    this.isApplying = true;
    this.currentAppearance = appearance;

    console.log(`[Character Appearance] Applying appearance with model: ${appearance.model}`);

    try {
      await this.applyModel(appearance.model);

      // Apply customizations (components, props, headBlend, etc.)
      this.applyCustomization(appearance);

      console.log('[Character Appearance] Appearance applied successfully');

      // Signal to server that client is ready (appearance applied)
      console.log('[Character Appearance] Signaling server that client is ready...');
      this.framework.fivem.emitNet('ng_core:client-ready');

    } catch (error) {
      console.error('[Character Appearance] Error applying appearance:', error);
    } finally {
      this.isApplying = false;
    }
  }

  /**
   * Apply ped model
   */
  async applyModel(modelName) {
    const modelHash = GetHashKey(modelName);

    // Request model
    RequestModel(modelHash);

    // Wait for model to load
    const maxAttempts = 100;
    let attempts = 0;

    while (!HasModelLoaded(modelHash) && attempts < maxAttempts) {
      await this.wait(100);
      attempts++;
    }

    if (!HasModelLoaded(modelHash)) {
      console.error(`[Character Appearance] Failed to load model: ${modelName}`);
      return;
    }

    // Set player model
    SetPlayerModel(PlayerId(), modelHash);
    SetModelAsNoLongerNeeded(modelHash);

    // Wait a bit for model to be fully applied
    await this.wait(100);

    // Note: Don't set visible here - spawn-manager handles visibility
    // Just ensure the model is properly set
    const playerPed = PlayerPedId();
    SetEntityAlpha(playerPed, 255, false);

    console.log(`[Character Appearance] Model ${modelName} applied`);
  }

  /**
   * Apply character customization
   * (Will be expanded later for full customization)
   */
  applyCustomization(appearance) {
    const playerPed = PlayerPedId();

    // Apply components (clothing)
    if (appearance.components) {
      for (const [componentId, data] of Object.entries(appearance.components)) {
        SetPedComponentVariation(playerPed, parseInt(componentId), data.drawable, data.texture, 0);
      }
    }

    // Apply props (accessories)
    if (appearance.props) {
      for (const [propId, data] of Object.entries(appearance.props)) {
        if (data.drawable === -1) {
          ClearPedProp(playerPed, parseInt(propId));
        } else {
          SetPedPropIndex(playerPed, parseInt(propId), data.drawable, data.texture, true);
        }
      }
    }

    // Apply head blend data (for freemode peds)
    if (appearance.headBlend && appearance.headBlend.shapeFirst !== undefined) {
      SetPedHeadBlendData(
        playerPed,
        appearance.headBlend.shapeFirst,
        appearance.headBlend.shapeSecond,
        0,
        appearance.headBlend.skinFirst,
        appearance.headBlend.skinSecond,
        0,
        appearance.headBlend.shapeMix,
        appearance.headBlend.skinMix,
        0,
        false
      );
    }

    // Apply hair color
    if (appearance.hairColor) {
      SetPedHairColor(playerPed, appearance.hairColor[0], appearance.hairColor[1]);
    }
  }

  /**
   * Save current appearance to server
   */
  saveAppearance() {
    if (this.currentAppearance) {
      this.framework.fivem.emitNet('ng_core:save-appearance', this.currentAppearance);
      console.log('[Character Appearance] Appearance saved');
    }
  }

  /**
   * Get current appearance
   */
  getCurrentAppearance() {
    return this.currentAppearance;
  }

  /**
   * Utility: Wait for milliseconds
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export to global scope for framework (FiveM client environment)
if (typeof global !== 'undefined') {
  global.NgModule_character_appearance = CharacterAppearanceClient;
}

// Self-register
global.Framework.register('character-appearance', new CharacterAppearanceClient(global.Framework), 15);
