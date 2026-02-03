/**
 * NextGen Framework - Menu Module (Client)
 * Native GTA context menu system with keyboard navigation
 */

class MenuManager {
    constructor(framework) {
        this.framework = framework;

        // Menu stack (for submenus)
        this.stack = [];

        // Current menu state
        this.current = null;
        this.selectedIndex = 0;
        this.scrollOffset = 0;

        // Render thread
        this.renderThread = null;
        this.inputThread = null;

        // Configuration
        this.config = {
            position: { x: 0.75, y: 0.15 },
            width: 0.22,
            itemHeight: 0.035,
            maxVisible: 10,
            padding: 0.005,
            colors: {
                headerBg: [20, 20, 20, 230],
                headerText: [255, 255, 255, 255],
                itemBg: [0, 0, 0, 170],
                itemBgSelected: [66, 135, 245, 200],
                itemText: [220, 220, 220, 255],
                itemTextSelected: [255, 255, 255, 255],
                itemTextDisabled: [120, 120, 120, 180],
                descBg: [0, 0, 0, 190],
                descText: [180, 180, 180, 255],
                scrollIndicator: [255, 255, 255, 120]
            },
            font: 4,
            titleFont: 1,
            titleScale: 0.45,
            itemScale: 0.3,
            descScale: 0.28,
            controls: {
                up: 172,      // Arrow Up
                down: 173,    // Arrow Down
                select: 176,  // Enter / LMB
                back: 177     // Backspace / ESC / RMB
            },
            inputDelay: 120 // ms between input repeats
        };

        this.lastInputTime = 0;
    }

    /**
     * Initialize menu module
     */
    async init() {
        this.framework.log.info('Menu module initialized');
    }

    // ================================
    // Public API
    // ================================

    /**
     * Open a menu
     * @param {Object} menuDef
     * @param {string} menuDef.title - Menu title
     * @param {string} [menuDef.description] - Menu description
     * @param {Array} menuDef.items - Menu items
     * @param {string} menuDef.items[].label - Item label
     * @param {string} [menuDef.items[].description] - Item description
     * @param {boolean} [menuDef.items[].disabled] - Grayed out
     * @param {Function} [menuDef.items[].onSelect] - Callback when selected
     * @param {Object} [menuDef.items[].submenu] - Submenu definition
     * @param {Object} [menuDef.items[].values] - Selectable values { current, options }
     * @param {Function} [menuDef.onClose] - Callback when menu closed
     */
    open(menuDef) {
        if (!menuDef || !menuDef.items || menuDef.items.length === 0) return;

        this.current = menuDef;
        this.selectedIndex = 0;
        this.scrollOffset = 0;

        this._startRender();
        this._startInput();
    }

    /**
     * Close the current menu (or go back to parent)
     */
    close() {
        if (this.stack.length > 0) {
            // Go back to parent menu
            const parent = this.stack.pop();
            this.current = parent.menu;
            this.selectedIndex = parent.selectedIndex;
            this.scrollOffset = parent.scrollOffset;
            return;
        }

        // Close entirely
        const onClose = this.current ? this.current.onClose : null;

        this._stopRender();
        this._stopInput();
        this.current = null;
        this.selectedIndex = 0;
        this.scrollOffset = 0;

        if (onClose) onClose();
    }

    /**
     * Close all menus (including stack)
     */
    closeAll() {
        this._stopRender();
        this._stopInput();

        const onClose = this.current ? this.current.onClose : null;

        this.stack = [];
        this.current = null;
        this.selectedIndex = 0;
        this.scrollOffset = 0;

        if (onClose) onClose();
    }

    /**
     * Check if a menu is currently open
     * @returns {boolean}
     */
    isOpen() {
        return this.current !== null;
    }

    /**
     * Get the currently selected item
     * @returns {Object|null}
     */
    getSelectedItem() {
        if (!this.current) return null;
        return this.current.items[this.selectedIndex] || null;
    }

    // ================================
    // Input Handling
    // ================================

    _startInput() {
        if (this.inputThread) return;

        this.inputThread = setTick(() => {
            this._handleInput();
        });
    }

    _stopInput() {
        if (this.inputThread) {
            clearTick(this.inputThread);
            this.inputThread = null;
        }
    }

    _handleInput() {
        if (!this.current) return;

        // Disable player controls while menu is open
        DisableAllControlActions(0);

        // Re-enable specific controls
        EnableControlAction(0, this.config.controls.up, true);
        EnableControlAction(0, this.config.controls.down, true);
        EnableControlAction(0, this.config.controls.select, true);
        EnableControlAction(0, this.config.controls.back, true);

        const now = GetGameTimer();
        const canInput = now - this.lastInputTime > this.config.inputDelay;

        // Navigate up
        if (IsDisabledControlPressed(0, this.config.controls.up) && canInput) {
            this._navigateUp();
            this.lastInputTime = now;
        }

        // Navigate down
        if (IsDisabledControlPressed(0, this.config.controls.down) && canInput) {
            this._navigateDown();
            this.lastInputTime = now;
        }

        // Select
        if (IsDisabledControlJustPressed(0, this.config.controls.select)) {
            this._selectItem();
        }

        // Back / Close
        if (IsDisabledControlJustPressed(0, this.config.controls.back)) {
            this.close();
        }
    }

    _navigateUp() {
        this.selectedIndex--;
        if (this.selectedIndex < 0) {
            this.selectedIndex = this.current.items.length - 1;
        }
        this._updateScroll();
    }

    _navigateDown() {
        this.selectedIndex++;
        if (this.selectedIndex >= this.current.items.length) {
            this.selectedIndex = 0;
        }
        this._updateScroll();
    }

    _updateScroll() {
        const maxVisible = this.config.maxVisible;

        if (this.selectedIndex < this.scrollOffset) {
            this.scrollOffset = this.selectedIndex;
        } else if (this.selectedIndex >= this.scrollOffset + maxVisible) {
            this.scrollOffset = this.selectedIndex - maxVisible + 1;
        }
    }

    _selectItem() {
        if (!this.current) return;

        const item = this.current.items[this.selectedIndex];
        if (!item || item.disabled) return;

        // Handle submenu
        if (item.submenu) {
            this.stack.push({
                menu: this.current,
                selectedIndex: this.selectedIndex,
                scrollOffset: this.scrollOffset
            });

            this.current = item.submenu;
            this.selectedIndex = 0;
            this.scrollOffset = 0;
            return;
        }

        // Handle value cycling
        if (item.values && item.values.options && item.values.options.length > 0) {
            const opts = item.values.options;
            const currentIdx = opts.indexOf(item.values.current);
            const nextIdx = (currentIdx + 1) % opts.length;
            item.values.current = opts[nextIdx];

            if (item.onSelect) {
                item.onSelect(item.values.current, nextIdx, item);
            }
            return;
        }

        // Handle callback
        if (item.onSelect) {
            item.onSelect(item);
        }
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

    _stopRender() {
        if (this.renderThread) {
            clearTick(this.renderThread);
            this.renderThread = null;
        }
    }

    _render() {
        if (!this.current) return;

        const { x, y } = this.config.position;
        const { width, itemHeight, padding, maxVisible, colors } = this.config;

        let currentY = y;

        // Draw header
        const headerHeight = itemHeight + padding * 2;
        DrawRect(x, currentY, width, headerHeight, colors.headerBg[0], colors.headerBg[1], colors.headerBg[2], colors.headerBg[3]);

        this._drawText(
            this.current.title || 'Menu',
            x, currentY - headerHeight / 2 + 0.003,
            this.config.titleFont,
            this.config.titleScale,
            colors.headerText,
            true
        );

        currentY += headerHeight / 2 + padding;

        // Draw counter (e.g. "3/10")
        const counterText = `${this.selectedIndex + 1}/${this.current.items.length}`;
        this._drawText(
            counterText,
            x + width / 2 - 0.015,
            y - headerHeight / 2 + 0.006,
            this.config.font,
            0.25,
            [180, 180, 180, 200],
            false
        );

        // Scroll indicator up
        if (this.scrollOffset > 0) {
            this._drawText('▲', x, currentY - 0.002, this.config.font, 0.25, colors.scrollIndicator, true);
        }

        currentY += itemHeight / 2;

        // Draw visible items
        const visibleEnd = Math.min(this.scrollOffset + maxVisible, this.current.items.length);

        for (let i = this.scrollOffset; i < visibleEnd; i++) {
            const item = this.current.items[i];
            const isSelected = i === this.selectedIndex;

            // Item background
            const bgColor = isSelected ? colors.itemBgSelected : colors.itemBg;
            DrawRect(x, currentY, width, itemHeight, bgColor[0], bgColor[1], bgColor[2], bgColor[3]);

            // Item label
            let textColor;
            if (item.disabled) {
                textColor = colors.itemTextDisabled;
            } else {
                textColor = isSelected ? colors.itemTextSelected : colors.itemText;
            }

            this._drawText(
                item.label,
                x - width / 2 + padding * 2,
                currentY - itemHeight / 2 + 0.005,
                this.config.font,
                this.config.itemScale,
                textColor,
                false
            );

            // Value indicator (right side)
            if (item.values && item.values.current !== undefined) {
                const valText = `◄ ${item.values.current} ►`;
                this._drawText(
                    valText,
                    x + width / 2 - padding * 2,
                    currentY - itemHeight / 2 + 0.005,
                    this.config.font,
                    this.config.itemScale - 0.02,
                    textColor,
                    false,
                    2 // right align
                );
            }

            // Submenu indicator
            if (item.submenu) {
                this._drawText(
                    '►',
                    x + width / 2 - padding * 3,
                    currentY - itemHeight / 2 + 0.005,
                    this.config.font,
                    this.config.itemScale,
                    textColor,
                    false
                );
            }

            currentY += itemHeight;
        }

        // Scroll indicator down
        if (visibleEnd < this.current.items.length) {
            this._drawText('▼', x, currentY + 0.002, this.config.font, 0.25, colors.scrollIndicator, true);
            currentY += 0.015;
        }

        // Description box (for selected item)
        const selectedItem = this.current.items[this.selectedIndex];
        if (selectedItem && selectedItem.description) {
            currentY += padding * 2;
            const descHeight = itemHeight + padding;
            DrawRect(x, currentY, width, descHeight, colors.descBg[0], colors.descBg[1], colors.descBg[2], colors.descBg[3]);

            this._drawText(
                selectedItem.description,
                x - width / 2 + padding * 2,
                currentY - descHeight / 2 + 0.004,
                this.config.font,
                this.config.descScale,
                colors.descText,
                false
            );
        }
    }

    /**
     * Draw text using GTA natives
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {number} font
     * @param {number} scale
     * @param {number[]} color - [r, g, b, a]
     * @param {boolean} center
     * @param {number} [justify] - 0=left, 1=center, 2=right
     */
    _drawText(text, x, y, font, scale, color, center, justify) {
        SetTextFont(font);
        SetTextScale(scale, scale);
        SetTextColour(color[0], color[1], color[2], color[3]);

        if (center) {
            SetTextCentre(true);
        } else if (justify === 2) {
            SetTextRightJustify(true);
            SetTextWrap(0.0, x);
        }

        SetTextDropShadow();

        BeginTextCommandDisplayText('STRING');
        AddTextComponentSubstringPlayerName(text);
        EndTextCommandDisplayText(x, y);
    }

    /**
     * Cleanup
     */
    async destroy() {
        this.closeAll();
        this.framework.log.info('Menu module destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MenuManager;
}

// Self-register
global.Framework.register('menu', new MenuManager(global.Framework), 15);
