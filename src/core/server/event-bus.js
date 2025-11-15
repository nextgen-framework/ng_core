/**
 * NextGen Framework - Event Bus
 * Generic event system for framework and plugins
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.onceListeners = new Map();
  }

  /**
   * Register an event listener
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);

    // Return unsubscribe function
    return () => this.off(eventName, callback);
  }

  /**
   * Register a one-time event listener
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  once(eventName, callback) {
    if (!this.onceListeners.has(eventName)) {
      this.onceListeners.set(eventName, []);
    }
    this.onceListeners.get(eventName).push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.onceListeners.get(eventName);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Remove an event listener
   * @param {string} eventName
   * @param {Function} callback
   */
  off(eventName, callback) {
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Remove all listeners for an event (or all events if no name specified)
   * @param {string} [eventName]
   */
  removeAllListeners(eventName) {
    if (eventName) {
      this.listeners.delete(eventName);
      this.onceListeners.delete(eventName);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Emit an event (async)
   * @param {string} eventName
   * @param {...*} args
   */
  async emit(eventName, ...args) {
    // Handle regular listeners
    const listeners = this.listeners.get(eventName) || [];
    for (const callback of listeners) {
      try {
        await callback(...args);
      } catch (error) {
        global.NextGenUtils.Log(`Event listener error for "${eventName}": ${error.message}`, 'error');
      }
    }

    // Handle once listeners
    const onceListeners = this.onceListeners.get(eventName) || [];
    for (const callback of onceListeners) {
      try {
        await callback(...args);
      } catch (error) {
        global.NextGenUtils.Log(`Event once listener error for "${eventName}": ${error.message}`, 'error');
      }
    }

    // Clear once listeners after execution
    if (onceListeners.length > 0) {
      this.onceListeners.delete(eventName);
    }
  }

  /**
   * Emit event synchronously (without waiting for promises)
   * @param {string} eventName
   * @param {...*} args
   */
  emitSync(eventName, ...args) {
    // Handle regular listeners
    const listeners = this.listeners.get(eventName) || [];
    for (const callback of listeners) {
      try {
        callback(...args);
      } catch (error) {
        global.NextGenUtils.Log(`Event listener error for "${eventName}": ${error.message}`, 'error');
      }
    }

    // Handle once listeners
    const onceListeners = this.onceListeners.get(eventName) || [];
    for (const callback of onceListeners) {
      try {
        callback(...args);
      } catch (error) {
        global.NextGenUtils.Log(`Event once listener error for "${eventName}": ${error.message}`, 'error');
      }
    }

    // Clear once listeners after execution
    if (onceListeners.length > 0) {
      this.onceListeners.delete(eventName);
    }
  }

  /**
   * Get listener count for an event
   * @param {string} eventName
   * @returns {number}
   */
  listenerCount(eventName) {
    const regular = this.listeners.get(eventName)?.length || 0;
    const once = this.onceListeners.get(eventName)?.length || 0;
    return regular + once;
  }

  /**
   * Get all event names
   * @returns {string[]}
   */
  eventNames() {
    const names = new Set([
      ...this.listeners.keys(),
      ...this.onceListeners.keys()
    ]);
    return Array.from(names);
  }
}

module.exports = EventBus;
