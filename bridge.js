/**
 * NextGen Kernel - Bridge
 *
 * Include via @ng_core/bridge/main.js in plugin fxmanifest (shared_scripts).
 * Runs in the plugin's context. Works on both server and client.
 * Safe to include multiple times (idempotent).
 *
 * Auto-detects the kernel resource via ng_kernel_resource convar.
 *
 * Provides:
 *   - global.Framework             : kernel framework instance (lazy getter)
 *   - global.Bridge.ready()        : wait for kernel to be ready (returns Promise<Framework>)
 *   - global.Bridge.expose(target, mappings) : register FiveM exports for this resource
 *   - global.Bridge.use(resource)  : proxy to another resource's exports
 */

if (!global.Bridge) {
    const _kernelResource = GetConvar('ng_kernel_resource', 'ng_core');
    let _fw = null;

    Object.defineProperty(global, 'Framework', {
        get() {
            if (!_fw) {
                try { _fw = exports[_kernelResource].GetFramework(); } catch (e) {}
            }
            return _fw;
        },
        configurable: true
    });

    global.Bridge = {
        /**
         * Wait for kernel framework to be ready
         * @returns {Promise<Object>} Framework instance
         */
        ready() {
            return new Promise((resolve, reject) => {
                try {
                    if (exports[_kernelResource].IsReady()) {
                        _fw = exports[_kernelResource].GetFramework();
                        resolve(_fw);
                        return;
                    }
                } catch (e) {}

                let attempts = 0;
                const check = () => {
                    try {
                        if (exports[_kernelResource].IsReady()) {
                            _fw = exports[_kernelResource].GetFramework();
                            resolve(_fw);
                            return;
                        }
                    } catch (e) {}
                    if (++attempts > 50) {
                        reject(new Error(`Kernel (${_kernelResource}) not ready after 5s`));
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
                        throw new Error(`Method ${method} not available`);
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
            return new Proxy({}, {
                get(_, method) {
                    return (...args) => exports[resourceName][method](...args);
                }
            });
        }
    };
}
