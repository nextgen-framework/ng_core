/**
 * NextGen Framework - Resource Monitor Module
 * Monitors FiveM server resources and detects when all resources have finished loading
 */

class ResourceMonitor {
  constructor(framework) {
    this.framework = framework;
    this.totalResources = 0;
    this.startedResources = new Set();
    this.allResourcesLoaded = false;
    this.stabilityTimeout = null;
    this.stabilityDelay = 2000; // 2 seconds of no new resources = stable
  }

  /**
   * Initialize the resource monitor
   */
  async init() {
    this.framework.utils.Log('Resource Monitor module initialized', 'info');

    // Count total resources at startup
    this.totalResources = GetNumResources();
    this.framework.utils.Log(`Total resources detected: ${this.totalResources}`, 'info');

    // Collect already started resources
    for (let i = 0; i < this.totalResources; i++) {
      const resourceName = GetResourceByFindIndex(i);
      const state = GetResourceState(resourceName);

      if (state === 'started') {
        this.startedResources.add(resourceName);
      }
    }

    this.framework.utils.Log(`Already started resources: ${this.startedResources.size}`, 'info');

    // Listen for resource starts
    on('onServerResourceStart', (resourceName) => {
      this.onResourceStart(resourceName);
    });

    // Start stability check timer
    this.scheduleStabilityCheck();
  }

  /**
   * Handle resource start event
   * @param {string} resourceName - Name of the resource that started
   */
  onResourceStart(resourceName) {
    if (this.allResourcesLoaded) return;

    this.startedResources.add(resourceName);

    this.framework.utils.Log(
      `Resource started: ${resourceName} (${this.startedResources.size}/${this.totalResources})`,
      'debug'
    );

    // Reset stability timer - we just got a new resource
    this.scheduleStabilityCheck();
  }

  /**
   * Schedule a stability check
   * If no new resources start within the delay, consider loading complete
   */
  scheduleStabilityCheck() {
    if (this.allResourcesLoaded) return;

    // Clear existing timeout
    if (this.stabilityTimeout) {
      clearTimeout(this.stabilityTimeout);
    }

    // Schedule new check
    this.stabilityTimeout = setTimeout(() => {
      this.markAsLoaded();
    }, this.stabilityDelay);
  }

  /**
   * Mark all resources as loaded
   */
  markAsLoaded() {
    if (this.allResourcesLoaded) return;

    this.allResourcesLoaded = true;
    this.framework.utils.Log('All server resources have finished loading!', 'info');

    // Emit event
    this.framework.eventBus.emit(this.framework.constants.Events.ALL_RESOURCES_LOADED);
  }

  /**
   * Check if all resources are loaded
   * @returns {boolean}
   */
  isAllResourcesLoaded() {
    return this.allResourcesLoaded;
  }

  /**
   * Get resource statistics
   * @returns {Object}
   */
  getStats() {
    return {
      total: this.totalResources,
      started: this.startedResources.size,
      allLoaded: this.allResourcesLoaded
    };
  }

  /**
   * Cleanup method (optional)
   */
  async destroy() {
    this.framework.utils.Log('Resource Monitor module destroyed', 'info');
  }
}

module.exports = ResourceMonitor;
