/**
 * Connection Manager - Client Side
 * Handles loading screen updates and shutdown
 */

let hasShutdown = false;
let hasReceivedSpawnedStage = false;

// Failsafe timeout - force shutdown after 60 seconds to prevent connection timeout
setTimeout(() => {
  if (!hasShutdown) {
    global.Framework.log.debug('[Loading Screen] Failsafe timeout reached, forcing shutdown');
    hasShutdown = true;
    ShutdownLoadingScreen();
    ShutdownLoadingScreenNui();
  }
}, 60000); // 60 seconds

// Listen for loading progress updates from server (network event)
global.Framework.fivem.onNet('ng:loading:updateProgress', (progress, stage, message) => {
  global.Framework.log.debug(`[Loading Screen] Received stage update: ${stage} - ${message}`);

  // Send to NUI
  SendNUIMessage({
    type: 'ng:loading:stage',
    progress: progress,
    stage: stage || 'loading',
    message: message
  });

  // Check if we received the spawned stage
  if (stage === 'spawned' && !hasReceivedSpawnedStage) {
    hasReceivedSpawnedStage = true;
    global.Framework.log.debug('[Loading Screen] Received spawned stage, shutting down...');

    if (!hasShutdown) {
      hasShutdown = true;
      global.Framework.log.debug('[Loading Screen] Shutting down loading screen');
      ShutdownLoadingScreen();
    ShutdownLoadingScreenNui();
    }
  }
});

// Fallback: Listen for playerSpawned event
on('playerSpawned', () => {
  if (!hasShutdown) {
    hasShutdown = true;
    global.Framework.log.debug('[Loading Screen] Player spawned (fallback), shutting down loading screen');
    ShutdownLoadingScreen();
    ShutdownLoadingScreenNui();
  }
});

global.Framework.log.debug('[Connection Manager] Client initialized - listening for loading events');
