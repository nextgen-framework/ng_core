/**
 * NextGen Framework - Server Entry Point
 * Ultra-Generic & Dynamic Framework
 */

// Display banner FIRST - before anything else
console.log('');
console.log(' /$$   /$$                       /$$      /$$$$$$                       ');
console.log('| $$$ | $$                      | $$     /$$__  $$                      ');
console.log('| $$$$| $$  /$$$$$$  /$$   /$$ /$$$$$$  | $$  \\__/  /$$$$$$  /$$$$$$$ ');
console.log('| $$ $$ $$ /$$__  $$|  $$ /$$/|_  $$_/  | $$ /$$$$ /$$__  $$| $$__  $$');
console.log('| $$  $$$$| $$$$$$$$ \\  $$$$/   | $$    | $$|_  $$| $$$$$$$$| $$  \\ $$');
console.log('| $$\\  $$$| $$_____/  >$$  $$   | $$ /$$| $$  \\ $$| $$_____/| $$  | $$');
console.log('| $$ \\  $$|  $$$$$$$ /$$/\\  $$  |  $$$$/|  $$$$$$/|  $$$$$$$| $$  | $$');
console.log('|__/  \\__/ \\_______/|__/  \\__/   \\___/   \\______/  \\_______/|__/  |__/');
console.log('');
console.log('                                v1.0.0 (Server)');
console.log('                        Ultra-Generic & Dynamic');
console.log('');

const path = require('path');
const resourcePath = GetResourcePath(GetCurrentResourceName());
const NextGenFramework = require(path.join(resourcePath, 'src/core/server/framework.js'));

// Track initialization state
let frameworkReady = false;

// Create global framework instance
global.Framework = new NextGenFramework();

// Initialize framework
setImmediate(async () => {
  try {
    await global.Framework.init();

    // Mark as ready
    frameworkReady = true;
  } catch (error) {
    console.error('[NextGen] FATAL: Framework failed to initialize:', error);
  }
});

// Export framework getter
exports('GetFramework', () => {
  if (!global.Framework) {
    console.warn('[NextGen Core] Framework not yet initialized, returning null');
    return null;
  }
  return global.Framework;
});

// Export to check if framework is ready
exports('IsReady', () => {
  return frameworkReady;
});

// Export to get a specific module
exports('GetModule', (moduleName) => {
  if (!global.Framework) {
    return null;
  }
  return global.Framework.getModule(moduleName);
});

// Export helper: Register a chat command
exports('RegisterCommand', (name, callback, options) => {
  if (!global.Framework) {
    throw new Error('Framework not ready');
  }
  const chatCommands = global.Framework.getModule('chat-commands');
  if (!chatCommands) {
    throw new Error('chat-commands module not loaded');
  }
  return chatCommands.register(name, callback, options);
});

// Export helper: Send a chat message
exports('SendMessage', (source, message, color) => {
  if (!global.Framework) {
    return;
  }
  const chatCommands = global.Framework.getModule('chat-commands');
  if (!chatCommands) {
    return;
  }
  return chatCommands.sendMessage(source, message, color);
});

// Export helper: Broadcast a message to all players
exports('BroadcastMessage', (message, color) => {
  if (!global.Framework) {
    return;
  }
  const chatCommands = global.Framework.getModule('chat-commands');
  if (!chatCommands) {
    return;
  }
  return chatCommands.broadcast(message, color);
});

// Export plugin registration for external resources
exports('RegisterPlugin', async (pluginName, pluginInstance) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  return await global.Framework.pluginLoader.register(pluginName, pluginInstance);
});

// Export plugin loading from resource
exports('LoadPluginFromResource', async (resourceName, options) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  return await global.Framework.pluginLoader.loadFromResource(resourceName, options);
});

// Queue Management Exports
exports('Queue_RegisterType', (typeName, priority, reservedSlots = 0, displayName = null) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return queueModule.registerQueueType(typeName, priority, reservedSlots, displayName);
});

exports('Queue_UnregisterType', (typeName) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return queueModule.unregisterQueueType(typeName);
});

exports('Queue_SetPlayerType', async (identifier, queueType, reason = null, setBy = 'system') => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return await queueModule.setQueueType(identifier, queueType, reason, setBy);
});

exports('Queue_SetPlayerPriority', async (identifier, priority, reason = null, setBy = 'system') => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return await queueModule.setPriority(identifier, priority, reason, setBy);
});

exports('Queue_RemovePlayer', async (identifier) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return await queueModule.removePriority(identifier);
});

exports('Queue_GetInfo', () => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return queueModule.getInfo();
});

// Dynamic Queue Assignment Exports (temporary, in-memory only)
exports('Queue_SetDynamicPriority', (identifier, priority, queueType = null) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return queueModule.setDynamicPriority(identifier, priority, queueType);
});

exports('Queue_SetDynamicType', (identifier, queueType) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return queueModule.setDynamicQueueType(identifier, queueType);
});

exports('Queue_RemoveDynamic', (identifier) => {
  if (!global.Framework) {
    throw new Error('Framework not initialized yet');
  }
  const queueModule = global.Framework.getModule('queue');
  if (!queueModule) {
    throw new Error('Queue module not available');
  }
  return queueModule.removeDynamicAssignment(identifier);
});

// Global convenience access
global.NextGen = global.Framework;
