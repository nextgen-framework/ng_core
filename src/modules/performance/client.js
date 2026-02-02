/**
 * NextGen Framework - Performance Monitor Module (Client-Side)
 * Monitor client FPS, memory usage, and display performance overlay
 */

class PerformanceModule {
  constructor(framework) {
    this.framework = framework;
    this.showOverlay = false;
    this.fps = 0;
    this.frameTime = 0;
    this.lastFrameTime = GetGameTimer();
    this.frameCount = 0;
  }

  /**
   * Initialize the performance module
   */
  async init() {
    this.framework.log.info('Performance Monitor Module initialized');

    // Register RPC handlers
    const rpc = this.framework.getModule('rpc');
    if (!rpc) return;

    rpc.register('getClientPerformance', () => {
      return this.getPerformanceData();
    });

    rpc.register('togglePerformanceOverlay', (show) => {
      this.showOverlay = show !== undefined ? show : !this.showOverlay;
      return { showing: this.showOverlay };
    });

    // Start performance tracking
    this._perfInterval = setInterval(() => {
      this.updatePerformance();
    }, 1000);

    // Draw overlay
    this._overlayTick = setTick(() => {
      if (this.showOverlay) {
        this.drawOverlay();
      }
    });

    this.framework.log.info('Performance Monitor Module ready');
  }

  /**
   * Update performance metrics
   */
  updatePerformance() {
    const currentTime = GetGameTimer();
    const deltaTime = currentTime - this.lastFrameTime;

    // Calculate FPS
    this.fps = Math.floor(1000 / (deltaTime / this.frameCount));
    this.frameTime = deltaTime / this.frameCount;

    // Reset counters
    this.lastFrameTime = currentTime;
    this.frameCount = 0;
  }

  /**
   * Get performance data
   */
  getPerformanceData() {
    const ped = PlayerPedId();
    const [x, y, z] = GetEntityCoords(ped, false);

    return {
      fps: this.fps,
      frameTime: this.frameTime,
      position: { x, y, z },
      health: GetEntityHealth(ped),
      playerId: PlayerId(),
      serverId: GetPlayerServerId(PlayerId()),
      timestamp: Date.now()
    };
  }

  /**
   * Draw performance overlay
   */
  drawOverlay() {
    this.frameCount++;

    const ped = PlayerPedId();
    const health = GetEntityHealth(ped);
    const armor = GetPedArmour(ped);
    const [x, y, z] = GetEntityCoords(ped, false);

    // Draw background
    DrawRect(0.015, 0.1, 0.15, 0.15, 0, 0, 0, 150);

    // Draw title
    this.drawText('~b~Performance', 0.015, 0.03);

    // Draw FPS
    const fpsColor = this.fps >= 60 ? '~g~' : this.fps >= 30 ? '~y~' : '~r~';
    this.drawText(`${fpsColor}FPS: ${this.fps}`, 0.015, 0.05);

    // Draw frame time
    this.drawText(`~w~Frame: ${this.frameTime.toFixed(2)}ms`, 0.015, 0.07);

    // Draw health
    const healthPercent = Math.floor((health / 200) * 100);
    this.drawText(`~r~Health: ${healthPercent}%`, 0.015, 0.09);

    // Draw armor
    this.drawText(`~b~Armor: ${armor}`, 0.015, 0.11);

    // Draw position
    this.drawText(`~w~X: ${x.toFixed(1)}`, 0.015, 0.13);
    this.drawText(`~w~Y: ${y.toFixed(1)}`, 0.015, 0.15);
    this.drawText(`~w~Z: ${z.toFixed(1)}`, 0.015, 0.17);
  }

  /**
   * Draw text helper
   */
  drawText(text, x, y) {
    SetTextFont(4);
    SetTextProportional(false);
    SetTextScale(0.35, 0.35);
    SetTextColour(255, 255, 255, 255);
    SetTextDropshadow(0, 0, 0, 0, 255);
    SetTextEdge(1, 0, 0, 0, 255);
    SetTextDropShadow();
    SetTextOutline();
    SetTextEntry('STRING');
    AddTextComponentString(text);
    DrawText(x, y);
  }

  /**
   * Toggle overlay
   */
  toggle() {
    this.showOverlay = !this.showOverlay;
    return this.showOverlay;
  }

  /**
   * Cleanup
   */
  async destroy() {
    if (this._perfInterval) {
      clearInterval(this._perfInterval);
      this._perfInterval = null;
    }
    if (this._overlayTick) {
      clearTick(this._overlayTick);
      this._overlayTick = null;
    }
    this.showOverlay = false;
    this.framework.log.info('Performance Monitor Module destroyed');
  }
}

// Export for client-side
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceModule;
}

// Self-register
global.Framework.register('performance', new PerformanceModule(global.Framework), 20);
