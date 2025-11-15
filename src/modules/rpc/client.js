/**
 * NextGen Framework - RPC Module (Client-Side)
 * Generic Remote Procedure Call system using FiveM exports
 */

class RPCModule {
  constructor(framework) {
    this.framework = framework;
    this.handlers = new Map();
    this.pendingCalls = new Map();
    this.callTimeout = 10000; // 10 seconds default timeout
  }

  /**
   * Initialize the RPC module
   */
  async init() {
    this.registerEventHandlers();
    this.framework.utils.Log('RPC module initialized', 'info');
  }

  /**
   * Register internal RPC event handlers
   */
  registerEventHandlers() {
    // Handle RPC requests from server
    onNet(global.NextGenConstants.Events.RPC_REQUEST, async (callId, rpcName, ...args) => {
      try {
        const handler = this.handlers.get(rpcName);
        if (!handler) {
          throw new Error(`RPC handler "${rpcName}" not found`);
        }

        // Execute handler
        const result = await handler(...args);

        // Send response back to server
        emitNet(global.NextGenConstants.Events.RPC_RESPONSE, callId, {
          success: true,
          data: result
        });
      } catch (error) {
        // Send error response
        emitNet(global.NextGenConstants.Events.RPC_RESPONSE, callId, {
          success: false,
          error: error.message
        });

        global.NextGenUtils.Log(`RPC error "${rpcName}": ${error.message}`, 'error');
      }
    });

    // Handle RPC responses (for client -> server calls)
    onNet(global.NextGenConstants.Events.RPC_RESPONSE, (callId, response) => {
      const pending = this.pendingCalls.get(callId);
      if (pending) {
        clearTimeout(pending.timeout);

        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(new Error(response.error));
        }

        this.pendingCalls.delete(callId);
      }
    });
  }

  /**
   * Register an RPC handler
   * @param {string} name - RPC name
   * @param {Function} handler - Handler function (...args) => result
   */
  register(name, handler) {
    if (this.handlers.has(name)) {
      global.NextGenUtils.Log(`RPC handler "${name}" already exists, overwriting`, 'warn');
    }

    this.handlers.set(name, handler);
    global.NextGenUtils.Log(`Registered RPC: ${name}`, 'info');
  }

  /**
   * Unregister an RPC handler
   * @param {string} name
   */
  unregister(name) {
    this.handlers.delete(name);
  }

  /**
   * Call an RPC on the server
   * @param {string} rpcName - RPC name
   * @param {...*} args - Arguments to pass
   * @returns {Promise<*>}
   */
  async callServer(rpcName, ...args) {
    return new Promise((resolve, reject) => {
      const callId = global.NextGenUtils.GenerateId();

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(callId);
        reject(new Error(`RPC call "${rpcName}" to server timed out`));
      }, this.callTimeout);

      // Store pending call
      this.pendingCalls.set(callId, { resolve, reject, timeout });

      // Send RPC request to server
      emitNet(global.NextGenConstants.Events.RPC_REQUEST, callId, rpcName, ...args);
    });
  }

  /**
   * Set timeout for RPC calls
   * @param {number} timeout - Timeout in milliseconds
   */
  setTimeout(timeout) {
    this.callTimeout = timeout;
  }

  /**
   * Check if RPC handler exists
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.handlers.has(name);
  }

  /**
   * Get all registered RPC names
   * @returns {string[]}
   */
  getRegisteredRPCs() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Cleanup method
   */
  async destroy() {
    this.framework.utils.Log('RPC module destroyed', 'info');

    // Clear all pending calls
    for (const [callId, pending] of this.pendingCalls) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('RPC module destroyed'));
    }

    this.pendingCalls.clear();
    this.handlers.clear();
  }
}

// Export for client-side (no module.exports in client)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RPCModule;
}

// Make available globally for client-side
global.ClientModule_rpc = RPCModule;
