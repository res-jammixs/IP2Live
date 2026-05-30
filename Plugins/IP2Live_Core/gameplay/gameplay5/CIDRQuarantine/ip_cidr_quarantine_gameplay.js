/**
 * IP2Live - Gameplay Five: CIDR Quarantine
 * Stage 3 Level 1 visual CIDR containment puzzle.
 */

class IP2LiveCIDRQuarantineGameplayScreen extends Scene.Base {
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
        this.selectedPrefix = Math.min(30, Math.max(24, Number(this.problem.defaultPrefix || this.problem.solution.prefix + 1) || 28));
        this.selectedOffset = Number(this.problem.defaultOffset || 0) || 0;
        this.buttonRects = [];
        this.submitRect = null;
        this.lastDiagnostic = null;
        this.tutorialMode = !!this.options.tutorialMode;
        this.tutorialStep = this.tutorialMode ? 1 : 0;
        this.tutorialPromptActive = false;
        this.tutorialStarted = false;
    }

    _generateProblem(spec) {
        const tools = this.tools || IP2Live.CIDRTools;
        const profile = spec && spec.profile ? spec.profile : {};
        const questIndex = Number(profile.index || 1) || 1;
        const minHosts = Number(profile.minHosts || (18 + questIndex * 8)) || 18;
        const maxHosts = Math.min(126, Number(profile.maxHosts || (38 + questIndex * 16)) || 38);
        const hostDemand = tools.randomInt(minHosts, maxHosts);
        const solutionPrefix = tools.smallestPrefixForHosts(hostDemand, 25);
        const blockSize = tools.blockSize(solutionPrefix);
        const baseSecond = tools.randomInt(40, 210);
        const baseThird = (questIndex * 37 + tools.randomInt(0, 28)) % 250;
        const baseIp = tools.ipToInt('10.' + baseSecond + '.' + baseThird + '.0');
        const maxBlock = Math.max(0, Math.floor(256 / blockSize) - 1);
        const solutionBlock = tools.randomInt(0, maxBlock);
        const solutionOffset = solutionBlock * blockSize;
        const solutionStart = (baseIp + solutionOffset) >>> 0;
        const solutionRange = tools.rangeFor(solutionStart, solutionPrefix);
        const rogueStart = solutionStart + tools.randomInt(1, Math.max(1, Math.floor(blockSize * 0.32)));
        const rogueEnd = Math.min(solutionRange.end - 1, rogueStart + Math.max(3, Math.min(hostDemand, Math.floor(blockSize * 0.42))));
        const protectedNodes = [];
        const adjacentOffsets = [];
        if (solutionOffset - blockSize >= 0) adjacentOffsets.push(solutionOffset - blockSize);
        if (solutionOffset + blockSize < 256) adjacentOffsets.push(solutionOffset + blockSize);
        const safeBaseOffset = adjacentOffsets.length ? tools.choose(adjacentOffsets) : ((solutionOffset + blockSize) % 256);
        protectedNodes.push((baseIp + safeBaseOffset + Math.min(blockSize - 2, tools.randomInt(2, Math.max(2, blockSize - 3)))) >>> 0);
        let extraSafe = (baseIp + tools.randomInt(1, 254)) >>> 0;
        for (let tries = 0; tries < 40; tries++) {
            if (!tools.contains(solutionRange, extraSafe)) break;
            extraSafe = (baseIp + tools.randomInt(1, 254)) >>> 0;
        }
        if (!tools.contains(solutionRange, extraSafe)) protectedNodes.push(extraSafe);
        const id = [
            tools.intToIp(baseIp),
            hostDemand,
            solutionOffset,
            solutionPrefix,
            Date.now(),
            Math.floor(Math.random() * 9999),
        ].join(':');
        return {
            id,
            baseIp,
            baseCIDR: tools.formatCIDR(baseIp, 24),
            parentPrefix: 24,
            hostDemand,
            rogueRange: { start: rogueStart >>> 0, end: rogueEnd >>> 0 },
            protectedNodes,
            solution: { start: solutionStart, offset: solutionOffset, prefix: solutionPrefix },
            defaultOffset: Math.max(0, Math.min(255, solutionOffset + (tools.choose([-blockSize, blockSize, 2]) || 0))),
            defaultPrefix: Math.min(30, solutionPrefix + 1),
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
        const helper = IP2Live.IPCIDRQuarantineTutorial;
        if (!helper || typeof helper.showIntro !== 'function') {
            this._showTutorialStep(1);
            return;
        }
        this.tutorialPromptActive = true;
        const started = helper.showIntro(this._tutorialContext(), () => {
            this.tutorialPromptActive = false;
            this._showTutorialStep(1);
        });
        if (!started) {
            this.tutorialPromptActive = false;
            this._showTutorialStep(1);
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
        if (upper === 'ARROWRIGHT' || upper === 'D') this._adjustOffset(this._stepSize());
        if (upper === 'ARROWLEFT' || upper === 'A') this._adjustOffset(-this._stepSize());
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
        for (let i = 0; i < this.buttonRects.length; i++) {
            const b = this.buttonRects[i];
            if (this._pointInRect(x, y, b)) {
                if (b.action === 'prefixDown') this._adjustPrefix(-1);
                if (b.action === 'prefixUp') this._adjustPrefix(1);
                if (b.action === 'offsetLeft') this._adjustOffset(-this._stepSize());
                if (b.action === 'offsetRight') this._adjustOffset(this._stepSize());
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
            const cellW = grid.w / 16;
            const cellH = grid.h / 16;
            const col = Math.max(0, Math.min(15, Math.floor((x - grid.x) / cellW)));
            const row = Math.max(0, Math.min(15, Math.floor((y - grid.y) / cellH)));
            const clickedOffset = row * 16 + col;
            const size = this.tools.blockSize(this.selectedPrefix);
            this.selectedOffset = Math.floor(clickedOffset / size) * size;
            this._playCursor();
            this._afterTutorialAction('offset');
        }
        return true;
    }

    _adjustPrefix(delta) {
        this.selectedPrefix = Math.max(24, Math.min(30, this.selectedPrefix + delta));
        const size = this._stepSize();
        this.selectedOffset = Math.max(0, Math.min(255, Math.floor(this.selectedOffset / size) * size));
        this._afterTutorialAction('prefix');
    }

    _adjustOffset(delta) {
        const size = this._stepSize();
        const maxOffset = Math.max(0, 256 - size);
        this.selectedOffset = Math.max(0, Math.min(maxOffset, this.selectedOffset + delta));
        this.selectedOffset = Math.floor(this.selectedOffset / size) * size;
        this._afterTutorialAction('offset');
    }

    _stepSize() {
        return Math.max(1, this.tools.blockSize(this.selectedPrefix));
    }

    _tutorialContext() {
        const tools = this.tools;
        return {
            baseCIDR: this.problem.baseCIDR,
            hostDemand: this.problem.hostDemand,
            solutionPrefix: this.problem.solution.prefix,
            solutionCIDR: tools.formatCIDR(this.problem.solution.start, this.problem.solution.prefix),
        };
    }

    _showTutorialStep(step) {
        if (!this.tutorialMode || this.tutorialPromptActive) return false;
        const helper = IP2Live.IPCIDRQuarantineTutorial;
        if (!helper || typeof helper.showStep !== 'function') return false;
        this.tutorialStep = step;
        this.tutorialPromptActive = true;
        const started = helper.showStep(step, this._tutorialContext(), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _showTutorialFeedback(reason) {
        if (!this.tutorialMode || this.tutorialPromptActive) return false;
        const helper = IP2Live.IPCIDRQuarantineTutorial;
        if (!helper || typeof helper.showFeedback !== 'function') return false;
        this.tutorialPromptActive = true;
        const started = helper.showFeedback(reason, this._tutorialContext(), () => {
            this.tutorialPromptActive = false;
        });
        if (!started) this.tutorialPromptActive = false;
        return started;
    }

    _afterTutorialAction(action) {
        if (!this.tutorialMode || this.tutorialPromptActive || this.finished) return;
        if (this.tutorialStep === 1) {
            if (action === 'prefix') {
                if (this.selectedPrefix === this.problem.solution.prefix) this._showTutorialStep(2);
                else if (this.selectedPrefix < this.problem.solution.prefix) this._showTutorialFeedback('prefixTooSmall');
                else this._showTutorialFeedback('prefixTooLarge');
                return;
            }
            if (action === 'offset') {
                this._showTutorialFeedback('prefixFirst');
                return;
            }
        }
        if (this.tutorialStep === 2) {
            if (action === 'prefix') {
                this.tutorialStep = 1;
                this._showTutorialFeedback(this.selectedPrefix < this.problem.solution.prefix ? 'prefixTooSmall' : 'prefixTooLarge');
                return;
            }
            if (action === 'offset') {
                if (this.selectedPrefix !== this.problem.solution.prefix) {
                    this.tutorialStep = 1;
                    this._showTutorialFeedback(this.selectedPrefix < this.problem.solution.prefix ? 'prefixTooSmall' : 'prefixTooLarge');
                    return;
                }
                if (this.selectedOffset === this.problem.solution.offset) this._showTutorialStep(3);
                else this._showTutorialFeedback('offset');
                return;
            }
        }
        if (this.tutorialStep === 3 && (action === 'prefix' || action === 'offset')) {
            this._showTutorialFeedback('submitReady');
        }
    }

    _submit() {
        if (this.phase !== 'build') return;
        if (this.tutorialMode && this.tutorialStep < 3) {
            this._showTutorialFeedback('submitEarly');
            return;
        }
        const result = this._evaluateSelection();
        if (result.ok) {
            if (this.tutorialMode && IP2Live.IPCIDRQuarantineTutorial && typeof IP2Live.IPCIDRQuarantineTutorial.showComplete === 'function') {
                this.phase = 'tutorial_complete';
                IP2Live.IPCIDRQuarantineTutorial.showComplete(() => this._finishSuccess(result));
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
        this.lastDiagnostic = result;
        this._playCancel();
        this._showDiagnostic(result);
    }

    _evaluateSelection() {
        const tools = this.tools;
        const start = (this.problem.baseIp + this.selectedOffset) >>> 0;
        const range = tools.rangeFor(start, this.selectedPrefix);
        const solution = tools.rangeFor(this.problem.solution.start, this.problem.solution.prefix);
        const rogue = this.problem.rogueRange;
        const protectedHits = this.problem.protectedNodes.filter((ip) => tools.contains(range, ip));

        if (!tools.isAligned(start, this.selectedPrefix, this.problem.baseIp)) {
            return this._diagnostic('boundary', ['SIMULATION FAILED.', 'Quarantine start is not aligned for /' + this.selectedPrefix + '.', 'Move the zone to a valid CIDR boundary before submitting.']);
        }
        if (tools.usableHosts(this.selectedPrefix) < this.problem.hostDemand) {
            return this._diagnostic('capacity', ['SIMULATION FAILED.', 'Allocated host capacity is too small for the rogue AI load.', 'Widen the block until usable hosts meet the demand, then recheck protected nodes.']);
        }
        if (!tools.contains(range, rogue.start) || !tools.contains(range, rogue.end)) {
            return this._diagnostic('miss', ['SIMULATION FAILED.', 'Rogue telemetry falls outside your quarantine zone.', 'Slide the block until the full infected span is inside the highlighted range.']);
        }
        if (protectedHits.length > 0) {
            return this._diagnostic('protected', ['SIMULATION FAILED.', 'Protected infrastructure was caught in the quarantine field.', 'Use a tighter aligned block or shift away from safe nodes.']);
        }
        if (range.start !== solution.start || range.prefix !== solution.prefix) {
            return this._diagnostic('minimal', ['SIMULATION FAILED.', 'Containment works, but the CIDR cage is not the minimal stable zone.', 'Reduce excess address space without losing the rogue AI span.']);
        }
        return {
            ok: true,
            selectedCIDR: tools.formatCIDR(range.start, range.prefix),
            solutionCIDR: tools.formatCIDR(solution.start, solution.prefix),
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
            IP2Live.GameManager.handleGameplayMistake('ip_cidr_quarantine', {
                mapId: this.options.mapId || 11,
                questId: this.options.questId,
                objectiveId: this.options.objectiveId,
                mistakes: [{ reason: result.reason, problemId: this.problem.id }],
                attemptsRemaining: remaining,
                onComplete: function () {},
            });
        }
        if (IP2Live.ARDiagnosticRewind && typeof IP2Live.ARDiagnosticRewind.show === 'function') {
            IP2Live.ARDiagnosticRewind.show({
                title: 'AR DIAGNOSTIC REWIND',
                lines,
                onComplete: after,
            });
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
                gameplayId: 'ip_cidr_quarantine',
                passed: true,
                attemptsUsed: this.attemptsUsed + 1,
                maxAttempts: this.maxAttempts,
                retries: this.attemptsUsed,
                problemId: this.problem.id,
                baseCIDR: this.problem.baseCIDR,
                hostDemand: this.problem.hostDemand,
                selectedCIDR: result.selectedCIDR,
                solutionCIDR: result.solutionCIDR,
            });
        }
    }

    _failOut(result) {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed({
                gameplayId: 'ip_cidr_quarantine',
                passed: false,
                reason: 'attempts_exhausted',
                attemptsUsed: this.attemptsUsed,
                maxAttempts: this.maxAttempts,
                retries: this.attemptsUsed,
                problemId: this.problem.id,
                diagnosticReason: result && result.reason,
                baseCIDR: this.problem.baseCIDR,
                hostDemand: this.problem.hostDemand,
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
        this._drawControls(ctx, m);
        this._drawStatus(ctx, m);
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
        return {
            cW, cH, sX, sY,
            panelX: 54 * sX,
            panelY: 48 * sY,
            panelW: cW - 108 * sX,
            panelH: cH - 96 * sY,
        };
    }

    _buildInteractionRects(m) {
        this.buttonRects = [];
        const y = m.panelY + m.panelH - 92 * m.sY;
        const bw = 70 * m.sX;
        const bh = 42 * m.sY;
        const cx = m.panelX + m.panelW * 0.53;
        const add = (action, x, label) => this.buttonRects.push({ action, x, y, w: bw, h: bh, label });
        add('offsetLeft', cx - 240 * m.sX, '<');
        add('offsetRight', cx - 158 * m.sX, '>');
        add('prefixDown', cx + 40 * m.sX, '/+');
        add('prefixUp', cx + 122 * m.sX, '/-');
        this.submitRect = { x: m.panelX + m.panelW - 220 * m.sX, y, w: 170 * m.sX, h: bh };
        const size = Math.min(m.panelH * 0.68, m.panelW * 0.48);
        this._gridRect = {
            x: m.panelX + 42 * m.sX,
            y: m.panelY + 106 * m.sY,
            w: size,
            h: size,
        };
    }

    _drawBackdrop(ctx, m) {
        const g = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        g.addColorStop(0, '#050A10');
        g.addColorStop(0.48, '#10202A');
        g.addColorStop(1, '#080D14');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.globalAlpha = 0.16;
        ctx.strokeStyle = '#00F0FF';
        for (let x = -60 * m.sX + ((this.animTick * 0.8) % (60 * m.sX)); x < m.cW; x += 60 * m.sX) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 180 * m.sX, m.cH);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    _drawPanel(ctx, m) {
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX, 'rgba(4,12,22,0.94)');
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX, '#00F0FF', 2 * m.sX);
        ctx.fillStyle = '#FF003C';
        this._fillChamferRect(ctx, m.panelX, m.panelY + 10 * m.sY, m.panelW * 0.48, 50 * m.sY, 8 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(20 * m.sY) + 'px ' + this._titleFont();
        ctx.textAlign = 'left';
        ctx.fillText('CIDR QUARANTINE :: SINGLE ZONE', m.panelX + 24 * m.sX, m.panelY + 44 * m.sY);
        ctx.font = 'bold ' + Math.round(12 * m.sY) + 'px monospace';
        ctx.fillStyle = '#BDEEFF';
        ctx.fillText('RELAY ' + this.problem.baseCIDR + '   HOST DEMAND ' + this.problem.hostDemand, m.panelX + m.panelW * 0.55, m.panelY + 42 * m.sY);
    }

    _drawGrid(ctx, m) {
        const tools = this.tools;
        const g = this._gridRect;
        const cell = g.w / 16;
        const selected = tools.rangeFor((this.problem.baseIp + this.selectedOffset) >>> 0, this.selectedPrefix);
        const rogue = this.problem.rogueRange;
        ctx.fillStyle = 'rgba(10,24,36,0.96)';
        ctx.fillRect(g.x, g.y, g.w, g.h);
        for (let i = 0; i < 256; i++) {
            const x = g.x + (i % 16) * cell;
            const y = g.y + Math.floor(i / 16) * cell;
            const ip = (this.problem.baseIp + i) >>> 0;
            let fill = 'rgba(32,52,68,0.92)';
            if (ip >= selected.start && ip <= selected.end) fill = 'rgba(255,216,74,0.72)';
            if (ip >= rogue.start && ip <= rogue.end) fill = 'rgba(255,0,60,0.9)';
            for (let p = 0; p < this.problem.protectedNodes.length; p++) {
                if (ip === this.problem.protectedNodes[p]) fill = 'rgba(0,240,255,0.95)';
            }
            ctx.fillStyle = fill;
            ctx.fillRect(x + 1 * m.sX, y + 1 * m.sY, cell - 2 * m.sX, cell - 2 * m.sY);
        }
        ctx.strokeStyle = '#DAEEFF';
        ctx.lineWidth = 2 * m.sX;
        ctx.strokeRect(g.x, g.y, g.w, g.h);
    }

    _drawControls(ctx, m) {
        const tools = this.tools;
        const start = (this.problem.baseIp + this.selectedOffset) >>> 0;
        const cidr = tools.formatCIDR(start, this.selectedPrefix);
        const infoX = m.panelX + m.panelW * 0.56;
        const infoY = m.panelY + 138 * m.sY;
        ctx.font = 'bold ' + Math.round(16 * m.sY) + 'px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText('SELECTED ZONE', infoX, infoY);
        ctx.font = 'bold ' + Math.round(28 * m.sY) + 'px monospace';
        ctx.fillStyle = '#FFE600';
        ctx.fillText(cidr, infoX, infoY + 42 * m.sY);
        ctx.font = Math.round(13 * m.sY) + 'px monospace';
        ctx.fillStyle = '#BDEEFF';
        ctx.fillText('Usable hosts: ' + tools.usableHosts(this.selectedPrefix), infoX, infoY + 78 * m.sY);
        ctx.fillText('Rogue span: ' + tools.intToIp(this.problem.rogueRange.start) + ' - ' + tools.intToIp(this.problem.rogueRange.end), infoX, infoY + 108 * m.sY);
        ctx.fillText('Protected nodes are cyan. Rogue telemetry is red.', infoX, infoY + 138 * m.sY);

        for (let i = 0; i < this.buttonRects.length; i++) this._drawButton(ctx, this.buttonRects[i], m, this.buttonRects[i].label);
        this._drawButton(ctx, this.submitRect, m, 'SUBMIT');
        ctx.font = 'bold ' + Math.round(11 * m.sY) + 'px monospace';
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'center';
        ctx.fillText('OFFSET', this.buttonRects[0].x + 76 * m.sX, this.buttonRects[0].y - 12 * m.sY);
        ctx.fillText('PREFIX', this.buttonRects[2].x + 76 * m.sX, this.buttonRects[2].y - 12 * m.sY);
    }

    _drawStatus(ctx, m) {
        ctx.font = 'bold ' + Math.round(12 * m.sY) + 'px monospace';
        ctx.fillStyle = '#8FF8FF';
        ctx.textAlign = 'left';
        ctx.fillText('TRIES ' + this.attemptsUsed + '/' + this.maxAttempts + '   Move: Arrow/A-D   Prefix: W/S', m.panelX + 30 * m.sX, m.panelY + m.panelH - 28 * m.sY);
    }

    _drawButton(ctx, b, m, label) {
        if (!b) return;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, '#19354A');
        g.addColorStop(1, '#0B1A28');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX, '#70E9FF', 1.5 * m.sX);
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

const CIDRQuarantineGameplayManager = {
    VERSION: 'ip-cidr-quarantine-manager-20260530-01',
    _active: false,
    _activeAttempt: null,
    _introShown: false,
    _registeredQuestIds: {},
    _triggerLocks: {},
    _recoveryLoops: {},

    CIDR_QUARANTINE_QUESTS: [
        { id: 'stage.11.cidr_quarantine.01.tutorial', objectiveId: 'solve_cidr_quarantine_01', title: 'CALIBRATE QUARANTINE NODE', label: 'Quarantine Node 01', tutorial: true, targetTile: { x: 13, y: 0, z: 9 }, profile: { index: 1, minHosts: 18, maxHosts: 34 } },
        { id: 'stage.11.cidr_quarantine.02', objectiveId: 'solve_cidr_quarantine_02', title: 'TRAP ROGUE AI CLUSTER', label: 'Quarantine Node 02', targetTile: { x: 25, y: 0, z: 10 }, profile: { index: 2, minHosts: 26, maxHosts: 58 } },
        { id: 'stage.11.cidr_quarantine.03', objectiveId: 'solve_cidr_quarantine_03', title: 'SEAL INFECTED SEGMENT', label: 'Quarantine Node 03', targetTile: { x: 8, y: 0, z: 21 }, profile: { index: 3, minHosts: 42, maxHosts: 92 } },
        { id: 'stage.11.cidr_quarantine.04', objectiveId: 'solve_cidr_quarantine_04', title: 'LOCK APEX RELAY AI', label: 'Quarantine Node 04', targetTile: { x: 23, y: 0, z: 27 }, profile: { index: 4, minHosts: 70, maxHosts: 120 } },
    ],

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_cidr_quarantine');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return this.CIDR_QUARANTINE_QUESTS;
    },

    _defaultQuestSpec() {
        const specs = this._questSpecs();
        return specs[0] || this.CIDR_QUARANTINE_QUESTS[0];
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !stage || Number(stage.id) !== 11) return [];
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
                stageMapId: 11,
                resetOnMapEnter: true,
                objectives: [{
                    id: spec.objectiveId,
                    title: spec.title,
                    detail: 'TARGET TILE  X:' + target.x + '  Y:' + (target.y || 0) + '  Z:' + target.z,
                    targetTile: target,
                    completionRadiusTiles: 0.55,
                    isComplete: (context, activeQuestManager) => CIDRQuarantineGameplayManager._handleObjective(spec, context, activeQuestManager),
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
        const launchOptions = { spec, questId: spec.id, objectiveId: spec.objectiveId, mapId: 11, _fromObjective: true };
        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_cidr_quarantine', Object.assign({}, launchOptions, { showIntro: !!spec.tutorial && !this._introShown, _reservedAttempt: attemptKey }));
            return false;
        }
        this.launchCIDRQuarantineGameplay(Object.assign({}, launchOptions, { showIntro: !!spec.tutorial && !this._introShown }));
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

    launchCIDRQuarantineGameplay(options) {
        const opts = options || {};
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;
        const problem = this._freshProblem(opts.spec || this._defaultQuestSpec());
        const open = () => {
            const screen = new IP2LiveCIDRQuarantineGameplayScreen({
                spec: opts.spec,
                questId: opts.questId,
                objectiveId: opts.objectiveId,
                mapId: opts.mapId || 11,
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
            if (opts.useLoading === true && this._showLoadingScreen2({ mode: 'push', status: 'Loading Gameplay', detail: 'Opening CIDR Quarantine', onComplete: openGameplay })) return;
            openGameplay();
        };
        const openSafely = () => { try { open(); } catch (e) { this._active = false; this._activeAttempt = null; console.warn('[IP2Live] CIDRQuarantineGameplayManager failed to open gameplay:', e); } };
        openSafely();
        return true;
    },

    _freshProblem(spec) {
        const temp = new IP2LiveCIDRQuarantineGameplayScreen({ spec });
        return temp.problem;
    },

    _onComplete(options, result) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        if (spec && spec.objectiveId) delete this._triggerLocks[spec.objectiveId];
        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            // Always advance the quest so the next objective marker appears on the map.
            if (opts.questId && opts.objectiveId && IP2Live.QuestManager) {
                const qm = IP2Live.QuestManager;
                // If the quest is not yet active (e.g. first time after tutorial launch), start it first.
                if (qm.activeQuestId !== opts.questId) {
                    qm.startQuest(opts.questId, {
                        mapId: 11,
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
                IP2Live.GameManager.handleGameplayCompleted('ip_cidr_quarantine', { gameplayId: 'ip_cidr_quarantine', spec, questId: opts.questId, objectiveId: opts.objectiveId, mapId: 11, result });
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
                IP2Live.GameManager.handleGameplayFailed('ip_cidr_quarantine', { gameplayId: 'ip_cidr_quarantine', spec, questId: opts.questId, objectiveId: opts.objectiveId, mapId: 11, result });
            } else {
                this._recoverToTutorial(spec);
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        finalizeExit();
    },

    recoverAfterFailure(spec) {
        this._recoverToTutorial(spec);
        return true;
    },

    _recoverToTutorial(failedSpec) {
        const qm = IP2Live.QuestManager;
        const tutorial = this._defaultQuestSpec();
        this._introShown = false;
        if (qm && tutorial) {
            qm.completedObjectives[tutorial.id] = {};
            if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
            qm.startQuest(tutorial.id, { mapId: 11, mapQuestMode: true, keepLastCompletion: true, visible: true, preview: false, guideActive: true, allowCompletion: true });
        }
        if (IP2Live.IPCIDRQuarantineTutorial && typeof IP2Live.IPCIDRQuarantineTutorial.showRecovery === 'function') {
            setTimeout(() => IP2Live.IPCIDRQuarantineTutorial.showRecovery({ failedLabel: failedSpec && failedSpec.label }), 220);
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

IP2Live.CIDRQuarantineGameplayManager = CIDRQuarantineGameplayManager;
IP2Live.CIDRQuarantineGameplayScreen = IP2LiveCIDRQuarantineGameplayScreen;
window.IP2LiveCIDRQuarantineGameplayManager = CIDRQuarantineGameplayManager;
window.IP2LiveCIDRQuarantineGameplayScreen = IP2LiveCIDRQuarantineGameplayScreen;
window.startCIDRQuarantineGameplayFive = function (options) {
    return CIDRQuarantineGameplayManager.launchCIDRQuarantineGameplay(options || {});
};

console.log('[IP2Live] ip_cidr_quarantine_gameplay.js module loaded.');
