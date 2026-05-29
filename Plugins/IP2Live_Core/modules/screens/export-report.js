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
        this.items = ['SCOPE', 'FORMAT', 'FILENAME', 'EXPORT', 'BACK'];
        this.scopeDaysOptions = [7, 30, 90];
        this.scopeIndex = 1;
        this.formatOptions = ['PDF', 'EXCEL', 'BOTH'];
        this.formatIndex = 2;
        this.filename = this._defaultFilename();
        this.editFilename = false;
        this.statusLine = 'SELECT OPTIONS THEN EXPORT';
        this.busy = false;
        this.animTick = 0;
        this.hoverIndex = -1;
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
            this._shiftOption(-1);
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Right)) {
            this._shiftOption(1);
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
            this._runExport();
            return;
        }
        if (this.selectedIndex === 4) {
            Manager.Stack.pop();
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
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const sX = cW / SW;
        const sY = cH / SH;

        ctx.save();
        if (IP2Live.BgFx && IP2Live.BgFx.create) {
            if (!this.bgFx) this.bgFx = IP2Live.BgFx.create();
            if (!this._seeded) {
                this.bgFx.seed(cW, cH);
                this._seeded = true;
            }
            this.bgFx.update(this.animTick);
            this.bgFx.drawBg(ctx, IP2Live.Assets.bgImage, cW, cH);
            this.bgFx.drawParticles(ctx, sX);
        } else {
            ctx.fillStyle = '#050912';
            ctx.fillRect(0, 0, cW, cH);
        }

        ctx.fillStyle = 'rgba(2,8,20,0.78)';
        ctx.fillRect(0, 0, cW, cH);

        const w = 720;
        const h = 430;
        const x = (SW - w) * 0.5;
        const y = (SH - h) * 0.5;
        IP2Live.UI.drawCyberPanel({
            ctx: ctx,
            x: x * sX,
            y: y * sY,
            w: w * sX,
            h: h * sY,
            scaleX: sX,
            accent: '#00F0FF',
            title: 'SYS::PROGRESS_ARCHIVE_EXPORT',
        });

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(24 * sX) + 'px ' + (IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black');
        ctx.textAlign = 'center';
        ctx.fillText('EXPORT STUDENT REPORT', (x + w * 0.5) * sX, (y + 40) * sY);
        ctx.textAlign = 'left';

        const rows = [
            'SCOPE DAYS : ' + (this.scopeDaysOptions[this.scopeIndex] || 30),
            'FORMAT     : ' + (this.formatOptions[this.formatIndex] || 'BOTH'),
            'FILENAME   : ' + this.filename + (this.editFilename ? '_' : ''),
            this.busy ? 'EXPORTING...' : 'EXPORT',
            'BACK',
        ];
        for (let i = 0; i < rows.length; i++) {
            const active = i === this.selectedIndex || i === this.hoverIndex;
            const ry = y + 88 + i * 62;
            ctx.fillStyle = active ? 'rgba(255,230,0,0.22)' : 'rgba(0,240,255,0.08)';
            ctx.fillRect((x + 36) * sX, (ry - 24) * sY, (w - 72) * sX, 40 * sY);
            ctx.strokeStyle = active ? '#FFE600' : 'rgba(0,240,255,0.5)';
            ctx.lineWidth = 1.2 * sX;
            ctx.strokeRect((x + 36) * sX, (ry - 24) * sY, (w - 72) * sX, 40 * sY);
            ctx.fillStyle = active ? '#FFFFFF' : '#CBE8FF';
            ctx.font = Math.round(13 * sX) + 'px monospace';
            ctx.fillText(rows[i], (x + 52) * sX, ry * sY);
        }

        ctx.fillStyle = 'rgba(200,230,255,0.92)';
        ctx.font = Math.round(11 * sX) + 'px monospace';
        ctx.fillText(this.statusLine, (x + 38) * sX, (y + h - 28) * sY);
        ctx.restore();
    }

    _layout() {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const sX = cW / SW;
        const sY = cH / SH;
        const w = 720;
        const h = 430;
        const x = (SW - w) * 0.5;
        const y = (SH - h) * 0.5;
        return { SW, SH, cW, cH, sX, sY, x, y, w, h };
    }

    _hitItemIndex(mouseX, mouseY) {
        const l = this._layout();
        for (let i = 0; i < this.items.length; i++) {
            const ry = l.y + 88 + i * 62;
            const rx = l.x + 36;
            const rw = l.w - 72;
            const rh = 40;
            if (
                mouseX >= rx * l.sX &&
                mouseX <= (rx + rw) * l.sX &&
                mouseY >= (ry - 24) * l.sY &&
                mouseY <= (ry - 24 + rh) * l.sY
            ) {
                return i;
            }
        }
        return -1;
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
