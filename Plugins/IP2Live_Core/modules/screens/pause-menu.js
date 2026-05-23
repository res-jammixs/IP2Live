/**
 * IP2Live â€” Pause Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/pause-menu.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LivePauseMenu extends Scene.Base {
    constructor() { super(true); }

    initialize() {
        this.selectedIndex = 0;
        this.menuItems = ["RESUME", "RESTART", "EXPORT REPORT", "MAIN MENU", "QUIT GAME"];
        this.hoverIndex = -1;
        this.animTick = 0;
        this.glitchActive = false;
        this.glitchTimer = 0;
        this.pendingAction = null;
        this.scanlineOffset = 0;
        this.bgFx = IP2Live.BgFx.create();
        this.scramble = IP2Live.TextScramble.create(this.menuItems.length);
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._resume();
        }
    }

    onKeyPressedAndRepeat(key) {
        const prev = this.selectedIndex;
        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length;
        }
        if (this.selectedIndex !== prev) {
            this.hoverIndex = -1;  // keyboard took over
            Data.Systems.soundCursor.playSound();
            Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseMove(x, y) {
        const newHover = this._getButtonAt(x, y);
        if (newHover !== this.hoverIndex) {
            this.hoverIndex = newHover;
            if (newHover >= 0 && newHover !== this.selectedIndex) {
                this.selectedIndex = newHover;
                Data.Systems.soundCursor.playSound();
            }
            Manager.Stack.requestPaintHUD = true;
        }
    }

    onMouseUp(x, y) {
        const idx = this._getButtonAt(x, y);
        if (idx >= 0) {
            if (idx !== this.selectedIndex) {
                this.selectedIndex = idx;
                Data.Systems.soundCursor.playSound();
            }
            this._confirmSelection();
        }
    }

    _getButtonAt(x, y) {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const scaleX = cW / SW;
        const scaleY = cH / SH;
        const btnW = 320, btnH = 46;
        const panelW = 420;
        const panelX = (SW - panelW) / 2;
        const bx = panelX + (panelW - btnW) / 2;
        const startY = SH / 2 - 100;
        for (let i = 0; i < this.menuItems.length; i++) {
            const by = startY + i * (btnH + 10);
            if (x >= bx * scaleX && x <= (bx + btnW) * scaleX &&
                y >= by * scaleY && y <= (by + btnH) * scaleY) return i;
        }
        return -1;
    }

    _confirmSelection() {
        Data.Systems.soundConfirmation.playSound();
        this.glitchActive = true;
        this.glitchTimer = 6;
        this.pendingAction = this.selectedIndex;
        Manager.Stack.requestPaintHUD = true;
        const self = this;
        setTimeout(() => { self._executeAction(self.pendingAction); }, 100);
    }

    _resume() {
        Data.Systems.soundCancel.playSound();
        Manager.Stack.pop();
    }

    _executeAction(idx) {
        switch (idx) {
            case 0:
                this._resume();
                break;
            case 1: {
                if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
                    IP2Live.LoadingScreen.show({
                        mode: 'replace',
                        status: 'Loading Next Level',
                        detail: 'Rebuilding current stage state',
                        fadeMusicOnStart: true,
                        musicFadeDurationMs: 2200,
                        onComplete: function () {
                            IP2Live.RestartManager.restartCurrentLevel();
                        },
                    });
                } else {
                    IP2Live.RestartManager.restartCurrentLevel();
                }
                break;
            }
            case 2:
                console.log('[IP2Live] Export Report triggered.');
                Manager.Stack.pop();
                break;
            case 3:
                if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
                    IP2Live.LoadingScreen.show({
                        mode: 'replace',
                        status: 'Loading Main Menu',
                        detail: 'Closing active field session',
                        onComplete: function () {
                            Manager.Stack.popAll();
                            Manager.Stack.push(new IP2LiveMainMenu());
                        },
                    });
                } else {
                    Manager.Stack.popAll();
                    Manager.Stack.push(new IP2LiveMainMenu());
                }
                break;
            case 4:
                Common.Platform.quit();
                break;
        }
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        if (this.glitchTimer > 0) {
            this.glitchTimer--;
            this.glitchActive = this.glitchTimer > 0;
        }
        this.bgFx.update(this.animTick);
        this.scramble.update(this.selectedIndex, this.hoverIndex);
        if (this.animTick % 2 === 0) Manager.Stack.requestPaintHUD = true;
    }

    draw3D() { Manager.GL.renderer.clear(); }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const scaleX = cW / SW;
        const scaleY = cH / SH;

        ctx.save();

        this.bgFx.drawBg(ctx, IP2Live.Assets.bgImage, cW, cH);
        this.bgFx.drawParticles(ctx, scaleX);

        ctx.fillStyle = 'rgba(0,0,10,0.78)';
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#000';
        for (let ly = this.scanlineOffset * scaleY; ly < cH; ly += 4 * scaleY) {
            ctx.fillRect(0, ly, cW, 1.5 * scaleY);
        }
        ctx.globalAlpha = 1;

        const panelW = 420, panelH = 420;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const px = panelX * scaleX, py = panelY * scaleY;
        const pw = panelW * scaleX, ph = panelH * scaleY;

        ctx.fillStyle = 'rgba(0,4,20,0.94)';
        ctx.fillRect(px, py, pw, ph);

        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1.5 * scaleX;
        ctx.shadowBlur = 0;
        ctx.strokeRect(px, py, pw, ph);

        const cs = 18 * scaleX;
        ctx.strokeStyle = '#FFE600';
        ctx.lineWidth = 2 * scaleX;
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(px, py + cs); ctx.lineTo(px, py); ctx.lineTo(px + cs, py); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px + pw - cs, py + ph); ctx.lineTo(px + pw, py + ph); ctx.lineTo(px + pw, py + ph - cs); ctx.stroke();

        this._drawPausedTitle(ctx, scaleX, scaleY, SW, SH, panelX, panelY, panelW);

        const divY = (panelY + 68) * scaleY;
        ctx.strokeStyle = 'rgba(0,255,255,0.25)';
        ctx.lineWidth = 1 * scaleX;
        ctx.beginPath();
        ctx.moveTo((panelX + 20) * scaleX, divY);
        ctx.lineTo((panelX + panelW - 20) * scaleX, divY);
        ctx.stroke();

        const btnW = 320, btnH = 46;
        const bx = panelX + (panelW - btnW) / 2;
        const startY = SH / 2 - 100;

        for (let i = 0; i < this.menuItems.length; i++) {
            const by = startY + i * (btnH + 10);
            this._drawButton(ctx, scaleX, scaleY, bx, by, btnW, btnH, this.menuItems[i],
                i === this.selectedIndex, i === this.hoverIndex, i);
        }

        ctx.font = (8 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.35)';
        ctx.textAlign = 'center';
        ctx.fillText('[ GAME PAUSED â€” SYS::STANDBY ]', (SW / 2) * scaleX, (panelY + panelH - 14) * scaleY);
        ctx.textAlign = 'left';

        ctx.restore();
    }

    _drawPausedTitle(ctx, scaleX, scaleY, SW, SH, panelX, panelY, panelW) {
        const fontName = IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';
        const cx = (panelX + panelW / 2) * scaleX;
        const ty = (panelY + 48) * scaleY;
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + (28 * scaleX) + 'px ' + fontName;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.fillText('PAUSED', cx, ty);
        ctx.textAlign = 'left';
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, isHover, index) {
        const isActive = isSelected || isHover;
        const isDanger = (index === 4 || index === 1); // 4=Quit, 1=Restart
        
        IP2Live.UI.drawCyberButton({
            ctx,
            x: bx * scaleX,
            y: by * scaleY,
            w: bw * scaleX,
            h: bh * scaleY,
            scaleX, scaleY,
            label,
            numberLabel: '0' + (index + 1),
            isActive,
            isDanger,
            scrambleText: isActive ? this.scramble.getText(index, label) : undefined,
            animTick: this.animTick
        });
    }
}
window.IP2LivePauseMenu = IP2LivePauseMenu;

// Intercept ESC in Scene.Map to open the pause menu
inject(Scene.Map, 'onKeyPressed', function (key) {
    if (Data.Keyboards.checkCancelMenu(key)) {
        Data.Systems.soundConfirmation.playSound();
        Manager.Stack.push(new IP2LivePauseMenu());
    } else {
        this.super(key);
    }
}, false, true, false);

console.log('[IP2Live] pause-menu.js loaded.');

