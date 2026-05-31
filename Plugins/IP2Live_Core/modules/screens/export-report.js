/**
 * IP2Live - Export Report Screen
 *
 * Modal screen for selecting report scope/format/filename.
 */

class IP2LiveExportReportMenu extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
    }

    initialize() {
        this.selectedIndex = 0;
        this.items = ['SCOPE', 'FORMAT', 'FILENAME', 'BACK', 'EXPORT'];
        this.scopeDaysOptions = [7, 30, 90];
        this.scopeIndex = 1;
        this.formatOptions = ['PDF', 'EXCEL', 'BOTH'];
        this.formatIndex = 2;
        this.filename = this._defaultFilename();
        this.editFilename = false;
        this.statusLine = 'SELECT OPTIONS TO EXPORT REPORT';
        this.busy = false;
        this.animTick = 0;
        this.scanlineOffset = 0;
        this.hoverIndex = -1;
        this.bgPackets = [];
        this.bgBits = [];
        this.bgNodes = [];
        this.bgWires = [];
        this._bgSeedSize = null;
    }

    _defaultFilename() {
        const name = (Core && Core.Game && Core.Game.current && Core.Game.current.infiltratorName)
            ? String(Core.Game.current.infiltratorName)
            : 'UNKNOWN';
        const safe = name.replace(/[^A-Za-z0-9_\-]+/g, '_');
        return 'IP2Live_Report_' + safe;
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this._seedBackdrop(cW, cH);
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        const token = this._keyToken(key).toUpperCase();
        if (this.editFilename) {
            if (Data.Keyboards.checkActionMenu(key) || token === 'ENTER') {
                this.editFilename = false;
                this.statusLine = 'FILENAME LOCKED';
                return true;
            }
            if (Data.Keyboards.checkCancelMenu(key)) {
                this.editFilename = false;
                this.statusLine = 'FILENAME EDIT CANCELLED';
                return true;
            }
            if (token === 'BACKSPACE') {
                this.filename = this.filename.slice(0, -1);
                return true;
            }
            const ch = this._charFromToken(token);
            if (ch && this.filename.length < 48) this.filename += ch;
            return true;
        }

        if (Data.Keyboards.checkCancelMenu(key)) {
            Manager.Stack.pop();
            return true;
        }
        if (Data.Keyboards.checkActionMenu(key) || token === 'ENTER') {
            this._confirmSelection();
            return true;
        }
        return true;
    }

    onKeyPressedAndRepeat(key) {
        if (this.editFilename || this.busy) return true;
        const prev = this.selectedIndex;
        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Left)) {
            if (this.selectedIndex <= 1) {
                this._shiftOption(-1);
            } else if (this.selectedIndex >= 3) {
                this.selectedIndex = 3;
            }
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Right)) {
            if (this.selectedIndex <= 1) {
                this._shiftOption(1);
            } else if (this.selectedIndex >= 3) {
                this.selectedIndex = 4;
            }
        }
        if (prev !== this.selectedIndex) Data.Systems.soundCursor.playSound();
        Manager.Stack.requestPaintHUD = true;
        return true;
    }

    _shiftOption(dir) {
        if (this.selectedIndex === 0) {
            const len = this.scopeDaysOptions.length;
            this.scopeIndex = (this.scopeIndex + dir + len) % len;
        } else if (this.selectedIndex === 1) {
            const len = this.formatOptions.length;
            this.formatIndex = (this.formatIndex + dir + len) % len;
        }
    }

    _confirmSelection() {
        if (this.busy) return;
        if (this.selectedIndex === 0 || this.selectedIndex === 1) {
            this._shiftOption(1);
            Data.Systems.soundCursor.playSound();
            return;
        }
        if (this.selectedIndex === 2) {
            this.editFilename = true;
            this.statusLine = 'EDIT FILENAME, ENTER TO CONFIRM';
            Data.Systems.soundCursor.playSound();
            return;
        }
        if (this.selectedIndex === 3) {
            Manager.Stack.pop();
            return;
        }
        if (this.selectedIndex === 4) {
            this._runExport();
        }
    }

    async _runExport() {
        this.busy = true;
        this.statusLine = 'EXPORTING REPORT...';
        Data.Systems.soundConfirmation.playSound();
        try {
            const formatRaw = this.formatOptions[this.formatIndex] || 'BOTH';
            const format = formatRaw === 'BOTH' ? 'both' : (formatRaw === 'PDF' ? 'pdf' : 'excel');
            const gm = IP2Live.GameManager;
            if (!gm || typeof gm.exportProgressReport !== 'function') {
                this.statusLine = 'EXPORT FAILED: REPORT SYSTEM UNAVAILABLE';
                Data.Systems.soundImpossible.playSound();
                this.busy = false;
                return;
            }
            const result = await gm.exportProgressReport({
                scopeDays: this.scopeDaysOptions[this.scopeIndex] || 30,
                format: format,
                filenameBase: String(this.filename || '').trim() || null,
            });
            if (result && result.ok) {
                this.statusLine = 'EXPORT COMPLETE: ' + (result.exported || []).join(' + ').toUpperCase();
                Data.Systems.soundConfirmation.playSound();
            } else {
                this.statusLine = 'EXPORT FAILED';
                Data.Systems.soundImpossible.playSound();
            }
        } catch (e) {
            console.warn('[IP2Live] Export menu failed:', e);
            this.statusLine = 'EXPORT FAILED';
            Data.Systems.soundImpossible.playSound();
        }
        this.busy = false;
        Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.55) % 5;
        this._updateBackdrop();
        if (this.animTick % 2 === 0) Manager.Stack.requestPaintHUD = true;
    }

    onMouseMove(x, y) {
        if (this.busy) return true;
        const idx = this._hitItemIndex(x, y);
        if (idx !== this.hoverIndex) {
            this.hoverIndex = idx;
            if (idx >= 0 && !this.editFilename && idx !== this.selectedIndex) {
                this.selectedIndex = idx;
                Data.Systems.soundCursor.playSound();
            }
            Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseUp(x, y) {
        if (this.busy) return true;
        const idx = this._hitItemIndex(x, y);
        if (idx < 0) return true;
        if (this.selectedIndex !== idx) {
            this.selectedIndex = idx;
            Data.Systems.soundCursor.playSound();
        }
        this._confirmSelection();
        Manager.Stack.requestPaintHUD = true;
        return true;
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const l = this._layout();
        const titleFont = IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';
        const bodyFont = IP2Live.Assets.astronomousLoaded
            ? 'Astronomous'
            : (IP2Live.Assets.neuropolLoaded
            ? 'Neuropol'
            : (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace'));
        const actionPulse = 0.55 + 0.45 * Math.sin(this.animTick * 0.09);

        ctx.save();
        if (!this._bgSeedSize || this._bgSeedSize[0] !== l.cW || this._bgSeedSize[1] !== l.cH) {
            this._seedBackdrop(l.cW, l.cH);
        }
        this._drawBackdrop(ctx, l);

        ctx.globalAlpha = 0.045;
        ctx.fillStyle = '#000000';
        for (let ly = this.scanlineOffset * l.sY; ly < l.cH; ly += 5 * l.sY) {
            ctx.fillRect(0, ly, l.cW, 1.5 * l.sY);
        }
        ctx.globalAlpha = 1;

        IP2Live.UI.drawCyberPanel({
            ctx: ctx,
            x: l.x * l.sX,
            y: l.y * l.sY,
            w: l.w * l.sX,
            h: l.h * l.sY,
            scaleX: l.sX,
            accent: '#00F0FF',
            title: 'SYS::PROGRESS_ARCHIVE_EXPORT::NET',
        });

        this._drawPanelMotif(ctx, l);

        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(184, 236, 255, 0.92)';
        ctx.font = Math.round(8 * l.sX) + 'px ' + bodyFont;
        ctx.fillText('NODE-LINKED OUTPUT CHANNEL', (l.x + 146) * l.sX, (l.y + 48) * l.sY);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(22 * l.sX) + 'px ' + titleFont;
        ctx.textAlign = 'center';
        ctx.fillText('EXPORT STUDENT REPORT', (l.x + l.w * 0.5) * l.sX, (l.y + 78) * l.sY);

        ctx.font = Math.round(10 * l.sX) + 'px ' + bodyFont;
        ctx.fillStyle = 'rgba(191, 247, 255, 0.86)';
        ctx.fillText('GENERATE OPERATIONAL ARCHIVE PACKETS', (l.x + l.w * 0.5) * l.sX, (l.y + 102) * l.sY);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';

        const rows = [
            { label: 'SCOPE WINDOW', value: String(this.scopeDaysOptions[this.scopeIndex] || 30) + ' DAYS', nav: true },
            { label: 'EXPORT FORMAT', value: String(this.formatOptions[this.formatIndex] || 'BOTH'), nav: true },
            {
                label: 'FILENAME',
                value: this.filename + (this.editFilename && this.animTick % 40 < 20 ? '_' : ''),
                nav: false
            }
        ];

        for (let i = 0; i < rows.length; i++) {
            const active = i === this.selectedIndex;
            const hover = i === this.hoverIndex;
            this._drawRowCard(ctx, l, i, rows[i], active, hover, bodyFont, titleFont);
        }

        const actionY = l.actionY * l.sY;
        const leftActive = this.selectedIndex === 3 || this.hoverIndex === 3;
        const rightActive = this.selectedIndex === 4 || this.hoverIndex === 4;
        this._drawActionButton(
            ctx, l, l.actionLeftX * l.sX, actionY, l.actionBtnW * l.sX, l.rowH * l.sY,
            'BACK', leftActive, true, 3, titleFont
        );
        this._drawActionButton(
            ctx, l, l.actionRightX * l.sX, actionY, l.actionBtnW * l.sX, l.rowH * l.sY,
            this.busy ? 'EXPORTING...' : 'RUN EXPORT', rightActive, false, 4, titleFont
        );

        const statusX = (l.x + 36) * l.sX;
        const statusY = (l.y + l.h - 46) * l.sY;
        const statusW = (l.w - 72) * l.sX;
        const statusH = 28 * l.sY;
        const statusGrad = ctx.createLinearGradient(statusX, statusY, statusX + statusW, statusY);
        statusGrad.addColorStop(0, 'rgba(0,240,255,0.16)');
        statusGrad.addColorStop(0.48, 'rgba(255,230,0,0.14)');
        statusGrad.addColorStop(1, 'rgba(255,32,96,0.16)');
        ctx.fillStyle = statusGrad;
        ctx.fillRect(statusX, statusY, statusW, statusH);
        ctx.strokeStyle = 'rgba(0,240,255,0.52)';
        ctx.lineWidth = 1.1 * l.sX;
        ctx.strokeRect(statusX, statusY, statusW, statusH);

        ctx.fillStyle = this.busy ? '#FFE600' : 'rgba(220, 246, 255, 0.94)';
        ctx.font = Math.round(10 * l.sX) + 'px ' + bodyFont;
        ctx.fillText(this.statusLine, (l.x + 44) * l.sX, (l.y + l.h - 28) * l.sY);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(200, 232, 255, ' + (0.72 + actionPulse * 0.2).toFixed(3) + ')';
        ctx.font = Math.round(5.5 * l.sX) + 'px ' + bodyFont;
        const hint = this.editFilename
            ? '[TYPE] [BKSP] [ENTER]'
            : '[ARROWS] NAV/ADJUST  [ENTER] CONFIRM';
        ctx.fillText(hint, statusX + statusW - 10 * l.sX, statusY + statusH * 0.72);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    _layout() {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const sX = cW / SW;
        const sY = cH / SH;
        const w = 690;
        const h = 520;
        const x = (SW - w) * 0.5;
        const y = (SH - h) * 0.5;
        const rowX = x + 40;
        const rowW = w - 80;
        const rowH = 52;
        const rowGap = 14;
        const rowStartY = y + 146;
        const actionGap = 18;
        const actionBtnW = (rowW - actionGap) * 0.5;
        const actionLeftX = rowX;
        const actionRightX = rowX + actionBtnW + actionGap;
        const actionY = rowStartY + 3 * (rowH + rowGap) + 6;
        return {
            SW, SH, cW, cH, sX, sY, x, y, w, h,
            rowX, rowW, rowH, rowGap, rowStartY,
            actionGap, actionBtnW, actionLeftX, actionRightX, actionY
        };
    }

    _hitItemIndex(mouseX, mouseY) {
        const l = this._layout();
        for (let i = 0; i < 3; i++) {
            const rx = l.rowX;
            const ry = l.rowStartY + i * (l.rowH + l.rowGap);
            const rw = l.rowW;
            const rh = l.rowH;
            if (
                mouseX >= rx * l.sX &&
                mouseX <= (rx + rw) * l.sX &&
                mouseY >= ry * l.sY &&
                mouseY <= (ry + rh) * l.sY
            ) {
                return i;
            }
        }
        const ay = l.actionY;
        if (
            mouseX >= l.actionLeftX * l.sX &&
            mouseX <= (l.actionLeftX + l.actionBtnW) * l.sX &&
            mouseY >= ay * l.sY &&
            mouseY <= (ay + l.rowH) * l.sY
        ) return 3;
        if (
            mouseX >= l.actionRightX * l.sX &&
            mouseX <= (l.actionRightX + l.actionBtnW) * l.sX &&
            mouseY >= ay * l.sY &&
            mouseY <= (ay + l.rowH) * l.sY
        ) return 4;
        return -1;
    }

    _seedBackdrop(cW, cH) {
        this._bgSeedSize = [cW, cH];
        this.bgPackets = [];
        this.bgBits = [];
        this.bgNodes = [];
        this.bgWires = [];

        for (let i = 0; i < 24; i++) {
            this.bgNodes.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                r: 1.8 + Math.random() * 2.2,
                p: Math.random() * Math.PI * 2
            });
        }

        for (let i = 0; i < 10; i++) {
            const y = cH * (0.14 + i * 0.08 + Math.random() * 0.02);
            const slope = -0.20 - Math.random() * 0.2;
            this.bgWires.push({
                y,
                slope,
                speed: 0.8 + Math.random() * 2.4,
                phase: Math.random() * cW
            });
        }

        for (let i = 0; i < 28; i++) {
            this.bgPackets.push({
                wire: i % this.bgWires.length,
                t: Math.random(),
                speed: 0.0012 + Math.random() * 0.0035,
                size: 4 + Math.random() * 7,
                color: Math.random() > 0.72 ? '#FF2D6D' : '#00E9FF'
            });
        }

        const chars = ['0', '1', '::', '{}', '0x', '<>', '//', '10', '01', 'FF', '&&', '!='];
        for (let i = 0; i < 80; i++) {
            this.bgBits.push({
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

    _updateBackdrop() {
        if (!this._bgSeedSize) return;
        const cW = this._bgSeedSize[0];
        const cH = this._bgSeedSize[1];

        for (let i = 0; i < this.bgPackets.length; i++) {
            const p = this.bgPackets[i];
            p.t += p.speed;
            if (p.t > 1.08) p.t = -0.08;
        }

        for (let i = 0; i < this.bgBits.length; i++) {
            const b = this.bgBits[i];
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

    _drawBackdrop(ctx, l) {
        const cW = l.cW;
        const cH = l.cH;
        const t = this.animTick;

        const base = ctx.createLinearGradient(0, 0, cW, cH);
        base.addColorStop(0, '#030816');
        base.addColorStop(0.38, '#041126');
        base.addColorStop(1, '#0A0620');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, cW, cH);

        this._drawSlantedGrid(ctx, l);
        this._drawWireMatrix(ctx, l, t);
        this._drawPacketFlow(ctx, l);
        this._drawFloatingBits(ctx, l);

        const vignette = ctx.createRadialGradient(cW * 0.5, cH * 0.48, cW * 0.08, cW * 0.5, cH * 0.5, cW * 0.74);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, cW, cH);
    }

    _drawSlantedGrid(ctx, l) {
        const cW = l.cW;
        const cH = l.cH;
        const shear = 0.24;

        ctx.save();
        ctx.transform(1, 0, -shear, 1, cW * 0.24, 0);
        for (let x = -cW * 0.4; x < cW * 1.35; x += 42 * l.sX) {
            ctx.strokeStyle = 'rgba(0,232,255,0.10)';
            ctx.lineWidth = 1 * l.sX;
            ctx.beginPath();
            ctx.moveTo(x, cH * 0.04);
            ctx.lineTo(x, cH * 0.98);
            ctx.stroke();
        }
        ctx.restore();

        for (let y = cH * 0.12; y < cH; y += 28 * l.sY) {
            const fade = 0.06 + ((y / cH) * 0.12);
            ctx.strokeStyle = 'rgba(0,232,255,' + fade.toFixed(3) + ')';
            ctx.lineWidth = 1 * l.sY;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(cW, y - 36 * l.sY);
            ctx.stroke();
        }
    }

    _drawWireMatrix(ctx, l, t) {
        const cW = l.cW;
        ctx.save();
        for (let i = 0; i < this.bgWires.length; i++) {
            const w = this.bgWires[i];
            const pulse = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.03 + i * 0.9));
            ctx.strokeStyle = (i % 3 === 0)
                ? 'rgba(255,52,112,' + (pulse * 0.9).toFixed(3) + ')'
                : 'rgba(0,240,255,' + pulse.toFixed(3) + ')';
            ctx.lineWidth = (i % 4 === 0 ? 1.4 : 1.0) * l.sX;
            ctx.beginPath();
            ctx.moveTo(-60 * l.sX, w.y + 12 * l.sY);
            ctx.lineTo(cW + 60 * l.sX, w.y + w.slope * cW);
            ctx.stroke();

            const laneX = (w.phase + t * w.speed) % (cW + 140 * l.sX) - 70 * l.sX;
            const laneY = w.y + w.slope * laneX;
            ctx.fillStyle = 'rgba(255,230,0,0.66)';
            ctx.fillRect(laneX, laneY - 1.5 * l.sY, 16 * l.sX, 3 * l.sY);
        }
        ctx.restore();
    }

    _drawPacketFlow(ctx, l) {
        const cW = l.cW;
        ctx.save();
        for (let i = 0; i < this.bgPackets.length; i++) {
            const p = this.bgPackets[i];
            const w = this.bgWires[p.wire];
            if (!w) continue;
            const x = p.t * (cW + 90 * l.sX) - 45 * l.sX;
            const y = w.y + w.slope * x;
            const sw = p.size * l.sX;
            const sh = Math.max(2 * l.sY, p.size * 0.42 * l.sY);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-0.16);
            ctx.fillStyle = p.color === '#FF2D6D' ? 'rgba(255,45,109,0.82)' : 'rgba(0,233,255,0.86)';
            ctx.fillRect(-sw * 0.5, -sh * 0.5, sw, sh);
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 1 * l.sX;
            ctx.strokeRect(-sw * 0.5, -sh * 0.5, sw, sh);
            ctx.restore();
        }

        for (let i = 0; i < this.bgNodes.length; i++) {
            const n = this.bgNodes[i];
            const glow = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(this.animTick * 0.04 + n.p));
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * l.sX, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(90,232,255,' + glow.toFixed(3) + ')';
            ctx.fill();
        }
        ctx.restore();
    }

    _drawFloatingBits(ctx, l) {
        ctx.save();
        for (let i = 0; i < this.bgBits.length; i++) {
            const b = this.bgBits[i];
            ctx.globalAlpha = b.alpha;
            ctx.fillStyle = (i % 9 === 0) ? '#FF4A84' : '#7CE8FF';
            ctx.font = Math.round(b.size * l.sX) + 'px monospace';
            ctx.fillText(b.glyph, b.x, b.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawNetworkBackdrop(ctx, l) {
        this._drawWireMatrix(ctx, l, this.animTick);
    }

    _drawPanelMotif(ctx, l) {
        const x = l.x * l.sX;
        const y = l.y * l.sY;
        const w = l.w * l.sX;
        const h = l.h * l.sY;
        const sweep = (this.animTick * 5.5) % (w + 200 * l.sX);

        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(x + 12 * l.sX, y + 92 * l.sY);
        ctx.lineTo(x + w - 20 * l.sX, y + 92 * l.sY);
        ctx.lineTo(x + w - 40 * l.sX, y + h - 18 * l.sY);
        ctx.lineTo(x + 8 * l.sX, y + h - 18 * l.sY);
        ctx.closePath();
        ctx.clip();

        for (let gx = x - 200 * l.sX; gx < x + w + 160 * l.sX; gx += 46 * l.sX) {
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
            ctx.lineWidth = 1 * l.sX;
            ctx.beginPath();
            ctx.moveTo(gx, y + 122 * l.sY);
            ctx.lineTo(gx + 56 * l.sX, y + h - 18 * l.sY);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.transform(1, 0, -0.42, 1, 0, 0);
        ctx.fillRect(x + sweep - w, y - h * 0.2, 36 * l.sX, h * 1.45);
        ctx.restore();

        ctx.save();
        const topBand = ctx.createLinearGradient(x, y + 46 * l.sY, x + w, y + 66 * l.sY);
        topBand.addColorStop(0, 'rgba(255, 32, 96, 0.42)');
        topBand.addColorStop(0.55, 'rgba(255, 230, 0, 0.20)');
        topBand.addColorStop(1, 'rgba(0, 240, 255, 0.42)');
        ctx.fillStyle = topBand;
        ctx.fillRect(x + 30 * l.sX, y + 118 * l.sY, w - 60 * l.sX, 2 * l.sY);

        ctx.fillStyle = 'rgba(255, 28, 90, 0.78)';
        ctx.beginPath();
        ctx.moveTo(x + 34 * l.sX, y + 30 * l.sY);
        ctx.lineTo(x + 130 * l.sX, y + 30 * l.sY);
        ctx.lineTo(x + 108 * l.sX, y + 54 * l.sY);
        ctx.lineTo(x + 22 * l.sX, y + 54 * l.sY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.font = 'bold ' + Math.round(10 * l.sX) + 'px monospace';
        ctx.fillText('NET', x + 50 * l.sX, y + 46 * l.sY);
        ctx.restore();
    }

    _drawRowCard(ctx, l, i, row, active, hover, bodyFont, titleFont) {
        const x = l.rowX * l.sX;
        const y = (l.rowStartY + i * (l.rowH + l.rowGap)) * l.sY;
        const w = l.rowW * l.sX;
        const h = l.rowH * l.sY;
        const isActive = active || hover;
        IP2Live.UI.drawCyberButton({
            ctx,
            x,
            y,
            w,
            h,
            scaleX: l.sX,
            scaleY: l.sY,
            label: row.value,
            numberLabel: '0' + (i + 1),
            isActive,
            isDanger: false,
            animTick: this.animTick,
            showChevron: !row.nav
        });

        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillStyle = isActive ? '#111111' : 'rgba(160, 236, 255, 0.94)';
        ctx.font = Math.round(8 * l.sX) + 'px ' + bodyFont;
        ctx.fillText(row.label, x + 72 * l.sX, y + 18 * l.sY);
        if (row.nav) {
            ctx.textAlign = 'right';
            ctx.font = 'bold ' + Math.round(10 * l.sX) + 'px ' + titleFont;
            ctx.fillStyle = isActive ? '#111111' : 'rgba(160, 236, 255, 0.92)';
            ctx.fillText('<  >', x + w - 22 * l.sX, y + 35 * l.sY);
        }
        ctx.restore();
    }

    _drawActionButton(ctx, l, x, y, w, h, label, isActive, isDanger, index, titleFont) {
        IP2Live.UI.drawCyberButton({
            ctx,
            x,
            y,
            w,
            h,
            scaleX: l.sX,
            scaleY: l.sY,
            label,
            numberLabel: '0' + (index + 1),
            isActive,
            isDanger,
            animTick: this.animTick
        });

        if (!isActive) return;
        const helperFont = IP2Live.Assets.neuropolLoaded
            ? 'Neuropol'
            : (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace');
        ctx.save();
        ctx.textAlign = 'right';
        ctx.font = 'bold ' + Math.round(7.5 * l.sX) + 'px ' + helperFont;
        ctx.fillStyle = isDanger ? '#FFFFFF' : '#111111';
        ctx.fillText(isDanger ? 'CANCEL' : 'EXECUTE', x + w - 56 * l.sX, y + 15 * l.sY);
        ctx.restore();
    }

    _keyToken(key) {
        const raw = key && (key.name || key.code || key.key || key.character || key);
        return String(raw || '');
    }

    _charFromToken(tokenUpper) {
        if (!tokenUpper) return null;
        if (tokenUpper === 'SPACE' || tokenUpper === 'SPACEBAR') return ' ';
        if (tokenUpper.length === 1) {
            const ch = tokenUpper;
            if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '-' || ch === '_' || ch === '.') return ch;
        }
        if (tokenUpper.indexOf('DIGIT') === 0 && tokenUpper.length === 6) return tokenUpper[5];
        if (tokenUpper.indexOf('NUMPAD') === 0 && tokenUpper.length === 7) return tokenUpper[6];
        return null;
    }
}

window.IP2LiveExportReportMenu = IP2LiveExportReportMenu;
console.log('[IP2Live] export-report.js loaded.');
