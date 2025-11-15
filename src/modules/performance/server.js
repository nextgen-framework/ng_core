/**
 * NextGen Framework - Performance Monitor Module (Server-Side)
 * Monitor server performance, player counts, and resource usage
 */

class PerformanceModule {
  constructor(framework) {
    this.framework = framework;
    this.stats = {
      players: 0,
      maxPlayers: GetConvarInt('sv_maxclients', 32),
      uptime: 0,
      tickTime: 0,
      resourceCount: 0
    };
    this.startTime = Date.now();
  }

  /**
   * Initialize the performance module
   */
  async init() {
    this.framework.utils.Log('Performance Monitor Module initialized', 'info');

    // Update stats every 5 seconds
    setInterval(() => {
      this.updateStats();
    }, 5000);

    // Register RPC handlers
    this.framework.rpc.register('getServerStats', () => {
      return this.getStats();
    });

    this.framework.rpc.register('getServerPerformance', () => {
      return this.getPerformanceData();
    });

    // Register command
    this.registerCommands();

    this.framework.utils.Log('Performance Monitor Module ready', 'info');
  }

  /**
   * Update performance stats
   */
  updateStats() {
    this.stats.players = GetNumPlayerIndices();
    this.stats.uptime = Math.floor((Date.now() - this.startTime) / 1000);
    this.stats.resourceCount = GetNumResources();
    this.stats.tickTime = this.getAverageTickTime();
  }

  /**
   * Get average server tick time
   */
  getAverageTickTime() {
    // Estimate based on server performance
    // In production, you'd want to measure this more accurately
    return 0; // FiveM doesn't expose this directly
  }

  /**
   * Get current stats
   */
  getStats() {
    this.updateStats();
    return {
      ...this.stats,
      timestamp: Date.now()
    };
  }

  /**
   * Get detailed performance data
   */
  getPerformanceData() {
    const players = this.framework.getPlayers();
    const playerData = [];

    players.forEach((player, source) => {
      playerData.push({
        source: source,
        name: GetPlayerName(source),
        ping: GetPlayerPing(source),
        identifiers: this.getPlayerIdentifiers(source)
      });
    });

    return {
      server: this.getStats(),
      players: playerData,
      resources: this.getResourceStats()
    };
  }

  /**
   * Get player identifiers
   */
  getPlayerIdentifiers(source) {
    const identifiers = {};
    const numIdentifiers = GetNumPlayerIdentifiers(source);

    for (let i = 0; i < numIdentifiers; i++) {
      const identifier = GetPlayerIdentifier(source, i);
      const [type, value] = identifier.split(':');
      identifiers[type] = value;
    }

    return identifiers;
  }

  /**
   * Get resource stats
   */
  getResourceStats() {
    const resources = [];
    const numResources = GetNumResources();

    for (let i = 0; i < numResources; i++) {
      const resourceName = GetResourceByFindIndex(i);
      const state = GetResourceState(resourceName);

      if (state === 'started') {
        resources.push({
          name: resourceName,
          state: state
        });
      }
    }

    return resources;
  }

  /**
   * Register commands
   */
  registerCommands() {
    const chatCommands = this.framework.getModule('chat-commands');
    if (!chatCommands) return;

    chatCommands.register('perf', (source) => {
      const stats = this.getStats();
      const uptime = this.formatUptime(stats.uptime);

      chatCommands.sendMessage(source, `^3=== Server Performance ===`);
      chatCommands.sendMessage(source, `^5Players: ^7${stats.players}/${stats.maxPlayers}`);
      chatCommands.sendMessage(source, `^5Uptime: ^7${uptime}`);
      chatCommands.sendMessage(source, `^5Resources: ^7${stats.resourceCount}`);
    }, {
      description: 'Show server performance stats',
      aliases: ['performance', 'stats']
    });
  }

  /**
   * Format uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.framework.utils.Log('Performance Monitor Module destroyed', 'info');
  }
}

module.exports = PerformanceModule;
