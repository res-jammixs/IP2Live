/**
 * IP2Live - Gameplay Manager Module
 *
 * Stage 1 IP class wire patch gameplay and quest hooks.
 * Loaded from gameplay/IPWires/modules by code.js.
 */

class IP2LiveWiresGameplayScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || this.maxAttempts || 3);
        this._ensurePuzzleReady();
    }

    initialize() {
        this.options = this.options || {};
        this._resetPuzzleState();
    }

    _resetPuzzleState() {
        this.animTick = 0;
        this.scanlineOffset = 0;
        this.connections = {};
        this.lockedCorrect = {};
        this.wrongConnections = {};
        this.dragging = null;
        this.sparks = [];
        this.failedWires = [];
        this.failFlash = 0;
        this.verdictTimer = 0;
        this.pendingMistakeDialogue = null;
        this.pendingFailureExit = null;
        this.attemptsUsed = 0;
        this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 3);
        this.completed = false;
        this.completedAt = 0;
        const puzzle = this._generatePuzzle();
        this.leftItems = this._shuffle(puzzle.map((entry) => Object.assign({}, entry)));
        this.rightItems = this._shuffle(puzzle.map((entry) => Object.assign({}, entry)));
    }

    _ensurePuzzleReady() {
        if (!this.leftItems || this.leftItems.length !== 4 || !this.rightItems || this.rightItems.length !== 4) {
            this._resetPuzzleState();
        }
    }

    async load() {
        if (IP2Live.Assets && typeof IP2Live.Assets.loadAll === 'function' && !IP2Live.Assets.nebulaLoaded) {
            try {
                await IP2Live.Assets.loadAll();
            } catch (e) {
                console.warn('[IP2Live] Wires gameplay asset warmup failed:', e);
            }
        }
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.55) % 4;
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            this.sparks[i].life--;
            if (this.sparks[i].life <= 0) this.sparks.splice(i, 1);
        }
        for (let i = this.failedWires.length - 1; i >= 0; i--) {
            this.failedWires[i].life--;
            if (this.failedWires[i].life <= 0) this.failedWires.splice(i, 1);
        }
        if (this.failFlash > 0) this.failFlash--;
        if (this.verdictTimer > 0) {
            this.verdictTimer--;
            if (this.verdictTimer === 0) this._resolveFailedVerdict();
        }
        if (this.completed && this.completedAt && Date.now() - this.completedAt > 650) {
            this._finish();
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) return true;
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel();
            return true;
        }
        return true;
    }

    onMouseDown(x, y) {
        if (this.completed || this.verdictTimer > 0 || (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive())) return true;
        this._ensurePuzzleReady();
        this.mouse = { x, y };
        const layout = this._layout();
        for (let i = 0; i < this.leftItems.length; i++) {
            const item = this.leftItems[i];
            if (this.lockedCorrect[item.className]) continue;
            const p = layout.leftPoints[item.className];
            if (this._distance(x, y, p.x, p.y) <= p.r * 1.35) {
                if (this.connections[item.className]) delete this.connections[item.className];
                this.dragging = { className: item.className, from: p };
                this._playCursor();
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                return true;
            }
        }
        return true;
    }

    onMouseMove(x, y) {
        this.mouse = { x, y };
        if (this.dragging && Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    }

    onMouseUp(x, y) {
        this.mouse = { x, y };
        this._ensurePuzzleReady();
        if (!this.dragging || this.completed || this.verdictTimer > 0) return true;

        const sourceClass = this.dragging.className;
        const layout = this._layout();
        let targetClass = null;
        let targetPoint = null;

        for (let i = 0; i < this.rightItems.length; i++) {
            const candidate = this.rightItems[i];
            const p = layout.rightPoints[candidate.className];
            if (this._distance(x, y, p.x, p.y) <= p.r * 1.45) {
                targetClass = candidate.className;
                targetPoint = p;
                break;
            }
        }

        if (targetClass && this.lockedCorrect[targetClass] && sourceClass !== targetClass) {
            this._playCancel();
        } else if (targetClass) {
            this._clearTargetConnection(targetClass);
            this.connections[sourceClass] = targetClass;
            this._playConfirm();
            if (this._allConnected()) {
                this._evaluateConnections();
            }
        } else {
            this._playCancel();
        }

        this.dragging = null;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        if (!ctx) return;

        this._ensurePuzzleReady();
        const layout = this._layout();
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const sX = layout.sX;
        const sY = layout.sY;
        const font = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';

        ctx.save();
        if (this.failFlash > 0) {
            const shake = Math.sin(this.animTick * 2.7) * this.failFlash * 0.55 * sX;
            ctx.translate(shake, -shake * 0.45);
        }
        this._drawBackground(ctx, cW, cH, sX, sY);
        this._drawPanel(ctx, layout, font, titleFont);
        this._drawPatchHardware(ctx, layout, font);
        this._drawConnections(ctx, layout);
        this._drawFailedWire(ctx, layout);
        this._drawDragWire(ctx, layout);
        this._drawTerminals(ctx, layout, font);
        for (let i = 0; i < this.sparks.length; i++) this._drawSpark(ctx, this.sparks[i], sX);
        if (this.completed) this._drawCompleteOverlay(ctx, layout, font);
        ctx.restore();
        this._drawFailureOverlay(ctx, cW, cH);
        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.drawOverlay === 'function') {
            IP2Live.DialogueManager.drawOverlay(ctx);
        }
    }

    _drawBackground(ctx, cW, cH, sX, sY) {
        const tick = this.animTick || 0;
        const bg = ctx.createLinearGradient(0, 0, cW, cH);
        bg.addColorStop(0, '#05070D');
        bg.addColorStop(0.45, '#101217');
        bg.addColorStop(1, '#05070D');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = Math.max(1, sX);
        const gap = 44 * sX;
        for (let x = -gap + ((tick * 0.3) % gap); x < cW + gap; x += gap) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + cH * 0.28, cH);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        this._drawAmbientCable(ctx, -60 * sX, cH * 0.16, cW * 0.34, cH * 0.05, cW * 0.62, cH * 0.22, cW + 70 * sX, cH * 0.11, '#242A31', 5 * sX, 0.20);
        this._drawAmbientCable(ctx, -70 * sX, cH * 0.73, cW * 0.26, cH * 0.86, cW * 0.68, cH * 0.60, cW + 60 * sX, cH * 0.76, '#161A20', 5 * sX, 0.22);
        this._drawAmbientCable(ctx, cW * 0.12, -40 * sY, cW * 0.18, cH * 0.22, cW * 0.83, cH * 0.08, cW * 0.88, cH + 60 * sY, '#2A3038', 4 * sX, 0.18);
        this._drawAmbientCable(ctx, -50 * sX, cH * 0.32, cW * 0.18, cH * 0.27, cW * 0.40, cH * 0.42, cW + 80 * sX, cH * 0.38, '#20242A', 9 * sX, 0.28);
        this._drawAmbientCable(ctx, -80 * sX, cH * 0.52, cW * 0.35, cH * 0.43, cW * 0.67, cH * 0.70, cW + 40 * sX, cH * 0.57, '#15181D', 11 * sX, 0.30);
        this._drawAmbientCable(ctx, cW * 0.35, -50 * sY, cW * 0.42, cH * 0.28, cW * 0.57, cH * 0.45, cW * 0.49, cH + 60 * sY, '#191C22', 7 * sX, 0.32);
        this._drawAmbientCable(ctx, cW * 0.62, -45 * sY, cW * 0.70, cH * 0.18, cW * 0.74, cH * 0.68, cW * 0.92, cH + 50 * sY, '#24272E', 6 * sX, 0.22);

        ctx.save();
        ctx.font = Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.18)';
        ctx.textAlign = 'left';
        const diagnostics = ['CLASSFUL BUS', 'OCTET_SPLIT', 'PATCH BAY 04', 'LINK TEST'];
        for (let i = 0; i < diagnostics.length; i++) {
            ctx.fillText(diagnostics[i], 32 * sX, (132 + i * 34) * sY);
        }
        ctx.textAlign = 'right';
        for (let i = 0; i < diagnostics.length; i++) {
            ctx.fillText(diagnostics[(i + 2) % diagnostics.length], cW - 32 * sX, (cH - 168 + i * 34) * sY);
        }
        ctx.restore();

        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#000000';
        for (let y = this.scanlineOffset * sY; y < cH; y += 4 * sY) {
            ctx.fillRect(0, y, cW, Math.max(1, 1.4 * sY));
        }
        ctx.globalAlpha = 1;
    }

    _drawPanel(ctx, layout, font, titleFont) {
        const p = layout.panel;
        const sl = 34 * layout.sX;
        ctx.save();

        ctx.beginPath();
        ctx.moveTo(p.x + sl, p.y);
        ctx.lineTo(p.x + p.w, p.y);
        ctx.lineTo(p.x + p.w - sl, p.y + p.h);
        ctx.lineTo(p.x, p.y + p.h);
        ctx.lineTo(p.x, p.y + sl);
        ctx.closePath();
        ctx.fillStyle = 'rgba(8,10,14,0.96)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.54)';
        ctx.lineWidth = 2 * layout.sX;
        ctx.stroke();

        ctx.save();
        ctx.clip();
        const midX = p.x + p.w / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(midX - 10 * layout.sX, p.y, 20 * layout.sX, p.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1 * layout.sX;
        ctx.beginPath();
        ctx.moveTo(midX - 18 * layout.sX, p.y);
        ctx.lineTo(midX - 18 * layout.sX, p.y + p.h);
        ctx.moveTo(midX + 18 * layout.sX, p.y);
        ctx.lineTo(midX + 18 * layout.sX, p.y + p.h);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 250 * layout.sX, p.y);
        ctx.lineTo(p.x + 212 * layout.sX, p.y + 46 * layout.sY);
        ctx.lineTo(p.x, p.y + 60 * layout.sY);
        ctx.closePath();
        ctx.fill();

        ctx.font = 'bold ' + Math.round(24 * layout.sX) + 'px ' + titleFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText('NETWORK PATCH', p.x + 24 * layout.sX, p.y + 37 * layout.sY);

        ctx.font = Math.round(9 * layout.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.78)';
        ctx.textAlign = 'right';
        ctx.fillText('SYS::IP_CLASS_ROUTER // LIVE', p.x + p.w - 26 * layout.sX, p.y + 30 * layout.sY);

        ctx.fillStyle = this.attemptsUsed > 0 ? '#FFE600' : 'rgba(218,238,255,0.70)';
        ctx.fillText(
            'CHANCES ' + Math.max(0, this.maxAttempts - this.attemptsUsed) + '/' + this.maxAttempts,
            p.x + p.w - 26 * layout.sX,
            p.y + 48 * layout.sY
        );

        ctx.font = 'bold ' + Math.round(12 * layout.sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        ctx.fillText('SOURCE OCTETS', p.x + 32 * layout.sX, p.y + 86 * layout.sY);
        ctx.textAlign = 'right';
        ctx.fillText('DESTINATION / CLASS', p.x + p.w - 32 * layout.sX, p.y + 86 * layout.sY);
        ctx.restore();
    }

    _drawPatchHardware(ctx, layout, font) {
        const p = layout.panel;
        const sX = layout.sX;
        const sY = layout.sY;
        const tick = this.animTick || 0;
        const railW = 34 * sX;
        const leftRailX = p.x + 52 * sX;
        const rightRailX = p.x + p.w - 86 * sX;

        ctx.save();
        ctx.fillStyle = 'rgba(31,36,43,0.92)';
        ctx.fillRect(leftRailX, p.y + 112 * sY, railW, p.h - 176 * sY);
        ctx.fillRect(rightRailX, p.y + 112 * sY, railW, p.h - 176 * sY);
        ctx.strokeStyle = 'rgba(255,255,255,0.20)';
        ctx.lineWidth = 1 * sX;
        ctx.strokeRect(leftRailX, p.y + 112 * sY, railW, p.h - 176 * sY);
        ctx.strokeRect(rightRailX, p.y + 112 * sY, railW, p.h - 176 * sY);

        const rowClasses = ['A', 'B', 'C', 'D'];
        for (let i = 0; i < rowClasses.length; i++) {
            const rowY = layout.topY + layout.gap * i;
            const color = this._classColor(rowClasses[i]);
            const done = !!this.lockedCorrect[rowClasses[i]];
            this._drawRailSocket(ctx, leftRailX + railW / 2, rowY, color, sX, sY, false, done);
            this._drawRailSocket(ctx, rightRailX + railW / 2, rowY, color, sX, sY, true, done);

            ctx.strokeStyle = 'rgba(255,255,255,0.055)';
            ctx.lineWidth = 1 * sX;
            ctx.beginPath();
            ctx.moveTo(p.x + 96 * sX, rowY);
            ctx.lineTo(p.x + p.w - 96 * sX, rowY);
            ctx.stroke();
        }

        const midX = p.x + p.w / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(midX - 26 * sX, p.y + 102 * sY, 52 * sX, p.h - 158 * sY);
        ctx.strokeStyle = 'rgba(0,240,255,0.16)';
        ctx.lineWidth = 1.5 * sX;
        ctx.strokeRect(midX - 26 * sX, p.y + 102 * sY, 52 * sX, p.h - 158 * sY);

        for (let i = 0; i < 5; i++) {
            const y = p.y + 128 * sY + i * ((p.h - 220 * sY) / 4);
            ctx.fillStyle = 'rgba(41,48,56,0.96)';
            ctx.fillRect(midX - 40 * sX, y - 9 * sY, 80 * sX, 18 * sY);
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.strokeRect(midX - 40 * sX, y - 9 * sY, 80 * sX, 18 * sY);
            this._drawScrew(ctx, midX - 25 * sX, y, sX, '#00F0FF');
            this._drawScrew(ctx, midX + 25 * sX, y, sX, '#00F0FF');
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x, p.y, p.w, p.h);
        ctx.clip();
        this._drawAmbientCable(ctx, p.x + 80 * sX, p.y + p.h - 70 * sY, p.x + 330 * sX, p.y + p.h - 18 * sY, p.x + p.w - 360 * sX, p.y + p.h - 110 * sY, p.x + p.w - 80 * sX, p.y + p.h - 58 * sY, '#111111', 10 * sX, 0.48);
        this._drawAmbientCable(ctx, p.x + 95 * sX, p.y + 118 * sY, p.x + 365 * sX, p.y + 78 * sY, p.x + p.w - 360 * sX, p.y + 166 * sY, p.x + p.w - 96 * sX, p.y + 118 * sY, '#111111', 8 * sX, 0.36);
        ctx.restore();

        const dockX = p.x + p.w / 2 - 274 * sX;
        const dockY = p.y + p.h - 58 * sY;
        ctx.fillStyle = 'rgba(4,8,14,0.94)';
        ctx.fillRect(dockX, dockY, 548 * sX, 40 * sY);
        ctx.strokeStyle = 'rgba(0,240,255,0.30)';
        ctx.strokeRect(dockX, dockY, 548 * sX, 40 * sY);
        ctx.font = Math.round(8 * sX) + 'px monospace';
        ctx.textAlign = 'left';
        for (let i = 0; i < rowClasses.length; i++) {
            const cls = rowClasses[i];
            const done = !!this.lockedCorrect[cls];
            const x = dockX + (18 + i * 132) * sX;
            const pulse = done ? (0.6 + 0.4 * Math.sin(tick * 0.18 + i)) : 0.25;
            ctx.fillStyle = 'rgba(255,255,255,0.055)';
            ctx.fillRect(x - 6 * sX, dockY + 7 * sY, 118 * sX, 26 * sY);
            ctx.strokeStyle = done ? this._rgba(this._classColor(cls), 0.86) : 'rgba(255,255,255,0.14)';
            ctx.strokeRect(x - 6 * sX, dockY + 7 * sY, 118 * sX, 26 * sY);
            ctx.fillStyle = done ? this._rgba(this._classColor(cls), pulse) : 'rgba(145,158,170,0.38)';
            ctx.fillRect(x, dockY + 14 * sY, 10 * sX, 12 * sY);
            ctx.fillStyle = done ? '#DAEEFF' : 'rgba(218,238,255,0.44)';
            ctx.fillText('CLASS ' + cls, x + 18 * sX, dockY + 18 * sY);
            ctx.font = Math.round(6.5 * sX) + 'px monospace';
            ctx.fillStyle = done ? this._rgba(this._classColor(cls), 0.84) : 'rgba(218,238,255,0.25)';
            ctx.fillText(this._classRangeLabel(cls), x + 18 * sX, dockY + 28 * sY);
            ctx.font = Math.round(8 * sX) + 'px monospace';
        }
        ctx.restore();
    }

    _drawRailSocket(ctx, x, y, color, sX, sY, rightSide, active) {
        ctx.save();
        ctx.fillStyle = 'rgba(7,9,12,0.95)';
        ctx.fillRect(x - 13 * sX, y - 24 * sY, 26 * sX, 48 * sY);
        ctx.fillStyle = active ? color : '#5B646F';
        ctx.globalAlpha = active ? 0.75 : 0.34;
        ctx.fillRect(x - 9 * sX, y - 20 * sY, 18 * sX, 7 * sY);
        ctx.fillRect(x - 9 * sX, y + 13 * sY, 18 * sX, 7 * sY);
        ctx.globalAlpha = 1;

        const prongX = rightSide ? x - 22 * sX : x + 22 * sX;
        ctx.strokeStyle = 'rgba(188,105,52,0.90)';
        ctx.lineWidth = 2 * sX;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y + i * 3 * sY);
            ctx.lineTo(prongX, y + i * 5 * sY);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawScrew(ctx, x, y, sX, color) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 5 * sX, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,11,16,0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = Math.max(1, sX);
        ctx.stroke();
        ctx.strokeStyle = this._rgba(color, 0.56);
        ctx.beginPath();
        ctx.moveTo(x - 3 * sX, y);
        ctx.lineTo(x + 3 * sX, y);
        ctx.stroke();
        ctx.restore();
    }

    _drawTerminals(ctx, layout, font) {
        for (let i = 0; i < this.leftItems.length; i++) {
            const item = this.leftItems[i];
            const p = layout.leftPoints[item.className];
            this._drawTerminal(ctx, p, item.leftLabel, item.color, font, false, this.lockedCorrect[item.className]);
        }
        for (let i = 0; i < this.rightItems.length; i++) {
            const item = this.rightItems[i];
            const p = layout.rightPoints[item.className];
            this._drawTerminal(ctx, p, item.rightLabel, item.color, font, true, this.lockedCorrect[item.className]);
        }
    }

    _drawTerminal(ctx, point, label, color, font, rightSide, connected) {
        const sX = point.sX;
        const sY = point.sY;
        const activeColor = connected ? color : '#8B96A3';
        const tagW = 174 * sX;
        const tagH = 38 * sY;
        const tagX = rightSide ? point.x + 22 * sX : point.x - tagW - 22 * sX;
        const tagY = point.y - tagH / 2;
        const capW = 34 * sX;

        ctx.save();
        ctx.shadowColor = connected ? color : 'transparent';
        ctx.shadowBlur = connected ? 14 * sX : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(tagX + (rightSide ? 4 * sX : -4 * sX), tagY + 5 * sY, tagW, tagH);

        ctx.fillStyle = 'rgba(25,28,34,0.96)';
        ctx.fillRect(tagX, tagY, tagW, tagH);
        ctx.strokeStyle = connected ? color : 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.5 * sX;
        ctx.strokeRect(tagX, tagY, tagW, tagH);

        ctx.fillStyle = connected ? color : 'rgba(126,137,149,0.72)';
        if (rightSide) {
            ctx.fillRect(tagX + tagW - capW, tagY, capW, tagH);
        } else {
            ctx.fillRect(tagX, tagY, capW, tagH);
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1 * sX;
        for (let i = 0; i < 3; i++) {
            const sx = rightSide ? tagX + tagW - capW + (9 + i * 7) * sX : tagX + (9 + i * 7) * sX;
            ctx.beginPath();
            ctx.moveTo(sx, tagY + 7 * sY);
            ctx.lineTo(sx, tagY + tagH - 7 * sY);
            ctx.stroke();
        }

        ctx.font = 'bold ' + Math.round(14 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tagX + tagW / 2, point.y);

        ctx.beginPath();
        ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
        ctx.fillStyle = '#0B0D11';
        ctx.fill();
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 4 * sX;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(190,104,48,0.95)';
        ctx.lineWidth = 2 * sX;
        const strandDir = rightSide ? -1 : 1;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(point.x + strandDir * point.r * 0.72, point.y + i * 2.4 * sY);
            ctx.lineTo(point.x + strandDir * (point.r + 15 * sX), point.y + i * 4.2 * sY);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(3 * sX, point.r * 0.36), 0, Math.PI * 2);
        ctx.fillStyle = connected ? color : 'rgba(255,255,255,0.30)';
        ctx.fill();
        ctx.restore();
    }

    _rgba(hex, alpha) {
        const value = String(hex || '').replace('#', '');
        if (value.length !== 6) return 'rgba(255,255,255,' + alpha + ')';
        const r = parseInt(value.slice(0, 2), 16);
        const g = parseInt(value.slice(2, 4), 16);
        const b = parseInt(value.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    _drawAmbientCable(ctx, x1, y1, c1x, c1y, c2x, c2y, x2, y2, color, width, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.78)';
        ctx.lineWidth = width + 5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = Math.max(1, width * 0.18);
        ctx.beginPath();
        ctx.moveTo(x1, y1 - width * 0.18);
        ctx.bezierCurveTo(c1x, c1y - width * 0.18, c2x, c2y - width * 0.18, x2, y2 - width * 0.18);
        ctx.stroke();
        ctx.restore();
    }

    _drawConnections(ctx, layout) {
        for (let i = 0; i < this.leftItems.length; i++) {
            const className = this.leftItems[i].className;
            if (!this.connections[className]) continue;
            const from = layout.leftPoints[className];
            const targetClass = this.connections[className];
            const to = layout.rightPoints[targetClass];
            if (!to) continue;
            if (this.wrongConnections[className]) {
                this._drawGradientWire(
                    ctx,
                    from.x,
                    from.y,
                    to.x,
                    to.y,
                    8 * layout.sX,
                    1,
                    [this._classColor(className), this._classColor(targetClass)]
                );
            } else if (this.lockedCorrect[className]) {
                this._drawWire(ctx, from.x, from.y, to.x, to.y, this._classColor(className), 7 * layout.sX, true);
            } else {
                this._drawWire(ctx, from.x, from.y, to.x, to.y, '#AEB7C2', 6 * layout.sX, false);
            }
        }
    }

    _drawDragWire(ctx, layout) {
        if (!this.dragging) return;
        const from = layout.leftPoints[this.dragging.className];
        this._drawWire(ctx, from.x, from.y, this.mouse.x, this.mouse.y, '#AEB7C2', 7 * layout.sX, false);
    }

    _drawFailedWire(ctx, layout) {
        if (!this.failedWires || this.failedWires.length === 0) return;
        for (let i = 0; i < this.failedWires.length; i++) {
            const fail = this.failedWires[i];
            const ratio = Math.max(0, fail.life / fail.maxLife);
            const pullBack = 1 - ratio;
            const toX = fail.toX + (fail.fromX - fail.toX) * pullBack * 0.45;
            const toY = fail.toY + (fail.fromY - fail.toY) * pullBack * 0.45;
            const width = 9 * layout.sX * (0.6 + ratio * 0.5);
            this._drawGradientWire(ctx, fail.fromX, fail.fromY, toX, toY, width, ratio, fail.colors);
        }
    }

    _drawWire(ctx, x1, y1, x2, y2, color, width, energized) {
        const dx = Math.abs(x2 - x1);
        const c1x = x1 + dx * 0.46;
        const c2x = x2 - dx * 0.46;
        const sag = Math.min(80, dx * 0.08);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.shadowColor = energized ? color : 'transparent';
        ctx.shadowBlur = energized ? width * 1.2 : 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.68)';
        ctx.lineWidth = width + 5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(c1x, y1 + sag, c2x, y2 + sag, x2, y2);
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(c1x, y1 + sag, c2x, y2 + sag, x2, y2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.20)';
        ctx.lineWidth = Math.max(1, width * 0.22);
        ctx.beginPath();
        ctx.moveTo(x1, y1 - width * 0.18);
        ctx.bezierCurveTo(c1x, y1 + sag - width * 0.18, c2x, y2 + sag - width * 0.18, x2, y2 - width * 0.18);
        ctx.stroke();
        ctx.restore();
    }

    _drawGradientWire(ctx, x1, y1, x2, y2, width, alpha, colorPair) {
        const dx = Math.abs(x2 - x1);
        const c1x = x1 + dx * 0.46;
        const c2x = x2 - dx * 0.46;
        const sag = Math.min(80, dx * 0.08);
        const pair = colorPair && colorPair.length ? colorPair : ['#FFE600', '#2455FF', '#FF003C', '#FF3CFF'];
        const colors = pair.length === 2 ? [pair[0], '#FFFFFF', pair[1], '#FF003C'] : pair;
        ctx.save();
        ctx.globalAlpha = Math.max(0.15, alpha);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.76)';
        ctx.lineWidth = width + 7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(c1x, y1 + sag, c2x, y2 + sag, x2, y2);
        ctx.stroke();

        for (let i = 0; i < colors.length; i++) {
            ctx.strokeStyle = colors[(i + Math.floor(this.animTick / 3)) % colors.length];
            ctx.lineWidth = Math.max(2, width - i * 1.3);
            ctx.shadowColor = colors[(i + 1) % colors.length];
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(x1, y1 + (i - 1.5) * 1.8);
            ctx.bezierCurveTo(c1x, y1 + sag + (i - 1.5) * 1.8, c2x, y2 + sag + (i - 1.5) * 1.8, x2, y2 + (i - 1.5) * 1.8);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawSpark(ctx, spark, sX) {
        const lifeRatio = Math.max(0, spark.life / 24);
        const rays = 18;
        ctx.save();
        ctx.translate(spark.x, spark.y);
        ctx.globalAlpha = lifeRatio;
        ctx.lineWidth = 2 * sX;
        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 18 * sX;
        for (let i = 0; i < rays; i++) {
            const a = i * Math.PI * 2 / rays + this.animTick * 0.18;
            const r1 = 5 * sX;
            const r2 = (18 + (i % 4) * 9) * sX * (1.15 - lifeRatio * 0.25);
            ctx.strokeStyle = i % 3 === 0 ? '#FFE600' : (i % 3 === 1 ? '#FFFFFF' : '#FF003C');
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
            ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
            ctx.stroke();
        }
        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.arc(0, 0, 7 * sX, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawFailureOverlay(ctx, cW, cH) {
        if (this.failFlash <= 0) return;
        const alpha = Math.min(0.26, this.failFlash / 18 * 0.26);
        ctx.save();
        ctx.fillStyle = 'rgba(255,0,60,' + alpha + ')';
        ctx.fillRect(0, 0, cW, cH);
        ctx.strokeStyle = 'rgba(255,0,60,' + Math.min(0.8, alpha * 3) + ')';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, cW - 8, cH - 8);
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, alpha * 5) + ')';
        ctx.textAlign = 'center';
        ctx.fillText('LINK FAULT // CLASS MISMATCH', cW / 2, 34);
        ctx.restore();
    }

    _drawCompleteOverlay(ctx, layout, font) {
        const p = layout.panel;
        const tick = this.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.14);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(30 * layout.sX) + 'px ' + font;
        ctx.fillStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.fillText('PATCH COMPLETE', p.x + p.w / 2, p.y + p.h - 48 * layout.sY);
        ctx.restore();
    }

    _layout() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const panel = {
            x: Math.max(22 * sX, cW * 0.06),
            y: Math.max(18 * sY, cH * 0.06),
            w: Math.min(cW * 0.88, 1120 * sX),
            h: Math.min(cH * 0.86, 640 * sY),
        };
        panel.x = (cW - panel.w) / 2;
        panel.y = (cH - panel.h) / 2;

        const leftX = panel.x + Math.max(215 * sX, panel.w * 0.22);
        const rightX = panel.x + panel.w - Math.max(215 * sX, panel.w * 0.22);
        const topY = panel.y + 150 * sY;
        const bottomY = panel.y + panel.h - 125 * sY;
        const gap = (bottomY - topY) / 3;
        const radius = Math.max(11 * sX, 10);
        const leftPoints = {};
        const rightPoints = {};

        for (let i = 0; i < this.leftItems.length; i++) {
            leftPoints[this.leftItems[i].className] = {
                x: leftX,
                y: topY + gap * i,
                r: radius,
                sX,
                sY,
            };
        }
        for (let i = 0; i < this.rightItems.length; i++) {
            rightPoints[this.rightItems[i].className] = {
                x: rightX,
                y: topY + gap * i,
                r: radius,
                sX,
                sY,
            };
        }

        return { cW, cH, sX, sY, panel, leftX, rightX, topY, bottomY, gap, leftPoints, rightPoints };
    }

    _generatePuzzle() {
        const classes = [
            { className: 'A', min: 1, max: 126, color: '#FFE600' },
            { className: 'B', min: 128, max: 191, color: '#2455FF' },
            { className: 'C', min: 192, max: 223, color: '#FF003C' },
            { className: 'D', min: 224, max: 239, color: '#FF3CFF' },
        ];
        const output = [];
        for (let i = 0; i < classes.length; i++) {
            const spec = classes[i];
            const octets = [
                this._rand(spec.min, spec.max),
                this._rand(0, 255),
                this._rand(0, 255),
                this._rand(1, 254),
            ];
            output.push({
                className: spec.className,
                color: spec.color,
                ip: octets.join('.'),
                leftLabel: octets[0] + '.' + octets[1],
                rightLabel: octets[2] + '.' + octets[3] + ' / ' + spec.className,
            });
        }
        return output;
    }

    _shuffle(items) {
        const copy = items.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    _rand(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    _classColor(className) {
        if (className === 'A') return '#FFE600';
        if (className === 'B') return '#2455FF';
        if (className === 'C') return '#FF003C';
        return '#FF3CFF';
    }

    _classRangeLabel(className) {
        if (className === 'A') return '001-126';
        if (className === 'B') return '128-191';
        if (className === 'C') return '192-223';
        return '224-239';
    }

    _clearTargetConnection(targetClass) {
        const classes = ['A', 'B', 'C', 'D'];
        for (let i = 0; i < classes.length; i++) {
            const sourceClass = classes[i];
            if (this.connections[sourceClass] === targetClass) delete this.connections[sourceClass];
        }
    }

    _evaluateConnections() {
        if (this.verdictTimer > 0 || this.completed) return;

        const mistakes = [];
        const classes = ['A', 'B', 'C', 'D'];
        this.wrongConnections = {};

        for (let i = 0; i < classes.length; i++) {
            const sourceClass = classes[i];
            const targetClass = this.connections[sourceClass];
            if (targetClass === sourceClass) {
                this.lockedCorrect[sourceClass] = true;
            } else {
                this.wrongConnections[sourceClass] = true;
                mistakes.push(this._mistakeFor(sourceClass, targetClass));
            }
        }

        if (mistakes.length === 0) {
            this._playConfirm();
            this.completed = true;
            this.completedAt = Date.now();
            return;
        }

        this.attemptsUsed++;
        this.failFlash = 34;
        this.verdictTimer = 58;
        this.pendingMistakeDialogue = mistakes;
        this.pendingFailureExit = this.attemptsUsed >= this.maxAttempts ? mistakes : null;
        this._spawnMistakeSparks(mistakes);
        this._playCancel();
    }

    _resolveFailedVerdict() {
        const layout = this._layout();
        const mistakes = this.pendingMistakeDialogue || [];

        for (let i = 0; i < mistakes.length; i++) {
            const mistake = mistakes[i];
            const from = layout.leftPoints[mistake.sourceClass];
            const to = layout.rightPoints[mistake.targetClass];
            if (from && to) {
                this.failedWires.push({
                    fromX: from.x,
                    fromY: from.y,
                    toX: to.x,
                    toY: to.y,
                    colors: [this._classColor(mistake.sourceClass), this._classColor(mistake.targetClass)],
                    life: 34,
                    maxLife: 34,
                });
            }
            delete this.connections[mistake.sourceClass];
        }

        this.wrongConnections = {};

        if (this.pendingFailureExit) {
            this._failOut(this.pendingFailureExit);
            return;
        }

        const feedbackEnabled = this.options && this.options.tutorialFeedback;
        if (feedbackEnabled && IP2Live.IPWiresTutorial) {
            const remaining = Math.max(0, this.maxAttempts - this.attemptsUsed);
            IP2Live.IPWiresTutorial.showMistakeAnalysis(mistakes, remaining);
        }

        this.pendingMistakeDialogue = null;
    }

    _mistakeFor(sourceClass, targetClass) {
        const source = this._itemByClass(this.leftItems, sourceClass) || {};
        const target = this._itemByClass(this.rightItems, targetClass) || {};
        return {
            sourceClass,
            targetClass: targetClass || '?',
            leftLabel: source.leftLabel || source.ip || sourceClass,
            targetLabel: target.rightLabel || targetClass || 'UNKNOWN',
        };
    }

    _itemByClass(items, className) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].className === className) return items[i];
        }
        return null;
    }

    _spawnMistakeSparks(mistakes) {
        const layout = this._layout();
        for (let i = 0; i < mistakes.length; i++) {
            const targetClass = mistakes[i].targetClass;
            const p = layout.rightPoints[targetClass] || layout.leftPoints[mistakes[i].sourceClass];
            if (!p) continue;
            this.sparks.push({
                x: p.x,
                y: p.y,
                color: this._classColor(mistakes[i].sourceClass),
                life: 26,
            });
        }
    }

    _allConnected() {
        return !!(
            this.connections.A &&
            this.connections.B &&
            this.connections.C &&
            this.connections.D
        );
    }

    _distance(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _finish() {
        if (this._finished) return;
        this._finished = true;
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete({
                gameplayId: 'ip_class_wires',
                connections: Object.assign({}, this.connections),
                attemptsUsed: this.attemptsUsed,
            });
        }
    }

    _failOut(mistakes) {
        if (this._finished) return;
        this._finished = true;
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed({
                gameplayId: 'ip_class_wires',
                reason: 'attempts_exhausted',
                attemptsUsed: this.attemptsUsed,
                maxAttempts: this.maxAttempts,
                mistakes: mistakes || [],
            });
        }
    }

    _cancel() {
        if (typeof this.options.onCancel === 'function') this.options.onCancel();
    }

    _playCursor() {
        try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) {}
    }

    _playConfirm() {
        try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) {}
    }

    _playCancel() {
        try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) {}
    }
}

const GameplayManager = {
    VERSION: 'ip-wires-gameplay-manager-20260523-02',
    WIRE_QUEST_ID: 'stage.3.ip_wires.01.tutorial',
    WIRE_OBJECTIVE_ID: 'repair_ip_wires_01',
    _activeAttempt: null,
    _registeredQuestIds: {},
    _triggerLocks: {},

    WIRE_QUESTS: [
        {
            id: 'stage.3.ip_wires.01.tutorial',
            objectiveId: 'repair_ip_wires_01',
            title: 'REPAIR IP WIRES 01',
            label: 'Lever 01',
            targetTile: { x: 6, y: 0, z: 21 },
            tutorial: true,
        },
        {
            id: 'stage.3.ip_wires.02',
            objectiveId: 'repair_ip_wires_02',
            title: 'REPAIR IP WIRES 02',
            label: 'Lever 02',
            targetTile: { x: 27, y: 0, z: 10 },
        },
        {
            id: 'stage.3.ip_wires.03',
            objectiveId: 'repair_ip_wires_03',
            title: 'REPAIR IP WIRES 03',
            label: 'Lever 03',
            targetTile: { x: 13, y: 0, z: 6 },
        },
        {
            id: 'stage.3.ip_wires.04',
            objectiveId: 'repair_ip_wires_04',
            title: 'REPAIR IP WIRES 04',
            label: 'Lever 04',
            targetTile: { x: 19, y: 0, z: 27 },
        },
    ],

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !stage || Number(stage.id) !== 3) return [];

        const questIds = [];
        for (let i = 0; i < this.WIRE_QUESTS.length; i++) {
            const spec = this.WIRE_QUESTS[i];
            questIds.push(spec.id);
            if (this._registeredQuestIds[spec.id] && qm.quests && qm.quests[spec.id]) continue;

            const target = Object.assign({}, spec.targetTile);

            qm.registerQuest({
                id: spec.id,
                title: 'QUEST AREA',
                stageMapId: stage.id,
                resetOnMapEnter: true,
                objectives: [
                    {
                        id: spec.objectiveId,
                        title: spec.title,
                        detail: 'TARGET TILE  X:' + target.x + '  Y:' + (target.y || 0) + '  Z:' + target.z,
                        targetTile: target,
                        completionRadiusTiles: 0.55,
                        isComplete: (context, activeQuestManager) => {
                            return GameplayManager._handleWireObjective(spec, context, activeQuestManager);
                        },
                    },
                ],
            });
            this._registeredQuestIds[spec.id] = true;
        }

        return questIds;
    },

    _handleWireObjective(spec, context, questManager) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;

        const objective = qm.currentObjective();
        if (!objective || objective.id !== spec.objectiveId) return false;
        const dist = qm.distanceToObjective(objective, context && context.hero);
        const radius = typeof objective.completionRadiusTiles === 'number'
            ? objective.completionRadiusTiles
            : 0.55;

        this._refreshTriggerLock(spec, dist, radius);
        if (dist === null || dist > radius) return false;
        if (this._triggerLocks[spec.objectiveId]) return false;

        this.launchWireGameplay({
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId: context && context.mapId,
            tutorialFeedback: !!spec.tutorial,
        });
        return false;
    },

    _refreshTriggerLock(spec, distance, radius) {
        if (!this._triggerLocks[spec.objectiveId]) return;
        if (distance === null || distance > radius + 0.35) delete this._triggerLocks[spec.objectiveId];
    },

    _lockUntilStepOff(spec) {
        if (spec && spec.objectiveId) this._triggerLocks[spec.objectiveId] = true;
    },

    _playMusicZone(zoneName) {
        const music = IP2Live.MusicManager;
        if (!music || !music.ZONE || !music.ZONE[zoneName] || typeof music.play !== 'function') return false;
        music.play(music.ZONE[zoneName]);
        return true;
    },

    _restoreStageMusic() {
        return this._playMusicZone('STAGE_1');
    },

    launchWireGameplay(options) {
        const opts = options || {};
        const spec = opts.spec || this.WIRE_QUESTS[0];
        const attemptKey = (opts.questId || spec.id) + ':' + (opts.objectiveId || spec.objectiveId);
        if (this._activeAttempt === attemptKey) return false;
        this._activeAttempt = attemptKey;

        const createScreen = () => new IP2LiveWiresGameplayScreen({
            maxAttempts: 3,
            tutorialFeedback: !!opts.tutorialFeedback,
            questLabel: spec.label,
            onComplete: (result) => {
                this._completeWireGameplay(opts, result);
            },
            onFailed: (result) => {
                this._failWireGameplay(opts, result);
            },
            onCancel: () => {
                this._activeAttempt = null;
                this._lockUntilStepOff(spec);
                Manager.Stack.pop();
                this._restoreStageMusic();
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            },
        });

        const openGameplay = () => {
            this._playMusicZone('GAMEPLAY_1');
            Manager.Stack.replace(createScreen());
        };

        if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
            IP2Live.LoadingScreen.show({
                mode: 'push',
                status: 'Loading Gameplay',
                detail: 'Opening ' + (spec.label || 'IP class wire panel'),
                onComplete: openGameplay,
            });
        } else {
            this._playMusicZone('GAMEPLAY_1');
            Manager.Stack.push(createScreen());
        }
        return true;
    },

    _completeWireGameplay(options, result) {
        const opts = options || {};
        const spec = opts.spec || this.WIRE_QUESTS[0];
        this._activeAttempt = null;
        delete this._triggerLocks[spec.objectiveId];
        Manager.Stack.pop();
        this._restoreStageMusic();

        if (
            IP2Live.QuestManager &&
            IP2Live.QuestManager.activeQuestId === (opts.questId || spec.id) &&
            IP2Live.QuestManager.activeObjectiveId === (opts.objectiveId || spec.objectiveId)
        ) {
            IP2Live.QuestManager.completeObjective(opts.objectiveId || spec.objectiveId);
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return result;
    },

    _failWireGameplay(options, result) {
        const opts = options || {};
        const spec = opts.spec || this.WIRE_QUESTS[0];
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        Manager.Stack.pop();
        this._restoreStageMusic();

        if (spec.tutorial) {
            if (IP2Live.IPWiresTutorial) {
                setTimeout(() => {
                    IP2Live.IPWiresTutorial.showPacketsShifted();
                }, 220);
            }
        } else {
            this._sendStageBackToFirstWire(spec);
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return result;
    },

    _sendStageBackToFirstWire(failedSpec) {
        const qm = IP2Live.QuestManager;
        const first = this.WIRE_QUESTS[0];
        if (qm) {
            if (!qm.completedObjectives[first.id]) qm.completedObjectives[first.id] = {};
            qm.completedObjectives[first.id] = {};
            if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
            qm.startQuest(first.id, {
                mapId: 3,
                mapQuestMode: true,
                keepLastCompletion: true,
                visible: true,
                preview: false,
                guideActive: true,
                allowCompletion: true,
            });
        }

        if (IP2Live.IPWiresTutorial) {
            setTimeout(() => {
                IP2Live.IPWiresTutorial.showStageRepairReset(failedSpec && failedSpec.label);
            }, 220);
        }
    },
};

IP2Live.GameplayManager = GameplayManager;
IP2Live.WiresGameplayScreen = IP2LiveWiresGameplayScreen;
window.IP2LiveGameplayManager = GameplayManager;
window.IP2LiveWiresGameplayScreen = IP2LiveWiresGameplayScreen;

console.log('[IP2Live] ip_wires_gameplay.js module loaded.');
