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
            const screen = new IP2LiveCIDRQuarantineMatrixGameplayScreen({
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
        const temp = new IP2LiveCIDRQuarantineMatrixGameplayScreen({ spec });
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
IP2Live.CIDRQuarantineMatrixGameplayScreen = IP2LiveCIDRQuarantineMatrixGameplayScreen;
window.IP2LiveCIDRQuarantineMatrixGameplayManager = CIDRQuarantineMatrixGameplayManager;
window.IP2LiveCIDRQuarantineMatrixGameplayScreen = IP2LiveCIDRQuarantineMatrixGameplayScreen;
window.startCIDRQuarantineMatrixGameplaySix = function (options) {
    return CIDRQuarantineMatrixGameplayManager.launchCIDRQuarantineMatrixGameplay(options || {});
};

console.log('[IP2Live] ip_cidr_quarantine_matrix_gameplay.js module loaded.');
