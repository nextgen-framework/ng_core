/**
 * NextGen Framework - Session Manager (Client)
 * Client-side session handling
 */

class SessionManagerClient {
  constructor(framework) {
    this.framework = framework;
    this.currentSession = null;
    this.isSpectating = false;

    // Pre-registered at script load time (cerulean)
    this.netEvents = [
      'ng_core:session-created', 'ng_core:session-joined', 'ng_core:session-left',
      'ng_core:session-started', 'ng_core:session-ended',
      'ng_core:session-player-joined', 'ng_core:session-player-left',
      'ng_core:session-host-changed', 'ng_core:session-spectating', 'ng_core:session-spectating-ended'
    ];
  }

  /**
   * Initialize session manager client
   */
  init() {
    // Listen for session events
    this.framework.onNet('ng_core:session-created', this.onSessionCreated.bind(this));
    this.framework.onNet('ng_core:session-joined', this.onSessionJoined.bind(this));
    this.framework.onNet('ng_core:session-left', this.onSessionLeft.bind(this));
    this.framework.onNet('ng_core:session-started', this.onSessionStarted.bind(this));
    this.framework.onNet('ng_core:session-ended', this.onSessionEnded.bind(this));
    this.framework.onNet('ng_core:session-player-joined', this.onPlayerJoined.bind(this));
    this.framework.onNet('ng_core:session-player-left', this.onPlayerLeft.bind(this));
    this.framework.onNet('ng_core:session-host-changed', this.onHostChanged.bind(this));
    this.framework.onNet('ng_core:session-spectating', this.onSpectating.bind(this));
    this.framework.onNet('ng_core:session-spectating-ended', this.onSpectatingEnded.bind(this));

    this.framework.log.debug('[Session Manager] Client initialized');
  }

  /**
   * Handle session created
   */
  onSessionCreated(sessionId, type) {
    this.currentSession = { id: sessionId, type, isHost: true, state: 'waiting' };
    this.framework.log.debug(`[Session Manager] Created session: ${sessionId} (${type})`);

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
    this.framework.log.debug(`[Session Manager] Joined session: ${sessionId} (${type})`);

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
      this.framework.log.debug(`[Session Manager] Left session: ${sessionId} (${reason})`);
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
      this.framework.log.debug(`[Session Manager] Session started: ${sessionId}`);

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
      this.framework.log.debug(`[Session Manager] Session ended: ${sessionId}`, results);

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
    this.framework.log.debug(`[Session Manager] Player ${source} joined session`);
  }

  /**
   * Handle player left session
   */
  onPlayerLeft(source, reason) {
    this.framework.log.debug(`[Session Manager] Player ${source} left session (${reason})`);
  }

  /**
   * Handle host changed
   */
  onHostChanged(newHost) {
    if (this.currentSession) {
      const playerId = PlayerId();
      this.currentSession.isHost = (GetPlayerServerId(playerId) === newHost);
      this.framework.log.debug(`[Session Manager] Host changed to ${newHost}`);
    }
  }

  /**
   * Handle spectating started
   */
  onSpectating(sessionId) {
    this.isSpectating = true;
    this.framework.log.debug(`[Session Manager] Spectating session: ${sessionId}`);
  }

  /**
   * Handle spectating ended
   */
  onSpectatingEnded(sessionId) {
    this.isSpectating = false;
    this.framework.log.debug(`[Session Manager] Stopped spectating session: ${sessionId}`);
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
    this.framework.fivem.emitNet('ng_core:session-create', type, options);
  }

  /**
   * Request to join session
   */
  joinSession(sessionId) {
    this.framework.fivem.emitNet('ng_core:session-join', sessionId);
  }

  /**
   * Request to leave session
   */
  leaveSession() {
    if (this.currentSession) {
      this.framework.fivem.emitNet('ng_core:session-leave');
    }
  }

  /**
   * Request to start session (host only)
   */
  startSession() {
    if (this.currentSession && this.currentSession.isHost) {
      this.framework.fivem.emitNet('ng_core:session-start');
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManagerClient;
}

// Self-register
global.Framework.register('session-manager', new SessionManagerClient(global.Framework), 12);
