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
        this.menuItems = ["RESUME", "SAVE GAME", "EXPORT REPORT", "DEBUG MAP JUMP", "MAIN MENU", "QUIT GAME"];
        this.hoverIndex = -1;
        this.animTick = 0;
        this.glitchActive = false;
        this.glitchTimer = 0;
        this.pendingAction = null;
        this.scanlineOffset = 0;
        this.bgFx = IP2Live.BgFx.create();
        this.networkBackdrop = (window.IP2LiveBackgroundScreen)
            ? new window.IP2LiveBackgroundScreen()
            : null;
        this.scramble = IP2Live.TextScramble.create(this.menuItems.length);
        this.debugMode = false;
        this.debugIndex = 0;
        this.debugStages = this._buildDebugStages();
        this.debugItemRects = [];
    }

    _getLayout(SW, SH) {
        const panelW = 440;
        const panelH = 520;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const btnW = 320;
        const btnH = 46;
        const btnGap = 10;
        const bx = panelX + (panelW - btnW) / 2;
        const startY = panelY + 84;
        return { panelW, panelH, panelX, panelY, btnW, btnH, btnGap, bx, startY };
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
        if (this.debugMode) {
            if (Data.Keyboards.checkActionMenu(key)) {
                this._jumpToDebugStage();
            } else if (Data.Keyboards.checkCancelMenu(key)) {
                this._exitDebugMode();
            }
            return;
        }
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._resume();
        }
    }

    onKeyPressedAndRepeat(key) {
        if (this.debugMode) {
            const prev = this.debugIndex;
            if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
                this.debugIndex = (this.debugIndex - 1 + this.debugStages.length) % Math.max(1, this.debugStages.length);
            } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
                this.debugIndex = (this.debugIndex + 1) % Math.max(1, this.debugStages.length);
            }
            if (this.debugIndex !== prev) {
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
            }
            return true;
        }
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
        if (this.debugMode) {
            const idx = this._getDebugItemAt(x, y);
            if (idx >= 0 && idx !== this.debugIndex) {
                this.debugIndex = idx;
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
            }
            return;
        }
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
        if (this.debugMode) {
            const idx = this._getDebugItemAt(x, y);
            if (idx >= 0) {
                this.debugIndex = idx;
                Data.Systems.soundConfirmation.playSound();
                this._jumpToDebugStage();
            }
            return;
        }
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
        const layout = this._getLayout(SW, SH);
        for (let i = 0; i < this.menuItems.length; i++) {
            const by = layout.startY + i * (layout.btnH + layout.btnGap);
            if (x >= layout.bx * scaleX && x <= (layout.bx + layout.btnW) * scaleX &&
                y >= by * scaleY && y <= (by + layout.btnH) * scaleY) return i;
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
        setTimeout(() => {
            Promise.resolve(self._executeAction(self.pendingAction)).catch((e) => {
                console.warn('[IP2Live] PauseMenu action failed:', e);
            });
        }, 100);
    }

    _resume() {
        Data.Systems.soundCancel.playSound();
        Manager.Stack.pop();
    }

    async _executeAction(idx) {
        switch (idx) {
            case 0:
                this._resume();
                break;
            case 1:
                await this._saveGameProgress();
                break;
            case 2:
                if (window.IP2LiveExportReportMenu) {
                    Manager.Stack.push(new IP2LiveExportReportMenu());
                } else if (IP2Live.GameManager && typeof IP2Live.GameManager.exportProgressReport === 'function') {
                    await IP2Live.GameManager.exportProgressReport({ scopeDays: 30, format: 'both' });
                    Manager.Stack.pop();
                } else {
                    Data.Systems.soundImpossible.playSound();
                }
                break;
            case 3:
                this._enterDebugMode();
                break;
            case 4:
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
            case 5:
                Common.Platform.quit();
                break;
        }
    }

    _buildDebugStages() {
        const mapManager = IP2Live.MapManager;
        const stages = mapManager && Array.isArray(mapManager.stages) ? mapManager.stages : [];
        const output = [];
        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];
            if (!stage || !stage.id) continue;
            output.push({
                id: Number(stage.id) || 0,
                name: stage.name || ('Map ' + String(stage.id).padStart(4, '0')),
                stage: typeof stage.stage === 'number' ? stage.stage : null,
                level: typeof stage.level === 'number' ? stage.level : null,
                tutorial: !!stage.tutorial,
            });
        }
        output.sort((a, b) => {
            if (a.tutorial !== b.tutorial) return a.tutorial ? -1 : 1;
            if (a.stage !== b.stage) return (a.stage || 0) - (b.stage || 0);
            if (a.level !== b.level) return (a.level || 0) - (b.level || 0);
            return a.id - b.id;
        });
        return output;
    }

    _enterDebugMode() {
        this.debugStages = this._buildDebugStages();
        this.debugIndex = Math.min(this.debugIndex, Math.max(0, this.debugStages.length - 1));
        this.debugMode = true;
        this.hoverIndex = -1;
        Manager.Stack.requestPaintHUD = true;
    }

    _exitDebugMode() {
        this.debugMode = false;
        this.debugItemRects = [];
        Manager.Stack.requestPaintHUD = true;
    }

    _jumpToDebugStage() {
        const entry = this.debugStages[this.debugIndex];
        if (!entry || !entry.id) return;
        const mapId = Number(entry.id) || 0;
        if (!mapId) return;
        const detail = entry.name || ('Map ' + String(mapId).padStart(4, '0'));
        const mode = entry.tutorial ? 'tutorial' : 'stage';

        this._exitDebugMode();
        Manager.Stack.pop();

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startMapFlow === 'function') {
            IP2Live.GameManager.startMapFlow(mapId, null, {
                mode,
                useLoading: true,
                status: 'Debug Jump',
                detail,
                source: 'PauseMenu.debugJump',
            });
            return;
        }
        if (IP2Live.MapManager && typeof IP2Live.MapManager.goTo === 'function') {
            IP2Live.MapManager.goTo(mapId, { status: 'Debug Jump', detail });
        }
    }

    _debugListLayout(cW, cH) {
        const panelW = Math.min(640, cW * 0.82);
        const panelH = Math.min(420, cH * 0.72);
        const panelX = (cW - panelW) / 2;
        const panelY = (cH - panelH) / 2;
        return { panelW, panelH, panelX, panelY };
    }

    _getDebugItemAt(x, y) {
        for (let i = 0; i < this.debugItemRects.length; i++) {
            const r = this.debugItemRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.index;
        }
        return -1;
    }

    _drawDebugJumpOverlay(ctx, cW, cH) {
        const layout = this._debugListLayout(cW, cH);
        const panelX = layout.panelX;
        const panelY = layout.panelY;
        const panelW = layout.panelW;
        const panelH = layout.panelH;
        const listX = panelX + 28;
        const listY = panelY + 78;
        const rowH = 34;
        const maxRows = Math.floor((panelH - 120) / rowH);
        const stages = this.debugStages || [];

        this.debugItemRects = [];

        ctx.save();
        ctx.fillStyle = 'rgba(5, 8, 18, 0.92)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 2;
        ctx.strokeRect(panelX, panelY, panelW, panelH);

        ctx.fillStyle = '#FF003C';
        ctx.fillRect(panelX, panelY, panelW, 44);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('DEBUG MAP JUMP', panelX + 18, panelY + 28);

        ctx.fillStyle = '#9ADFFF';
        ctx.font = '12px monospace';
        ctx.fillText('UP/DOWN: Select   ENTER: Jump   ESC: Back', panelX + 18, panelY + panelH - 18);

        if (!stages.length) {
            ctx.fillStyle = '#FFE600';
            ctx.font = '13px monospace';
            ctx.fillText('No stages discovered.', listX, listY + 20);
            ctx.restore();
            return;
        }

        const start = Math.max(0, Math.min(stages.length - 1, this.debugIndex) - Math.floor(maxRows / 2));
        const end = Math.min(stages.length, start + maxRows);
        let row = 0;
        for (let i = start; i < end; i++) {
            const entry = stages[i];
            const y = listY + row * rowH;
            const isSelected = i === this.debugIndex;
            const label = entry.name || ('Map ' + String(entry.id).padStart(4, '0'));
            const suffix = (entry.stage !== null && entry.level !== null)
                ? '  (Stage ' + entry.stage + ' / Level ' + entry.level + ')'
                : (entry.tutorial ? '  (Tutorial)' : '');

            ctx.fillStyle = isSelected ? 'rgba(255, 216, 74, 0.22)' : 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(listX - 8, y - 4, panelW - 40, rowH - 4);

            ctx.fillStyle = isSelected ? '#FFE600' : '#DAEEFF';
            ctx.font = 'bold 13px monospace';
            ctx.fillText(label, listX, y + 16);
            ctx.fillStyle = isSelected ? '#FFFFFF' : '#8ACAE8';
            ctx.font = '11px monospace';
            ctx.fillText(suffix, listX, y + 30);

            this.debugItemRects.push({ index: i, x: listX - 8, y: y - 4, w: panelW - 40, h: rowH - 4 });
            row++;
        }

        ctx.restore();
    }

    async _saveGameProgress() {
        if (!window.IP2LiveLoadGameMenu) {
            Data.Systems.soundImpossible.playSound();
            console.warn('[IP2Live] Save failed: Save menu screen is not available.');
            return;
        }
        const menu = new IP2LiveLoadGameMenu({
            saveMode: true,
            onSaved: function () {
                Manager.Stack.popAll();
                Manager.Stack.push(new IP2LiveMainMenu());
            },
        });
        // Safety: enforce save mode even if scene init order differs.
        menu.options = menu.options || {};
        menu.options.saveMode = true;
        menu.saveMode = true;
        menu.titleText = 'SAVE GAME';
        menu.panelTitle = 'SYS::SAVE_ARCHIVE_WRITE';
        Manager.Stack.push(menu);
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
        if (this.networkBackdrop && typeof this.networkBackdrop.draw === 'function') {
            ctx.save();
            ctx.globalAlpha = 0.66;
            this.networkBackdrop.draw(ctx, cW, cH, this.animTick, 0, 0);
            ctx.restore();
        }
        this._drawPauseTwistBackground(ctx, cW, cH, scaleX, scaleY);

        const veil = ctx.createLinearGradient(0, 0, cW, cH);
        veil.addColorStop(0, 'rgba(0,0,10,0.74)');
        veil.addColorStop(0.55, 'rgba(4,0,14,0.66)');
        veil.addColorStop(1, 'rgba(0,0,14,0.78)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#000';
        for (let ly = this.scanlineOffset * scaleY; ly < cH; ly += 4 * scaleY) {
            ctx.fillRect(0, ly, cW, 1.5 * scaleY);
        }
        ctx.globalAlpha = 1;

        const layout = this._getLayout(SW, SH);
        const px = layout.panelX * scaleX;
        const py = layout.panelY * scaleY;
        const pw = layout.panelW * scaleX;
        const ph = layout.panelH * scaleY;

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

        this._drawPausedTitle(ctx, scaleX, scaleY, SW, SH, layout.panelX, layout.panelY, layout.panelW);

        const divY = (layout.panelY + 68) * scaleY;
        ctx.strokeStyle = 'rgba(0,255,255,0.25)';
        ctx.lineWidth = 1 * scaleX;
        ctx.beginPath();
        ctx.moveTo((layout.panelX + 20) * scaleX, divY);
        ctx.lineTo((layout.panelX + layout.panelW - 20) * scaleX, divY);
        ctx.stroke();

        for (let i = 0; i < this.menuItems.length; i++) {
            const by = layout.startY + i * (layout.btnH + layout.btnGap);
            this._drawButton(ctx, scaleX, scaleY, layout.bx, by, layout.btnW, layout.btnH, this.menuItems[i],
                i === this.selectedIndex, i === this.hoverIndex, i);
        }

        ctx.font = (8 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.35)';
        ctx.textAlign = 'center';
        ctx.fillText('[ GAME PAUSED - SYS::STANDBY ]', (SW / 2) * scaleX, (layout.panelY + layout.panelH - 14) * scaleY);
        ctx.textAlign = 'left';

        ctx.restore();

        if (this.debugMode) {
            this._drawDebugJumpOverlay(ctx, cW, cH);
        }
    }

    _drawPauseTwistBackground(ctx, cW, cH, scaleX, scaleY) {
        const t = this.animTick || 0;
        const cx = cW * 0.52;
        const cy = cH * 0.52;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.16);

        // Pause-specific twist: containment rings + command rails.
        ctx.strokeStyle = 'rgba(255,0,60,0.18)';
        ctx.lineWidth = 1.2 * scaleX;
        ctx.beginPath();
        ctx.ellipse(0, 0, cW * 0.23, cH * 0.17, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0,240,255,0.16)';
        ctx.beginPath();
        ctx.ellipse(0, 0, cW * 0.18, cH * 0.12, 0, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = -5; i <= 5; i++) {
            const y = i * (20 * scaleY);
            const pulse = 0.10 + 0.10 * (0.5 + 0.5 * Math.sin(t * 0.03 + i));
            ctx.strokeStyle = i % 2 === 0
                ? 'rgba(0,240,255,' + pulse.toFixed(3) + ')'
                : 'rgba(255,0,60,' + (pulse * 0.9).toFixed(3) + ')';
            ctx.lineWidth = 1 * scaleX;
            ctx.beginPath();
            ctx.moveTo(-cW * 0.36, y);
            ctx.lineTo(cW * 0.36, y - 24 * scaleY);
            ctx.stroke();

            const travel = ((t * (0.9 + i * 0.02)) + i * 57) % (cW * 0.72);
            ctx.fillStyle = 'rgba(255,230,0,0.70)';
            ctx.fillRect(-cW * 0.36 + travel, y - 2 * scaleY, 12 * scaleX, 3 * scaleY);
        }

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
        const isDanger = (index === 5); // 5=Quit
        
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


