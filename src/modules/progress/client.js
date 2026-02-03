/**
 * NextGen Framework - Progress Module (Client)
 * Native GTA progress bars with animations and props
 */

class ProgressManager {
    constructor(framework) {
        this.framework = framework;

        // Current active progress
        this.active = null;
        this.renderThread = null;
        this.cancelled = false;

        // Configuration
        this.config = {
            bar: {
                x: 0.5,
                y: 0.875,
                width: 0.2,
                height: 0.025,
                bgColor: [0, 0, 0, 150],
                fillColor: [66, 135, 245, 220],
                borderColor: [255, 255, 255, 80]
            },
            label: {
                font: 4,
                scale: 0.35,
                color: [255, 255, 255, 230]
            },
            cancelKey: 178 // X key (INPUT_REPLAY_SNAPMATIC_PHOTO)
        };
    }

    /**
     * Initialize progress module
     */
    async init() {
        this.framework.log.info('Progress module initialized');
    }

    // ================================
    // Public API
    // ================================

    /**
     * Start a progress bar
     * @param {Object} options
     * @param {number} options.duration - Duration in ms
     * @param {string} [options.label=''] - Label text
     * @param {boolean} [options.canCancel=false] - Allow cancellation
     * @param {Object} [options.animation] - { dict, clip, flag }
     * @param {Object} [options.prop] - { model, bone, offset, rotation }
     * @param {Object} [options.fillColor] - [r, g, b, a] override
     * @returns {Promise<boolean>} true if completed, false if cancelled
     */
    start(options) {
        if (this.active) {
            return Promise.resolve(false);
        }

        return new Promise(async (resolve) => {
            const startTime = GetGameTimer();
            const duration = options.duration || 3000;

            this.active = {
                startTime,
                duration,
                label: options.label || '',
                canCancel: options.canCancel || false,
                fillColor: options.fillColor || this.config.bar.fillColor,
                resolve
            };
            this.cancelled = false;

            // Start animation if provided
            if (options.animation) {
                await this._playAnimation(options.animation);
            }

            // Attach prop if provided
            let propEntity = null;
            if (options.prop) {
                propEntity = await this._attachProp(options.prop);
            }

            // Start render thread
            this._startRender();

            // Wait for completion or cancellation
            const checkInterval = setTick(async () => {
                const elapsed = GetGameTimer() - startTime;
                const progress = Math.min(elapsed / duration, 1.0);

                // Check cancellation
                if (options.canCancel && IsControlJustPressed(0, this.config.cancelKey)) {
                    this.cancelled = true;
                }

                if (this.cancelled || progress >= 1.0) {
                    clearTick(checkInterval);
                    this._stopRender();

                    // Cleanup animation
                    if (options.animation) {
                        this._stopAnimation();
                    }

                    // Cleanup prop
                    if (propEntity) {
                        this._detachProp(propEntity);
                    }

                    const completed = !this.cancelled;
                    this.active = null;
                    this.cancelled = false;
                    resolve(completed);
                }

                await this._sleep(50);
            });
        });
    }

    /**
     * Cancel the current progress
     */
    cancel() {
        if (this.active && this.active.canCancel) {
            this.cancelled = true;
        }
    }

    /**
     * Check if a progress is currently active
     * @returns {boolean}
     */
    isActive() {
        return this.active !== null;
    }

    // ================================
    // Render
    // ================================

    _startRender() {
        if (this.renderThread) return;

        this.renderThread = setTick(() => {
            if (!this.active) return;

            const elapsed = GetGameTimer() - this.active.startTime;
            const progress = Math.min(elapsed / this.active.duration, 1.0);

            this._drawProgressBar(progress);
        });
    }

    _stopRender() {
        if (this.renderThread) {
            clearTick(this.renderThread);
            this.renderThread = null;
        }
    }

    /**
     * Draw progress bar using native GTA drawing
     */
    _drawProgressBar(progress) {
        const { x, y, width, height, bgColor, borderColor } = this.config.bar;
        const fillColor = this.active.fillColor || this.config.bar.fillColor;

        // Background
        DrawRect(x, y, width + 0.004, height + 0.006, borderColor[0], borderColor[1], borderColor[2], borderColor[3]);
        DrawRect(x, y, width, height, bgColor[0], bgColor[1], bgColor[2], bgColor[3]);

        // Fill (progress)
        const fillWidth = width * progress;
        const fillX = x - (width / 2) + (fillWidth / 2);
        DrawRect(fillX, y, fillWidth, height, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);

        // Label
        if (this.active.label) {
            const { font, scale, color } = this.config.label;

            SetTextFont(font);
            SetTextScale(scale, scale);
            SetTextColour(color[0], color[1], color[2], color[3]);
            SetTextCentre(true);
            SetTextDropShadow();

            BeginTextCommandDisplayText('STRING');
            AddTextComponentSubstringPlayerName(this.active.label);
            EndTextCommandDisplayText(x, y - height - 0.02);
        }

        // Cancel hint
        if (this.active.canCancel) {
            SetTextFont(4);
            SetTextScale(0.28, 0.28);
            SetTextColour(200, 200, 200, 180);
            SetTextCentre(true);

            BeginTextCommandDisplayText('STRING');
            AddTextComponentSubstringPlayerName('~INPUT_REPLAY_SNAPMATIC_PHOTO~ Cancel');
            EndTextCommandDisplayText(x, y + height + 0.005);
        }
    }

    // ================================
    // Animation & Props
    // ================================

    /**
     * Play an animation on the player ped
     */
    async _playAnimation(anim) {
        const ped = PlayerPedId();
        const { dict, clip, flag } = anim;

        RequestAnimDict(dict);

        let attempts = 0;
        while (!HasAnimDictLoaded(dict) && attempts < 50) {
            await this._sleep(10);
            attempts++;
        }

        if (!HasAnimDictLoaded(dict)) return;

        TaskPlayAnim(ped, dict, clip, 8.0, -8.0, -1, flag || 49, 0, false, false, false);
    }

    /**
     * Stop animation on player ped
     */
    _stopAnimation() {
        const ped = PlayerPedId();
        ClearPedTasks(ped);
    }

    /**
     * Attach a prop to the player ped
     * @returns {number|null} Prop entity handle
     */
    async _attachProp(prop) {
        const ped = PlayerPedId();
        const model = typeof prop.model === 'string' ? GetHashKey(prop.model) : prop.model;

        RequestModel(model);

        let attempts = 0;
        while (!HasModelLoaded(model) && attempts < 50) {
            await this._sleep(10);
            attempts++;
        }

        if (!HasModelLoaded(model)) return null;

        const coords = GetEntityCoords(ped, true);
        const entity = CreateObject(model, coords[0], coords[1], coords[2], true, true, true);

        const bone = GetPedBoneIndex(ped, prop.bone || 60309);
        const offset = prop.offset || { x: 0, y: 0, z: 0 };
        const rotation = prop.rotation || { x: 0, y: 0, z: 0 };

        AttachEntityToEntity(
            entity, ped, bone,
            offset.x, offset.y, offset.z,
            rotation.x, rotation.y, rotation.z,
            true, true, false, true, 1, true
        );

        SetModelAsNoLongerNeeded(model);

        return entity;
    }

    /**
     * Detach and delete a prop
     */
    _detachProp(entity) {
        if (DoesEntityExist(entity)) {
            DetachEntity(entity, false, false);
            DeleteEntity(entity);
        }
    }

    // ================================
    // Utility
    // ================================

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async destroy() {
        this._stopRender();
        if (this.active) {
            this.cancelled = true;
        }
        this.framework.log.info('Progress module destroyed');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressManager;
}

// Self-register
global.Framework.register('progress', new ProgressManager(global.Framework), 15);
