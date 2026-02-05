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
    this.netEvents = ['ng_core|appearance/apply'];
  }

  /**
   * Initialize character appearance client
   */
  init() {
    this.registerEvents();
    this.framework.log.debug('[Character Appearance] Client initialized');

    // Request appearance from server now that we're ready to receive it
    this.requestAppearance();
  }

  /**
   * Request appearance from server
   */
  requestAppearance() {
    this.framework.log.debug('[Character Appearance] Requesting appearance from server...');
    this.framework.fivem.emitNet('ng_core|appearance/request');
  }

  /**
   * Register network events
   */
  registerEvents() {
    // Apply appearance when received from server
    this.framework.onNet('ng_core|appearance/apply', async (appearance) => {
      this.framework.log.debug('[Character Appearance] Received appearance from server');
      this.currentAppearance = appearance;

      // Apply appearance immediately
      await this.onApplyAppearance(appearance);
      this.framework.log.debug('[Character Appearance] Appearance applied');
    });
  }

  /**
   * Handle apply appearance event
   */
  async onApplyAppearance(appearance) {
    if (this.isApplying) {
      this.framework.log.debug('[Character Appearance] Already applying appearance, skipping...');
      return;
    }

    this.isApplying = true;
    this.currentAppearance = appearance;

    this.framework.log.debug(`[Character Appearance] Applying appearance with model: ${appearance.model}`);

    try {
      await this.applyModel(appearance.model);

      // Apply customizations (components, props, headBlend, etc.)
      this.applyCustomization(appearance);

      this.framework.log.debug('[Character Appearance] Appearance applied successfully');

      // Signal to server that client is ready (appearance applied)
      // This event is what connection-manager waits for before proceeding
      this.framework.log.debug('[Character Appearance] Signaling server that client is ready...');
      this.framework.fivem.emitNet('ng_core|connection/client-ready');

    } catch (error) {
      this.framework.log.error(`[Character Appearance] Error applying appearance: ${error.message}`);
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
      this.framework.log.error(`[Character Appearance] Failed to load model: ${modelName}`);
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

    this.framework.log.debug(`[Character Appearance] Model ${modelName} applied`);
  }

  /**
   * Apply full character customization to ped
   * Supports: components, props, headBlend, headOverlays, faceFeatures, hairColor, eyeColor
   */
  applyCustomization(appearance) {
    const playerPed = PlayerPedId();

    // Set default variation first as baseline
    SetPedDefaultComponentVariation(playerPed);

    // Apply head blend data (must be set before overlays)
    if (appearance.headBlend && appearance.headBlend.shapeFirst !== undefined) {
      SetPedHeadBlendData(
        playerPed,
        appearance.headBlend.shapeFirst,
        appearance.headBlend.shapeSecond,
        appearance.headBlend.shapeThird || 0,
        appearance.headBlend.skinFirst,
        appearance.headBlend.skinSecond,
        appearance.headBlend.skinThird || 0,
        appearance.headBlend.shapeMix,
        appearance.headBlend.skinMix,
        appearance.headBlend.thirdMix || 0,
        false
      );
    }

    // Apply face features (0-19: nose width, nose peak, chin, etc.)
    if (appearance.faceFeatures) {
      for (const [featureId, value] of Object.entries(appearance.faceFeatures)) {
        SetPedFaceFeature(playerPed, parseInt(featureId), value);
      }
    }

    // Apply head overlays (0-12: blemishes, beard, eyebrows, ageing, makeup, etc.)
    if (appearance.headOverlays) {
      for (const [overlayId, data] of Object.entries(appearance.headOverlays)) {
        const id = parseInt(overlayId);
        SetPedHeadOverlay(playerPed, id, data.index ?? 255, data.opacity ?? 1.0);
        if (data.colorType !== undefined) {
          SetPedHeadOverlayColor(playerPed, id, data.colorType, data.firstColor ?? 0, data.secondColor ?? 0);
        }
      }
    }

    // Apply components (clothing: 0-11)
    if (appearance.components) {
      for (const [componentId, data] of Object.entries(appearance.components)) {
        SetPedComponentVariation(playerPed, parseInt(componentId), data.drawable, data.texture, data.palette || 0);
      }
    }

    // Apply props (accessories: 0-2, 6-7)
    if (appearance.props) {
      for (const [propId, data] of Object.entries(appearance.props)) {
        if (data.drawable === -1) {
          ClearPedProp(playerPed, parseInt(propId));
        } else {
          SetPedPropIndex(playerPed, parseInt(propId), data.drawable, data.texture, true);
        }
      }
    }

    // Apply hair color
    if (appearance.hairColor) {
      SetPedHairColor(playerPed, appearance.hairColor[0], appearance.hairColor[1]);
    }

    // Apply eye color
    if (appearance.eyeColor !== undefined) {
      SetPedEyeColor(playerPed, appearance.eyeColor);
    }
  }

  /**
   * Save current appearance to server
   */
  saveAppearance() {
    if (this.currentAppearance) {
      this.framework.fivem.emitNet('ng_core|appearance/save', this.currentAppearance);
      this.framework.log.debug('[Character Appearance] Appearance saved');
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

  /**
   * Cleanup
   */
  async destroy() {
    this.currentAppearance = null;
    this.isApplying = false;
    this.framework.log.info('Character Appearance client destroyed');
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CharacterAppearanceClient;
}

// Self-register
global.Framework.register('character-appearance', new CharacterAppearanceClient(global.Framework), 14);
