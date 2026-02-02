/**
 * NextGen Framework - Logger Module
 * Adds persistent log outputs on top of the kernel logger.
 * DB persistence (oxmysql, buffered) + Discord webhook (queued, rate-limited).
 *
 * Console output is handled by the kernel (_initLogger in main.js).
 * This module hooks into it via framework.log.addHook().
 */

// GTA color codes regex (^0-^9, ^r, ^b, ^n, ^f)
const COLOR_CODE_RE = /\^([0-9]|r|b|f|n)/g;

class Logger {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        this.config = {
            databaseOutput: true,
            discordWebhook: null,
            discordMinLevel: 'warn',
            retentionDays: 30
        };

        // Level values for Discord filtering
        this.levels = {
            trace: 0, debug: 1, info: 2, success: 2,
            warn: 3, error: 4, fatal: 5
        };

        // DB buffer
        this.logBuffer = [];
        this.maxBufferSize = 5000;  // Cap to prevent RAM explosion if DB is down
        this.maxBatchSize = 100;    // Max rows per INSERT
        this.flushInterval = 10000; // 10 seconds
        this.flushTimer = null;
        this._flushing = false;     // Lock against concurrent flushes

        // Discord queue (rate-limited)
        this._discordQueue = [];
        this._discordMaxQueue = 50;       // Max queued embeds
        this._discordInterval = 2000;     // 2s between sends (safe for Discord API)
        this._discordTimer = null;

        // Discord embed colors
        this.discordColors = {
            warn: 16776960,   // Yellow
            error: 16711680,  // Red
            fatal: 8388736    // Dark magenta
        };
    }

    /**
     * Initialize logger module
     */
    async init() {
        this.db = this.framework.getModule('database');

        // Hook into kernel logger
        this.framework.log.addHook((entry) => this._onLog(entry));

        // Start periodic DB flush
        if (this.config.databaseOutput && this.db && this.db.isConnected()) {
            this.flushTimer = setInterval(() => this._flushBuffer(), this.flushInterval);

            // Auto-cleanup old logs on startup
            this.clearOldLogs(this.config.retentionDays);
        }

        // Start Discord queue processor
        this._discordTimer = setInterval(() => this._processDiscordQueue(), this._discordInterval);

        this.framework.log.info('Logger module initialized (DB + Discord sinks)');
    }

    // ================================
    // Helpers
    // ================================

    /**
     * Strip GTA color codes from string
     * @param {string} str
     * @returns {string}
     */
    _stripColors(str) {
        if (typeof str !== 'string') return str;
        return str.replace(COLOR_CODE_RE, '');
    }

    /**
     * Safe JSON.stringify (handles circular refs, huge objects)
     * @param {*} obj
     * @returns {string}
     */
    _safeStringify(obj) {
        if (!obj || typeof obj !== 'object') return '{}';
        try {
            return JSON.stringify(obj);
        } catch (e) {
            return '{"_error":"circular_or_invalid"}';
        }
    }

    // ================================
    // Kernel hook handler
    // ================================

    /**
     * Handle log entry from kernel
     * @param {Object} entry - { message, level, resource, timestamp, metadata }
     */
    _onLog(entry) {
        // Clean entry for persistence (strip GTA color codes)
        const cleanEntry = {
            level: entry.level,
            message: this._stripColors(entry.message),
            resource: entry.resource,
            timestamp: entry.timestamp || Date.now(),
            metadata: entry.metadata
        };

        // DB output
        if (this.config.databaseOutput && this.db) {
            if (this.logBuffer.length < this.maxBufferSize) {
                this.logBuffer.push(cleanEntry);
            }
            // Trigger immediate flush only when buffer is very large
            if (this.logBuffer.length >= this.maxBatchSize * 2) {
                this._flushBuffer();
            }
        }

        // Discord output (push to queue)
        if (this.config.discordWebhook) {
            const entryLevel = this.levels[entry.level] ?? 0;
            const minLevel = this.levels[this.config.discordMinLevel] ?? this.levels.warn;
            if (entryLevel >= minLevel) {
                if (this._discordQueue.length >= this._discordMaxQueue) {
                    this._discordQueue.shift(); // Drop oldest if queue full
                }
                this._discordQueue.push(cleanEntry);
            }
        }
    }

    // ================================
    // Database persistence
    // ================================

    /**
     * Flush log buffer to MySQL via oxmysql (batch INSERT, locked)
     */
    async _flushBuffer() {
        if (this._flushing) return;
        if (this.logBuffer.length === 0) return;
        if (!this.db || !this.db.isConnected()) return;

        this._flushing = true;

        // Take a chunk (max batch size)
        const chunk = this.logBuffer.slice(0, this.maxBatchSize);

        try {
            const placeholders = chunk.map(() => '(?, ?, ?, ?, FROM_UNIXTIME(? / 1000))').join(', ');
            const params = [];

            for (const log of chunk) {
                params.push(
                    log.level,
                    log.message,
                    log.resource || null,
                    this._safeStringify(log.metadata),
                    log.timestamp
                );
            }

            await this.db.execute(
                `INSERT INTO server_logs (level, message, resource, metadata, created_at) VALUES ${placeholders}`,
                params
            );

            // Only remove from buffer after successful insert
            this.logBuffer.splice(0, chunk.length);
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
                // Keep buffer, wait for DB reconnection
            } else {
                // Drop bad batch to prevent infinite retry loop
                this.logBuffer.splice(0, chunk.length);
                console.error(`[Logger] DB flush failed (batch dropped): ${error.message}`);
            }
        } finally {
            this._flushing = false;
        }
    }

    /**
     * Query logs from database
     * @param {Object} options - { level?, resource?, since?, until?, limit?, offset? }
     * @returns {Promise<Array>}
     */
    async getLogs(options = {}) {
        if (!this.db || !this.db.isConnected()) return [];

        const { level, resource, since, until, limit = 100, offset = 0 } = options;

        let query = 'SELECT id, level, message, resource, metadata, created_at FROM server_logs WHERE 1=1';
        const params = [];

        if (level) {
            query += ' AND level = ?';
            params.push(level);
        }
        if (resource) {
            query += ' AND resource = ?';
            params.push(resource);
        }
        if (since) {
            query += ' AND created_at >= ?';
            params.push(since);
        }
        if (until) {
            query += ' AND created_at <= ?';
            params.push(until);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        return await this.db.query(query, params);
    }

    /**
     * Delete logs older than N days
     * @param {number} daysToKeep - Days to retain (default 30)
     * @returns {Promise<number>} Deleted count
     */
    async clearOldLogs(daysToKeep = 30) {
        if (!this.db || !this.db.isConnected()) return 0;

        try {
            const result = await this.db.execute(
                'DELETE FROM server_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
                [daysToKeep]
            );
            return result?.affectedRows || 0;
        } catch (error) {
            console.error(`[Logger] Cleanup failed: ${error.message}`);
            return 0;
        }
    }

    // ================================
    // Discord webhook (queued)
    // ================================

    /**
     * Process one Discord entry from queue (called on interval)
     */
    async _processDiscordQueue() {
        if (this._discordQueue.length === 0) return;
        if (!this.config.discordWebhook) return;

        const entry = this._discordQueue.shift();
        await this._sendDiscord(entry);
    }

    /**
     * Send log entry to Discord webhook
     * @param {Object} entry - Cleaned log entry
     */
    async _sendDiscord(entry) {
        // Truncate message to Discord API limit (4096 chars for description)
        let description = entry.message;
        if (description.length > 4000) {
            description = description.slice(0, 4000) + '... [truncated]';
        }

        const embed = {
            title: `[${entry.level.toUpperCase()}] ${entry.resource || 'server'}`,
            description,
            color: this.discordColors[entry.level] || this.discordColors.error,
            timestamp: new Date(entry.timestamp).toISOString(),
            fields: []
        };

        // Add metadata as embed fields (max 10 fields, values truncated at 1000 chars)
        const metadata = entry.metadata;
        if (metadata && typeof metadata === 'object') {
            const keys = Object.keys(metadata);
            for (let i = 0; i < keys.length && i < 10; i++) {
                const key = keys[i];
                const raw = metadata[key];
                let value = typeof raw === 'object' ? this._safeStringify(raw) : String(raw);
                if (value.length > 1000) {
                    value = value.slice(0, 1000) + '...';
                }
                embed.fields.push({ name: key, value, inline: true });
            }
        }

        try {
            await fetch(this.config.discordWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] })
            });
        } catch (error) {
            // Don't re-log to avoid infinite loop
            console.error(`[Logger] Discord send failed: ${error.message}`);
        }
    }

    // ================================
    // Configuration
    // ================================

    /**
     * Update logger configuration
     * @param {Object} config - { databaseOutput?, discordWebhook?, discordMinLevel?, retentionDays?, level? }
     */
    configure(config) {
        if (config.databaseOutput !== undefined) {
            this.config.databaseOutput = config.databaseOutput;
        }
        if (config.discordWebhook !== undefined) {
            this.config.discordWebhook = config.discordWebhook;
        }
        if (config.discordMinLevel !== undefined) {
            this.config.discordMinLevel = config.discordMinLevel;
        }
        if (config.retentionDays !== undefined) {
            this.config.retentionDays = config.retentionDays;
        }

        // Delegate log level to kernel
        if (config.level) {
            this.framework.log.setLevel(config.level);
        }
    }

    /**
     * Set kernel log level
     * @param {string} level - trace, debug, info, warn, error, fatal
     */
    setLevel(level) {
        this.framework.log.setLevel(level);
    }

    // ================================
    // Cleanup
    // ================================

    /**
     * Cleanup: stop timers, flush remaining buffer
     */
    async destroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        if (this._discordTimer) {
            clearInterval(this._discordTimer);
            this._discordTimer = null;
        }
        this._discordQueue = [];
        await this._flushBuffer();
    }
}

module.exports = Logger;

// Self-register (priority 1: right after database at 0)
global.Framework.register('logger', new Logger(global.Framework), 1);
