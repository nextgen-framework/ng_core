/**
 * NextGen Kernel - Bridge
 *
 * Include via @ng_core/src/bridge.js in plugin fxmanifest (shared_scripts).
 * Runs in the plugin's isolated context. Uses exports for cross-resource access.
 * Safe to include multiple times (idempotent).
 *
 * Provides:
 *   - global.Framework                          : kernel data (via export, serialized)
 *   - global.ng_core.ready()                    : wait for kernel to be ready
 *   - global.ng_core.<ExportName>(...)          : direct call to kernel exports (auto-proxy)
 *   - global.ng_core.expose(target, mappings)   : register FiveM exports for this resource
 *   - global.ng_core.use(resource)              : proxy to another resource's exports
 *   - global.ng_core.module(resource, name)     : proxy to a resource's module methods
 *   - global.ng_core.plugin(resource, name)     : proxy to a resource's plugin methods
 */

const _kernelResource = GetConvar('ng_kernel_resource', 'ng_core');

if (!global[_kernelResource]) {
    const _resourceName = GetCurrentResourceName();
    const _tag = `[${_kernelResource}:${_resourceName}]`;
    let _fw = null;

    // Proxy cache
    const _cache = new Map();

    // Framework getter via exports (cross-resource, serialized)
    Object.defineProperty(global, 'Framework', {
        get() {
            if (!_fw) {
                try {
                    _fw = exports[_kernelResource].GetFramework();
                } catch (e) {
                    // Kernel not available yet
                }
            }
            return _fw;
        },
        configurable: true
    });

    // Bridge methods (priority over export proxy)
    const _bridge = {
        /**
         * Wait for kernel framework to be ready
         * @returns {Promise<Object>} Framework instance
         */
        ready() {
            return new Promise((resolve, reject) => {
                // Fast path: already ready
                try {
                    if (exports[_kernelResource].IsReady()) {
                        _fw = exports[_kernelResource].GetFramework();
                        resolve(_fw);
                        return;
                    }
                } catch (e) {
                    // Kernel not available yet
                }

                // Poll via exports
                let attempts = 0;
                const check = () => {
                    try {
                        if (exports[_kernelResource].IsReady()) {
                            _fw = exports[_kernelResource].GetFramework();
                            resolve(_fw);
                            return;
                        }
                    } catch (e) {
                        // Kernel not available yet
                    }
                    if (++attempts > 100) {
                        const err = new Error(`${_tag} Kernel (${_kernelResource}) not ready after 10s`);
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
         * @returns {Proxy} Callable proxy: ng_core.use('ng_economy').GetBalance(src)
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
         * @param {string} resourceName - Target resource
         * @param {string} moduleName - Module name
         * @returns {Proxy} ng_core.module('ng_core', 'chat-commands').register(...)
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
         * @param {string} resourceName - Target resource
         * @param {string} pluginName - Plugin name
         * @returns {Proxy} ng_core.plugin('ng_core', 'ng_freemode').spawnPlayer(src)
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

    // Proxy: bridge methods first, then fall through to kernel exports
    // ng_core.ready()          → bridge method
    // ng_core.RegisterRPC(...) → exports.ng_core.RegisterRPC(...)
    global[_kernelResource] = new Proxy(_bridge, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return (...args) => exports[_kernelResource][prop](...args);
        }
    });

    console.log(`${_tag} Bridge ready`);
}
