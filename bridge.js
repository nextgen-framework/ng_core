/**
 * NextGen Kernel - Bridge
 *
 * Include via @ng_core/bridge.js in plugin fxmanifest (shared_scripts).
 * Runs in the plugin's context. Works on both server and client.
 * Safe to include multiple times (idempotent).
 *
 * Auto-detects the kernel resource via ng_kernel_resource convar.
 *
 * Provides:
 *   - global.Framework                        : kernel data (lazy getter, no methods)
 *   - global.Bridge.ready()                   : wait for kernel to be ready
 *   - global.Bridge.expose(target, mappings)  : register FiveM exports for this resource
 *   - global.Bridge.use(resource)             : proxy to another resource's exports
 *   - global.Bridge.module(resource, name)    : proxy to a resource's module methods
 *   - global.Bridge.plugin(resource, name)    : proxy to a resource's plugin methods
 */

if (!global.Bridge) {
    const _kernelResource = GetConvar('ng_kernel_resource', 'ng_core');
    const _resourceName = GetCurrentResourceName();
    const _tag = `[Bridge:${_resourceName}]`;
    let _fw = null;

    // Proxy cache (avoids creating a new Proxy on every call)
    const _cache = new Map();

    Object.defineProperty(global, 'Framework', {
        get() {
            if (!_fw) {
                try {
                    _fw = exports[_kernelResource].GetFramework();
                } catch (e) {
                    console.error(`${_tag} Failed to get Framework: ${e.message}`);
                }
            }
            return _fw;
        },
        configurable: true
    });

    global.Bridge = {
        /**
         * Wait for kernel framework to be ready
         * @returns {Promise<Object>} Framework data (no methods - use Bridge.module() for RPC)
         */
        ready() {
            return new Promise((resolve, reject) => {
                try {
                    if (exports[_kernelResource].IsReady()) {
                        _fw = exports[_kernelResource].GetFramework();
                        resolve(_fw);
                        return;
                    }
                } catch (e) {
                    console.warn(`${_tag} Kernel not available yet, polling...`);
                }

                let attempts = 0;
                const check = () => {
                    try {
                        if (exports[_kernelResource].IsReady()) {
                            _fw = exports[_kernelResource].GetFramework();
                            resolve(_fw);
                            return;
                        }
                    } catch (e) {
                        // Kernel not started yet, keep polling
                    }
                    if (++attempts > 50) {
                        const err = new Error(`${_tag} Kernel (${_kernelResource}) not ready after 5s`);
                        console.error(err.message);
                        reject(err);
                        return;
                    }
                    setTimeout(check, 100);
                };
                check();
            });
        },

        /**
         * Expose instance methods as FiveM exports for this resource
         * @param {Object} target - Instance to proxy
         * @param {Object} mappings - { ExportName: 'method' } or { ExportName: { method, fallback } }
         */
        expose(target, mappings) {
            for (const [exportName, config] of Object.entries(mappings)) {
                const isString = typeof config === 'string';
                const method = isString ? config : config.method;
                const hasFallback = !isString && 'fallback' in config;
                const fallback = hasFallback ? config.fallback : undefined;

                exports(exportName, (...args) => {
                    if (typeof target[method] !== 'function') {
                        if (hasFallback) return fallback;
                        throw new Error(`${_tag} Method ${method} not available`);
                    }
                    return target[method](...args);
                });
            }
        },

        /**
         * Proxy to another resource's FiveM exports
         * @param {string} resourceName - Resource to connect to
         * @returns {Proxy} Callable proxy: Bridge.use('ng_economy').GetBalance(src)
         */
        use(resourceName) {
            const key = `use:${resourceName}`;
            if (!_cache.has(key)) {
                _cache.set(key, new Proxy({}, {
                    get(_, method) {
                        return (...args) => exports[resourceName][method](...args);
                    }
                }));
            }
            return _cache.get(key);
        },

        /**
         * Proxy to a resource's module methods via CallModule export
         * Method runs in the target resource's context (no serialization)
         * @param {string} resourceName - Target resource (e.g. 'ng_core', 'ng_economy')
         * @param {string} moduleName - Module name (e.g. 'chat-commands', 'wallet')
         * @returns {Proxy} Bridge.module('ng_core', 'chat-commands').register(...)
         */
        module(resourceName, moduleName) {
            const key = `mod:${resourceName}:${moduleName}`;
            if (!_cache.has(key)) {
                _cache.set(key, new Proxy({}, {
                    get(_, method) {
                        return (...args) => exports[resourceName].CallModule(moduleName, method, ...args);
                    }
                }));
            }
            return _cache.get(key);
        },

        /**
         * Proxy to a resource's plugin methods via CallPlugin export
         * Method runs in the target resource's context (no serialization)
         * @param {string} resourceName - Target resource (e.g. 'ng_core')
         * @param {string} pluginName - Plugin name (e.g. 'ng_freemode')
         * @returns {Proxy} Bridge.plugin('ng_core', 'ng_freemode').spawnPlayer(src)
         */
        plugin(resourceName, pluginName) {
            const key = `plg:${resourceName}:${pluginName}`;
            if (!_cache.has(key)) {
                _cache.set(key, new Proxy({}, {
                    get(_, method) {
                        return (...args) => exports[resourceName].CallPlugin(pluginName, method, ...args);
                    }
                }));
            }
            return _cache.get(key);
        }
    };
}
