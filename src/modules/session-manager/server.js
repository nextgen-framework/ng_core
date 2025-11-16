/**
 * NextGen Framework - Session Manager Module
 * Manages temporary game sessions/activities (races, missions, heists, etc.)
 */

class SessionManager {
  constructor(framework) {
    this.framework = framework;
    this.logger = null;
    this.instanceManager = null;

    // Session tracking
    this.sessions = new Map(); // sessionId => Session object
    this.playerSessions = new Map(); // source => sessionId

    // Session types
    this.sessionTypes = new Map(); // type => SessionTypeDefinition

    // Configuration
    this.config = {
      maxSessions: 500,
      defaultMaxPlayers: 8,
      autoCleanupInactive: true,
      inactiveTimeout: 300000, // 5 minutes
      sessionTimeout: 3600000 // 1 hour max session duration
    };

    // Register default session types
    this.registerDefaultSessionTypes();
  }

  /**
   * Initialize session manager module
   */
  async init() {
    this.logger = this.framework.getModule('logger');
    this.instanceManager = this.framework.getModule('instance-manager');

    // Handle player drops
    on('playerDropped', () => {
      this.handlePlayerLeft(source);
    });

    this.log('Session manager module initialized', 'info');
  }

  /**
   * Register default session types
   */
  registerDefaultSessionTypes() {
    this.registerSessionType('race', {
      name: 'Race',
      maxPlayers: 16,
      minPlayers: 2,
      useInstance: true,
      allowJoinInProgress: false,
      allowSpectators: true
    });

    this.registerSessionType('mission', {
      name: 'Mission',
      maxPlayers: 4,
      minPlayers: 1,
      useInstance: true,
      allowJoinInProgress: false,
      allowSpectators: false
    });

    this.registerSessionType('heist', {
      name: 'Heist',
      maxPlayers: 4,
      minPlayers: 2,
      useInstance: true,
      allowJoinInProgress: false,
      allowSpectators: false
    });

    this.registerSessionType('deathmatch', {
      name: 'Deathmatch',
      maxPlayers: 32,
      minPlayers: 2,
      useInstance: true,
      allowJoinInProgress: true,
      allowSpectators: true
    });

    this.registerSessionType('activity', {
      name: 'Activity',
      maxPlayers: 8,
      minPlayers: 1,
      useInstance: false,
      allowJoinInProgress: true,
      allowSpectators: false
    });
  }

  /**
   * Register session type
   */
  registerSessionType(type, definition) {
    this.sessionTypes.set(type, {
      type,
      name: definition.name || type,
      maxPlayers: definition.maxPlayers || this.config.defaultMaxPlayers,
      minPlayers: definition.minPlayers || 1,
      useInstance: definition.useInstance !== false,
      allowJoinInProgress: definition.allowJoinInProgress !== false,
      allowSpectators: definition.allowSpectators || false,
      metadata: definition.metadata || {}
    });

    this.log(`Registered session type: ${type}`, 'debug');
  }

  /**
   * Create a new session
   */
  async createSession(type, host, options = {}) {
    if (this.sessions.size >= this.config.maxSessions) {
      return { success: false, reason: 'max_sessions_reached' };
    }

    const sessionType = this.sessionTypes.get(type);
    if (!sessionType) {
      return { success: false, reason: 'invalid_session_type' };
    }

    const sessionId = this.generateSessionId();

    // Create instance if needed
    let instanceId = null;
    if (sessionType.useInstance && this.instanceManager) {
      const instanceResult = await this.instanceManager.createInstance(type, host, {
        sessionId,
        maxPlayers: options.maxPlayers || sessionType.maxPlayers
      });

      if (!instanceResult.success) {
        return instanceResult;
      }

      instanceId = instanceResult.instanceId;
    }

    const session = {
      id: sessionId,
      type,
      host,
      instanceId,
      state: 'waiting', // waiting, active, paused, finished
      players: new Set([host]),
      spectators: new Set(),
      maxPlayers: options.maxPlayers || sessionType.maxPlayers,
      minPlayers: options.minPlayers || sessionType.minPlayers,
      data: options.data || {},
      metadata: options.metadata || {},
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      lastActivity: Date.now()
    };

    this.sessions.set(sessionId, session);
    this.playerSessions.set(host, sessionId);

    // Add host to instance if needed
    if (instanceId && this.instanceManager) {
      await this.instanceManager.addPlayerToInstance(host, instanceId);
    }

    this.log(`Created session: ${sessionId} (type: ${type}, host: ${host})`, 'info');

    // Emit event
    emitNet('ng_core:session-created', host, sessionId, type);

    return { success: true, sessionId, instanceId };
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId, reason = 'ended') {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'session_not_found' };
    }

    // Remove all players
    for (const source of session.players) {
      await this.removePlayerFromSession(source, reason);
    }

    // Remove all spectators
    for (const source of session.spectators) {
      await this.removeSpectatorFromSession(source);
    }

    // Delete instance if exists
    if (session.instanceId && this.instanceManager) {
      await this.instanceManager.deleteInstance(session.instanceId, true);
    }

    this.sessions.delete(sessionId);

    this.log(`Deleted session: ${sessionId} (reason: ${reason})`, 'info');

    return { success: true };
  }

  /**
   * Add player to session
   */
  async addPlayerToSession(source, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'session_not_found' };
    }

    const sessionType = this.sessionTypes.get(session.type);

    // Check if session allows join in progress
    if (session.state === 'active' && !sessionType.allowJoinInProgress) {
      return { success: false, reason: 'session_in_progress' };
    }

    // Check if session is full
    if (session.players.size >= session.maxPlayers) {
      return { success: false, reason: 'session_full' };
    }

    // Remove from current session
    const currentSessionId = this.playerSessions.get(source);
    if (currentSessionId) {
      await this.removePlayerFromSession(source);
    }

    // Add to session
    session.players.add(source);
    this.playerSessions.set(source, sessionId);
    session.lastActivity = Date.now();

    // Add to instance if needed
    if (session.instanceId && this.instanceManager) {
      await this.instanceManager.addPlayerToInstance(source, session.instanceId);
    }

    this.log(`Player ${source} joined session ${sessionId}`, 'debug');

    // Emit event
    emitNet('ng_core:session-joined', source, sessionId, session.type);
    this.broadcastToSession(sessionId, 'ng_core:session-player-joined', source);

    return { success: true };
  }

  /**
   * Remove player from session
   */
  async removePlayerFromSession(source, reason = 'left') {
    const sessionId = this.playerSessions.get(source);
    if (!sessionId) {
      return { success: false, reason: 'not_in_session' };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.playerSessions.delete(source);
      return { success: true };
    }

    session.players.delete(source);
    this.playerSessions.delete(source);

    // Remove from instance
    if (session.instanceId && this.instanceManager) {
      await this.instanceManager.removePlayerFromInstance(source);
    }

    this.log(`Player ${source} left session ${sessionId} (${reason})`, 'debug');

    // Emit event
    emitNet('ng_core:session-left', source, sessionId, reason);
    this.broadcastToSession(sessionId, 'ng_core:session-player-left', source, reason);

    // Check if session should be ended
    if (session.players.size === 0) {
      await this.deleteSession(sessionId, 'no_players');
    } else if (source === session.host) {
      // Transfer host to another player
      const newHost = Array.from(session.players)[0];
      session.host = newHost;
      this.broadcastToSession(sessionId, 'ng_core:session-host-changed', newHost);
    }

    return { success: true };
  }

  /**
   * Add spectator to session
   */
  async addSpectatorToSession(source, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'session_not_found' };
    }

    const sessionType = this.sessionTypes.get(session.type);
    if (!sessionType.allowSpectators) {
      return { success: false, reason: 'spectators_not_allowed' };
    }

    session.spectators.add(source);

    // Add to instance if needed
    if (session.instanceId && this.instanceManager) {
      await this.instanceManager.addPlayerToInstance(source, session.instanceId);
    }

    this.log(`Player ${source} is now spectating session ${sessionId}`, 'debug');

    emitNet('ng_core:session-spectating', source, sessionId);

    return { success: true };
  }

  /**
   * Remove spectator from session
   */
  async removeSpectatorFromSession(source) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.spectators.has(source)) {
        session.spectators.delete(source);

        // Remove from instance
        if (session.instanceId && this.instanceManager) {
          await this.instanceManager.removePlayerFromInstance(source);
        }

        emitNet('ng_core:session-spectating-ended', source, sessionId);
        return { success: true };
      }
    }

    return { success: false, reason: 'not_spectating' };
  }

  /**
   * Start session
   */
  async startSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'session_not_found' };
    }

    if (session.state !== 'waiting') {
      return { success: false, reason: 'session_already_started' };
    }

    if (session.players.size < session.minPlayers) {
      return { success: false, reason: 'not_enough_players' };
    }

    session.state = 'active';
    session.startedAt = Date.now();
    session.lastActivity = Date.now();

    this.log(`Session ${sessionId} started`, 'info');

    this.broadcastToSession(sessionId, 'ng_core:session-started', sessionId);

    return { success: true };
  }

  /**
   * End session
   */
  async endSession(sessionId, results = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'session_not_found' };
    }

    session.state = 'finished';
    session.finishedAt = Date.now();
    session.data.results = results;

    this.log(`Session ${sessionId} ended`, 'info');

    this.broadcastToSession(sessionId, 'ng_core:session-ended', sessionId, results);

    // Auto-delete after a delay
    setTimeout(() => {
      this.deleteSession(sessionId, 'finished');
    }, 30000); // 30 seconds

    return { success: true };
  }

  /**
   * Get session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get player's current session
   */
  getPlayerSession(source) {
    const sessionId = this.playerSessions.get(source);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by type
   */
  getSessionsByType(type) {
    return this.getAllSessions().filter(s => s.type === type);
  }

  /**
   * Broadcast event to session
   */
  broadcastToSession(sessionId, eventName, ...args) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const source of session.players) {
      emitNet(eventName, source, ...args);
    }

    for (const source of session.spectators) {
      emitNet(eventName, source, ...args);
    }
  }

  /**
   * Update session data
   */
  updateSessionData(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'session_not_found' };
    }

    session.data = { ...session.data, ...data };
    session.lastActivity = Date.now();

    return { success: true };
  }

  /**
   * Handle player leaving server
   */
  handlePlayerLeft(source) {
    this.removePlayerFromSession(source, 'disconnected');
    this.removeSpectatorFromSession(source);
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get session statistics
   */
  getStats() {
    const stats = {
      totalSessions: this.sessions.size,
      activeSessions: 0,
      waitingSessions: 0,
      byType: {}
    };

    for (const session of this.sessions.values()) {
      if (session.state === 'active') stats.activeSessions++;
      if (session.state === 'waiting') stats.waitingSessions++;

      if (!stats.byType[session.type]) {
        stats.byType[session.type] = 0;
      }
      stats.byType[session.type]++;
    }

    return stats;
  }

  /**
   * Configure session manager
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this.log('Session manager configuration updated', 'info');
  }

  /**
   * Log helper
   */
  log(message, level = 'info', metadata = {}) {
    if (this.logger) {
      this.logger.log(message, level, metadata);
    } else {
      this.framework.utils.Log(`[Session Manager] ${message}`, level);
    }
  }

  /**
   * Cleanup
   */
  async destroy() {
    // End all sessions
    for (const sessionId of this.sessions.keys()) {
      await this.deleteSession(sessionId, 'shutdown');
    }

    this.sessions.clear();
    this.playerSessions.clear();

    this.log('Session manager module destroyed', 'info');
  }
}

module.exports = SessionManager;
