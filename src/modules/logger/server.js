/**
 * NextGen Framework - Logger Module
 * Unified logging system with multiple outputs (console, file, database, Discord)
 */

class Logger {
  constructor(framework) {
    this.framework = framework;
    this.db = null; // Will be set after database module loads
    this.config = {
      level: 'info', // trace, debug, info, warn, error, fatal
      outputs: ['console'], // console, file, database, discord
      fileOutput: null,
      databaseOutput: true,
      discordWebhook: null,
      timezone: 'UTC',
      includeTimestamp: true,
      includeLevel: true,
      colorize: true
    };

    // Log levels
    this.levels = {
      trace: 0,
      debug: 1,
      info: 2,
      success: 2,
      warn: 3,
      error: 4,
      fatal: 5
    };

    // Console colors
    this.colors = {
      trace: '\x1b[90m',    // Gray
      debug: '\x1b[36m',    // Cyan
      info: '\x1b[34m',     // Blue
      success: '\x1b[32m',  // Green
      warn: '\x1b[33m',     // Yellow
      error: '\x1b[31m',    // Red
      fatal: '\x1b[35m',    // Magenta
      reset: '\x1b[0m'
    };

    // Log buffer for database batch inserts
    this.logBuffer = [];
    this.bufferSize = 50;
    this.flushInterval = 30000; // 30 seconds
  }

  /**
   * Initialize logger module
   */
  async init() {
    // Get database module if available
    this.db = this.framework.database;

    // Start buffer flush timer if database output enabled
    if (this.config.databaseOutput && this.db) {
      setInterval(() => this.flushLogBuffer(), this.flushInterval);
    }

    this.log('Logger module initialized', 'info');
  }

  /**
   * Main logging function
   */
  log(message, level = 'info', metadata = {}) {
    const currentLevel = this.levels[level] || this.levels.info;
    const configLevel = this.levels[this.config.level] || this.levels.info;

    // Check if this log level should be displayed
    if (currentLevel < configLevel) {
      return;
    }

    const logEntry = {
      message,
      level,
      timestamp: new Date(),
      metadata,
      resource: GetCurrentResourceName()
    };

    // Output to configured destinations
    if (this.config.outputs.includes('console')) {
      this.outputConsole(logEntry);
    }

    if (this.config.outputs.includes('database') && this.db) {
      this.outputDatabase(logEntry);
    }

    if (this.config.outputs.includes('discord') && this.config.discordWebhook) {
      this.outputDiscord(logEntry);
    }
  }

  /**
   * Convenience methods
   */
  trace(message, metadata = {}) {
    this.log(message, 'trace', metadata);
  }

  debug(message, metadata = {}) {
    this.log(message, 'debug', metadata);
  }

  info(message, metadata = {}) {
    this.log(message, 'info', metadata);
  }

  success(message, metadata = {}) {
    this.log(message, 'success', metadata);
  }

  warn(message, metadata = {}) {
    this.log(message, 'warn', metadata);
  }

  error(message, metadata = {}) {
    this.log(message, 'error', metadata);
  }

  fatal(message, metadata = {}) {
    this.log(message, 'fatal', metadata);
  }

  /**
   * Output to console
   */
  outputConsole(logEntry) {
    const { message, level, timestamp, metadata, resource } = logEntry;

    let output = '';

    // Timestamp
    if (this.config.includeTimestamp) {
      const time = timestamp.toISOString().substring(11, 19);
      output += `\x1b[90m[${time}]\x1b[0m `;
    }

    // Resource
    output += `\x1b[90m[${resource}]\x1b[0m `;

    // Level
    if (this.config.includeLevel) {
      const color = this.colors[level] || this.colors.info;
      const levelStr = level.toUpperCase().padEnd(7);
      output += this.config.colorize ? `${color}${levelStr}${this.colors.reset} ` : `${levelStr} `;
    }

    // Message
    output += message;

    // Metadata (if any)
    if (Object.keys(metadata).length > 0) {
      output += ` ${JSON.stringify(metadata)}`;
    }

    console.log(output);
  }

  /**
   * Output to database (buffered)
   */
  outputDatabase(logEntry) {
    this.logBuffer.push(logEntry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.bufferSize) {
      this.flushLogBuffer();
    }
  }

  /**
   * Flush log buffer to database
   */
  async flushLogBuffer() {
    if (this.logBuffer.length === 0) return;
    if (!this.db) return;

    const logs = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const collection = this.db.collection('logs');

      await collection.insertMany(logs.map(log => ({
        level: log.level,
        message: log.message,
        resource: log.resource,
        metadata: log.metadata,
        timestamp: log.timestamp.getTime()
      })));
    } catch (error) {
      console.error(`[Logger] Failed to flush logs: ${error.message}`);
    }
  }

  /**
   * Output to Discord webhook
   */
  async outputDiscord(logEntry) {
    const { message, level, timestamp, metadata, resource } = logEntry;

    // Only send important logs to Discord (warn, error, fatal)
    if (this.levels[level] < this.levels.warn) {
      return;
    }

    const colors = {
      warn: 16776960,  // Yellow
      error: 16711680, // Red
      fatal: 8388736   // Dark red
    };

    const embed = {
      title: `[${level.toUpperCase()}] ${resource}`,
      description: message,
      color: colors[level] || colors.error,
      timestamp: timestamp.toISOString(),
      fields: []
    };

    // Add metadata as fields
    if (Object.keys(metadata).length > 0) {
      for (const [key, value] of Object.entries(metadata)) {
        embed.fields.push({
          name: key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          inline: true
        });
      }
    }

    try {
      await fetch(this.config.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });
    } catch (error) {
      console.error(`[Logger] Failed to send Discord log: ${error.message}`);
    }
  }

  /**
   * Query logs from database
   */
  async getLogs(options = {}) {
    if (!this.db) return [];

    const {
      level = null,
      resource = null,
      since = null,
      until = null,
      limit = 100,
      offset = 0
    } = options;

    const collection = this.db.collection('logs');
    const query = {};

    if (level) query.level = level;
    if (resource) query.resource = resource;
    if (since) query.timestamp = { $gte: since };
    if (until) {
      query.timestamp = query.timestamp || {};
      query.timestamp.$lte = until;
    }

    return await collection.find(query, {
      sort: { _created_at: -1 },
      limit,
      offset
    });
  }

  /**
   * Clear old logs from database
   */
  async clearOldLogs(daysToKeep = 30) {
    if (!this.db) return 0;

    const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const collection = this.db.collection('logs');

    const deleted = await collection.delete({ timestamp: { $lt: cutoffDate } });
    return deleted;
  }

  /**
   * Configure logger
   */
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set log level
   */
  setLevel(level) {
    this.config.level = level;
  }

  /**
   * Enable/disable output
   */
  enableOutput(output) {
    if (!this.config.outputs.includes(output)) {
      this.config.outputs.push(output);
    }
  }

  disableOutput(output) {
    this.config.outputs = this.config.outputs.filter(o => o !== output);
  }

  /**
   * Cleanup on destroy
   */
  async destroy() {
    // Flush remaining logs
    await this.flushLogBuffer();
  }
}

module.exports = Logger;
