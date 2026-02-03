/**
 * NextGen Framework - HUD Module (Client)
 * Generic HUD framework with pluggable components rendered via native GTA
 *
 * ng_core provides the engine — ng_freemode registers actual components
 * (health, armor, money, minimap, etc.)
 */

class HudManager {
    constructor(framework) {
        this.framework = framework;

        // Registered components: name => { renderFn, data, visible, order }
        this.components = new Map();

        // Global HUD visibility
        this.visible = true;

        // Render thread
        this.renderThread = null;
    }

    /**
     * Initialize HUD module
     */
    async init() {
        this._startRender();
        this.framework.log.info('HUD module initialized');
    }

    // ================================
    // Public API
    // ================================

    /**
     * Register a HUD component
     * @param {string} name - Unique component name
     * @param {Function} renderFn - Function called each frame: renderFn(data)
     * @param {Object} [options]
     * @param {number} [options.order=100] - Render order (lower = first)
     * @param {boolean} [options.visible=true] - Initial visibility
     * @param {Object} [options.data={}] - Initial data
     */
    registerComponent(name, renderFn, options = {}) {
        if (typeof renderFn !== 'function') {
            this.framework.log.error(`HUD component "${name}": renderFn must be a function`);
            return;
        }

        this.components.set(name, {
            renderFn,
            data: options.data || {},
            visible: options.visible !== false,
            order: options.order || 100
        });

        this.framework.log.debug(`HUD component registered: ${name}`);
    }

    /**
     * Unregister a HUD component
     * @param {string} name
     */
    unregisterComponent(name) {
        this.components.delete(name);
    }

    /**
     * Update data for a component
     * @param {string} name
     * @param {Object} data - Merged with existing data
     */
    updateComponent(name, data) {
        const component = this.components.get(name);
        if (!component) return;

        component.data = { ...component.data, ...data };
    }

    /**
     * Set full data for a component (replaces existing)
     * @param {string} name
     * @param {Object} data
     */
    setComponentData(name, data) {
        const component = this.components.get(name);
        if (!component) return;

        component.data = data;
    }

    /**
     * Show a specific component
     * @param {string} name
     */
    showComponent(name) {
        const component = this.components.get(name);
        if (component) component.visible = true;
    }

    /**
     * Hide a specific component
     * @param {string} name
     */
    hideComponent(name) {
        const component = this.components.get(name);
        if (component) component.visible = false;
    }

    /**
     * Toggle a specific component
     * @param {string} name
     * @returns {boolean} New visibility state
     */
    toggleComponent(name) {
        const component = this.components.get(name);
        if (!component) return false;

        component.visible = !component.visible;
        return component.visible;
    }

    /**
     * Show all HUD components
     */
    showAll() {
        this.visible = true;
    }

    /**
     * Hide all HUD components
     */
    hideAll() {
        this.visible = false;
    }

    /**
     * Toggle global HUD visibility
     * @returns {boolean} New visibility state
     */
    toggleAll() {
        this.visible = !this.visible;
        return this.visible;
    }

    /**
     * Check if HUD is visible
     * @returns {boolean}
     */
    isVisible() {
        return this.visible;
    }

    /**
     * Check if a component is visible
     * @param {string} name
     * @returns {boolean}
     */
    isComponentVisible(name) {
        const component = this.components.get(name);
        return component ? component.visible && this.visible : false;
    }

    /**
     * Get registered component names
     * @returns {string[]}
     */
    getComponentNames() {
        return [...this.components.keys()];
    }

    // ================================
    // Render
    // ================================

    _startRender() {
        if (this.renderThread) return;

        this.renderThread = setTick(() => {
            this._render();
        });
    }

    /**
     * Main render loop — calls each visible component's renderFn
     */
    _render() {
        if (!this.visible) return;
        if (this.components.size === 0) return;

        // Sort by order and render
        const sorted = [...this.components.values()]
            .filter(c => c.visible)
            .sort((a, b) => a.order - b.order);

        for (const component of sorted) {
            try {
                component.renderFn(component.data);
            } catch (error) {
                // Silently skip failed renders to avoid spamming console each frame
            }
        }
    }

    /**
     * Cleanup
     */
    async destroy() {
        if (this.renderThread) {
            clearTick(this.renderThread);
            this.renderThread = null;
        }
        this.components.clear();
        this.framework.log.info('HUD module destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HudManager;
}

// Self-register
global.Framework.register('hud', new HudManager(global.Framework), 15);
