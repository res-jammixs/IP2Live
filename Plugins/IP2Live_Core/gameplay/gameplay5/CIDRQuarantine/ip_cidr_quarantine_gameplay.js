/**
 * IP2Live - Gameplay Five: CIDR Quarantine
 * Stage 3 Level 1 path connector quarantine puzzle.
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
        const virusConfig = this.options.virusConfig || {};
        this.virusConfig = {
            edgeBuffer: Math.max(0, Number(virusConfig.edgeBuffer) || 0),
            solutionBufferMin: Math.max(0, Number(virusConfig.solutionBufferMin) || 1),
            solutionBufferMax: Math.max(0, Number(virusConfig.solutionBufferMax) || 4),
        };
        this.directionWeights = { R: 1, L: 2, U: 3, D: 4 };
        this.problem = this.options.problem || this._generateProblem(this.options.spec || {});
        this._initVirusSpread();
        this.path = [this._cloneTile(this.problem.start)];
        this.draggingPath = false;
        this.buttonRects = [];
        this.controlRects = {};
        this.confirmRect = null;
        this.lastDiagnostic = null;
        this.statusText = 'Draw a path that adds the optimized CIDR bits.';
        this.statusTone = 'idle';
        this.trace = null;
        this.tutorialMode = !!this.options.tutorialMode;
        this.tutorialStep = this.tutorialMode ? 1 : 0;
        this.tutorialPromptActive = false;
        this.tutorialStarted = false;
    }

    _generateProblem(spec) {
        const profile = spec && spec.profile ? spec.profile : {};
        const questIndex = Number(profile.index || 1) || 1;
        const classInfo = this._randomCIDRClass();
        const challengeMode = questIndex > 1;
        const minAddedBits = challengeMode ? Math.min(classInfo.maxAddedBits, Math.max(classInfo.minAddedBits, 4)) : classInfo.minAddedBits;
        const targetAddedBits = this._randomInt(minAddedBits, classInfo.maxAddedBits);
        const targetCIDR = classInfo.originalCIDR + targetAddedBits;
        const optimizedHostBits = Math.max(0, 32 - targetCIDR);
        const optimizedCapacity = this._capacityForHostBits(optimizedHostBits);
        const requiredHosts = this._randomRequiredHosts(optimizedHostBits);
        const ipAddress = this._randomIPForClass(classInfo.ipClass);
        const ipInt = this.tools && typeof this.tools.ipToInt === 'function' ? this.tools.ipToInt(ipAddress) : null;
        const starts = [
            { col: 1, row: 2 },
            { col: 2, row: 8 },
            { col: 1, row: 6 },
            { col: 3, row: 3 },
        ];
        const start = starts[(questIndex - 1) % starts.length];
        const solutionRoute = this._generateSolutionRoute(start, targetAddedBits, questIndex);
        const solutionMoves = solutionRoute.moves;
        const solutionPath = solutionRoute.path;
        const cursor = this._cloneTile(solutionPath[solutionPath.length - 1]);
        const blockedKeys = {};
        for (let i = 0; i < solutionPath.length; i++) blockedKeys[this._tileKey(solutionPath[i])] = true;
        const edgeBuffer = this._virusEdgeBuffer();
        const solutionBufferKeys = this._buildSolutionBufferKeys(solutionPath);

        const viruses = [];
        if (challengeMode) {
            this._addDefaultPathDecoyViruses(viruses, blockedKeys, start, cursor, solutionPath, solutionBufferKeys, edgeBuffer, questIndex);
        }
        const desiredVirusCount = Math.min(34, 18 + questIndex * 3);
        let seed = (questIndex * 73 + Math.floor(Math.random() * 997)) % 997;
        for (let tries = 0; viruses.length < desiredVirusCount && tries < 900; tries++) {
            seed = (seed * 37 + 19) % 997;
            const tile = { col: seed % 16, row: Math.floor(seed / 16) % 16 };
            const key = this._tileKey(tile);
            if (blockedKeys[key]) continue;
            if (edgeBuffer > 0 && this._isInEdgeBuffer(tile, edgeBuffer)) continue;
            if (solutionBufferKeys[this._tileKey(tile)]) continue;
            if (this._manhattan(tile, start) <= 1 || this._manhattan(tile, cursor) <= 1) continue;
            blockedKeys[key] = true;
            viruses.push(tile);
        }

        return {
            id: ['path-quarantine', questIndex, classInfo.ipClass, targetCIDR, Date.now(), Math.floor(Math.random() * 9999)].join(':'),
            questIndex,
            start: this._cloneTile(start),
            end: this._cloneTile(cursor),
            viruses,
            solutionPath,
            solutionBufferKeys,
            solutionMoves,
            ipAddress,
            ipInt,
            ipClass: classInfo.ipClass,
            originalCIDR: classInfo.originalCIDR,
            requiredHosts,
            targetAddedBits,
            targetCIDR,
            optimizedHostBits,
            optimizedCapacity,
            allocatedCIDR: this._allocatedCIDR(ipInt, targetCIDR),
        };
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        this._updateVirusSpread();
        if (this.trace) this._updateTrace();
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
        if (this.phase !== 'build') return true;
        if (upper === 'ARROWRIGHT' || upper === 'D') this._appendDirection('R');
        if (upper === 'ARROWLEFT' || upper === 'A') this._appendDirection('L');
        if (upper === 'ARROWUP' || upper === 'W') this._appendDirection('U');
        if (upper === 'ARROWDOWN' || upper === 'S') this._appendDirection('D');
        if (upper === 'Z' || upper === 'BACKSPACE') this._undoPath();
        if (upper === 'R') this._clearPath();
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') this._confirmPath();
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
                if (b.action === 'undo') this._undoPath();
                if (b.action === 'clear') this._clearPath();
                if (b.action === 'confirm') this._confirmPath();
                this._playCursor();
                return true;
            }
        }
        const grid = this._gridRect;
        if (grid && this._pointInRect(x, y, grid)) {
            this.draggingPath = true;
            this._handlePathTile(this._tileFromPoint(x, y, grid));
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

    _appendDirection(direction) {
        const next = this._moveTile(this.path[this.path.length - 1], direction);
        this._handlePathTile(next);
    }

    _tutorialContext() {
        const stats = this._pathStats();
        return {
            ipAddress: this.problem.ipAddress,
            ipClass: this.problem.ipClass,
            originalCIDR: this.problem.originalCIDR,
            requiredHosts: this._formatHosts(this.problem.requiredHosts),
            targetCIDR: this.problem.targetCIDR,
            optimizedHostBits: this.problem.optimizedHostBits,
            optimizedCapacity: this._formatHosts(this.problem.optimizedCapacity),
            currentAddedBits: stats.addedBits,
            currentCIDR: stats.currentCIDR,
            currentHostBits: stats.currentHostBits,
            currentCapacity: this._formatHosts(stats.currentCapacity),
            startLabel: this._tileLabel(this.problem.start),
            endLabel: this._tileLabel(this.problem.end),
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
        if (this.tutorialStep === 1 && action === 'path') {
            if (this.path.length > 1) this._showTutorialStep(2);
            return;
        }
        if (this.tutorialStep === 2 && action === 'connect') {
            this._showTutorialStep(3);
            return;
        }
        if (this.tutorialStep === 3 && (action === 'path' || action === 'connect')) {
            this._showTutorialFeedback('submitReady');
        }
    }

    _confirmPath() {
        if (this.phase !== 'build') return;
        if (this.tutorialMode && this.tutorialStep < 3 && !this._pathStats().connected) {
            this._showTutorialFeedback('submitEarly');
            return;
        }
        this.attemptsUsed++;
        const result = this._evaluatePath();
        this.lastDiagnostic = result.ok ? null : result;
        if (result.ok) this._playConfirm();
        else this._playCancel();
        this._startTrace(result);
    }

    _evaluatePath() {
        const stats = this._pathStats();
        const base = this._baseResult(stats);
        if (!stats.connected) {
            return this._diagnostic('disconnected', [
                'SIMULATION FAILED.',
                'The connector never reached the second blue node.',
                'Complete the route before confirming the signal.',
            ], base);
        }
        if (stats.hitVirus) {
            return this._diagnostic('virus', [
                'SIMULATION FAILED.',
                'A rogue AI virus detected the connector path.',
                'Rebuild the route without touching red virus nodes.',
            ], base);
        }
        if (stats.currentCapacity < this.problem.requiredHosts) {
            return this._diagnostic('too_small', [
                'SIMULATION FAILED.',
                'Host capacity is too small for the requested devices.',
                'The virus attacks before the subnet can isolate every host.',
            ], base);
        }
        if (stats.currentCapacity > this.problem.optimizedCapacity) {
            return this._diagnostic('too_big', [
                'SIMULATION FAILED.',
                'Host capacity is larger than the optimized CIDR block.',
                'The rogue AI detects the over-allocated route.',
            ], base);
        }
        if (stats.currentCIDR !== this.problem.targetCIDR) {
            return this._diagnostic('not_optimized', [
                'SIMULATION FAILED.',
                'The route connects, but the CIDR prefix is not optimized.',
                'Adjust the movement bits and try again.',
            ], base);
        }
        return Object.assign(base, { ok: true, passed: true, diagnosticReason: null });
    }

    _diagnostic(reason, lines, base) {
        return Object.assign(base || {}, { ok: false, passed: false, reason, diagnosticReason: reason, lines });
    }

    _showDiagnostic(result) {
        const remaining = Math.max(0, this.maxAttempts - this.attemptsUsed);
        const lines = (result.lines || ['SIMULATION FAILED.']).slice();
        lines.push('Retries remaining: ' + remaining + '/' + this.maxAttempts + '.');
        const after = () => {
            this.phase = 'build';
            this.statusText = 'Path rejected: ' + this._reasonLabel(result.reason) + '. Adjust and confirm again.';
            this.statusTone = 'bad';
        };

        this.phase = 'diagnostic';
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
            IP2Live.GameManager.handleGameplayMistake('ip_cidr_quarantine', {
                mapId: this.options.mapId || 11,
                questId: this.options.questId,
                objectiveId: this.options.objectiveId,
                mistakes: [{
                    reason: result.reason,
                    problemId: this.problem.id,
                    requiredHosts: result.requiredHosts,
                    currentCapacity: result.currentCapacity,
                    optimizedCapacity: result.optimizedCapacity,
                    currentCIDR: result.currentCIDR,
                    targetCIDR: result.targetCIDR,
                }],
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
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete(Object.assign({}, result, {
                gameplayId: 'ip_cidr_quarantine',
                passed: true,
                attemptsUsed: this.attemptsUsed,
                maxAttempts: this.maxAttempts,
                retries: Math.max(0, this.attemptsUsed - 1),
            }));
        }
    }

    _failOut(result) {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed(Object.assign({}, result, {
                gameplayId: 'ip_cidr_quarantine',
                passed: false,
                reason: 'attempts_exhausted',
                attemptsUsed: this.attemptsUsed,
                maxAttempts: this.maxAttempts,
                retries: this.attemptsUsed,
                problemId: this.problem.id,
                diagnosticReason: result && result.reason,
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
        this._drawControls(ctx, m);
        this._drawStatus(ctx, m);
        this._drawVirusAlert(ctx, m);
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
            panelW: 1172 * sX,
            panelH: 624 * sY,
            gridX: 96 * sX,
            gridY: 142 * sY,
            gridSize: 440 * Math.min(sX, sY),
        };
    }

    _buildInteractionRects(m) {
        const baseY = m.panelY + m.panelH - 92 * m.sY;
        this.buttonRects = [
            { action: 'undo', label: 'UNDO', x: m.panelX + 575 * m.sX, y: baseY, w: 116 * m.sX, h: 42 * m.sY },
            { action: 'clear', label: 'CLEAR', x: m.panelX + 713 * m.sX, y: baseY, w: 116 * m.sX, h: 42 * m.sY },
            { action: 'confirm', label: 'CONFIRM PATH', x: m.panelX + 916 * m.sX, y: baseY, w: 214 * m.sX, h: 42 * m.sY },
        ];
        this.controlRects = {};
        for (let i = 0; i < this.buttonRects.length; i++) this.controlRects[this.buttonRects[i].action] = this.buttonRects[i];
        this.confirmRect = this.controlRects.confirm;
        this._gridRect = { x: m.gridX, y: m.gridY, w: m.gridSize, h: m.gridSize };
    }

    _drawBackdrop(ctx, m) {
        ctx.clearRect(0, 0, m.cW, m.cH);
        const g = ctx.createLinearGradient(0, 0, 0, m.cH);
        g.addColorStop(0, '#06131D');
        g.addColorStop(1, '#02070D');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#00D8FF';
        ctx.lineWidth = 1 * m.sX;
        for (let x = -100 * m.sX; x < m.cW + 120 * m.sX; x += 80 * m.sX) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 110 * m.sX, m.cH);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawPanel(ctx, m) {
        ctx.save();
        ctx.fillStyle = 'rgba(2,9,17,0.94)';
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX);
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX, '#00E5FF', 2 * m.sX);
        ctx.fillStyle = '#FF0048';
        this._fillChamferRect(ctx, m.panelX, m.panelY + 10 * m.sY, 562 * m.sX, 50 * m.sY, 12 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(20 * m.sY) + 'px ' + this._titleFont();
        ctx.textAlign = 'left';
        ctx.fillText('CIDR QUARANTINE :: PATH CONNECTOR', m.panelX + 24 * m.sX, m.panelY + 44 * m.sY);
        ctx.restore();
    }

    _drawGrid(ctx, m) {
        const g = this._gridRect;
        const cell = g.w / 16;
        ctx.fillStyle = '#172F40';
        ctx.fillRect(g.x, g.y, g.w, g.h);
        for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 16; col++) {
                const x = g.x + col * cell;
                const y = g.y + row * cell;
                ctx.fillStyle = 'rgba(30,55,73,0.78)';
                ctx.fillRect(x + 1 * m.sX, y + 1 * m.sY, cell - 2 * m.sX, cell - 2 * m.sY);
                ctx.strokeStyle = 'rgba(5,15,25,0.9)';
                ctx.lineWidth = 2 * m.sX;
                ctx.strokeRect(x, y, cell, cell);
                const tile = { col, row };
                if (this._isVirus(tile)) this._drawVirusIcon(ctx, x + cell / 2, y + cell / 2, cell * 0.34, m);
            }
        }
        this._drawPath(ctx, m, this.path, '#FFE600', 0.96, this._traceVisibleMoves());
        this._drawNodeIcon(ctx, this._cellCenter(this.problem.start, g), cell * 0.38, '#00D8FF', m, 'A');
        this._drawNodeIcon(ctx, this._cellCenter(this.problem.end, g), cell * 0.38, '#2F80FF', m, 'B');
        ctx.strokeStyle = '#DAEEFF';
        ctx.lineWidth = 2 * m.sX;
        ctx.strokeRect(g.x, g.y, g.w, g.h);
    }

    _drawControls(ctx, m) {
        const stats = this.trace ? this._traceStats() : this._pathStats();
        const infoX = m.panelX + m.panelW * 0.56;
        const infoY = m.panelY + 118 * m.sY;
        ctx.font = 'bold ' + Math.round(16 * m.sY) + 'px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(this.trace ? 'ANIMATED CIDR CALCULATION' : 'CIDR HOST PREVIEW', infoX, infoY);
        ctx.font = 'bold ' + Math.round(24 * m.sY) + 'px monospace';
        ctx.fillStyle = '#FFE600';
        ctx.fillText('CIDR /' + this.problem.originalCIDR + ' +' + stats.addedBits + ' = /' + stats.currentCIDR, infoX, infoY + 42 * m.sY);
        ctx.font = Math.round(13 * m.sY) + 'px monospace';
        ctx.fillStyle = '#BDEEFF';
        ctx.fillText('Relay: ' + this.problem.ipAddress + '/' + this.problem.originalCIDR + '   Class ' + this.problem.ipClass, infoX, infoY + 76 * m.sY);
        ctx.fillText('Needed hosts: ' + this._formatHosts(this.problem.requiredHosts), infoX, infoY + 100 * m.sY);
        ctx.fillText('Host bits: 32 - ' + stats.currentCIDR + ' = ' + stats.currentHostBits + '   Capacity: 2^' + stats.currentHostBits + ' = ' + this._formatHosts(stats.currentCapacity), infoX, infoY + 124 * m.sY);
        if (this.trace) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(this._traceCalculationLine(), infoX, infoY + 154 * m.sY);
            ctx.fillText(this._traceCIDRLine(stats), infoX, infoY + 184 * m.sY);
            ctx.fillStyle = this.trace.result.ok ? '#79FFB6' : '#FF4D7D';
            ctx.fillText(this.trace.finished ? this._finalTraceLine() : 'Capacity preview: ' + this._formatHosts(stats.currentCapacity) + ' / optimized ' + this._formatHosts(this.problem.optimizedCapacity), infoX, infoY + 214 * m.sY);
        } else {
            ctx.fillStyle = this.statusTone === 'bad' ? '#FF4D7D' : (this.statusTone === 'good' ? '#79FFB6' : '#FFFFFF');
            ctx.fillText('Path tiles: ' + this.path.length + '   Connected: ' + (this._pathStats().connected ? 'YES' : 'NO'), infoX, infoY + 154 * m.sY);
            ctx.fillText(this.statusText, infoX, infoY + 184 * m.sY);
            ctx.fillStyle = '#BDEEFF';
            ctx.fillText('Move weights: Right +1  Left +2  Up +3  Down +4', infoX, infoY + 214 * m.sY);
        }

        for (let i = 0; i < this.buttonRects.length; i++) this._drawButton(ctx, this.buttonRects[i], m, this.buttonRects[i].label);
        ctx.font = 'bold ' + Math.round(11 * m.sY) + 'px monospace';
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'center';
        ctx.fillText('PATH TOOLS', this.buttonRects[0].x + 128 * m.sX, this.buttonRects[0].y - 12 * m.sY);
        ctx.fillText('VALIDATION', this.buttonRects[2].x + 107 * m.sX, this.buttonRects[2].y - 12 * m.sY);
    }

    _drawStatus(ctx, m) {
        ctx.font = 'bold ' + Math.round(12 * m.sY) + 'px monospace';
        ctx.fillStyle = '#8FF8FF';
        ctx.textAlign = 'left';
        ctx.fillText('TRIES ' + this.attemptsUsed + '/' + this.maxAttempts + '   Drag/click path   Z: undo   R: clear   ENTER: confirm', m.panelX + 30 * m.sX, m.panelY + m.panelH - 28 * m.sY);
    }

    _drawVirusAlert(ctx, m) {
        if (!this.virusState) return;
        let intensity = 0;
        if (this.virusState.overrun) intensity = 0.65;
        else if (this._shouldTriggerOverrun()) intensity = 0.35;
        if (intensity <= 0) return;

        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.3);
        const alpha = Math.min(0.85, intensity + pulse * 0.25);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FF0B2F';
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.restore();

        if (this.virusState.overrun) {
            const shake = 6 * (0.5 + 0.5 * Math.sin(this.animTick * 0.8));
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.font = 'bold ' + Math.round(26 * m.sY) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('QUARANTINE BREACHED', m.cW / 2 + shake, m.cH / 2 + shake);
            ctx.restore();
        }
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
        ctx.font = 'bold ' + Math.round(13 * m.sY) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, b.x + b.w * 0.5, b.y + b.h * 0.63);
    }

    _handlePathTile(tile) {
        if (!tile || this.phase !== 'build') return false;
        if (!this._inGrid(tile)) return false;
        const existingIndex = this._pathIndex(tile);
        if (existingIndex === this.path.length - 1) return true;
        if (existingIndex !== -1) return this._rewindTo(existingIndex);
        const last = this.path[this.path.length - 1];
        const distance = this._manhattan(last, tile);
        if (distance > 1 && (last.col === tile.col || last.row === tile.row)) {
            const direction = tile.col > last.col ? 'R' : (tile.col < last.col ? 'L' : (tile.row > last.row ? 'D' : 'U'));
            let ok = true;
            for (let i = 0; i < distance; i++) {
                const before = this.path[this.path.length - 1];
                const next = this._moveTile(before, direction);
                ok = this._handlePathTile(next) && ok;
                if (!ok || this._sameTile(next, tile)) break;
            }
            return ok;
        }
        if (!this._isAdjacent(last, tile)) {
            if (this._sameTile(tile, this.problem.start)) this._clearPath();
            else this._setStatus('Only adjacent tiles can extend the connector.', 'bad');
            return false;
        }
        if (this._isVirus(tile)) {
            this._setStatus('Virus node blocks that route. Choose another tile.', 'bad');
            this._playCancel();
            return false;
        }
        this.path.push(this._cloneTile(tile));
        const connected = this._pathStats().connected;
        this._setStatus(connected ? 'Blue nodes linked. Confirm to trace the CIDR allocation.' : 'Path preview updated.', connected ? 'good' : 'idle');
        this._playCursor();
        this._afterTutorialAction(connected ? 'connect' : 'path');
        return true;
    }

    _undoPath() {
        if (this.phase !== 'build' || this.path.length <= 1) return false;
        this.path.pop();
        this._setStatus('Last tile removed.', 'idle');
        return true;
    }

    _clearPath() {
        if (this.phase !== 'build') return false;
        this.path = [this._cloneTile(this.problem.start)];
        this._setStatus('Path cleared. Start from the blue node.', 'idle');
        return true;
    }

    _rewindTo(index) {
        if (index < 0 || index >= this.path.length) return false;
        this.path = this.path.slice(0, index + 1);
        this._setStatus('Path rewound to tile ' + this._tileLabel(this.path[index]) + '.', 'idle');
        this._playCursor();
        return true;
    }

    _startTrace(result) {
        this.phase = 'tracing';
        this.trace = { result, tick: 0, stepTicks: 24, finished: false, resolveDelay: 44 };
        this.statusText = result.ok ? 'Signal locked. Tracing optimized CIDR connector.' : 'Signal unstable. Tracing CIDR fault location.';
        this.statusTone = result.ok ? 'good' : 'bad';
    }

    _initVirusSpread() {
        const solutionKeys = {};
        const solutionPath = (this.problem && this.problem.solutionPath) || [];
        for (let i = 0; i < solutionPath.length; i++) solutionKeys[this._tileKey(solutionPath[i])] = true;

        const virusKeys = {};
        const viruses = (this.problem && this.problem.viruses) || [];
        for (let i = 0; i < viruses.length; i++) virusKeys[this._tileKey(viruses[i])] = true;

        const totalTiles = 16 * 16;
        const totalSolutionTiles = Object.keys(solutionKeys).length;
        const totalNonSolutionTiles = Math.max(0, totalTiles - totalSolutionTiles);
        const virusNonSolutionCount = this._countNonSolutionViruses(virusKeys, solutionKeys);
        const edgeBuffer = this._virusEdgeBuffer();
        const solutionBufferKeys = this.problem.solutionBufferKeys || this._buildSolutionBufferKeys(this.problem.solutionPath || []);
        const totalSpawnableNonSolution = this._countSpawnableNonSolutionTiles(edgeBuffer, solutionBufferKeys, solutionKeys);
        this.virusState = {
            elapsedTicks: 0,
            lastSpawnTick: 0,
            totalTiles,
            totalSolutionTiles,
            totalNonSolutionTiles,
            totalSpawnableNonSolution,
            virusKeys,
            solutionKeys,
            solutionBufferKeys,
            virusNonSolutionCount,
            overrun: false,
            overrunTick: 0,
            edgeBuffer,
            revealThreshold: Math.max(6, Math.round(totalSpawnableNonSolution * 0.06)),
        };
    }

    _updateVirusSpread() {
        if (this.finished) return;
        if (!this.virusState) this._initVirusSpread();
        if (this.phase === 'tracing' || this.phase === 'diagnostic' || this.phase === 'tutorial_complete') return;

        if (this.virusState.overrun) {
            this._advanceVirusOverrun();
            return;
        }

        if (this.phase !== 'build') return;
        this.virusState.elapsedTicks++;

        const elapsedSeconds = this.virusState.elapsedTicks / 60;
        const config = this._virusGrowthConfig(elapsedSeconds);
        if (this.virusState.elapsedTicks - this.virusState.lastSpawnTick < config.interval) return;
        this.virusState.lastSpawnTick = this.virusState.elapsedTicks;

        const minPathDistance = this._virusMinPathDistance(elapsedSeconds);
        this._spawnVirusBatch(config.batch, {
            allowSolution: false,
            avoidPath: true,
            minPathDistance,
            edgeBuffer: this.virusState.edgeBuffer,
        });
        if (this._shouldTriggerOverrun()) {
            this._triggerVirusOverrun();
        }
    }

    _virusGrowthConfig(elapsedSeconds) {
        if (elapsedSeconds < 20) return { interval: 180, batch: 1 };
        if (elapsedSeconds < 40) return { interval: 140, batch: 1 };
        if (elapsedSeconds < 60) return { interval: 100, batch: 2 };
        if (elapsedSeconds < 90) return { interval: 70, batch: 2 };
        if (elapsedSeconds < 120) return { interval: 50, batch: 3 };
        if (elapsedSeconds < 150) return { interval: 36, batch: 4 };
        return { interval: 18, batch: 6 };
    }

    _virusMinPathDistance(elapsedSeconds) {
        if (elapsedSeconds < 40) return 2;
        if (elapsedSeconds < 80) return 1;
        return 0;
    }

    _shouldTriggerOverrun() {
        const remaining = this._remainingSpawnableNonSolution();
        return remaining <= this.virusState.revealThreshold;
    }

    _triggerVirusOverrun() {
        if (this.virusState.overrun) return;
        this.virusState.overrun = true;
        this.virusState.overrunTick = 0;
        this.phase = 'overrun';
        this._setStatus('WARNING: Virus outbreak detected. Quarantine collapsing.', 'bad');
        this._playCancel();
    }

    _advanceVirusOverrun() {
        if (!this.virusState || !this.virusState.overrun) return;
        this.virusState.overrunTick++;
        const burst = this.virusState.overrunTick < 20 ? 10 : 18;
        this._spawnVirusBatch(burst, {
            allowSolution: false,
            avoidPath: false,
            minPathDistance: 0,
            minSolutionDistance: this.virusState.solutionBuffer,
            edgeBuffer: this.virusState.edgeBuffer,
        });

        if (this.virusState.overrunTick >= 45 || this.problem.viruses.length >= this.virusState.totalTiles) {
            this._applyVirusOverrunFailure();
        }
    }

    _applyVirusOverrunFailure() {
        if (this.finished) return;
        const result = this._diagnostic('virus_overrun', [
            'SYSTEM FAILURE.',
            'The virus reached critical density and consumed the quarantine grid.',
            'Retry before the next surge overwhelms the sector.',
        ], this._baseResult(this._pathStats()));

        this.attemptsUsed++;
        if (this.attemptsUsed >= this.maxAttempts) {
            this._failOut(result);
        } else {
            this._showDiagnostic(result);
        }
    }

    _spawnVirusBatch(count, options) {
        const opts = options || {};
        const allowSolution = !!opts.allowSolution;
        const avoidPath = opts.avoidPath !== false;
        const minPathDistance = Number(opts.minPathDistance || 0);
        const edgeBuffer = Number(opts.edgeBuffer || 0);
        let spawned = 0;
        let tries = 0;
        const maxTries = Math.max(30, count * 40);
        while (spawned < count && tries < maxTries) {
            tries++;
            const tile = { col: this._randomInt(0, 15), row: this._randomInt(0, 15) };
            if (!this._isSpawnableVirusTile(tile, allowSolution, avoidPath, minPathDistance, edgeBuffer)) continue;
            this._addVirus(tile, { allowSolution });
            spawned++;
        }
        if (spawned < count && !allowSolution && this._remainingSpawnableNonSolution() <= 0) {
            // If only near-path tiles remain, force an overrun to end quickly.
            this._triggerVirusOverrun();
        }
        return spawned;
    }

    _isSpawnableVirusTile(tile, allowSolution, avoidPath, minPathDistance, edgeBuffer) {
        if (!this._inGrid(tile)) return false;
        if (this._isVirus(tile)) return false;
        if (!allowSolution && this.virusState.solutionKeys[this._tileKey(tile)]) return false;
        if (avoidPath && this._pathIndex(tile) !== -1) return false;
        if (minPathDistance > 0 && this._distanceToPath(tile) <= minPathDistance) return false;
        if (edgeBuffer > 0 && this._isInEdgeBuffer(tile, edgeBuffer)) return false;
        if (!allowSolution && this._isInSolutionBuffer(tile)) return false;
        if (this._sameTile(tile, this.problem.start)) return false;
        if (this._sameTile(tile, this.problem.end)) return false;
        return true;
    }

    _addVirus(tile, options) {
        const opts = options || {};
        const key = this._tileKey(tile);
        if (this.virusState.virusKeys[key]) return false;
        this.problem.viruses.push(this._cloneTile(tile));
        this.virusState.virusKeys[key] = true;
        if (!this.virusState.solutionKeys[key] || opts.allowSolution) {
            if (!this.virusState.solutionKeys[key]) this.virusState.virusNonSolutionCount++;
        }
        return true;
    }

    _countNonSolutionViruses(virusKeys, solutionKeys) {
        let count = 0;
        const keys = Object.keys(virusKeys || {});
        for (let i = 0; i < keys.length; i++) {
            if (!solutionKeys[keys[i]]) count++;
        }
        return count;
    }

    _randomSolutionTile() {
        const pool = [];
        const solutionPath = this.problem.solutionPath || [];
        for (let i = 0; i < solutionPath.length; i++) {
            const tile = solutionPath[i];
            if (this._sameTile(tile, this.problem.start)) continue;
            if (this._sameTile(tile, this.problem.end)) continue;
            pool.push(tile);
        }
        if (!pool.length) return null;
        return this._cloneTile(pool[this._randomInt(0, pool.length - 1)]);
    }

    _countSpawnableNonSolutionTiles(edgeBuffer, solutionBufferKeys, solutionKeys) {
        let count = 0;
        for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 16; col++) {
                const tile = { col, row };
                const key = this._tileKey(tile);
                if (solutionKeys && solutionKeys[key]) continue;
                if (edgeBuffer > 0 && this._isInEdgeBuffer(tile, edgeBuffer)) continue;
                if (solutionBufferKeys && solutionBufferKeys[key]) continue;
                count++;
            }
        }
        return count;
    }

    _remainingSpawnableNonSolution() {
        if (!this.virusState) return 0;
        return Math.max(0, this.virusState.totalSpawnableNonSolution - this.virusState.virusNonSolutionCount);
    }

    _isInSolutionBuffer(tile) {
        if (!this.virusState || !this.virusState.solutionBufferKeys) return false;
        return !!this.virusState.solutionBufferKeys[this._tileKey(tile)];
    }

    _isInEdgeBuffer(tile, edgeBuffer) {
        if (!tile) return false;
        const buffer = Math.max(0, Number(edgeBuffer) || 0);
        if (buffer <= 0) return false;
        return tile.col < buffer || tile.col > 15 - buffer || tile.row < buffer || tile.row > 15 - buffer;
    }

    _virusEdgeBuffer() {
        return Math.max(0, Number(this.virusConfig && this.virusConfig.edgeBuffer) || 0);
    }

    _virusSolutionBufferRange() {
        const min = Math.max(0, Number(this.virusConfig && this.virusConfig.solutionBufferMin) || 0);
        const max = Math.max(min, Number(this.virusConfig && this.virusConfig.solutionBufferMax) || min);
        return { min, max };
    }

    _buildSolutionBufferKeys(solutionPath) {
        const keys = {};
        const path = solutionPath || [];
        for (let i = 0; i < path.length; i++) {
            const radius = this._randomSolutionBufferRadius();
            const base = path[i];
            for (let row = base.row - radius; row <= base.row + radius; row++) {
                for (let col = base.col - radius; col <= base.col + radius; col++) {
                    const tile = { col, row };
                    if (!this._inGrid(tile)) continue;
                    if (this._manhattan(base, tile) > radius) continue;
                    keys[this._tileKey(tile)] = true;
                }
            }
        }
        return keys;
    }

    _randomSolutionBufferRadius() {
        const range = this._virusSolutionBufferRange();
        const min = range.min;
        const max = range.max;
        if (max <= min) return min;
        const roll = Math.random();
        const r1 = Math.max(min, Math.min(max, 1));
        const r2 = Math.max(min, Math.min(max, 2));
        const r3 = Math.max(min, Math.min(max, 3));
        const r4 = Math.max(min, Math.min(max, 4));
        if (roll < 0.05) return r1;
        if (roll < 0.30) return r2;
        if (roll < 0.85) return r3;
        return r4;
    }

    _distanceToPath(tile) {
        if (!tile || !this.path || !this.path.length) return 99;
        let best = 99;
        for (let i = 0; i < this.path.length; i++) {
            const d = this._manhattan(tile, this.path[i]);
            if (d < best) best = d;
            if (best <= 1) return best;
        }
        return best;
    }

    _updateTrace() {
        if (!this.trace) return;
        this.trace.tick++;
        const totalMoves = Math.max(0, this.path.length - 1);
        const endTick = totalMoves * this.trace.stepTicks + this.trace.resolveDelay;
        if (this.trace.tick >= totalMoves * this.trace.stepTicks) this.trace.finished = true;
        if (this.trace.tick >= endTick) this._resolveTrace();
    }

    _resolveTrace() {
        if (!this.trace) return;
        const result = this.trace.result;
        this.trace = null;
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
            this.phase = 'build';
            this._showTutorialFeedback('submitWrong');
            return;
        }
        if (this.attemptsUsed >= this.maxAttempts) {
            this._failOut(result);
            return;
        }
        this._showDiagnostic(result);
    }

    _baseResult(stats) {
        return {
            gameplayId: 'ip_cidr_quarantine',
            problemId: this.problem.id,
            ipAddress: this.problem.ipAddress,
            ipClass: this.problem.ipClass,
            originalCIDR: this.problem.originalCIDR,
            requiredHosts: this.problem.requiredHosts,
            targetAddedBits: this.problem.targetAddedBits,
            currentAddedBits: stats.addedBits,
            targetCIDR: this.problem.targetCIDR,
            currentCIDR: stats.currentCIDR,
            optimizedHostBits: this.problem.optimizedHostBits,
            currentHostBits: stats.currentHostBits,
            optimizedCapacity: this.problem.optimizedCapacity,
            currentCapacity: stats.currentCapacity,
            allocatedCIDR: stats.allocatedCIDR,
            pathLength: this.path.length,
            pathTiles: this.path.map((t) => this._cloneTile(t)),
            moveWeights: stats.moves.map((m) => ({ direction: m.direction, weight: m.weight })),
            attemptsUsed: this.attemptsUsed,
            maxAttempts: this.maxAttempts,
            retries: Math.max(0, this.attemptsUsed - 1),
        };
    }

    _pathStats(path) {
        const p = path || this.path;
        const moves = [];
        let addedBits = 0;
        let hitVirus = false;
        for (let i = 0; i < p.length; i++) {
            if (this._isVirus(p[i])) hitVirus = true;
            if (i === 0) continue;
            const direction = this._directionBetween(p[i - 1], p[i]);
            const weight = this.directionWeights[direction] || 0;
            addedBits += weight;
            moves.push({ direction, weight, from: this._cloneTile(p[i - 1]), to: this._cloneTile(p[i]) });
        }
        const currentCIDR = Number(this.problem.originalCIDR || 0) + addedBits;
        const currentHostBits = Math.max(0, 32 - currentCIDR);
        const currentCapacity = this._capacityForHostBits(currentHostBits);
        return {
            addedBits,
            currentCIDR,
            currentHostBits,
            currentCapacity,
            allocatedCIDR: this._allocatedCIDR(this.problem.ipInt, currentCIDR),
            moves,
            connected: this._sameTile(p[p.length - 1], this.problem.end),
            hitVirus,
        };
    }

    _traceStats() {
        const visibleMoves = this._traceVisibleMoves();
        return this._pathStats(this.path.slice(0, Math.min(this.path.length, visibleMoves + 1)));
    }

    _traceVisibleMoves() {
        if (!this.trace) return this.path.length - 1;
        return Math.max(0, Math.min(this.path.length - 1, Math.floor(this.trace.tick / this.trace.stepTicks)));
    }

    _traceCalculationLine() {
        const visibleMoves = this._traceVisibleMoves();
        const stats = this._pathStats(this.path.slice(0, Math.min(this.path.length, visibleMoves + 1)));
        if (visibleMoves <= 0 || !stats.moves.length) return 'Path bits +0. CIDR stays /' + this.problem.originalCIDR + '.';
        const last = stats.moves[stats.moves.length - 1];
        const before = stats.addedBits - last.weight;
        return 'Move ' + last.direction + ' +' + last.weight + ': bits +' + before + ' + ' + last.weight + ' = +' + stats.addedBits;
    }

    _traceCIDRLine(stats) {
        const s = stats || this._traceStats();
        return 'CIDR /' + this.problem.originalCIDR + ' +' + s.addedBits + ' = /' + s.currentCIDR + '  |  host bits 32-' + s.currentCIDR + ' = ' + s.currentHostBits;
    }

    _finalTraceLine() {
        const stats = this._pathStats();
        return 'Final: ' + stats.allocatedCIDR + '  ' + this._formatHosts(stats.currentCapacity) + ' hosts / needed ' + this._formatHosts(this.problem.requiredHosts);
    }

    _setStatus(text, tone) {
        this.statusText = text;
        this.statusTone = tone || 'idle';
    }

    _formatHosts(value) {
        if (typeof value === 'string') return value;
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value || 0);
        return n.toLocaleString ? n.toLocaleString('en-US') : String(n);
    }

    _pathExponent(path) {
        let out = 0;
        for (let i = 1; i < path.length; i++) out += this.directionWeights[this._directionBetween(path[i - 1], path[i])] || 0;
        return out;
    }

    _randomCIDRClass() {
        const classes = [
            { ipClass: 'A', originalCIDR: 8, minAddedBits: 4, maxAddedBits: 16 },
            { ipClass: 'B', originalCIDR: 16, minAddedBits: 2, maxAddedBits: 11 },
            { ipClass: 'C', originalCIDR: 24, minAddedBits: 1, maxAddedBits: 6 },
        ];
        return classes[this._randomInt(0, classes.length - 1)];
    }

    _randomIPForClass(ipClass) {
        const core = IP2Live.IPWiresCore;
        if (core && typeof core.generateIPForClass === 'function') {
            const generated = core.generateIPForClass(ipClass);
            if (generated && generated.ip) return generated.ip;
        }
        const ranges = {
            A: [1, 126],
            B: [128, 191],
            C: [192, 223],
        };
        const range = ranges[ipClass] || ranges.C;
        return [
            this._randomInt(range[0], range[1]),
            this._randomInt(0, 255),
            this._randomInt(0, 255),
            this._randomInt(1, 254),
        ].join('.');
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

    _generateSolutionRoute(start, bits, questIndex) {
        const challengeMode = Number(questIndex || 1) > 1;
        if (!challengeMode) {
            return this._routeFromMoves(start, this._movesForAddedBits(bits));
        }

        const candidates = this._routeCandidatesForBits(start, bits, questIndex);
        if (candidates.length) {
            candidates.sort((a, b) => b.score - a.score);
            const topCount = Math.min(4, candidates.length);
            const chosen = candidates[this._randomInt(0, topCount - 1)];
            return { moves: chosen.moves.slice(), path: chosen.path.map((t) => this._cloneTile(t)) };
        }

        return this._routeFromMoves(start, this._movesForAddedBits(bits));
    }

    _routeCandidatesForBits(start, bits, questIndex) {
        const total = Math.max(1, Number(bits) || 1);
        const candidates = [];
        const directions = this._routeDirectionOrder(questIndex);
        const maxMoves = Math.min(9, Math.max(3, total));
        const startTile = this._cloneTile(start);
        const used = {};
        used[this._tileKey(startTile)] = true;

        const visit = (tile, remaining, moves, path) => {
            if (candidates.length >= 420) return;
            if (remaining === 0) {
                const score = this._scoreRouteCandidate(startTile, path, moves);
                if (score > 0) {
                    candidates.push({
                        moves: moves.slice(),
                        path: path.map((t) => this._cloneTile(t)),
                        score,
                    });
                }
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
                if (!this._inGrid(next) || used[key]) continue;
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

    _routeDirectionOrder(questIndex) {
        const orders = [
            ['R', 'D', 'U', 'L'],
            ['D', 'R', 'U', 'L'],
            ['R', 'U', 'D', 'L'],
            ['U', 'R', 'D', 'L'],
        ];
        return orders[Math.abs(Number(questIndex || 1)) % orders.length];
    }

    _scoreRouteCandidate(start, path, moves) {
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
        let score = 0;
        score += distinctCount * 22;
        score += turns * 14;
        score += Math.min(5, rowDelta) * 12;
        score += Math.min(6, colDelta) * 4;
        score += Math.min(8, moves.length) * 2;
        if (end.row === start.row) score -= 55;
        if (rowDelta === 0) score -= 25;
        if (this._manhattan(start, end) < 3) score -= 20;
        if (moves.length > 7) score -= (moves.length - 7) * 4;
        return score;
    }

    _routeFromMoves(start, moves) {
        const solutionMoves = (moves || []).slice();
        const solutionPath = [this._cloneTile(start)];
        let cursor = this._cloneTile(start);
        for (let i = 0; i < solutionMoves.length; i++) {
            cursor = this._moveTile(cursor, solutionMoves[i]);
            solutionPath.push(this._cloneTile(cursor));
        }
        return { moves: solutionMoves, path: solutionPath };
    }

    _movesForAddedBits(bits) {
        const total = Math.max(1, Number(bits) || 1);
        const moves = [];
        if (total <= 13) {
            for (let i = 0; i < total; i++) moves.push('R');
            return moves;
        }
        for (let i = 0; i < total - 4; i++) moves.push('R');
        moves.push('D');
        return moves;
    }

    _addDefaultPathDecoyViruses(viruses, blockedKeys, start, end, solutionPath, solutionBufferKeys, edgeBuffer, questIndex) {
        const desired = Math.min(3, Math.max(1, Number(questIndex || 2) - 1));
        let placed = 0;
        const passes = [
            { respectSolutionBuffer: true, minSolutionDistance: 2 },
            { respectSolutionBuffer: false, minSolutionDistance: 2 },
            { respectSolutionBuffer: false, minSolutionDistance: 1 },
        ];

        for (let passIndex = 0; passIndex < passes.length && placed < desired; passIndex++) {
            const pass = passes[passIndex];
            const candidates = this._defaultPathDecoyCandidates(start, end, solutionPath);
            for (let i = 0; i < candidates.length && placed < desired; i++) {
                const tile = candidates[i].tile;
                if (!this._canPlaceDecoyVirus(tile, blockedKeys, start, end, solutionPath, solutionBufferKeys, edgeBuffer, pass)) continue;
                const key = this._tileKey(tile);
                blockedKeys[key] = true;
                viruses.push(this._cloneTile(tile));
                placed++;
            }
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
                this._pushDecoyCandidate(candidates, seen, base, 120 - offset * 8);
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
                    const distancePenalty = this._manhattan(base, neighbors[n]) * 4;
                    const solutionDistance = this._distanceToTileList(neighbors[n], solutionPath);
                    const solutionBonus = Math.min(3, solutionDistance) * 3;
                    this._pushDecoyCandidate(candidates, seen, neighbors[n], 105 - offset * 8 - distancePenalty + solutionBonus);
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
        const horizontal = end.col >= cursor.col ? 'R' : 'L';
        while (cursor.col !== end.col) {
            cursor.col += horizontal === 'R' ? 1 : -1;
            path.push(this._cloneTile(cursor));
        }
        const vertical = end.row >= cursor.row ? 'D' : 'U';
        while (cursor.row !== end.row) {
            cursor.row += vertical === 'D' ? 1 : -1;
            path.push(this._cloneTile(cursor));
        }
        return path;
    }

    _canPlaceDecoyVirus(tile, blockedKeys, start, end, solutionPath, solutionBufferKeys, edgeBuffer, options) {
        const opts = options || {};
        if (!this._inGrid(tile)) return false;
        const key = this._tileKey(tile);
        if (blockedKeys && blockedKeys[key]) return false;
        if (this._sameTile(tile, start) || this._sameTile(tile, end)) return false;
        if (edgeBuffer > 0 && this._isInEdgeBuffer(tile, edgeBuffer)) return false;
        if (opts.respectSolutionBuffer && solutionBufferKeys && solutionBufferKeys[key]) return false;
        if (this._distanceToTileList(tile, solutionPath) <= Math.max(0, Number(opts.minSolutionDistance) || 0)) return false;
        if (this._manhattan(tile, start) <= 1 || this._manhattan(tile, end) <= 1) return false;
        return true;
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

    _randomInt(min, max) {
        const lo = Math.ceil(Number(min) || 0);
        const hi = Math.floor(Number(max) || 0);
        if (hi <= lo) return lo;
        return lo + Math.floor(Math.random() * (hi - lo + 1));
    }

    _drawPath(ctx, m, path, color, alpha, visibleMoves) {
        if (!path || path.length < 2 || !this._gridRect) return;
        const g = this._gridRect;
        const maxIndex = Math.min(path.length - 1, visibleMoves === undefined ? path.length - 1 : visibleMoves);
        if (maxIndex < 1) return;
        ctx.save();
        ctx.globalAlpha = alpha === undefined ? 1 : alpha;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 14 * m.sX;
        ctx.strokeStyle = this.trace && !this.trace.result.ok ? '#FF2D6F' : color;
        ctx.lineWidth = 7 * m.sX;
        ctx.beginPath();
        const first = this._cellCenter(path[0], g);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i <= maxIndex; i++) {
            const p = this._cellCenter(path[i], g);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        for (let i = 0; i <= maxIndex; i++) {
            const p = this._cellCenter(path[i], g);
            ctx.fillStyle = i === maxIndex && this.trace ? '#FFFFFF' : color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4.5 * m.sX, 0, Math.PI * 2);
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
        ctx.strokeStyle = '#DDFBFF';
        ctx.lineWidth = 1.5 * m.sX;
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(point.x + Math.cos(a) * radius * 0.25, point.y + Math.sin(a) * radius * 0.25);
            ctx.lineTo(point.x + Math.cos(a) * radius * 0.72, point.y + Math.sin(a) * radius * 0.72);
            ctx.stroke();
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(12 * m.sY) + 'px monospace';
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
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#080B16';
        ctx.beginPath();
        ctx.arc(x - radius * 0.28, y - radius * 0.1, radius * 0.13, 0, Math.PI * 2);
        ctx.arc(x + radius * 0.28, y - radius * 0.1, radius * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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

    _tileFromPoint(x, y, grid) {
        const cellW = grid.w / 16;
        const cellH = grid.h / 16;
        return {
            col: Math.max(0, Math.min(15, Math.floor((x - grid.x) / cellW))),
            row: Math.max(0, Math.min(15, Math.floor((y - grid.y) / cellH))),
        };
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

    _isAdjacent(a, b) {
        return !!a && !!b && Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
    }

    _inGrid(tile) {
        return tile && tile.col >= 0 && tile.col < 16 && tile.row >= 0 && tile.row < 16;
    }

    _isVirus(tile) {
        const key = this._tileKey(tile);
        for (let i = 0; i < this.problem.viruses.length; i++) {
            if (this._tileKey(this.problem.viruses[i]) === key) return true;
        }
        return false;
    }

    _pathIndex(tile) {
        for (let i = 0; i < this.path.length; i++) {
            if (this._sameTile(this.path[i], tile)) return i;
        }
        return -1;
    }

    _sameTile(a, b) {
        return !!a && !!b && Number(a.col) === Number(b.col) && Number(a.row) === Number(b.row);
    }

    _cloneTile(tile) {
        return { col: Number(tile && tile.col) || 0, row: Number(tile && tile.row) || 0 };
    }

    _tileKey(tile) {
        return String(Number(tile && tile.col) || 0) + ':' + String(Number(tile && tile.row) || 0);
    }

    _tileLabel(tile) {
        return 'C' + tile.col + ' R' + tile.row;
    }

    _manhattan(a, b) {
        return Math.abs((a && a.col) - (b && b.col)) + Math.abs((a && a.row) - (b && b.row));
    }

    _reasonLabel(reason) {
        const labels = {
            disconnected: 'route incomplete',
            virus: 'virus contact',
            virus_overrun: 'virus overrun',
            too_small: 'hosts too small',
            too_big: 'hosts too large',
            not_optimized: 'CIDR not optimized',
        };
        return labels[reason] || 'not optimized';
    }

    _titleFont() {
        return IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
    }

    _playCursor() { try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) {} }
    _playConfirm() { try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) {} }
    _playCancel() { try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) {} }
}

const CIDRQuarantineGameplayManager = {
    VERSION: 'ip-cidr-quarantine-manager-20260530-02',
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
            if (opts.questId && opts.objectiveId && IP2Live.QuestManager) {
                const qm = IP2Live.QuestManager;
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
