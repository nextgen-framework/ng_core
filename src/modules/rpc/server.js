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
    this.framework.log.info('RPC module initialized');
  }

  /**
   * Register internal RPC event handlers
   */
  registerEventHandlers() {
    // Handle RPC requests from clients
    this.framework.onNet(global.NextGenConstants.Events.RPC_REQUEST, async (callId, rpcName, ...args) => {
      // Capture source immediately - magic global can change during async
      const src = source;

      try {
        const handler = this.handlers.get(rpcName);
        if (!handler) {
          throw new Error(`RPC handler "${rpcName}" not found`);
        }

        const result = await handler(src, ...args);

        this.framework.fivem.emitNet(global.NextGenConstants.Events.RPC_RESPONSE, src, callId, {
          success: true,
          data: result
        });
      } catch (error) {
        // Log full error server-side, send generic message to client
        this.framework.log.error(`RPC error "${rpcName}" (source: ${src}): ${error.message}`);

        this.framework.fivem.emitNet(global.NextGenConstants.Events.RPC_RESPONSE, src, callId, {
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Cleanup pending calls when player disconnects
    this.framework.fivem.on('playerDropped', () => {
      const src = source;
      this.cleanupPlayer(src);
    });

    // Handle RPC responses (for server -> client calls)
    this.framework.onNet(global.NextGenConstants.Events.RPC_RESPONSE, (callId, response) => {
      const src = source;
      const pending = this.pendingCalls.get(callId);
      if (!pending) return;

      // Anti-spoofing: verify response comes from the expected client
      if (pending.targetSource !== src) {
        this.framework.log.warn(`RPC response spoofing attempt: expected source ${pending.targetSource}, got ${src}`);
        return;
      }

      clearTimeout(pending.timeout);

      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error));
      }

      this.pendingCalls.delete(callId);
    });
  }

  /**
   * Cleanup pending calls for a disconnected player
   * @param {number} playerSource
   */
  cleanupPlayer(playerSource) {
    for (const [callId, pending] of this.pendingCalls) {
      if (pending.targetSource === playerSource) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Player ${playerSource} disconnected`));
        this.pendingCalls.delete(callId);
      }
    }
  }

  /**
   * Register an RPC handler
   * @param {string} name - RPC name
   * @param {Function} handler - Handler function (source, ...args) => result
   */
  register(name, handler) {
    if (this.handlers.has(name)) {
      this.framework.log.warn(`RPC handler "${name}" already exists, overwriting`);
    }

    this.handlers.set(name, handler);
    this.framework.log.info(`Registered RPC: ${name}`);
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

      // Store pending call with target source for anti-spoofing
      this.pendingCalls.set(callId, { resolve, reject, timeout, targetSource: source });

      // Send RPC request to client
      this.framework.fivem.emitNet(global.NextGenConstants.Events.RPC_REQUEST, source, callId, rpcName, ...args);
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
    const playerManager = this.framework.getModule('player-manager');
    const players = playerManager ? playerManager.players : new Map();
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

  /**
   * Cleanup method
   */
  async destroy() {
    // Reject all pending calls
    for (const [callId, pending] of this.pendingCalls) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('RPC module destroyed'));
    }

    this.pendingCalls.clear();
    this.handlers.clear();
  }
}

module.exports = RPCModule;

// Self-register
global.Framework.register('rpc', new RPCModule(global.Framework), 5);
