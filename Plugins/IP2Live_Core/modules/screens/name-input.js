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
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
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
            IP2Live.MapManager.goToTutorial({ useLoading: false });
        };

        if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
            IP2Live.LoadingScreen.show({
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
            confirmRect: { x: (panelX + 30) * sX,                  y: btnY * sY, w: btnW * sX, h: btnH * sY },
            backRect:    { x: (panelX + panelW - 30 - btnW) * sX,  y: btnY * sY, w: btnW * sX, h: btnH * sY },
        };
    }

    // â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        this.bgFx.update(this.animTick);
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

        this.bgFx.drawBg(ctx, IP2Live.Assets.bgImage, cW, cH);
        this.bgFx.drawParticles(ctx, sX);

        ctx.fillStyle = 'rgba(0,0,0,0.78)';
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

        IP2Live.UI.drawCyberPanel({
            ctx,
            x: px,
            y: py,
            w: pw,
            h: ph,
            scaleX: sX,
            accent: '#00F0FF',
            title: 'SYS::PROFILE_INIT > AWAITING_INPUT'
        });

        ctx.beginPath();
        ctx.moveTo(px + pw - 150 * sX, py);
        ctx.lineTo(px + pw - 18 * sX, py);
        ctx.lineTo(px + pw - 40 * sX, py + 34 * sY);
        ctx.lineTo(px + pw - 172 * sX, py + 34 * sY);
        ctx.closePath();
        ctx.fillStyle = '#FF003C';
        ctx.fill();

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
        const sl = 14 * sX;
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

        const chargeW = iw * Math.min(1, currentText.length / 24);
        ctx.fillStyle = 'rgba(255,230,0,0.86)';
        ctx.fillRect(ix + 18 * sX, iy + ih - 7 * sY, Math.max(14 * sX, chargeW - 36 * sX), 3 * sY);

        ctx.font = `italic ${18 * sX}px ${font}`;
        ctx.fillStyle = '#FFE600';
        ctx.textAlign = 'left';
        ctx.fillText(currentText + (showCursor ? '_' : ' '), (inputX + 14) * sX, (inputY + inputH * 0.68) * sY);

        if (this.errorMsg) {
            ctx.font = (10 * sX) + 'px monospace';
            ctx.fillStyle = '#FF4466';
            ctx.textAlign = 'center';
            ctx.fillText(this.errorMsg, (panelX + panelW / 2) * sX, (inputY + inputH + 18) * sY);
        }

        const btnW = 200, btnH = 44;
        const btnY = panelY + panelH - 72;

        this._drawBtn(ctx, sX, sY, panelX + 30, btnY, btnW, btnH, '[ CONFIRM ]', this.hoverConfirm, false);
        this._drawBtn(ctx, sX, sY, panelX + panelW - 30 - btnW, btnY, btnW, btnH, '[ BACK ]', this.hoverBack, true);

        ctx.font = (8 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.fillText('// INPUT REQUIRED TO ESTABLISH PERSISTENT RECORD',
            (panelX + panelW / 2) * sX, (panelY + panelH - 14) * sY);

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
        IP2Live.UI.drawCyberButton({
            ctx,
            x: bx * scaleX,
            y: by * scaleY,
            w: bw * scaleX,
            h: bh * scaleY,
            scaleX, scaleY,
            label,
            isActive: isHover,
            isDanger,
            animTick: this.animTick
        });
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

