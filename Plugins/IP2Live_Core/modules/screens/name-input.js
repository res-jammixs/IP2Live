/**
 * IP2Live â€” Name Input Screen (UC-01)
 * @file Plugins/IP2Live_Core/modules/screens/name-input.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LiveNameInputScreen extends Scene.Base {
    constructor() { super(true); }

    initialize() {
        this.animTick = 0;
        this.scanlineOffset = 0;
        this.inputEl = null;
        this.errorMsg = '';
        this.errorTimer = 0;
        this.confirmed = false;
        this.awaitingNameConfirmation = false;
        this.hoverConfirm = false;
        this.hoverBack = false;
        this.buttonHoverMix = { back: 0, confirm: 0 };
        this.nameGlyphAnimations = [];
        this._lastInputValue = '';
        this.inputActivity = 0;
        this.fadeIn = 0;       // 0..1, fades the interface in on load
        this.entryFade = 1;    // 1..0, fades the black transition overlay out
        this.entryDuration = 58;
        this.bgFx = IP2Live.BgFx.create();
        this.cornerGlitches = [];
        this._cornerGlitchesSeeded = false;
        this.netBgPackets = [];
        this.netBgBits = [];
        this.netBgNodes = [];
        this.netBgWires = [];
        this._netBgSeedSize = null;
    }

    async load() {
        if (!IP2Live.Assets.bgImage || !IP2Live.Assets.oxaniumMediumLoaded) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        this._seedNetBackdrop(cW, cH);
        this._cornerGlitchesSeeded = false;
        this._createInputElement();
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    // â”€â”€ DOM Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    _createInputElement() {
        this._removeInputElement();

        const el = document.createElement('input');
        el.type = 'text';
        el.id = 'ip2live-name-input';
        el.maxLength = 24;
        el.placeholder = 'INFILTRATOR NAME...';
        el.autocomplete = 'off';
        el.spellcheck = false;

        Object.assign(el.style, {
            position:      'fixed',
            opacity:       '0',
            pointerEvents: 'none',
            width:         '1px',
            height:        '1px',
            top:           '0',
            left:          '0',
            border:        'none',
            outline:       'none',
            background:    'transparent',
            color:         'transparent',
            zIndex:        '-1',
        });

        document.body.appendChild(el);
        this.inputEl = el;

        setTimeout(() => el.focus(), 80);

        el.addEventListener('input', () => {
            this._syncNameGlyphs(el.value);
            this.inputActivity = 1;
            this.errorMsg = '';
            Manager.Stack.requestPaintHUD = true;
        });
    }

    _removeInputElement() {
        const old = document.getElementById('ip2live-name-input');
        if (old) old.remove();
        this.inputEl = null;
    }

    // â”€â”€ Input handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    onKeyPressed(key) {
        if (this.confirmed) return;
        if (Data.Keyboards.checkActionMenu(key)) {
            this._tryConfirm();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._back();
        }
    }

    onMouseMove(x, y) {
        const { confirmRect, backRect } = this._getButtonRects();
        const prev = { c: this.hoverConfirm, b: this.hoverBack };
        this.hoverConfirm = this._inRect(x, y, confirmRect);
        this.hoverBack    = this._inRect(x, y, backRect);
        if (this.hoverConfirm !== prev.c || this.hoverBack !== prev.b)
            Manager.Stack.requestPaintHUD = true;
    }

    onMouseUp(x, y) {
        if (this.confirmed) return;
        const { confirmRect, backRect } = this._getButtonRects();
        if (this._inRect(x, y, confirmRect)) { this._tryConfirm(); return; }
        if (this._inRect(x, y, backRect))    { this._back(); return; }
        if (this.inputEl) this.inputEl.focus();
    }

    // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    _tryConfirm() {
        const rawName = this.inputEl ? this.inputEl.value.trim() : '';
        if (!rawName) {
            Data.Systems.soundImpossible.playSound();
            this.errorMsg = 'DESIGNATION REQUIRED â€” CANNOT BE EMPTY';
            this.errorTimer = 120;
            Manager.Stack.requestPaintHUD = true;
            return;
        }

        if (this.awaitingNameConfirmation) return;
        this.awaitingNameConfirmation = true;
        Data.Systems.soundConfirmation.playSound();
        if (this.inputEl) this.inputEl.blur();

        if (IP2Live.confirPopup && typeof IP2Live.confirPopup.show === 'function') {
            IP2Live.confirPopup.show({
                title: 'CONFIRM NAME',
                message: 'Use this name for your profile?',
                detail: 'Used for save data and reports.',
                value: rawName,
                valueLabel: 'INFILTRATOR NAME',
                confirmLabel: 'CONFIRM',
                cancelLabel: 'EDIT',
                onConfirm: () => this._commitName(rawName),
                onCancel: () => {
                    this.awaitingNameConfirmation = false;
                    if (this.inputEl) this.inputEl.focus();
                },
            });
            return;
        }

        this._commitName(rawName).catch((error) => {
            console.error('[IP2Live] Name confirmation failed:', error);
        });
    }

    async _commitName(rawName) {
        this.awaitingNameConfirmation = false;
        this.confirmed = true;
        try {
            const existingProfile = await IP2Live.DBManager.getRecord('profiles', rawName);
            let profileId = existingProfile && existingProfile.profileId
                ? String(existingProfile.profileId)
                : '';
            if (!profileId) {
                try {
                    profileId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
                        ? crypto.randomUUID()
                        : '';
                } catch (error) {}
                if (!profileId) profileId = 'profile-' + Date.now() + '-' + Math.floor(Math.random() * 1000000000);
            }
            const profile = Object.assign({}, existingProfile || {}, {
                infiltratorName: rawName,
                profileId: profileId,
                createdAt: (existingProfile && existingProfile.createdAt) || Date.now(),
                playTime: (existingProfile && existingProfile.playTime) || 0,
                currentMapId: 1,
                updatedAt: Date.now(),
            });
            await IP2Live.DBManager.saveRecord('profiles', profile);

            if (Main && typeof Main.waitForGameData === 'function') {
                await Main.waitForGameData();
            }

            Core.Game.current = new Core.Game();
            Core.Game.current.initializeDefault();
            Core.Game.current.infiltratorName = rawName;
            Core.Game.current._ip2liveProfileId = profileId;
            Core.Game.current.profileId = profileId;

            this._removeInputElement();

            const startTutorial = function () {
                if (IP2Live.GameManager && typeof IP2Live.GameManager.startNewGameFlow === 'function') {
                    IP2Live.GameManager.startNewGameFlow(rawName);
                } else {
                    IP2Live.MapManager.goToTutorial({ useLoading: false });
                }
            };

            const ScreenClass = IP2Live.LoadingScreen2 || IP2Live.LoadingScreen;
            if (ScreenClass && typeof ScreenClass.show === 'function') {
                ScreenClass.show({
                    mode: 'replace',
                    status: 'Saving Progress',
                    detail: 'Loading Tutorial Stage',
                    fadeMusicOnStart: true,
                    musicFadeDurationMs: 2200,
                    onComplete: startTutorial,
                });
            } else {
                setTimeout(startTutorial, 300);
            }
        } catch (error) {
            this.confirmed = false;
            this.errorMsg = 'IDENTITY COMMIT FAILED - TRY AGAIN';
            this.errorTimer = 180;
            if (this.inputEl) this.inputEl.focus();
            Manager.Stack.requestPaintHUD = true;
            throw error;
        }
    }

    _back() {
        if (this.isFadingOut) return;
        Data.Systems.soundCancel.playSound();
        this._removeInputElement();

        if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
            IP2Live.LoadingScreen.show({
                mode: 'replace',
                status: 'Loading Main Menu',
                detail: 'Restoring title deck',
                onComplete: function () {
                    Manager.Stack.pop();
                    const mainMenu = Manager.Stack.top;
                    if (mainMenu && mainMenu.fadeOut !== undefined) {
                        mainMenu.fadeOut = 1;
                        mainMenu.isFadingIn = true;
                    }
                },
            });
            return;
        }

        this.isFadingOut = true;
        this.fadeOut = 0;
    }

    // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    _inRect(x, y, r) {
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    _getButtonRects() {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const sX = cW / SW;
        const sY = cH / SH;
        const layout = this._getPanelLayout(SW, SH);

        return {
            backRect: {
                x: layout.backX * sX,
                y: layout.buttonY * sY,
                w: layout.buttonW * sX,
                h: layout.buttonH * sY,
            },
            confirmRect: {
                x: layout.confirmX * sX,
                y: layout.buttonY * sY,
                w: layout.buttonW * sX,
                h: layout.buttonH * sY,
            },
        };
    }

    _getPanelLayout(SW, SH) {
        const panelW = 500;
        const panelH = 218;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const buttonW = 156;
        const buttonH = 40;
        const buttonGap = 18;
        const buttonStartX = panelX + (panelW - (buttonW * 2 + buttonGap)) / 2;

        return {
            panelW,
            panelH,
            panelX,
            panelY,
            inputX: panelX + 28,
            inputY: panelY + 84,
            inputW: panelW - 56,
            inputH: 44,
            buttonW,
            buttonH,
            buttonY: panelY + 156,
            backX: buttonStartX,
            confirmX: buttonStartX + buttonW + buttonGap,
        };
    }

    _syncNameGlyphs(nextValue) {
        const previousValue = this._lastInputValue || '';
        const previousAnimations = this.nameGlyphAnimations || [];
        let sharedPrefix = 0;

        while (
            sharedPrefix < previousValue.length &&
            sharedPrefix < nextValue.length &&
            previousValue[sharedPrefix] === nextValue[sharedPrefix]
        ) {
            sharedPrefix++;
        }

        const nextAnimations = previousAnimations.slice(0, sharedPrefix);
        for (let i = sharedPrefix; i < nextValue.length; i++) {
            nextAnimations[i] = {
                target: nextValue[i],
                startedAt: this.animTick || 0,
                duration: 13 + ((i - sharedPrefix) % 4) * 2,
                seed: (nextValue.charCodeAt(i) * 17 + i * 31 + (this.animTick || 0) * 7) >>> 0,
            };
        }

        this.nameGlyphAnimations = nextAnimations;
        this._lastInputValue = nextValue;
    }

    _updateInteractionAnimations() {
        const hoverTargets = {
            back: this.hoverBack ? 1 : 0,
            confirm: this.hoverConfirm ? 1 : 0,
        };
        let isAnimating = false;

        for (const key of ['back', 'confirm']) {
            const current = this.buttonHoverMix[key];
            const target = hoverTargets[key];
            const next = current + (target - current) * 0.2;
            this.buttonHoverMix[key] = Math.abs(target - next) < 0.008 ? target : next;
            if (this.buttonHoverMix[key] !== target) isAnimating = true;
        }

        if (this.inputActivity > 0) {
            this.inputActivity = Math.max(0, this.inputActivity - 0.045);
            isAnimating = true;
        }

        return isAnimating;
    }

    // â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        this._updateNetBackdrop();
        this._updateCornerGlitches();
        const interactionAnimating = this._updateInteractionAnimations();
        if (this.fadeIn < 1) {
            this.fadeIn = Math.min(1, this.fadeIn + 1 / this.entryDuration);
        }
        if (this.entryFade > 0) {
            this.entryFade = Math.max(0, this.entryFade - 1 / this.entryDuration);
        }
        if (this.errorTimer > 0) {
            this.errorTimer--;
            if (this.errorTimer === 0) {
                this.errorMsg = '';
                Manager.Stack.requestPaintHUD = true;
            }
        }
        if (this.isFadingOut) {
            this.fadeOut += 0.05;
            if (this.fadeOut >= 1) {
                Manager.Stack.pop();
                const mainMenu = Manager.Stack.top;
                if (mainMenu && mainMenu.fadeOut !== undefined) {
                    mainMenu.fadeOut = 1;
                    mainMenu.isFadingIn = true;
                }
            }
            Manager.Stack.requestPaintHUD = true;
            return; // Stop updating other elements during fade
        }

        if (this.animTick % 2 === 0 || this.fadeIn < 1 || this.entryFade > 0 || interactionAnimating) {
            Manager.Stack.requestPaintHUD = true;
        }
    }

    draw3D() { Manager.GL.renderer.clear(); }

    // â”€â”€ Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    drawHUD() {
        const ctx  = Common.Platform.ctx;
        const SW   = Common.ScreenResolution.SCREEN_X;
        const SH   = Common.ScreenResolution.SCREEN_Y;
        const cW   = ctx.canvas.width;
        const cH   = ctx.canvas.height;
        const sX   = cW / SW;
        const sY   = cH / SH;
        const font = IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';

        ctx.save();

        if (!this._netBgSeedSize || this._netBgSeedSize[0] !== cW || this._netBgSeedSize[1] !== cH) {
            this._seedNetBackdrop(cW, cH);
        }
        this._drawNetBackdrop(ctx, cW, cH, sX, sY);

        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, cW, cH);


        const layout = this._getPanelLayout(SW, SH);
        const panelW = layout.panelW;
        const panelH = layout.panelH;
        const panelX = layout.panelX;
        const panelY = layout.panelY;
        const px = panelX * sX, py = panelY * sY;
        const pw = panelW * sX, ph = panelH * sY;

        ctx.save();
        IP2Live.PopupChrome.animate(ctx,{x:px,y:py,w:pw,h:ph},this.animTick*0.085);

        this._drawHologramPanel(ctx, px, py, pw, ph, sX, sY);

        ctx.font = 'bold ' + (21 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        IP2Live.PopupChrome.text(ctx, 'INFILTRATOR DESIGNATION', (panelX + panelW / 2) * sX, (panelY + 34) * sY, 1.2 * sX);

        ctx.fillStyle = '#75c8d030';
        ctx.fillRect((panelX + 28) * sX, (panelY + 51) * sY, (panelW - 56) * sX, sY);

        ctx.font = 'bold ' + (10 * sX) + 'px ' + font;
        ctx.fillStyle = 'rgba(0,240,255,0.82)';
        ctx.textAlign = 'left';
        ctx.fillText('INFILTRATOR NAME', (panelX + 28) * sX, (panelY + 76) * sY);

        const inputX = layout.inputX;
        const inputY = layout.inputY;
        const inputW = layout.inputW;
        const inputH = layout.inputH;
        const currentText = this.inputEl ? this.inputEl.value : '';
        const showCursor = Math.floor(this.animTick / 18) % 2 === 0;

        const ix = inputX * sX;
        const iy = inputY * sY;
        const iw = inputW * sX;
        const ih = inputH * sY;
        this._traceBeveledRect(ctx, ix, iy, iw, ih, 4 * Math.min(sX, sY));
        ctx.fillStyle = '#070e17'; ctx.fill();
        ctx.strokeStyle = this.inputActivity > 0.1 ? '#7dcbd2' : '#486d7b';
        ctx.lineWidth = Math.min(sX, sY); ctx.stroke();

        if (currentText) {
            this._drawAnimatedInputText(
                ctx,
                currentText,
                (inputX + 16) * sX,
                (inputY + inputH * 0.66) * sY,
                sX,
                sY,
                font,
                showCursor
            );
        } else {
            ctx.font = (18 * sX) + 'px ' + font;
            ctx.fillStyle = 'rgba(218,238,255,0.34)';
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
            ctx.fillText('Type your name' + (showCursor ? '  |' : ''), (inputX + 16) * sX, (inputY + inputH * 0.66) * sY);
        }

        if (this.errorMsg) {
            ctx.font = (9 * sX) + 'px ' + font;
            ctx.fillStyle = '#FF4466';
            ctx.textAlign = 'center';
            ctx.fillText(this.errorMsg, (panelX + panelW / 2) * sX, (inputY + inputH + 15) * sY);
        }

        this._drawBtn(
            ctx, sX, sY,
            layout.backX, layout.buttonY, layout.buttonW, layout.buttonH,
            'BACK', this.hoverBack, true, font
        );
        this._drawBtn(
            ctx, sX, sY,
            layout.confirmX, layout.buttonY, layout.buttonW, layout.buttonH,
            'CONFIRM', this.hoverConfirm, false, font
        );



        ctx.restore();
        ctx.globalAlpha = 1;


        if (this.isFadingOut) {
            ctx.globalAlpha = Math.min(this.fadeOut, 1);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cW, cH);
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    _traceBeveledRect(ctx, x, y, w, h, cut) {
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut);
        ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
    }

    _drawBevelFacets(ctx, x, y, w, h, cut, depth, accent) {
        const isDanger = accent === '#FF003C';
        const bright = isDanger ? 'rgba(255,112,151,0.42)' : 'rgba(157,251,255,0.46)';
        const face = isDanger ? 'rgba(255,0,60,0.27)' : 'rgba(0,240,255,0.25)';
        const side = isDanger ? 'rgba(106,0,35,0.48)' : 'rgba(0,75,104,0.48)';
        const shadow = isDanger ? 'rgba(38,0,17,0.72)' : 'rgba(0,12,25,0.78)';
        const d = Math.max(1, Math.min(depth, cut * 0.48, h * 0.18));

        ctx.save();

        const topFace = ctx.createLinearGradient(0, y, 0, y + d);
        topFace.addColorStop(0, bright);
        topFace.addColorStop(0.36, face);
        topFace.addColorStop(1, 'rgba(0,0,0,0.08)');
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w - cut - d, y + d);
        ctx.lineTo(x + cut + d, y + d);
        ctx.closePath();
        ctx.fillStyle = topFace;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut);
        ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x + w - cut - d, y + h - d);
        ctx.lineTo(x + w - d, y + h - cut - d);
        ctx.lineTo(x + w - d, y + cut + d);
        ctx.lineTo(x + w - cut - d, y + d);
        ctx.closePath();
        const rightFace = ctx.createLinearGradient(x + w - d, 0, x + w, 0);
        rightFace.addColorStop(0, face);
        rightFace.addColorStop(1, side);
        ctx.fillStyle = rightFace;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + w - cut, y + h);
        ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x + cut + d, y + h - d);
        ctx.lineTo(x + w - cut - d, y + h - d);
        ctx.closePath();
        const bottomFace = ctx.createLinearGradient(0, y + h - d, 0, y + h);
        bottomFace.addColorStop(0, side);
        bottomFace.addColorStop(1, shadow);
        ctx.fillStyle = bottomFace;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut);
        ctx.lineTo(x, y + cut);
        ctx.lineTo(x + cut, y);
        ctx.lineTo(x + cut + d, y + d);
        ctx.lineTo(x + d, y + cut + d);
        ctx.lineTo(x + d, y + h - cut - d);
        ctx.lineTo(x + cut + d, y + h - d);
        ctx.closePath();
        const leftFace = ctx.createLinearGradient(x, 0, x + d, 0);
        leftFace.addColorStop(0, side);
        leftFace.addColorStop(1, 'rgba(255,255,255,0.035)');
        ctx.fillStyle = leftFace;
        ctx.fill();

        this._traceBeveledRect(ctx, x + d, y + d, w - d * 2, h - d * 2, Math.max(2, cut - d));
        ctx.strokeStyle = isDanger ? 'rgba(255,169,190,0.18)' : 'rgba(198,252,255,0.2)';
        ctx.lineWidth = Math.max(1, d * 0.24);
        ctx.stroke();
        ctx.restore();
    }

    _drawEdgePlate(ctx, x, y, w, h, slant, accent) {
        const isDanger = accent === '#FF003C';
        const isWarning = accent === '#FFE600';
        const bright = isDanger
            ? 'rgba(255,72,119,0.96)'
            : (isWarning ? 'rgba(255,250,116,0.98)' : 'rgba(82,250,255,0.96)');
        const mid = isDanger
            ? 'rgba(255,0,60,0.82)'
            : (isWarning ? 'rgba(255,224,0,0.9)' : 'rgba(0,184,211,0.84)');
        const dark = isDanger
            ? 'rgba(74,0,31,0.96)'
            : (isWarning ? 'rgba(91,72,0,0.96)' : 'rgba(0,52,77,0.96)');
        const skew = Math.min(slant, w * 0.2);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + skew + 2, y + 2);
        ctx.lineTo(x + w + 2, y + 2);
        ctx.lineTo(x + w - skew + 2, y + h + 2);
        ctx.lineTo(x + 2, y + h + 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,8,0.76)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + skew, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - skew, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        const plateGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        plateGrad.addColorStop(0, bright);
        plateGrad.addColorStop(0.36, mid);
        plateGrad.addColorStop(1, dark);
        ctx.fillStyle = plateGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.34)';
        ctx.lineWidth = 0.65;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + skew + 1, y + 0.6);
        ctx.lineTo(x + w - 1, y + 0.6);
        ctx.strokeStyle = 'rgba(255,255,255,0.48)';
        ctx.stroke();
        ctx.restore();
    }

    _drawSectionRail(ctx, x, y, w, h, sX, sY) {
        const unit = Math.min(sX, sY);
        this._drawEdgePlate(ctx, x, y, w, h, 7 * unit, '#00F0FF');

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + 9 * unit, y + h * 0.28);
        ctx.lineTo(x + w - 13 * unit, y + h * 0.28);
        ctx.lineTo(x + w - 18 * unit, y + h * 0.72);
        ctx.lineTo(x + 5 * unit, y + h * 0.72);
        ctx.closePath();
        ctx.fillStyle = 'rgba(1,8,20,0.76)';
        ctx.fill();

        this._drawEdgePlate(ctx, x, y - 0.4 * sY, w * 0.17, h * 0.65, 5 * unit, '#FF003C');
        this._drawEdgePlate(ctx, x + w * 0.56, y - 0.5 * sY, w * 0.09, h * 0.72, 4 * unit, '#00F0FF');
        ctx.restore();
    }

    _drawCornerArmor(ctx, x, y, flipX, flipY, unit, accent) {
        const isDanger = accent === '#FF003C';
        const points = [
            [0, 0], [28, 0], [22, 4], [8, 4],
            [8, 13], [3, 20], [0, 20],
        ];

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const px = x + points[i][0] * flipX * unit;
            const py = y + points[i][1] * flipY * unit;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const capGrad = ctx.createLinearGradient(x, y, x + 24 * flipX * unit, y + 16 * flipY * unit);
        capGrad.addColorStop(0, 'rgba(232,254,255,0.72)');
        capGrad.addColorStop(0.28, isDanger ? 'rgba(255,24,86,0.9)' : 'rgba(0,240,255,0.9)');
        capGrad.addColorStop(1, isDanger ? 'rgba(71,0,31,0.92)' : 'rgba(0,48,77,0.94)');
        ctx.fillStyle = capGrad;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * unit;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(218,252,255,0.58)';
        ctx.lineWidth = Math.max(1, 0.8 * unit);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + 3 * flipX * unit, y + 3 * flipY * unit);
        ctx.lineTo(x + 21 * flipX * unit, y + 3 * flipY * unit);
        ctx.lineTo(x + 17 * flipX * unit, y + 5 * flipY * unit);
        ctx.lineTo(x + 6 * flipX * unit, y + 5 * flipY * unit);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
        ctx.restore();
    }

    _drawHologramPanel(ctx, px, py, pw, ph, sX, sY) {
        IP2Live.PopupChrome.panel(ctx, px, py, pw, ph, sX, sY, false, this.animTick);
    }

    _getAnimatedNameGlyph(target, animation, index) {
        if (!animation || target === ' ') return target;
        const elapsed = Math.max(0, (this.animTick || 0) - animation.startedAt);
        if (elapsed >= animation.duration) return target;

        const codeGlyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&<>/\\';
        const phase = Math.floor(elapsed / 2);
        const glyphIndex = (animation.seed + phase * 19 + index * 7) % codeGlyphs.length;
        return codeGlyphs.charAt(glyphIndex);
    }

    _drawAnimatedInputText(ctx, text, x, baseline, sX, sY, font, showCursor) {
        if (text !== this._lastInputValue) this._syncNameGlyphs(text);

        ctx.save();
        ctx.font = (18 * sX) + 'px ' + font;
        ctx.textAlign = 'left';
        let cursorX = x;

        for (let i = 0; i < text.length; i++) {
            const target = text[i];
            const animation = this.nameGlyphAnimations[i];
            const elapsed = animation ? Math.max(0, (this.animTick || 0) - animation.startedAt) : 999;
            const active = animation && elapsed < animation.duration && target !== ' ';
            const glyph = this._getAnimatedNameGlyph(target, animation, i);
            const settle = active ? Math.min(1, elapsed / animation.duration) : 1;
            const jitterY = active ? Math.sin((elapsed + i) * 2.4) * (1 - settle) * 2.2 * sY : 0;

            if (active) {
                ctx.globalAlpha = 0.38 * (1 - settle);
                ctx.fillStyle = '#FF003C';
                ctx.fillText(glyph, cursorX + 1.5 * sX, baseline + jitterY);
                ctx.fillStyle = '#00F0FF';
                ctx.fillText(glyph, cursorX - 1.5 * sX, baseline - jitterY);
            }

            ctx.globalAlpha = 1;
            ctx.fillStyle = active ? '#FFE600' : '#EAF6FF';
            ctx.shadowColor = active ? 'rgba(255,230,0,0.78)' : 'rgba(0,240,255,0.48)';
            ctx.shadowBlur = active ? 8 * sX : 4 * sX;
            ctx.fillText(glyph, cursorX, baseline + jitterY * 0.35);
            cursorX += ctx.measureText(target).width + 0.45 * sX;
        }

        ctx.shadowBlur = 0;
        if (showCursor) {
            ctx.fillStyle = '#00F0FF';
            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 7 * sX;
            ctx.fillRect(cursorX + 2 * sX, baseline - 17 * sY, 1.5 * sX, 20 * sY);
        }
        ctx.restore();
    }

    _getButtonTransitionLabel(label, hoverMix, seed) {
        if (hoverMix <= 0.015 || hoverMix >= 0.985) return label;
        const codeGlyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$<>/';
        const intensity = Math.sin(hoverMix * Math.PI);
        let result = '';

        for (let i = 0; i < label.length; i++) {
            const shouldScramble = ((i * 31 + Math.floor((this.animTick || 0) / 2) * 17 + seed) % 100) < intensity * 72;
            const glyphIndex = (i * 13 + Math.floor((this.animTick || 0) / 2) * 7 + seed) % codeGlyphs.length;
            result += shouldScramble ? codeGlyphs[glyphIndex] : label[i];
        }
        return result;
    }

    _drawBtn(ctx, scaleX, scaleY, bx, by, bw, bh, label, isHover, isDanger, font) {
        const mix = this.buttonHoverMix
            ? (isDanger ? this.buttonHoverMix.back : this.buttonHoverMix.confirm) : (isHover ? 1 : 0);
        IP2Live.PopupChrome.button(ctx, { x: bx, y: by, w: bw, h: bh }, scaleX, scaleY,
            label, font, mix, this.animTick, isDanger);
    }

    _seedNetBackdrop(cW, cH) {
        this._netBgSeedSize = [cW, cH];
        this.netBgPackets = [];
        this.netBgBits = [];
        this.netBgNodes = [];
        this.netBgWires = [];

        for (let i = 0; i < 24; i++) {
            this.netBgNodes.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                r: 1.8 + Math.random() * 2.2,
                p: Math.random() * Math.PI * 2
            });
        }

        for (let i = 0; i < 10; i++) {
            const y = cH * (0.14 + i * 0.08 + Math.random() * 0.02);
            const slope = -0.20 - Math.random() * 0.2;
            this.netBgWires.push({
                y,
                slope,
                speed: 0.8 + Math.random() * 2.4,
                phase: Math.random() * cW
            });
        }

        for (let i = 0; i < 28; i++) {
            this.netBgPackets.push({
                wire: i % this.netBgWires.length,
                t: Math.random(),
                speed: 0.0012 + Math.random() * 0.0035,
                size: 4 + Math.random() * 7,
                color: Math.random() > 0.72 ? '#FF2D6D' : '#00E9FF'
            });
        }

        const chars = ['0', '1', '::', '{}', '0x', '<>', '//', '10', '01', 'FF', '&&', '!='];
        for (let i = 0; i < 80; i++) {
            this.netBgBits.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                vy: 0.14 + Math.random() * 0.55,
                vx: -0.07 + Math.random() * 0.14,
                size: 6 + Math.random() * 6,
                alpha: 0.07 + Math.random() * 0.2,
                glyph: chars[Math.floor(Math.random() * chars.length)],
                flip: 24 + Math.floor(Math.random() * 64)
            });
        }
    }

    _updateNetBackdrop() {
        if (!this._netBgSeedSize) return;
        const cW = this._netBgSeedSize[0];
        const cH = this._netBgSeedSize[1];

        for (let i = 0; i < this.netBgPackets.length; i++) {
            const p = this.netBgPackets[i];
            p.t += p.speed;
            if (p.t > 1.08) p.t = -0.08;
        }

        for (let i = 0; i < this.netBgBits.length; i++) {
            const b = this.netBgBits[i];
            b.y += b.vy;
            b.x += b.vx;
            b.flip--;
            if (b.flip <= 0) {
                b.flip = 24 + Math.floor(Math.random() * 64);
                if (Math.random() > 0.65) b.glyph = (b.glyph === '0' ? '1' : '0');
            }
            if (b.y > cH + 24) {
                b.y = -20;
                b.x = Math.random() * cW;
            }
            if (b.x < -24) b.x = cW + 12;
            if (b.x > cW + 24) b.x = -12;
        }
    }

    _drawNetBackdrop(ctx, cW, cH, sX, sY) {
        const base = ctx.createLinearGradient(0, 0, cW, cH);
        base.addColorStop(0, '#030816');
        base.addColorStop(0.38, '#041126');
        base.addColorStop(1, '#0A0620');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, cW, cH);

        this._drawNetSlantedGrid(ctx, cW, cH, sX, sY);
        this._drawNetWireMatrix(ctx, cW, cH, sX, sY, this.animTick || 0);
        this._drawNetPacketFlow(ctx, cW, cH, sX, sY);
        this._drawNetFloatingBits(ctx, sX);

        const vignette = ctx.createRadialGradient(cW * 0.5, cH * 0.48, cW * 0.08, cW * 0.5, cH * 0.5, cW * 0.74);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, cW, cH);
    }

    _drawNetSlantedGrid(ctx, cW, cH, sX, sY) {
        const shear = 0.24;
        ctx.save();
        ctx.transform(1, 0, -shear, 1, cW * 0.24, 0);
        for (let x = -cW * 0.4; x < cW * 1.35; x += 42 * sX) {
            ctx.strokeStyle = 'rgba(0,232,255,0.10)';
            ctx.lineWidth = 1 * sX;
            ctx.beginPath();
            ctx.moveTo(x, cH * 0.04);
            ctx.lineTo(x, cH * 0.98);
            ctx.stroke();
        }
        ctx.restore();

        for (let y = cH * 0.12; y < cH; y += 28 * sY) {
            const fade = 0.06 + ((y / cH) * 0.12);
            ctx.strokeStyle = 'rgba(0,232,255,' + fade.toFixed(3) + ')';
            ctx.lineWidth = 1 * sY;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(cW, y - 36 * sY);
            ctx.stroke();
        }
    }

    _drawNetWireMatrix(ctx, cW, cH, sX, sY, t) {
        ctx.save();
        for (let i = 0; i < this.netBgWires.length; i++) {
            const w = this.netBgWires[i];
            const pulse = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.03 + i * 0.9));
            ctx.strokeStyle = (i % 3 === 0)
                ? 'rgba(255,52,112,' + (pulse * 0.9).toFixed(3) + ')'
                : 'rgba(0,240,255,' + pulse.toFixed(3) + ')';
            ctx.lineWidth = (i % 4 === 0 ? 1.4 : 1.0) * sX;
            ctx.beginPath();
            ctx.moveTo(-60 * sX, w.y + 12 * sY);
            ctx.lineTo(cW + 60 * sX, w.y + w.slope * cW);
            ctx.stroke();

            const laneX = (w.phase + t * w.speed) % (cW + 140 * sX) - 70 * sX;
            const laneY = w.y + w.slope * laneX;
            ctx.fillStyle = 'rgba(255,230,0,0.66)';
            ctx.fillRect(laneX, laneY - 1.5 * sY, 16 * sX, 3 * sY);
        }
        ctx.restore();
    }

    _drawNetPacketFlow(ctx, cW, cH, sX, sY) {
        ctx.save();
        for (let i = 0; i < this.netBgPackets.length; i++) {
            const p = this.netBgPackets[i];
            const w = this.netBgWires[p.wire];
            if (!w) continue;
            const x = p.t * (cW + 90 * sX) - 45 * sX;
            const y = w.y + w.slope * x;
            const sw = p.size * sX;
            const sh = Math.max(2 * sY, p.size * 0.42 * sY);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-0.16);
            ctx.fillStyle = p.color === '#FF2D6D' ? 'rgba(255,45,109,0.82)' : 'rgba(0,233,255,0.86)';
            ctx.fillRect(-sw * 0.5, -sh * 0.5, sw, sh);
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 1 * sX;
            ctx.strokeRect(-sw * 0.5, -sh * 0.5, sw, sh);
            ctx.restore();
        }

        for (let i = 0; i < this.netBgNodes.length; i++) {
            const n = this.netBgNodes[i];
            const glow = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin((this.animTick || 0) * 0.04 + n.p));
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * sX, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(90,232,255,' + glow.toFixed(3) + ')';
            ctx.fill();
        }
        ctx.restore();
    }

    _drawNetFloatingBits(ctx, sX) {
        ctx.save();
        for (let i = 0; i < this.netBgBits.length; i++) {
            const b = this.netBgBits[i];
            ctx.globalAlpha = b.alpha;
            ctx.fillStyle = (i % 9 === 0) ? '#FF4A84' : '#7CE8FF';
            ctx.font = Math.round(b.size * sX) + 'px ' +
                (IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif');
            ctx.fillText(b.glyph, b.x, b.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _ensureCornerGlitches(panelWpx, panelHpx, sX, sY) {
        if (this._cornerGlitchesSeeded) return;
        this.cornerGlitches = [];
        for (let i = 0; i < 14; i++) {
            this.cornerGlitches.push(this._spawnCornerGlitch(panelWpx, panelHpx, sX, sY));
        }
        this._cornerGlitchPanelSize = [panelWpx, panelHpx];
        this._cornerGlitchesSeeded = true;
    }

    _spawnCornerGlitch(panelWpx, panelHpx, sX, sY) {
        const corner = Math.floor(Math.random() * 4); // 0 tl, 1 tr, 2 bl, 3 br
        const dirX = corner === 0 || corner === 2 ? -1 : 1;
        const dirY = corner === 0 || corner === 1 ? -1 : 1;
        const colors = ['#00F0FF', '#FF003C', '#FFE600', '#DAEEFF'];
        const life = 18 + Math.random() * 28;
        return {
            panelWpx,
            panelHpx,
            corner,
            x: (Math.random() * 14 - 7) * sX,
            y: (Math.random() * 14 - 7) * sY,
            vx: dirX * (0.8 + Math.random() * 2.0) * sX,
            vy: dirY * (0.5 + Math.random() * 1.6) * sY,
            w: (7 + Math.random() * 22) * sX,
            h: (2 + Math.random() * 8) * sY,
            skew: (3 + Math.random() * 8) * sX * (Math.random() > 0.5 ? 1 : -1),
            rot: (Math.random() - 0.5) * 0.9,
            alpha: 0.26 + Math.random() * 0.48,
            color: colors[Math.floor(Math.random() * colors.length)],
            life,
            maxLife: life,
        };
    }

    _updateCornerGlitches() {
        if (!this.cornerGlitches || this.cornerGlitches.length === 0) return;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const sX = cW / SW;
        const sY = cH / SH;
        const panelWpx = this._cornerGlitchPanelSize ? this._cornerGlitchPanelSize[0] : 500 * sX;
        const panelHpx = this._cornerGlitchPanelSize ? this._cornerGlitchPanelSize[1] : 218 * sY;

        for (let i = 0; i < this.cornerGlitches.length; i++) {
            const g = this.cornerGlitches[i];
            g.x += g.vx;
            g.y += g.vy;
            g.vx *= 0.96;
            g.vy *= 0.96;
            g.life -= 1;
            if (g.life <= 0) {
                this.cornerGlitches[i] = this._spawnCornerGlitch(panelWpx, panelHpx, sX, sY);
            }
        }
    }

    _drawCornerGlitchBursts(ctx, px, py, pw, ph, sX, sY) {
        if (!this.cornerGlitches || this.cornerGlitches.length === 0) return;

        const anchors = [
            { x: px,      y: py },
            { x: px + pw, y: py },
            { x: px,      y: py + ph },
            { x: px + pw, y: py + ph },
        ];
        const t = this.animTick || 0;

        ctx.save();
        for (let i = 0; i < this.cornerGlitches.length; i++) {
            const g = this.cornerGlitches[i];
            const a = anchors[g.corner];
            if (!a) continue;
            const lifeRatio = Math.max(0, Math.min(1, g.life / g.maxLife));
            const alpha = g.alpha * lifeRatio;
            const jitterX = Math.sin((t + i * 7) * 0.14) * 1.2 * sX;
            const jitterY = Math.cos((t + i * 5) * 0.10) * 1.0 * sY;
            const gx = a.x + g.x + jitterX;
            const gy = a.y + g.y + jitterY;

            ctx.save();
            ctx.translate(gx, gy);
            ctx.rotate(g.rot + Math.sin((t + i) * 0.05) * 0.06);
            ctx.globalAlpha = alpha;

            ctx.beginPath();
            ctx.moveTo(-g.w / 2 + g.skew, -g.h / 2);
            ctx.lineTo(g.w / 2, -g.h / 2);
            ctx.lineTo(g.w / 2 - g.skew, g.h / 2);
            ctx.lineTo(-g.w / 2, g.h / 2);
            ctx.closePath();

            ctx.fillStyle = g.color;
            ctx.fill();
            ctx.shadowColor = g.color;
            ctx.shadowBlur = 8 * sX;
            ctx.strokeStyle = 'rgba(255,255,255,0.44)';
            ctx.lineWidth = 1 * sX;
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }

    _easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    _easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
}
window.IP2LiveNameInputScreen = IP2LiveNameInputScreen;
console.log('[IP2Live] name-input.js loaded.');
