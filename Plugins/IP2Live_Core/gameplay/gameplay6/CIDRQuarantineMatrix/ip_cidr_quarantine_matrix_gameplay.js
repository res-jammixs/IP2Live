/**
 * IP2Live - Gameplay Six: CIDR Quarantine Matrix
 * Stage 3 Level 2 multi-zone visual CIDR containment puzzle.
 */

class IP2LiveCIDRQuarantineMatrixGameplayScreen extends Scene.Base {
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
        this.tools = IP2Live.CIDRTools;
        this.animTick = 0;
        this.finished = false;
        this.phase = 'build';
        this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 3);
        this.attemptsUsed = 0;
        this.problem = this.options.problem || this._generateProblem(this.options.spec || {});
        this.activeZoneIndex = 0;
        this.zones = [];
        for (let i = 0; i < this.problem.zoneCount; i++) {
            const hint = this.problem.solutions[i] || this.problem.solutions[0];
            this.zones.push({
                prefix: Math.min(30, Number(hint.prefix || 27) + 1),
                offset: Math.max(0, Number(hint.offset || 0) + (i % 2 === 0 ? this.tools.blockSize(Math.min(30, Number(hint.prefix || 27) + 1)) : 0)),
            });
        }
        this.buttonRects = [];
        this.zoneRects = [];
        this.submitRect = null;
        this.tutorialMode = !!this.options.tutorialMode;
        this.tutorialZoneIndex = 0;
        this.tutorialReadyToSubmit = false;
        this.tutorialPromptActive = false;
        this.tutorialStarted = false;
    }

    _generateProblem(spec) {
        const tools = this.tools || IP2Live.CIDRTools;
        const profile = spec && spec.profile ? spec.profile : {};
        const questIndex = Number(profile.index || 1) || 1;
        const parentPrefix = Number(profile.parentPrefix || (questIndex >= 4 ? 22 : 23)) || 23;
        const parentSize = tools.blockSize(parentPrefix);
        const zoneCount = Number(profile.zoneCount || (questIndex >= 3 ? 3 : 2)) || 2;
        const baseSecond = tools.randomInt(24, 180);
        const thirdStep = parentPrefix === 22 ? 4 : 2;
        const baseThird = tools.randomInt(0, Math.floor(248 / thirdStep)) * thirdStep;
        const baseIp = tools.ipToInt('10.' + baseSecond + '.' + baseThird + '.0');
        const solutions = [];
        const protectedNodes = [];
        const shards = [];
        const used = {};
        const candidatePrefixes = questIndex >= 4 ? [26, 27, 28] : [27, 28, 29];

        for (let i = 0; i < zoneCount; i++) {
            let prefix = tools.choose(candidatePrefixes);
            let size = tools.blockSize(prefix);
            let offset = 0;
            for (let tries = 0; tries < 60; tries++) {
                const maxBlock = Math.max(0, Math.floor(parentSize / size) - 1);
                offset = tools.randomInt(0, maxBlock) * size;
                let overlap = false;
                for (let s = 0; s < solutions.length; s++) {
                    const a = { start: offset, end: offset + size - 1 };
                    const b = { start: solutions[s].offset, end: solutions[s].offset + tools.blockSize(solutions[s].prefix) - 1 };
                    if (a.start <= b.end && b.start <= a.end) overlap = true;
                }
                if (!overlap && !used[offset + '/' + prefix]) break;
            }
            used[offset + '/' + prefix] = true;
            const start = (baseIp + offset) >>> 0;
            const range = tools.rangeFor(start, prefix);
            const shardA = (range.start + tools.randomInt(1, Math.max(1, Math.floor(size * 0.35)))) >>> 0;
            const shardB = (range.start + Math.min(size - 2, tools.randomInt(Math.max(2, Math.floor(size * 0.45)), Math.max(2, size - 2)))) >>> 0;
            shards.push({ id: 'AI-' + String(i + 1).padStart(2, '0'), start: Math.min(shardA, shardB), end: Math.max(shardA, shardB) });
            solutions.push({ start, offset, prefix });
        }

        for (let i = 0; i < zoneCount + 2; i++) {
            let node = (baseIp + tools.randomInt(1, parentSize - 2)) >>> 0;
            for (let tries = 0; tries < 40; tries++) {
                let insideSolution = false;
                for (let s = 0; s < solutions.length; s++) {
                    const r = tools.rangeFor(solutions[s].start, solutions[s].prefix);
                    if (tools.contains(r, node)) insideSolution = true;
                }
                if (!insideSolution) break;
                node = (baseIp + tools.randomInt(1, parentSize - 2)) >>> 0;
            }
            protectedNodes.push(node);
        }

        return {
            id: [tools.intToIp(baseIp), parentPrefix, zoneCount, Date.now(), Math.floor(Math.random() * 9999)].join(':'),
            baseIp,
            baseCIDR: tools.formatCIDR(baseIp, parentPrefix),
            parentPrefix,
            parentSize,
            zoneCount,
            shards,
            protectedNodes,
            solutions,
        };
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        if (this.tutorialMode && !this.tutorialStarted) {
            this.tutorialStarted = true;
            this._showTutorialIntro();
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _showTutorialIntro() {
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showIntro !== 'function') {
            this._showTutorialZoneStep(0);
            return;
        }
        this.tutorialPromptActive = true;
        const started = helper.showIntro(this._tutorialContext(0), () => {
            this.tutorialPromptActive = false;
            this._showTutorialZoneStep(0);
        });
        if (!started) {
            this.tutorialPromptActive = false;
            this._showTutorialZoneStep(0);
        }
    }


    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive()) {
            const valueWhenDialogue = key && (key.name || key.code || key);
            const upperWhenDialogue = String(valueWhenDialogue || '').toUpperCase();
            if (upperWhenDialogue === 'ENTER' || upperWhenDialogue === 'SPACE' || upperWhenDialogue === 'SPACEBAR') {
                IP2Live.DialogueManager.advance();
            }
            return true;
        }
        const value = key && (key.name || key.code || key);
        const upper = String(value || '').toUpperCase();
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._openPauseMenu();
            return true;
        }
        if (upper === 'TAB') this.activeZoneIndex = (this.activeZoneIndex + 1) % this.zones.length;
        if (upper === 'TAB') this._afterTutorialAction('select');
        if (upper === 'ARROWRIGHT' || upper === 'D') this._adjustOffset(this._activeStep());
        if (upper === 'ARROWLEFT' || upper === 'A') this._adjustOffset(-this._activeStep());
        if (upper === 'ARROWUP' || upper === 'W') this._adjustPrefix(-1);
        if (upper === 'ARROWDOWN' || upper === 'S') this._adjustPrefix(1);
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') this._submit();
        return true;
    }

    onMouseDown(x, y) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        if (this.phase !== 'build') return true;
        this._buildInteractionRects(this._metrics());
        for (let i = 0; i < this.zoneRects.length; i++) {
            if (this._pointInRect(x, y, this.zoneRects[i])) {
                this.activeZoneIndex = i;
                this._playCursor();
                this._afterTutorialAction('select');
                return true;
            }
        }
        for (let i = 0; i < this.buttonRects.length; i++) {
            const b = this.buttonRects[i];
            if (this._pointInRect(x, y, b)) {
                if (b.action === 'prefixDown') this._adjustPrefix(-1);
                if (b.action === 'prefixUp') this._adjustPrefix(1);
                if (b.action === 'offsetLeft') this._adjustOffset(-this._activeStep());
                if (b.action === 'offsetRight') this._adjustOffset(this._activeStep());
                this._playCursor();
                return true;
            }
        }
        if (this.submitRect && this._pointInRect(x, y, this.submitRect)) {
            this._submit();
            return true;
        }
        const grid = this._gridRect;
        if (grid && this._pointInRect(x, y, grid)) {
            const cols = this._gridCols();
            const rows = Math.ceil(this.problem.parentSize / cols);
            const cellW = grid.w / cols;
            const cellH = grid.h / rows;
            const col = Math.max(0, Math.min(cols - 1, Math.floor((x - grid.x) / cellW)));
            const row = Math.max(0, Math.min(rows - 1, Math.floor((y - grid.y) / cellH)));
            const clickedOffset = Math.min(this.problem.parentSize - 1, row * cols + col);
            const size = this._activeStep();
            this.zones[this.activeZoneIndex].offset = Math.floor(clickedOffset / size) * size;
            this._clampActiveZone();
            this._playCursor();
            this._afterTutorialAction('zone');
        }
        return true;
    }

    _activeZone() {
        return this.zones[this.activeZoneIndex] || this.zones[0];
    }

    _activeStep() {
        return Math.max(1, this.tools.blockSize(this._activeZone().prefix));
    }

    _adjustPrefix(delta) {
        const z = this._activeZone();
        z.prefix = Math.max(this.problem.parentPrefix, Math.min(30, z.prefix + delta));
        const size = this.tools.blockSize(z.prefix);
        z.offset = Math.floor(z.offset / size) * size;
        this._clampActiveZone();
        this._afterTutorialAction('zone');
    }

    _adjustOffset(delta) {
        const z = this._activeZone();
        const size = this.tools.blockSize(z.prefix);
        z.offset = Math.floor((z.offset + delta) / size) * size;
        this._clampActiveZone();
        this._afterTutorialAction('zone');
    }

    _clampActiveZone() {
        const z = this._activeZone();
        const size = this.tools.blockSize(z.prefix);
        const maxOffset = Math.max(0, this.problem.parentSize - size);
        z.offset = Math.max(0, Math.min(maxOffset, z.offset));
        z.offset = Math.floor(z.offset / size) * size;
    }

    _tutorialContext(zoneIndex) {
        const idx = Number(zoneIndex === undefined ? this.tutorialZoneIndex : zoneIndex) || 0;
        const solution = this.problem.solutions[idx] || this.problem.solutions[0];
        return {
            baseCIDR: this.problem.baseCIDR,
            zoneIndex: idx,
            totalZones: this.problem.zoneCount || this.zones.length,
            solutionPrefix: solution && solution.prefix,
            solutionOffset: solution && solution.offset,
            solutionCIDR: solution ? this.tools.formatCIDR(solution.start, solution.prefix) : '',
        };
    }

    _showTutorialZoneStep(zoneIndex) {
        if (!this.tutorialMode || this.tutorialPromptActive) return false;
        const idx = Math.max(0, Math.min(this.zones.length - 1, Number(zoneIndex) || 0));
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showStep !== 'function') return false;
        this.tutorialZoneIndex = idx;
        this.tutorialPromptActive = true;
        const started = helper.showStep('zone', this._tutorialContext(idx), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _showTutorialSubmitStep() {
        if (!this.tutorialMode || this.tutorialPromptActive) return false;
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showStep !== 'function') return false;
        this.tutorialReadyToSubmit = true;
        this.tutorialPromptActive = true;
        const started = helper.showStep('submit', this._tutorialContext(this.zones.length - 1), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _showTutorialFeedback(reason) {
        if (!this.tutorialMode || this.tutorialPromptActive) return false;
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showFeedback !== 'function') return false;
        this.tutorialPromptActive = true;
        const started = helper.showFeedback(reason, this._tutorialContext(this.tutorialZoneIndex), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _activeZoneMatchesTutorial() {
        const solution = this.problem.solutions[this.tutorialZoneIndex];
        const zone = this.zones[this.tutorialZoneIndex];
        return !!(solution && zone && zone.prefix === solution.prefix && zone.offset === solution.offset);
    }

    _afterTutorialAction(action) {
        if (!this.tutorialMode || this.tutorialPromptActive || this.finished) return;
        if (this.tutorialReadyToSubmit) {
            this._showTutorialFeedback('submitReady');
            return;
        }
        if (this.activeZoneIndex !== this.tutorialZoneIndex) {
            this._showTutorialFeedback('selectZone');
            return;
        }
        if (action === 'select') return;

        const solution = this.problem.solutions[this.tutorialZoneIndex];
        const zone = this._activeZone();
        if (!solution || !zone) return;
        if (zone.prefix !== solution.prefix) {
            this._showTutorialFeedback('prefix');
            return;
        }
        if (zone.offset !== solution.offset) {
            this._showTutorialFeedback('offset');
            return;
        }

        if (this.tutorialZoneIndex + 1 < this.zones.length) {
            this.tutorialZoneIndex++;
            this.activeZoneIndex = this.tutorialZoneIndex;
            this._showTutorialZoneStep(this.tutorialZoneIndex);
            return;
        }
        this._showTutorialSubmitStep();
    }

    _submit() {
        if (this.phase !== 'build') return;
        if (this.tutorialMode && !this.tutorialReadyToSubmit) {
            this._showTutorialFeedback('submitEarly');
            return;
        }
        const result = this._evaluateZones();
        if (result.ok) {
            if (this.tutorialMode && IP2Live.IPCIDRQuarantineMatrixTutorial && typeof IP2Live.IPCIDRQuarantineMatrixTutorial.showComplete === 'function') {
                this.phase = 'tutorial_complete';
                IP2Live.IPCIDRQuarantineMatrixTutorial.showComplete(() => this._finishSuccess(result));
                return;
            }
            this._finishSuccess(result);
            return;
        }
        if (this.tutorialMode) {
            this._playCancel();
            this._showTutorialFeedback('submitWrong');
            return;
        }
        this.attemptsUsed++;
        this._playCancel();
        this._showDiagnostic(result);
    }

    _zoneRange(zone) {
        return this.tools.rangeFor((this.problem.baseIp + zone.offset) >>> 0, zone.prefix);
    }

    _evaluateZones() {
        const tools = this.tools;
        const ranges = this.zones.map((z) => this._zoneRange(z));
        for (let i = 0; i < ranges.length; i++) {
            if (!tools.isAligned(ranges[i].start, ranges[i].prefix, this.problem.baseIp)) {
                return this._diagnostic('boundary', ['SIMULATION FAILED.', 'Zone ' + (i + 1) + ' starts on an invalid /' + ranges[i].prefix + ' boundary.', 'Snap the selected zone to a valid CIDR boundary.']);
            }
        }
        for (let i = 0; i < ranges.length; i++) {
            for (let j = i + 1; j < ranges.length; j++) {
                if (tools.overlaps(ranges[i], ranges[j])) {
                    return this._diagnostic('overlap', ['SIMULATION FAILED.', 'Two quarantine zones overlap in the matrix.', 'Separate zones so every address belongs to only one cage.']);
                }
            }
        }
        for (let p = 0; p < this.problem.protectedNodes.length; p++) {
            for (let i = 0; i < ranges.length; i++) {
                if (tools.contains(ranges[i], this.problem.protectedNodes[p])) {
                    return this._diagnostic('protected', ['SIMULATION FAILED.', 'Zone ' + (i + 1) + ' captured protected infrastructure.', 'Shift or tighten the selected zone away from cyan safe nodes.']);
                }
            }
        }
        for (let s = 0; s < this.problem.shards.length; s++) {
            const shard = this.problem.shards[s];
            let contained = false;
            for (let i = 0; i < ranges.length; i++) {
                if (tools.contains(ranges[i], shard.start) && tools.contains(ranges[i], shard.end)) contained = true;
            }
            if (!contained) {
                return this._diagnostic('miss', ['SIMULATION FAILED.', shard.id + ' is still leaking outside quarantine.', 'Each shard must be fully inside one CIDR zone.']);
            }
        }
        const expected = this.problem.solutions.map((s) => tools.formatCIDR(s.start, s.prefix)).sort().join('|');
        const entered = ranges.map((r) => tools.formatCIDR(r.start, r.prefix)).sort().join('|');
        if (entered !== expected) {
            return this._diagnostic('minimal', ['SIMULATION FAILED.', 'The matrix contains the shards, but at least one cage is not minimal.', 'Reduce broad zones until no unnecessary address space is quarantined.']);
        }
        return {
            ok: true,
            selectedCIDRs: ranges.map((r) => tools.formatCIDR(r.start, r.prefix)),
            solutionCIDRs: this.problem.solutions.map((s) => tools.formatCIDR(s.start, s.prefix)),
        };
    }

    _diagnostic(reason, lines) {
        return { ok: false, reason, lines };
    }

    _showDiagnostic(result) {
        const remaining = Math.max(0, this.maxAttempts - this.attemptsUsed);
        const lines = (result.lines || ['SIMULATION FAILED.']).slice();
        lines.push('Retries remaining: ' + remaining + '/' + this.maxAttempts + '.');
        const after = () => {
            if (this.attemptsUsed >= this.maxAttempts) {
                this._failOut(result);
                return;
            }
            this.phase = 'build';
        };
        this.phase = 'diagnostic';
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
            IP2Live.GameManager.handleGameplayMistake('ip_cidr_quarantine_matrix', {
                mapId: this.options.mapId || 12,
                questId: this.options.questId,
                objectiveId: this.options.objectiveId,
                mistakes: [{ reason: result.reason, problemId: this.problem.id }],
                attemptsRemaining: remaining,
                onComplete: function () {},
            });
        }
        if (IP2Live.ARDiagnosticRewind && typeof IP2Live.ARDiagnosticRewind.show === 'function') {
            IP2Live.ARDiagnosticRewind.show({ title: 'AR DIAGNOSTIC REWIND', lines, onComplete: after });
        } else {
            after();
        }
    }

    _finishSuccess(result) {
        if (this.finished) return;
        this.finished = true;
        this._playConfirm();
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete({
                gameplayId: 'ip_cidr_quarantine_matrix',
                passed: true,
                attemptsUsed: this.attemptsUsed + 1,
                maxAttempts: this.maxAttempts,
                retries: this.attemptsUsed,
                problemId: this.problem.id,
                baseCIDR: this.problem.baseCIDR,
                zoneCount: this.problem.zoneCount,
                selectedCIDRs: result.selectedCIDRs,
                solutionCIDRs: result.solutionCIDRs,
            });
        }
    }

    _failOut(result) {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed({
                gameplayId: 'ip_cidr_quarantine_matrix',
                passed: false,
                reason: 'attempts_exhausted',
                attemptsUsed: this.attemptsUsed,
                maxAttempts: this.maxAttempts,
                retries: this.attemptsUsed,
                problemId: this.problem.id,
                diagnosticReason: result && result.reason,
                baseCIDR: this.problem.baseCIDR,
                zoneCount: this.problem.zoneCount,
            });
        }
    }

    _cancel() {
        if (this.finished) return;
        this.finished = true;
        this._playCancel();
        if (typeof this.options.onCancel === 'function') this.options.onCancel();
    }

    _openPauseMenu() {
        if (window.IP2LivePauseMenu && Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
            Data.Systems.soundConfirmation.playSound();
            Manager.Stack.push(new IP2LivePauseMenu());
        } else {
            this._cancel();
        }
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
        if (!ctx || !ctx.canvas) return;
        const m = this._metrics();
        this._buildInteractionRects(m);
        this._drawBackdrop(ctx, m);
        this._drawPanel(ctx, m);
        this._drawGrid(ctx, m);
        this._drawInfo(ctx, m);
        this._drawControls(ctx, m);
        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.drawOverlay === 'function') {
            IP2Live.DialogueManager.drawOverlay(ctx);
        }
    }

    _metrics() {
        const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
        const cW = ctx && ctx.canvas ? ctx.canvas.width : 1280;
        const cH = ctx && ctx.canvas ? ctx.canvas.height : 720;
        const sX = cW / 1280;
        const sY = cH / 720;
        return { cW, cH, sX, sY, panelX: 48 * sX, panelY: 44 * sY, panelW: cW - 96 * sX, panelH: cH - 88 * sY };
    }

    _gridCols() {
        return this.problem.parentSize > 512 ? 32 : 32;
    }

    _buildInteractionRects(m) {
        this.zoneRects = [];
        const zoneX = m.panelX + m.panelW * 0.56;
        const zoneY = m.panelY + 108 * m.sY;
        for (let i = 0; i < this.zones.length; i++) {
            this.zoneRects.push({ x: zoneX, y: zoneY + i * 48 * m.sY, w: 280 * m.sX, h: 38 * m.sY });
        }
        const y = m.panelY + m.panelH - 88 * m.sY;
        const bw = 70 * m.sX;
        const bh = 42 * m.sY;
        const cx = m.panelX + m.panelW * 0.48;
        this.buttonRects = [
            { action: 'offsetLeft', x: cx - 220 * m.sX, y, w: bw, h: bh, label: '<' },
            { action: 'offsetRight', x: cx - 138 * m.sX, y, w: bw, h: bh, label: '>' },
            { action: 'prefixDown', x: cx + 52 * m.sX, y, w: bw, h: bh, label: '/+' },
            { action: 'prefixUp', x: cx + 134 * m.sX, y, w: bw, h: bh, label: '/-' },
        ];
        this.submitRect = { x: m.panelX + m.panelW - 212 * m.sX, y, w: 166 * m.sX, h: bh };
        const gridW = Math.min(m.panelW * 0.48, 620 * m.sX);
        const rows = Math.ceil(this.problem.parentSize / this._gridCols());
        this._gridRect = { x: m.panelX + 36 * m.sX, y: m.panelY + 100 * m.sY, w: gridW, h: gridW * (rows / this._gridCols()) };
    }

    _drawBackdrop(ctx, m) {
        const g = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        g.addColorStop(0, '#040B12');
        g.addColorStop(0.5, '#13212E');
        g.addColorStop(1, '#050A12');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = '#FFE600';
        for (let y = -50 * m.sY + ((this.animTick * 0.7) % (50 * m.sY)); y < m.cH; y += 50 * m.sY) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(m.cW, y + 90 * m.sY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    _drawPanel(ctx, m) {
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX, 'rgba(5,12,20,0.95)');
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX, '#FFE600', 2 * m.sX);
        ctx.fillStyle = '#FF003C';
        this._fillChamferRect(ctx, m.panelX, m.panelY + 10 * m.sY, m.panelW * 0.52, 50 * m.sY, 8 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(20 * m.sY) + 'px ' + this._titleFont();
        ctx.textAlign = 'left';
        ctx.fillText('CIDR QUARANTINE MATRIX :: MULTI ZONE', m.panelX + 24 * m.sX, m.panelY + 44 * m.sY);
        ctx.font = 'bold ' + Math.round(12 * m.sY) + 'px monospace';
        ctx.fillStyle = '#BDEEFF';
        ctx.fillText('RELAY ' + this.problem.baseCIDR + '   ZONES REQUIRED ' + this.problem.zoneCount, m.panelX + m.panelW * 0.58, m.panelY + 42 * m.sY);
    }

    _drawGrid(ctx, m) {
        const g = this._gridRect;
        const cols = this._gridCols();
        const rows = Math.ceil(this.problem.parentSize / cols);
        const cellW = g.w / cols;
        const cellH = g.h / rows;
        const ranges = this.zones.map((z) => this._zoneRange(z));
        ctx.fillStyle = 'rgba(10,24,36,0.96)';
        ctx.fillRect(g.x, g.y, g.w, g.h);
        for (let i = 0; i < this.problem.parentSize; i++) {
            const x = g.x + (i % cols) * cellW;
            const y = g.y + Math.floor(i / cols) * cellH;
            const ip = (this.problem.baseIp + i) >>> 0;
            let fill = 'rgba(30,48,63,0.92)';
            for (let r = 0; r < ranges.length; r++) {
                if (this.tools.contains(ranges[r], ip)) fill = r === this.activeZoneIndex ? 'rgba(255,216,74,0.82)' : 'rgba(140,172,255,0.58)';
            }
            for (let s = 0; s < this.problem.shards.length; s++) {
                if (ip >= this.problem.shards[s].start && ip <= this.problem.shards[s].end) fill = 'rgba(255,0,60,0.9)';
            }
            for (let p = 0; p < this.problem.protectedNodes.length; p++) {
                if (ip === this.problem.protectedNodes[p]) fill = 'rgba(0,240,255,0.95)';
            }
            ctx.fillStyle = fill;
            ctx.fillRect(x + 0.8 * m.sX, y + 0.8 * m.sY, cellW - 1.4 * m.sX, cellH - 1.4 * m.sY);
        }
        ctx.strokeStyle = '#DAEEFF';
        ctx.lineWidth = 2 * m.sX;
        ctx.strokeRect(g.x, g.y, g.w, g.h);
    }

    _drawInfo(ctx, m) {
        const tools = this.tools;
        ctx.font = 'bold ' + Math.round(15 * m.sY) + 'px monospace';
        ctx.textAlign = 'left';
        for (let i = 0; i < this.zoneRects.length; i++) {
            const r = this.zoneRects[i];
            const z = this.zones[i];
            const selected = i === this.activeZoneIndex;
            this._fillChamferRect(ctx, r.x, r.y, r.w, r.h, 7 * m.sX, selected ? 'rgba(255,216,74,0.24)' : 'rgba(35,55,75,0.72)');
            this._strokeChamferRect(ctx, r.x, r.y, r.w, r.h, 7 * m.sX, selected ? '#FFE600' : '#70E9FF', 1.3 * m.sX);
            ctx.fillStyle = selected ? '#FFFFFF' : '#D8F7FF';
            ctx.fillText('ZONE ' + (i + 1) + '  ' + tools.formatCIDR((this.problem.baseIp + z.offset) >>> 0, z.prefix), r.x + 12 * m.sX, r.y + 25 * m.sY);
        }
        const textX = m.panelX + m.panelW * 0.56;
        const textY = m.panelY + 300 * m.sY;
        ctx.fillStyle = '#BDEEFF';
        ctx.font = Math.round(12 * m.sY) + 'px monospace';
        ctx.fillText('Red: AI shards. Cyan: protected infrastructure.', textX, textY);
        for (let s = 0; s < this.problem.shards.length; s++) {
            const shard = this.problem.shards[s];
            ctx.fillText(shard.id + '  ' + tools.intToIp(shard.start) + ' - ' + tools.intToIp(shard.end), textX, textY + (28 + s * 22) * m.sY);
        }
    }

    _drawControls(ctx, m) {
        for (let i = 0; i < this.buttonRects.length; i++) this._drawButton(ctx, this.buttonRects[i], m, this.buttonRects[i].label);
        this._drawButton(ctx, this.submitRect, m, 'SUBMIT');
        ctx.font = 'bold ' + Math.round(11 * m.sY) + 'px monospace';
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        ctx.fillText('TRIES ' + this.attemptsUsed + '/' + this.maxAttempts + '   TAB changes zone   Arrow/A-D move   W/S prefix', m.panelX + 28 * m.sX, m.panelY + m.panelH - 24 * m.sY);
    }

    _drawButton(ctx, b, m, label) {
        if (!b) return;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, '#253747');
        g.addColorStop(1, '#111C28');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX, '#FFE600', 1.4 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(14 * m.sY) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, b.x + b.w * 0.5, b.y + b.h * 0.63);
    }

    _fillChamferRect(ctx, x, y, w, h, cut, fillStyle) {
        if (fillStyle) ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
        ctx.fill();
    }

    _strokeChamferRect(ctx, x, y, w, h, cut, strokeStyle, lineWidth) {
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
        ctx.strokeStyle = strokeStyle || '#FFFFFF';
        ctx.lineWidth = lineWidth || 1;
        ctx.stroke();
    }

    _pointInRect(x, y, r) {
        return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    _titleFont() {
        return IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
    }

    _playCursor() { try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) {} }
    _playConfirm() { try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) {} }
    _playCancel() { try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) {} }
}

class IP2LiveCIDRQuarantineMatrixConnectorScreen extends Scene.Base {
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
        this.tools = IP2Live.CIDRTools;
        this.animTick = 0;
        this.finished = false;
        this.phase = 'build';
        this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 3);
        this.attemptsUsed = 0;
        this.directionWeights = { R: 1, L: 2, U: 3, D: 4 };
        this.problem = this.options.problem || this._generateProblem(this.options.spec || {});
        this.paths = [];
        for (let i = 0; i < this.problem.pairs.length; i++) {
            this.paths.push([this._cloneTile(this.problem.pairs[i].start)]);
        }
        this.activePairIndex = 0;
        this.draggingPath = false;
        this.buttonRects = [];
        this.pairRects = [];
        this.confirmRect = null;
        this.statusText = 'Connect both node pairs without touching virus nodes.';
        this.statusTone = 'idle';
        this.lastDiagnostic = null;
        this.tutorialMode = !!this.options.tutorialMode;
        this.tutorialPairIndex = 0;
        this.tutorialReadyToSubmit = false;
        this.tutorialPromptActive = false;
        this.tutorialStarted = false;
    }

    _generateProblem(spec) {
        const profile = spec && spec.profile ? spec.profile : {};
        const questIndex = Number(profile.index || 1) || 1;
        const challengeMode = questIndex > 1;
        const anchors = this._pairAnchors(questIndex);
        const usedSolutionKeys = {};
        const pairs = [];
        const allSolutionPaths = [];

        for (let i = 0; i < 2; i++) {
            const classInfo = this._randomCIDRClass();
            const minAddedBits = challengeMode ? Math.min(classInfo.maxAddedBits, Math.max(classInfo.minAddedBits, 5 + i)) : Math.min(classInfo.maxAddedBits, Math.max(classInfo.minAddedBits, 4 + i));
            const targetAddedBits = this._randomInt(minAddedBits, classInfo.maxAddedBits);
            const route = this._generatePairRoute(anchors[i], targetAddedBits, questIndex, i, usedSolutionKeys);
            for (let p = 0; p < route.path.length; p++) usedSolutionKeys[this._tileKey(route.path[p])] = true;
            allSolutionPaths.push(route.path);

            const targetCIDR = classInfo.originalCIDR + targetAddedBits;
            const optimizedHostBits = Math.max(0, 32 - targetCIDR);
            const ipAddress = this._randomIPForClass(classInfo.ipClass);
            const ipInt = this.tools && typeof this.tools.ipToInt === 'function' ? this.tools.ipToInt(ipAddress) : null;
            pairs.push({
                id: 'pair-' + (i + 1),
                label: 'PAIR ' + (i + 1),
                startLabel: 'A' + (i + 1),
                endLabel: 'B' + (i + 1),
                start: this._cloneTile(route.path[0]),
                end: this._cloneTile(route.path[route.path.length - 1]),
                solutionMoves: route.moves.slice(),
                solutionPath: route.path.map((t) => this._cloneTile(t)),
                ipAddress,
                ipInt,
                ipClass: classInfo.ipClass,
                originalCIDR: classInfo.originalCIDR,
                targetAddedBits,
                targetCIDR,
                optimizedHostBits,
                optimizedCapacity: this._capacityForHostBits(optimizedHostBits),
                requiredHosts: this._randomRequiredHosts(optimizedHostBits),
                allocatedCIDR: this._allocatedCIDR(ipInt, targetCIDR),
            });
        }

        const solutionBufferKeys = this._buildMultiPathBufferKeys(allSolutionPaths);
        const blockedKeys = {};
        for (let i = 0; i < pairs.length; i++) {
            const path = pairs[i].solutionPath;
            for (let p = 0; p < path.length; p++) blockedKeys[this._tileKey(path[p])] = true;
        }

        const viruses = [];
        for (let i = 0; i < pairs.length; i++) {
            this._addDefaultPathDecoyViruses(viruses, blockedKeys, pairs[i].start, pairs[i].end, pairs[i].solutionPath, solutionBufferKeys, questIndex, i);
        }

        const desiredVirusCount = Math.min(42, 24 + questIndex * 4);
        let seed = (questIndex * 137 + Math.floor(Math.random() * 997)) % 997;
        for (let tries = 0; viruses.length < desiredVirusCount && tries < 1300; tries++) {
            seed = (seed * 41 + 23) % 997;
            const tile = { col: seed % 16, row: Math.floor(seed / 16) % 16 };
            const key = this._tileKey(tile);
            if (blockedKeys[key] || solutionBufferKeys[key]) continue;
            if (this._distanceToAnyEndpoint(tile, pairs) <= 1) continue;
            blockedKeys[key] = true;
            viruses.push(this._cloneTile(tile));
        }

        const baseCIDR = pairs.map((p) => p.allocatedCIDR).join(' + ');
        return {
            id: ['dual-pair-matrix', questIndex, Date.now(), Math.floor(Math.random() * 9999)].join(':'),
            questIndex,
            baseCIDR,
            zoneCount: 2,
            pairCount: 2,
            pairs,
            viruses,
            solutionBufferKeys,
        };
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        if (this.tutorialMode && !this.tutorialStarted) {
            this.tutorialStarted = true;
            this._showTutorialIntro();
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _showTutorialIntro() {
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showIntro !== 'function') {
            this._showTutorialPairStep(0);
            return;
        }
        this.tutorialPromptActive = true;
        const started = helper.showIntro(this._tutorialContext(0), () => {
            this.tutorialPromptActive = false;
            this._showTutorialPairStep(0);
        });
        if (!started) {
            this.tutorialPromptActive = false;
            this._showTutorialPairStep(0);
        }
    }

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive()) {
            const valueWhenDialogue = key && (key.name || key.code || key);
            const upperWhenDialogue = String(valueWhenDialogue || '').toUpperCase();
            if (upperWhenDialogue === 'ENTER' || upperWhenDialogue === 'SPACE' || upperWhenDialogue === 'SPACEBAR') IP2Live.DialogueManager.advance();
            return true;
        }
        const value = key && (key.name || key.code || key);
        const upper = String(value || '').toUpperCase();
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._openPauseMenu();
            return true;
        }
        if (this.phase !== 'build') return true;
        if (upper === 'TAB') this._selectPair((this.activePairIndex + 1) % this.problem.pairs.length);
        if (upper === 'ARROWRIGHT' || upper === 'D') this._appendDirection('R');
        if (upper === 'ARROWLEFT' || upper === 'A') this._appendDirection('L');
        if (upper === 'ARROWUP' || upper === 'W') this._appendDirection('U');
        if (upper === 'ARROWDOWN' || upper === 'S') this._appendDirection('D');
        if (upper === 'Z' || upper === 'BACKSPACE') this._undoPath();
        if (upper === 'R') this._clearPath();
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') this._submit();
        return true;
    }

    onMouseDown(x, y) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        if (this.phase !== 'build') return true;
        this._buildInteractionRects(this._metrics());
        for (let i = 0; i < this.pairRects.length; i++) {
            if (this._pointInRect(x, y, this.pairRects[i])) {
                this._selectPair(i);
                return true;
            }
        }
        for (let i = 0; i < this.buttonRects.length; i++) {
            const b = this.buttonRects[i];
            if (this._pointInRect(x, y, b)) {
                if (b.action === 'undo') this._undoPath();
                if (b.action === 'clear') this._clearPath();
                this._playCursor();
                return true;
            }
        }
        if (this.confirmRect && this._pointInRect(x, y, this.confirmRect)) {
            this._submit();
            return true;
        }
        const grid = this._gridRect;
        if (grid && this._pointInRect(x, y, grid)) {
            const tile = this._tileFromPoint(x, y, grid);
            const pairIndex = this._pairIndexForNode(tile);
            if (pairIndex !== -1) this._selectPair(pairIndex);
            this.draggingPath = true;
            this._handlePathTile(tile);
        }
        return true;
    }

    onMouseMove(x, y) {
        if (this.phase !== 'build' || !this.draggingPath) return true;
        const grid = this._gridRect;
        if (grid && this._pointInRect(x, y, grid)) this._handlePathTile(this._tileFromPoint(x, y, grid));
        return true;
    }

    onMouseUp() {
        this.draggingPath = false;
        return true;
    }

    _selectPair(index) {
        const next = Math.max(0, Math.min(this.problem.pairs.length - 1, Number(index) || 0));
        this.activePairIndex = next;
        this._setStatus('Active route: Pair ' + (next + 1) + '.', 'idle');
        this._playCursor();
        this._afterTutorialAction('select');
        return true;
    }

    _appendDirection(direction) {
        const path = this._activePath();
        const next = this._moveTile(path[path.length - 1], direction);
        this._handlePathTile(next);
    }

    _handlePathTile(tile) {
        if (!tile || this.phase !== 'build' || !this._inGrid(tile)) return false;
        const pair = this._activePair();
        const path = this._activePath();
        const existingIndex = this._pathIndex(tile, path);
        if (existingIndex === path.length - 1) return true;
        if (existingIndex !== -1) return this._rewindTo(existingIndex);
        const last = path[path.length - 1];
        const distance = this._manhattan(last, tile);
        if (distance > 1 && (last.col === tile.col || last.row === tile.row)) {
            const direction = tile.col > last.col ? 'R' : (tile.col < last.col ? 'L' : (tile.row > last.row ? 'D' : 'U'));
            let ok = true;
            for (let i = 0; i < distance; i++) {
                const before = path[path.length - 1];
                const next = this._moveTile(before, direction);
                ok = this._handlePathTile(next) && ok;
                if (!ok || this._sameTile(next, tile)) break;
            }
            return ok;
        }
        if (!this._isAdjacent(last, tile)) {
            if (this._sameTile(tile, pair.start)) this._clearPath();
            else this._setStatus('Only adjacent tiles can extend the active connector.', 'bad');
            return false;
        }
        if (this._isVirus(tile)) {
            this._setStatus('Virus node blocks that route. Choose another tile.', 'bad');
            this._playCancel();
            return false;
        }
        if (this._isBlockedByOtherPair(tile, this.activePairIndex)) {
            this._setStatus('That tile is reserved by the other connector.', 'bad');
            this._playCancel();
            return false;
        }
        path.push(this._cloneTile(tile));
        const connected = this._sameTile(tile, pair.end);
        this._setStatus(connected ? 'Pair ' + (this.activePairIndex + 1) + ' linked. Switch pairs or confirm both routes.' : 'Pair ' + (this.activePairIndex + 1) + ' path updated.', connected ? 'good' : 'idle');
        this._playCursor();
        this._afterTutorialAction(connected ? 'connect' : 'path');
        return true;
    }

    _undoPath() {
        const path = this._activePath();
        if (this.phase !== 'build' || path.length <= 1) return false;
        path.pop();
        this._setStatus('Last tile removed from Pair ' + (this.activePairIndex + 1) + '.', 'idle');
        return true;
    }

    _clearPath() {
        if (this.phase !== 'build') return false;
        const pair = this._activePair();
        this.paths[this.activePairIndex] = [this._cloneTile(pair.start)];
        this._setStatus('Pair ' + (this.activePairIndex + 1) + ' cleared.', 'idle');
        return true;
    }

    _rewindTo(index) {
        const path = this._activePath();
        if (index < 0 || index >= path.length) return false;
        this.paths[this.activePairIndex] = path.slice(0, index + 1);
        this._setStatus('Pair ' + (this.activePairIndex + 1) + ' rewound.', 'idle');
        this._playCursor();
        return true;
    }

    _submit() {
        if (this.phase !== 'build') return;
        const result = this._evaluatePaths();
        this.lastDiagnostic = result.ok ? null : result;
        if (this.tutorialMode && !result.ok && !this.tutorialReadyToSubmit) {
            this._showTutorialFeedback('submitEarly');
            return;
        }
        if (result.ok) {
            if (this.tutorialMode && IP2Live.IPCIDRQuarantineMatrixTutorial && typeof IP2Live.IPCIDRQuarantineMatrixTutorial.showComplete === 'function') {
                this.phase = 'tutorial_complete';
                IP2Live.IPCIDRQuarantineMatrixTutorial.showComplete(() => this._finishSuccess(result));
                return;
            }
            this._finishSuccess(result);
            return;
        }
        if (this.tutorialMode) {
            this._playCancel();
            this._showTutorialFeedback('submitWrong');
            return;
        }
        this.attemptsUsed++;
        this._playCancel();
        this._showDiagnostic(result);
    }

    _evaluatePaths() {
        const pairResults = [];
        const occupied = {};
        for (let i = 0; i < this.problem.pairs.length; i++) {
            const pair = this.problem.pairs[i];
            const stats = this._pathStats(i);
            const result = Object.assign({}, stats, {
                pairIndex: i,
                label: pair.label,
                targetCIDR: pair.targetCIDR,
                optimizedCapacity: pair.optimizedCapacity,
                requiredHosts: pair.requiredHosts,
                targetAddedBits: pair.targetAddedBits,
                solutionCIDR: pair.allocatedCIDR,
            });
            pairResults.push(result);
            if (!stats.connected) return this._diagnostic('disconnected', 'Pair ' + (i + 1) + ' never reached ' + pair.endLabel + '.', pairResults);
            if (stats.hitVirus) return this._diagnostic('virus', 'Pair ' + (i + 1) + ' touched a virus node.', pairResults);
            if (stats.currentCIDR !== pair.targetCIDR) return this._diagnostic('not_optimized', 'Pair ' + (i + 1) + ' movement bits do not match the optimized CIDR.', pairResults);
            if (stats.currentCapacity < pair.requiredHosts) return this._diagnostic('too_small', 'Pair ' + (i + 1) + ' host capacity is too small.', pairResults);
            if (stats.currentCapacity > pair.optimizedCapacity) return this._diagnostic('too_big', 'Pair ' + (i + 1) + ' host capacity is larger than the optimized block.', pairResults);
            for (let p = 0; p < this.paths[i].length; p++) {
                const key = this._tileKey(this.paths[i][p]);
                if (occupied[key]) return this._diagnostic('overlap', 'Both connectors are using tile ' + this._tileLabel(this.paths[i][p]) + '.', pairResults);
                occupied[key] = true;
            }
        }
        return Object.assign(this._baseResult(pairResults), { ok: true, passed: true, diagnosticReason: null });
    }

    _diagnostic(reason, line, pairResults) {
        const lines = ['SIMULATION FAILED.', line || 'The dual connector matrix is not stable.', 'Connect both pairs cleanly and match the movement-bit targets.'];
        return Object.assign(this._baseResult(pairResults || this._pairResults()), { ok: false, passed: false, reason, diagnosticReason: reason, lines });
    }

    _baseResult(pairResults) {
        const results = pairResults || this._pairResults();
        return {
            gameplayId: 'ip_cidr_quarantine_matrix',
            problemId: this.problem.id,
            baseCIDR: this.problem.baseCIDR,
            zoneCount: this.problem.zoneCount,
            pairCount: this.problem.pairCount,
            selectedCIDRs: results.map((r) => r.allocatedCIDR),
            solutionCIDRs: this.problem.pairs.map((p) => p.allocatedCIDR),
            pairResults: results,
            pathTilesByPair: this.paths.map((path) => path.map((t) => this._cloneTile(t))),
            moveWeightsByPair: results.map((r) => r.moves.map((m) => ({ direction: m.direction, weight: m.weight }))),
            attemptsUsed: this.attemptsUsed,
            maxAttempts: this.maxAttempts,
            retries: Math.max(0, this.attemptsUsed - 1),
        };
    }

    _pairResults() {
        const out = [];
        for (let i = 0; i < this.problem.pairs.length; i++) {
            const pair = this.problem.pairs[i];
            out.push(Object.assign(this._pathStats(i), {
                pairIndex: i,
                label: pair.label,
                targetCIDR: pair.targetCIDR,
                optimizedCapacity: pair.optimizedCapacity,
                requiredHosts: pair.requiredHosts,
                targetAddedBits: pair.targetAddedBits,
                solutionCIDR: pair.allocatedCIDR,
            }));
        }
        return out;
    }

    _pathStats(pairIndex) {
        const pair = this.problem.pairs[pairIndex];
        const path = this.paths[pairIndex] || [];
        const moves = [];
        let addedBits = 0;
        let hitVirus = false;
        for (let i = 0; i < path.length; i++) {
            if (this._isVirus(path[i])) hitVirus = true;
            if (i === 0) continue;
            const direction = this._directionBetween(path[i - 1], path[i]);
            const weight = this.directionWeights[direction] || 0;
            addedBits += weight;
            moves.push({ direction, weight, from: this._cloneTile(path[i - 1]), to: this._cloneTile(path[i]) });
        }
        const currentCIDR = Number(pair.originalCIDR || 0) + addedBits;
        return {
            addedBits,
            currentCIDR,
            currentHostBits: Math.max(0, 32 - currentCIDR),
            currentCapacity: this._capacityForHostBits(Math.max(0, 32 - currentCIDR)),
            allocatedCIDR: this._allocatedCIDR(pair.ipInt, currentCIDR),
            moves,
            pathLength: path.length,
            pathTiles: path.map((t) => this._cloneTile(t)),
            connected: this._sameTile(path[path.length - 1], pair.end),
            hitVirus,
        };
    }

    _showDiagnostic(result) {
        const remaining = Math.max(0, this.maxAttempts - this.attemptsUsed);
        const lines = (result.lines || ['SIMULATION FAILED.']).slice();
        lines.push('Retries remaining: ' + remaining + '/' + this.maxAttempts + '.');
        const after = () => {
            if (this.attemptsUsed >= this.maxAttempts) {
                this._failOut(result);
                return;
            }
            this.phase = 'build';
            this.statusText = 'Path rejected: ' + this._reasonLabel(result.reason) + '. Adjust both pairs and confirm again.';
            this.statusTone = 'bad';
        };
        this.phase = 'diagnostic';
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
            IP2Live.GameManager.handleGameplayMistake('ip_cidr_quarantine_matrix', {
                mapId: this.options.mapId || 12,
                questId: this.options.questId,
                objectiveId: this.options.objectiveId,
                mistakes: [{ reason: result.reason, problemId: this.problem.id }],
                attemptsRemaining: remaining,
                result,
                onComplete: function () {},
            });
        }
        if (IP2Live.ARDiagnosticRewind && typeof IP2Live.ARDiagnosticRewind.show === 'function') {
            IP2Live.ARDiagnosticRewind.show({ title: 'AR DIAGNOSTIC REWIND', lines, onComplete: after });
        } else {
            after();
        }
    }

    _finishSuccess(result) {
        if (this.finished) return;
        this.finished = true;
        this._playConfirm();
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete(Object.assign({}, result, {
                passed: true,
                attemptsUsed: this.attemptsUsed + 1,
                retries: this.attemptsUsed,
            }));
        }
    }

    _failOut(result) {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed(Object.assign({}, result || {}, {
                gameplayId: 'ip_cidr_quarantine_matrix',
                passed: false,
                reason: 'attempts_exhausted',
                attemptsUsed: this.attemptsUsed,
                maxAttempts: this.maxAttempts,
                retries: this.attemptsUsed,
                problemId: this.problem.id,
                baseCIDR: this.problem.baseCIDR,
                zoneCount: this.problem.zoneCount,
            }));
        }
    }

    _cancel() {
        if (this.finished) return;
        this.finished = true;
        this._playCancel();
        if (typeof this.options.onCancel === 'function') this.options.onCancel();
    }

    _openPauseMenu() {
        if (window.IP2LivePauseMenu && Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
            Data.Systems.soundConfirmation.playSound();
            Manager.Stack.push(new IP2LivePauseMenu());
        } else {
            this._cancel();
        }
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
        if (!ctx || !ctx.canvas) return;
        const m = this._metrics();
        this._buildInteractionRects(m);
        this._drawBackdrop(ctx, m);
        this._drawPanel(ctx, m);
        this._drawGrid(ctx, m);
        this._drawInfo(ctx, m);
        this._drawControls(ctx, m);
        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.drawOverlay === 'function') IP2Live.DialogueManager.drawOverlay(ctx);
    }

    _metrics() {
        const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
        const cW = ctx && ctx.canvas ? ctx.canvas.width : 1280;
        const cH = ctx && ctx.canvas ? ctx.canvas.height : 720;
        const sX = cW / 1280;
        const sY = cH / 720;
        return { cW, cH, sX, sY, panelX: 48 * sX, panelY: 44 * sY, panelW: cW - 96 * sX, panelH: cH - 88 * sY };
    }

    _buildInteractionRects(m) {
        const gridSize = Math.min(m.panelW * 0.50, m.panelH - 170 * m.sY, 590 * m.sX);
        this._gridRect = { x: m.panelX + 34 * m.sX, y: m.panelY + 92 * m.sY, w: gridSize, h: gridSize };
        const sideX = m.panelX + m.panelW * 0.57;
        const pairY = m.panelY + 102 * m.sY;
        this.pairRects = [
            { x: sideX, y: pairY, w: 300 * m.sX, h: 48 * m.sY },
            { x: sideX, y: pairY + 58 * m.sY, w: 300 * m.sX, h: 48 * m.sY },
        ];
        const y = m.panelY + m.panelH - 88 * m.sY;
        this.buttonRects = [
            { action: 'undo', label: 'UNDO', x: sideX, y, w: 120 * m.sX, h: 42 * m.sY },
            { action: 'clear', label: 'CLEAR', x: sideX + 138 * m.sX, y, w: 120 * m.sX, h: 42 * m.sY },
        ];
        this.confirmRect = { action: 'confirm', label: 'CONFIRM BOTH', x: m.panelX + m.panelW - 246 * m.sX, y, w: 198 * m.sX, h: 42 * m.sY };
    }

    _drawBackdrop(ctx, m) {
        const g = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        g.addColorStop(0, '#040B12');
        g.addColorStop(0.5, '#13212E');
        g.addColorStop(1, '#050A12');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.globalAlpha = 0.13;
        ctx.strokeStyle = '#FFE600';
        for (let y = -50 * m.sY + ((this.animTick * 0.7) % (50 * m.sY)); y < m.cH; y += 50 * m.sY) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(m.cW, y + 90 * m.sY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    _drawPanel(ctx, m) {
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX, 'rgba(5,12,20,0.95)');
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX, '#FFE600', 2 * m.sX);
        ctx.fillStyle = '#FF003C';
        this._fillChamferRect(ctx, m.panelX, m.panelY + 10 * m.sY, m.panelW * 0.52, 50 * m.sY, 8 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(19 * m.sY) + 'px ' + this._titleFont();
        ctx.textAlign = 'left';
        ctx.fillText('CIDR QUARANTINE MATRIX :: DUAL CONNECTOR', m.panelX + 24 * m.sX, m.panelY + 44 * m.sY);
        ctx.font = 'bold ' + Math.round(12 * m.sY) + 'px monospace';
        ctx.fillStyle = '#BDEEFF';
        ctx.fillText('CONNECT BOTH PAIRS   VIRUS NODES OFF LIMITS', m.panelX + m.panelW * 0.58, m.panelY + 42 * m.sY);
    }

    _drawGrid(ctx, m) {
        const g = this._gridRect;
        const cell = g.w / 16;
        ctx.fillStyle = 'rgba(10,24,36,0.96)';
        ctx.fillRect(g.x, g.y, g.w, g.h);
        for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 16; col++) {
                const x = g.x + col * cell;
                const y = g.y + row * cell;
                ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(24,42,56,0.92)' : 'rgba(30,48,63,0.92)';
                ctx.fillRect(x + 0.8 * m.sX, y + 0.8 * m.sY, cell - 1.4 * m.sX, cell - 1.4 * m.sY);
            }
        }
        for (let i = 0; i < this.problem.viruses.length; i++) {
            const p = this._cellCenter(this.problem.viruses[i], g);
            this._drawVirusIcon(ctx, p.x, p.y, cell * 0.34, m);
        }
        const colors = ['#FFE600', '#70E9FF'];
        for (let i = 0; i < this.paths.length; i++) this._drawPath(ctx, m, this.paths[i], colors[i], i === this.activePairIndex ? 1 : 0.62);
        for (let i = 0; i < this.problem.pairs.length; i++) {
            const pair = this.problem.pairs[i];
            const active = i === this.activePairIndex;
            this._drawNodeIcon(ctx, this._cellCenter(pair.start, g), cell * 0.36, active ? '#00D8FF' : '#5EDCFF', m, pair.startLabel);
            this._drawNodeIcon(ctx, this._cellCenter(pair.end, g), cell * 0.36, active ? '#2F80FF' : '#789BFF', m, pair.endLabel);
        }
        ctx.strokeStyle = '#DAEEFF';
        ctx.lineWidth = 2 * m.sX;
        ctx.strokeRect(g.x, g.y, g.w, g.h);
    }

    _drawInfo(ctx, m) {
        const sideX = m.panelX + m.panelW * 0.57;
        ctx.font = 'bold ' + Math.round(14 * m.sY) + 'px monospace';
        ctx.textAlign = 'left';
        for (let i = 0; i < this.pairRects.length; i++) {
            const r = this.pairRects[i];
            const pair = this.problem.pairs[i];
            const stats = this._pathStats(i);
            const selected = i === this.activePairIndex;
            this._fillChamferRect(ctx, r.x, r.y, r.w, r.h, 7 * m.sX, selected ? 'rgba(255,216,74,0.24)' : 'rgba(35,55,75,0.72)');
            this._strokeChamferRect(ctx, r.x, r.y, r.w, r.h, 7 * m.sX, selected ? '#FFE600' : '#70E9FF', 1.3 * m.sX);
            ctx.fillStyle = selected ? '#FFFFFF' : '#D8F7FF';
            ctx.fillText('PAIR ' + (i + 1) + '  /' + pair.originalCIDR + ' +' + stats.addedBits + ' = /' + stats.currentCIDR, r.x + 12 * m.sX, r.y + 20 * m.sY);
            ctx.fillStyle = stats.connected ? '#96FFB8' : '#BDEEFF';
            ctx.fillText((stats.connected ? 'LINKED' : 'OPEN') + '  TARGET /' + pair.targetCIDR + '  ' + pair.ipClass, r.x + 12 * m.sX, r.y + 38 * m.sY);
        }
        const activePair = this._activePair();
        const activeStats = this._pathStats(this.activePairIndex);
        ctx.fillStyle = '#BDEEFF';
        ctx.font = Math.round(12 * m.sY) + 'px monospace';
        ctx.fillText('Active: ' + activePair.ipAddress + '/' + activePair.originalCIDR + '  Target /' + activePair.targetCIDR, sideX, m.panelY + 244 * m.sY);
        ctx.fillText('Path bits: +' + activeStats.addedBits + '  Capacity: ' + this._formatHosts(activeStats.currentCapacity) + ' / needed ' + this._formatHosts(activePair.requiredHosts), sideX, m.panelY + 270 * m.sY);
        ctx.fillStyle = this.statusTone === 'bad' ? '#FF8AA8' : (this.statusTone === 'good' ? '#96FFB8' : '#DAEEFF');
        ctx.fillText(this.statusText, sideX, m.panelY + 318 * m.sY);
    }

    _drawControls(ctx, m) {
        for (let i = 0; i < this.buttonRects.length; i++) this._drawButton(ctx, this.buttonRects[i], m, this.buttonRects[i].label);
        this._drawButton(ctx, this.confirmRect, m, this.confirmRect.label);
        ctx.font = 'bold ' + Math.round(11 * m.sY) + 'px monospace';
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        ctx.fillText('TRIES ' + this.attemptsUsed + '/' + this.maxAttempts + '   TAB pair   Drag/click path   Z undo   R clear   ENTER confirm', m.panelX + 28 * m.sX, m.panelY + m.panelH - 24 * m.sY);
    }

    _drawButton(ctx, b, m, label) {
        if (!b) return;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, '#253747');
        g.addColorStop(1, '#111C28');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX, '#FFE600', 1.4 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(13 * m.sY) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, b.x + b.w * 0.5, b.y + b.h * 0.63);
    }

    _drawPath(ctx, m, path, color, alpha) {
        if (!path || path.length < 2 || !this._gridRect) return;
        const g = this._gridRect;
        ctx.save();
        ctx.globalAlpha = alpha === undefined ? 1 : alpha;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * m.sX;
        ctx.strokeStyle = color;
        ctx.lineWidth = 7 * m.sX;
        ctx.beginPath();
        const first = this._cellCenter(path[0], g);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < path.length; i++) {
            const p = this._cellCenter(path[i], g);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        for (let i = 0; i < path.length; i++) {
            const p = this._cellCenter(path[i], g);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4.2 * m.sX, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _drawNodeIcon(ctx, point, radius, color, m, label) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 * m.sX;
        ctx.fillStyle = 'rgba(4,20,35,0.96)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 * m.sX;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(11 * m.sY) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, point.x, point.y + 4 * m.sY);
        ctx.restore();
    }

    _drawVirusIcon(ctx, x, y, radius, m) {
        ctx.save();
        ctx.shadowColor = '#FF0048';
        ctx.shadowBlur = 12 * m.sX;
        ctx.fillStyle = '#FF0048';
        ctx.strokeStyle = '#FFD1DC';
        ctx.lineWidth = 1.5 * m.sX;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 * i) / 12;
            const r = i % 2 === 0 ? radius * 1.12 : radius * 0.78;
            const px = x + Math.cos(a) * r;
            const py = y + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    _afterTutorialAction(action) {
        if (!this.tutorialMode || this.tutorialPromptActive) return;
        if (action === 'connect') {
            if (this.tutorialPairIndex === this.activePairIndex && this._pathStats(this.activePairIndex).connected) {
                if (this.tutorialPairIndex + 1 < this.problem.pairs.length) {
                    this.tutorialPairIndex++;
                    this._selectPair(this.tutorialPairIndex);
                    this._showTutorialPairStep(this.tutorialPairIndex);
                } else {
                    this.tutorialReadyToSubmit = true;
                    this._showTutorialSubmitStep();
                }
            }
        }
    }

    _tutorialContext(pairIndex) {
        const idx = Math.max(0, Math.min(this.problem.pairs.length - 1, Number(pairIndex === undefined ? this.tutorialPairIndex : pairIndex) || 0));
        const pair = this.problem.pairs[idx];
        const stats = this._pathStats(idx);
        return {
            pairIndex: idx,
            pairLabel: 'Pair ' + (idx + 1),
            totalPairs: this.problem.pairs.length,
            ipAddress: pair.ipAddress,
            ipClass: pair.ipClass,
            originalCIDR: pair.originalCIDR,
            targetCIDR: pair.targetCIDR,
            targetAddedBits: pair.targetAddedBits,
            currentAddedBits: stats.addedBits,
            currentCIDR: stats.currentCIDR,
            optimizedCapacity: this._formatHosts(pair.optimizedCapacity),
            currentCapacity: this._formatHosts(stats.currentCapacity),
            startLabel: pair.startLabel,
            endLabel: pair.endLabel,
        };
    }

    _showTutorialPairStep(pairIndex) {
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showStep !== 'function') return false;
        this.tutorialPromptActive = true;
        const started = helper.showStep('pair', this._tutorialContext(pairIndex), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _showTutorialSubmitStep() {
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showStep !== 'function') return false;
        this.tutorialPromptActive = true;
        const started = helper.showStep('submit', this._tutorialContext(this.problem.pairs.length - 1), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _showTutorialFeedback(reason) {
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showFeedback !== 'function') return false;
        this.tutorialPromptActive = true;
        const started = helper.showFeedback(reason, this._tutorialContext(this.tutorialPairIndex), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _generatePairRoute(start, bits, questIndex, pairIndex, avoidKeys) {
        const candidates = this._routeCandidatesForBits(start, bits, questIndex, pairIndex, avoidKeys);
        if (candidates.length) {
            candidates.sort((a, b) => b.score - a.score);
            const topCount = Math.min(4, candidates.length);
            const chosen = candidates[this._randomInt(0, topCount - 1)];
            return { moves: chosen.moves.slice(), path: chosen.path.map((t) => this._cloneTile(t)) };
        }
        return this._routeFromMoves(start, this._fallbackMovesForBits(bits));
    }

    _routeCandidatesForBits(start, bits, questIndex, pairIndex, avoidKeys) {
        const total = Math.max(1, Number(bits) || 1);
        const candidates = [];
        const directions = this._routeDirectionOrder(questIndex, pairIndex);
        const maxMoves = Math.min(10, Math.max(3, total));
        const startTile = this._cloneTile(start);
        const used = {};
        used[this._tileKey(startTile)] = true;

        const visit = (tile, remaining, moves, path) => {
            if (candidates.length >= 520) return;
            if (remaining === 0) {
                const score = this._scoreRouteCandidate(startTile, path, moves, questIndex);
                if (score > 0) candidates.push({ moves: moves.slice(), path: path.map((t) => this._cloneTile(t)), score });
                return;
            }
            if (moves.length >= maxMoves) return;
            if (remaining > (maxMoves - moves.length) * 4) return;
            for (let i = 0; i < directions.length; i++) {
                const direction = directions[i];
                const weight = this.directionWeights[direction] || 0;
                if (weight <= 0 || weight > remaining) continue;
                const next = this._moveTile(tile, direction);
                const key = this._tileKey(next);
                if (!this._inGrid(next) || used[key] || (avoidKeys && avoidKeys[key])) continue;
                used[key] = true;
                moves.push(direction);
                path.push(next);
                visit(next, remaining - weight, moves, path);
                path.pop();
                moves.pop();
                delete used[key];
            }
        };

        visit(startTile, total, [], [startTile]);
        return candidates;
    }

    _routeDirectionOrder(questIndex, pairIndex) {
        const orders = [
            ['R', 'D', 'U', 'L'],
            ['R', 'U', 'D', 'L'],
            ['D', 'R', 'U', 'L'],
            ['U', 'R', 'D', 'L'],
            ['D', 'L', 'R', 'U'],
            ['U', 'L', 'R', 'D'],
        ];
        return orders[(Math.abs(Number(questIndex || 1)) + Number(pairIndex || 0)) % orders.length];
    }

    _scoreRouteCandidate(start, path, moves, questIndex) {
        if (!path || path.length < 3 || !moves || moves.length < 2) return -100;
        const end = path[path.length - 1];
        const distinct = {};
        let turns = 0;
        for (let i = 0; i < moves.length; i++) {
            distinct[moves[i]] = true;
            if (i > 0 && moves[i] !== moves[i - 1]) turns++;
        }
        const distinctCount = Object.keys(distinct).length;
        if (distinctCount < 2 || turns < 1) return -100;
        const rowDelta = Math.abs(end.row - start.row);
        const colDelta = Math.abs(end.col - start.col);
        let score = distinctCount * 24 + turns * 16 + Math.min(6, rowDelta) * 13 + Math.min(7, colDelta) * 4 + Math.min(9, moves.length) * 2;
        if (end.row === start.row) score -= Number(questIndex || 1) > 1 ? 70 : 35;
        if (this._manhattan(start, end) < 3) score -= 30;
        if (moves.length > 8) score -= (moves.length - 8) * 4;
        return score;
    }

    _routeFromMoves(start, moves) {
        const solutionMoves = (moves || []).slice();
        const solutionPath = [this._cloneTile(start)];
        let cursor = this._cloneTile(start);
        for (let i = 0; i < solutionMoves.length; i++) {
            cursor = this._moveTile(cursor, solutionMoves[i]);
            if (!this._inGrid(cursor)) break;
            solutionPath.push(this._cloneTile(cursor));
        }
        return { moves: solutionMoves.slice(0, Math.max(0, solutionPath.length - 1)), path: solutionPath };
    }

    _fallbackMovesForBits(bits) {
        const total = Math.max(1, Number(bits) || 1);
        const moves = [];
        let remaining = total;
        while (remaining >= 4) { moves.push('D'); remaining -= 4; }
        while (remaining >= 3) { moves.push('U'); remaining -= 3; }
        while (remaining >= 2) { moves.push('L'); remaining -= 2; }
        while (remaining >= 1) { moves.push('R'); remaining -= 1; }
        return moves;
    }

    _addDefaultPathDecoyViruses(viruses, blockedKeys, start, end, solutionPath, solutionBufferKeys, questIndex, pairIndex) {
        const desired = Math.min(4, Math.max(2, Number(questIndex || 2)));
        const candidates = this._defaultPathDecoyCandidates(start, end, solutionPath);
        let placed = 0;
        for (let i = 0; i < candidates.length && placed < desired; i++) {
            const tile = candidates[i].tile;
            const key = this._tileKey(tile);
            if (blockedKeys[key]) continue;
            if (solutionBufferKeys[key] && placed > 0) continue;
            if (this._distanceToTileList(tile, solutionPath) <= 1) continue;
            if (this._manhattan(tile, start) <= 1 || this._manhattan(tile, end) <= 1) continue;
            blockedKeys[key] = true;
            viruses.push(this._cloneTile(tile));
            placed++;
        }
        return placed;
    }

    _defaultPathDecoyCandidates(start, end, solutionPath) {
        const directPath = this._directCorridorTiles(start, end);
        const candidates = [];
        const seen = {};
        const midpoint = Math.max(0, Math.floor((directPath.length - 1) / 2));
        for (let offset = 0; offset < directPath.length; offset++) {
            const indexes = offset === 0 ? [midpoint] : [midpoint - offset, midpoint + offset];
            for (let i = 0; i < indexes.length; i++) {
                const index = indexes[i];
                if (index < 0 || index >= directPath.length) continue;
                const base = directPath[index];
                this._pushDecoyCandidate(candidates, seen, base, 130 - offset * 9);
                const neighbors = [
                    { col: base.col + 1, row: base.row },
                    { col: base.col - 1, row: base.row },
                    { col: base.col, row: base.row + 1 },
                    { col: base.col, row: base.row - 1 },
                    { col: base.col + 2, row: base.row },
                    { col: base.col - 2, row: base.row },
                    { col: base.col, row: base.row + 2 },
                    { col: base.col, row: base.row - 2 },
                ];
                for (let n = 0; n < neighbors.length; n++) {
                    const solutionDistance = this._distanceToTileList(neighbors[n], solutionPath);
                    this._pushDecoyCandidate(candidates, seen, neighbors[n], 110 - offset * 8 + Math.min(3, solutionDistance) * 3);
                }
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates;
    }

    _pushDecoyCandidate(candidates, seen, tile, score) {
        if (!this._inGrid(tile)) return false;
        const key = this._tileKey(tile);
        if (seen[key]) return false;
        seen[key] = true;
        candidates.push({ tile: this._cloneTile(tile), score });
        return true;
    }

    _directCorridorTiles(start, end) {
        const path = [this._cloneTile(start)];
        const cursor = this._cloneTile(start);
        while (cursor.col !== end.col) {
            cursor.col += end.col >= cursor.col ? 1 : -1;
            path.push(this._cloneTile(cursor));
        }
        while (cursor.row !== end.row) {
            cursor.row += end.row >= cursor.row ? 1 : -1;
            path.push(this._cloneTile(cursor));
        }
        return path;
    }

    _buildMultiPathBufferKeys(paths) {
        const keys = {};
        for (let i = 0; i < paths.length; i++) {
            for (let p = 0; p < paths[i].length; p++) {
                const base = paths[i][p];
                for (let row = base.row - 1; row <= base.row + 1; row++) {
                    for (let col = base.col - 1; col <= base.col + 1; col++) {
                        const tile = { col, row };
                        if (this._inGrid(tile) && this._manhattan(base, tile) <= 1) keys[this._tileKey(tile)] = true;
                    }
                }
            }
        }
        return keys;
    }

    _pairAnchors(questIndex) {
        const layouts = [
            [{ col: 1, row: 3 }, { col: 2, row: 11 }],
            [{ col: 2, row: 2 }, { col: 2, row: 12 }],
            [{ col: 1, row: 6 }, { col: 7, row: 13 }],
            [{ col: 2, row: 3 }, { col: 10, row: 11 }],
            [{ col: 1, row: 12 }, { col: 5, row: 4 }],
        ];
        const selected = layouts[(Math.max(1, Number(questIndex) || 1) - 1) % layouts.length];
        return selected.map((t) => this._cloneTile(t));
    }

    _randomCIDRClass() {
        const classes = [
            { ipClass: 'A', originalCIDR: 8, minAddedBits: 4, maxAddedBits: 16 },
            { ipClass: 'B', originalCIDR: 16, minAddedBits: 3, maxAddedBits: 11 },
            { ipClass: 'C', originalCIDR: 24, minAddedBits: 2, maxAddedBits: 6 },
        ];
        return classes[this._randomInt(0, classes.length - 1)];
    }

    _randomIPForClass(ipClass) {
        const core = IP2Live.IPWiresCore;
        if (core && typeof core.generateIPForClass === 'function') {
            const generated = core.generateIPForClass(ipClass);
            if (generated && generated.ip) return generated.ip;
        }
        const ranges = { A: [1, 126], B: [128, 191], C: [192, 223] };
        const range = ranges[ipClass] || ranges.C;
        return [this._randomInt(range[0], range[1]), this._randomInt(0, 255), this._randomInt(0, 255), this._randomInt(1, 254)].join('.');
    }

    _randomRequiredHosts(hostBits) {
        const bits = Math.max(1, Number(hostBits) || 1);
        const capacity = this._capacityForHostBits(bits);
        const minimum = Math.max(1, this._capacityForHostBits(bits - 1) + 1);
        const maximum = Math.max(minimum, capacity - 1);
        return this._randomInt(minimum, maximum);
    }

    _capacityForHostBits(hostBits) {
        const bits = Math.max(0, Number(hostBits) || 0);
        if (bits <= 52) return Math.pow(2, bits);
        return '2^' + bits;
    }

    _allocatedCIDR(ipInt, prefix) {
        const tools = this.tools || IP2Live.CIDRTools;
        const p = Number(prefix);
        if (!tools || typeof tools.networkStart !== 'function' || typeof tools.formatCIDR !== 'function') return 'unknown /' + p;
        if (!Number.isInteger(p) || p < 0 || p > 32) return 'invalid /' + p;
        const base = Number(ipInt);
        if (!Number.isFinite(base)) return 'unknown /' + p;
        return tools.formatCIDR(tools.networkStart(base >>> 0, p), p);
    }

    _activePair() { return this.problem.pairs[this.activePairIndex] || this.problem.pairs[0]; }
    _activePath() { return this.paths[this.activePairIndex] || this.paths[0]; }
    _setStatus(text, tone) { this.statusText = text; this.statusTone = tone || 'idle'; }

    _isBlockedByOtherPair(tile, activeIndex) {
        for (let i = 0; i < this.problem.pairs.length; i++) {
            if (i === activeIndex) continue;
            if (this._sameTile(tile, this.problem.pairs[i].start) || this._sameTile(tile, this.problem.pairs[i].end)) return true;
            if (this._pathIndex(tile, this.paths[i]) !== -1) return true;
        }
        return false;
    }

    _pairIndexForNode(tile) {
        for (let i = 0; i < this.problem.pairs.length; i++) {
            const pair = this.problem.pairs[i];
            if (this._sameTile(tile, pair.start) || this._sameTile(tile, pair.end)) return i;
        }
        return -1;
    }

    _distanceToAnyEndpoint(tile, pairs) {
        let best = 99;
        for (let i = 0; i < pairs.length; i++) {
            best = Math.min(best, this._manhattan(tile, pairs[i].start), this._manhattan(tile, pairs[i].end));
        }
        return best;
    }

    _distanceToTileList(tile, tiles) {
        if (!tile || !tiles || !tiles.length) return 99;
        let best = 99;
        for (let i = 0; i < tiles.length; i++) {
            const d = this._manhattan(tile, tiles[i]);
            if (d < best) best = d;
            if (best <= 0) return best;
        }
        return best;
    }

    _tileFromPoint(x, y, grid) {
        const cell = grid.w / 16;
        return { col: Math.max(0, Math.min(15, Math.floor((x - grid.x) / cell))), row: Math.max(0, Math.min(15, Math.floor((y - grid.y) / cell))) };
    }

    _cellCenter(tile, grid) {
        const cell = grid.w / 16;
        return { x: grid.x + tile.col * cell + cell / 2, y: grid.y + tile.row * cell + cell / 2 };
    }

    _moveTile(tile, direction) {
        const t = this._cloneTile(tile);
        if (direction === 'R') t.col++;
        if (direction === 'L') t.col--;
        if (direction === 'U') t.row--;
        if (direction === 'D') t.row++;
        return t;
    }

    _directionBetween(a, b) {
        if (!a || !b) return '';
        if (b.col === a.col + 1 && b.row === a.row) return 'R';
        if (b.col === a.col - 1 && b.row === a.row) return 'L';
        if (b.col === a.col && b.row === a.row - 1) return 'U';
        if (b.col === a.col && b.row === a.row + 1) return 'D';
        return '';
    }

    _isAdjacent(a, b) { return !!a && !!b && Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1; }
    _inGrid(tile) { return tile && tile.col >= 0 && tile.col < 16 && tile.row >= 0 && tile.row < 16; }
    _isVirus(tile) { const key = this._tileKey(tile); return this.problem.viruses.some((v) => this._tileKey(v) === key); }
    _pathIndex(tile, path) { for (let i = 0; path && i < path.length; i++) if (this._sameTile(path[i], tile)) return i; return -1; }
    _sameTile(a, b) { return !!a && !!b && Number(a.col) === Number(b.col) && Number(a.row) === Number(b.row); }
    _cloneTile(tile) { return { col: Number(tile && tile.col) || 0, row: Number(tile && tile.row) || 0 }; }
    _tileKey(tile) { return String(Number(tile && tile.col) || 0) + ':' + String(Number(tile && tile.row) || 0); }
    _tileLabel(tile) { return 'C' + tile.col + ' R' + tile.row; }
    _manhattan(a, b) { return Math.abs((a && a.col) - (b && b.col)) + Math.abs((a && a.row) - (b && b.row)); }
    _formatHosts(value) { const n = Number(value); return Number.isFinite(n) && n.toLocaleString ? n.toLocaleString('en-US') : String(value || 0); }

    _fillChamferRect(ctx, x, y, w, h, cut, fillStyle) {
        if (fillStyle) ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
        ctx.fill();
    }

    _strokeChamferRect(ctx, x, y, w, h, cut, strokeStyle, lineWidth) {
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
        ctx.strokeStyle = strokeStyle || '#FFFFFF';
        ctx.lineWidth = lineWidth || 1;
        ctx.stroke();
    }

    _pointInRect(x, y, r) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
    _reasonLabel(reason) {
        const labels = { disconnected: 'route incomplete', virus: 'virus contact', overlap: 'path overlap', too_small: 'hosts too small', too_big: 'hosts too large', not_optimized: 'CIDR not optimized' };
        return labels[reason] || 'not optimized';
    }
    _titleFont() { return IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace'; }
    _randomInt(min, max) { const lo = Math.ceil(Number(min) || 0); const hi = Math.floor(Number(max) || 0); if (hi <= lo) return lo; return lo + Math.floor(Math.random() * (hi - lo + 1)); }
    _playCursor() { try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) {} }
    _playConfirm() { try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) {} }
    _playCancel() { try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) {} }
}

const CIDRQuarantineMatrixGameplayManager = {
    VERSION: 'ip-cidr-quarantine-matrix-manager-20260530-01',
    _active: false,
    _activeAttempt: null,
    _introShown: false,
    _registeredQuestIds: {},
    _triggerLocks: {},
    _recoveryLoops: {},
    RECOVERY_LIMIT: 3,

    CIDR_MATRIX_QUESTS: [
        { id: 'stage.12.cidr_matrix.01.tutorial', objectiveId: 'solve_cidr_matrix_01', title: 'CALIBRATE MATRIX NODE', label: 'Matrix Node 01', tutorial: true, targetTile: { x: 7, y: 0, z: 7 }, profile: { index: 1, zoneCount: 2, parentPrefix: 23 } },
        { id: 'stage.12.cidr_matrix.02', objectiveId: 'solve_cidr_matrix_02', title: 'SPLIT AI QUARANTINE', label: 'Matrix Node 02', targetTile: { x: 20, y: 0, z: 8 }, profile: { index: 2, zoneCount: 2, parentPrefix: 23 } },
        { id: 'stage.12.cidr_matrix.03', objectiveId: 'solve_cidr_matrix_03', title: 'SEAL SHARD TRIAD', label: 'Matrix Node 03', targetTile: { x: 27, y: 0, z: 17 }, profile: { index: 3, zoneCount: 3, parentPrefix: 23 } },
        { id: 'stage.12.cidr_matrix.04', objectiveId: 'solve_cidr_matrix_04', title: 'LOCK RELAY MATRIX', label: 'Matrix Node 04', targetTile: { x: 11, y: 0, z: 25 }, profile: { index: 4, zoneCount: 3, parentPrefix: 22 } },
        { id: 'stage.12.cidr_matrix.05', objectiveId: 'solve_cidr_matrix_05', title: 'FINALIZE AI CONTAINMENT', label: 'Matrix Node 05', targetTile: { x: 24, y: 0, z: 29 }, profile: { index: 5, zoneCount: 3, parentPrefix: 22 } },
    ],

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_cidr_quarantine_matrix');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return this.CIDR_MATRIX_QUESTS;
    },

    _defaultQuestSpec() {
        const specs = this._questSpecs();
        return specs[0] || this.CIDR_MATRIX_QUESTS[0];
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !stage || Number(stage.id) !== 12) return [];
        const questIds = [];
        const specs = this._questSpecs();
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            questIds.push(spec.id);
            if (this._registeredQuestIds[spec.id] && qm.quests && qm.quests[spec.id]) continue;
            const target = Object.assign({}, spec.targetTile);
            qm.registerQuest({
                id: spec.id,
                title: 'QUEST AREA',
                stageMapId: 12,
                resetOnMapEnter: true,
                objectives: [{
                    id: spec.objectiveId,
                    title: spec.title,
                    detail: 'TARGET TILE  X:' + target.x + '  Y:' + (target.y || 0) + '  Z:' + target.z,
                    targetTile: target,
                    completionRadiusTiles: 0.55,
                    isComplete: (context, activeQuestManager) => CIDRQuarantineMatrixGameplayManager._handleObjective(spec, context, activeQuestManager),
                }],
            });
            this._registeredQuestIds[spec.id] = true;
        }
        return questIds;
    },

    _resolveAttemptKey(options) {
        const opts = options || {};
        const spec = opts.spec || {};
        return (opts.questId || spec.id || 'quest') + ':' + (opts.objectiveId || spec.objectiveId || 'objective');
    },

    _refreshTriggerLock(spec, distance, radius) {
        if (!spec || !spec.objectiveId || !this._triggerLocks[spec.objectiveId]) return;
        if (distance === null || distance > radius + 0.35) delete this._triggerLocks[spec.objectiveId];
    },

    _lockUntilStepOff(spec) {
        if (spec && spec.objectiveId) this._triggerLocks[spec.objectiveId] = true;
    },

    _handleObjective(spec, context, questManager) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;
        const objective = qm.currentObjective();
        if (!objective || objective.id !== spec.objectiveId) return false;
        const dist = qm.distanceToObjective(objective, context && context.hero);
        const radius = typeof objective.completionRadiusTiles === 'number' ? objective.completionRadiusTiles : 0.55;
        this._refreshTriggerLock(spec, dist, radius);
        if (dist === null || dist > radius || this._triggerLocks[spec.objectiveId]) return false;
        const attemptKey = this._resolveAttemptKey({ spec, questId: spec.id, objectiveId: spec.objectiveId });
        if (this._activeAttempt === attemptKey || this._active) return false;
        this._activeAttempt = attemptKey;
        const launchOptions = { spec, questId: spec.id, objectiveId: spec.objectiveId, mapId: 12, _fromObjective: true };
        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_cidr_quarantine_matrix', Object.assign({}, launchOptions, { showIntro: !!spec.tutorial && !this._introShown, _reservedAttempt: attemptKey }));
            return false;
        }
        this.launchCIDRQuarantineMatrixGameplay(Object.assign({}, launchOptions, { showIntro: !!spec.tutorial && !this._introShown }));
        return false;
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
        Screen2.show({ mode: opts.mode || 'replace', status: opts.status || 'Loading Gameplay', detail: opts.detail || 'Synchronizing transition', onComplete: typeof opts.onComplete === 'function' ? opts.onComplete : null });
        return true;
    },

    launchCIDRQuarantineMatrixGameplay(options) {
        const opts = options || {};
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;
        const problem = this._freshProblem(opts.spec || this._defaultQuestSpec());
        const open = () => {
            const screen = new IP2LiveCIDRQuarantineMatrixConnectorScreen({
                spec: opts.spec,
                questId: opts.questId,
                objectiveId: opts.objectiveId,
                mapId: opts.mapId || 12,
                maxAttempts: 3,
                problem,
                tutorialMode: !!(opts.spec && opts.spec.tutorial),
                onComplete: (result) => this._onComplete(opts, result),
                onFailed: (result) => this._onFailed(opts, result),
                onCancel: () => this._onCancel(opts),
            });
            const openGameplay = () => {
                this._playMusicZone('GAMEPLAY_1');
                const stack = Manager && Manager.Stack ? Manager.Stack : null;
                if (stack) {
                    if (opts.mode === 'push' && typeof stack.push === 'function') stack.push(screen);
                    else if (typeof stack.replace === 'function') stack.replace(screen);
                    else if (typeof stack.push === 'function') stack.push(screen);
                }
                if (opts.showIntro) this._introShown = true;
            };
            if (opts.useLoading === true && this._showLoadingScreen2({ mode: 'push', status: 'Loading Gameplay', detail: 'Opening CIDR Quarantine Matrix', onComplete: openGameplay })) return;
            openGameplay();
        };
        const openSafely = () => { try { open(); } catch (e) { this._active = false; this._activeAttempt = null; console.warn('[IP2Live] CIDRQuarantineMatrixGameplayManager failed to open gameplay:', e); } };
        openSafely();
        return true;
    },

    _freshProblem(spec) {
        const temp = new IP2LiveCIDRQuarantineMatrixConnectorScreen({ spec });
        return temp.problem;
    },

    _onComplete(options, result) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        if (spec && spec.objectiveId) delete this._triggerLocks[spec.objectiveId];
        this._recoveryLoops[spec.id] = 0;
        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            // Always advance the quest so the next objective marker appears on the map.
            if (opts.questId && opts.objectiveId && IP2Live.QuestManager) {
                const qm = IP2Live.QuestManager;
                // If the quest is not yet active (e.g. first time after tutorial launch), start it first.
                if (qm.activeQuestId !== opts.questId) {
                    qm.startQuest(opts.questId, {
                        mapId: 12,
                        mapQuestMode: true,
                        keepLastCompletion: true,
                        visible: true,
                        preview: false,
                        guideActive: true,
                        allowCompletion: true,
                    });
                }
                qm.completeObjective(opts.objectiveId);
            }
            if (typeof opts.onComplete === 'function') opts.onComplete(result);
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
                IP2Live.GameManager.handleGameplayCompleted('ip_cidr_quarantine_matrix', { gameplayId: 'ip_cidr_quarantine_matrix', spec, questId: opts.questId, objectiveId: opts.objectiveId, mapId: 12, result });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        finalizeExit();
    },

    _onFailed(options, result) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_cidr_quarantine_matrix', { gameplayId: 'ip_cidr_quarantine_matrix', spec, questId: opts.questId, objectiveId: opts.objectiveId, mapId: 12, result });
            } else {
                this.recoverAfterFailure(spec);
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        finalizeExit();
    },

    recoverAfterFailure(spec) {
        const failed = spec || this._defaultQuestSpec();
        const key = failed && failed.id ? failed.id : 'unknown';
        this._recoveryLoops[key] = (this._recoveryLoops[key] || 0) + 1;
        if (this._recoveryLoops[key] > this.RECOVERY_LIMIT) {
            this._rollbackToPreviousLevel();
            return true;
        }
        this._recoverToTutorial(failed);
        return true;
    },

    _recoverToTutorial(failedSpec) {
        const qm = IP2Live.QuestManager;
        const tutorial = this._defaultQuestSpec();
        this._introShown = false;
        if (qm && tutorial) {
            qm.completedObjectives[tutorial.id] = {};
            if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
            qm.startQuest(tutorial.id, { mapId: 12, mapQuestMode: true, keepLastCompletion: true, visible: true, preview: false, guideActive: true, allowCompletion: true });
        }
        if (IP2Live.IPCIDRQuarantineMatrixTutorial && typeof IP2Live.IPCIDRQuarantineMatrixTutorial.showRecovery === 'function') {
            setTimeout(() => IP2Live.IPCIDRQuarantineMatrixTutorial.showRecovery({ failedLabel: failedSpec && failedSpec.label }), 220);
        }
    },

    _rollbackToPreviousLevel() {
        const goBack = () => {
            if (IP2Live.MapManager && typeof IP2Live.MapManager.goTo === 'function') {
                IP2Live.MapManager.goTo(11, { status: 'Loading Previous Level', detail: 'Stage 3 Level 1' });
            }
        };
        if (IP2Live.IPCIDRQuarantineMatrixTutorial && typeof IP2Live.IPCIDRQuarantineMatrixTutorial.showRollback === 'function') {
            setTimeout(() => IP2Live.IPCIDRQuarantineMatrixTutorial.showRollback(goBack), 220);
        } else {
            goBack();
        }
    },

    _onCancel(options) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        this._restoreStageMusic();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },
};

IP2Live.CIDRQuarantineMatrixGameplayManager = CIDRQuarantineMatrixGameplayManager;
IP2Live.CIDRQuarantineMatrixGameplayScreen = IP2LiveCIDRQuarantineMatrixConnectorScreen;
window.IP2LiveCIDRQuarantineMatrixGameplayManager = CIDRQuarantineMatrixGameplayManager;
window.IP2LiveCIDRQuarantineMatrixGameplayScreen = IP2LiveCIDRQuarantineMatrixConnectorScreen;
window.startCIDRQuarantineMatrixGameplaySix = function (options) {
    return CIDRQuarantineMatrixGameplayManager.launchCIDRQuarantineMatrixGameplay(options || {});
};

console.log('[IP2Live] ip_cidr_quarantine_matrix_gameplay.js module loaded.');
