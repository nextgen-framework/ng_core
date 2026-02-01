/**
 * NextGen Framework - Notifications Module (Client-Side)
 * Production-ready notification system with multiple display methods
 */

class NotificationModule {
  constructor(framework) {
    this.framework = framework;
    this.queue = [];
    this.isProcessing = false;
    this.types = {
      'info': { icon: 'CHAR_DEFAULT', color: 140, iconType: 0 },
      'success': { icon: 'CHAR_DEFAULT', color: 2, iconType: 0 },
      'warning': { icon: 'CHAR_DEFAULT', color: 47, iconType: 0 },
      'error': { icon: 'CHAR_DEFAULT', color: 6, iconType: 0 }
    };
  }

  /**
   * Initialize the notification module
   */
  async init() {
    this.framework.log.info('Notifications Module initialized');

    // Listen to EventBus notifications
    this.framework.eventBus.on('NOTIFICATION', (data) => {
      this.notify(data.message, data.type, data.duration);
    });

    // Register RPC handler for server notifications
    const rpc = this.framework.getModule('rpc');
    if (rpc) {
      rpc.register('notify', (message, type, duration) => {
        this.notify(message, type, duration);
        return true;
      });

      // Register RPC for advanced notifications
      rpc.register('notifyAdvanced', (title, message, type, duration) => {
        this.advanced(title, message, type, duration);
        return true;
      });
    }

    this.framework.log.info('Notifications Module ready');
  }

  /**
   * Show a notification
   * @param {string} message - Message to display
   * @param {string} type - Type: info, success, warning, error
   * @param {number} duration - Duration in ms (default: 5000)
   */
  notify(message, type = 'info', duration = 5000) {
    this.queue.push({ message, type, duration, advanced: false });
    this.processQueue();
  }

  /**
   * Show an advanced notification with title
   * @param {string} title - Notification title
   * @param {string} message - Message to display
   * @param {string} type - Type: info, success, warning, error
   * @param {number} duration - Duration in ms (default: 5000)
   */
  advanced(title, message, type = 'info', duration = 5000) {
    this.queue.push({ title, message, type, duration, advanced: true });
    this.processQueue();
  }

  /**
   * Process notification queue
   */
  processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const notification = this.queue.shift();

    if (notification.advanced) {
      this.showAdvancedNotification(notification);
    } else {
      this.showSimpleNotification(notification);
    }

    // Wait before processing next
    setTimeout(() => {
      this.isProcessing = false;
      this.processQueue();
    }, 500);
  }

  /**
   * Show simple notification (bottom-right)
   */
  showSimpleNotification(notification) {
    const { message, type } = notification;
    const typeConfig = this.types[type] || this.types['info'];

    // Set text entry
    SetNotificationTextEntry('STRING');
    AddTextComponentSubstringPlayerName(message);

    // Set color based on type
    SetNotificationBackgroundColor(typeConfig.color);

    // Draw notification
    DrawNotification(false, true);
  }

  /**
   * Show advanced notification with icon and title
   */
  showAdvancedNotification(notification) {
    const { title, message, type } = notification;
    const typeConfig = this.types[type] || this.types['info'];

    // Begin text command
    BeginTextCommandThefeedPost('STRING');
    AddTextComponentSubstringPlayerName(message);

    // Set notification message with icon
    EndTextCommandThefeedPostMessagetext(
      typeConfig.icon,
      typeConfig.icon,
      false,
      typeConfig.iconType,
      title,
      `~${this.getColorCode(type)}~${message}`
    );

    // Draw notification
    EndTextCommandThefeedPostTicker(false, true);
  }

  /**
   * Get color code for type
   */
  getColorCode(type) {
    const colors = {
      'info': 'b',
      'success': 'g',
      'warning': 'y',
      'error': 'r'
    };
    return colors[type] || 'w';
  }

  /**
   * Convenience methods
   */
  info(message, duration) {
    this.notify(message, 'info', duration);
  }

  success(message, duration) {
    this.notify(message, 'success', duration);
  }

  warning(message, duration) {
    this.notify(message, 'warning', duration);
  }

  error(message, duration) {
    this.notify(message, 'error', duration);
  }

  /**
   * Show help text (top-left)
   */
  help(message, duration = 5000) {
    BeginTextCommandDisplayHelp('STRING');
    AddTextComponentSubstringPlayerName(message);
    EndTextCommandDisplayHelp(0, false, true, duration);
  }

  /**
   * Show subtitle (bottom-center)
   */
  subtitle(message, duration = 5000) {
    BeginTextCommandPrint('STRING');
    AddTextComponentSubstringPlayerName(message);
    EndTextCommandPrint(duration, true);
  }

  /**
   * Cleanup
   */
  async destroy() {
    this.framework.log.info('Notifications Module destroyed');
    this.queue = [];
  }
}

// Export for client-side
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationModule;
}

// Export to global scope for framework (FiveM client environment)
global.NgModule_notifications = NotificationModule;

// Self-register
global.Framework.register('notifications', new NotificationModule(global.Framework), 15);
