/**
 * IP2Live â€” Credits Screen
 * @file Plugins/IP2Live_Core/modules/screens/credits.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LiveCreditsScene extends Scene.Base {
    constructor() { super(true); }
    initialize() {
        this.animTick = 0;
        this.bgFx = IP2Live.BgFx.create();
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        this.loading = false;
    }

    onKeyPressed(key) { Data.Systems.soundCancel.playSound(); Manager.Stack.pop(); }
    onMouseUp(x, y)   { Data.Systems.soundCancel.playSound(); Manager.Stack.pop(); }
    onKeyPressedAndRepeat(key) { return true; }
    draw3D() { Manager.GL.renderer.clear(); }

    update() {
        this.animTick++;
        this.bgFx.update(this.animTick);
        if (this.animTick % 2 === 0) Manager.Stack.requestPaintHUD = true;
    }

    drawHUD() {
        const ctx    = Common.Platform.ctx;
        const cW     = Common.ScreenResolution.CANVAS_WIDTH;
        const cH     = Common.ScreenResolution.CANVAS_HEIGHT;
        const scaleX = cW / Common.ScreenResolution.SCREEN_X;
        const scaleY = cH / Common.ScreenResolution.SCREEN_Y;

        ctx.save();

        this.bgFx.drawBg(ctx, IP2Live.Assets.bgImage, cW, cH);
        this.bgFx.drawParticles(ctx, scaleX);

        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.fillRect(0, 0, cW, cH);

        const panW = 620 * scaleX, panH = 420 * scaleY;
        const panX = (cW - panW) / 2, panY = (cH - panH) / 2;
        IP2Live.UI.drawCyberPanel({
            ctx,
            x: panX,
            y: panY,
            w: panW,
            h: panH,
            scaleX,
            accent: '#00F0FF',
            title: 'SYS::CREDITS_ARCHIVE'
        });

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(panX + panW - 170 * scaleX, panY);
        ctx.lineTo(panX + panW - 22 * scaleX, panY);
        ctx.lineTo(panX + panW - 52 * scaleX, panY + 58 * scaleY);
        ctx.lineTo(panX + panW - 196 * scaleX, panY + 58 * scaleY);
        ctx.closePath();
        ctx.fillStyle = '#FF003C';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(panX + 26 * scaleX, panY + panH - 58 * scaleY);
        ctx.lineTo(panX + 178 * scaleX, panY + panH - 58 * scaleY);
        ctx.lineTo(panX + 146 * scaleX, panY + panH);
        ctx.lineTo(panX, panY + panH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,230,0,0.95)';
        ctx.fill();
        ctx.restore();

        const fontName = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const lines = [
            { text: 'IP2LIVE', size: 32, color: '#FFE600', bold: true },
            { text: '', size: 8 },
            { text: 'LEAD DEVELOPER', size: 11, color: '#00FFFF', bold: true },
            { text: 'James Michael Restauro Siton', size: 13, color: '#FFFFFF' },
            { text: '', size: 8 },
            { text: 'GAME ENGINE', size: 11, color: '#00FFFF', bold: true },
            { text: 'RPG Paper Maker', size: 13, color: '#FFFFFF' },
            { text: '', size: 8 },
            { text: 'SPECIAL THANKS', size: 11, color: '#00FFFF', bold: true },
            { text: 'Wano & The RPM Community', size: 13, color: '#FFFFFF' },
            { text: '', size: 20 },
            { text: '[ PRESS ANY KEY TO RETURN ]', size: 10, color: 'rgba(0,255,255,0.6)' },
        ];

        let curY = panY + 50 * scaleY;
        for (const ln of lines) {
            if (ln.text === '') { curY += (ln.size || 10) * scaleY; continue; }
            ctx.font = (ln.bold ? 'bold ' : '') + (ln.size * scaleX) + 'px ' + (ln.text === 'IP2LIVE' && IP2Live.Assets.abnesLoaded ? 'Abnes' : fontName);
            ctx.fillStyle = ln.color || '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 0;
            ctx.fillText(ln.text, cW / 2, curY);
            curY += (ln.size * 2.2) * scaleY;
        }

        const tick = this.animTick || 0;
        for (let i = 0; i < 9; i++) {
            const x = panX + (80 + i * 58) * scaleX;
            const y = panY + panH - (80 + Math.sin(tick * 0.05 + i) * 12) * scaleY;
            ctx.fillStyle = i % 3 === 0 ? '#FF003C' : (i % 2 === 0 ? '#FFE600' : '#00F0FF');
            ctx.globalAlpha = 0.35 + 0.25 * Math.sin(tick * 0.06 + i);
            ctx.fillRect(x, y, 34 * scaleX, 3 * scaleY);
        }
        ctx.globalAlpha = 1;

        ctx.restore();
    }
}

class IP2LiveEndCreditsScene extends Scene.Base {
    constructor(payload) {
        super(true);
        this.payload = payload || {};
    }

    initialize() {
        this.animTick = 0;
        this.selectedIndex = 0;
        this.hoverIndex = -1;
        this.menuItems = ['RETRY GAME', 'MAIN MENU', 'EXPORT REPORT'];
        this.statusLine = 'RUN COMPLETE';
        this.bgFx = IP2Live.BgFx.create();
        this.particles = [];
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        this._seedParticles(cW, cH);
        this.loading = false;
        if (IP2Live.MusicManager) IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.MAIN_MENU);
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._goMainMenu();
        }
    }

    onKeyPressedAndRepeat(key) {
        const prev = this.selectedIndex;
        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length;
        }
        if (prev !== this.selectedIndex) {
            this.hoverIndex = -1;
            Data.Systems.soundCursor.playSound();
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseMove(x, y) {
        const idx = this._buttonAt(x, y);
        if (idx !== this.hoverIndex) {
            this.hoverIndex = idx;
            if (idx >= 0 && idx !== this.selectedIndex) {
                this.selectedIndex = idx;
                Data.Systems.soundCursor.playSound();
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        }
    }

    onMouseUp(x, y) {
        const idx = this._buttonAt(x, y);
        if (idx < 0) return;
        this.selectedIndex = idx;
        this._confirmSelection();
    }

    draw3D() {
        Manager.GL.renderer.clear();
    }

    update() {
        this.animTick++;
        this.bgFx.update(this.animTick);
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.flip--;
            if (p.flip <= 0) {
                p.flip = 40 + Math.floor(Math.random() * 80);
                p.text = this._particleText();
            }
            if (p.y > p.cH + 24) {
                p.y = -24;
                p.x = Math.random() * p.cW;
            }
        }
        if (this.animTick % 2 === 0 && Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const cW = Common.ScreenResolution.CANVAS_WIDTH;
        const cH = Common.ScreenResolution.CANVAS_HEIGHT;
        const sX = cW / Common.ScreenResolution.SCREEN_X;
        const sY = cH / Common.ScreenResolution.SCREEN_Y;
        const font = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const titleFont = IP2Live.Assets.abnesLoaded ? 'Abnes' : font;
        const tick = this.animTick || 0;

        ctx.save();
        this.bgFx.drawBg(ctx, IP2Live.Assets.bgImage, cW, cH);
        this.bgFx.drawParticles(ctx, sX);
        ctx.fillStyle = 'rgba(2,4,14,0.78)';
        ctx.fillRect(0, 0, cW, cH);
        this._drawParticles(ctx, sX);
        this._drawSlashes(ctx, cW, cH, sX, sY, tick);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(54 * sX) + 'px ' + titleFont;
        ctx.fillText('IP2LIVE', cW / 2, 82 * sY);

        ctx.font = 'bold ' + Math.round(12 * sX) + 'px monospace';
        ctx.fillStyle = '#00F0FF';
        ctx.fillText('SYS::CAMPAIGN_CLEAR // FINAL ROUTE VERIFIED', cW / 2, 112 * sY);

        const panelW = Math.min(980 * sX, cW - 92 * sX);
        const panelH = 360 * sY;
        const panelX = (cW - panelW) / 2;
        const panelY = 154 * sY;
        this._drawCompletionPanel(ctx, panelX, panelY, panelW, panelH, sX, sY, font, tick);

        const buttons = this._buttonLayout();
        for (let i = 0; i < this.menuItems.length; i++) {
            const isActive = i === this.selectedIndex || i === this.hoverIndex;
            this._drawButton(ctx, buttons[i], this.menuItems[i], i, isActive, sX, sY, font, tick);
        }

        ctx.font = 'bold ' + Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.68)';
        ctx.textAlign = 'center';
        ctx.fillText(this.statusLine, cW / 2, cH - 24 * sY);

        ctx.restore();
    }

    _drawCompletionPanel(ctx, x, y, w, h, sX, sY, font, tick) {
        const slant = 34 * sX;
        const red = '#FF003C';
        const cyan = '#00F0FF';
        const yellow = '#FFE600';
        const stage = this.payload.stage || {};
        const stageName = stage.name || 'FINAL WORLD';
        const playerName = Core.Game.current && Core.Game.current.infiltratorName
            ? Core.Game.current.infiltratorName
            : 'INFILTRATOR';

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - slant * 0.6, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + slant * 0.35, y + h * 0.18);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.94)';
        ctx.fill();
        ctx.strokeStyle = cyan;
        ctx.lineWidth = 2 * sX;
        ctx.shadowColor = cyan;
        ctx.shadowBlur = 14 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.clip();
        for (let lineY = y; lineY < y + h; lineY += 5 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.035)';
            ctx.fillRect(x, lineY, w, Math.max(1, sY));
        }
        ctx.fillStyle = 'rgba(0,240,255,0.08)';
        ctx.fillRect(x, y + ((tick * 1.2) % h), w, 8 * sY);
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(x, y + 20 * sY);
        ctx.lineTo(x + 360 * sX, y);
        ctx.lineTo(x + 322 * sX, y + 76 * sY);
        ctx.lineTo(x, y + 92 * sY);
        ctx.closePath();
        ctx.fillStyle = red;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + w - 292 * sX, y + h - 78 * sY);
        ctx.lineTo(x + w, y + h - 112 * sY);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w - 336 * sX, y + h);
        ctx.closePath();
        ctx.fillStyle = yellow;
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.font = 'bold ' + Math.round(13 * sX) + 'px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('// FINAL ACCESS GRANTED //', x + 28 * sX, y + 44 * sY);

        ctx.font = 'bold ' + Math.round(42 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('MISSION COMPLETE', x + 54 * sX, y + 150 * sY);

        ctx.font = Math.round(15 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        const lines = [
            'Congratulations, ' + playerName + '.',
            'You reached the final exit node and completed IP2Live.',
            stageName + ' has been verified as the last active world in this route.',
            'You can retry the game, return to the main menu, or export a run report.',
        ];
        let textY = y + 196 * sY;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x + 58 * sX, textY);
            textY += 28 * sY;
        }

        ctx.font = 'bold ' + Math.round(10 * sX) + 'px monospace';
        ctx.fillStyle = '#07101C';
        ctx.textAlign = 'right';
        ctx.fillText('CLEAR_STATUS: ROUTE_CHAIN_COMPLETE', x + w - 38 * sX, y + h - 32 * sY);

        ctx.restore();
    }

    _drawButton(ctx, rect, label, index, active, sX, sY, font, tick) {
        const red = '#FF003C';
        const cyan = '#00F0FF';
        const yellow = '#FFE600';
        const x = rect.x;
        const y = rect.y;
        const w = rect.w;
        const h = rect.h;
        const slant = 20 * sX;
        const activeColor = index === 2 ? cyan : (index === 1 ? red : yellow);

        ctx.save();
        ctx.translate(active ? 10 * sX : 0, 0);
        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - slant, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + slant * 0.45, y + h * 0.24);
        ctx.closePath();

        const grad = ctx.createLinearGradient(x, y, x + w, y);
        if (active) {
            grad.addColorStop(0, activeColor === yellow ? 'rgba(255,230,0,0.82)' : 'rgba(255,0,60,0.76)');
            grad.addColorStop(1, 'rgba(3,7,20,0.82)');
            ctx.shadowColor = activeColor;
            ctx.shadowBlur = 16 * sX;
        } else {
            grad.addColorStop(0, 'rgba(3,7,20,0.90)');
            grad.addColorStop(1, 'rgba(3,7,20,0.54)');
            ctx.shadowBlur = 0;
        }
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = active ? activeColor : 'rgba(0,240,255,0.52)';
        ctx.lineWidth = (active ? 2 : 1) * sX;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 54 * sX, y);
        ctx.lineTo(x + 39 * sX, y + 24 * sY);
        ctx.lineTo(x, y + 30 * sY);
        ctx.closePath();
        ctx.fillStyle = active ? red : cyan;
        ctx.fill();

        ctx.font = 'bold ' + Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = active ? '#090909' : '#00141A';
        ctx.textAlign = 'left';
        ctx.fillText('0' + (index + 1), x + 12 * sX, y + 17 * sY);

        ctx.font = 'bold ' + Math.round(18 * sX) + 'px ' + font;
        ctx.fillStyle = active && activeColor === yellow ? '#111111' : '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 54 * sX, y + 35 * sY);

        if (active) {
            ctx.font = 'bold ' + Math.round(13 * sX) + 'px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('>>', x + w - 28 * sX, y + 35 * sY);
            ctx.globalAlpha = 0.36 + 0.18 * Math.sin(tick * 0.12);
            ctx.fillStyle = '#FFFFFF';
            ctx.transform(1, 0, -0.35, 1, 0, 0);
            ctx.fillRect(x + w * 0.52, y - h, 28 * sX, h * 3);
        }

        ctx.restore();
    }

    _drawSlashes(ctx, cW, cH, sX, sY, tick) {
        ctx.save();
        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(280 * sX, 0);
        ctx.lineTo(198 * sX, 88 * sY);
        ctx.lineTo(0, 118 * sY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        ctx.moveTo(cW - 330 * sX, cH);
        ctx.lineTo(cW, cH - 74 * sY);
        ctx.lineTo(cW, cH);
        ctx.closePath();
        ctx.fill();

        for (let i = 0; i < 9; i++) {
            const y = (144 + i * 48 + Math.sin(tick * 0.04 + i) * 8) * sY;
            ctx.fillStyle = i % 3 === 0 ? 'rgba(255,0,60,0.55)' : (i % 2 === 0 ? 'rgba(255,230,0,0.45)' : 'rgba(0,240,255,0.44)');
            ctx.fillRect((96 + i * 150) * sX, y, (78 + i * 7) * sX, 4 * sY);
        }
        ctx.restore();
    }

    _drawParticles(ctx, sX) {
        ctx.save();
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.font = Math.round(p.size * sX) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _buttonLayout() {
        const cW = Common.ScreenResolution.CANVAS_WIDTH;
        const cH = Common.ScreenResolution.CANVAS_HEIGHT;
        const sX = cW / Common.ScreenResolution.SCREEN_X;
        const sY = cH / Common.ScreenResolution.SCREEN_Y;
        const w = 322 * sX;
        const h = 58 * sY;
        const gap = 18 * sX;
        const totalW = w * 3 + gap * 2;
        const y = cH - 118 * sY;
        const startX = (cW - totalW) / 2;
        return [
            { x: startX, y, w, h },
            { x: startX + w + gap, y, w, h },
            { x: startX + (w + gap) * 2, y, w, h },
        ];
    }

    _buttonAt(x, y) {
        const buttons = this._buttonLayout();
        for (let i = 0; i < buttons.length; i++) {
            const b = buttons[i];
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
        }
        return -1;
    }

    _confirmSelection() {
        Data.Systems.soundConfirmation.playSound();
        if (this.selectedIndex === 0) {
            this._retryGame();
        } else if (this.selectedIndex === 1) {
            this._goMainMenu();
        } else {
            this._exportReport();
        }
    }

    _retryGame() {
        if (IP2Live.MapManager) IP2Live.MapManager._stageRouteLocked = false;
        this._resetGameState();
        if (IP2Live.LoadingScreen && IP2Live.MapManager) {
            IP2Live.LoadingScreen.show({
                mode: 'reset',
                status: 'Loading New Game',
                detail: 'Rebooting infiltration route',
                onComplete: function () {
                    IP2Live.MapManager.goToTutorial({ useLoading: false });
                },
            });
            return;
        }

        if (IP2Live.MapManager) IP2Live.MapManager.goToTutorial({ useLoading: false });
    }

    _goMainMenu() {
        if (IP2Live.MapManager) IP2Live.MapManager._stageRouteLocked = false;
        const MainMenuScene = (typeof window !== 'undefined' && window.IP2LiveMainMenu) || null;
        if (IP2Live.LoadingScreen && typeof MainMenuScene === 'function') {
            IP2Live.LoadingScreen.show({
                mode: 'reset',
                status: 'Loading Main Menu',
                detail: 'Closing final route session',
                onComplete: function () {
                    Manager.Stack.popAll();
                    Manager.Stack.push(new MainMenuScene());
                    if (IP2Live.MusicManager) IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.MAIN_MENU);
                },
            });
            return;
        }

        if (typeof MainMenuScene === 'function') {
            Manager.Stack.popAll();
            Manager.Stack.push(new MainMenuScene());
        }
    }

    _resetGameState() {
        if (!Core || !Core.Game) return;
        const oldGame = Core.Game.current || null;
        const name = oldGame && oldGame.infiltratorName ? oldGame.infiltratorName : null;
        const newGame = new Core.Game();
        newGame.initializeDefault();
        if (name) newGame.infiltratorName = name;
        Core.Game.current = newGame;
    }

    _exportReport() {
        const report = this._buildReport();
        try {
            if (typeof Blob === 'undefined' || typeof document === 'undefined') throw new Error('download unavailable');
            const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'IP2Live_Run_Report.txt';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.statusLine = 'REPORT EXPORTED';
        } catch (e) {
            console.log(report);
            this.statusLine = 'REPORT PRINTED TO CONSOLE';
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _buildReport() {
        const playerName = Core.Game.current && Core.Game.current.infiltratorName
            ? Core.Game.current.infiltratorName
            : 'UNKNOWN';
        const stage = this.payload.stage || {};
        const stages = this.payload.stages || [];
        const lines = [
            'IP2Live Infiltration Report',
            '===========================',
            'Infiltrator: ' + playerName,
            'Status: Campaign Complete',
            'Final world: ' + (stage.name || 'FINAL WORLD'),
            'Completed at: ' + (this.payload.completedAt || new Date().toISOString()),
            '',
            'Verified route:',
        ];

        for (let i = 0; i < stages.length; i++) {
            lines.push('- ' + stages[i].name + ' (Map ' + stages[i].id + ')');
        }

        lines.push('');
        lines.push('Default spawn: X:16 Y:0 Z:31');
        lines.push('Default exit node: X:16 Y:0 Z:4');
        return lines.join('\n');
    }

    _seedParticles(cW, cH) {
        this.particles = [];
        for (let i = 0; i < 70; i++) {
            this.particles.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                vx: (Math.random() - 0.5) * 0.22,
                vy: 0.24 + Math.random() * 0.58,
                size: 8 + Math.random() * 8,
                alpha: 0.05 + Math.random() * 0.18,
                color: Math.random() > 0.72 ? '#FFE600' : '#00F0FF',
                text: this._particleText(),
                flip: 20 + Math.floor(Math.random() * 90),
                cW,
                cH,
            });
        }
    }

    _particleText() {
        const chars = ['0', '1', '/24', '/30', 'CIDR', 'NET', 'ARP', '64', '128', '255', 'TRACE'];
        return chars[Math.floor(Math.random() * chars.length)];
    }
}

window.IP2LiveCreditsScene = IP2LiveCreditsScene;
window.IP2LiveEndCreditsScene = IP2LiveEndCreditsScene;
console.log('[IP2Live] credits.js loaded.');

