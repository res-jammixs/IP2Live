/** Shared popup styling; volume and keyboard preferences remain persistent. */
class IP2LiveSettingsMenu extends Scene.Base {
    constructor(options = {}) {
        super(true);
        this.popupTransition = !!options.popupTransition;
        this.backdrop = IP2Live.PopupChrome.capture();
        this.blurredBackdrop = this._blurBackdrop(this.backdrop);
    }

    initialize() {
        /*
         * BACK is no longer part of this array.
         * It is a separate footer button; Escape also goes back.
         */
        this.menuItems = [
            'KEY BINDINGS',
            'SFX VOLUME',
            'MUSIC VOLUME',
            'LANGUAGE [EN]',
        ];

        this.selectedIndex =
            0;

        this.hoverIndex =
            -1;

        this.hoverBack =
            false;

        this.backButtonRect =
            null;

        this.animTick =
            0;

        this.scanlineOffset =
            0;

        this.adjustingVolumeType =
            null;

        this.sfxVolume =
            this._readSfxVolumePercent();

        this.musicVolume =
            this._readMusicVolumePercent();

        this._applySfxVolumeSetting();

        this._applyMusicVolumeSetting();

        this.bgFx =
            IP2Live.BgFx.create();

        this.buttonRects =
            [];

        this.volumeHitTargets =
            [];

        this.fadeIn =
            0;
        this.popupProgress = 0;
        this.closing = false;
    }

    async load() {
        if (
            !IP2Live.Assets.bgImage ||
            !IP2Live.Assets.oxaniumMediumLoaded
        ) {
            await IP2Live.Assets.loadAll();
        }

        const cW =
            Common.Platform.ctx.canvas.width;

        const cH =
            Common.Platform.ctx.canvas.height;

        this.bgFx.seed(
            cW,
            cH
        );

        this.loading =
            false;

        Manager.Stack.requestPaintHUD =
            true;
    }

    onKeyPressed(key) {
        if (this.closing) return true;
        /*
         * While volume adjustment mode is active,
         * Enter or Esc closes adjustment mode.
         */
        if (
            this.adjustingVolumeType
        ) {
            if (
                Data.Keyboards.checkActionMenu(
                    key
                ) ||
                Data.Keyboards.checkCancelMenu(
                    key
                )
            ) {
                this.adjustingVolumeType =
                    null;

                try {
                    Data.Systems.soundConfirmation.playSound();
                } catch (error) {}

                Manager.Stack.requestPaintHUD =
                    true;
            }

            return true;
        }

        if (
            Data.Keyboards.checkActionMenu(
                key
            )
        ) {
            this._confirmSelection();

            return true;
        }

        /*
         * ESC still behaves as Back.
         */
        if (
            Data.Keyboards.checkCancelMenu(
                key
            )
        ) {
            this._resume();

            return true;
        }

        return true;
    }

    onKeyPressedAndRepeat(key) {
        if (this.closing) return true;
        /*
         * Volume adjustment.
         */
        if (
            this.adjustingVolumeType
        ) {
            const isLeft =
                (
                    Data.Keyboards.menuControls &&
                    Data.Keyboards.menuControls.Left
                )
                    ? Data.Keyboards.isKeyEqual(
                        key,
                        Data.Keyboards.menuControls.Left
                    )
                    : (
                        key === 37 ||
                        key === 65
                    );

            const isRight =
                (
                    Data.Keyboards.menuControls &&
                    Data.Keyboards.menuControls.Right
                )
                    ? Data.Keyboards.isKeyEqual(
                        key,
                        Data.Keyboards.menuControls.Right
                    )
                    : (
                        key === 39 ||
                        key === 68
                    );

            if (
                isLeft
            ) {
                this._nudgeVolume(
                    this.adjustingVolumeType,
                    -10
                );
            } else if (
                isRight
            ) {
                this._nudgeVolume(
                    this.adjustingVolumeType,
                    10
                );
            }

            return true;
        }

        /*
         * Main menu navigation.
         */
        const prev =
            this.selectedIndex;

        if (
            Data.Keyboards.isKeyEqual(
                key,
                Data.Keyboards.menuControls.Up
            )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex -
                    1 +
                    this.menuItems.length
                ) %
                this.menuItems.length;
        } else if (
            Data.Keyboards.isKeyEqual(
                key,
                Data.Keyboards.menuControls.Down
            )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex +
                    1
                ) %
                this.menuItems.length;
        }

        if (
            this.selectedIndex !==
            prev
        ) {
            this.hoverIndex =
                -1;

            this.hoverBack =
                false;

            try {
                Data.Systems.soundCursor.playSound();
            } catch (error) {}

            Manager.Stack.requestPaintHUD =
                true;
        }

        return true;
    }

    onMouseMove(
        x,
        y
    ) {
        if (this.closing) return true;
        /*
         * Top-left Back icon.
         */
        const overBack =
            this._isBackButtonAt(
                x,
                y
            );

        if (
            overBack !==
            this.hoverBack
        ) {
            this.hoverBack =
                overBack;

            if (
                overBack
            ) {
                this.hoverIndex =
                    -1;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            Manager.Stack.requestPaintHUD =
                true;
        }

        if (
            overBack
        ) {
            return true;
        }

        const newHover =
            this._getButtonAt(
                x,
                y
            );

        if (
            newHover !==
            this.hoverIndex
        ) {
            this.hoverIndex =
                newHover;

            if (
                newHover >= 0 &&
                newHover !==
                    this.selectedIndex
            ) {
                this.selectedIndex =
                    newHover;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            Manager.Stack.requestPaintHUD =
                true;
        }

        return true;
    }

    onMouseUp(
        x,
        y
    ) {
        if (this.closing) return true;
        /*
         * Upper-left Back icon.
         */
        if (
            this._isBackButtonAt(
                x,
                y
            )
        ) {
            this._resume();

            return true;
        }

        /*
         * Volume interaction takes priority.
         */
        const volumeHit =
            this._getVolumeHitAt(
                x,
                y
            );

        if (
            volumeHit
        ) {
            this.selectedIndex =
                volumeHit.index;

            this.adjustingVolumeType =
                volumeHit.type;

            if (
                volumeHit.action ===
                'decrease'
            ) {
                this._nudgeVolume(
                    volumeHit.type,
                    -10
                );
            } else if (
                volumeHit.action ===
                'increase'
            ) {
                this._nudgeVolume(
                    volumeHit.type,
                    10
                );
            } else if (
                volumeHit.action ===
                'bar'
            ) {
                const pct =
                    (
                        (
                            x -
                            volumeHit.x
                        ) /
                        volumeHit.w
                    ) *
                    100;

                this._setVolumePercent(
                    volumeHit.type,

                    Math.round(
                        pct /
                        5
                    ) *
                    5
                );

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}

                Manager.Stack.requestPaintHUD =
                    true;
            }

            return true;
        }

        /*
         * Regular Settings rows.
         */
        const idx =
            this._getButtonAt(
                x,
                y
            );

        if (
            idx >= 0
        ) {
            if (
                idx !==
                this.selectedIndex
            ) {
                this.selectedIndex =
                    idx;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            this._confirmSelection();
        }

        return true;
    }

    _isBackButtonAt(
        x,
        y
    ) {
        const r =
            this.backButtonRect;

        return !!(
            r &&
            x >= r.x &&
            x <= r.x + r.w &&
            y >= r.y &&
            y <= r.y + r.h
        );
    }

    _getButtonAt(
        x,
        y
    ) {
        for (
            let i = 0;
            i < this.buttonRects.length;
            i++
        ) {
            const r =
                this.buttonRects[i];

            if (
                x >= r.x &&
                x <= r.x + r.w &&
                y >= r.y &&
                y <= r.y + r.h
            ) {
                return i;
            }
        }

        return -1;
    }

    _getVolumeHitAt(
        x,
        y
    ) {
        for (
            let i = 0;
            i < this.volumeHitTargets.length;
            i++
        ) {
            const r =
                this.volumeHitTargets[i];

            if (
                x >= r.x &&
                x <= r.x + r.w &&
                y >= r.y &&
                y <= r.y + r.h
            ) {
                return r;
            }
        }

        return null;
    }

    _confirmSelection() {
        const volumeType =
            this._volumeTypeForIndex(
                this.selectedIndex
            );

        /*
         * Enter on volume row toggles adjustment mode.
         */
        if (
            volumeType
        ) {
            if (
                !this.adjustingVolumeType
            ) {
                this.adjustingVolumeType =
                    volumeType;
            } else {
                this.adjustingVolumeType =
                    null;
            }

            try {
                Data.Systems.soundConfirmation.playSound();
            } catch (error) {}

            Manager.Stack.requestPaintHUD =
                true;

            return;
        }

        /*
         * Language currently informational only.
         */
        if (
            this.selectedIndex ===
            3
        ) {
            try {
                if (
                    Data.Systems.soundImpossible
                ) {
                    Data.Systems.soundImpossible.playSound();
                } else {
                    Data.Systems.soundCancel.playSound();
                }
            } catch (error) {}

            return;
        }

        try {
            Data.Systems.soundConfirmation.playSound();
        } catch (error) {}

        this._executeAction(
            this.selectedIndex
        );
    }

    _resume() {
        if (this.closing) return;
        try {
            Data.Systems.soundCancel.playSound();
        } catch (error) {}

        if (this.popupTransition) {
            this.closing = true;
            Manager.Stack.requestPaintHUD = true;
        } else if (IP2Live.MenuTransition) IP2Live.MenuTransition.back();
        else Manager.Stack.pop();
    }

    _executeAction(idx) {
        /*
         * Key Bindings.
         */
        if (
            idx === 0
        ) {
            /*
             * Apply the modern skin in case the
             * keyboard module loaded after settings.js.
             */
            if (
                IP2Live._modernizeKeyboardMenuUI
            ) {
                IP2Live._modernizeKeyboardMenuUI();
            }

            const KeyboardMenuClass =
                window.IP2LiveKeyboardMenu;

            if (
                KeyboardMenuClass
            ) {
                Manager.Stack.push(
                    new KeyboardMenuClass()
                );
            }
        }
    }

    _volumeTypeForIndex(index) {
        if (
            index === 1
        ) {
            return 'sfx';
        }

        if (
            index === 2
        ) {
            return 'music';
        }

        return null;
    }

    _volumeForType(type) {
        return type === 'music'
            ? this.musicVolume
            : this.sfxVolume;
    }

    _readSfxVolumePercent() {
        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.sfxVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.sfxVolume
                    )
                ) *
                100
            );
        }

        if (
            IP2Live.SoundFX &&
            typeof IP2Live.SoundFX.getMasterVolume ===
                'function'
        ) {
            return Math.round(
                IP2Live.SoundFX.getMasterVolume() *
                100
            );
        }

        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.masterVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.masterVolume
                    )
                ) *
                100
            );
        }

        return 100;
    }

    _readMusicVolumePercent() {
        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.musicVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.musicVolume
                    )
                ) *
                100
            );
        }

        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.masterVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.masterVolume
                    )
                ) *
                100
            );
        }

        if (
            IP2Live.MusicManager &&
            typeof IP2Live.MusicManager.getVolume ===
                'function'
        ) {
            return Math.round(
                IP2Live.MusicManager.getVolume() *
                100
            );
        }

        return 100;
    }

    _nudgeVolume(
        type,
        amount
    ) {
        this._setVolumePercent(
            type,

            this._volumeForType(
                type
            ) +
            amount
        );

        try {
            Data.Systems.soundCursor.playSound();
        } catch (error) {}

        Manager.Stack.requestPaintHUD =
            true;
    }

    _setVolumePercent(
        type,
        value
    ) {
        const next =
            Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        value
                    )
                )
            );

        if (
            type === 'music'
        ) {
            this.musicVolume =
                next;

            this._applyMusicVolumeSetting();

            this._saveAudioSettings();

            return;
        }

        this.sfxVolume =
            next;

        this._applySfxVolumeSetting();

        this._saveAudioSettings();
    }

    _applySfxVolumeSetting() {
        const volume =
            this.sfxVolume /
            100;

        IP2Live.sfxVolume =
            volume;

        if (
            IP2Live.SoundFX &&
            typeof IP2Live.SoundFX.setMasterVolume ===
                'function'
        ) {
            IP2Live.SoundFX.setMasterVolume(
                volume
            );
        }
    }

    _applyMusicVolumeSetting() {
        const volume =
            this.musicVolume /
            100;

        IP2Live.musicVolume =
            volume;

        if (
            IP2Live.MusicManager &&
            typeof IP2Live.MusicManager.setVolume ===
                'function'
        ) {
            IP2Live.MusicManager.setVolume(
                volume
            );
        }
    }

    _saveAudioSettings() {
        try {
            if (
                typeof localStorage ===
                'undefined'
            ) {
                return false;
            }

            localStorage.setItem(
                'IP2Live.audio-settings.v1',

                JSON.stringify({
                    musicVolume:
                        this.musicVolume /
                        100,

                    sfxVolume:
                        this.sfxVolume /
                        100,
                })
            );

            return true;
        } catch (error) {
            console.warn(
                '[IP2Live] Audio settings could not be saved:',
                error
            );

            return false;
        }
    }

    update() {
        this.animTick++;
        this.popupProgress = Math.max(0, Math.min(1,
            this.popupProgress + (this.closing ? -0.085 : 0.085)));
        if (this.closing && this.popupProgress <= 0) {
            if (Manager.Stack.top === this) Manager.Stack.pop();
            Manager.Stack.requestPaintHUD = true;
            return;
        }

        this.scanlineOffset =
            (
                this.scanlineOffset +
                0.5
            ) %
            4;

        this.fadeIn =
            Math.min(
                1,
                this.fadeIn +
                0.07
            );

        if (
            this.bgFx &&
            typeof this.bgFx.update ===
                'function'
        ) {
            this.bgFx.update(
                this.animTick
            );
        }

        if (
            this.animTick %
                2 ===
                0 ||
            this.fadeIn <
                1 || this.closing || this.popupProgress < 1
        ) {
            Manager.Stack.requestPaintHUD =
                true;
        }
    }

    draw3D() {
        Manager.GL.renderer.clear();
    }

    _blurBackdrop(frame) {
        if (!frame || !frame.width || !frame.height) return frame;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(frame.width / 2));
        canvas.height = Math.max(1, Math.round(frame.height / 2));
        const ctx = canvas.getContext('2d');
        if (!ctx) return frame;
        // Cache a half-resolution blur once; animation never filters the live
        // game or the settings controls. Overscan avoids dark blur edges.
        const radius = 4 * frame.width / 1280;
        const pad = radius * 3;
        ctx.filter = 'blur(' + radius + 'px)';
        ctx.drawImage(frame, -pad, -pad, canvas.width + pad * 2, canvas.height + pad * 2);
        ctx.filter = 'none';
        return canvas;
    }

    _drawSettingsBackdrop(ctx, progress) {
        ctx.save();
        if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalAlpha *= progress;
        if (this.blurredBackdrop) ctx.drawImage(this.blurredBackdrop, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgba(1,5,10,0.58)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }

    _drawSettingsPanel(ctx, rect) {
        const { x, y, w, h } = rect;
        const chrome = IP2Live.PopupChrome;
        chrome.panel(ctx, x, y, w, h, 1, 1, false, this.animTick);
        ctx.save();
        chrome.path(ctx, x + 9, y + 8, w - 18, h - 16, 6);
        ctx.clip();
        const glass = ctx.createLinearGradient(x, y, x + w, y + h);
        glass.addColorStop(0, 'rgba(139,211,225,0.13)');
        glass.addColorStop(0.35, 'rgba(139,211,225,0.025)');
        glass.addColorStop(0.7, 'rgba(24,19,47,0.12)');
        glass.addColorStop(1, 'rgba(139,123,191,0.08)');
        ctx.fillStyle = glass; ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.save();
        chrome.path(ctx, x + 9, y + 8, w - 18, h - 16, 6);
        ctx.strokeStyle = 'rgba(164,223,230,0.22)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 30, y + 55, w - 60, 2);
        ctx.restore();
        chrome.heading(ctx, 'SETTINGS', x, y, w);
    }

    _drawSettingsRow(ctx, rect, active) {
        const { x, y, w, h } = rect;
        const chrome = IP2Live.PopupChrome;
        ctx.save();
        chrome.path(ctx, x, y, w, h, 5);
        const surface = ctx.createLinearGradient(x, y, x, y + h);
        surface.addColorStop(0, active ? '#213846' : '#182833');
        surface.addColorStop(0.5, active ? '#142a36' : '#101e28');
        surface.addColorStop(1, '#0a141e');
        ctx.fillStyle = surface; ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 6; ctx.shadowOffsetY = 3; ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = active ? 'rgba(130,204,213,0.65)' : 'rgba(130,204,213,0.23)';
        ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(220,247,255,0.12)'; ctx.fillRect(x + 6, y + 1, w - 12, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 6, y + h - 2, w - 12, 1);
        ctx.fillStyle = active ? '#e5d779' : '#47767d'; ctx.fillRect(x + 1, y + 10, 2, h - 20);
        ctx.restore();
    }

    _drawVolumeControl(ctx, rect, type, index, active, scale) {
        const value = this._volumeForType(type);
        const bx = rect.x + 240, by = rect.y + 14, bw = 150;
        ctx.save();
        ctx.fillStyle = '#050c13'; ctx.fillRect(bx, by, bw, 22);
        ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 21);
        ctx.fillStyle = 'rgba(172,224,230,0.25)'; ctx.fillRect(bx, by + 22, bw, 1);
        const fill = ctx.createLinearGradient(bx, by, bx, by + 22);
        fill.addColorStop(0, active ? '#e0d79a' : '#85c2cc');
        fill.addColorStop(1, active ? '#9b8b45' : '#397886');
        ctx.fillStyle = fill; ctx.fillRect(bx + 3, by + 3, (bw - 6) * value / 100, 16);
        ctx.fillStyle = 'rgba(2,9,15,0.35)';
        for (let step = 1; step < 10; step++) ctx.fillRect(bx + 3 + (bw - 6) * step / 10, by + 3, 1, 16);
        if (value > 0) {
            ctx.fillStyle = active ? '#fff0bd' : '#b6edf0';
            ctx.fillRect(bx + 2 + (bw - 6) * value / 100, by + 2, 2, 18);
        }
        const targets = [{ action: 'decrease', x: bx - 32, w: 28, label: '-' },
            { action: 'bar', x: bx, w: bw }, { action: 'increase', x: bx + bw + 4, w: 28, label: '+' }];
        for (const target of targets) {
            if (target.label) {
                this._drawSettingsRow(ctx, { x: target.x, y: by - 3, w: 28, h: 28 },
                    active && this.adjustingVolumeType === type);
                ctx.font = '16px Oxanium-Medium, sans-serif'; ctx.textAlign = 'center';
                ctx.fillStyle = '#c3e2e6'; ctx.fillText(target.label, target.x + 14, by + 17);
            }
            this.volumeHitTargets.push({ index, type, action: target.action,
                x: target.x * scale, y: (by - 5) * scale, w: target.w * scale, h: 32 * scale });
        }
        ctx.font = '14px Oxanium-Medium, sans-serif'; ctx.fillStyle = '#d4e3e6';
        ctx.textAlign = 'right'; ctx.fillText(value + '%', rect.x + rect.w - 12, by + 16);
        ctx.restore();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx, c = ctx.canvas, chrome = IP2Live.PopupChrome;
        const scale = Math.min(c.width / 1280, c.height / 720);
        const w = 580, h = 390, x = (c.width / scale - w) / 2, y = (c.height / scale - h) / 2;
        const progress = this.popupProgress;
        ctx.save(); this._drawSettingsBackdrop(ctx, progress); ctx.scale(scale, scale);
        chrome.animate(ctx, { x, y, w, h }, progress);
        this._drawSettingsPanel(ctx, { x, y, w, h });
        this.buttonRects = []; this.volumeHitTargets = [];
        this.menuItems.forEach((label, i) => {
            const r = { x: x + 30, y: y + 76 + i * 60, w: w - 60, h: 50 };
            const active = this.selectedIndex === i && i !== 3;
            this.buttonRects.push({ x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale });
            this._drawSettingsRow(ctx, r, active);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.font = 'bold 15px Oxanium-Medium, sans-serif'; ctx.fillStyle = i === 3 ? '#687d86' : '#e0edef';
            ctx.fillText(label, r.x + 16, r.y + 30);
            if (i === 0) {
                ctx.textAlign = 'right'; ctx.fillStyle = '#83b9c1'; ctx.fillText('>', r.x + r.w - 20, r.y + 30);
            }
            if (i === 1 || i === 2) this._drawVolumeControl(ctx, r, i === 1 ? 'sfx' : 'music', i, active, scale);
        });
        const back = { x: x + w / 2 - 90, y: y + h - 57, w: 180, h: 36 };
        this.backButtonRect = { x: back.x * scale, y: back.y * scale, w: back.w * scale, h: back.h * scale };
        this._drawSettingsRow(ctx, back, this.hoverBack);
        chrome.button(ctx, back, 1, 1, 'BACK', 'Oxanium-Medium', this.hoverBack ? 1 : 0, this.animTick, false);
        ctx.restore();
    }

}


/*
 * Expose Settings class.
 */
window.IP2LiveSettingsMenu =
    IP2LiveSettingsMenu;


/* =========================================================
 * MODERN KEY BINDINGS SKIN
 * =========================================================
 *
 * This wraps the project's existing IP2LiveKeyboardMenu.
 * It does NOT replace the original rebinding logic.
 */

function IP2LiveModernizeKeyboardMenuUI() { return !!window.IP2LiveKeyboardMenu; }
IP2Live._modernizeKeyboardMenuUI = IP2LiveModernizeKeyboardMenuUI;
