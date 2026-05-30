/**
 * IP2Live - CIDR Binary Panel Gameplay
 *
 * Gameplay Three:
 * - Binary subnet mask bulb panel
 * - Player matches a target custom subnet mask
 * - Confirm triggers animated octet sum verification
 * - Success saves "interesting octet icon" state for later gameplay usage
 */

class IP2LiveCIDRPanelGameplayScreen extends Scene.Base {
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
        this.values = [128, 64, 32, 16, 8, 4, 2, 1];
        this.totalRows = 4;
        this.totalCols = 8;
        this.animTick = 0;
        this.scanTick = 0;
        this.phase = 'build';
        this.phaseTimer = 0;
        this.finished = false;
        this.classButtonRects = [];
        this.switchRects = [];
        this.confirmRect = null;
        this.cidrInputRect = null;
        this.bulbRects = [];
        this.sparks = [];
        this.failJitter = 0;
        this.calcRows = [];
        this.tutorialMode = !!this.options.tutorialMode;
        this.targetMask = this._resolveTargetMask(this.options.targetMask);
        this.targetOctets = this._parseMask(this.targetMask);
        this.targetBits = this._octetsToBits(this.targetOctets);
        this.targetCIDR = this._maskToCIDR(this.targetBits);
        this.cidrInput = '';
        this.cidrInputFocused = false;
        this.iconUnlocked = false;
        this.failReason = '';
        this.iconAnim = null;
        this.miniWidgetVisible = false;
        this.statusText = 'MATCH THE SUBNET MASK WITH BULBS, THEN CONFIRM.';
        this.lastResult = null;
        this.maskConfirmAttempts = 0;
        this.maskFailures = 0;
        this.cidrVerifyAttempts = 0;
        this.cidrFailures = 0;
        this.failResetQueued = false;
        this.failCorrectionActive = false;
        this.postCorrectionInputLockTicks = 0;
        this._resetBulbs();
    }

    _resolveTargetMask(mask) {
        const parsed = this._parseMask(mask);
        const resolved = (parsed && parsed[3] !== 255) ? parsed.join('.') : this._randomUniqueTargetMask();
        if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
        if (!IP2Live.CIDRGameplayState.generatedMasks) IP2Live.CIDRGameplayState.generatedMasks = {};
        IP2Live.CIDRGameplayState.lastGeneratedMask = resolved;
        IP2Live.CIDRGameplayState.generatedMasks[resolved] = true;
        return resolved;
    }

    _randomUniqueTargetMask() {
        const classes = [
            { name: 'A', minCIDR: 9, maxCIDR: 30 },
            { name: 'B', minCIDR: 17, maxCIDR: 30 },
            { name: 'C', minCIDR: 25, maxCIDR: 30 },
        ];
        if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
        if (!IP2Live.CIDRGameplayState.generatedMasks) IP2Live.CIDRGameplayState.generatedMasks = {};
        let lastMask = null;
        if (IP2Live.CIDRGameplayState && IP2Live.CIDRGameplayState.lastGeneratedMask) {
            lastMask = String(IP2Live.CIDRGameplayState.lastGeneratedMask);
        } else if (IP2Live.CIDRGameplayState && IP2Live.CIDRGameplayState.latest && IP2Live.CIDRGameplayState.latest.mask) {
            lastMask = String(IP2Live.CIDRGameplayState.latest.mask);
        }

        const fresh = [];
        for (let ci = 0; ci < classes.length; ci++) {
            const cls = classes[ci];
            for (let cidr = cls.minCIDR; cidr <= cls.maxCIDR; cidr++) {
                const mask = this._cidrToMask(cidr);
                if (!mask) continue;
                if (mask === lastMask) continue;
                if (IP2Live.CIDRGameplayState.generatedMasks[mask]) continue;
                fresh.push(mask);
            }
        }
        if (fresh.length > 0) {
            return fresh[Math.floor(Math.random() * fresh.length)];
        }

        for (let tries = 0; tries < 32; tries++) {
            const cls = classes[Math.floor(Math.random() * classes.length)];
            const cidr = cls.minCIDR + Math.floor(Math.random() * (cls.maxCIDR - cls.minCIDR + 1));
            const mask = this._cidrToMask(cidr);
            if (!mask) continue;
            if (mask !== lastMask) return mask;
        }
        return this._cidrToMask(26) || '255.255.255.192';
    }

    _cidrToMask(cidr) {
        const n = Number(cidr);
        if (!Number.isInteger(n) || n < 0 || n > 32) return null;
        const octets = [0, 0, 0, 0];
        let bitsLeft = n;
        for (let i = 0; i < 4; i++) {
            const take = Math.max(0, Math.min(8, bitsLeft));
            bitsLeft -= take;
            octets[i] = take === 0 ? 0 : (256 - Math.pow(2, 8 - take));
        }
        return octets.join('.');
    }

    _parseMask(mask) {
        if (!mask) return null;
        const parts = String(mask).trim().split('.');
        if (parts.length !== 4) return null;
        const out = [];
        for (let i = 0; i < parts.length; i++) {
            const n = Number(parts[i]);
            if (!Number.isInteger(n) || n < 0 || n > 255) return null;
            out.push(n);
        }
        return out;
    }

    _octetsToBits(octets) {
        const bits = [];
        for (let row = 0; row < 4; row++) {
            const n = octets[row] || 0;
            const rowBits = [];
            for (let col = 7; col >= 0; col--) {
                rowBits.push(((n >> col) & 1) === 1);
            }
            bits.push(rowBits);
        }
        return bits;
    }

    _maskToCIDR(bits) {
        let count = 0;
        for (let r = 0; r < bits.length; r++) {
            for (let c = 0; c < bits[r].length; c++) {
                if (bits[r][c]) count++;
            }
        }
        return count;
    }

    _resetBulbs() {
        this.bulbs = [];
        this.rowSums = [];
        this.rowGlow = [];
        this.rowErrorGlow = [];
        for (let r = 0; r < this.totalRows; r++) {
            const row = [];
            for (let c = 0; c < this.totalCols; c++) row.push(false);
            this.bulbs.push(row);
            this.rowSums.push(0);
            this.rowGlow.push(0);
            this.rowErrorGlow.push(0);
        }
        this.calcRows = [];
        this.cidrInput = '';
        this.cidrInputFocused = false;
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        this.scanTick = (this.scanTick + 1.3) % 24;
        if (this.postCorrectionInputLockTicks > 0) this.postCorrectionInputLockTicks--;

        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const p = this.sparks[i];
            p.life--;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.02;
            p.vx *= 0.985;
            if (p.life <= 0) this.sparks.splice(i, 1);
        }

        for (let r = 0; r < this.totalRows; r++) {
            this.rowGlow[r] = Math.max(0, this.rowGlow[r] - 1);
            this.rowErrorGlow[r] = Math.max(0, this.rowErrorGlow[r] - 1);
        }

        if (this.phase === 'calculating') {
            this._updateCalculation();
        } else if (this.phase === 'cidr_entry') {
            // idle input phase
        } else if (this.phase === 'icon_popup') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) {
                this.phase = 'icon_float';
                this.phaseTimer = 90;
            }
        } else if (this.phase === 'icon_float') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) {
                this.phase = 'success';
                this.phaseTimer = 90;
                this.miniWidgetVisible = true;
                this.statusText = 'OCTET ICON ARCHIVED. TRANSFERRING TO NEXT GAMEPLAY...';
            }
        } else if (this.phase === 'success') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) this._finishSuccess();
        } else if (this.phase === 'fail') {
            this.phaseTimer--;
            this.failJitter = Math.max(0, this.failJitter - 1);
            if (this.phaseTimer <= 0 && !this.failResetQueued) {
                this.failResetQueued = true;
                this._resolveFailureReset();
            }
        }

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
        if (this.postCorrectionInputLockTicks > 0) return true;
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel();
            return true;
        }
        const value = key && (key.name || key.code || key);
        const upper = String(value || '').toUpperCase();
        if (this.phase === 'cidr_entry' && this.cidrInputFocused) {
            if (upper === 'BACKSPACE') {
                this.cidrInput = this.cidrInput.slice(0, -1);
                this._playCursor();
                return true;
            }
            if (upper === 'SLASH' || value === '/') {
                if (this.cidrInput.indexOf('/') === -1) {
                    this.cidrInput = '/' + this.cidrInput.replace(/\D/g, '');
                    this._playCursor();
                }
                return true;
            }
            const digit = this._digitFromKeyToken(value);
            if (digit !== null) {
                const onlyDigits = this.cidrInput.replace(/\D/g, '');
                if (onlyDigits.length < 2) {
                    const prefixed = this.cidrInput.startsWith('/');
                    this.cidrInput = (prefixed ? '/' : '') + (onlyDigits + digit);
                    this._playCursor();
                }
                return true;
            }
        }
        if (this.phase === 'build' && (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR')) {
            this._startConfirm();
            return true;
        }
        if (this.phase === 'cidr_entry' && upper === 'ENTER') {
            this._verifyCIDRInput();
            return true;
        }
        return true;
    }

    onMouseDown(x, y) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        if (this.postCorrectionInputLockTicks > 0) return true;
        if (this.phase !== 'build' && this.phase !== 'cidr_entry') return true;
        const m = this._metrics();
        this._buildInteractionRects(m);

        if (this.phase === 'cidr_entry') {
            if (this.cidrInputRect && this._pointInRect(x, y, this.cidrInputRect)) {
                this.cidrInputFocused = true;
                this._playCursor();
                return true;
            }
            this.cidrInputFocused = false;

            if (this.confirmRect && this._pointInRect(x, y, this.confirmRect)) {
                this._verifyCIDRInput();
                return true;
            }
            return true;
        }

        for (let i = 0; i < this.switchRects.length; i++) {
            const sw = this.switchRects[i];
            if (this._pointInRect(x, y, sw)) {
                for (let c = 0; c < this.totalCols; c++) this.bulbs[sw.row][c] = true;
                this._playCursor();
                return true;
            }
        }

        for (let i = 0; i < this.bulbRects.length; i++) {
            const bulb = this.bulbRects[i];
            if (this._pointInRect(x, y, bulb)) {
                this.bulbs[bulb.row][bulb.col] = !this.bulbs[bulb.row][bulb.col];
                this._playCursor();
                return true;
            }
        }

        if (this.confirmRect && this._pointInRect(x, y, this.confirmRect)) {
            this._startConfirm();
            return true;
        }
        return true;
    }

    _startConfirm() {
        if (this.phase !== 'build') return;
        this.phase = 'calculating';
        this.calcRows = [];
        for (let r = 0; r < this.totalRows; r++) {
            const selected = [];
            for (let c = 0; c < this.totalCols; c++) {
                if (this.bulbs[r][c]) selected.push(this.values[c]);
            }
            selected.sort((a, b) => a - b);
            this.calcRows.push({
                values: selected,
                cursor: -1,
                sum: 0,
                timer: 10,
                done: false,
            });
            this.rowSums[r] = 0;
        }
        this._playConfirm();
    }

    _updateCalculation() {
        let allDone = true;
        for (let r = 0; r < this.calcRows.length; r++) {
            const row = this.calcRows[r];
            if (row.done) continue;
            allDone = false;
            row.timer--;
            if (row.timer > 0) continue;
            row.timer = 10;
            if (row.cursor + 1 < row.values.length) {
                row.cursor++;
                row.sum += row.values[row.cursor];
                this.rowSums[r] = row.sum;
                this._emitRowPulse(r, '#FFD84A');
            } else {
                row.done = true;
            }
        }

        if (!allDone) return;
        this._evaluateConfirmResult();
    }

    _evaluateConfirmResult() {
        this.maskConfirmAttempts++;
        let bulbsCorrect = true;
        for (let r = 0; r < this.totalRows; r++) {
            for (let c = 0; c < this.totalCols; c++) {
                if (!!this.bulbs[r][c] !== !!this.targetBits[r][c]) bulbsCorrect = false;
            }
        }
        if (bulbsCorrect) {
            this.phase = 'cidr_entry';
            this.phaseTimer = 0;
            this.cidrInputFocused = true;
            this.failReason = '';
            this.statusText = 'MASK MATCHED. NOW TYPE CIDR PREFIX AND CONFIRM AGAIN.';
            for (let r = 0; r < this.totalRows; r++) this.rowGlow[r] = 999;
            this._playConfirm();
            return;
        }

        this.failReason = 'SUBNET MASK BINARY DOES NOT MATCH TARGET.';
        this.statusText = 'RECALIBRATE BULBS AND TRY AGAIN.';
        this.maskFailures++;
        this._reportCIDRMistake({
            stepKey: 'subnet_mask_binary',
            stepLabel: 'Subnet mask binary',
            issueType: 'wrong_binary_mask',
            expected: this.targetMask,
            submitted: this._currentBulbBinary(),
            expectedBinary: this.targetBits.map((row) => row.map((on) => on ? '1' : '0').join('')).join('.'),
            tryNumber: this.maskConfirmAttempts,
            gameplayStep: 'mask_to_binary',
        });

        this.phase = 'fail';
        this.phaseTimer = 46;
        this.failResetQueued = false;
        this.failCorrectionActive = false;
        this.failJitter = 34;
        for (let r = 0; r < this.totalRows; r++) {
            this.rowSums[r] = 0;
            this.rowErrorGlow[r] = 75;
        }
        this._emitFailureSparks();
        this._playCancel();
    }

    _verifyCIDRInput() {
        if (this.phase !== 'cidr_entry') return;
        this.cidrVerifyAttempts++;
        const enteredCIDR = this._parseCIDRInput(this.cidrInput);
        if (enteredCIDR === this.targetCIDR) {
            this.iconUnlocked = true;
            this._saveCIDRState(this.cidrInput);
            this._prepareIconAnimation();
            this.phase = 'icon_popup';
            this.phaseTimer = 120;
            this.statusText = 'CIDR VERIFIED. ARCHIVING OCTET ICON...';
            this._playConfirm();
            return;
        }
        this.failReason = 'CIDR INPUT IS INCORRECT. COUNT ALL TURNED-ON BITS.';
        this.statusText = 'CIDR CHECK FAILED. ENTER THE CORRECT PREFIX.';
        this.cidrFailures++;
        this._reportCIDRMistake({
            stepKey: 'cidr_prefix',
            stepLabel: 'CIDR prefix',
            issueType: 'wrong_cidr_prefix',
            expected: this.targetCIDR,
            submitted: enteredCIDR,
            mask: this.targetMask,
            tryNumber: this.maskConfirmAttempts + this.cidrVerifyAttempts,
            gameplayStep: 'binary_to_cidr',
        });
        this.failJitter = 10;
        this._playCancel();
    }

    _currentBulbBinary() {
        const rows = [];
        for (let r = 0; r < this.totalRows; r++) {
            const bits = [];
            for (let c = 0; c < this.totalCols; c++) bits.push(this.bulbs[r][c] ? '1' : '0');
            rows.push(bits.join(''));
        }
        return rows.join('.');
    }

    _reportCIDRMistake(mistake) {
        if (!IP2Live.GameManager || typeof IP2Live.GameManager.handleGameplayMistake !== 'function') return false;
        IP2Live.GameManager.handleGameplayMistake('ip_cidr_binary_panel', {
            gameplayId: 'ip_cidr_binary_panel',
            mapId: this.options.mapId || 5,
            questId: this.options.questId,
            objectiveId: this.options.objectiveId,
            mistakes: [mistake],
            attemptsRemaining: 0,
        });
        return true;
    }

    _prepareIconAnimation() {
        const m = this._metrics();
        const icon = this._buildInterestingOctetIconFromTarget();
        this.iconAnim = {
            bitsBinary: icon.bitsBinary,
            circles: icon.circles,
            fromX: m.panelX + m.panelW * 0.5,
            fromY: m.panelY + m.panelH * 0.5,
            toX: m.panelX + m.panelW * 0.5,
            toY: 18 * m.sY,
        };
    }

    _resolveFailureReset() {
        const reset = () => {
            // Prevent duplicate onComplete callbacks from replaying reset logic.
            if (this.phase !== 'fail' && this.phase !== 'cidr_entry') return;
            this._resetBulbs();
            this.phase = 'build';
            this.phaseTimer = 0;
            this.failReason = '';
            this.statusText = 'MATCH THE SUBNET MASK WITH BULBS, THEN CONFIRM.';
            this.failResetQueued = false;
            this.failCorrectionActive = false;
            // Ignore the same Enter/click event used to close correction dialogue.
            this.postCorrectionInputLockTicks = 10;
        };

        if (this.tutorialMode && IP2Live.IPCIDRPanelTutorial && typeof IP2Live.IPCIDRPanelTutorial.showCorrection === 'function') {
            if (this.failCorrectionActive) return;
            this.failCorrectionActive = true;
            const icon = this._buildInterestingOctetIconFromTarget();
            const started = IP2Live.IPCIDRPanelTutorial.showCorrection(this.targetMask, icon.bitsBinary, this.targetCIDR, reset);
            if (!started) reset();
            return;
        }
        reset();
    }

    _buildInterestingOctetIndex() {
        for (let i = 0; i < this.targetOctets.length; i++) {
            if (this.targetOctets[i] !== 255 && this.targetOctets[i] !== 0) return i;
        }
        for (let i = 0; i < this.targetOctets.length; i++) {
            if (this.targetOctets[i] !== 255) return i;
        }
        return 3;
    }

    _buildInterestingOctetIconFromTarget() {
        const octetIndex = this._buildInterestingOctetIndex();
        const row = this.targetBits[octetIndex] || [false, false, false, false, false, false, false, false];
        const bitsBinary = row.map((on) => on ? '1' : '0').join('');
        const circles = row.map((on, index) => ({
            index,
            borrowed: !!on,
            color: on ? '#FFD84A' : '#6E7886',
            blink: !!on,
        }));
        return { octetIndex, bitsBinary, circles };
    }

    _saveCIDRState(enteredCIDRText) {
        if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
        if (!IP2Live.CIDRGameplayState.generatedMasks) IP2Live.CIDRGameplayState.generatedMasks = {};
        IP2Live.CIDRGameplayState.lastGeneratedMask = this.targetMask;
        IP2Live.CIDRGameplayState.generatedMasks[this.targetMask] = true;
        const icon = this._buildInterestingOctetIconFromTarget();
        const enteredCIDR = this._parseCIDRInput(enteredCIDRText);
        const handoffKey = this.options && this.options.handoffKey ? String(this.options.handoffKey) : null;
        const state = {
            gameplayId: 'ip_cidr_binary_panel',
            handoffKey: handoffKey,
            mask: this.targetMask,
            cidr: this.targetCIDR,
            enteredCIDR: enteredCIDR,
            enteredCIDRText: enteredCIDRText || '',
            targetOctets: this.targetOctets.slice(),
            interestingOctetIndex: icon.octetIndex,
            interestingOctetValue: this.targetOctets[icon.octetIndex],
            bitsBinary: icon.bitsBinary,
            icon: {
                type: 'octet-borrowed-bits',
                circles: icon.circles,
            },
            savedAt: Date.now(),
        };
        IP2Live.CIDRGameplayState.latest = state;
        if (handoffKey) {
            if (!IP2Live.CIDRGameplayState.handoffs) IP2Live.CIDRGameplayState.handoffs = {};
            IP2Live.CIDRGameplayState.handoffs[handoffKey] = Object.assign({}, state);
        }
        this.lastResult = {
            gameplayId: 'ip_cidr_binary_panel',
            handoffKey: handoffKey,
            passed: true,
            mask: this.targetMask,
            cidr: this.targetCIDR,
            enteredCIDR: enteredCIDR,
            retries: Math.max(0, this.maskFailures + this.cidrFailures),
            maskConfirmAttempts: this.maskConfirmAttempts,
            cidrVerifyAttempts: this.cidrVerifyAttempts,
            firstTrySuccess: (this.maskFailures + this.cidrFailures) === 0,
            interestingOctetIndex: icon.octetIndex,
            bitsBinary: icon.bitsBinary,
        };
    }

    _parseCIDRInput(text) {
        const digits = String(text || '').replace(/\D/g, '');
        if (!digits.length) return null;
        const n = Number(digits);
        if (!Number.isInteger(n) || n < 0 || n > 32) return null;
        return n;
    }

    _digitFromKeyToken(value) {
        const raw = String(value || '');
        const upper = raw.toUpperCase();
        if (upper.length === 1 && upper >= '0' && upper <= '9') return upper;
        if (upper.indexOf('DIGIT') === 0 && upper.length === 6) return upper[5];
        if (upper.indexOf('NUMPAD') === 0 && upper.length === 7) return upper[6];
        return null;
    }

    _finishSuccess() {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete(Object.assign({}, this.lastResult || {
                gameplayId: 'ip_cidr_binary_panel',
                passed: true,
                mask: this.targetMask,
                cidr: this.targetCIDR,
            }));
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

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        if (!ctx || !ctx.canvas) return;
        const m = this._metrics();
        this._buildInteractionRects(m);

        ctx.save();
        if (this.phase === 'fail' && this.failJitter > 0) {
            const amp = this.failJitter * 0.13 * m.sX;
            ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
        }
        this._drawBackdrop(ctx, m);
        this._drawFrame(ctx, m);
        this._drawHeader(ctx, m);
        this._drawMainPanel(ctx, m);
        this._drawRows(ctx, m);
        if (this.phase === 'cidr_entry') {
            this._drawCIDRActionPanel(ctx, m);
            this._drawCIDRInput(ctx, m);
        }
        this._drawConfirm(ctx, m);
        if (this.phase === 'icon_popup' && this.iconAnim) this._drawIconPopup(ctx, m);
        if (this.phase === 'icon_float' && this.iconAnim) this._drawIconFloat(ctx, m);
        if (this.miniWidgetVisible && this.iconAnim) this._drawMiniWidget(ctx, m);
        this._drawStatusBar(ctx, m);
        this._drawSparks(ctx, m);
        this._drawPhaseOverlay(ctx, m);
        ctx.restore();

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

        const panelX = 52 * sX;
        const panelY = 58 * sY;
        const panelW = cW - panelX * 2;
        const panelH = cH - panelY * 2;

        const mainX = panelX + panelW * 0.12;
        const mainY = panelY + panelH * 0.18;
        const mainW = panelW * 0.76;
        const mainH = panelH * 0.61;

        return { cW, cH, sX, sY, panelX, panelY, panelW, panelH, mainX, mainY, mainW, mainH };
    }

    _buildInteractionRects(m) {
        this.bulbRects = [];
        this.switchRects = [];
        const rowGap = m.mainH / 4;
        const rowBaseY = m.mainY + 45 * m.sY;
        const bulbsX = m.mainX + 180 * m.sX;
        const gap = 58 * m.sX;
        const radius = 16 * m.sY;
        const bw = radius * 2.05;
        const bh = radius * 2.05;
        for (let r = 0; r < 4; r++) {
            const y = rowBaseY + r * rowGap;
            const sw = {
                row: r,
                x: m.mainX + m.mainW - 124 * m.sX,
                y: y - 18 * m.sY,
                w: 96 * m.sX,
                h: 35 * m.sY,
            };
            this.switchRects.push(sw);
            for (let c = 0; c < 8; c++) {
                const cx = bulbsX + c * gap;
                this.bulbRects.push({
                    row: r,
                    col: c,
                    x: cx - bw * 0.5,
                    y: y - bh * 0.5,
                    w: bw,
                    h: bh,
                });
            }
        }
        this.confirmRect = {
            x: m.panelX + m.panelW * 0.39,
            y: m.panelY + m.panelH * 0.862,
            w: m.panelW * 0.22,
            h: 46 * m.sY,
        };
        this.cidrInputRect = {
            x: m.panelX + m.panelW * 0.39,
            y: m.panelY + m.panelH * 0.798,
            w: m.panelW * 0.22,
            h: 40 * m.sY,
        };
    }

    _drawBackdrop(ctx, m) {
        const g = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        g.addColorStop(0, '#050A12');
        g.addColorStop(0.5, '#0B1624');
        g.addColorStop(1, '#070D16');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);

        ctx.globalAlpha = 0.13;
        ctx.strokeStyle = '#1B3552';
        ctx.lineWidth = 1.1 * m.sX;
        const spacing = 46 * m.sX;
        for (let x = -spacing + ((this.animTick * 0.85) % spacing); x < m.cW + spacing; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + m.cH * 0.24, m.cH);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.globalAlpha = 0.15;
        for (let i = 0; i < 12; i++) {
            const cx = m.panelX + m.panelW * (0.06 + i * 0.08);
            const cy = m.panelY + m.panelH * (0.12 + ((i % 2) * 0.78));
            ctx.strokeStyle = i % 2 ? '#5EE4FF' : '#77A7E8';
            ctx.lineWidth = 1.2 * m.sX;
            this._strokeChamferRect(ctx, cx, cy, 24 * m.sX, 14 * m.sY, 4 * m.sX);
        }
        ctx.globalAlpha = 1;
    }

    _drawFrame(ctx, m) {
        const g = ctx.createLinearGradient(m.panelX, m.panelY, m.panelX, m.panelY + m.panelH);
        g.addColorStop(0, '#111A28');
        g.addColorStop(1, '#09111B');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 16 * m.sX);
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 16 * m.sX, '#35516F', 2 * m.sX);
        this._strokeChamferRect(ctx, m.panelX + 9 * m.sX, m.panelY + 9 * m.sY, m.panelW - 18 * m.sX, m.panelH - 18 * m.sY, 12 * m.sX, '#B5152A', 3.6 * m.sX);
    }

    _drawHeader(ctx, m) {
        const titleFont = this._uiTitleFont();
        const primaryFont = this._uiPrimaryFont();
        const bx = m.panelX + 16 * m.sX;
        const by = m.panelY + 12 * m.sY;
        const bw = m.panelW * 0.56;
        const bh = 42 * m.sY;
        const g = ctx.createLinearGradient(bx, by, bx + bw, by);
        g.addColorStop(0, '#BE1B33');
        g.addColorStop(1, '#F44763');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, bx, by, bw, bh, 10 * m.sX);
        this._strokeChamferRect(ctx, bx, by, bw, bh, 10 * m.sX, '#FFD5DF', 1.6 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (15 * m.sY).toFixed(1) + 'px ' + titleFont;
        ctx.textAlign = 'left';
        ctx.fillText('CIDR CALCULATION :: BINARY PANEL', bx + 14 * m.sX, by + bh * 0.64);

        const maskX = m.panelX + m.panelW * 0.64;
        const maskW = m.panelW * 0.32;
        const mg = ctx.createLinearGradient(maskX, by, maskX + maskW, by);
        mg.addColorStop(0, '#091726');
        mg.addColorStop(1, '#102B42');
        ctx.fillStyle = mg;
        this._fillChamferRect(ctx, maskX, by, maskW, bh, 10 * m.sX);
        this._strokeChamferRect(ctx, maskX, by, maskW, bh, 10 * m.sX, '#58D3FF', 2.2 * m.sX);
        ctx.fillStyle = '#E6F6FF';
        ctx.font = 'bold ' + (12.2 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.fillText('TARGET MASK  ' + this.targetMask, maskX + 12 * m.sX, by + bh * 0.63);
    }

    _drawMainPanel(ctx, m) {
        const g = ctx.createLinearGradient(m.mainX, m.mainY, m.mainX, m.mainY + m.mainH);
        g.addColorStop(0, 'rgba(124,134,146,0.22)');
        g.addColorStop(0.25, 'rgba(70,82,96,0.3)');
        g.addColorStop(1, 'rgba(28,36,48,0.9)');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, m.mainX, m.mainY, m.mainW, m.mainH, 12 * m.sX);
        this._strokeChamferRect(ctx, m.mainX, m.mainY, m.mainW, m.mainH, 12 * m.sX, '#35D5FF', 2 * m.sX);

        const metal = ctx.createLinearGradient(m.mainX, m.mainY, m.mainX + m.mainW, m.mainY);
        metal.addColorStop(0, 'rgba(178,196,214,0.08)');
        metal.addColorStop(0.5, 'rgba(102,126,150,0)');
        metal.addColorStop(1, 'rgba(178,196,214,0.08)');
        ctx.fillStyle = metal;
        this._fillChamferRect(ctx, m.mainX + 8 * m.sX, m.mainY + 8 * m.sY, m.mainW - 16 * m.sX, m.mainH - 16 * m.sY, 9 * m.sX);

        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#80E9FF';
        for (let i = 0; i < 32; i++) {
            const y = m.mainY + ((i * 14 + this.scanTick) % m.mainH);
            ctx.fillRect(m.mainX + 8 * m.sX, y, m.mainW - 16 * m.sX, 2 * m.sY);
        }
        ctx.globalAlpha = 1;

        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#A6BCD3';
        ctx.lineWidth = 1 * m.sX;
        for (let i = 0; i < 7; i++) {
            const x = m.mainX + 30 * m.sX + i * (m.mainW / 7);
            ctx.beginPath();
            ctx.moveTo(x, m.mainY + 8 * m.sY);
            ctx.lineTo(x, m.mainY + m.mainH - 8 * m.sY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.globalAlpha = 0.2;
        for (let i = 0; i < 36; i++) {
            const bx = m.mainX + ((i * 77 + this.animTick * 2) % (m.mainW - 22 * m.sX)) + 10 * m.sX;
            const by = m.mainY + ((i * 53 + this.animTick) % (m.mainH - 18 * m.sY)) + 9 * m.sY;
            ctx.fillStyle = i % 2 ? '#8BEAFF' : '#B5CBDF';
            ctx.fillRect(bx, by, 2 * m.sX, 2 * m.sY);
        }
        ctx.globalAlpha = 1;

        for (let i = 0; i < 8; i++) {
            const rx = m.mainX + 12 * m.sX + i * ((m.mainW - 24 * m.sX) / 7);
            const ryTop = m.mainY + 12 * m.sY;
            const ryBot = m.mainY + m.mainH - 16 * m.sY;
            ctx.fillStyle = '#6F7E8F';
            ctx.beginPath();
            ctx.arc(rx, ryTop, 2.2 * m.sY, 0, Math.PI * 2);
            ctx.arc(rx, ryBot, 2.2 * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawRows(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const rowGap = m.mainH / 4;
        const rowBaseY = m.mainY + 45 * m.sY;
        const bulbsX = m.mainX + 180 * m.sX;
        const gap = 58 * m.sX;
        const radius = 16 * m.sY;

        for (let r = 0; r < 4; r++) {
            const y = rowBaseY + r * rowGap;
            const rowLabelX = m.mainX + 24 * m.sX;
            const sumX = m.mainX + 80 * m.sX;
            const sumW = 72 * m.sX;
            const sumH = 36 * m.sY;

            ctx.fillStyle = '#D8ECFF';
            ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'left';
            ctx.fillText('O' + (r + 1), rowLabelX, y + 4 * m.sY);

            const glow = this.rowGlow[r] > 0 ? (0.35 + 0.25 * Math.sin(this.animTick * 0.2 + r)) : 0;
            const eGlow = this.rowErrorGlow[r] > 0 ? (0.4 + 0.35 * Math.sin(this.animTick * 0.35 + r)) : 0;
            const sg = ctx.createLinearGradient(sumX, y - sumH * 0.5, sumX + sumW, y + sumH * 0.5);
            if (eGlow > 0) {
                sg.addColorStop(0, 'rgba(110,22,36,' + (0.72 + eGlow * 0.15) + ')');
                sg.addColorStop(1, 'rgba(168,34,53,' + (0.68 + eGlow * 0.2) + ')');
            } else if (glow > 0) {
                sg.addColorStop(0, 'rgba(88,86,20,' + (0.7 + glow * 0.2) + ')');
                sg.addColorStop(1, 'rgba(36,126,58,' + (0.7 + glow * 0.2) + ')');
            } else {
                sg.addColorStop(0, 'rgba(15,27,40,0.92)');
                sg.addColorStop(1, 'rgba(11,19,30,0.92)');
            }
            ctx.fillStyle = sg;
            this._fillChamferRect(ctx, sumX, y - sumH * 0.5, sumW, sumH, 6 * m.sX);
            this._strokeChamferRect(ctx, sumX, y - sumH * 0.5, sumW, sumH, 6 * m.sX, '#45698C', 1.4 * m.sX);

            ctx.fillStyle = '#F4FDFF';
            ctx.font = 'bold ' + (14 * m.sY).toFixed(1) + 'px ' + monoFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(this.rowSums[r]), sumX + sumW * 0.5, y + 0.5 * m.sY);

            const sw = this.switchRects[r];
            const swg = ctx.createLinearGradient(sw.x, sw.y, sw.x + sw.w, sw.y + sw.h);
            swg.addColorStop(0, '#2B3544');
            swg.addColorStop(1, '#1B2532');
            ctx.fillStyle = swg;
            this._fillChamferRect(ctx, sw.x, sw.y, sw.w, sw.h, 7 * m.sX);
            this._strokeChamferRect(ctx, sw.x, sw.y, sw.w, sw.h, 7 * m.sX, '#7E9DBC', 1.5 * m.sX);
            ctx.fillStyle = '#E8F6FF';
            ctx.font = 'bold ' + (9.8 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.fillText('SWITCH ALL', sw.x + sw.w * 0.5, sw.y + sw.h * 0.58);

            for (let c = 0; c < 8; c++) {
                const cx = bulbsX + c * gap;
                const isOn = !!this.bulbs[r][c];
                const val = this.values[c];

                ctx.fillStyle = '#9DC8E8';
                ctx.font = 'bold ' + (10.2 * m.sY).toFixed(1) + 'px ' + monoFont;
                ctx.textAlign = 'center';
                ctx.fillText(String(val), cx, y - 26 * m.sY);

                const bulbGlow = isOn ? (0.45 + 0.3 * Math.sin(this.animTick * 0.16 + r * 0.7 + c * 0.25)) : 0.08;
                const bulbRad = ctx.createRadialGradient(cx, y, radius * 0.2, cx, y, radius * 1.9);
                if (isOn) {
                    bulbRad.addColorStop(0, 'rgba(255, 245, 122, 0.98)');
                    bulbRad.addColorStop(1, 'rgba(255, 188, 64, 0.0)');
                } else {
                    bulbRad.addColorStop(0, 'rgba(90, 106, 124, 0.45)');
                    bulbRad.addColorStop(1, 'rgba(64, 79, 95, 0.0)');
                }
                ctx.fillStyle = bulbRad;
                ctx.beginPath();
                ctx.arc(cx, y, radius * 2.0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = isOn ? '#FFD84A' : '#34485D';
                ctx.beginPath();
                ctx.arc(cx, y, radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = isOn ? '#FFFFFF' : '#6E7F93';
                ctx.lineWidth = (1.8 + bulbGlow * 1.2) * m.sX;
                ctx.beginPath();
                ctx.arc(cx, y, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.textBaseline = 'alphabetic';
    }

    _drawConfirm(ctx, m) {
        if (this.phase !== 'build' && this.phase !== 'cidr_entry') return;
        const primaryFont = this._uiPrimaryFont();
        const b = this.confirmRect;
        const active = this.phase === 'build' || this.phase === 'cidr_entry';
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        if (active) {
            g.addColorStop(0, '#1E5E2E');
            g.addColorStop(1, '#2E8D45');
        } else {
            g.addColorStop(0, '#2A343F');
            g.addColorStop(1, '#1C242F');
        }
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 9 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 9 * m.sX, active ? '#B4FFD0' : '#869AB0', 1.8 * m.sX);

        ctx.fillStyle = '#F4FCFF';
        ctx.font = 'bold ' + (15 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        const label = this.phase === 'cidr_entry' ? 'CONFIRM CIDR' : 'CONFIRM MASK';
        ctx.fillText(label, b.x + b.w * 0.5, b.y + b.h * 0.63);
    }

    _drawCIDRActionPanel(ctx, m) {
        const shellX = m.panelX + m.panelW * 0.35;
        const shellY = m.panelY + m.panelH * 0.765;
        const shellW = m.panelW * 0.30;
        const shellH = m.panelH * 0.20;
        const shell = ctx.createLinearGradient(shellX, shellY, shellX, shellY + shellH);
        shell.addColorStop(0, 'rgba(133,150,170,0.22)');
        shell.addColorStop(0.38, 'rgba(52,69,88,0.5)');
        shell.addColorStop(1, 'rgba(18,29,43,0.8)');
        ctx.fillStyle = shell;
        this._fillChamferRect(ctx, shellX, shellY, shellW, shellH, 10 * m.sX);
        this._strokeChamferRect(ctx, shellX, shellY, shellW, shellH, 10 * m.sX, 'rgba(112,173,220,0.75)', 1.4 * m.sX);

        ctx.globalAlpha = 0.2;
        for (let i = 0; i < 10; i++) {
            const y = shellY + 10 * m.sY + i * 8 * m.sY;
            ctx.fillStyle = '#8ACDEB';
            ctx.fillRect(shellX + 8 * m.sX, y, shellW - 16 * m.sX, 1.3 * m.sY);
        }
        ctx.globalAlpha = 1;
    }

    _drawCIDRInput(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const b = this.cidrInputRect;
        const focused = !!this.cidrInputFocused;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, focused ? '#17334C' : '#111C2A');
        g.addColorStop(1, focused ? '#255279' : '#0D1623');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 8 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 8 * m.sX, focused ? '#8FE7FF' : '#4A6A89', 2 * m.sX);

        ctx.fillStyle = '#CDE9FF';
        ctx.font = 'bold ' + (11.2 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.fillText('ENTER CIDR PREFIX', b.x + b.w * 0.5, b.y - 5 * m.sY);

        const text = this.cidrInput ? (this.cidrInput.startsWith('/') ? this.cidrInput : '/' + this.cidrInput) : '/';
        const caret = focused && ((this.animTick % 30) < 15) ? '|' : '';
        ctx.fillStyle = '#F4FDFF';
        ctx.font = 'bold ' + (19 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText(text + caret, b.x + b.w * 0.5, b.y + b.h * 0.66);
    }

    _drawIconPopup(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        ctx.save();
        ctx.filter = 'blur(' + (2.2 * m.sX).toFixed(1) + 'px)';
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(-6 * m.sX, -6 * m.sY, m.cW + 12 * m.sX, m.cH + 12 * m.sY);
        ctx.restore();

        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.globalAlpha = 0.18;
        for (let i = 0; i < 24; i++) {
            const y = (i / 24) * m.cH;
            ctx.fillStyle = i % 2 ? 'rgba(160,190,220,0.13)' : 'rgba(60,90,120,0.1)';
            ctx.fillRect(0, y, m.cW, 8 * m.sY);
        }
        ctx.globalAlpha = 1;

        const cardW = m.panelW * 0.4;
        const cardH = m.panelH * 0.27;
        const cardX = m.panelX + (m.panelW - cardW) * 0.5;
        const cardY = m.panelY + (m.panelH - cardH) * 0.5;
        const g = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        g.addColorStop(0, '#162637');
        g.addColorStop(1, '#0A1320');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, cardX, cardY, cardW, cardH, 10 * m.sX);
        this._strokeChamferRect(ctx, cardX, cardY, cardW, cardH, 10 * m.sX, '#4E81AD', 2 * m.sX);

        ctx.fillStyle = '#DDF0FF';
        ctx.font = 'bold ' + (16 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('SAVED OCTET ICON', cardX + 16 * m.sX, cardY + 28 * m.sY);

        const startX = cardX + cardW * 0.17;
        const y = cardY + cardH * 0.57;
        for (let i = 0; i < this.iconAnim.circles.length; i++) {
            const circle = this.iconAnim.circles[i];
            const cx = startX + i * (31 * m.sX);
            const glow = circle.borrowed ? (0.45 + 0.3 * Math.sin(this.animTick * 0.2 + i * 0.5)) : 0;
            ctx.fillStyle = circle.borrowed ? '#FFD84A' : '#5B6674';
            ctx.globalAlpha = circle.borrowed ? Math.min(1, 0.74 + glow * 0.4) : 0.78;
            ctx.beginPath();
            ctx.arc(cx, y, 10.8 * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#9FC2E0';
        ctx.font = 'bold ' + (16.5 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText(this.iconAnim.bitsBinary, cardX + 16 * m.sX, cardY + cardH - 16 * m.sY);
    }

    _drawIconFloat(ctx, m) {
        if (!this.iconAnim) return;
        const t = 1 - (this.phaseTimer / 90);
        const x = this.iconAnim.fromX + (this.iconAnim.toX - this.iconAnim.fromX) * t;
        const y = this.iconAnim.fromY + (this.iconAnim.toY - this.iconAnim.fromY) * t - Math.sin(t * Math.PI) * 28 * m.sY;
        const r = (22 - 14 * t) * m.sY;
        const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
        glow.addColorStop(0, 'rgba(255, 224, 88, 0.9)');
        glow.addColorStop(1, 'rgba(255, 224, 88, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFD84A';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.6 * m.sX;
        ctx.stroke();
    }

    _drawMiniWidget(ctx, m) {
        if (!this.iconAnim) return;
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const cardW = m.panelW * 0.24;
        const cardX = m.panelX + (m.panelW - cardW) * 0.5;
        const cardY = 8 * m.sY;
        const cardH = 48 * m.sY;
        const g = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        g.addColorStop(0, '#121D2A');
        g.addColorStop(1, '#0C1420');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, cardX, cardY, cardW, cardH, 8 * m.sX);
        this._strokeChamferRect(ctx, cardX, cardY, cardW, cardH, 8 * m.sX, '#4B6F90', 1.4 * m.sX);

        ctx.fillStyle = '#D5EEFF';
        ctx.font = 'bold ' + (9.4 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('OCTET WIDGET', cardX + 8 * m.sX, cardY + 13 * m.sY);

        const startX = cardX + 12 * m.sX;
        const cy = cardY + 28 * m.sY;
        for (let i = 0; i < this.iconAnim.circles.length; i++) {
            const circle = this.iconAnim.circles[i];
            const cx = startX + i * (14 * m.sX);
            const blink = circle.borrowed ? (0.5 + 0.45 * Math.sin(this.animTick * 0.22 + i * 0.35)) : 0.12;
            ctx.globalAlpha = circle.borrowed ? blink : 0.7;
            ctx.fillStyle = circle.borrowed ? '#FFD84A' : '#5C6775';
            ctx.beginPath();
            ctx.arc(cx, cy, 4.2 * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#9CC3E6';
        ctx.font = 'bold ' + (9.3 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText(this.iconAnim.bitsBinary, cardX + 12 * m.sX, cardY + cardH - 7 * m.sY);
    }

    _drawStatusBar(ctx, m) {
        if (!this.statusText) return;
        const monoFont = this._uiMonoFont();
        const x = m.panelX + m.panelW * 0.23;
        const y = m.panelY + m.panelH * 0.13;
        const w = m.panelW * 0.54;
        const h = 22 * m.sY;
        const g = ctx.createLinearGradient(x, y, x + w, y);
        g.addColorStop(0, 'rgba(28, 62, 86, 0.7)');
        g.addColorStop(1, 'rgba(24, 46, 70, 0.68)');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, x, y, w, h, 6 * m.sX);
        this._strokeChamferRect(ctx, x, y, w, h, 6 * m.sX, 'rgba(140,219,255,0.75)', 1.1 * m.sX);
        ctx.fillStyle = '#D5F2FF';
        ctx.font = 'bold ' + (9.8 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textAlign = 'center';
        ctx.fillText(this.statusText, x + w * 0.5, y + h * 0.66);
    }

    _drawSparks(ctx, m) {
        for (let i = 0; i < this.sparks.length; i++) {
            const p = this.sparks[i];
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    _drawPhaseOverlay(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        if (this.phase === 'calculating') {
            ctx.fillStyle = 'rgba(82, 219, 255, 0.08)';
            ctx.fillRect(0, 0, m.cW, m.cH);
            ctx.fillStyle = '#C9EEFF';
            ctx.font = 'bold ' + (13 * m.sY).toFixed(1) + 'px ' + monoFont;
            ctx.textAlign = 'center';
            ctx.fillText('RUNNING OCTET SUM VERIFICATION...', m.cW * 0.5, m.panelY + m.panelH * 0.94);
            return;
        }
        if (this.phase === 'success') {
            ctx.fillStyle = 'rgba(68, 255, 150, 0.16)';
            ctx.fillRect(0, 0, m.cW, m.cH);
            ctx.fillStyle = '#F4FFF8';
            ctx.font = 'bold ' + (30 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'center';
            ctx.fillText('CIDR LOCK CONFIRMED', m.cW * 0.5, m.cH * 0.5);
            return;
        }
        if (this.phase === 'fail') {
            ctx.fillStyle = 'rgba(255, 52, 78, 0.13)';
            ctx.fillRect(0, 0, m.cW, m.cH);
            if (this.failReason) {
                ctx.fillStyle = '#FFD3DA';
                ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + monoFont;
                ctx.textAlign = 'center';
                ctx.fillText(this.failReason, m.cW * 0.5, m.panelY + m.panelH * 0.94);
            }
        }
    }

    _emitRowPulse(row, color) {
        const m = this._metrics();
        const rowGap = m.mainH / 4;
        const y = m.mainY + 45 * m.sY + row * rowGap;
        const x = m.mainX + 116 * m.sX;
        for (let i = 0; i < 10; i++) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 0.8 + Math.random() * 1.8;
            this.sparks.push({
                x,
                y,
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp,
                life: 12 + Math.floor(Math.random() * 14),
                maxLife: 26,
                color: color || '#FFD84A',
                size: 1 + Math.random() * 2.3,
            });
        }
    }

    _emitFailureSparks() {
        const m = this._metrics();
        const rowGap = m.mainH / 4;
        const rowBaseY = m.mainY + 45 * m.sY;
        const bulbsX = m.mainX + 180 * m.sX;
        const gap = 58 * m.sX;
        for (let r = 0; r < 4; r++) {
            const y = rowBaseY + r * rowGap;
            for (let c = 0; c < 8; c++) {
                const x = bulbsX + c * gap;
                for (let i = 0; i < 4; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const sp = 1.2 + Math.random() * 2.5;
                    this.sparks.push({
                        x,
                        y,
                        vx: Math.cos(ang) * sp,
                        vy: Math.sin(ang) * sp - 0.4,
                        life: 14 + Math.floor(Math.random() * 15),
                        maxLife: 29,
                        color: i % 2 ? '#FF5D73' : '#FFD84A',
                        size: 1.2 + Math.random() * 2.8,
                    });
                }
            }
        }
    }

    _pointInRect(x, y, rect) {
        return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    _traceChamferPath(ctx, x, y, w, h, cut) {
        const inset = Math.max(0, Math.min(Math.abs(cut || 0), w * 0.22, h * 0.22));
        ctx.beginPath();
        ctx.moveTo(x + inset, y);
        ctx.lineTo(x + w - inset, y);
        ctx.lineTo(x + w, y + inset);
        ctx.lineTo(x + w, y + h - inset);
        ctx.lineTo(x + w - inset, y + h);
        ctx.lineTo(x + inset, y + h);
        ctx.lineTo(x, y + h - inset);
        ctx.lineTo(x, y + inset);
        ctx.closePath();
    }

    _fillChamferRect(ctx, x, y, w, h, cut, fill) {
        if (fill) ctx.fillStyle = fill;
        this._traceChamferPath(ctx, x, y, w, h, cut);
        ctx.fill();
    }

    _strokeChamferRect(ctx, x, y, w, h, cut, stroke, lineWidth) {
        if (stroke) ctx.strokeStyle = stroke;
        if (lineWidth) ctx.lineWidth = lineWidth;
        this._traceChamferPath(ctx, x, y, w, h, cut);
        ctx.stroke();
    }

    _uiPrimaryFont() {
        return (IP2Live.Assets && IP2Live.Assets.nebulaLoaded) ? 'Nebula-Regular' : 'monospace';
    }

    _uiMonoFont() {
        return (IP2Live.Assets && IP2Live.Assets.nebulaLoaded) ? 'Nebula-Regular' : 'monospace';
    }

    _uiTitleFont() {
        if (IP2Live.Assets && IP2Live.Assets.abnesLoaded) return 'Abnes';
        return this._uiPrimaryFont();
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

const CIDRPanelGameplayManager = {
    VERSION: 'ip-cidrpanel-gameplay-manager-20260528-01',
    _active: false,
    _introShown: false,
    _activeAttempt: null,
    _registeredQuestIds: {},
    _triggerLocks: {},

    CIDR_PANEL_QUESTS: [
        {
            id: 'stage.5.ip_cidr_panel.01',
            objectiveId: 'solve_cidr_panel_01',
            title: 'SOLVE CIDR BINARY PANEL',
            label: 'CIDR Binary Panel',
            targetTile: { x: 16, y: 0, z: 18 },
        },
    ],

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_cidr_binary_panel');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return this.CIDR_PANEL_QUESTS;
    },

    _defaultQuestSpec() {
        const specs = this._questSpecs();
        return specs[0] || this.CIDR_PANEL_QUESTS[0];
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !stage || Number(stage.id) !== 5) return [];

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
                stageMapId: stage.id,
                resetOnMapEnter: true,
                objectives: [
                    {
                        id: spec.objectiveId,
                        title: spec.title,
                        detail: this._targetDetail(target),
                        targetTile: target,
                        completionRadiusTiles: 0.55,
                        isComplete: (context, activeQuestManager) => {
                            return CIDRPanelGameplayManager._handleCIDRObjective(spec, context, activeQuestManager);
                        },
                    },
                ],
            });
            this._registeredQuestIds[spec.id] = true;
        }
        return questIds;
    },

    _targetDetail(tile) {
        return 'TARGET TILE  X:' + tile.x + '  Y:' + (tile.y || 0) + '  Z:' + tile.z;
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

    _handleCIDRObjective(spec, context, questManager) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;
        const objective = qm.currentObjective();
        if (!objective || objective.id !== spec.objectiveId) return false;
        const dist = qm.distanceToObjective(objective, context && context.hero);
        const radius = typeof objective.completionRadiusTiles === 'number' ? objective.completionRadiusTiles : 0.55;

        this._refreshTriggerLock(spec, dist, radius);
        if (dist === null || dist > radius) return false;
        if (this._triggerLocks[spec.objectiveId]) return false;

        const attemptKey = this._resolveAttemptKey({
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
        });
        if (this._activeAttempt === attemptKey || this._active) return false;
        this._activeAttempt = attemptKey;

        const launchOptions = {
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId: Number(context && context.mapId) || Number(spec.mapId) || 7,
            targetMask: spec.targetMask,
            handoffKey: spec.handoffKey,
            _fromObjective: true,
            tutorialMode: true,
        };

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_cidr_binary_panel', Object.assign({}, launchOptions, {
                showIntro: !this._introShown,
                _reservedAttempt: attemptKey,
            }));
            return false;
        }

        this.launchCIDRGameplay(Object.assign({}, launchOptions, { mode: 'replace', showIntro: !this._introShown }));
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
        Screen2.show({
            mode: opts.mode || 'replace',
            status: opts.status || 'Loading Gameplay',
            detail: opts.detail || 'Synchronizing transition',
            onComplete: typeof opts.onComplete === 'function' ? opts.onComplete : null,
        });
        return true;
    },

    launchCIDRGameplay(options) {
        const opts = options || {};
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;

        const open = () => {
            const screen = new IP2LiveCIDRPanelGameplayScreen({
                targetMask: opts.targetMask,
                handoffKey: opts.handoffKey,
                tutorialMode: !!opts.tutorialMode,
                onComplete: (result) => this._onComplete(opts, result),
                onCancel: () => this._onCancel(opts),
            });

            const openGameplay = () => {
                this._playMusicZone('GAMEPLAY_1');
                if (Manager && Manager.Stack && typeof Manager.Stack.replace === 'function') {
                    Manager.Stack.replace(screen);
                } else if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
                    Manager.Stack.push(screen);
                }
            };

            if (opts.useLoading !== false && this._showLoadingScreen2({
                mode: 'push',
                status: opts.loadingStatus || 'Loading Gameplay',
                detail: opts.loadingDetail || 'Opening CIDR Binary Panel',
                onComplete: openGameplay,
            })) {
                return;
            }
            openGameplay();
        };

        const openSafely = () => {
            try {
                open();
            } catch (e) {
                this._active = false;
                this._activeAttempt = null;
                console.warn('[IP2Live] CIDRPanelGameplayManager failed to open gameplay:', e);
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            }
        };

        const shouldShowIntro = opts.showIntro !== false && !this._introShown;
        if (shouldShowIntro && IP2Live.IPCIDRPanelTutorial && typeof IP2Live.IPCIDRPanelTutorial.showIntro === 'function') {
            this._introShown = true;
            const previewMask = opts.targetMask || '255.255.255.224';
            IP2Live.IPCIDRPanelTutorial.showIntro(previewMask, openSafely);
        } else {
            openSafely();
        }

        return true;
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
                IP2Live.GameManager.handleGameplayCompleted('ip_cidr_binary_panel', {
                    gameplayId: 'ip_cidr_binary_panel',
                    result,
                });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Returning to Stage',
            onComplete: finalizeExit,
        })) {
            finalizeExit();
        }
    },

    _onCancel(options) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);

        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            if (typeof opts.onCancel === 'function') opts.onCancel();
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_cidr_binary_panel', {
                    gameplayId: 'ip_cidr_binary_panel',
                    reason: 'cancelled',
                });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Returning to Stage 1 Level 3',
            onComplete: finalizeExit,
        })) {
            finalizeExit();
        }
    },
};

IP2Live.CIDRPanelGameplayManager = CIDRPanelGameplayManager;
IP2Live.CIDRPanelGameplayScreen = IP2LiveCIDRPanelGameplayScreen;
window.IP2LiveCIDRPanelGameplayManager = CIDRPanelGameplayManager;
window.IP2LiveCIDRPanelGameplayScreen = IP2LiveCIDRPanelGameplayScreen;
window.startCIDRGameplayThree = function (options) {
    return CIDRPanelGameplayManager.launchCIDRGameplay(options || {});
};

console.log('[IP2Live] ip_cidrpanel_gameplay.js module loaded.');
