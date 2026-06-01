/**
 * IP2Live - VLSM Allocator Gameplay
 *
 * Gameplay Eight:
 * - Stage 4 Level 3 field-based VLSM infiltration mission.
 * - Players walk to branch terminals, configure each subnet, then commit
 *   the full route table at the core gateway.
 */

class IP2LiveVLSMAllocatorGameplayScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this._configure();
    }

    initialize() {
        this.options = this.options || {};
        this._configure();
    }

    _configure() {
        this.animTick = 0;
        this.finished = false;
        this.errorText = '';
        this.errorTimer = 0;
        this.successText = '';
        this.successTimer = 0;
        this.selectedControl = 0;
        this.buttonRects = [];

        this.spec = this.options.spec || {};
        this.terminalType = this.spec.terminalType || 'branch';
        this.branchId = this.spec.branchId || null;
        this.scenario = this.options.scenario || IP2Live.VLSMAllocatorGameplayManager.scenario();
        this.state = this.options.state || IP2Live.VLSMAllocatorGameplayManager.state();

        const branch = this._branch();
        const allocation = branch ? this.state.allocations[branch.id] : null;
        const optimal = branch ? this._optimalPrefix(branch.hosts) : this.scenario.parentPrefix;
        this.selectedPrefix = allocation ? Number(allocation.prefix) : Math.min(30, optimal + 1);
        this.selectedBlockIndex = allocation ? this._blockIndexFor(allocation.start, this.selectedPrefix) : 0;
        this._clampSelection();
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        if (this.errorTimer > 0) this.errorTimer--;
        if (this.successTimer > 0) this.successTimer--;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            const valueWhenDialogue = key && (key.name || key.code || key);
            const upperWhenDialogue = String(valueWhenDialogue || '').toUpperCase();
            if (upperWhenDialogue === 'ENTER' || upperWhenDialogue === 'SPACE' || upperWhenDialogue === 'SPACEBAR') {
                IP2Live.DialogueManager.advance();
            }
            return true;
        }
        if (this.finished) return true;
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel();
            return true;
        }

        const value = key && (key.name || key.code || key);
        const upper = String(value || '').toUpperCase();
        if (this.terminalType === 'core') {
            if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') {
                this._commitCore();
                return true;
            }
            return true;
        }

        if (upper === 'ARROWLEFT' || upper === 'A' || upper === 'KEYA') {
            this.selectedControl = (this.selectedControl + 1) % 2;
            this._playCursor();
            return true;
        }
        if (upper === 'ARROWRIGHT' || upper === 'D' || upper === 'KEYD') {
            this.selectedControl = (this.selectedControl + 1) % 2;
            this._playCursor();
            return true;
        }
        if (upper === 'ARROWUP' || upper === 'W' || upper === 'KEYW') {
            this._adjustSelected(-1);
            return true;
        }
        if (upper === 'ARROWDOWN' || upper === 'S' || upper === 'KEYS') {
            this._adjustSelected(1);
            return true;
        }
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') {
            this._submitBranch();
            return true;
        }
        return true;
    }

    onKeyPressedAndRepeat(key) {
        return this.onKeyPressed(key);
    }

    onMouseDown(x, y) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        this._buildButtonRects(this._metrics());
        for (let i = 0; i < this.buttonRects.length; i++) {
            const r = this.buttonRects[i];
            if (this._pointInRect(x, y, r)) {
                if (r.action === 'cancel') this._cancel();
                else if (r.action === 'submit') this._submitBranch();
                else if (r.action === 'commit') this._commitCore();
                else if (r.action === 'prefixDown') { this.selectedControl = 0; this._adjustPrefix(-1); }
                else if (r.action === 'prefixUp') { this.selectedControl = 0; this._adjustPrefix(1); }
                else if (r.action === 'blockDown') { this.selectedControl = 1; this._adjustBlock(-1); }
                else if (r.action === 'blockUp') { this.selectedControl = 1; this._adjustBlock(1); }
                return true;
            }
        }
        return true;
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const m = this._metrics();
        this._buildButtonRects(m);

        ctx.save();
        this._drawBackdrop(ctx, cW, cH, m);
        this._drawShell(ctx, m);
        if (this.terminalType === 'core') this._drawCoreTerminal(ctx, m);
        else this._drawBranchTerminal(ctx, m);
        this._drawFooter(ctx, m);
        ctx.restore();
    }

    _metrics() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const panelW = Math.min(920 * sX, cW - 64 * sX);
        const panelH = Math.min(560 * sY, cH - 64 * sY);
        return {
            cW, cH, sX, sY,
            x: (cW - panelW) / 2,
            y: (cH - panelH) / 2,
            w: panelW,
            h: panelH,
        };
    }

    _drawBackdrop(ctx, cW, cH, m) {
        const t = this.animTick || 0;
        const bg = ctx.createLinearGradient(0, 0, cW, cH);
        bg.addColorStop(0, 'rgba(0,2,7,0.94)');
        bg.addColorStop(0.48, 'rgba(3,11,18,0.93)');
        bg.addColorStop(1, 'rgba(0,0,0,0.96)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cW, cH);

        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1 * m.sX;
        for (let i = -5; i < 14; i++) {
            const y = cH * 0.12 + i * 46 * m.sY + Math.sin(t * 0.015 + i) * 5 * m.sY;
            ctx.strokeStyle = i % 3 === 0 ? 'rgba(120,18,34,0.12)' : 'rgba(42,154,141,0.12)';
            ctx.beginPath();
            ctx.moveTo(cW * 0.08, y);
            ctx.lineTo(cW * 0.92, y - 80 * m.sY);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawShell(ctx, m) {
        const x = m.x;
        const y = m.y;
        const w = m.w;
        const h = m.h;
        const sX = m.sX;
        const sY = m.sY;
        const cut = 28 * sX;

        ctx.save();
        ctx.translate(12 * sX, 12 * sY);
        this._panelPath(ctx, x, y, w, h, cut);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        ctx.restore();

        this._panelPath(ctx, x, y, w, h, cut);
        const fill = ctx.createLinearGradient(x, y, x + w, y + h);
        fill.addColorStop(0, 'rgba(2,12,16,0.98)');
        fill.addColorStop(0.52, 'rgba(3,6,15,0.96)');
        fill.addColorStop(1, 'rgba(0,3,8,0.98)');
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.save();
        this._panelPath(ctx, x, y, w, h, cut);
        ctx.clip();
        for (let yy = y + ((this.animTick * 0.45) % (6 * sY)); yy < y + h; yy += 6 * sY) {
            ctx.fillStyle = 'rgba(120,190,160,0.035)';
            ctx.fillRect(x, yy, w, Math.max(1, 1 * sY));
        }
        this._drawGlobalNetwork(ctx, m);
        ctx.restore();

        ctx.shadowColor = 'rgba(42,154,141,0.46)';
        ctx.shadowBlur = 12 * sX;
        this._panelPath(ctx, x, y, w, h, cut);
        ctx.strokeStyle = 'rgba(42,190,174,0.78)';
        ctx.lineWidth = 1.5 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(111,99,48,0.88)';
        ctx.lineWidth = 2 * sX;
        ctx.beginPath();
        ctx.moveTo(x, y + 24 * sY);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 32 * sX, y);
        ctx.moveTo(x + w - 32 * sX, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - 32 * sY);
        ctx.stroke();

        ctx.fillStyle = 'rgba(122,18,34,0.28)';
        ctx.beginPath();
        ctx.moveTo(x + w - 170 * sX, y - 2 * sY);
        ctx.lineTo(x + w - 40 * sX, y - 2 * sY);
        ctx.lineTo(x + w - 72 * sX, y + 30 * sY);
        ctx.lineTo(x + w - 195 * sX, y + 30 * sY);
        ctx.closePath();
        ctx.fill();
    }

    _drawGlobalNetwork(ctx, m) {
        const nodes = [
            [0.16, 0.20], [0.35, 0.16], [0.58, 0.19], [0.80, 0.30],
            [0.22, 0.55], [0.48, 0.48], [0.72, 0.58], [0.30, 0.80], [0.62, 0.76]
        ];
        const t = this.animTick || 0;
        ctx.save();
        ctx.lineWidth = 1 * m.sX;
        for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i];
            const b = nodes[(i + 3) % nodes.length];
            ctx.strokeStyle = i % 4 === 0 ? 'rgba(122,18,34,0.14)' : 'rgba(42,154,141,0.14)';
            ctx.beginPath();
            ctx.moveTo(m.x + a[0] * m.w, m.y + a[1] * m.h);
            ctx.lineTo(m.x + b[0] * m.w, m.y + b[1] * m.h);
            ctx.stroke();
        }
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const pulse = 0.4 + 0.6 * Math.sin(t * 0.07 + i);
            ctx.fillStyle = i % 4 === 0
                ? 'rgba(122,18,34,' + (0.15 + pulse * 0.14).toFixed(3) + ')'
                : 'rgba(67,174,119,' + (0.13 + pulse * 0.14).toFixed(3) + ')';
            ctx.fillRect(m.x + n[0] * m.w - 2 * m.sX, m.y + n[1] * m.h - 2 * m.sY, 4 * m.sX, 4 * m.sY);
        }
        ctx.restore();
    }

    _drawBranchTerminal(ctx, m) {
        const branch = this._branch();
        if (!branch) return;
        const candidate = this._candidateAllocation(branch);
        const validation = this._validateAllocation(branch, candidate);
        const range = this._range(candidate.start, candidate.prefix);
        const optimal = this._optimalPrefix(branch.hosts);
        const currentHosts = this._usableHosts(this.selectedPrefix);

        this._drawHeader(ctx, m, 'BRANCH TERMINAL // ' + branch.label, 'Configure this node, then return to the field.');
        this._drawMissionCard(ctx, m, branch, optimal, currentHosts, candidate, range, validation);
        this._drawAddressBar(ctx, m, candidate);
        this._drawBranchControls(ctx, m, branch, candidate, range, validation);
        this._drawRouteTable(ctx, m, candidate);
    }

    _drawCoreTerminal(ctx, m) {
        const validation = this._validateAll();
        this._drawHeader(ctx, m, 'CORE GATEWAY // FINAL COMMIT', 'Commit the VLSM route table to unlock Stage 4 Level 3.');
        this._drawCoreSummary(ctx, m, validation);
        this._drawAddressBar(ctx, m, null);
        this._drawRouteTable(ctx, m, null);
        this._drawCoreControls(ctx, m, validation);
    }

    _drawHeader(ctx, m, title, subtitle) {
        const x = m.x + 34 * m.sX;
        const y = m.y + 32 * m.sY;
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = 'bold ' + Math.round(20 * m.sX) + 'px ' + this._titleFont();
        ctx.fillStyle = '#E6FFF4';
        ctx.shadowColor = 'rgba(67,174,119,0.45)';
        ctx.shadowBlur = 8 * m.sX;
        ctx.fillText(title, x, y);
        ctx.shadowBlur = 0;
        ctx.font = Math.round(10 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(175,214,202,0.72)';
        ctx.fillText(subtitle, x, y + 20 * m.sY);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(42,154,141,0.72)';
        ctx.fillText(this.scenario.parentCIDR + '  CLASS ' + this.scenario.ipClass, m.x + m.w - 34 * m.sX, y);
        ctx.restore();
    }

    _drawMissionCard(ctx, m, branch, optimal, currentHosts, candidate, range, validation) {
        const x = m.x + 34 * m.sX;
        const y = m.y + 82 * m.sY;
        const w = m.w * 0.40;
        const h = 188 * m.sY;
        this._rectPanel(ctx, x, y, w, h, m, 'rgba(3,13,16,0.84)');
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = 'bold ' + Math.round(14 * m.sX) + 'px ' + this._bodyFont();
        ctx.fillStyle = '#E6FFF4';
        ctx.fillText(branch.label.toUpperCase(), x + 18 * m.sX, y + 30 * m.sY);
        ctx.font = Math.round(11 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(175,214,202,0.78)';
        ctx.fillText('Required hosts: ' + branch.hosts, x + 18 * m.sX, y + 58 * m.sY);
        ctx.fillText('Smallest fitting CIDR: /' + optimal, x + 18 * m.sX, y + 78 * m.sY);
        ctx.fillText('Current usable hosts: ' + currentHosts, x + 18 * m.sX, y + 98 * m.sY);
        ctx.fillText('Selected subnet: ' + this._formatCIDR(candidate.start, candidate.prefix), x + 18 * m.sX, y + 118 * m.sY);
        ctx.fillText('Usable range: ' + this._firstUsable(range) + ' - ' + this._lastUsable(range), x + 18 * m.sX, y + 138 * m.sY);
        ctx.fillStyle = validation.ok ? 'rgba(79,166,107,0.92)' : 'rgba(180,54,72,0.92)';
        ctx.fillText(validation.ok ? 'STATUS: ROUTE STABLE' : 'STATUS: ' + validation.reason, x + 18 * m.sX, y + 164 * m.sY);
        ctx.restore();
    }

    _drawBranchControls(ctx, m, branch, candidate, range, validation) {
        const x = m.x + m.w * 0.49;
        const y = m.y + 92 * m.sY;
        const w = m.w * 0.43;
        const rowH = 64 * m.sY;
        this._controlRow(ctx, m, x, y, w, rowH, 'CIDR DIAL', '/' + this.selectedPrefix, this.selectedControl === 0);
        this._controlRow(ctx, m, x, y + 78 * m.sY, w, rowH, 'BLOCK SELECTOR', this._formatCIDR(candidate.start, candidate.prefix), this.selectedControl === 1);

        ctx.save();
        ctx.font = Math.round(10 * m.sX) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(175,214,202,0.68)';
        ctx.fillText('LEFT/RIGHT: choose dial   UP/DOWN: tune value   ENTER: inject config', x, y + 164 * m.sY);
        ctx.fillStyle = validation.ok ? 'rgba(79,166,107,0.82)' : 'rgba(180,54,72,0.82)';
        ctx.fillText(validation.hint || 'Scanner ready.', x, y + 184 * m.sY);
        ctx.restore();

        this._drawButton(ctx, this._button('prefixDown'), '- CIDR');
        this._drawButton(ctx, this._button('prefixUp'), '+ CIDR');
        this._drawButton(ctx, this._button('blockDown'), '< BLOCK');
        this._drawButton(ctx, this._button('blockUp'), 'BLOCK >');
        this._drawButton(ctx, this._button('submit'), 'INJECT CONFIG');
        this._drawButton(ctx, this._button('cancel'), 'BACK');
    }

    _drawCoreControls(ctx, m, validation) {
        const commit = this._button('commit');
        const cancel = this._button('cancel');
        this._drawButton(ctx, commit, validation.ok ? 'COMMIT ROUTE TABLE' : 'SCAN ROUTE TABLE');
        this._drawButton(ctx, cancel, 'BACK');
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = Math.round(11 * m.sX) + 'px monospace';
        ctx.fillStyle = validation.ok ? 'rgba(79,166,107,0.88)' : 'rgba(180,54,72,0.88)';
        ctx.fillText(validation.ok ? 'All branches are stable. Final gateway can be unlocked.' : validation.reason, m.x + m.w / 2, m.y + m.h - 90 * m.sY);
        ctx.restore();
    }

    _drawCoreSummary(ctx, m, validation) {
        const x = m.x + 34 * m.sX;
        const y = m.y + 82 * m.sY;
        const w = m.w - 68 * m.sX;
        const h = 104 * m.sY;
        this._rectPanel(ctx, x, y, w, h, m, 'rgba(3,13,16,0.84)');
        const summary = this._allocationSummary();
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = 'bold ' + Math.round(14 * m.sX) + 'px ' + this._bodyFont();
        ctx.fillStyle = '#E6FFF4';
        ctx.fillText('INFILTRATION SCORE PREVIEW', x + 18 * m.sX, y + 30 * m.sY);
        ctx.font = Math.round(11 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(175,214,202,0.76)';
        ctx.fillText('Configured branches: ' + summary.configured + ' / ' + this.scenario.branches.length, x + 18 * m.sX, y + 56 * m.sY);
        ctx.fillText('Allocated addresses: ' + summary.allocated + '   Waste score: ' + summary.waste, x + 18 * m.sX, y + 76 * m.sY);
        ctx.fillStyle = validation.ok ? 'rgba(79,166,107,0.88)' : 'rgba(180,54,72,0.88)';
        ctx.fillText(validation.ok ? 'Awards: Clear // Efficient // Clean Route' : 'Gateway locked until every branch passes diagnostics.', x + 360 * m.sX, y + 56 * m.sY);
        ctx.restore();
    }

    _drawRouteTable(ctx, m, candidate) {
        const x = m.x + 34 * m.sX;
        const y = m.y + 300 * m.sY;
        const w = m.w - 68 * m.sX;
        const h = 158 * m.sY;
        this._rectPanel(ctx, x, y, w, h, m, 'rgba(1,7,12,0.76)');
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = 'bold ' + Math.round(11 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(42,154,141,0.86)';
        ctx.fillText('LIVE VLSM ROUTE TABLE', x + 16 * m.sX, y + 24 * m.sY);
        ctx.font = Math.round(10 * m.sX) + 'px monospace';
        let rowY = y + 48 * m.sY;
        for (let i = 0; i < this.scenario.branches.length; i++) {
            const b = this.scenario.branches[i];
            const a = this.state.allocations[b.id];
            const active = candidate && b.id === this.branchId;
            const label = b.label.padEnd ? b.label.padEnd(12, ' ') : b.label;
            ctx.fillStyle = active ? 'rgba(230,255,244,0.96)' : (a ? 'rgba(175,214,202,0.80)' : 'rgba(110,130,124,0.62)');
            const value = a
                ? this._formatCIDR(a.start, a.prefix)
                : (active ? this._formatCIDR(candidate.start, candidate.prefix) + '  PREVIEW' : 'UNCONFIGURED');
            ctx.fillText(label + '  hosts ' + String(b.hosts).padStart(3, ' ') + '  ->  ' + value, x + 16 * m.sX, rowY);
            rowY += 20 * m.sY;
        }
        ctx.restore();
    }

    _drawAddressBar(ctx, m, candidate) {
        const x = m.x + 34 * m.sX;
        const y = m.y + 240 * m.sY;
        const w = m.w - 68 * m.sX;
        const h = 28 * m.sY;
        const parent = this._parentRange();

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(42,154,141,0.45)';
        ctx.strokeRect(x, y, w, h);

        const drawRange = (range, color) => {
            const startPct = (range.start - parent.start) / Math.max(1, parent.size);
            const widthPct = range.size / Math.max(1, parent.size);
            ctx.fillStyle = color;
            ctx.fillRect(x + startPct * w, y + 3 * m.sY, Math.max(2 * m.sX, widthPct * w), h - 6 * m.sY);
        };

        const keys = Object.keys(this.state.allocations || {});
        for (let i = 0; i < keys.length; i++) {
            const a = this.state.allocations[keys[i]];
            if (!a) continue;
            drawRange(this._range(a.start, a.prefix), 'rgba(42,154,141,0.55)');
        }
        if (candidate) {
            drawRange(this._range(candidate.start, candidate.prefix), 'rgba(79,166,107,0.64)');
        }

        ctx.font = Math.round(9 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(175,214,202,0.68)';
        ctx.textAlign = 'left';
        ctx.fillText(this._intToIp(parent.start), x, y - 6 * m.sY);
        ctx.textAlign = 'right';
        ctx.fillText(this._intToIp(parent.end), x + w, y - 6 * m.sY);
        ctx.restore();
    }

    _drawFooter(ctx, m) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = Math.round(9 * m.sX) + 'px monospace';
        ctx.fillStyle = this.errorTimer > 0 ? 'rgba(230,74,98,0.88)' : (this.successTimer > 0 ? 'rgba(79,166,107,0.88)' : 'rgba(42,154,141,0.58)');
        ctx.fillText(this.errorTimer > 0 ? this.errorText : (this.successTimer > 0 ? this.successText : '[ VLSM SCANNER ACTIVE // ESC TO RETURN ]'), m.x + m.w / 2, m.y + m.h - 22 * m.sY);
        ctx.restore();
    }

    _controlRow(ctx, m, x, y, w, h, label, value, active) {
        this._rectPanel(ctx, x, y, w, h, m, active ? 'rgba(14,58,49,0.58)' : 'rgba(2,9,14,0.72)');
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = Math.round(10 * m.sX) + 'px monospace';
        ctx.fillStyle = active ? 'rgba(79,166,107,0.92)' : 'rgba(175,214,202,0.68)';
        ctx.fillText(label, x + 16 * m.sX, y + 22 * m.sY);
        ctx.font = 'bold ' + Math.round(18 * m.sX) + 'px ' + this._bodyFont();
        ctx.fillStyle = '#E6FFF4';
        ctx.fillText(value, x + 16 * m.sX, y + 49 * m.sY);
        ctx.restore();
    }

    _drawButton(ctx, rect, label) {
        if (!rect) return;
        ctx.save();
        const active = rect.action === 'submit' || rect.action === 'commit';
        ctx.fillStyle = active ? 'rgba(42,154,141,0.58)' : 'rgba(3,13,16,0.82)';
        ctx.strokeStyle = active ? 'rgba(79,166,107,0.84)' : 'rgba(42,154,141,0.58)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rect.x + 12, rect.y);
        ctx.lineTo(rect.x + rect.w, rect.y);
        ctx.lineTo(rect.x + rect.w - 10, rect.y + rect.h);
        ctx.lineTo(rect.x, rect.y + rect.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.font = 'bold ' + Math.round(10 * rect.sX) + 'px monospace';
        ctx.fillStyle = '#E6FFF4';
        ctx.textAlign = 'center';
        ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h * 0.62);
        ctx.restore();
    }

    _rectPanel(ctx, x, y, w, h, m, fillStyle) {
        ctx.save();
        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = 'rgba(42,154,141,0.32)';
        ctx.lineWidth = 1 * m.sX;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    _buildButtonRects(m) {
        this.buttonRects = [];
        if (this.terminalType === 'branch') {
            const x = m.x + m.w * 0.49;
            const y = m.y + 296 * m.sY;
            const bw = 92 * m.sX;
            const bh = 32 * m.sY;
            this.buttonRects.push({ action: 'prefixDown', x, y, w: bw, h: bh, sX: m.sX });
            this.buttonRects.push({ action: 'prefixUp', x: x + 104 * m.sX, y, w: bw, h: bh, sX: m.sX });
            this.buttonRects.push({ action: 'blockDown', x: x + 216 * m.sX, y, w: bw, h: bh, sX: m.sX });
            this.buttonRects.push({ action: 'blockUp', x: x + 320 * m.sX, y, w: bw, h: bh, sX: m.sX });
            this.buttonRects.push({ action: 'submit', x, y: y + 46 * m.sY, w: 210 * m.sX, h: bh, sX: m.sX });
            this.buttonRects.push({ action: 'cancel', x: x + 226 * m.sX, y: y + 46 * m.sY, w: 110 * m.sX, h: bh, sX: m.sX });
        } else {
            const y = m.y + m.h - 72 * m.sY;
            this.buttonRects.push({ action: 'commit', x: m.x + m.w / 2 - 180 * m.sX, y, w: 240 * m.sX, h: 36 * m.sY, sX: m.sX });
            this.buttonRects.push({ action: 'cancel', x: m.x + m.w / 2 + 78 * m.sX, y, w: 110 * m.sX, h: 36 * m.sY, sX: m.sX });
        }
    }

    _button(action) {
        for (let i = 0; i < this.buttonRects.length; i++) {
            if (this.buttonRects[i].action === action) return this.buttonRects[i];
        }
        return null;
    }

    _adjustSelected(dir) {
        if (this.selectedControl === 0) this._adjustPrefix(dir);
        else this._adjustBlock(dir);
    }

    _adjustPrefix(dir) {
        this.selectedPrefix += Number(dir) || 0;
        this._clampSelection();
        this._playCursor();
    }

    _adjustBlock(dir) {
        this.selectedBlockIndex += Number(dir) || 0;
        this._clampSelection();
        this._playCursor();
    }

    _clampSelection() {
        const parentPrefix = this.scenario.parentPrefix;
        this.selectedPrefix = Math.max(parentPrefix, Math.min(30, Number(this.selectedPrefix) || parentPrefix));
        const maxIndex = this._maxBlockIndex(this.selectedPrefix);
        this.selectedBlockIndex = Math.max(0, Math.min(maxIndex, Number(this.selectedBlockIndex) || 0));
    }

    _submitBranch() {
        const branch = this._branch();
        if (!branch) return false;
        const candidate = this._candidateAllocation(branch);
        const validation = this._validateAllocation(branch, candidate);
        if (!validation.ok) {
            this._showError(validation.reason + ': ' + validation.hint);
            this._reportMistake(branch, candidate, validation);
            this._playCancel();
            return false;
        }
        this.state.allocations[branch.id] = {
            branchId: branch.id,
            label: branch.label,
            hosts: branch.hosts,
            prefix: candidate.prefix,
            start: candidate.start,
            cidr: this._formatCIDR(candidate.start, candidate.prefix),
            savedAt: Date.now(),
        };
        if (this.state.visitOrder.indexOf(branch.id) === -1) this.state.visitOrder.push(branch.id);
        this.successText = branch.label + ' subnet injected: ' + this._formatCIDR(candidate.start, candidate.prefix);
        this.successTimer = 20;
        this._playConfirm();
        this._finishSuccess({
            terminalType: 'branch',
            branchId: branch.id,
            allocation: this.state.allocations[branch.id],
            passed: true,
            mistakeCount: this.state.mistakeCount || 0,
        });
        return true;
    }

    _commitCore() {
        const validation = this._validateAll();
        if (!validation.ok) {
            this._showError(validation.reason);
            this._reportCoreMistake(validation);
            this._playCancel();
            return false;
        }
        const summary = this._allocationSummary();
        this._playConfirm();
        this._finishSuccess({
            terminalType: 'core',
            passed: true,
            parentCIDR: this.scenario.parentCIDR,
            allocations: this._clone(this.state.allocations),
            awards: ['Clear', 'Efficient', 'Clean Route'],
            allocatedAddresses: summary.allocated,
            waste: summary.waste,
            mistakeCount: this.state.mistakeCount || 0,
        });
        return true;
    }

    _finishSuccess(result) {
        if (this.finished) return;
        this.finished = true;
        if (this.options && typeof this.options.onComplete === 'function') {
            this.options.onComplete(result || {});
        }
    }

    _cancel() {
        if (this.finished) return;
        this.finished = true;
        this._playCancel();
        if (this.options && typeof this.options.onCancel === 'function') this.options.onCancel();
    }

    _reportMistake(branch, candidate, validation) {
        this.state.mistakeCount = (this.state.mistakeCount || 0) + 1;
        if (this.options && typeof this.options.onMistake === 'function') {
            this.options.onMistake({
                stepKey: validation.stepKey || 'vlsm_allocation',
                issueType: validation.issueType || 'invalid_allocation',
                expectedText: validation.expectedText || 'Valid VLSM allocation',
                submittedText: this._formatCIDR(candidate.start, candidate.prefix),
                branchId: branch.id,
                branchLabel: branch.label,
                requiredHosts: branch.hosts,
                detail: validation.reason,
                hint: validation.hint,
            }, function () {});
        }
    }

    _reportCoreMistake(validation) {
        this.state.mistakeCount = (this.state.mistakeCount || 0) + 1;
        if (this.options && typeof this.options.onMistake === 'function') {
            this.options.onMistake({
                stepKey: 'vlsm_final_validation',
                issueType: 'route_table_rejected',
                expectedText: 'All branches configured with valid non-overlapping VLSM subnets',
                submittedText: validation.reason,
                detail: validation.reason,
                hint: 'Visit every branch terminal and repair each subnet before committing the core gateway.',
            }, function () {});
        }
    }

    _candidateAllocation(branch) {
        const blockSize = this._blockSize(this.selectedPrefix);
        const parent = this._parentRange();
        return {
            branchId: branch.id,
            prefix: this.selectedPrefix,
            start: (parent.start + this.selectedBlockIndex * blockSize) >>> 0,
        };
    }

    _validateAllocation(branch, allocation) {
        const parent = this._parentRange();
        const range = this._range(allocation.start, allocation.prefix);
        const optimal = this._optimalPrefix(branch.hosts);
        if (allocation.prefix !== optimal) {
            const tooSmall = this._usableHosts(allocation.prefix) < branch.hosts;
            return {
                ok: false,
                reason: tooSmall ? 'CAPACITY LEAK' : 'WASTEFUL CIDR',
                hint: 'This branch needs the smallest fitting prefix: /' + optimal + '.',
                stepKey: 'vlsm_host_to_prefix',
                issueType: tooSmall ? 'capacity_too_small' : 'cidr_not_optimal',
                expectedText: '/' + optimal,
            };
        }
        if (!this._containsRange(parent, range)) {
            return {
                ok: false,
                reason: 'OUT OF PARENT RANGE',
                hint: 'The child subnet must stay inside ' + this.scenario.parentCIDR + '.',
                stepKey: 'vlsm_parent_containment',
                issueType: 'out_of_parent_range',
            };
        }
        if (!this._isAligned(allocation.start, allocation.prefix, parent.start)) {
            return {
                ok: false,
                reason: 'MISALIGNED BLOCK',
                hint: 'Network start must land on a /' + allocation.prefix + ' block boundary.',
                stepKey: 'vlsm_block_alignment',
                issueType: 'misaligned_network',
            };
        }
        const keys = Object.keys(this.state.allocations || {});
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] === branch.id) continue;
            const other = this.state.allocations[keys[i]];
            if (!other) continue;
            const otherRange = this._range(other.start, other.prefix);
            if (this._overlaps(range, otherRange)) {
                return {
                    ok: false,
                    reason: 'OVERLAP DETECTED',
                    hint: 'This subnet collides with ' + (other.label || other.branchId) + '. Move to the next clean block.',
                    stepKey: 'vlsm_overlap_check',
                    issueType: 'overlap',
                };
            }
        }
        return { ok: true, reason: 'OK', hint: 'Stable subnet. Inject when ready.' };
    }

    _validateAll() {
        const branches = this.scenario.branches || [];
        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];
            const allocation = this.state.allocations[branch.id];
            if (!allocation) {
                return { ok: false, reason: 'Missing allocation for ' + branch.label + '.' };
            }
            const check = this._validateAllocation(branch, allocation);
            if (!check.ok) return { ok: false, reason: branch.label + ': ' + check.reason + '. ' + check.hint };
        }
        return { ok: true, reason: 'OK' };
    }

    _allocationSummary() {
        const branches = this.scenario.branches || [];
        let configured = 0;
        let allocated = 0;
        let required = 0;
        for (let i = 0; i < branches.length; i++) {
            const b = branches[i];
            required += b.hosts;
            const a = this.state.allocations[b.id];
            if (!a) continue;
            configured++;
            allocated += this._usableHosts(a.prefix);
        }
        return {
            configured,
            allocated,
            waste: Math.max(0, allocated - required),
        };
    }

    _branch() {
        const branches = this.scenario.branches || [];
        for (let i = 0; i < branches.length; i++) {
            if (branches[i].id === this.branchId) return branches[i];
        }
        return null;
    }

    _optimalPrefix(hosts) {
        return this._tools().smallestPrefixForHosts(hosts, this.scenario.parentPrefix);
    }

    _blockIndexFor(start, prefix) {
        const parent = this._parentRange();
        const size = this._blockSize(prefix);
        return Math.max(0, Math.floor(((Number(start) >>> 0) - parent.start) / Math.max(1, size)));
    }

    _maxBlockIndex(prefix) {
        const parent = this._parentRange();
        const size = this._blockSize(prefix);
        return Math.max(0, Math.floor(parent.size / Math.max(1, size)) - 1);
    }

    _parentRange() {
        if (!this._cachedParentRange) {
            const parsed = this._parseCIDR(this.scenario.parentCIDR);
            this._cachedParentRange = this._range(parsed.start, parsed.prefix);
        }
        return this._cachedParentRange;
    }

    _range(start, prefix) {
        return this._tools().rangeFor(start, prefix);
    }

    _blockSize(prefix) {
        return this._tools().blockSize(prefix);
    }

    _usableHosts(prefix) {
        return this._tools().usableHosts(prefix);
    }

    _parseCIDR(text) {
        return this._tools().parseCIDR(text) || { start: 0, prefix: 0 };
    }

    _formatCIDR(start, prefix) {
        return this._tools().formatCIDR(start, prefix);
    }

    _intToIp(value) {
        return this._tools().intToIp(value);
    }

    _containsRange(a, b) {
        return this._tools().containsRange(a, b);
    }

    _overlaps(a, b) {
        return this._tools().overlaps(a, b);
    }

    _isAligned(start, prefix, baseStart) {
        return this._tools().isAligned(start, prefix, baseStart);
    }

    _firstUsable(range) {
        if (!range) return '?';
        return this._intToIp(range.size > 2 ? range.start + 1 : range.start);
    }

    _lastUsable(range) {
        if (!range) return '?';
        return this._intToIp(range.size > 2 ? range.end - 1 : range.end);
    }

    _tools() {
        return IP2Live.CIDRTools || window.IP2LiveCIDRTools;
    }

    _panelPath(ctx, x, y, w, h, cut) {
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - cut * 0.5, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
    }

    _titleFont() {
        if (IP2Live.Assets && IP2Live.Assets.abnesLoaded) return 'Abnes';
        return 'Arial Black';
    }

    _bodyFont() {
        if (IP2Live.Assets && IP2Live.Assets.nebulaLoaded) return 'Nebula-Regular';
        return 'monospace';
    }

    _showError(text) {
        this.errorText = String(text || 'Invalid allocation.');
        this.errorTimer = 90;
    }

    _pointInRect(x, y, r) {
        return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    _clone(value) {
        try { return JSON.parse(JSON.stringify(value || null)); }
        catch (e) { return value || null; }
    }

    _playCursor() {
        try { if (Data && Data.Systems && Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) {}
    }

    _playConfirm() {
        try { if (Data && Data.Systems && Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) {}
    }

    _playCancel() {
        try { if (Data && Data.Systems && Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) {}
    }
}

const VLSMAllocatorGameplayManager = {
    VERSION: 'ip-vlsm-allocator-gameplay-manager-20260602-01',
    _active: false,
    _introShown: false,
    _activeAttempt: null,
    _triggerLocks: {},
    _state: null,

    scenario() {
        return {
            id: 'stage4-level3-vlsm-infiltration-01',
            parentCIDR: '172.30.32.0/20',
            parentPrefix: 20,
            ipClass: 'B',
            branches: [
                { id: 'hq', label: 'HQ', hosts: 450, order: 1 },
                { id: 'eugene', label: 'Eugene', hosts: 200, order: 2 },
                { id: 'branch_a', label: 'Branch A', hosts: 100, order: 3 },
                { id: 'san_jose', label: 'San Jose', hosts: 60, order: 4 },
                { id: 'seattle', label: 'Seattle', hosts: 25, order: 5 },
            ],
        };
    },

    state() {
        if (!this._state) this.resetState();
        return this._state;
    },

    resetState() {
        this._state = {
            allocations: {},
            visitOrder: [],
            mistakeCount: 0,
            startedAt: Date.now(),
        };
        return this._state;
    },

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_vlsm_allocator');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return [];
    },

    _defaultQuestSpec() {
        const specs = this._questSpecs();
        return specs[0] || null;
    },

    _handleObjective(spec, context, questManager) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;
        const objective = qm.currentObjective();
        if (!objective || objective.id !== spec.objectiveId) return false;
        const dist = qm.distanceToObjective(objective, context && context.hero);
        const radius = typeof objective.completionRadiusTiles === 'number' ? objective.completionRadiusTiles : 0.55;
        this._refreshTriggerLock(spec, dist, radius);
        if (dist === null || dist > radius) return false;
        if (this._triggerLocks[spec.objectiveId]) return false;
        if (this._active) return false;

        const attemptKey = this._resolveAttemptKey({ spec: spec, questId: spec.id, objectiveId: spec.objectiveId });
        if (this._activeAttempt === attemptKey) return false;
        this._activeAttempt = attemptKey;

        const launchOptions = {
            spec: spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId: Number(context && context.mapId) || Number(qm.activeMapId) || Number(spec.mapId) || 17,
            _fromObjective: true,
        };
        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_vlsm_allocator', Object.assign({}, launchOptions, {
                showIntro: !this._introShown,
                _reservedAttempt: attemptKey,
            }));
            return false;
        }
        this.launchVLSMAllocatorGameplay(Object.assign({}, launchOptions, { mode: 'replace', showIntro: !this._introShown }));
        return false;
    },

    launchVLSMAllocatorGameplay(options) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        if (!spec) return false;
        const attemptKey = this._resolveAttemptKey({ spec: spec, questId: opts.questId || spec.id, objectiveId: opts.objectiveId || spec.objectiveId });
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        this._activeAttempt = attemptKey;

        if (spec.terminalType === 'branch' && !this._state) this.resetState();
        const self = this;
        const open = function () {
            const screen = new IP2LiveVLSMAllocatorGameplayScreen({
                spec: spec,
                scenario: self.scenario(),
                state: self.state(),
                onMistake: function (mistake, done) { return self._onMistake(opts, mistake, done); },
                onComplete: function (result) { return self._onComplete(opts, result); },
                onCancel: function () { return self._onCancel(opts); },
            });

            const openGameplay = function () {
                self._playMusicZone('GAMEPLAY_1');
                if (Manager && Manager.Stack && typeof Manager.Stack.replace === 'function') Manager.Stack.replace(screen);
                else if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') Manager.Stack.push(screen);
            };

            if (opts.useLoading !== false && self._showLoadingScreen2({
                mode: 'push',
                status: opts.loadingStatus || 'Opening VLSM Terminal',
                detail: opts.loadingDetail || (spec.label || 'VLSM Allocator'),
                onComplete: openGameplay,
            })) return;
            openGameplay();
        };

        const openSafely = function () {
            try { open(); }
            catch (e) {
                self._active = false;
                self._activeAttempt = null;
                console.warn('[IP2Live] VLSMAllocatorGameplayManager failed to open gameplay:', e);
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            }
        };

        const shouldShowIntro = opts.showIntro !== false && !this._introShown;
        if (shouldShowIntro && IP2Live.IPVLSMAllocatorTutorial && typeof IP2Live.IPVLSMAllocatorTutorial.showIntro === 'function') {
            this._introShown = true;
            IP2Live.IPVLSMAllocatorTutorial.showIntro(this.scenario(), openSafely);
        } else {
            openSafely();
        }
        return true;
    },

    _onMistake(options, mistake, done) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
            IP2Live.GameManager.handleGameplayMistake('ip_vlsm_allocator', {
                spec: spec,
                questId: opts.questId || (spec && spec.id),
                objectiveId: opts.objectiveId || (spec && spec.objectiveId),
                mapId: opts.mapId || 17,
                mistakes: [mistake],
                scenario: this.scenario(),
                onComplete: done,
            });
            return true;
        }
        if (IP2Live.IPVLSMAllocatorTutorial && typeof IP2Live.IPVLSMAllocatorTutorial.showCorrection === 'function') {
            return IP2Live.IPVLSMAllocatorTutorial.showCorrection(mistake, done);
        }
        if (typeof done === 'function') done();
        return false;
    },

    _onComplete(options, result) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        if (spec && spec.objectiveId) delete this._triggerLocks[spec.objectiveId];

        const self = this;
        const finalizeExit = function () {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            self._restoreStageMusic();
            if (
                opts.questId &&
                opts.objectiveId &&
                IP2Live.QuestManager &&
                IP2Live.QuestManager.activeQuestId === opts.questId &&
                IP2Live.QuestManager.activeObjectiveId === opts.objectiveId
            ) {
                IP2Live.QuestManager.completeObjective(opts.objectiveId);
            }
            if (typeof opts.onComplete === 'function') opts.onComplete(result);
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
                IP2Live.GameManager.handleGameplayCompleted('ip_vlsm_allocator', {
                    spec: spec,
                    questId: opts.questId || (spec && spec.id),
                    objectiveId: opts.objectiveId || (spec && spec.objectiveId),
                    mapId: opts.mapId || 17,
                    result: result,
                });
            }
            if (result && result.terminalType === 'core') self.resetState();
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Returning to Stage',
            detail: 'VLSM terminal synchronized',
            onComplete: finalizeExit,
        })) finalizeExit();
    },

    _onCancel(options) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        this._restoreStageMusic();
        if (typeof opts.onCancel === 'function') opts.onCancel();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },

    _resolveAttemptKey(options) {
        const opts = options || {};
        const spec = opts.spec || {};
        return (opts.questId || spec.id || 'quest') + ':' + (opts.objectiveId || spec.objectiveId || 'objective');
    },

    _refreshTriggerLock(spec, distance, radius) {
        if (!spec || !spec.objectiveId) return;
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

    _showLoadingScreen2(options) {
        const opts = options || {};
        const Screen2 = IP2Live.LoadingScreen2;
        if (!Screen2 || typeof Screen2.show !== 'function') return false;
        Screen2.show({
            mode: opts.mode || 'replace',
            status: opts.status || 'Loading Gameplay',
            detail: opts.detail || 'Synchronizing transition',
            onComplete: typeof opts.onComplete === 'function' ? opts.onComplete : null,
        });
        return true;
    },
};

IP2Live.VLSMAllocatorGameplayManager = VLSMAllocatorGameplayManager;
IP2Live.VLSMAllocatorGameplayScreen = IP2LiveVLSMAllocatorGameplayScreen;
window.IP2LiveVLSMAllocatorGameplayManager = VLSMAllocatorGameplayManager;
window.IP2LiveVLSMAllocatorGameplayScreen = IP2LiveVLSMAllocatorGameplayScreen;
window.startVLSMAllocatorGameplay = function (options) {
    return VLSMAllocatorGameplayManager.launchVLSMAllocatorGameplay(options || {});
};

console.log('[IP2Live] ip_vlsm_allocator_gameplay.js module loaded.');
