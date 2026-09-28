/**
 * IP2Live - Export Report Screen
 *
 * Modal screen for selecting report scope/format/filename.
 */

class IP2LiveExportReportMenu extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this.backdrop = IP2Live.PopupChrome.capture();
    }

    initialize() {
        this.selectedIndex = 0;
        this.items = ['SCOPE', 'FORMAT', 'FILENAME', 'BACK', 'EXPORT'];
        this.scopeDaysOptions = [7, 30, 90];
        this.scopeIndex = 2;
        this.formatOptions = ['PDF', 'EXCEL', 'BOTH'];
        this.formatIndex = 1;
        this.filename = this._defaultFilename();
        this.editFilename = false;
        this.statusLine = '';
        this.outputPaths = [];
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

    _exportFilenameBase(timestamp) {
        const requested = String(this.filename || '').trim() || this._defaultFilename();
        const instant = Number(timestamp);
        const date = Number.isFinite(instant) && instant > 0 ? new Date(instant) : new Date();
        const stamp = date.toISOString().replace(/[:.]/g, '-');
        return requested + '_' + stamp;
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
        if (this.busy) return true;
        const token = this._keyToken(key).toUpperCase();
        if (this.editFilename) {
            if (Data.Keyboards.checkActionMenu(key) || token === 'ENTER') {
                this.editFilename = false;
                this.statusLine = '';
                return true;
            }
            if (Data.Keyboards.checkCancelMenu(key)) {
                this.editFilename = false;
                this.statusLine = '';
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
            this.statusLine = 'Enter to confirm filename';
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
            const formatRaw = this.formatOptions[this.formatIndex] || 'EXCEL';
            const format = formatRaw === 'BOTH' ? 'both' : (formatRaw === 'PDF' ? 'pdf' : 'excel');
            const gm = IP2Live.GameManager;
            if (!gm || typeof gm.exportProgressReport !== 'function') {
                this.statusLine = 'EXPORT FAILED: REPORT SYSTEM UNAVAILABLE';
                Data.Systems.soundImpossible.playSound();
                this.busy = false;
                return;
            }
            const result = await gm.exportProgressReport({
                scopeDays: this.scopeDaysOptions[this.scopeIndex] || 90,
                format: format,
                // Always make the archived set unique, even if the operator
                // keeps the same editable label for several exports.
                filenameBase: this._exportFilenameBase(),
            });
            if (result && result.ok) {
                this.outputPaths = Array.isArray(result.archivedPaths) ? result.archivedPaths.slice() : [];
                this.statusLine = 'Export complete.';
                if (this.outputPaths.length) console.log('[IP2Live] Report archive files:', this.outputPaths);
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
        const ctx=Common.Platform.ctx,l=this._layout(),chrome=IP2Live.PopupChrome;
        ctx.save();chrome.backdrop(ctx,this.backdrop,this.animTick*0.085);ctx.scale(l.sX,l.sY);
        chrome.animate(ctx,l,this.animTick*0.085);
        chrome.panel(ctx,l.x,l.y,l.w,l.h,1,1,false,this.animTick);chrome.heading(ctx,'EXPORT REPORT',l.x,l.y,l.w);
        const labels=['Days to cover','File type','File name'];
        const values=[this.scopeDaysOptions[this.scopeIndex]+' days',this.formatOptions[this.formatIndex]==='EXCEL'?'Excel (.xls)':this.formatOptions[this.formatIndex],this.filename+(this.editFilename && this.animTick%50<25?'|':'')];
        labels.forEach((label,i)=>{
            const y=l.rowStartY+i*(l.rowH+l.rowGap);chrome.row(ctx,l.rowX,y,l.rowW,l.rowH,this.selectedIndex===i);
            ctx.font='11px Oxanium-Medium, sans-serif';ctx.fillStyle='#82a6ae';ctx.textAlign='left';ctx.fillText(label,l.rowX+14,y+16);
            ctx.font='16px Oxanium-Medium, sans-serif';ctx.fillStyle='#e2edef';ctx.fillText(values[i],l.rowX+14,y+36,l.rowW-60);
            if(i<2){ctx.textAlign='right';ctx.fillStyle='#b8cba1';ctx.fillText('<  >',l.rowX+l.rowW-14,y+31);}
        });
        ['CANCEL',this.busy?'EXPORTING...':'EXPORT'].forEach((label,i)=>chrome.button(ctx,{x:i?l.actionRightX:l.actionLeftX,y:l.actionY,w:l.actionBtnW,h:l.rowH},1,1,label,'Oxanium-Medium',this.selectedIndex===i+3?1:0,this.animTick,!i));
        if(this.statusLine){ctx.fillStyle='#a6bcc2';ctx.font='11px Oxanium-Medium, sans-serif';chrome.text(ctx,this.statusLine,l.x+l.w/2,l.y+l.h-17,.3);}
        ctx.restore();
    }

    _layout() {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const sX = cW / SW;
        const sY = cH / SH;
        const w = Math.min(560, SW - 40);
        const h = 350;
        const x = (SW - w) * 0.5;
        const y = (SH - h) * 0.5;
        const rowX = x + 40;
        const rowW = w - 80;
        const rowH = 46;
        const rowGap = 10;
        const rowStartY = y + 76;
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
