/**
 * NextGen Framework - RPC Module
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
    // Handle RPC requests from clients
    onNet(global.NextGenConstants.Events.RPC_REQUEST, async (callId, rpcName, ...args) => {
      // Note: 'source' is a magic global variable in FiveM event handlers

      try {
        const handler = this.handlers.get(rpcName);
        if (!handler) {
          throw new Error(`RPC handler "${rpcName}" not found`);
        }

        // Execute handler with source as first argument
        const result = await handler(source, ...args);

        // Send response back to client
        emitNet(global.NextGenConstants.Events.RPC_RESPONSE, source, callId, {
          success: true,
          data: result
        });
      } catch (error) {
        // Send error response
        emitNet(global.NextGenConstants.Events.RPC_RESPONSE, source, callId, {
          success: false,
          error: error.message
        });

        global.NextGenUtils.Log(`RPC error "${rpcName}": ${error.message}`, 'error');
      }
    });

    // Handle RPC responses (for server -> client calls)
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
   * @param {Function} handler - Handler function (source, ...args) => result
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
   * Call an RPC on a client
   * @param {string} rpcName - RPC name
   * @param {number} source - Target player source
   * @param {...*} args - Arguments to pass
   * @returns {Promise<*>}
   */
  async callClient(rpcName, source, ...args) {
    return new Promise((resolve, reject) => {
      const callId = global.NextGenUtils.GenerateId();

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(callId);
        reject(new Error(`RPC call "${rpcName}" to client ${source} timed out`));
      }, this.callTimeout);

      // Store pending call
      this.pendingCalls.set(callId, { resolve, reject, timeout });

      // Send RPC request to client
      emitNet(global.NextGenConstants.Events.RPC_REQUEST, source, callId, rpcName, ...args);
    });
  }

  /**
   * Call an RPC and wait for response from multiple clients
   * @param {string} rpcName
   * @param {number[]} sources - Array of player sources
   * @param {...*} args
   * @returns {Promise<Map<number, *>>} Map of source -> result
   */
  async callClients(rpcName, sources, ...args) {
    const promises = sources.map(async (source) => {
      try {
        const result = await this.callClient(rpcName, source, ...args);
        return { source, success: true, data: result };
      } catch (error) {
        return { source, success: false, error: error.message };
      }
    });

    const results = await Promise.all(promises);
    const resultMap = new Map();

    for (const result of results) {
      resultMap.set(result.source, result.success ? result.data : null);
    }

    return resultMap;
  }

  /**
   * Call an RPC on all connected clients
   * @param {string} rpcName
   * @param {...*} args
   * @returns {Promise<Map<number, *>>}
   */
  async callAllClients(rpcName, ...args) {
    const players = this.framework.getPlayers();
    const sources = Array.from(players.keys());
    return await this.callClients(rpcName, sources, ...args);
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
}

module.exports = RPCModule;
