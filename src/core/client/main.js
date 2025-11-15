/**
 * NextGen Framework - Client Entry Point
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
console.log('                                v1.0.0 (Client)');
console.log('                        Ultra-Generic & Dynamic');
console.log('');

// Track initialization state
let frameworkReady = false;

// Create global framework instance
global.Framework = new global.ClientNextGenFramework();

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

// Global convenience access
global.NextGen = global.Framework;
