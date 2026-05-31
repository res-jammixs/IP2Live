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
        this.hoverConfirm = false;
        this.hoverBack = false;
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
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
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

    async _tryConfirm() {
        const rawName = this.inputEl ? this.inputEl.value.trim() : '';
        if (!rawName) {
            Data.Systems.soundImpossible.playSound();
            this.errorMsg = 'DESIGNATION REQUIRED â€” CANNOT BE EMPTY';
            this.errorTimer = 120;
            Manager.Stack.requestPaintHUD = true;
            return;
        }

        this.confirmed = true;
        Data.Systems.soundConfirmation.playSound();

        await IP2Live.DBManager.saveRecord('profiles', {
            infiltratorName: rawName,
            createdAt:       Date.now(),
            playTime:        0,
            currentMapId:    1,
        });

        Core.Game.current = new Core.Game();
        Core.Game.current.initializeDefault();
        Core.Game.current.infiltratorName = rawName;

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

        const panelW = 580, panelH = 380;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;

        const btnW = 200, btnH = 44;
        const btnY = panelY + panelH - 72;

        return {
            backRect:    { x: (panelX + 30) * sX,                  y: btnY * sY, w: btnW * sX, h: btnH * sY },
            confirmRect: { x: (panelX + panelW - 30 - btnW) * sX,  y: btnY * sY, w: btnW * sX, h: btnH * sY },
        };
    }

    // â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        this._updateNetBackdrop();
        this._updateCornerGlitches();
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

        if (this.animTick % 2 === 0 || this.fadeIn < 1 || this.entryFade > 0) Manager.Stack.requestPaintHUD = true;
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
        const font = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';

        ctx.save();

        if (!this._netBgSeedSize || this._netBgSeedSize[0] !== cW || this._netBgSeedSize[1] !== cH) {
            this._seedNetBackdrop(cW, cH);
        }
        this._drawNetBackdrop(ctx, cW, cH, sX, sY);

        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, cW, cH);

        const easeIn = this._easeOutCubic(Math.min(this.fadeIn, 1));
        const panelLift = (1 - easeIn) * 24 * sY;

        const panelW = 580, panelH = 380;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const px = panelX * sX, py = panelY * sY;
        const pw = panelW * sX, ph = panelH * sY;

        ctx.save();
        ctx.globalAlpha = easeIn;
        ctx.translate(0, panelLift);

        this._ensureCornerGlitches(panelW * sX, panelH * sY, sX, sY);

        // New panel shell (replaces old shared CyberPanel layer to avoid overlap).
        const shellCut = 26 * sX;
        ctx.beginPath();
        ctx.moveTo(px + shellCut, py);
        ctx.lineTo(px + pw, py);
        ctx.lineTo(px + pw - 10 * sX, py + ph);
        ctx.lineTo(px, py + ph);
        ctx.lineTo(px, py + 28 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(2,6,18,0.95)';
        ctx.fill();

        ctx.save();
        ctx.clip();
        const shellGrad = ctx.createLinearGradient(px, py, px + pw, py + ph);
        shellGrad.addColorStop(0, 'rgba(255,0,60,0.10)');
        shellGrad.addColorStop(0.32, 'rgba(0,240,255,0.11)');
        shellGrad.addColorStop(1, 'rgba(255,230,0,0.05)');
        ctx.fillStyle = shellGrad;
        ctx.fillRect(px, py, pw, ph);

        for (let sy = py; sy < py + ph; sy += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.022)';
            ctx.fillRect(px, sy, pw, 1 * sY);
        }
        const scanY = py + ((this.animTick * 1.1) % ph);
        ctx.fillStyle = 'rgba(0,240,255,0.06)';
        ctx.fillRect(px, scanY, pw, 8 * sY);
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(px + shellCut, py);
        ctx.lineTo(px + pw, py);
        ctx.lineTo(px + pw - 10 * sX, py + ph);
        ctx.lineTo(px, py + ph);
        ctx.lineTo(px, py + 28 * sY);
        ctx.closePath();
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1.8 * sX;
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 14 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Persona-inspired edge rails and layered top ribbons.
        const topRibbonY = py + 2 * sY;
        ctx.beginPath();
        ctx.moveTo(px + 28 * sX, topRibbonY);
        ctx.lineTo(px + 266 * sX, topRibbonY);
        ctx.lineTo(px + 248 * sX, topRibbonY + 20 * sY);
        ctx.lineTo(px + 14 * sX, topRibbonY + 20 * sY);
        ctx.closePath();
        const topRibbonGrad = ctx.createLinearGradient(px + 14 * sX, topRibbonY, px + 266 * sX, topRibbonY);
        topRibbonGrad.addColorStop(0, 'rgba(255,0,60,0.96)');
        topRibbonGrad.addColorStop(0.72, 'rgba(70,0,30,0.92)');
        topRibbonGrad.addColorStop(1, 'rgba(0,0,0,0.30)');
        ctx.fillStyle = topRibbonGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(px + pw - 180 * sX, topRibbonY);
        ctx.lineTo(px + pw - 26 * sX, topRibbonY);
        ctx.lineTo(px + pw - 44 * sX, topRibbonY + 24 * sY);
        ctx.lineTo(px + pw - 198 * sX, topRibbonY + 24 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,230,0,0.95)';
        ctx.fill();

        // Cyan side rails for panel depth.
        ctx.fillStyle = 'rgba(0,240,255,0.72)';
        ctx.fillRect(px - 1.5 * sX, py + 30 * sY, 2.5 * sX, ph - 58 * sY);
        ctx.fillRect(px + pw - 1 * sX, py + 30 * sY, 2.5 * sX, ph - 58 * sY);

        ctx.font = (9 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.5)';
        ctx.textAlign = 'left';
        ctx.fillText('SYS::PROFILE_INIT > AWAITING_INPUT', (panelX + 18) * sX, (panelY + 18) * sY);

        ctx.font = 'bold ' + (26 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.fillText('INFILTRATOR DESIGNATION', (panelX + panelW / 2) * sX, (panelY + 60) * sY);

        ctx.strokeStyle = 'rgba(0,255,255,0.25)';
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo((panelX + 20) * sX, (panelY + 72) * sY);
        ctx.lineTo((panelX + panelW - 20) * sX, (panelY + 72) * sY);
        ctx.stroke();

        ctx.font = (12 * sX) + 'px monospace';
        ctx.fillStyle = '#00FFFF';
        ctx.textAlign = 'left';
        ctx.fillText('ENTER DESIGNATION >', (panelX + 30) * sX, (panelY + 118) * sY);

        const inputX = panelX + 30;
        const inputY = panelY + 130;
        const inputW = panelW - 60;
        const inputH = 48;
        const currentText = this.inputEl ? this.inputEl.value : '';
        const showCursor = Math.floor(this.animTick / 18) % 2 === 0;

        const ix = inputX * sX;
        const iy = inputY * sY;
        const iw = inputW * sX;
        const ih = inputH * sY;
        const sl = 16 * sX;
        ctx.beginPath();
        ctx.moveTo(ix + sl, iy);
        ctx.lineTo(ix + iw, iy);
        ctx.lineTo(ix + iw - sl, iy + ih);
        ctx.lineTo(ix, iy + ih);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,240,255,0.07)';
        ctx.fill();
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1.5 * sX;
        ctx.shadowBlur = 0;
        ctx.stroke();

        const inputGrad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
        inputGrad.addColorStop(0, 'rgba(255,0,60,0.08)');
        inputGrad.addColorStop(0.34, 'rgba(0,240,255,0.10)');
        inputGrad.addColorStop(1, 'rgba(255,230,0,0.06)');
        ctx.fillStyle = inputGrad;
        ctx.fill();

        // Beveled frame and charge strips for a stronger input identity.
        ctx.strokeStyle = 'rgba(255,255,255,0.24)';
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo(ix + sl + 2 * sX, iy + 4 * sY);
        ctx.lineTo(ix + iw - 22 * sX, iy + 4 * sY);
        ctx.lineTo(ix + iw - sl - 5 * sX, iy + ih - 5 * sY);
        ctx.lineTo(ix + 8 * sX, iy + ih - 5 * sY);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = 'rgba(0,240,255,0.55)';
        ctx.fillRect(ix + 22 * sX, iy + ih - 11 * sY, 58 * sX, 2.2 * sY);
        ctx.fillStyle = 'rgba(255,0,60,0.52)';
        ctx.fillRect(ix + iw - 92 * sX, iy + 8 * sY, 52 * sX, 2.2 * sY);

        const chargeW = iw * Math.min(1, currentText.length / 24);
        ctx.fillStyle = 'rgba(255,230,0,0.86)';
        ctx.fillRect(ix + 18 * sX, iy + ih - 7 * sY, Math.max(14 * sX, chargeW - 36 * sX), 3 * sY);

        ctx.font = `italic ${19 * sX}px ${font}`;
        ctx.fillStyle = '#EAF6FF';
        ctx.shadowColor = 'rgba(0,240,255,0.8)';
        ctx.shadowBlur = 8 * sX;
        ctx.textAlign = 'left';
        ctx.fillText(currentText + (showCursor ? '_' : ' '), (inputX + 14) * sX, (inputY + inputH * 0.68) * sY);
        ctx.shadowBlur = 0;

        if (this.errorMsg) {
            ctx.font = (10 * sX) + 'px monospace';
            ctx.fillStyle = '#FF4466';
            ctx.textAlign = 'center';
            ctx.fillText(this.errorMsg, (panelX + panelW / 2) * sX, (inputY + inputH + 18) * sY);
        }

        const btnW = 200, btnH = 44;
        const btnY = panelY + panelH - 72;

        this._drawBtn(ctx, sX, sY, panelX + 30, btnY, btnW, btnH, '[ BACK ]', this.hoverBack, true);
        this._drawBtn(ctx, sX, sY, panelX + panelW - 30 - btnW, btnY, btnW, btnH, '[ CONFIRM ]', this.hoverConfirm, false);

        ctx.font = (8 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.fillText('// INPUT REQUIRED TO ESTABLISH PERSISTENT RECORD',
            (panelX + panelW / 2) * sX, (panelY + panelH - 14) * sY);

        this._drawCornerGlitchBursts(ctx, px, py, pw, ph, sX, sY);

        ctx.restore();
        ctx.globalAlpha = 1;

        if (this.entryFade > 0) {
            ctx.globalAlpha = this._easeInOutCubic(this.entryFade);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cW, cH);
            ctx.globalAlpha = 1;
        }
        
        if (this.isFadingOut) {
            ctx.globalAlpha = Math.min(this.fadeOut, 1);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cW, cH);
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    _drawBtn(ctx, scaleX, scaleY, bx, by, bw, bh, label, isHover, isDanger) {
        const x = bx * scaleX;
        const y = by * scaleY;
        const w = bw * scaleX;
        const h = bh * scaleY;
        const tick = this.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.1);

        const accent = isDanger ? '#FF003C' : '#00F0FF';
        const accentSoft = isDanger ? 'rgba(255,0,60,0.35)' : 'rgba(0,240,255,0.35)';
        const topBand = isDanger ? 'rgba(255,62,120,0.96)' : 'rgba(64,255,255,0.96)';
        const baseGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        baseGrad.addColorStop(0, isDanger ? 'rgba(16,3,10,0.94)' : 'rgba(3,10,16,0.94)');
        baseGrad.addColorStop(1, 'rgba(6,10,22,0.96)');

        const cut = 18 * scaleX;
        const notch = 14 * scaleX;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w - notch, y);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.lineTo(x + w - notch, y + h);
        ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x, y + h * 0.64);
        ctx.lineTo(x, y + h * 0.34);
        ctx.closePath();

        ctx.fillStyle = baseGrad;
        ctx.fill();

        const sweep = ctx.createLinearGradient(x, y, x + w, y);
        sweep.addColorStop(0, 'rgba(255,0,60,0.07)');
        sweep.addColorStop(0.28, 'rgba(0,240,255,0.13)');
        sweep.addColorStop(1, 'rgba(255,230,0,0.06)');
        ctx.fillStyle = sweep;
        ctx.fill();

        ctx.strokeStyle = accent;
        ctx.lineWidth = (isHover ? 2.4 : 1.7) * scaleX;
        ctx.shadowColor = accent;
        ctx.shadowBlur = (isHover ? 14 : 8) * scaleX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Top accent strip.
        ctx.beginPath();
        ctx.moveTo(x + 14 * scaleX, y + 2 * scaleY);
        ctx.lineTo(x + 60 * scaleX, y + 2 * scaleY);
        ctx.lineTo(x + 44 * scaleX, y + h * 0.46);
        ctx.lineTo(x + 2 * scaleX, y + h * 0.54);
        ctx.closePath();
        ctx.fillStyle = topBand;
        ctx.fill();

        // Active edge glow.
        if (isHover) {
            ctx.strokeStyle = accentSoft;
            ctx.lineWidth = 3 * scaleX;
            ctx.stroke();
        }

        // Label
        ctx.font = 'bold ' + (12 * scaleX) + 'px ' + (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace');
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.shadowColor = isHover ? accent : 'transparent';
        ctx.shadowBlur = isHover ? 10 * scaleX : 0;
        ctx.fillText(label, x + w * 0.52, y + h * 0.62);
        ctx.shadowBlur = 0;

        // Tiny telemetry dots.
        ctx.fillStyle = isHover ? '#FFE600' : 'rgba(218,238,255,0.56)';
        const dotY = y + h * 0.2;
        for (let i = 0; i < 3; i++) {
            const dx = x + w - (26 + i * 10) * scaleX;
            ctx.beginPath();
            ctx.arc(dx, dotY, (1.1 + (isHover ? pulse * 0.8 : 0)) * scaleX, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
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
            ctx.font = Math.round(b.size * sX) + 'px monospace';
            ctx.fillText(b.glyph, b.x, b.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _ensureCornerGlitches(panelWpx, panelHpx, sX, sY) {
        if (this._cornerGlitchesSeeded) return;
        this.cornerGlitches = [];
        for (let i = 0; i < 26; i++) {
            this.cornerGlitches.push(this._spawnCornerGlitch(panelWpx, panelHpx, sX, sY));
        }
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
        const panelWpx = 580 * sX;
        const panelHpx = 380 * sY;

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

