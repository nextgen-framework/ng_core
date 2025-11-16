/**
 * NextGen Framework - Session Manager (Client)
 * Client-side session handling
 */

class SessionManagerClient {
  constructor(framework) {
    this.framework = framework;
    this.currentSession = null;
    this.isSpectating = false;
  }

  /**
   * Initialize session manager client
   */
  init() {
    // Listen for session events
    onNet('ng_core:session-created', this.onSessionCreated.bind(this));
    onNet('ng_core:session-joined', this.onSessionJoined.bind(this));
    onNet('ng_core:session-left', this.onSessionLeft.bind(this));
    onNet('ng_core:session-started', this.onSessionStarted.bind(this));
    onNet('ng_core:session-ended', this.onSessionEnded.bind(this));
    onNet('ng_core:session-player-joined', this.onPlayerJoined.bind(this));
    onNet('ng_core:session-player-left', this.onPlayerLeft.bind(this));
    onNet('ng_core:session-host-changed', this.onHostChanged.bind(this));
    onNet('ng_core:session-spectating', this.onSpectating.bind(this));
    onNet('ng_core:session-spectating-ended', this.onSpectatingEnded.bind(this));

    console.log('[Session Manager] Client initialized');
  }

  /**
   * Handle session created
   */
  onSessionCreated(sessionId, type) {
    this.currentSession = { id: sessionId, type, isHost: true, state: 'waiting' };
    console.log(`[Session Manager] Created session: ${sessionId} (${type})`);

    // Notify UI
    if (this.framework.getModule('notifications')) {
      this.framework.getModule('notifications').show({
        type: 'success',
        message: `Session created`,
        duration: 3000
      });
    }
  }

  /**
   * Handle session joined
   */
  onSessionJoined(sessionId, type) {
    this.currentSession = { id: sessionId, type, isHost: false, state: 'waiting' };
    console.log(`[Session Manager] Joined session: ${sessionId} (${type})`);

    if (this.framework.getModule('notifications')) {
      this.framework.getModule('notifications').show({
        type: 'info',
        message: `Joined ${type} session`,
        duration: 3000
      });
    }
  }

  /**
   * Handle session left
   */
  onSessionLeft(sessionId, reason) {
    if (this.currentSession && this.currentSession.id === sessionId) {
      console.log(`[Session Manager] Left session: ${sessionId} (${reason})`);
      this.currentSession = null;

      if (this.framework.getModule('notifications')) {
        this.framework.getModule('notifications').show({
          type: 'info',
          message: `Left session: ${reason}`,
          duration: 3000
        });
      }
    }
  }

  /**
   * Handle session started
   */
  onSessionStarted(sessionId) {
    if (this.currentSession && this.currentSession.id === sessionId) {
      this.currentSession.state = 'active';
      console.log(`[Session Manager] Session started: ${sessionId}`);

      if (this.framework.getModule('notifications')) {
        this.framework.getModule('notifications').show({
          type: 'success',
          message: 'Session started!',
          duration: 3000
        });
      }
    }
  }

  /**
   * Handle session ended
   */
  onSessionEnded(sessionId, results) {
    if (this.currentSession && this.currentSession.id === sessionId) {
      this.currentSession.state = 'finished';
      console.log(`[Session Manager] Session ended: ${sessionId}`, results);

      if (this.framework.getModule('notifications')) {
        this.framework.getModule('notifications').show({
          type: 'info',
          message: 'Session ended',
          duration: 5000
        });
      }

      // Clear session after delay
      setTimeout(() => {
        this.currentSession = null;
      }, 5000);
    }
  }

  /**
   * Handle player joined session
   */
  onPlayerJoined(source) {
    console.log(`[Session Manager] Player ${source} joined session`);
  }

  /**
   * Handle player left session
   */
  onPlayerLeft(source, reason) {
    console.log(`[Session Manager] Player ${source} left session (${reason})`);
  }

  /**
   * Handle host changed
   */
  onHostChanged(newHost) {
    if (this.currentSession) {
      const playerId = PlayerId();
      this.currentSession.isHost = (GetPlayerServerId(playerId) === newHost);
      console.log(`[Session Manager] Host changed to ${newHost}`);
    }
  }

  /**
   * Handle spectating started
   */
  onSpectating(sessionId) {
    this.isSpectating = true;
    console.log(`[Session Manager] Spectating session: ${sessionId}`);
  }

  /**
   * Handle spectating ended
   */
  onSpectatingEnded(sessionId) {
    this.isSpectating = false;
    console.log(`[Session Manager] Stopped spectating session: ${sessionId}`);
  }

  /**
   * Get current session
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Check if in session
   */
  isInSession() {
    return this.currentSession !== null;
  }

  /**
   * Check if session host
   */
  isSessionHost() {
    return this.currentSession && this.currentSession.isHost;
  }

  /**
   * Check if spectating
   */
  isSpectatingSession() {
    return this.isSpectating;
  }

  /**
   * Request to create session
   */
  createSession(type, options) {
    emitNet('ng_core:session-create', type, options);
  }

  /**
   * Request to join session
   */
  joinSession(sessionId) {
    emitNet('ng_core:session-join', sessionId);
  }

  /**
   * Request to leave session
   */
  leaveSession() {
    if (this.currentSession) {
      emitNet('ng_core:session-leave');
    }
  }

  /**
   * Request to start session (host only)
   */
  startSession() {
    if (this.currentSession && this.currentSession.isHost) {
      emitNet('ng_core:session-start');
    }
  }
}

// Export for framework
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManagerClient;
}
