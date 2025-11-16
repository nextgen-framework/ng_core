/**
 * NextGen Framework - Instance Manager (Client)
 * Client-side instance handling
 */

class InstanceManagerClient {
  constructor(framework) {
    this.framework = framework;
    this.currentInstance = null;
    this.pendingInvites = [];
  }

  /**
   * Initialize instance manager client
   */
  init() {
    // Listen for instance events
    onNet('ng_core:instance-joined', this.onInstanceJoined.bind(this));
    onNet('ng_core:instance-left', this.onInstanceLeft.bind(this));
    onNet('ng_core:instance-invite', this.onInstanceInvite.bind(this));

    console.log('[Instance Manager] Client initialized');
  }

  /**
   * Handle instance joined
   */
  onInstanceJoined(instanceId, instanceType) {
    this.currentInstance = { id: instanceId, type: instanceType };

    // Show notification
    if (this.framework.getModule('notifications')) {
      this.framework.getModule('notifications').show({
        type: 'info',
        message: `Joined ${instanceType} instance`,
        duration: 3000
      });
    }

    console.log(`[Instance Manager] Joined instance: ${instanceId} (${instanceType})`);
  }

  /**
   * Handle instance left
   */
  onInstanceLeft(instanceId) {
    if (this.currentInstance && this.currentInstance.id === instanceId) {
      const type = this.currentInstance.type;
      this.currentInstance = null;

      // Show notification
      if (this.framework.getModule('notifications')) {
        this.framework.getModule('notifications').show({
          type: 'info',
          message: `Left ${type} instance`,
          duration: 3000
        });
      }

      console.log(`[Instance Manager] Left instance: ${instanceId}`);
    }
  }

  /**
   * Handle instance invitation
   */
  onInstanceInvite(instanceId, instanceType, metadata) {
    const invite = {
      instanceId,
      instanceType,
      metadata,
      receivedAt: Date.now()
    };

    this.pendingInvites.push(invite);

    // Show notification with accept/decline options
    if (this.framework.getModule('notifications')) {
      this.framework.getModule('notifications').show({
        type: 'info',
        message: `Instance invitation: ${instanceType}`,
        duration: 10000,
        actions: [
          {
            label: 'Accept',
            action: () => this.acceptInvite(instanceId)
          },
          {
            label: 'Decline',
            action: () => this.declineInvite(instanceId)
          }
        ]
      });
    }

    console.log(`[Instance Manager] Received invite to instance: ${instanceId}`);
  }

  /**
   * Accept instance invitation
   */
  acceptInvite(instanceId) {
    emitNet('ng_core:instance-accept-invite', instanceId);

    // Remove from pending
    this.pendingInvites = this.pendingInvites.filter(i => i.instanceId !== instanceId);
  }

  /**
   * Decline instance invitation
   */
  declineInvite(instanceId) {
    emitNet('ng_core:instance-decline-invite', instanceId);

    // Remove from pending
    this.pendingInvites = this.pendingInvites.filter(i => i.instanceId !== instanceId);
  }

  /**
   * Request to join instance
   */
  requestJoin(instanceId) {
    emitNet('ng_core:instance-request-join', instanceId);
  }

  /**
   * Request to leave current instance
   */
  requestLeave() {
    if (this.currentInstance) {
      emitNet('ng_core:instance-request-leave');
    }
  }

  /**
   * Get current instance
   */
  getCurrentInstance() {
    return this.currentInstance;
  }

  /**
   * Check if in instance
   */
  isInInstance() {
    return this.currentInstance !== null;
  }

  /**
   * Get pending invites
   */
  getPendingInvites() {
    return this.pendingInvites;
  }
}

// Export for framework
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InstanceManagerClient;
}
