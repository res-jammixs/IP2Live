/**
 * IP2Live - Network Repair Gameplay (Formula Catcher)
 *
 * Gameplay Seven:
 * - Falling subnet formula variable mini-game for Stage 4 Level 1 PC repairs
 * - Player catches the variables needed by the active subnet formula
 * - After catching them, fill formula blanks to solve the requested address
 * - Uses gameplay3/gameplay4 subnet state when available
 */

class IP2LiveNetworkRepairGameplayScreen extends Scene.Base {
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
        this.phase = 'catching';
        this.phaseTimer = 0;
        this.statusText = 'CATCH THE VARIABLES NEEDED BY THE SUBNET FORMULA.';
        this.errorText = '';
        this.errorTimer = 0;
        this.chances = 3;
        this.maxChances = 3;
        this.particles = [];
        this.scenario = this.options.scenario || this._fallbackScenario();
        if (!Array.isArray(this.scenario.targetTokens) || !this.scenario.targetTokens.length) {
            this.scenario = this._fallbackScenario();
        }

        // Catching state
        this.laneCount = 5;
        this.catcherLane = 2;
        this.fallingTokens = [];
        this.caughtTokens = [];
        this.spawnTimer = 0;
        this.spawnInterval = 42;
        this.fallSpeed = 0.006;
        this.correctSpawnRate = 0.40;
        this.catchFlash = 0;
        this.lastSpawnLane = -1;

        // Formula state
        this.formulaSlots = [];
        this.selectedSlot = 0;
        this.firstSwapSlot = -1;

        // Rects (rebuilt during draw)
        this.cancelRect = null;
        this.submitRect = null;
        this.gameAreaRect = null;
        this.laneRects = [];
        this.formulaSlotRects = [];
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    // ── Game Loop ────────────────────────────────────────────────

    update() {
        this.animTick++;
        if (this.phase === 'catching') {
            this._updateCatchingPhase();
        }
        if (this.phase === 'success') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) this._finishSuccess();
        }
        if (this.errorTimer > 0) this.errorTimer--;
        if (this.catchFlash > 0) this.catchFlash--;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life--;
            p.x += p.vx;
            p.y += p.vy;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _updateCatchingPhase() {
        this.spawnTimer++;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this._spawnToken();
        }
        for (let i = this.fallingTokens.length - 1; i >= 0; i--) {
            const token = this.fallingTokens[i];
            if (!token || typeof token.yNorm !== 'number') {
                this.fallingTokens.splice(i, 1);
                continue;
            }
            token.yNorm += this.fallSpeed;
            if (!token.caught && token.lane === this.catcherLane &&
                token.yNorm >= 0.82 && token.yNorm <= 0.97) {
                this._catchToken(token);
                this.fallingTokens.splice(i, 1);
                continue;
            }
            if (token.yNorm > 1.12) {
                this.fallingTokens.splice(i, 1);
            }
        }
    }

    _spawnToken() {
        let lane = Math.floor(Math.random() * this.laneCount);
        if (lane === this.lastSpawnLane && Math.random() > 0.3) {
            lane = (lane + 1 + Math.floor(Math.random() * (this.laneCount - 1))) % this.laneCount;
        }
        var tooClose = false;
        for (let j = 0; j < this.fallingTokens.length; j++) {
            if (this.fallingTokens[j] && this.fallingTokens[j].lane === lane && this.fallingTokens[j].yNorm < 0.13) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) {
            for (let l = 0; l < this.laneCount; l++) {
                if (l === lane) continue;
                var ok = true;
                for (let j = 0; j < this.fallingTokens.length; j++) {
                    if (this.fallingTokens[j] && this.fallingTokens[j].lane === l && this.fallingTokens[j].yNorm < 0.13) {
                        ok = false;
                        break;
                    }
                }
                if (ok) { lane = l; break; }
            }
        }
        this.lastSpawnLane = lane;

        var source;
        if (Math.random() < this.correctSpawnRate) {
            var t = Array.isArray(this.scenario.targetTokens) ? this.scenario.targetTokens : [];
            source = t[Math.floor(Math.random() * t.length)];
        } else {
            var d = Array.isArray(this.scenario.decoyTokens) ? this.scenario.decoyTokens : [];
            source = d[Math.floor(Math.random() * d.length)];
        }
        if (!source) {
            var fallback = Array.isArray(this.scenario.targetTokens) ? this.scenario.targetTokens : [];
            source = fallback[Math.floor(Math.random() * fallback.length)];
        }
        if (!source) return;
        this.fallingTokens.push(Object.assign({}, source, { lane: lane, yNorm: -0.09, caught: false }));
    }

    _catchToken(token) {
        var requiredCount = this.scenario.targetTokens.length;
        if (this.caughtTokens.length >= requiredCount) return;
        this.caughtTokens.push(this._cloneToken(token));
        this.catchFlash = 14;
        this._playCursor();
        if (this.caughtTokens.length >= requiredCount) {
            this._evaluateCaughtTokens();
        }
    }

    _evaluateCaughtTokens() {
        var caught = this.caughtTokens.map(function (t) { return t.id; }).sort();
        var target = this.scenario.targetTokens.map(function (t) { return t.id; }).sort();
        var correct = true;
        if (caught.length !== target.length) {
            correct = false;
        } else {
            for (let i = 0; i < caught.length; i++) {
                if (caught[i] !== target[i]) { correct = false; break; }
            }
        }

        if (correct) {
            this.phase = 'arranging';
            this.formulaSlots = this.caughtTokens.map((token) => this._cloneToken(token));
            for (let i = this.formulaSlots.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = this.formulaSlots[i];
                this.formulaSlots[i] = this.formulaSlots[j];
                this.formulaSlots[j] = tmp;
            }
            var alreadyCorrect = true;
            for (let i = 0; i < this.scenario.targetTokens.length; i++) {
                if (!this.formulaSlots[i] || this.formulaSlots[i].id !== this.scenario.targetTokens[i].id) {
                    alreadyCorrect = false;
                    break;
                }
            }
            if (alreadyCorrect && this.formulaSlots.length >= 2) {
                var t2 = this.formulaSlots[0];
                this.formulaSlots[0] = this.formulaSlots[1];
                this.formulaSlots[1] = t2;
            }
            this.selectedSlot = 0;
            this.firstSwapSlot = -1;
            this.fallingTokens = [];
            this.statusText = 'FILL THE FORMULA BLANKS IN THE CORRECT ORDER.';
            this.errorText = '';
            this._playConfirm();
            return;
        }

        this.chances = Math.max(0, this.chances - 1);
        this.errorText = 'WRONG VARIABLES CAUGHT. THEY DO NOT MATCH THE FORMULA.';
        this.errorTimer = 120;
        this._playCancel();

        if (this.chances <= 0) {
            this._failRun('wrong_variables');
            return;
        }

        if (this.options.tutorialFeedback && typeof this.options.onMistake === 'function') {
            this.phase = 'locked';
            this.options.onMistake({
                submittedText: this._tokensText(this.caughtTokens),
                expectedText: this.scenario.expectedFormulaText,
                taskType: this.scenario.taskType,
                scenario: this.scenario,
                mistakeType: 'wrong_variables',
            }, () => {
                if (this.finished) return;
                this.phase = 'catching';
                this.caughtTokens = [];
                this.fallingTokens = [];
                this.spawnTimer = 0;
                this.statusText = 'TRY AGAIN. CATCH THE CORRECT FORMULA VARIABLES.';
                this.errorText = '';
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            });
            return;
        }
        this.caughtTokens = [];
        this.statusText = 'WRONG SET. TRY CATCHING THE CORRECT VARIABLES AGAIN.';
    }

    _submitArrangement() {
        var target = this.scenario.targetTokens;
        var correct = true;
        for (let i = 0; i < target.length; i++) {
            if (!this.formulaSlots[i] || this.formulaSlots[i].id !== target[i].id) { correct = false; break; }
        }
        if (correct) {
            this.phase = 'success';
            this.phaseTimer = 80;
            this.statusText = 'FORMULA SOLVED. IP ADDRESS RESTORED.';
            this.errorText = '';
            this._emitParticles();
            this._playConfirm();
            return;
        }
        this.chances = Math.max(0, this.chances - 1);
        this.errorText = 'WRONG FORMULA ORDER. THE VARIABLES ARE IN THE WRONG BLANKS.';
        this.errorTimer = 120;
        this._playCancel();

        if (this.chances <= 0) {
            this._failRun('wrong_arrangement');
            return;
        }

        if (this.options.tutorialFeedback && typeof this.options.onMistake === 'function') {
            this.phase = 'locked';
            this.options.onMistake({
                submittedText: this._tokensText(this.formulaSlots),
                expectedText: this.scenario.expectedFormulaText,
                taskType: this.scenario.taskType,
                scenario: this.scenario,
                mistakeType: 'wrong_formula',
            }, () => {
                if (this.finished) return;
                this.phase = 'arranging';
                this.statusText = 'TRY FILLING THE FORMULA AGAIN.';
                this.errorText = '';
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            });
            return;
        }
        this.statusText = 'WRONG FORMULA ORDER. REARRANGE AND TRY AGAIN.';
    }

    // ── Input ────────────────────────────────────────────────────

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            var valueWhenDialogue = key && (key.name || key.code || key);
            var upperWhenDialogue = String(valueWhenDialogue || '').toUpperCase();
            if (upperWhenDialogue === 'ENTER' || upperWhenDialogue === 'SPACE' || upperWhenDialogue === 'SPACEBAR') {
                IP2Live.DialogueManager.advance();
            }
            return true;
        }
        if (this.phase === 'locked' || this.phase === 'success') return true;
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel();
            return true;
        }

        var value = key && (key.name || key.code || key);
        var upper = String(value || '').toUpperCase();

        if (this.phase === 'catching') {
            if (upper === 'ARROWLEFT' || upper === 'A' || upper === 'KEYA') {
                this._moveCatcher(-1);
                this._playCursor();
                return true;
            }
            if (upper === 'ARROWRIGHT' || upper === 'D' || upper === 'KEYD') {
                this._moveCatcher(1);
                this._playCursor();
                return true;
            }
        }

        if (this.phase === 'arranging') {
            if (upper === 'ARROWLEFT' || upper === 'A' || upper === 'KEYA') {
                this.selectedSlot = (this.selectedSlot - 1 + this.formulaSlots.length) % this.formulaSlots.length;
                this._playCursor();
                return true;
            }
            if (upper === 'ARROWRIGHT' || upper === 'D' || upper === 'KEYD') {
                this.selectedSlot = (this.selectedSlot + 1) % this.formulaSlots.length;
                this._playCursor();
                return true;
            }
            if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') {
                if (this.firstSwapSlot === -1) {
                    this.firstSwapSlot = this.selectedSlot;
                    this._playCursor();
                } else if (this.firstSwapSlot === this.selectedSlot) {
                    this.firstSwapSlot = -1;
                } else {
                    var tmp = this.formulaSlots[this.firstSwapSlot];
                    this.formulaSlots[this.firstSwapSlot] = this.formulaSlots[this.selectedSlot];
                    this.formulaSlots[this.selectedSlot] = tmp;
                    this.firstSwapSlot = -1;
                    this._playCursor();
                }
                return true;
            }
            if (upper === 'S' || upper === 'KEYS') {
                this._submitArrangement();
                return true;
            }
        }
        return true;
    }

    onMouseDown(x, y) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        if (this.phase === 'locked' || this.phase === 'success') return true;
        var m = this._metrics();
        this._buildRects(m);

        if (this.cancelRect && this._pointInRect(x, y, this.cancelRect)) {
            this._cancel();
            return true;
        }

        if (this.phase === 'catching') {
            for (let i = 0; i < this.laneRects.length; i++) {
                if (this._pointInRect(x, y, this.laneRects[i])) {
                    this.catcherLane = i;
                    this._playCursor();
                    return true;
                }
            }
        }

        if (this.phase === 'arranging') {
            for (let i = 0; i < this.formulaSlotRects.length; i++) {
                if (this._pointInRect(x, y, this.formulaSlotRects[i])) {
                    if (this.firstSwapSlot === -1) {
                        this.firstSwapSlot = i;
                        this.selectedSlot = i;
                    } else if (this.firstSwapSlot === i) {
                        this.firstSwapSlot = -1;
                    } else {
                        var tmp = this.formulaSlots[this.firstSwapSlot];
                        this.formulaSlots[this.firstSwapSlot] = this.formulaSlots[i];
                        this.formulaSlots[i] = tmp;
                        this.firstSwapSlot = -1;
                        this.selectedSlot = i;
                        this._playCursor();
                    }
                    return true;
                }
            }
            if (this.submitRect && this._pointInRect(x, y, this.submitRect)) {
                this._submitArrangement();
                return true;
            }
        }
        return true;
    }

    _moveCatcher(delta) {
        this.catcherLane = Math.max(0, Math.min(this.laneCount - 1, this.catcherLane + delta));
    }

    // ── Lifecycle ────────────────────────────────────────────────

    _failRun(reason) {
        if (typeof this.options.onFailed === 'function') {
            this.finished = true;
            this.options.onFailed({
                gameplayId: 'ip_network_repair',
                passed: false,
                taskType: this.scenario.taskType,
                expected: this.scenario.expected,
                expectedText: this.scenario.expectedText,
                submitted: {
                    value: this.phase === 'arranging'
                        ? this._tokensText(this.formulaSlots)
                        : this._tokensText(this.caughtTokens),
                    reason: reason || 'failed',
                },
                scenario: this._scenarioTelemetry(),
            });
        }
    }

    _submittedPayload() {
        return {
            value: this.phase === 'arranging'
                ? this._tokensText(this.formulaSlots)
                : this._tokensText(this.caughtTokens),
        };
    }

    _scenarioTelemetry() {
        return {
            ip: this.scenario.ip,
            cidr: this.scenario.cidr,
            mask: this.scenario.mask,
            networkAddress: this.scenario.networkAddress,
            broadcastAddress: this.scenario.broadcastAddress,
            firstUsable: this.scenario.firstUsable,
            lastUsable: this.scenario.lastUsable,
            corruptedRole: this.scenario.corruptedRole,
            formula: this.scenario.formula,
            formulaResult: this.scenario.expectedText,
            targetTokens: this.scenario.targetTokens,
        };
    }

    _finishSuccess() {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete({
                gameplayId: 'ip_network_repair',
                passed: true,
                taskType: this.scenario.taskType,
                expected: this.scenario.expected,
                expectedText: this.scenario.expectedText,
                submitted: this._submittedPayload(),
                chancesRemaining: this.chances,
                scenario: this._scenarioTelemetry(),
            });
            return;
        }
        if (Manager && Manager.Stack) Manager.Stack.pop();
    }

    _cancel() {
        if (this.finished) return;
        this.finished = true;
        this._playCancel();
        if (typeof this.options.onCancel === 'function') {
            this.options.onCancel();
            return;
        }
        if (Manager && Manager.Stack) Manager.Stack.pop();
    }

    // ── Drawing ──────────────────────────────────────────────────

    drawHUD() {
        var ctx = Common.Platform.ctx;
        if (!ctx) return;
        var m = this._metrics();
        this._buildRects(m);
        ctx.save();
        ctx.fillStyle = '#050812';
        ctx.fillRect(0, 0, m.cW, m.cH);
        this._drawBackground(ctx, m);
        this._drawPanel(ctx, m);
        this._drawParticles(ctx);
        if (this.phase === 'success') this._drawSuccess(ctx, m);
        ctx.restore();
    }

    _metrics() {
        var ctx = Common.Platform.ctx;
        var cW = ctx && ctx.canvas ? ctx.canvas.width : Common.ScreenResolution.SCREEN_X;
        var cH = ctx && ctx.canvas ? ctx.canvas.height : Common.ScreenResolution.SCREEN_Y;
        var sX = cW / Common.ScreenResolution.SCREEN_X;
        var sY = cH / Common.ScreenResolution.SCREEN_Y;
        var panelW = Math.min(cW * 0.86, 980 * sX);
        var panelH = Math.min(cH * 0.78, 620 * sY);
        return {
            cW: cW, cH: cH, sX: sX, sY: sY,
            panelX: (cW - panelW) * 0.5,
            panelY: (cH - panelH) * 0.5,
            panelW: panelW,
            panelH: panelH,
        };
    }

    _buildRects(m) {
        // Game area (catching lanes)
        var gameX = m.panelX + 52 * m.sX;
        var gameY = m.panelY + 250 * m.sY;
        var gameW = m.panelW - 104 * m.sX;
        var gameH = Math.max(190 * m.sY, m.panelH - 390 * m.sY);
        this.gameAreaRect = { x: gameX, y: gameY, w: gameW, h: gameH };

        // Lane rects
        this.laneRects = [];
        var laneW = gameW / this.laneCount;
        for (let i = 0; i < this.laneCount; i++) {
            this.laneRects.push({ x: gameX + i * laneW, y: gameY, w: laneW, h: gameH });
        }

        // Formula slot rects
        this.formulaSlotRects = [];
        var slotCount = Math.max(1, (this.scenario.targetTokens && this.scenario.targetTokens.length) || 1);
        var slotW = Math.min(170 * m.sX, (gameW - (slotCount - 1) * 18 * m.sX) / slotCount);
        var slotH = 66 * m.sY;
        var slotGap = 18 * m.sX;
        var totalSlotW = slotCount * slotW + (slotCount - 1) * slotGap;
        var slotStartX = m.panelX + (m.panelW - totalSlotW) / 2;
        var slotY = gameY + 78 * m.sY;
        for (let i = 0; i < slotCount; i++) {
            this.formulaSlotRects.push({
                x: slotStartX + i * (slotW + slotGap),
                y: slotY, w: slotW, h: slotH,
            });
        }

        // Submit button
        this.submitRect = {
            x: m.panelX + (m.panelW - 180 * m.sX) / 2,
            y: slotY + slotH + 56 * m.sY,
            w: 180 * m.sX, h: 44 * m.sY,
        };

        // Cancel button
        this.cancelRect = {
            x: m.panelX + 52 * m.sX,
            y: m.panelY + m.panelH - 78 * m.sY,
            w: 130 * m.sX, h: 42 * m.sY,
        };
    }

    _drawBackground(ctx, m) {
        var pulse = 0.5 + Math.sin(this.animTick * 0.06) * 0.5;
        ctx.fillStyle = 'rgba(0, 240, 255, 0.05)';
        for (let i = 0; i < 12; i++) {
            var y = ((i * 73 + this.animTick * 1.4) % m.cH);
            ctx.fillRect(0, y, m.cW, 1.5 * m.sY);
        }
        ctx.strokeStyle = 'rgba(255, 48, 88, ' + (0.12 + pulse * 0.08).toFixed(3) + ')';
        ctx.lineWidth = 2 * m.sX;
        ctx.strokeRect(m.panelX - 10 * m.sX, m.panelY - 10 * m.sY, m.panelW + 20 * m.sX, m.panelH + 20 * m.sY);
    }

    _drawPanel(ctx, m) {
        var primary = this._primaryFont();
        var mono = this._monoFont();

        // Panel body
        ctx.fillStyle = 'rgba(6, 12, 28, 0.96)';
        ctx.fillRect(m.panelX, m.panelY, m.panelW, m.panelH);
        ctx.strokeStyle = '#33D6FF';
        ctx.lineWidth = 2 * m.sX;
        ctx.strokeRect(m.panelX, m.panelY, m.panelW, m.panelH);

        // Accent bar
        ctx.fillStyle = '#FF315C';
        ctx.fillRect(m.panelX, m.panelY, m.panelW, 8 * m.sY);

        // Title
        ctx.fillStyle = '#F8FEFF';
        ctx.font = 'bold ' + (28 * m.sY).toFixed(1) + 'px ' + primary;
        ctx.textAlign = 'left';
        ctx.fillText('NETWORK REPAIR NODE', m.panelX + 44 * m.sX, m.panelY + 54 * m.sY);

        // IP info line
        ctx.fillStyle = '#9BEAFF';
        ctx.font = 'bold ' + (13 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.fillText(
            (this.options.questLabel || 'PC') + '   IP ' + this.scenario.ip + '/' + this.scenario.cidr + '   MASK ' + this.scenario.mask,
            m.panelX + 46 * m.sX, m.panelY + 88 * m.sY
        );

        // Corrupted trace (left column)
        this._drawCorruptedTrace(ctx, m);

        // Caught tray (right column)
        this._drawCaughtTray(ctx, m);

        // Prompt
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (16 * m.sY).toFixed(1) + 'px ' + primary;
        ctx.textAlign = 'left';
        this._drawFittedText(ctx, this.scenario.prompt, m.panelX + 52 * m.sX, m.panelY + 214 * m.sY, m.panelW - 104 * m.sX, 16 * m.sY, primary, true);
        ctx.fillStyle = '#BFEFFF';
        this._drawFittedText(ctx, this.scenario.formula, m.panelX + 52 * m.sX, m.panelY + 238 * m.sY, m.panelW - 104 * m.sX, 11 * m.sY, mono, true);

        // Phase-specific content
        if (this.phase === 'catching' || this.phase === 'locked') {
            this._drawCatchingPhase(ctx, m);
        } else if (this.phase === 'arranging') {
            this._drawArrangingPhase(ctx, m);
        }

        // Cancel button
        this._drawButton(ctx, this.cancelRect, 'CANCEL', '#FF5B75', m);

        // Status / error text
        var statusY = m.panelY + m.panelH - 92 * m.sY;
        var statusX = m.panelX + 210 * m.sX;
        var statusW = m.panelW - 420 * m.sX;
        if (this.phase === 'arranging' && this.submitRect) {
            statusY = this.submitRect.y - 28 * m.sY;
            statusX = m.panelX + 250 * m.sX;
            statusW = m.panelW - 500 * m.sX;
        }
        ctx.fillStyle = (this.errorText && this.errorTimer > 0) ? '#FFD3DA' : '#A8F4FF';
        ctx.font = 'bold ' + (13 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.textAlign = 'center';
        this._drawFittedText(ctx,
            (this.errorTimer > 0 && this.errorText) ? this.errorText : this.statusText,
            statusX,
            statusY,
            statusW,
            13 * m.sY,
            mono,
            true,
            'center'
        );

        // Chances
        ctx.fillStyle = '#F7FBFF';
        ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.textAlign = 'right';
        ctx.fillText('CHANCES ' + this.chances + '/' + this.maxChances,
            m.panelX + m.panelW - 52 * m.sX, m.panelY + m.panelH - 50 * m.sY);
    }

    _drawCorruptedTrace(ctx, m) {
        var mono = this._monoFont();
        var x = m.panelX + 52 * m.sX;
        var y = m.panelY + 104 * m.sY;
        var rows = [
            'NETWORK  ' + this.scenario.networkAddress,
            'BROADCAST ' + this.scenario.broadcastAddress,
            'GATEWAY  ' + this.scenario.firstUsable,
            'RESERVE  ' + this.scenario.lastUsable,
        ];
        var corruptIndex = this._corruptRowIndex();
        ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.textAlign = 'left';
        for (let i = 0; i < rows.length; i++) {
            var rowY = y + i * 22 * m.sY;
            var corrupt = i === corruptIndex;
            ctx.fillStyle = corrupt ? 'rgba(255,49,92,0.36)' : 'rgba(34, 244, 255, 0.12)';
            ctx.fillRect(x, rowY, 310 * m.sX, 18 * m.sY);
            ctx.fillStyle = corrupt ? '#FF8CA0' : '#C9F7FF';
            ctx.fillText(corrupt ? this._scramble(rows[i]) : rows[i], x + 12 * m.sX, rowY + 13 * m.sY);
        }
    }

    _drawCaughtTray(ctx, m) {
        var mono = this._monoFont();
        var startX = m.panelX + m.panelW - 390 * m.sX;
        var y = m.panelY + 108 * m.sY;
        var need = this.scenario.targetTokens.length;

        ctx.fillStyle = '#9BEAFF';
        ctx.font = 'bold ' + (11 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.textAlign = 'left';
        ctx.fillText('CAUGHT ' + this.caughtTokens.length + '/' + need, startX, y + 2 * m.sY);

        var trayW = 340 * m.sX;
        var boxW = Math.min(112 * m.sX, (trayW - (need - 1) * 8 * m.sX) / need);
        var boxH = 32 * m.sY;
        var boxGap = 8 * m.sX;
        var boxY = y + 12 * m.sY;

        for (let i = 0; i < need; i++) {
            var bx = startX + i * (boxW + boxGap);
            var filled = i < this.caughtTokens.length;
            ctx.fillStyle = filled ? 'rgba(34, 244, 255, 0.14)' : 'rgba(255,255,255,0.04)';
            ctx.fillRect(bx, boxY, boxW, boxH);
            ctx.strokeStyle = filled ? '#33D6FF' : 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1.5 * m.sX;
            ctx.strokeRect(bx, boxY, boxW, boxH);
            if (filled) {
                ctx.fillStyle = '#FFFFFF';
                this._drawFittedText(ctx, this._shortTokenLabel(this.caughtTokens[i]), bx + 4 * m.sX, boxY + boxH * 0.66, boxW - 8 * m.sX, 10 * m.sY, mono, true, 'center');
            }
        }
        ctx.textAlign = 'left';
    }

    _drawCatchingPhase(ctx, m) {
        var gr = this.gameAreaRect;
        if (!gr) return;
        var mono = this._monoFont();
        var laneW = gr.w / this.laneCount;

        // Lane borders
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.10)';
        ctx.lineWidth = 1 * m.sX;
        ctx.setLineDash([4 * m.sX, 4 * m.sX]);
        for (let i = 1; i < this.laneCount; i++) {
            var lx = gr.x + i * laneW;
            ctx.beginPath();
            ctx.moveTo(lx, gr.y);
            ctx.lineTo(lx, gr.y + gr.h);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();

        // Game area border
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.18)';
        ctx.lineWidth = 1 * m.sX;
        ctx.strokeRect(gr.x, gr.y, gr.w, gr.h);

        // Catcher lane highlight
        ctx.fillStyle = 'rgba(0, 240, 255, 0.06)';
        ctx.fillRect(gr.x + this.catcherLane * laneW, gr.y, laneW, gr.h);

        // Lane numbers at top
        ctx.fillStyle = 'rgba(0, 240, 255, 0.30)';
        ctx.font = 'bold ' + (9 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.textAlign = 'center';
        for (let i = 0; i < this.laneCount; i++) {
            ctx.fillText('LANE ' + (i + 1), gr.x + i * laneW + laneW / 2, gr.y + 14 * m.sY);
        }

        // Falling formula tokens
        for (let i = 0; i < this.fallingTokens.length; i++) {
            var token = this.fallingTokens[i];
            if (!token || typeof token.yNorm !== 'number') continue;
            if (token.yNorm < -0.06 || token.yNorm > 1.04) continue;
            var tokenPad = laneW * 0.08;
            var tokenX = gr.x + token.lane * laneW + tokenPad;
            var tokenY = gr.y + token.yNorm * gr.h;
            var tokenW = laneW - tokenPad * 2;
            var tokenH = 38 * m.sY;

            ctx.fillStyle = 'rgba(8, 16, 32, 0.92)';
            ctx.fillRect(tokenX, tokenY, tokenW, tokenH);

            var glowPulse = 0.6 + Math.sin(this.animTick * 0.08 + token.lane) * 0.4;
            ctx.strokeStyle = 'rgba(94, 219, 255, ' + (0.5 + glowPulse * 0.3).toFixed(2) + ')';
            ctx.lineWidth = 1.5 * m.sX;
            ctx.strokeRect(tokenX, tokenY, tokenW, tokenH);

            // Top accent on token box
            ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
            ctx.fillRect(tokenX, tokenY, tokenW, 3 * m.sY);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold ' + (10 * m.sY).toFixed(1) + 'px ' + mono;
            ctx.textAlign = 'center';
            ctx.fillText(this._shortTokenLabel(token), tokenX + tokenW / 2, tokenY + tokenH * 0.45);
            ctx.fillStyle = '#9BEAFF';
            ctx.font = 'bold ' + (9 * m.sY).toFixed(1) + 'px ' + mono;
            ctx.fillText(String(token.valueText || token.value), tokenX + tokenW / 2, tokenY + tokenH * 0.78);
        }
        ctx.textAlign = 'left';

        // Catcher
        this._drawCatcher(ctx, m);
    }

    _drawCatcher(ctx, m) {
        var gr = this.gameAreaRect;
        if (!gr) return;
        var laneW = gr.w / this.laneCount;
        var catcherW = laneW * 0.88;
        var catcherH = 30 * m.sY;
        var catcherX = gr.x + this.catcherLane * laneW + (laneW - catcherW) / 2;
        var catcherY = gr.y + gr.h - catcherH - 6 * m.sY;
        var flash = this.catchFlash > 0;
        var mono = this._monoFont();

        ctx.save();
        ctx.shadowColor = flash ? '#42F59B' : '#33D6FF';
        ctx.shadowBlur = flash ? 18 * m.sX : 8 * m.sX;

        ctx.fillStyle = flash ? 'rgba(66, 245, 155, 0.72)' : 'rgba(51, 214, 255, 0.48)';
        ctx.fillRect(catcherX, catcherY, catcherW, catcherH);
        ctx.strokeStyle = flash ? '#42F59B' : '#33D6FF';
        ctx.lineWidth = 2.5 * m.sX;
        ctx.strokeRect(catcherX, catcherY, catcherW, catcherH);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Selection arrow
        ctx.fillStyle = '#FFD84A';
        ctx.beginPath();
        ctx.moveTo(catcherX + catcherW / 2, catcherY - 6 * m.sY);
        ctx.lineTo(catcherX + catcherW / 2 - 7 * m.sX, catcherY - 18 * m.sY);
        ctx.lineTo(catcherX + catcherW / 2 + 7 * m.sX, catcherY - 18 * m.sY);
        ctx.closePath();
        ctx.fill();

        // Receptor label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (9 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.textAlign = 'center';
        ctx.fillText('RECEPTOR', catcherX + catcherW / 2, catcherY + catcherH * 0.72);
        ctx.textAlign = 'left';
    }

    _drawArrangingPhase(ctx, m) {
        var mono = this._monoFont();
        var slots = this.formulaSlotRects;
        if (!slots.length) return;

        // Instruction label
        ctx.fillStyle = '#9BEAFF';
        ctx.font = 'bold ' + (13 * m.sY).toFixed(1) + 'px ' + mono;
        ctx.textAlign = 'center';
        this._drawFittedText(ctx, 'SELECT TWO BLANKS TO SWAP  -  PRESS [S] OR CLICK SUBMIT',
            m.panelX + 80 * m.sX, slots[0].y - 58 * m.sY, m.panelW - 160 * m.sX, 13 * m.sY, mono, true, 'center');
        ctx.fillStyle = '#FFFFFF';
        this._drawFittedText(ctx, this.scenario.formulaTemplate,
            m.panelX + 80 * m.sX, slots[0].y - 28 * m.sY, m.panelW - 160 * m.sX, 14 * m.sY, mono, true, 'center');

        for (let i = 0; i < slots.length; i++) {
            var rect = slots[i];
            var isFirst = i === this.firstSwapSlot;
            var isSelected = i === this.selectedSlot;
            var token = this.formulaSlots[i] || {};
            var expected = this.scenario.targetTokens[i] || {};

            // Slot background
            ctx.fillStyle = isFirst ? 'rgba(255, 216, 74, 0.22)' : 'rgba(34, 244, 255, 0.10)';
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

            // Slot border
            ctx.strokeStyle = isFirst ? '#FFD84A' : (isSelected ? '#42F59B' : '#5EDBFF');
            ctx.lineWidth = (isFirst || isSelected ? 3 : 2) * m.sX;
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

            // Token value
            ctx.fillStyle = '#FFFFFF';
            this._drawFittedText(ctx, this._shortTokenLabel(token), rect.x + 10 * m.sX, rect.y + rect.h * 0.40, rect.w - 20 * m.sX, 11 * m.sY, mono, true, 'center');
            ctx.fillStyle = '#9BEAFF';
            this._drawFittedText(ctx, String(token.valueText || token.value || ''), rect.x + 10 * m.sX, rect.y + rect.h * 0.72, rect.w - 20 * m.sX, 10 * m.sY, mono, true, 'center');

            // Slot label
            ctx.fillStyle = isFirst ? '#FFD84A' : '#91E8FF';
            this._drawFittedText(ctx, expected.slotLabel || ('BLANK ' + (i + 1)), rect.x, rect.y - 8 * m.sY, rect.w, 9 * m.sY, mono, true, 'center');
        }

        // Selection arrow below selected slot
        if (this.selectedSlot >= 0 && this.selectedSlot < slots.length) {
            var sr = slots[this.selectedSlot];
            ctx.fillStyle = '#FFD84A';
            ctx.beginPath();
            ctx.moveTo(sr.x + sr.w / 2, sr.y + sr.h + 10 * m.sY);
            ctx.lineTo(sr.x + sr.w / 2 - 8 * m.sX, sr.y + sr.h + 22 * m.sY);
            ctx.lineTo(sr.x + sr.w / 2 + 8 * m.sX, sr.y + sr.h + 22 * m.sY);
            ctx.closePath();
            ctx.fill();
        }

        // Submit button
        this._drawButton(ctx, this.submitRect, 'SUBMIT', '#42F59B', m);
        ctx.textAlign = 'left';
    }

    _drawButton(ctx, rect, label, color, m) {
        if (!rect) return;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * m.sX;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = color;
        ctx.font = 'bold ' + (14 * m.sY).toFixed(1) + 'px ' + this._monoFont();
        ctx.textAlign = 'center';
        ctx.fillText(label, rect.x + rect.w * 0.5, rect.y + rect.h * 0.64);
    }

    _drawFittedText(ctx, text, x, y, maxW, basePx, fontFamily, bold, align) {
        var size = Math.max(8, basePx || 12);
        var weight = bold === false ? '' : 'bold ';
        var family = fontFamily || this._monoFont();
        var previousAlign = ctx.textAlign;
        ctx.textAlign = align || previousAlign || 'left';
        ctx.font = weight + size.toFixed(1) + 'px ' + family;
        while (size > 8 && ctx.measureText(String(text || '')).width > maxW) {
            size -= 1;
            ctx.font = weight + size.toFixed(1) + 'px ' + family;
        }
        var drawX = x;
        if (ctx.textAlign === 'center') drawX = x + maxW / 2;
        if (ctx.textAlign === 'right') drawX = x + maxW;
        ctx.fillText(String(text || ''), drawX, y);
        ctx.textAlign = previousAlign;
    }

    _drawSuccess(ctx, m) {
        var sharedPopup = IP2Live.GameplayCompletionPopup;
        if (sharedPopup && typeof sharedPopup.draw === 'function') {
            sharedPopup.draw(ctx, {
                gameplayId: 'ip_network_repair',
                label: this.options.questLabel || 'Network repair formula verified',
                footer: String(this.scenario.expectedText || 'ROUTE RESTORED') + '  //  PROGRESS SECURED',
                progress: Math.max(0, Math.min(1, 1 - this.phaseTimer / 80)),
                tick: this.animTick || 0,
            });
            return;
        }
        ctx.fillStyle = 'rgba(66,245,155,0.16)';
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.fillStyle = '#F5FFF9';
        ctx.font = 'bold ' + (30 * m.sY).toFixed(1) + 'px ' + this._primaryFont();
        ctx.textAlign = 'center';
        ctx.fillText('FORMULA SOLVED', m.cW * 0.5, m.cH * 0.5);
        ctx.font = 'bold ' + (16 * m.sY).toFixed(1) + 'px ' + this._monoFont();
        ctx.fillText(this.scenario.expectedText, m.cW * 0.5, m.cH * 0.5 + 34 * m.sY);
    }

    _drawParticles(ctx) {
        for (let i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
    }

    _emitParticles() {
        var m = this._metrics();
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: m.cW * 0.5,
                y: m.cH * 0.5,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5,
                life: 20 + Math.floor(Math.random() * 24),
                size: 2 + Math.random() * 3,
                color: i % 2 ? '#42F59B' : '#5EDBFF',
            });
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    _normalizeIP(text) {
        var parts = String(text || '').trim().split('.');
        if (parts.length !== 4) return '';
        var out = [];
        for (let i = 0; i < 4; i++) {
            if (parts[i] === '') return '';
            var n = Number(parts[i]);
            if (!Number.isInteger(n) || n < 0 || n > 255) return '';
            out.push(String(n));
        }
        return out.join('.');
    }

    _digitFromKeyToken(value) {
        var raw = String(value || '');
        var upper = raw.toUpperCase();
        if (upper.length === 1 && upper >= '0' && upper <= '9') return upper;
        if (upper.indexOf('DIGIT') === 0 && upper.length === 6) return upper[5];
        if (upper.indexOf('NUMPAD') === 0 && upper.length === 7) return upper[6];
        return null;
    }

    _scramble(text) {
        var chars = String(text || '').split('');
        for (let i = 0; i < chars.length; i++) {
            if (chars[i] >= '0' && chars[i] <= '9' && (i + this.animTick) % 3 === 0) chars[i] = '#';
        }
        return chars.join('');
    }

    _corruptRowIndex() {
        var role = this.scenario.corruptedRole;
        if (role === 'broadcast') return 1;
        if (role === 'gateway') return 2;
        if (role === 'reserve') return 3;
        return 0;
    }

    _fallbackScenario() {
        var targetTokens = [
            this._makeToken('baseNetwork', 'Base Network Address', '192.168.10.0', 'BASE NETWORK'),
            this._makeToken('blockSize', 'Block Size', '64', 'BLOCK SIZE'),
            this._makeToken('subnetNumber', 'Subnet Number', '2', 'SUBNET NUMBER'),
        ];
        return {
            ip: '192.168.10.77',
            cidr: 26,
            mask: '255.255.255.192',
            taskType: 'networkAddress',
            corruptedRole: 'network',
            prompt: 'Catch the variables for the NETWORK ADDRESS formula.',
            formula: 'Network Address = Starting Network Address + (Block Size x (Subnet Number - 1))',
            formulaTemplate: 'Network Address = [Starting Network] + ([Block Size] x ([Subnet Number] - 1))',
            networkAddress: '192.168.10.64',
            broadcastAddress: '192.168.10.127',
            firstUsable: '192.168.10.65',
            lastUsable: '192.168.10.126',
            expected: { value: '192.168.10.64' },
            expectedText: '192.168.10.64',
            expectedFormulaText: '192.168.10.0 + (64 x (2 - 1)) = 192.168.10.64',
            targetTokens: targetTokens,
            decoyTokens: [
                this._makeToken('broadcastAddress', 'Broadcast Address', '192.168.10.127', 'BROADCAST'),
                this._makeToken('hostIp', 'PC IP Address', '192.168.10.77', 'PC IP'),
                this._makeToken('usableStart', 'First Usable IP', '192.168.10.65', 'FIRST USABLE'),
                this._makeToken('mask', 'Subnet Mask', '255.255.255.192', 'MASK'),
                this._makeToken('targetSubnet', 'Target Subnet', '2', 'TARGET SUBNET'),
            ],
            secretRow: 0,
            taskHelp: 'Find the block size, identify this PC subnet number, then compute the network address at the start of that block.',
        };
    }

    _makeToken(id, label, value, shortLabel, slotLabel) {
        return {
            id: id,
            label: label,
            shortLabel: shortLabel || label,
            slotLabel: slotLabel || shortLabel || label,
            value: value,
            valueText: String(value),
        };
    }

    _cloneToken(token) {
        return {
            id: token && token.id,
            label: token && token.label,
            shortLabel: token && token.shortLabel,
            slotLabel: token && token.slotLabel,
            value: token && token.value,
            valueText: token && token.valueText,
        };
    }

    _shortTokenLabel(token) {
        return String((token && (token.shortLabel || token.label || token.id)) || '').toUpperCase();
    }

    _tokensText(tokens) {
        return (tokens || []).map((token) => {
            if (!token) return '';
            return (token.label || token.id) + '=' + (token.valueText || token.value);
        }).join(' | ');
    }

    _pointInRect(x, y, rect) {
        return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    _primaryFont() {
        return IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'Arial';
    }

    _monoFont() {
        return 'Consolas, monospace';
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

// =====================================================================
//  MANAGER
// =====================================================================

const NetworkRepairGameplayManager = {
    VERSION: 'ip-networkrepair-gameplay-manager-20260530-01',
    _active: false,
    _introShown: false,
    _activeAttempt: null,
    _triggerLocks: {},
    _cancelCooldowns: {},
    _scenarioCacheByQuest: {},

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            var specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_network_repair');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return [];
    },

    _defaultQuestSpec() {
        var specs = this._questSpecs();
        for (let i = 0; i < specs.length; i++) {
            if (specs[i] && specs[i].id === 'stage.15.ip_network_repair.01') return specs[i];
        }
        return specs[0] || null;
    },

    _handleObjective(spec, context, questManager) {
        var qm = questManager || IP2Live.QuestManager;
        if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;
        var objective = qm.currentObjective();
        if (!objective || objective.id !== spec.objectiveId) return false;
        var dist = qm.distanceToObjective(objective, context && context.hero);
        var radius = typeof objective.completionRadiusTiles === 'number' ? objective.completionRadiusTiles : 0.55;
        this._refreshTriggerLock(spec, dist, radius);
        if (this._isCancelCoolingDown(spec)) return false;
        if (dist === null || dist > radius) return false;
        if (this._triggerLocks[spec.objectiveId]) return false;
        if (this._active) return false;

        var attemptKey = this._resolveAttemptKey({ spec: spec, questId: spec.id, objectiveId: spec.objectiveId });
        if (this._activeAttempt === attemptKey) return false;
        this._activeAttempt = attemptKey;

        var launchOptions = {
            spec: spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId: Number(context && context.mapId) || Number(qm.activeMapId) || this._currentMapId() || Number(spec.mapId) || 15,
            _fromObjective: true,
        };
        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_network_repair', Object.assign({}, launchOptions, {
                showIntro: !this._introShown,
                _reservedAttempt: attemptKey,
            }));
            return false;
        }
        this.launchNetworkRepairGameplay(Object.assign({}, launchOptions, { mode: 'replace', showIntro: !this._introShown }));
        return false;
    },

    launchNetworkRepairGameplay(options) {
        var opts = options || {};
        if (IP2Live.QuestMinimap) {
            if (!IP2Live.QuestMinimap.isActive()) IP2Live.QuestMinimap.create();
            else IP2Live.QuestMinimap.update();
        }
        var spec = opts.spec || this._defaultQuestSpec();
        if (!spec) return false;
        var attemptKey = this._resolveAttemptKey({ spec: spec, questId: opts.questId || spec.id, objectiveId: opts.objectiveId || spec.objectiveId });
        var isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        this._activeAttempt = attemptKey;

        var self = this;
        var open = function () {
            var screen = new IP2LiveNetworkRepairGameplayScreen({
                spec: spec,
                questLabel: spec.label,
                scenario: self._scenarioForSpec(spec),
                tutorialFeedback: !!spec.tutorial,
                onMistake: function (mistake, done) { return self._onMistake(opts, mistake, done); },
                onComplete: function (result) { return self._onComplete(opts, result); },
                onFailed: function (result) { return self._onFailed(opts, result); },
                onCancel: function () { return self._onCancel(opts); },
            });

            var openGameplay = function () {
                self._playMusicZone('GAMEPLAY_1');
                if (Manager && Manager.Stack && typeof Manager.Stack.replace === 'function') Manager.Stack.replace(screen);
                else if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') Manager.Stack.push(screen);
            };

            if (opts.useLoading !== false && self._showLoadingScreen2({
                mode: 'push',
                status: opts.loadingStatus || 'Loading Gameplay',
                detail: opts.loadingDetail || 'Opening ' + (spec.label || 'Network Repair'),
                onComplete: openGameplay,
            })) return;
            openGameplay();
        };

        var openSafely = function () {
            try { open(); }
            catch (e) {
                self._active = false;
                self._activeAttempt = null;
                console.warn('[IP2Live] NetworkRepairGameplayManager failed to open gameplay:', e);
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            }
        };

        var shouldShowIntro = opts.showIntro !== false && !this._introShown;
        if (shouldShowIntro && IP2Live.IPNetworkRepairTutorial && typeof IP2Live.IPNetworkRepairTutorial.showIntro === 'function') {
            this._introShown = true;
            IP2Live.IPNetworkRepairTutorial.showIntro(spec, openSafely);
        } else {
            openSafely();
        }
        return true;
    },

    _onMistake(options, mistake, done) {
        var opts = options || {};
        var spec = opts.spec || this._defaultQuestSpec();
        var scenario = (mistake && mistake.scenario) || this._scenarioForSpec(spec);
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
            IP2Live.GameManager.handleGameplayMistake('ip_network_repair', {
                spec: spec,
                questId: opts.questId || (spec && spec.id),
                objectiveId: opts.objectiveId || (spec && spec.objectiveId),
                mapId: opts.mapId || 15,
                mistakes: [mistake],
                scenario: scenario,
                onComplete: done,
            });
            return true;
        }
        if (IP2Live.IPNetworkRepairTutorial && typeof IP2Live.IPNetworkRepairTutorial.showQuestOneCorrection === 'function') {
            return IP2Live.IPNetworkRepairTutorial.showQuestOneCorrection(mistake, scenario, done);
        }
        if (typeof done === 'function') done();
        return false;
    },

    _onComplete(options, result) {
        var opts = options || {};
        var spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        if (spec && spec.objectiveId) delete this._triggerLocks[spec.objectiveId];
        if (spec && spec.id) delete this._scenarioCacheByQuest[spec.id];

        var self = this;
        var finalizeExit = function () {
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
                IP2Live.GameManager.handleGameplayCompleted('ip_network_repair', {
                    spec: spec,
                    questId: opts.questId || (spec && spec.id),
                    objectiveId: opts.objectiveId || (spec && spec.objectiveId),
                    mapId: opts.mapId || 15,
                    result: result,
                });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Returning to Stage 4 Level 1',
            onComplete: finalizeExit,
        })) finalizeExit();
    },

    _onFailed(options, result) {
        var opts = options || {};
        var spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);

        var self = this;
        var finalizeExit = function () {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            self._restoreStageMusic();
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_network_repair', {
                    spec: spec,
                    questId: opts.questId || (spec && spec.id),
                    objectiveId: opts.objectiveId || (spec && spec.objectiveId),
                    mapId: opts.mapId || 15,
                    result: result,
                });
            } else {
                self._sendBackToFirstRepair(spec);
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Rollback circuit engaged',
            onComplete: finalizeExit,
        })) finalizeExit();
    },

    _onCancel(options) {
        var opts = options || {};
        var spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        if (spec && spec.objectiveId) delete this._triggerLocks[spec.objectiveId];
        this._cooldownAfterCancel(spec);
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        this._restoreStageMusic();
        if (typeof opts.onCancel === 'function') opts.onCancel();
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
            IP2Live.GameManager.handleGameplayCancelled('ip_network_repair', {
                gameplayId: 'ip_network_repair',
                spec: spec,
                questId: opts.questId || (spec && spec.id),
                objectiveId: opts.objectiveId || (spec && spec.objectiveId),
                mapId: opts.mapId || 15,
                result: { cancelled: true },
            });
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },

    _handleRollbackFailure(data) {
        var spec = data && data.spec;
        var self = this;
        var sendBack = function () { return self._sendBackToFirstRepair(spec); };
        if (IP2Live.GameManager && typeof IP2Live.GameManager._runTimingDialogues === 'function') {
            var hadDialogue = IP2Live.GameManager._runTimingDialogues(data || {}, 'after', sendBack);
            if (!hadDialogue) sendBack();
            return true;
        }
        sendBack();
        return true;
    },

    _sendBackToFirstRepair(failedSpec) {
        var qm = IP2Live.QuestManager;
        var first = this._defaultQuestSpec();
        if (!qm || !first) return false;
        if (!qm.completedObjectives[first.id]) qm.completedObjectives[first.id] = {};
        qm.completedObjectives[first.id] = {};
        if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
        qm.startQuest(first.id, {
            mapId: 15,
            mapQuestMode: true,
            keepLastCompletion: true,
            visible: true,
            preview: false,
            guideActive: true,
            allowCompletion: true,
        });
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    },

    // ── Scenario Generation ──────────────────────────────────────

    _scenarioForSpec(spec) {
        var key = spec && spec.id ? spec.id : 'default';
        if (this._scenarioCacheByQuest[key]) return this._clonePlain(this._scenarioCacheByQuest[key]);
        var scenario = this._buildScenario(spec || {});
        this._scenarioCacheByQuest[key] = this._clonePlain(scenario);
        return scenario;
    },

    _buildScenario(spec) {
        var base = this._deriveBaseSubnet();
        var hostCount = Math.max(1, base.broadcastInt - base.networkInt - 1);
        var hostOffset = Math.min(hostCount, 1 + Math.floor(Math.random() * hostCount));
        var ip = this._intToIP(base.networkInt + hostOffset);
        var corruptedRole = this._roleForTaskType(spec.taskType || this._randomTaskType());
        var expectedIp = this._ipForRole(corruptedRole, base, ip);
        var formulaModel = this._formulaForRole(corruptedRole, base, ip);
        var decoyTokens = this._generateDecoyTokens(base, formulaModel.targetTokens, ip);

        return {
            ip: ip,
            cidr: base.cidr,
            mask: base.mask,
            taskType: corruptedRole,
            corruptedRole: corruptedRole,
            prompt: this._promptForRole(corruptedRole, spec.label),
            formula: formulaModel.formula,
            formulaTemplate: formulaModel.formulaTemplate,
            networkAddress: base.networkAddress,
            broadcastAddress: base.broadcastAddress,
            firstUsable: base.firstUsable,
            lastUsable: base.lastUsable,
            expected: { value: expectedIp, role: corruptedRole },
            expectedText: expectedIp,
            expectedFormulaText: formulaModel.expectedFormulaText,
            targetTokens: formulaModel.targetTokens,
            decoyTokens: decoyTokens,
            secretRow: corruptedRole === 'network' ? 0 : (corruptedRole === 'broadcast' ? 1 : (corruptedRole === 'gateway' ? 2 : 3)),
            taskHelp: this._helpForRole(corruptedRole),
        };
    },

    _deriveBaseSubnet() {
        var state = (IP2Live.CIDRGameplayState && IP2Live.CIDRGameplayState.latest) || {};
        var g4 = state.gameplay4 || {};
        var cidr = Number(state.cidr);
        if (!Number.isInteger(cidr) || cidr < 24 || cidr > 30) {
            var hostBits = Number(g4.hostBits);
            if (Number.isInteger(hostBits) && hostBits >= 2 && hostBits <= 8) cidr = 32 - hostBits;
        }
        if (!Number.isInteger(cidr) || cidr < 24 || cidr > 30) cidr = 24 + Math.floor(Math.random() * 6);
        var blockSize = Math.pow(2, 32 - cidr);
        var third = 10 + Math.floor(Math.random() * 80);
        var subnetIndexMax = Math.max(1, Math.floor(256 / blockSize));
        var subnetIndex = Math.floor(Math.random() * subnetIndexMax);
        var fourth = subnetIndex * blockSize;
        var parentNetworkAddress = '192.168.' + third + '.0';
        var networkAddress = '192.168.' + third + '.' + fourth;
        var networkInt = this._ipToInt(networkAddress);
        var broadcastInt = networkInt + blockSize - 1;
        return {
            cidr: cidr,
            mask: this._cidrToMask(cidr),
            blockSize: blockSize,
            subnetIndex: subnetIndex,
            subnetNumber: subnetIndex + 1,
            parentNetworkAddress: parentNetworkAddress,
            parentNetworkInt: this._ipToInt(parentNetworkAddress),
            networkInt: networkInt,
            broadcastInt: broadcastInt,
            networkAddress: networkAddress,
            broadcastAddress: this._intToIP(broadcastInt),
            firstUsable: this._intToIP(networkInt + 1),
            lastUsable: this._intToIP(broadcastInt - 1),
        };
    },

    _randomTaskType() {
        var tasks = ['networkAddress', 'broadcastAddress', 'gatewayAddress', 'reserveAddress'];
        return tasks[Math.floor(Math.random() * tasks.length)];
    },

    _roleForTaskType(taskType) {
        if (taskType === 'broadcastAddress' || taskType === 'broadcast') return 'broadcast';
        if (taskType === 'gatewayAddress' || taskType === 'firstUsable' || taskType === 'usableRange') return 'gateway';
        if (taskType === 'reserveAddress' || taskType === 'lastUsable') return 'reserve';
        return 'network';
    },

    _ipForRole(role, base, ip) {
        if (role === 'broadcast') return base.broadcastAddress;
        if (role === 'gateway') return base.firstUsable;
        if (role === 'reserve') return base.lastUsable;
        if (role === 'host') return ip;
        return base.networkAddress;
    },

    _formulaForRole(role, base, ip) {
        var token = (id, label, value, shortLabel, slotLabel) => this._makeToken(id, label, value, shortLabel, slotLabel);
        var parent = token('baseNetwork', 'Starting Network Address', base.parentNetworkAddress, 'START NETWORK', 'START NETWORK');
        var block = token('blockSize', 'Block Size', base.blockSize, 'BLOCK SIZE', 'BLOCK SIZE');
        var subnetNumber = token('subnetNumber', 'Subnet Number', base.subnetNumber, 'SUBNET NUMBER', 'SUBNET NUMBER');
        var targetSubnet = token('targetSubnet', 'Target Subnet', base.subnetNumber, 'TARGET SUBNET', 'TARGET SUBNET');
        var network = token('networkAddress', 'Network Address', base.networkAddress, 'NETWORK', 'NETWORK');
        var broadcast = token('broadcastAddress', 'Broadcast Address', base.broadcastAddress, 'BROADCAST', 'BROADCAST');
        var one = token('one', 'One Address Step', 1, 'PLUS/MINUS 1', '1');

        if (role === 'broadcast') {
            if (Math.random() < 0.5) {
                return {
                    formula: 'Broadcast Address = Starting Network Address + (Block Size x (Subnet Number - 1)) + (Block Size - 1)',
                    formulaTemplate: 'Broadcast = [Start Network] + ([Block Size] x ([Subnet Number] - 1)) + ([Block Size] - 1)',
                    targetTokens: [parent, block, subnetNumber],
                    expectedFormulaText: base.parentNetworkAddress + ' + (' + base.blockSize + ' x (' + base.subnetNumber + ' - 1)) + (' + base.blockSize + ' - 1) = ' + base.broadcastAddress,
                };
            }
            return {
                formula: 'Broadcast Address = Base Network Address + (Block Size x Target Subnet) - 1',
                formulaTemplate: 'Broadcast = [Base Network] + ([Block Size] x [Target Subnet]) - 1',
                targetTokens: [parent, block, targetSubnet],
                expectedFormulaText: base.parentNetworkAddress + ' + (' + base.blockSize + ' x ' + base.subnetNumber + ') - 1 = ' + base.broadcastAddress,
            };
        }

        if (role === 'gateway') {
            return {
                formula: 'First Usable IP = Network Address + 1',
                formulaTemplate: 'First Usable = [Network Address] + [1]',
                targetTokens: [network, one],
                expectedFormulaText: base.networkAddress + ' + 1 = ' + base.firstUsable,
            };
        }

        if (role === 'reserve') {
            return {
                formula: 'Last Usable IP = Broadcast Address - 1',
                formulaTemplate: 'Last Usable = [Broadcast Address] - [1]',
                targetTokens: [broadcast, one],
                expectedFormulaText: base.broadcastAddress + ' - 1 = ' + base.lastUsable,
            };
        }

        return {
            formula: 'Network Address = Starting Network Address + (Block Size x (Subnet Number - 1))',
            formulaTemplate: 'Network = [Start Network] + ([Block Size] x ([Subnet Number] - 1))',
            targetTokens: [parent, block, subnetNumber],
            expectedFormulaText: base.parentNetworkAddress + ' + (' + base.blockSize + ' x (' + base.subnetNumber + ' - 1)) = ' + base.networkAddress,
        };
    },

    _generateDecoyTokens(base, targetTokens, ip) {
        var targetIds = {};
        for (let i = 0; i < targetTokens.length; i++) targetIds[targetTokens[i].id] = true;
        var candidates = [
            this._makeToken('hostIp', 'PC IP Address', ip, 'PC IP', 'PC IP'),
            this._makeToken('mask', 'Subnet Mask', base.mask, 'MASK', 'MASK'),
            this._makeToken('networkAddress', 'Network Address', base.networkAddress, 'NETWORK', 'NETWORK'),
            this._makeToken('broadcastAddress', 'Broadcast Address', base.broadcastAddress, 'BROADCAST', 'BROADCAST'),
            this._makeToken('firstUsable', 'First Usable IP', base.firstUsable, 'FIRST USABLE', 'FIRST USABLE'),
            this._makeToken('lastUsable', 'Last Usable IP', base.lastUsable, 'LAST USABLE', 'LAST USABLE'),
            this._makeToken('hostBits', 'Host Bits', 32 - base.cidr, 'HOST BITS', 'HOST BITS'),
            this._makeToken('cidr', 'CIDR Prefix', '/' + base.cidr, 'CIDR', 'CIDR'),
            this._makeToken('nextBlock', 'Next Block Start', this._intToIP(base.broadcastInt + 1), 'NEXT BLOCK', 'NEXT BLOCK'),
            this._makeToken('previousBlock', 'Previous Block End', this._intToIP(Math.max(base.parentNetworkInt, base.networkInt - 1)), 'PREV BLOCK', 'PREV BLOCK'),
            this._makeToken('targetSubnet', 'Target Subnet', base.subnetNumber, 'TARGET SUBNET', 'TARGET SUBNET'),
            this._makeToken('subnetNumber', 'Subnet Number', base.subnetNumber, 'SUBNET NUMBER', 'SUBNET NUMBER'),
            this._makeToken('blockSize', 'Block Size', base.blockSize, 'BLOCK SIZE', 'BLOCK SIZE'),
            this._makeToken('one', 'One Address Step', 1, 'PLUS/MINUS 1', '1'),
        ];
        var decoys = [];
        for (let i = 0; i < candidates.length; i++) {
            if (!targetIds[candidates[i].id]) decoys.push(candidates[i]);
        }
        return decoys;
    },

    _makeToken(id, label, value, shortLabel, slotLabel) {
        return {
            id: id,
            label: label,
            shortLabel: shortLabel || label,
            slotLabel: slotLabel || shortLabel || label,
            value: value,
            valueText: String(value),
        };
    },

    _promptForRole(role, label) {
        var prefix = (label || 'This PC') + ': ';
        if (role === 'broadcast') return prefix + 'Catch variables for the BROADCAST ADDRESS.';
        if (role === 'gateway') return prefix + 'Catch variables for the FIRST USABLE IP.';
        if (role === 'reserve') return prefix + 'Catch variables for the LAST USABLE IP.';
        return prefix + 'Catch variables for the NETWORK ADDRESS.';
    },

    _helpForRole(role) {
        if (role === 'broadcast') return 'Broadcast uses the block end: start network plus block jumps, then minus one address.';
        if (role === 'gateway') return 'The first viable IP is network address plus one.';
        if (role === 'reserve') return 'The last viable IP is broadcast address minus one.';
        return 'Network address uses the block start: starting network plus block size times subnet number minus one.';
    },

    // ── IP Utilities ─────────────────────────────────────────────

    _cidrToMask(cidr) {
        var n = Number(cidr);
        var octets = [0, 0, 0, 0];
        var bitsLeft = n;
        for (let i = 0; i < 4; i++) {
            var take = Math.max(0, Math.min(8, bitsLeft));
            bitsLeft -= take;
            octets[i] = take === 0 ? 0 : (256 - Math.pow(2, 8 - take));
        }
        return octets.join('.');
    },

    _ipToInt(ip) {
        var parts = String(ip || '').split('.').map(Number);
        return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
    },

    _intToIP(value) {
        var n = Number(value) >>> 0;
        return [
            (n >>> 24) & 255,
            (n >>> 16) & 255,
            (n >>> 8) & 255,
            n & 255,
        ].join('.');
    },

    // ── Trigger / Attempt helpers ────────────────────────────────

    _resolveAttemptKey(options) {
        var opts = options || {};
        var spec = opts.spec || {};
        return (opts.questId || spec.id || 'quest') + ':' + (opts.objectiveId || spec.objectiveId || 'objective');
    },

    _refreshTriggerLock(spec, distance, radius) {
        if (!spec || !spec.objectiveId || !this._triggerLocks[spec.objectiveId]) return;
        if (distance === null || distance > radius + 0.35) delete this._triggerLocks[spec.objectiveId];
    },

    _lockUntilStepOff(spec) {
        if (spec && spec.objectiveId) this._triggerLocks[spec.objectiveId] = true;
    },

    _cooldownAfterCancel(spec) {
        if (!spec || !spec.objectiveId) return;
        this._cancelCooldowns[spec.objectiveId] = Date.now() + 700;
    },

    _isCancelCoolingDown(spec) {
        if (!spec || !spec.objectiveId) return false;
        var until = Number(this._cancelCooldowns[spec.objectiveId]) || 0;
        if (!until) return false;
        if (Date.now() >= until) {
            delete this._cancelCooldowns[spec.objectiveId];
            return false;
        }
        return true;
    },

    _currentMapId() {
        var scene = Scene && Scene.Map ? Scene.Map.current : null;
        var mapId = scene && (
            scene.id ||
            scene.mapID ||
            (scene.currentMap && scene.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || (Core.Game.current && Number(Core.Game.current.currentMapID)) || 0;
    },

    // ── Loading / Music ──────────────────────────────────────────

    _showLoadingScreen2(options) {
        var opts = options || {};
        var Screen2 = IP2Live.LoadingScreen2;
        if (!Screen2 || typeof Screen2.show !== 'function') return false;
        Screen2.show({
            mode: opts.mode || 'replace',
            status: opts.status || 'Loading Gameplay',
            detail: opts.detail || 'Synchronizing transition',
            onComplete: typeof opts.onComplete === 'function' ? opts.onComplete : null,
        });
        return true;
    },

    _playMusicZone(zoneName) {
        var music = IP2Live.MusicManager;
        if (!music || !music.ZONE || !music.ZONE[zoneName] || typeof music.play !== 'function') return false;
        music.play(music.ZONE[zoneName]);
        return true;
    },

    _restoreStageMusic() {
        return this._playMusicZone('STAGE_1');
    },

    _clonePlain(value) {
        try { return JSON.parse(JSON.stringify(value || null)); }
        catch (e) { return value || null; }
    },
};

// =====================================================================
//  EXPORTS
// =====================================================================

IP2Live.NetworkRepairGameplayManager = NetworkRepairGameplayManager;
IP2Live.NetworkRepairGameplayScreen = IP2LiveNetworkRepairGameplayScreen;
window.IP2LiveNetworkRepairGameplayManager = NetworkRepairGameplayManager;
window.IP2LiveNetworkRepairGameplayScreen = IP2LiveNetworkRepairGameplayScreen;
window.startNetworkRepairGameplaySeven = function (options) {
    return NetworkRepairGameplayManager.launchNetworkRepairGameplay(options || {});
};

console.log('[IP2Live] gameplay7 NetworkRepair gameplay.js module loaded (Formula Catcher).');
