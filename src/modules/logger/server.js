/**
 * NextGen Framework - Logger Module
 * Adds persistent log outputs on top of the kernel logger.
 * DB persistence (oxmysql, buffered) + Discord webhook (warn+).
 *
 * Console output is handled by the kernel (_initLogger in main.js).
 * This module hooks into it via framework.log.addHook().
 */

class Logger {
    constructor(framework) {
        this.framework = framework;
        this.db = null;

        this.config = {
            databaseOutput: true,
            discordWebhook: null,
            discordMinLevel: 'warn'
        };

        // Level values for Discord filtering
        this.levels = {
            trace: 0, debug: 1, info: 2, success: 2,
            warn: 3, error: 4, fatal: 5
        };

        // DB buffer
        this.logBuffer = [];
        this.bufferSize = 50;
        this.flushInterval = 30000; // 30 seconds
        this.flushTimer = null;

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

        // Start periodic flush if DB is available
        if (this.config.databaseOutput && this.db && this.db.isConnected()) {
            this.flushTimer = setInterval(() => this._flushBuffer(), this.flushInterval);
        }

        this.framework.log.info('Logger module initialized (DB + Discord sinks)');
    }

    // ================================
    // Kernel hook handler
    // ================================

    /**
     * Handle log entry from kernel
     * @param {Object} entry - { message, level, resource, timestamp, metadata }
     */
    _onLog(entry) {
        // DB output
        if (this.config.databaseOutput && this.db) {
            this.logBuffer.push(entry);
            if (this.logBuffer.length >= this.bufferSize) {
                this._flushBuffer();
            }
        }

        // Discord output
        if (this.config.discordWebhook) {
            const entryLevel = this.levels[entry.level] ?? 0;
            const minLevel = this.levels[this.config.discordMinLevel] ?? this.levels.warn;
            if (entryLevel >= minLevel) {
                this._sendDiscord(entry);
            }
        }
    }

    // ================================
    // Database persistence
    // ================================

    /**
     * Flush log buffer to MySQL via oxmysql
     */
    async _flushBuffer() {
        if (this.logBuffer.length === 0) return;
        if (!this.db || !this.db.isConnected()) return;

        const logs = [...this.logBuffer];
        this.logBuffer = [];

        try {
            const placeholders = logs.map(() => '(?, ?, ?, ?, FROM_UNIXTIME(? / 1000))').join(', ');
            const params = [];

            for (const log of logs) {
                let meta = '{}';
                try { meta = JSON.stringify(log.metadata || {}); } catch (e) { /* circular */ }

                params.push(
                    log.level,
                    log.message,
                    log.resource || null,
                    meta,
                    log.timestamp
                );
            }

            await this.db.execute(
                `INSERT INTO server_logs (level, message, resource, metadata, created_at) VALUES ${placeholders}`,
                params
            );
        } catch (error) {
            // Use console.error directly to avoid infinite loop
            console.error(`[Logger] Failed to flush logs to DB: ${error.message}`);
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

        const result = await this.db.execute(
            'DELETE FROM server_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [daysToKeep]
        );
        return result?.affectedRows || 0;
    }

    // ================================
    // Discord webhook
    // ================================

    /**
     * Send log entry to Discord webhook
     * @param {Object} entry - Log entry from kernel hook
     */
    async _sendDiscord(entry) {
        const embed = {
            title: `[${entry.level.toUpperCase()}] ${entry.resource}`,
            description: entry.message,
            color: this.discordColors[entry.level] || this.discordColors.error,
            timestamp: new Date(entry.timestamp).toISOString(),
            fields: []
        };

        // Add metadata as embed fields
        const metadata = entry.metadata;
        if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
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

    // ================================
    // Configuration
    // ================================

    /**
     * Update logger configuration
     * @param {Object} config - { databaseOutput?, discordWebhook?, discordMinLevel?, level? }
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
     * Cleanup: flush remaining buffer
     */
    async destroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this._flushBuffer();
    }
}

module.exports = Logger;

// Self-register (priority 1: right after database at 0)
global.Framework.register('logger', new Logger(global.Framework), 1);
