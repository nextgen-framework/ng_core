/**
 * NextGen Framework - Shared Utilities
 * Runs on both Server and Client
 */

/**
 * Check if running on server
 * @returns {boolean}
 */
function IsServer() {
  return IsDuplicityVersion();
}

/**
 * Check if running on client
 * @returns {boolean}
 */
function IsClient() {
  return !IsDuplicityVersion();
}

/**
 * Safe JSON parse
 * @param {string} str
 * @param {*} defaultValue
 * @returns {*}
 */
function SafeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Deep clone object
 * @param {*} obj
 * @returns {*}
 */
function DeepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Generate unique ID
 * @returns {string}
 */
function GenerateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Delay/Sleep function
 * @param {number} ms
 * @returns {Promise<void>}
 */
function Delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
function Debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 * @param {Function} func
 * @param {number} limit
 * @returns {Function}
 */
function Throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Log - delegates to kernel Framework.log
 * Backward compat: this.framework.utils.Log('msg', 'info')
 * @param {string} message
 * @param {string} level
 * @param {Object} [metadata]
 */
function Log(message, level = 'info', metadata = undefined) {
    const log = global.Framework?.log;
    if (log && typeof log[level] === 'function') {
        log[level](message, metadata);
    } else if (log && typeof log.info === 'function') {
        log.info(message, metadata);
    } else {
        console.log(`[${level.toUpperCase()}] ${message}`);
    }
}

// Available via global.NGCore.Utils / global.NextGenUtils / Framework.utils

// Make available globally
global.NGCore = global.NGCore || {};
global.NGCore.Utils = {
    IsServer,
    IsClient,
    SafeJsonParse,
    DeepClone,
    GenerateId,
    Delay,
    Debounce,
    Throttle,
    Log
};

// Legacy support
global.NextGenUtils = global.NGCore.Utils;

// Register as service + backward compat direct access
if (global.Framework) {
    global.Framework.register('utils', global.NGCore.Utils);
    global.Framework.utils = global.NGCore.Utils;
}
