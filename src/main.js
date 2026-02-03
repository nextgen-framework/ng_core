/**
 * NextGen Resource Base - Kernel
 * Minimal module system with priority loading and event system.
 * No gameplay logic. No DB.
 *
 * Event naming convention:
 *   Events: namespace/action        → 'player/spawned', 'economy/transfer'
 *   Hooks:  prefix:namespace/action  → 'before:player/save', 'after:player/save'
 */

// Capture FiveM natives (safe references, no scoping issues)
const _on = on;
const _onNet = onNet;
const _emit = emit;
const _emitNet = emitNet;
const _registerNetEvent = RegisterNetEvent;

class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event or hook
     * @param {string} event - Event name (e.g. 'player/spawned' or 'before:player/save')
     * @param {Function} callback
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
        return () => this.off(event, callback);
    }

    /**
     * Subscribe once - auto-unsubscribe after first call
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} Unsubscribe function (if needed before trigger)
     */
    once(event, callback) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            return callback(...args);
        };
        return this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event or hook
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        const list = this._listeners.get(event);
        if (!list) return;
        const idx = list.indexOf(callback);
        if (idx !== -1) list.splice(idx, 1);
    }

    /**
     * Fire and forget - notify all listeners (return values ignored)
     * @param {string} event - Event name (e.g. 'player/spawned')
     * @param {...*} args
     */
    emit(event, ...args) {
        const list = this._listeners.get(event);
        if (!list) return;
        for (const cb of list) {
            try {
                cb(...args);
            } catch (err) {
                console.log(`[Events] ERROR on "${event}": ${err.message}`);
            }
        }
    }

    /**
     * Pipeline - each handler receives the result of the previous one
     * @param {string} event - Hook name (e.g. 'before:player/save')
     * @param {*} data - Initial data
     * @returns {Promise<*>} Modified data
     */
    async pipe(event, data) {
        const list = this._listeners.get(event);
        if (!list) return data;
        let result = data;
        for (const cb of list) {
            try {
                const val = await cb(result);
                if (val !== undefined) result = val;
            } catch (err) {
                console.log(`[Events] ERROR on "${event}": ${err.message}`);
            }
        }
        return result;
    }

    /**
     * Remove all listeners
     */
    clear() {
        this._listeners.clear();
    }
}

// ─── Logger (kernel-level) ──────────────────────────────────────────────────────

const LOG_LEVELS = {
    trace: 0, debug: 1, info: 2, success: 2, warn: 3, error: 4, fatal: 5
};

const LOG_COLORS = {
    trace: '\x1b[90m', debug: '\x1b[36m', info: '\x1b[34m', success: '\x1b[32m',
    warn: '\x1b[33m', error: '\x1b[31m', fatal: '\x1b[35m',
    reset: '\x1b[0m', dim: '\x1b[90m'
};

let _logLevel = 'info';
try { _logLevel = GetConvar('ngcore_log_level', 'info'); } catch (e) {}

const _logHooks = [];

// ─── ModuleRegistry ─────────────────────────────────────────────────────────────

class ModuleRegistry {
    constructor() {
        this._modules = new Map();
        this._queue = [];
        this._ready = false;
        this.events = new EventBus();
        this.eventBus = this.events;

        // FiveM native event wrappers (uses captured references)
        const netHandlers = new Map();
        this.fivem = {
            onNet(event, handler, priority = 10) {
                if (!netHandlers.has(event)) {
                    netHandlers.set(event, []);
                    _registerNetEvent(event);
                    _onNet(event, (...args) => {
                        for (const h of netHandlers.get(event)) {
                            try { h.fn(...args); } catch (err) {
                                console.log(`[Kernel] ERROR on net "${event}": ${err.message}`);
                            }
                        }
                    });
                }
                const list = netHandlers.get(event);
                list.push({ fn: handler, priority });
                list.sort((a, b) => a.priority - b.priority);
            },
            emitNet(...args) { _emitNet(...args); },
            on(...args) { _on(...args); },
            emit(...args) { _emit(...args); }
        };

        // Shortcuts: framework.onNet() → framework.fivem.onNet()
        this.onNet = this.fivem.onNet;
        this.emitNet = this.fivem.emitNet;

        // Logger
        this._initLogger();
    }

    // ─── Logger ─────────────────────────────────────────────────────────────

    _initLogger() {
        const _write = (message, level, metadata) => {
            const numLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
            const minLevel = LOG_LEVELS[_logLevel] ?? LOG_LEVELS.info;
            if (numLevel < minLevel) return;

            const resource = GetCurrentResourceName();
            const time = new Date().toISOString().substring(11, 19);
            const color = LOG_COLORS[level] || LOG_COLORS.info;
            const tag = level.toUpperCase().padEnd(7);

            let output = `${LOG_COLORS.dim}[${time}]${LOG_COLORS.reset} ${LOG_COLORS.dim}[${resource}]${LOG_COLORS.reset} ${color}${tag}${LOG_COLORS.reset} ${message}`;
            if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
                output += ` ${JSON.stringify(metadata)}`;
            }
            console.log(output);

            if (_logHooks.length > 0) {
                const entry = { message, level, resource, timestamp: Date.now(), metadata };
                for (const hook of _logHooks) {
                    try { hook(entry); } catch (e) {}
                }
            }
        };

        /** @type {Object} Logger with convenience methods per level */
        this.log = {
            trace:   (msg, meta) => _write(msg, 'trace', meta),
            debug:   (msg, meta) => _write(msg, 'debug', meta),
            info:    (msg, meta) => _write(msg, 'info', meta),
            success: (msg, meta) => _write(msg, 'success', meta),
            warn:    (msg, meta) => _write(msg, 'warn', meta),
            error:   (msg, meta) => _write(msg, 'error', meta),
            fatal:   (msg, meta) => _write(msg, 'fatal', meta),
            addHook: (fn) => { if (typeof fn === 'function') _logHooks.push(fn); },
            setLevel: (level) => { if (LOG_LEVELS[level] !== undefined) _logLevel = level; }
        };
    }

    /**
     * Register a module or service
     * - With init(): queued for priority loading
     * - Without init(): stored immediately (config, utils, etc.)
     * @param {string} name - Unique name
     * @param {*} instance - Module instance or plain value/object
     * @param {number} [priority=10] - Load priority (0 = first, 20 = last)
     */
    register(name, instance, priority = 10) {
        if (this._modules.has(name)) {
            console.log(`[Kernel] "${name}" already registered, skipping`);
            return;
        }

        // Pre-register net events for cerulean (synchronous, at script load time)
        if (Array.isArray(instance.netEvents)) {
            for (const event of instance.netEvents) {
                _registerNetEvent(event);
            }
        }

        if (typeof instance?.init === 'function') {
            this._queue.push({ name, instance, priority });
        } else {
            this._modules.set(name, instance);
        }
    }

    /**
     * Get a module by name
     * @param {string} name
     * @returns {Object|null}
     */
    getModule(name) {
        return this._modules.get(name) || null;
    }

    /**
     * Load all modules by ascending priority
     */
    async init() {
        if (this._ready) return;
        this._queue.sort((a, b) => a.priority - b.priority);

        for (const entry of this._queue) {
            try {
                if (typeof entry.instance.init === 'function') {
                    await entry.instance.init();
                }
                this._modules.set(entry.name, entry.instance);
                console.log(`[Kernel] Module "${entry.name}" loaded (priority ${entry.priority})`);
            } catch (err) {
                console.log(`[Kernel] ERROR loading module "${entry.name}": ${err.message}`);
            }
        }

        this._queue = [];
        this._ready = true;
        console.log(`[Kernel] Ready (${this._modules.size} modules)`);
    }

    /**
     * Destroy all modules in reverse order
     */
    async destroy() {
        if (!this._ready) return;
        const modules = [...this._modules.entries()].reverse();

        for (const [name, instance] of modules) {
            try {
                if (typeof instance.destroy === 'function') {
                    await instance.destroy();
                }
                console.log(`[Kernel] Module "${name}" destroyed`);
            } catch (err) {
                console.log(`[Kernel] ERROR destroying module "${name}": ${err.message}`);
            }
        }

        this._modules.clear();
        this.events.clear();
        this._ready = false;
    }

    /**
     * @returns {boolean}
     */
    isReady() {
        return this._ready;
    }

    /**
     * @returns {string[]} List of loaded modules
     */
    list() {
        return [...this._modules.keys()];
    }

    /**
     * Expose module methods as FiveM exports (bridge pattern)
     * @param {string} moduleName - Module to proxy
     * @param {Object} mappings - { ExportName: 'method' } or { ExportName: { method, fallback } }
     */
    expose(moduleName, mappings) {
        for (const [exportName, config] of Object.entries(mappings)) {
            const isString = typeof config === 'string';
            const method = isString ? config : config.method;
            const hasFallback = !isString && 'fallback' in config;
            const fallback = hasFallback ? config.fallback : undefined;

            exports(exportName, (...args) => {
                const mod = this.getModule(moduleName);
                if (!mod) {
                    if (hasFallback) return fallback;
                    throw new Error(`${moduleName} module not loaded`);
                }
                return mod[method](...args);
            });
        }
    }

}

// Global instance
const Framework = new ModuleRegistry();
global.Framework = Framework;

/**
 * Cross-resource export proxy factory
 * @param {string} resource - Resource name to proxy
 * @returns {Proxy} Callable proxy: Use('ng_core').RegisterRPC(...)
 */
global.Use = function(resource) {
    return new Proxy({}, {
        get(_, prop) {
            return (...args) => exports[resource][prop](...args);
        }
    });
};

// Auto-start: wait for all scripts to register() then init
setImmediate(() => Framework.init());

// Automatic cleanup on resource stop
on('onResourceStop', async (resourceName) => {
    if (resourceName !== GetCurrentResourceName()) return;
    await Framework.destroy();
});

// FiveM exports
exports('GetFramework', () => Framework);
exports('IsReady', () => Framework.isReady());
const _version = GetResourceMetadata(GetCurrentResourceName(), 'version', 0) || '0.0.0';
exports('GetVersion', () => _version);
exports('GetModule', (name) => Framework.getModule(name));
exports('GetModuleList', () => Framework.list());

// Generic cross-resource method proxies (server only — not declared in client_exports)
if (typeof IsDuplicityVersion === 'function') {
    exports('CallModule', (moduleName, method, ...args) => {
        const mod = Framework.getModule(moduleName);
        if (!mod) throw new Error(`Module "${moduleName}" not loaded`);
        if (typeof mod[method] !== 'function') throw new Error(`Module "${moduleName}" has no method "${method}"`);
        return mod[method](...args);
    });
    exports('CallPlugin', (pluginName, method, ...args) => {
        const pm = Framework.getModule('plugin-manager');
        if (!pm) throw new Error('Plugin-manager module not loaded');
        const plugin = pm.plugins?.get(pluginName);
        if (!plugin) throw new Error(`Plugin "${pluginName}" not loaded`);
        if (typeof plugin[method] !== 'function') throw new Error(`Plugin "${pluginName}" has no method "${method}"`);
        return plugin[method](...args);
    });
}
