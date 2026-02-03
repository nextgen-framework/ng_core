/**
 * NextGen Framework - Hardcap Module (Client)
 * Signals server when player session is fully started
 */

// Wait for session to start, then notify server
setImmediate(() => {
  const checkSessionStarted = setInterval(() => {
    if (NetworkIsSessionStarted()) {
      // Session started, notify server
      global.Framework.fivem.emitNet('hardcap:playerActivated');
      clearInterval(checkSessionStarted);
      global.Framework.log.debug('[Hardcap] Player session activated');
    }
  }, 100);
});
