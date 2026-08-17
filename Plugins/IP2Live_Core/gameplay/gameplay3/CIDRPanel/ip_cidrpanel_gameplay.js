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
        this.guidedTutorial = !!this.options.guidedTutorial;
        this.tutorialActive = this.guidedTutorial;
        this.tutorialComplete = !this.guidedTutorial;
        this.tutorialStep = this.guidedTutorial ? 'target_intro' : 'done';
        this.tutorialPaused = this.guidedTutorial;
        this.tutorialDialogueOpen = false;
        this.tutorialHighlight = null;
        this.tutorialSpotlightTimer = 0;
        this.tutorialSpotlightComplete = null;
        this.targetMask = this._resolveTargetMask(this.options.targetMask);
        this.targetOctets = this._parseMask(this.targetMask);
        this.targetBits = this._octetsToBits(this.targetOctets);
        this.targetCIDR = this._maskToCIDR(this.targetBits);
        this.targetClass = this.generatedTargetClass || this._classForCIDR(this.targetCIDR);
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
        this.enforceAttemptLimit = !!this.options.enforceAttemptLimit;
        this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 3);
        this.attemptsExhausted = false;
        this.lastFailure = null;
        this._resetBulbs();
    }

    _resolveTargetMask(mask) {
        const parsed = this._parseMask(mask);
        const forceRandom = !!(this.options && this.options.randomizeTarget);
        const resolved = (!forceRandom && parsed && parsed[3] !== 255)
            ? parsed.join('.')
            : this._randomUniqueTargetMask();
        if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
        if (!IP2Live.CIDRGameplayState.generatedMasks) IP2Live.CIDRGameplayState.generatedMasks = {};
        IP2Live.CIDRGameplayState.lastGeneratedMask = resolved;
        IP2Live.CIDRGameplayState.generatedMasks[resolved] = true;
        return resolved;
    }

    _randomUniqueTargetMask() {
        const allClasses = [
            // Keep the partially filled octet inside the class's native mask
            // boundary so each generated mask is visibly A, B, or C.
            { name: 'A', minCIDR: 9, maxCIDR: 15 },
            { name: 'B', minCIDR: 17, maxCIDR: 23 },
            { name: 'C', minCIDR: 25, maxCIDR: 31 },
        ];
        const requestedClass = String((this.options && this.options.targetClass) || '').trim().toUpperCase();
        const requestedClasses = Array.isArray(this.options && this.options.targetClasses)
            ? this.options.targetClasses.map((name) => String(name || '').trim().toUpperCase())
            : [];
        let classes = allClasses.filter((entry) => {
            if (requestedClass) return entry.name === requestedClass;
            if (requestedClasses.length) return requestedClasses.indexOf(entry.name) !== -1;
            return true;
        });
        if (!classes.length) classes = allClasses.slice();
        if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
        if (!IP2Live.CIDRGameplayState.generatedMasks) IP2Live.CIDRGameplayState.generatedMasks = {};
        let lastMask = null;
        if (IP2Live.CIDRGameplayState && IP2Live.CIDRGameplayState.lastGeneratedMask) {
            lastMask = String(IP2Live.CIDRGameplayState.lastGeneratedMask);
        } else if (IP2Live.CIDRGameplayState && IP2Live.CIDRGameplayState.latest && IP2Live.CIDRGameplayState.latest.mask) {
            lastMask = String(IP2Live.CIDRGameplayState.latest.mask);
        }

        const selectedClass = classes[Math.floor(Math.random() * classes.length)] || classes[0];
        const orderedClasses = [selectedClass].concat(classes.filter((entry) => entry !== selectedClass));
        const fresh = [];
        for (let ci = 0; ci < orderedClasses.length; ci++) {
            const cls = orderedClasses[ci];
            for (let cidr = cls.minCIDR; cidr <= cls.maxCIDR; cidr++) {
                const mask = this._cidrToMask(cidr);
                if (!mask) continue;
                if (mask === lastMask) continue;
                if (IP2Live.CIDRGameplayState.generatedMasks[mask]) continue;
                fresh.push({ mask, className: cls.name, preferred: cls === selectedClass });
            }
        }
        if (fresh.length > 0) {
            const preferredFresh = fresh.filter((entry) => entry.preferred);
            const pool = preferredFresh.length ? preferredFresh : fresh;
            const chosen = pool[Math.floor(Math.random() * pool.length)];
            this.generatedTargetClass = chosen.className;
            return chosen.mask;
        }

        for (let tries = 0; tries < 32; tries++) {
            const cls = classes[Math.floor(Math.random() * classes.length)];
            const cidr = cls.minCIDR + Math.floor(Math.random() * (cls.maxCIDR - cls.minCIDR + 1));
            const mask = this._cidrToMask(cidr);
            if (!mask) continue;
            if (mask !== lastMask) {
                this.generatedTargetClass = cls.name;
                return mask;
            }
        }
        const fallbackClass = classes[0] || allClasses[2];
        this.generatedTargetClass = fallbackClass.name;
        return this._cidrToMask(fallbackClass.minCIDR) || '255.255.255.192';
    }

    _classForCIDR(cidr) {
        const prefix = Number(cidr);
        if (prefix >= 25) return 'C';
        if (prefix >= 17) return 'B';
        return 'A';
    }

    _mistakesUsed() {
        return Math.max(0, Number(this.maskFailures || 0) + Number(this.cidrFailures || 0));
    }

    _attemptsRemaining() {
        if (!this.enforceAttemptLimit) return 0;
        return Math.max(0, this.maxAttempts - this._mistakesUsed());
    }

    _attemptLimitReached() {
        return this.enforceAttemptLimit && this._mistakesUsed() >= this.maxAttempts;
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

        this._updateGuidedTutorial();

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

    _updateGuidedTutorial() {
        if (!this.tutorialActive || this.tutorialComplete) return;

        if (this.tutorialSpotlightTimer > 0) {
            this.tutorialSpotlightTimer--;
            if (this.tutorialSpotlightTimer <= 0) {
                const complete = this.tutorialSpotlightComplete;
                this.tutorialSpotlightComplete = null;
                this.tutorialHighlight = null;
                if (typeof complete === 'function') complete();
            }
            return;
        }

        if (this.tutorialDialogueOpen || this._isGuidedDialogueActive()) return;

        if (this.tutorialStep === 'target_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'target_dialogue';
            this._showGuidedTargetDialogue();
            return;
        }

        if (this.tutorialStep === 'lamps_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'lamps_dialogue';
            this._showGuidedLampDialogue();
            return;
        }

        if (this.tutorialStep === 'controls_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'controls_dialogue';
            this._showGuidedControlsDialogue();
            return;
        }

        if (this.tutorialStep === 'wait_cidr' && this.phase === 'cidr_entry') {
            this.tutorialPaused = true;
            this.tutorialStep = 'cidr_dialogue';
            this._showGuidedCIDRDialogue();
        }
    }

    _setGuidedDialogueOpen(isOpen) {
        this.tutorialDialogueOpen = !!isOpen;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _isGuidedDialogueActive() {
        return !!(
            this.tutorialActive &&
            this.tutorialDialogueOpen &&
            IP2Live.DialogueManager &&
            typeof IP2Live.DialogueManager.isActive === 'function' &&
            IP2Live.DialogueManager.isActive()
        );
    }

    _showTutorialSpotlight(highlight, duration, onComplete) {
        this.tutorialPaused = true;
        this.tutorialHighlight = Object.assign({}, highlight || {});
        this.tutorialSpotlightTimer = Math.max(60, Number(duration) || 120);
        this.tutorialSpotlightComplete = typeof onComplete === 'function' ? onComplete : null;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _showGuidedTargetDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'target_mask',
                label: '01 // SUBNET MASK TO MATCH',
            }, 120, () => {
                this.tutorialStep = 'lamps_intro';
            });
        };
        const tutorial = IP2Live.IPCIDRPanelTutorial;
        if (tutorial && typeof tutorial.showTargetMaskGuide === 'function') {
            tutorial.showTargetMaskGuide(this.targetMask, done);
        } else {
            done();
        }
    }

    _showGuidedLampDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'lamp_array',
                label: '02 // FOUR-OCTET BINARY LAMP ARRAY',
            }, 135, () => {
                this.tutorialStep = 'controls_intro';
            });
        };
        const tutorial = IP2Live.IPCIDRPanelTutorial;
        if (tutorial && typeof tutorial.showLampArrayGuide === 'function') {
            tutorial.showLampArrayGuide(done);
        } else {
            done();
        }
    }

    _showGuidedControlsDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'lamp_controls',
                label: '03 // INDIVIDUAL BULBS + ALL ON / ALL OFF',
            }, 150, () => {
                this.tutorialPaused = false;
                this.tutorialStep = 'wait_cidr';
            });
        };
        const tutorial = IP2Live.IPCIDRPanelTutorial;
        if (tutorial && typeof tutorial.showLampControlsGuide === 'function') {
            tutorial.showLampControlsGuide(done);
        } else {
            done();
        }
    }

    _showGuidedCIDRDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'cidr_entry',
                label: '04 // COUNT ON BULBS, ENTER /CIDR, VERIFY',
            }, 165, () => {
                this.tutorialPaused = false;
                this.tutorialActive = false;
                this.tutorialComplete = true;
                this.tutorialStep = 'done';
            });
        };
        const tutorial = IP2Live.IPCIDRPanelTutorial;
        if (tutorial && typeof tutorial.showCIDRGuide === 'function') {
            tutorial.showCIDRGuide(this.targetMask, done);
        } else {
            done();
        }
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
        if (this.tutorialPaused) return true;
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
        if (this.tutorialPaused) return true;
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
                const allOn = this.bulbs[sw.row].every((value) => !!value);
                for (let c = 0; c < this.totalCols; c++) this.bulbs[sw.row][c] = !allOn;
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
        this.attemptsExhausted = this._attemptLimitReached();
        this.lastFailure = {
            kind: 'mask',
            expected: this.targetMask,
            submitted: this._currentBulbBinary(),
        };
        if (this.attemptsExhausted) {
            this.statusText = 'THREE ATTEMPTS EXHAUSTED. RETURNING TO CIDR TRAINING.';
        }
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
        this.attemptsExhausted = this._attemptLimitReached();
        this.lastFailure = {
            kind: 'cidr',
            expected: this.targetCIDR,
            submitted: enteredCIDR,
        };
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
        if (this.attemptsExhausted) {
            this.phase = 'fail';
            this.phaseTimer = 34;
            this.failResetQueued = false;
            this.failCorrectionActive = false;
            this.statusText = 'THREE ATTEMPTS EXHAUSTED. RETURNING TO CIDR TRAINING.';
            for (let r = 0; r < this.totalRows; r++) this.rowErrorGlow[r] = 75;
            this._emitFailureSparks();
        }
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
            mapId: this.options.mapId || 7,
            questId: this.options.questId,
            objectiveId: this.options.objectiveId,
            mistakes: [mistake],
            attemptsRemaining: this._attemptsRemaining(),
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
        if (this.attemptsExhausted) {
            this._failOut();
            return;
        }
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
            targetClass: this.targetClass,
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
            targetClass: this.targetClass,
            cidr: this.targetCIDR,
            enteredCIDR: enteredCIDR,
            retries: Math.max(0, this.maskFailures + this.cidrFailures),
            attemptsUsed: Math.max(1, this._mistakesUsed() + 1),
            maxAttempts: this.enforceAttemptLimit ? this.maxAttempts : 0,
            maskConfirmAttempts: this.maskConfirmAttempts,
            cidrVerifyAttempts: this.cidrVerifyAttempts,
            firstTrySuccess: (this.maskFailures + this.cidrFailures) === 0,
            interestingOctetIndex: icon.octetIndex,
            bitsBinary: icon.bitsBinary,
        };
    }

    _failOut() {
        if (this.finished) return;
        this.finished = true;
        const result = {
            gameplayId: this.options.gameplayId || 'ip_cidr_binary_panel',
            handoffKey: this.options.handoffKey || null,
            passed: false,
            reason: 'attempts_exhausted',
            mask: this.targetMask,
            targetClass: this.targetClass,
            cidr: this.targetCIDR,
            attemptsUsed: this._mistakesUsed(),
            maxAttempts: this.maxAttempts,
            retries: this._mistakesUsed(),
            lastFailure: this.lastFailure ? Object.assign({}, this.lastFailure) : null,
        };
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed(result);
            return;
        }
        if (typeof this.options.onCancel === 'function') this.options.onCancel();
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
        if (this.phase === 'build' || this.phase === 'calculating' || this.phase === 'fail' || this.phase === 'cidr_entry') {
            this._drawTargetMaskCard(ctx, m);
            this._drawCIDRActionPanel(ctx, m);
            this._drawCIDRInput(ctx, m);
        }
        this._drawConfirm(ctx, m);
        if (this.phase === 'icon_popup' && this.iconAnim) this._drawIconPopup(ctx, m);
        if (this.phase === 'icon_float' && this.iconAnim) this._drawIconFloat(ctx, m);
        if (this.miniWidgetVisible && this.iconAnim) this._drawMiniWidget(ctx, m);
        this._drawSparks(ctx, m);
        this._drawPhaseOverlay(ctx, m);
        this._drawTutorialHighlight(ctx, m);
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
        const lowerDeckH = 116 * sY;
        const panelH = cH - panelY * 2 - lowerDeckH;

        const mainX = panelX + panelW * 0.12;
        const mainY = panelY + panelH * 0.20 - 8 * sY;
        const mainW = panelW * 0.76;
        const mainH = panelH * 0.78;

        return { cW, cH, sX, sY, panelX, panelY, panelW, panelH, mainX, mainY, mainW, mainH };
    }

    _cidrTerminalLayout(m) {
        const deckX = m.panelX + 28 * m.sX;
        const deckRight = m.panelX + m.panelW - 28 * m.sX;
        const deckY = m.panelY + m.panelH + 32 * m.sY;
        const availableH = m.cH - deckY - 16 * m.sY;
        const deckH = Math.min(94 * m.sY, availableH);
        const gap = 18 * m.sX;
        const confirmW = 88 * m.sX;
        const cardW = (deckRight - deckX - confirmW - gap * 2) * 0.5;
        const targetX = deckX;
        const shellX = targetX + cardW + gap;
        const confirmX = shellX + cardW + gap;
        return {
            targetX,
            targetY: deckY,
            targetW: cardW,
            targetH: deckH,
            shellX,
            shellY: deckY,
            shellW: cardW,
            shellH: deckH,
            input: {
                x: shellX + 18 * m.sX,
                y: deckY + 38 * m.sY,
                w: cardW - 36 * m.sX,
                h: 32 * m.sY,
            },
            confirm: {
                x: confirmX,
                y: deckY + 8 * m.sY,
                w: confirmW,
                h: Math.min(78 * m.sY, deckH - 16 * m.sY),
            },
        };
    }

    _buildInteractionRects(m) {
        this.bulbRects = [];
        this.switchRects = [];
        const rowGap = (m.mainH - 119 * m.sY) / 3;
        const rowBaseY = m.mainY + 64 * m.sY;
        const bulbsX = m.mainX + 155 * m.sX;
        const gap = 58 * m.sX;
        const radius = 14.5 * m.sY;
        const bw = radius * 2.05;
        const bh = radius * 2.05;
        for (let r = 0; r < 4; r++) {
            const y = rowBaseY + r * rowGap;
            const sw = {
                row: r,
                x: m.mainX + m.mainW - 132 * m.sX,
                y: y - 18 * m.sY,
                w: 104 * m.sX,
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
        const terminal = this._cidrTerminalLayout(m);
        this.confirmRect = terminal.confirm;
        this.cidrInputRect = terminal.input;
    }

    _drawTutorialHighlight(ctx, m) {
        if (!this.tutorialHighlight || !this.tutorialPaused) return;
        const focus = this._tutorialHighlightRects(m);
        if (!focus || !focus.rects || !focus.rects.length) return;

        const pulse = 0.55 + 0.45 * Math.sin((this.animTick || 0) * 0.16);
        const cut = Math.max(5 * m.sX, 4);
        const rects = focus.rects;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, m.cW, m.cH);
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            ctx.rect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.fillStyle = 'rgba(0, 3, 9, 0.76)';
        ctx.fill('evenodd');

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            const accent = i === 0 ? '#FFE600' : '#00F0FF';
            ctx.shadowColor = accent;
            ctx.shadowBlur = (12 + pulse * 13) * m.sX;
            ctx.fillStyle = i === 0 ? 'rgba(255,230,0,0.10)' : 'rgba(0,240,255,0.09)';
            this._fillChamferRect(ctx, rect.x, rect.y, rect.w, rect.h, cut);
            ctx.strokeStyle = accent;
            ctx.globalAlpha = 0.78 + pulse * 0.22;
            ctx.lineWidth = (i === 0 ? 3 : 2.2) * m.sX;
            this._strokeChamferRect(ctx, rect.x, rect.y, rect.w, rect.h, cut);
            ctx.globalAlpha = 1;

            const sweepH = Math.max(2 * m.sY, rect.h * 0.045);
            const sweepRange = Math.max(1, rect.h - sweepH);
            const sweepY = rect.y + ((this.animTick * 2.4 + i * 21) % sweepRange);
            ctx.shadowBlur = 8 * m.sX;
            ctx.fillStyle = i === 0 ? 'rgba(255,230,0,0.34)' : 'rgba(0,240,255,0.27)';
            ctx.fillRect(rect.x + cut, sweepY, Math.max(0, rect.w - cut * 2), sweepH);
        }

        const anchor = rects[0];
        const label = String(focus.label || this.tutorialHighlight.label || 'SYSTEM FOCUS');
        const labelH = 19 * m.sY;
        const labelY = Math.max(8 * m.sY, anchor.y - labelH - 8 * m.sY);
        const desiredW = Math.max(210 * m.sX, label.length * 7.2 * m.sX);
        const labelW = Math.min(desiredW, m.cW - anchor.x - 10 * m.sX);
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 9 * m.sX;
        this._fillChamferRect(ctx, anchor.x, labelY, labelW, labelH, 5 * m.sX, '#FFE600');
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#05070A';
        ctx.font = 'bold ' + (7.2 * m.sY).toFixed(1) + 'px ' + this._uiMonoFont();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, anchor.x + 10 * m.sX, labelY + labelH * 0.55);
        ctx.restore();
    }

    _tutorialHighlightRects(m) {
        const highlight = this.tutorialHighlight || {};
        const clampRect = (rect) => {
            const padX = 8 * m.sX;
            const padY = 8 * m.sY;
            const x = Math.max(padX, rect.x);
            const y = Math.max(padY, rect.y);
            return {
                x,
                y,
                w: Math.max(18 * m.sX, Math.min(rect.x + rect.w, m.cW - padX) - x),
                h: Math.max(18 * m.sY, Math.min(rect.y + rect.h, m.cH - padY) - y),
            };
        };
        const boundsOf = (rects, paddingX, paddingY) => {
            if (!rects || !rects.length) return null;
            let left = rects[0].x;
            let top = rects[0].y;
            let right = rects[0].x + rects[0].w;
            let bottom = rects[0].y + rects[0].h;
            for (let i = 1; i < rects.length; i++) {
                const rect = rects[i];
                left = Math.min(left, rect.x);
                top = Math.min(top, rect.y);
                right = Math.max(right, rect.x + rect.w);
                bottom = Math.max(bottom, rect.y + rect.h);
            }
            const px = Number(paddingX) || 0;
            const py = Number(paddingY) || 0;
            return clampRect({ x: left - px, y: top - py, w: right - left + px * 2, h: bottom - top + py * 2 });
        };
        const result = { rects: [], label: highlight.label || '' };
        const terminal = this._cidrTerminalLayout(m);

        if (highlight.type === 'target_mask') {
            result.rects.push(clampRect({
                x: terminal.targetX - 8 * m.sX,
                y: terminal.targetY - 13 * m.sY,
                w: terminal.targetW + 16 * m.sX,
                h: terminal.targetH + 21 * m.sY,
            }));
            return result;
        }

        if (highlight.type === 'lamp_array') {
            result.rects.push(clampRect({
                x: m.mainX - 10 * m.sX,
                y: m.mainY - 12 * m.sY,
                w: m.mainW + 20 * m.sX,
                h: m.mainH + 22 * m.sY,
            }));
            return result;
        }

        if (highlight.type === 'lamp_controls') {
            const lampBounds = boundsOf(this.bulbRects, 18 * m.sX, 18 * m.sY);
            const switchBounds = boundsOf(this.switchRects, 9 * m.sX, 9 * m.sY);
            if (lampBounds) result.rects.push(lampBounds);
            if (switchBounds) result.rects.push(switchBounds);
            return result;
        }

        if (highlight.type === 'cidr_entry') {
            result.rects.push(clampRect({
                x: terminal.shellX - 8 * m.sX,
                y: terminal.shellY - 13 * m.sY,
                w: terminal.shellW + 16 * m.sX,
                h: terminal.shellH + 21 * m.sY,
            }));
            result.rects.push(clampRect({
                x: terminal.confirm.x - 7 * m.sX,
                y: terminal.confirm.y - 7 * m.sY,
                w: terminal.confirm.w + 14 * m.sX,
                h: terminal.confirm.h + 14 * m.sY,
            }));
            return result;
        }

        return null;
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
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 22 * m.sX;
        ctx.shadowOffsetY = 9 * m.sY;
        const g = ctx.createLinearGradient(m.panelX, m.panelY, m.panelX, m.panelY + m.panelH);
        g.addColorStop(0, '#202B35');
        g.addColorStop(0.035, '#0A0F15');
        g.addColorStop(0.5, '#111922');
        g.addColorStop(0.965, '#070B10');
        g.addColorStop(1, '#34434E');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 16 * m.sX);
        ctx.shadowColor = 'transparent';
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 16 * m.sX, '#425665', 3 * m.sX);
        this._strokeChamferRect(ctx, m.panelX + 9 * m.sX, m.panelY + 9 * m.sY, m.panelW - 18 * m.sX, m.panelH - 18 * m.sY, 11 * m.sX, 'rgba(0,240,255,0.38)', 1.2 * m.sX);

        this._drawMetalTexture(ctx, m.panelX + 13 * m.sX, m.panelY + 13 * m.sY, m.panelW - 26 * m.sX, m.panelH - 26 * m.sY, m, 0.16);

        const railTop = m.panelY + 72 * m.sY;
        const railBottom = m.panelY + m.panelH - 22 * m.sY;
        [m.panelX + 12 * m.sX, m.panelX + m.panelW - 12 * m.sX].forEach((rx) => {
            const rail = ctx.createLinearGradient(rx - 6 * m.sX, 0, rx + 6 * m.sX, 0);
            rail.addColorStop(0, '#030507');
            rail.addColorStop(0.28, '#53646E');
            rail.addColorStop(0.5, '#A6B3B8');
            rail.addColorStop(0.68, '#26343D');
            rail.addColorStop(1, '#020304');
            ctx.fillStyle = rail;
            ctx.fillRect(rx - 6 * m.sX, railTop, 12 * m.sX, railBottom - railTop);
            for (let i = 0; i < 4; i++) this._drawFastener(ctx, rx, railTop + (railBottom - railTop) * (i / 3), 4.8 * m.sX, m);
        });

        ctx.fillStyle = '#00E7F2';
        ctx.globalAlpha = 0.48;
        ctx.fillRect(m.panelX + 30 * m.sX, m.panelY + 68 * m.sY, m.panelW - 60 * m.sX, 1.5 * m.sY);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawHeader(ctx, m) {
        const titleFont = this._uiTitleFont();
        const bx = m.panelX + 22 * m.sX;
        const by = m.panelY + 12 * m.sY;
        const bw = 490 * m.sX;
        const bh = 54 * m.sY;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.82)';
        ctx.shadowBlur = 12 * m.sX;
        ctx.shadowOffsetY = 5 * m.sY;
        const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        g.addColorStop(0, '#202A34');
        g.addColorStop(0.18, '#090D13');
        g.addColorStop(0.74, '#111821');
        g.addColorStop(1, '#030508');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, bx, by, bw, bh, 11 * m.sX);
        ctx.shadowColor = 'transparent';
        this._strokeChamferRect(ctx, bx, by, bw, bh, 11 * m.sX, 'rgba(180,205,217,0.25)', 1 * m.sX);

        ctx.beginPath();
        ctx.moveTo(bx, by + 8 * m.sY);
        ctx.lineTo(bx + 70 * m.sX, by);
        ctx.lineTo(bx + 62 * m.sX, by + bh);
        ctx.lineTo(bx, by + bh - 8 * m.sY);
        ctx.closePath();
        const badge = ctx.createLinearGradient(bx, by, bx + 70 * m.sX, by + bh);
        badge.addColorStop(0, '#FF315F');
        badge.addColorStop(0.62, '#B50032');
        badge.addColorStop(1, '#4A071C');
        ctx.fillStyle = badge;
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(7 * m.sX) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('IP2', bx + 28 * m.sX, by + 19 * m.sY);
        ctx.fillStyle = '#FFE600';
        ctx.fillText('C-03', bx + 28 * m.sX, by + 34 * m.sY);

        const titleX = bx + 82 * m.sX;
        const titleY = by + 31 * m.sY;
        let titleSize = 19;
        let cidrW = 0;
        let calcW = 0;
        let panelWordW = 0;
        do {
            ctx.font = 'bold ' + Math.round(titleSize * m.sX) + 'px ' + titleFont;
            cidrW = ctx.measureText('CIDR').width;
            calcW = ctx.measureText('CALCULATION').width;
            panelWordW = ctx.measureText('PANEL').width;
            titleSize--;
        } while (titleSize > 13 && cidrW + calcW + panelWordW + 22 * m.sX > bw - 94 * m.sX);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#F7FCFF';
        ctx.shadowColor = 'rgba(0,240,255,0.22)';
        ctx.shadowBlur = 5 * m.sX;
        ctx.fillText('CIDR', titleX, titleY);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#00F0FF';
        ctx.fillText('CALCULATION', titleX + cidrW + 11 * m.sX, titleY);
        ctx.fillStyle = '#FFE600';
        ctx.fillText('PANEL', titleX + cidrW + calcW + 22 * m.sX, titleY);
        ctx.font = 'bold ' + Math.round(6.3 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(190,211,222,0.68)';
        ctx.fillText('BINARY MASK // OCTET CALCULATION CONSOLE', titleX, by + 46 * m.sY);
        ctx.fillStyle = '#FF315F';
        ctx.fillRect(bx + 75 * m.sX, by + 6 * m.sY, 28 * m.sX, 2 * m.sY);
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(bx + 106 * m.sX, by + 6 * m.sY, 72 * m.sX, 2 * m.sY);
        ctx.restore();

        const statusX = m.panelX + m.panelW - 26 * m.sX;
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(0,240,255,0.78)';
        ctx.font = 'bold ' + (7.4 * m.sY).toFixed(1) + 'px monospace';
        ctx.fillText('SYS::CIDR_MASK_CONSOLE // LIVE', statusX, by + 18 * m.sY);
        ctx.fillStyle = 'rgba(190,211,222,0.64)';
        ctx.font = 'bold ' + (6.4 * m.sY).toFixed(1) + 'px monospace';
        const attemptStatus = this.enforceAttemptLimit
            ? 'TRIES ' + this._attemptsRemaining() + '/' + this.maxAttempts + ' // '
            : '';
        ctx.fillText(attemptStatus + 'OCTET BUS 04 // MATRIX 32-BIT', statusX, by + 36 * m.sY);
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = i < 4 ? '#FFE600' : '#25313A';
            ctx.fillRect(statusX - (61 - i * 10) * m.sX, by + 46 * m.sY, 7 * m.sX, 3 * m.sY);
        }
    }

    _drawMainPanel(ctx, m) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.78)';
        ctx.shadowBlur = 16 * m.sX;
        ctx.shadowOffsetY = 6 * m.sY;
        const g = ctx.createLinearGradient(m.mainX, m.mainY, m.mainX, m.mainY + m.mainH);
        g.addColorStop(0, '#2C3942');
        g.addColorStop(0.035, '#0B1117');
        g.addColorStop(0.5, '#111A21');
        g.addColorStop(0.965, '#070B0F');
        g.addColorStop(1, '#26343C');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, m.mainX, m.mainY, m.mainW, m.mainH, 12 * m.sX);
        ctx.shadowColor = 'transparent';
        this._strokeChamferRect(ctx, m.mainX, m.mainY, m.mainW, m.mainH, 12 * m.sX, '#526570', 2.2 * m.sX);
        this._strokeChamferRect(ctx, m.mainX + 7 * m.sX, m.mainY + 7 * m.sY, m.mainW - 14 * m.sX, m.mainH - 14 * m.sY, 8 * m.sX, 'rgba(0,231,242,0.34)', 1 * m.sX);

        this._drawMetalTexture(ctx, m.mainX + 9 * m.sX, m.mainY + 9 * m.sY, m.mainW - 18 * m.sX, m.mainH - 18 * m.sY, m, 0.27);

        const tabX = m.mainX + 18 * m.sX;
        const tabY = m.mainY + 8 * m.sY;
        const tabW = 215 * m.sX;
        const tabH = 18 * m.sY;
        const tab = ctx.createLinearGradient(tabX, tabY, tabX + tabW, tabY);
        tab.addColorStop(0, '#00DDE8');
        tab.addColorStop(0.72, '#087783');
        tab.addColorStop(1, '#10242A');
        ctx.fillStyle = tab;
        this._fillChamferRect(ctx, tabX, tabY, tabW, tabH, 5 * m.sX);
        ctx.fillStyle = '#031014';
        ctx.font = 'bold ' + Math.round(7 * m.sX) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('OCTET BUS // BINARY LAMP ARRAY', tabX + 12 * m.sX, tabY + 12.5 * m.sY);

        const matrixX = m.mainX + m.mainW - 168 * m.sX;
        ctx.fillStyle = '#FFE600';
        this._fillChamferRect(ctx, matrixX, tabY, 145 * m.sX, tabH, 5 * m.sX);
        ctx.fillStyle = '#120F00';
        ctx.fillText('MASK MATRIX // 4x8', matrixX + 12 * m.sX, tabY + 12.5 * m.sY);

        const railX1 = m.mainX + 12 * m.sX;
        const railX2 = m.mainX + m.mainW - 12 * m.sX;
        const railTop = m.mainY + 31 * m.sY;
        const railH = m.mainH - 42 * m.sY;
        [railX1, railX2].forEach((rx) => {
            const rail = ctx.createLinearGradient(rx - 4 * m.sX, 0, rx + 4 * m.sX, 0);
            rail.addColorStop(0, '#020304');
            rail.addColorStop(0.5, '#778891');
            rail.addColorStop(1, '#05080A');
            ctx.fillStyle = rail;
            ctx.fillRect(rx - 4 * m.sX, railTop, 8 * m.sX, railH);
            for (let i = 0; i < 4; i++) this._drawFastener(ctx, rx, railTop + railH * (i / 3), 3.8 * m.sX, m);
        });
        ctx.restore();
    }

    _drawRows(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const rowGap = (m.mainH - 119 * m.sY) / 3;
        const rowBaseY = m.mainY + 64 * m.sY;
        const bulbsX = m.mainX + 155 * m.sX;
        const gap = 58 * m.sX;
        const radius = 14.5 * m.sY;

        for (let r = 0; r < 4; r++) {
            const y = rowBaseY + r * rowGap;
            const bayX = m.mainX + 20 * m.sX;
            const bayY = y - 31 * m.sY;
            const bayW = m.mainW - 40 * m.sX;
            const bayH = 62 * m.sY;
            const bay = ctx.createLinearGradient(bayX, bayY, bayX, bayY + bayH);
            bay.addColorStop(0, 'rgba(68,82,91,0.78)');
            bay.addColorStop(0.08, 'rgba(11,16,21,0.98)');
            bay.addColorStop(0.54, 'rgba(22,30,36,0.98)');
            bay.addColorStop(0.92, 'rgba(7,10,14,0.98)');
            bay.addColorStop(1, 'rgba(48,60,68,0.9)');
            ctx.fillStyle = bay;
            this._fillChamferRect(ctx, bayX, bayY, bayW, bayH, 7 * m.sX);
            this._strokeChamferRect(ctx, bayX, bayY, bayW, bayH, 7 * m.sX, r % 2 ? 'rgba(255,49,95,0.24)' : 'rgba(0,231,242,0.24)', 1 * m.sX);
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#9CB0B9';
            for (let scan = 0; scan < 7; scan++) ctx.fillRect(bayX + 8 * m.sX, bayY + (7 + scan * 7) * m.sY, bayW - 16 * m.sX, 1 * m.sY);
            ctx.globalAlpha = 1;

            const sumX = m.mainX + 30 * m.sX;
            const sumW = 88 * m.sX;
            const sumH = 37 * m.sY;

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
                sg.addColorStop(0, 'rgba(7,17,20,0.98)');
                sg.addColorStop(1, 'rgba(17,38,39,0.98)');
            }
            ctx.fillStyle = sg;
            this._fillChamferRect(ctx, sumX, y - sumH * 0.5, sumW, sumH, 6 * m.sX);
            this._strokeChamferRect(ctx, sumX, y - sumH * 0.5, sumW, sumH, 6 * m.sX, eGlow > 0 ? '#FF315F' : (glow > 0 ? '#FFE600' : '#26737A'), 1.5 * m.sX);

            ctx.fillStyle = '#00EAF2';
            ctx.globalAlpha = 0.55;
            ctx.fillRect(sumX + 8 * m.sX, y - sumH * 0.5 + 5 * m.sY, sumW - 16 * m.sX, 1 * m.sY);
            ctx.globalAlpha = 1;

            ctx.fillStyle = '#F4FDFF';
            ctx.font = 'bold ' + (14 * m.sY).toFixed(1) + 'px ' + monoFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(this.rowSums[r]), sumX + sumW * 0.5, y + 0.5 * m.sY);

            const busStart = bulbsX - 22 * m.sX;
            const busEnd = bulbsX + 7 * gap + 22 * m.sX;
            const bus = ctx.createLinearGradient(busStart, y, busEnd, y);
            bus.addColorStop(0, '#17333A');
            bus.addColorStop(0.5, '#56828A');
            bus.addColorStop(1, '#172E34');
            ctx.strokeStyle = bus;
            ctx.lineWidth = 4.5 * m.sY;
            ctx.beginPath();
            ctx.moveTo(busStart, y);
            ctx.lineTo(busEnd, y);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,240,255,0.34)';
            ctx.lineWidth = 1 * m.sY;
            ctx.stroke();

            for (let c = 0; c < 8; c++) {
                const cx = bulbsX + c * gap;
                const isOn = !!this.bulbs[r][c];
                const val = this.values[c];

                ctx.fillStyle = '#071015';
                this._fillChamferRect(ctx, cx - 17 * m.sX, y - 29 * m.sY, 34 * m.sX, 13 * m.sY, 3 * m.sX);
                this._strokeChamferRect(ctx, cx - 17 * m.sX, y - 29 * m.sY, 34 * m.sX, 13 * m.sY, 3 * m.sX, isOn ? 'rgba(255,230,0,0.38)' : 'rgba(87,116,126,0.42)', 0.8 * m.sX);
                ctx.fillStyle = isOn ? '#FFE600' : '#7D9AA7';
                ctx.font = 'bold ' + (7.4 * m.sY).toFixed(1) + 'px ' + monoFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(val), cx, y - 22.5 * m.sY);
                this._drawLampSocket(ctx, cx, y, radius, isOn, r, c, m);
            }

            const sw = this.switchRects[r];
            const allOn = this.bulbs[r].every((value) => !!value);
            const swg = ctx.createLinearGradient(sw.x, sw.y, sw.x + sw.w, sw.y + sw.h);
            swg.addColorStop(0, '#171E24');
            swg.addColorStop(0.62, '#080C10');
            swg.addColorStop(1, '#242F36');
            ctx.fillStyle = swg;
            this._fillChamferRect(ctx, sw.x, sw.y, sw.w, sw.h, 7 * m.sX);
            this._strokeChamferRect(ctx, sw.x, sw.y, sw.w, sw.h, 7 * m.sX, '#5C717C', 1.4 * m.sX);
            const accent = allOn ? '#FFE600' : (r % 2 ? '#FF315F' : '#00EAF2');
            ctx.fillStyle = accent;
            ctx.fillRect(sw.x + 7 * m.sX, sw.y + 6 * m.sY, 3 * m.sX, sw.h - 12 * m.sY);
            ctx.fillStyle = '#E8F6FF';
            ctx.font = 'bold ' + (6.8 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(allOn ? 'ALL OFF' : 'ALL ON', sw.x + 16 * m.sX, sw.y + sw.h * 0.51);

            const leverX = sw.x + sw.w - 22 * m.sX;
            const leverY = sw.y + sw.h * 0.5;
            const slot = ctx.createLinearGradient(leverX - 7 * m.sX, sw.y, leverX + 7 * m.sX, sw.y);
            slot.addColorStop(0, '#020304');
            slot.addColorStop(0.5, '#586970');
            slot.addColorStop(1, '#05080A');
            ctx.fillStyle = slot;
            this._fillChamferRect(ctx, leverX - 7 * m.sX, sw.y + 5 * m.sY, 14 * m.sX, sw.h - 10 * m.sY, 4 * m.sX);
            ctx.strokeStyle = allOn ? '#FFE600' : '#60737B';
            ctx.lineWidth = 2.4 * m.sX;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(leverX, leverY + (allOn ? 5 : -5) * m.sY);
            ctx.lineTo(leverX + (allOn ? -5 : 5) * m.sX, leverY + (allOn ? -7 : 7) * m.sY);
            ctx.stroke();
            const knobX = leverX + (allOn ? -5 : 5) * m.sX;
            const knobY = leverY + (allOn ? -7 : 7) * m.sY;
            const knob = ctx.createRadialGradient(knobX - 2 * m.sX, knobY - 2 * m.sY, 1, knobX, knobY, 5 * m.sX);
            knob.addColorStop(0, '#F1F6F7');
            knob.addColorStop(0.35, allOn ? '#FFE600' : '#82949B');
            knob.addColorStop(1, '#11181B');
            ctx.fillStyle = knob;
            ctx.beginPath();
            ctx.arc(knobX, knobY, 4.7 * m.sX, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.textBaseline = 'alphabetic';
    }

    _drawConfirm(ctx, m) {
        if (this.phase !== 'build' && this.phase !== 'cidr_entry') return;
        const b = this.confirmRect;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, '#FFE600');
        g.addColorStop(0.58, '#C7B200');
        g.addColorStop(1, '#514800');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 9 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 9 * m.sX, '#FFF6A0', 1.8 * m.sX);
        ctx.fillStyle = this.phase === 'cidr_entry' ? '#00EAF2' : '#FF315F';
        ctx.fillRect(b.x + 7 * m.sX, b.y + 6 * m.sY, 4 * m.sX, b.h - 12 * m.sY);

        const cx = b.x + b.w * 0.5;
        this._drawMaskVerificationGlyph(ctx, cx, b.y + 28 * m.sY, m);

        ctx.fillStyle = '#071015';
        ctx.font = 'bold ' + (5.8 * m.sY).toFixed(1) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(this.phase === 'cidr_entry' ? 'VERIFY CIDR' : 'VERIFY MATCH', cx, b.y + b.h - 7 * m.sY);
        ctx.textBaseline = 'alphabetic';
    }

    _drawMaskVerificationGlyph(ctx, cx, cy, m) {
        const accent = this.phase === 'cidr_entry' ? '#00EAF2' : '#FF315F';
        const pulse = 0.72 + 0.28 * Math.sin(this.animTick * 0.16);
        const radius = 14 * m.sY;
        ctx.save();

        ctx.shadowColor = accent;
        ctx.shadowBlur = (4 + pulse * 4) * m.sX;
        ctx.strokeStyle = '#071015';
        ctx.lineWidth = 3.2 * m.sX;
        ctx.beginPath();
        ctx.arc(cx - 3 * m.sX, cy - 2 * m.sY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.4 * m.sX;
        ctx.beginPath();
        ctx.arc(cx - 3 * m.sX, cy - 2 * m.sY, radius - 3 * m.sX, 0, Math.PI * 2);
        ctx.stroke();

        const bitStartX = cx - 11 * m.sX;
        const bitGap = 5.2 * m.sX;
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 4; col++) {
                const bitOn = col < 3;
                ctx.fillStyle = bitOn ? '#071015' : 'rgba(7,16,21,0.32)';
                ctx.fillRect(
                    bitStartX + col * bitGap,
                    cy + (-6 + row * 9) * m.sY,
                    3.2 * m.sX,
                    3.2 * m.sY
                );
            }
        }

        ctx.globalAlpha = 0.68 + pulse * 0.32;
        ctx.fillStyle = accent;
        ctx.fillRect(cx - 12 * m.sX, cy - 0.9 * m.sY, 18 * m.sX, 1.8 * m.sY);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = '#071015';
        ctx.lineWidth = 5 * m.sX;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + 7 * m.sX, cy + 9 * m.sY);
        ctx.lineTo(cx + 20 * m.sX, cy + 22 * m.sY);
        ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5 * m.sX;
        ctx.beginPath();
        ctx.moveTo(cx + 8 * m.sX, cy + 10 * m.sY);
        ctx.lineTo(cx + 19 * m.sX, cy + 21 * m.sY);
        ctx.stroke();

        ctx.strokeStyle = '#071015';
        ctx.lineWidth = 1.5 * m.sX;
        ctx.lineCap = 'square';
        const bracket = 5 * m.sX;
        const bx = cx - 23 * m.sX;
        const by = cy - 20 * m.sY;
        ctx.beginPath();
        ctx.moveTo(bx + bracket, by);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx, by + bracket);
        ctx.moveTo(cx + 17 * m.sX - bracket, by);
        ctx.lineTo(cx + 17 * m.sX, by);
        ctx.lineTo(cx + 17 * m.sX, by + bracket);
        ctx.stroke();
        ctx.restore();
    }

    _drawTargetMaskCard(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const terminal = this._cidrTerminalLayout(m);
        const x = terminal.targetX;
        const y = terminal.targetY;
        const w = terminal.targetW;
        const h = terminal.targetH;
        const shell = ctx.createLinearGradient(x, y, x, y + h);
        shell.addColorStop(0, '#3E4C54');
        shell.addColorStop(0.055, '#0B1116');
        shell.addColorStop(0.58, '#132029');
        shell.addColorStop(1, '#05080B');
        ctx.fillStyle = shell;
        this._fillChamferRect(ctx, x, y, w, h, 10 * m.sX);
        this._strokeChamferRect(ctx, x, y, w, h, 10 * m.sX, '#00DCE8', 1.5 * m.sX);
        this._strokeChamferRect(ctx, x + 6 * m.sX, y + 6 * m.sY, w - 12 * m.sX, h - 12 * m.sY, 7 * m.sX, 'rgba(102,128,139,0.5)', 1 * m.sX);
        this._drawMetalTexture(ctx, x + 7 * m.sX, y + 7 * m.sY, w - 14 * m.sX, h - 14 * m.sY, m, 0.18);
        this._drawFastener(ctx, x + 12 * m.sX, y + 12 * m.sY, 3.3 * m.sX, m);
        this._drawFastener(ctx, x + w - 12 * m.sX, y + 12 * m.sY, 3.3 * m.sX, m);

        const tabX = x + 14 * m.sX;
        const tabY = y - 7 * m.sY;
        ctx.fillStyle = '#FFE600';
        this._fillChamferRect(ctx, tabX, tabY, 158 * m.sX, 18 * m.sY, 5 * m.sX);
        ctx.fillStyle = '#111000';
        ctx.font = 'bold ' + (6.4 * m.sY).toFixed(1) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SUBNET MASK // TARGET', tabX + 10 * m.sX, tabY + 12 * m.sY);

        ctx.fillStyle = '#8BA3AE';
        ctx.font = 'bold ' + (6.8 * m.sY).toFixed(1) + 'px monospace';
        ctx.fillText('SUBNET MASK TO MATCH', x + 22 * m.sX, y + 31 * m.sY);
        ctx.fillStyle = '#F5FCFF';
        ctx.font = 'bold ' + (13.2 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.fillText(this.targetMask, x + 22 * m.sX, y + 56 * m.sY);

        ctx.fillStyle = '#00EAF2';
        ctx.fillRect(x + 22 * m.sX, y + h - 16 * m.sY, w - 92 * m.sX, 2 * m.sY);
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = i < 4 ? '#FFE600' : '#28353B';
            ctx.fillRect(x + w - (64 - i * 10) * m.sX, y + h - 18 * m.sY, 7 * m.sX, 4 * m.sY);
        }
    }

    _drawCIDRActionPanel(ctx, m) {
        const terminal = this._cidrTerminalLayout(m);
        const unlocked = this.phase === 'cidr_entry';
        const shellX = terminal.shellX;
        const shellY = terminal.shellY;
        const shellW = terminal.shellW;
        const shellH = terminal.shellH;
        const shell = ctx.createLinearGradient(shellX, shellY, shellX, shellY + shellH);
        shell.addColorStop(0, unlocked ? '#43515A' : '#343B3F');
        shell.addColorStop(0.045, unlocked ? '#111820' : '#111416');
        shell.addColorStop(0.48, unlocked ? '#18242D' : '#191D20');
        shell.addColorStop(0.96, '#070B10');
        shell.addColorStop(1, unlocked ? '#34434C' : '#272D31');
        ctx.fillStyle = shell;
        this._fillChamferRect(ctx, shellX, shellY, shellW, shellH, 10 * m.sX);
        this._strokeChamferRect(ctx, shellX, shellY, shellW, shellH, 10 * m.sX, unlocked ? 'rgba(0,231,242,0.72)' : 'rgba(104,119,126,0.62)', 1.4 * m.sX);
        this._strokeChamferRect(ctx, shellX + 6 * m.sX, shellY + 6 * m.sY, shellW - 12 * m.sX, shellH - 12 * m.sY, 7 * m.sX, 'rgba(104,126,138,0.48)', 1 * m.sX);

        this._drawMetalTexture(ctx, shellX + 7 * m.sX, shellY + 7 * m.sY, shellW - 14 * m.sX, shellH - 14 * m.sY, m, 0.2);
        this._drawFastener(ctx, shellX + 12 * m.sX, shellY + 12 * m.sY, 3.4 * m.sX, m);
        this._drawFastener(ctx, shellX + shellW - 12 * m.sX, shellY + 12 * m.sY, 3.4 * m.sX, m);

        const tabX = shellX + 14 * m.sX;
        const tabY = shellY - 7 * m.sY;
        ctx.fillStyle = unlocked ? '#FF315F' : '#58636A';
        this._fillChamferRect(ctx, tabX, tabY, 132 * m.sX, 18 * m.sY, 5 * m.sX);
        ctx.fillStyle = unlocked ? '#FFFFFF' : '#C0C8CC';
        ctx.font = 'bold ' + (6.5 * m.sY).toFixed(1) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(unlocked ? 'CIDR TYPE // PREFIX' : 'CIDR TYPE // LOCKED', tabX + 10 * m.sX, tabY + 12 * m.sY);

        ctx.fillStyle = unlocked ? '#00EAF2' : '#68777E';
        for (let i = 0; i < 4; i++) ctx.fillRect(shellX + shellW - (58 - i * 10) * m.sX, shellY + 19 * m.sY, 7 * m.sX, 3 * m.sY);
    }

    _drawCIDRInput(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const b = this.cidrInputRect;
        const enabled = this.phase === 'cidr_entry';
        const focused = enabled && !!this.cidrInputFocused;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, focused ? '#06242A' : (enabled ? '#080D12' : '#171B1D'));
        g.addColorStop(0.5, focused ? '#0B3A40' : (enabled ? '#0D171D' : '#202629'));
        g.addColorStop(1, focused ? '#081D25' : (enabled ? '#070B10' : '#0D1012'));
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 8 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 8 * m.sX, focused ? '#00F0FF' : (enabled ? '#425965' : '#485157'), 2 * m.sX);

        ctx.globalAlpha = 0.19;
        ctx.fillStyle = enabled ? '#00EAF2' : '#667279';
        for (let i = 0; i < 4; i++) ctx.fillRect(b.x + 7 * m.sX, b.y + (6 + i * 6) * m.sY, b.w - 14 * m.sX, 1 * m.sY);
        ctx.globalAlpha = 1;
        ctx.fillStyle = focused ? '#FFE600' : (enabled ? '#546B77' : '#3C454A');
        ctx.fillRect(b.x + 6 * m.sX, b.y + 7 * m.sY, 3 * m.sX, b.h - 14 * m.sY);

        ctx.fillStyle = focused ? '#FFE600' : (enabled ? '#9DB4BE' : '#727D82');
        ctx.font = 'bold ' + (7.6 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.fillText(enabled ? 'ENTER CIDR PREFIX' : 'MATCH BULBS TO UNLOCK', b.x + b.w * 0.5, b.y - 6 * m.sY);

        const text = enabled ? (this.cidrInput ? (this.cidrInput.startsWith('/') ? this.cidrInput : '/' + this.cidrInput) : '/') : '--';
        const caret = focused && ((this.animTick % 30) < 15) ? '|' : '';
        ctx.fillStyle = focused ? '#F8FDFF' : (enabled ? '#BDD0D8' : '#687278');
        ctx.font = 'bold ' + (15.5 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textBaseline = 'middle';
        ctx.fillText(text + caret, b.x + b.w * 0.5, b.y + b.h * 0.56);
        ctx.textBaseline = 'alphabetic';
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

        const cardW = m.panelW * 0.47;
        const cardH = m.panelH * 0.34;
        const cardX = m.panelX + (m.panelW - cardW) * 0.5;
        const cardY = m.panelY + (m.panelH - cardH) * 0.5;
        const g = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        g.addColorStop(0, '#34434C');
        g.addColorStop(0.045, '#0A0F14');
        g.addColorStop(0.65, '#111B22');
        g.addColorStop(0.96, '#05080B');
        g.addColorStop(1, '#26343C');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, cardX, cardY, cardW, cardH, 13 * m.sX);
        this._strokeChamferRect(ctx, cardX, cardY, cardW, cardH, 13 * m.sX, '#00E7F2', 2 * m.sX);
        this._strokeChamferRect(ctx, cardX + 7 * m.sX, cardY + 7 * m.sY, cardW - 14 * m.sX, cardH - 14 * m.sY, 9 * m.sX, 'rgba(112,137,149,0.62)', 1 * m.sX);
        this._drawMetalTexture(ctx, cardX + 9 * m.sX, cardY + 9 * m.sY, cardW - 18 * m.sX, cardH - 18 * m.sY, m, 0.22);
        this._drawFastener(ctx, cardX + 15 * m.sX, cardY + 15 * m.sY, 4 * m.sX, m);
        this._drawFastener(ctx, cardX + cardW - 15 * m.sX, cardY + 15 * m.sY, 4 * m.sX, m);

        ctx.fillStyle = '#FF315F';
        this._fillChamferRect(ctx, cardX + 22 * m.sX, cardY - 8 * m.sY, 190 * m.sX, 27 * m.sY, 6 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (9.2 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('OCTET KEY FABRICATED', cardX + 36 * m.sX, cardY + 10 * m.sY);

        ctx.fillStyle = '#00EAF2';
        ctx.font = 'bold ' + (7.5 * m.sY).toFixed(1) + 'px monospace';
        ctx.fillText('ARCHIVE::CIDR_' + String(this.targetCIDR).padStart(2, '0') + ' // SIGNAL LOCKED', cardX + 26 * m.sX, cardY + 39 * m.sY);

        this._drawOctetCartridge(ctx, cardX + 26 * m.sX, cardY + 51 * m.sY, cardW - 52 * m.sX, 80 * m.sY, this.iconAnim, m, false);

        ctx.fillStyle = '#9FC2E0';
        ctx.font = 'bold ' + (12.5 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText('BIN::' + this.iconAnim.bitsBinary, cardX + 28 * m.sX, cardY + cardH - 23 * m.sY);
        ctx.fillStyle = '#FFE600';
        ctx.textAlign = 'right';
        ctx.fillText('CIDR /' + this.targetCIDR, cardX + cardW - 28 * m.sX, cardY + cardH - 23 * m.sY);
    }

    _drawIconFloat(ctx, m) {
        if (!this.iconAnim) return;
        const t = 1 - (this.phaseTimer / 90);
        const x = this.iconAnim.fromX + (this.iconAnim.toX - this.iconAnim.fromX) * t;
        const y = this.iconAnim.fromY + (this.iconAnim.toY - this.iconAnim.fromY) * t - Math.sin(t * Math.PI) * 28 * m.sY;
        const w = (132 - 72 * t) * m.sX;
        const h = (38 - 16 * t) * m.sY;
        const glow = ctx.createRadialGradient(x, y, 1, x, y, w * 0.7);
        glow.addColorStop(0, 'rgba(0, 234, 242, 0.72)');
        glow.addColorStop(1, 'rgba(255, 224, 88, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, w * 0.72, 0, Math.PI * 2);
        ctx.fill();
        this._drawOctetCartridge(ctx, x - w * 0.5, y - h * 0.5, w, h, this.iconAnim, m, true);
    }

    _drawMiniWidget(ctx, m) {
        if (!this.iconAnim) return;
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const cardW = m.panelW * 0.30;
        const cardX = m.panelX + (m.panelW - cardW) * 0.5;
        const cardY = 7 * m.sY;
        const cardH = 52 * m.sY;
        const g = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        g.addColorStop(0, '#26343C');
        g.addColorStop(0.06, '#080D12');
        g.addColorStop(0.72, '#111C22');
        g.addColorStop(1, '#05080B');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, cardX, cardY, cardW, cardH, 8 * m.sX);
        this._strokeChamferRect(ctx, cardX, cardY, cardW, cardH, 8 * m.sX, '#00DCE8', 1.4 * m.sX);

        ctx.fillStyle = '#FF315F';
        this._fillChamferRect(ctx, cardX + 7 * m.sX, cardY + 6 * m.sY, 82 * m.sX, 13 * m.sY, 3 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (6.5 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('OCTET KEY', cardX + 14 * m.sX, cardY + 15.5 * m.sY);
        this._drawOctetCartridge(ctx, cardX + 7 * m.sX, cardY + 23 * m.sY, cardW * 0.62, 22 * m.sY, this.iconAnim, m, true);
        ctx.fillStyle = '#9CC3E6';
        ctx.font = 'bold ' + (8.2 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText(this.iconAnim.bitsBinary, cardX + cardW * 0.66, cardY + 34 * m.sY);
        ctx.fillStyle = '#FFE600';
        ctx.font = 'bold ' + (7.2 * m.sY).toFixed(1) + 'px monospace';
        ctx.fillText('/' + this.targetCIDR + ' READY', cardX + cardW * 0.66, cardY + 45 * m.sY);
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
        const rowGap = (m.mainH - 103 * m.sY) / 3;
        const y = m.mainY + 64 * m.sY + row * rowGap;
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
        const rowGap = (m.mainH - 103 * m.sY) / 3;
        const rowBaseY = m.mainY + 64 * m.sY;
        const bulbsX = m.mainX + 155 * m.sX;
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

    _drawFastener(ctx, x, y, radius, m) {
        const r = Math.max(2, radius || 4 * m.sX);
        const metal = ctx.createRadialGradient(x - r * 0.32, y - r * 0.35, r * 0.08, x, y, r);
        metal.addColorStop(0, '#D7E0E3');
        metal.addColorStop(0.28, '#71808A');
        metal.addColorStop(0.58, '#1D282E');
        metal.addColorStop(1, '#020405');
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.88)';
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.48, y + r * 0.12);
        ctx.lineTo(x + r * 0.48, y - r * 0.12);
        ctx.stroke();
    }

    _drawMetalTexture(ctx, x, y, w, h, m, opacity) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        const alpha = typeof opacity === 'number' ? opacity : 0.2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#A7BAC3';
        for (let i = 0; i < 18; i++) {
            const yy = y + ((i * 29 + 11) % Math.max(1, h));
            const xx = x + ((i * 73 + 17) % Math.max(1, w * 0.72));
            const len = (18 + (i % 5) * 17) * m.sX;
            ctx.fillRect(xx, yy, len, Math.max(0.6, 0.8 * m.sY));
        }
        ctx.fillStyle = '#001A20';
        for (let i = 0; i < 14; i++) {
            const xx = x + ((i * 91 + 31) % Math.max(1, w));
            const yy = y + ((i * 47 + 9) % Math.max(1, h));
            ctx.fillRect(xx, yy, (2 + i % 3) * m.sX, (1 + i % 2) * m.sY);
        }
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = '#00DCE8';
        ctx.lineWidth = Math.max(0.6, 0.7 * m.sX);
        for (let i = 0; i < 6; i++) {
            const yy = y + (i + 1) * h / 7;
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(x + w, yy);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawLampSocket(ctx, cx, cy, radius, isOn, row, col, m) {
        const pulse = 0.74 + 0.22 * Math.sin(this.animTick * 0.16 + row * 0.7 + col * 0.25);
        if (isOn) {
            const aura = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius * 2.15);
            aura.addColorStop(0, 'rgba(255,244,118,' + (0.72 + pulse * 0.2) + ')');
            aura.addColorStop(0.42, 'rgba(255,190,36,0.34)');
            aura.addColorStop(1, 'rgba(255,174,24,0)');
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 2.15, 0, Math.PI * 2);
            ctx.fill();
        }

        const socket = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.12, cx, cy, radius * 1.28);
        socket.addColorStop(0, '#B8C6CA');
        socket.addColorStop(0.24, '#4D5B62');
        socket.addColorStop(0.58, '#11181C');
        socket.addColorStop(0.8, '#87969C');
        socket.addColorStop(1, '#030506');
        ctx.fillStyle = socket;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.23, 0, Math.PI * 2);
        ctx.fill();

        const glass = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.38, radius * 0.08, cx, cy, radius);
        if (isOn) {
            glass.addColorStop(0, '#FFFFFF');
            glass.addColorStop(0.18, '#FFF7A8');
            glass.addColorStop(0.58, '#FFE029');
            glass.addColorStop(1, '#B06D00');
        } else {
            glass.addColorStop(0, '#617681');
            glass.addColorStop(0.25, '#34454E');
            glass.addColorStop(0.72, '#131E24');
            glass.addColorStop(1, '#05090C');
        }
        ctx.fillStyle = glass;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isOn ? '#FFF5A3' : '#60737D';
        ctx.lineWidth = 1.1 * m.sX;
        ctx.stroke();

        ctx.strokeStyle = isOn ? 'rgba(255,255,224,0.78)' : 'rgba(121,145,154,0.45)';
        ctx.lineWidth = Math.max(0.7, 0.8 * m.sX);
        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.32, cy + radius * 0.22);
        ctx.lineTo(cx, cy - radius * 0.28);
        ctx.lineTo(cx + radius * 0.32, cy + radius * 0.22);
        ctx.stroke();
    }

    _drawOctetCartridge(ctx, x, y, w, h, icon, m, compact) {
        const data = icon || { circles: [] };
        const shell = ctx.createLinearGradient(x, y, x, y + h);
        shell.addColorStop(0, '#46565E');
        shell.addColorStop(0.12, '#10171C');
        shell.addColorStop(0.72, '#172229');
        shell.addColorStop(1, '#05080A');
        ctx.fillStyle = shell;
        this._fillChamferRect(ctx, x, y, w, h, Math.min(8 * m.sX, h * 0.24));
        this._strokeChamferRect(ctx, x, y, w, h, Math.min(8 * m.sX, h * 0.24), '#536A74', Math.max(0.8, 1.2 * m.sX));

        ctx.fillStyle = '#FF315F';
        ctx.fillRect(x + 5 * m.sX, y + h * 0.18, Math.max(2 * m.sX, w * 0.012), h * 0.64);
        ctx.fillStyle = '#00EAF2';
        ctx.fillRect(x + w - 7 * m.sX, y + h * 0.18, Math.max(2 * m.sX, w * 0.012), h * 0.64);

        const leftPad = compact ? 14 * m.sX : 30 * m.sX;
        const rightPad = compact ? 14 * m.sX : 30 * m.sX;
        const step = (w - leftPad - rightPad) / 8;
        const cy = y + h * 0.52;
        const lampR = Math.max(1.8 * m.sY, Math.min(h * (compact ? 0.14 : 0.18), step * 0.28));
        for (let i = 0; i < 8; i++) {
            const circle = data.circles[i] || { borrowed: false };
            const cx = x + leftPad + step * (i + 0.5);
            const lit = !!circle.borrowed;
            ctx.globalAlpha = lit ? (0.82 + 0.18 * Math.sin(this.animTick * 0.18 + i * 0.44)) : 1;
            const socket = ctx.createRadialGradient(cx - lampR * 0.3, cy - lampR * 0.3, lampR * 0.08, cx, cy, lampR * 1.5);
            socket.addColorStop(0, '#A7B7BD');
            socket.addColorStop(0.36, '#33434A');
            socket.addColorStop(0.66, '#080D10');
            socket.addColorStop(1, '#52636A');
            ctx.fillStyle = socket;
            ctx.beginPath();
            ctx.arc(cx, cy, lampR * 1.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = lit ? '#FFE13A' : '#142128';
            ctx.beginPath();
            ctx.arc(cx, cy, lampR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = lit ? '#FFF7AE' : '#4B606A';
            ctx.lineWidth = Math.max(0.6, 0.8 * m.sX);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        if (!compact) {
            this._drawFastener(ctx, x + 12 * m.sX, y + h * 0.5, 3.2 * m.sX, m);
            this._drawFastener(ctx, x + w - 12 * m.sX, y + h * 0.5, 3.2 * m.sX, m);
            ctx.fillStyle = 'rgba(0,234,242,0.55)';
            ctx.font = 'bold ' + (6.4 * m.sY).toFixed(1) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('128   64   32   16    8    4    2    1', x + w * 0.5, y + 12 * m.sY);
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
    VERSION: 'ip-cidrpanel-gameplay-manager-20260816-06',
    _active: false,
    _introShown: false,
    _activeAttempt: null,
    _registeredQuestIds: {},
    _triggerLocks: {},

    CIDR_PANEL_QUESTS: [
        { id: 'stage.7.ip_cidr_panel.01', objectiveId: 'solve_cidr_panel_01', title: 'SOLVE CIDR BINARY PANEL 01', label: 'CIDR Panel 01', mapId: 7, tutorial: true, randomizeTarget: true, targetClasses: ['A', 'B', 'C'], targetTile: { x: 4, y: 0, z: 28 } },
        { id: 'stage.7.ip_cidr_panel.02', objectiveId: 'solve_cidr_panel_02', title: 'SOLVE CIDR BINARY PANEL 02', label: 'CIDR Panel 02', mapId: 7, randomizeTarget: true, targetClasses: ['A', 'B', 'C'], targetTile: { x: 10, y: 0, z: 30 } },
        { id: 'stage.7.ip_cidr_panel.03', objectiveId: 'solve_cidr_panel_03', title: 'SOLVE CIDR BINARY PANEL 03', label: 'CIDR Panel 03', mapId: 7, randomizeTarget: true, targetClasses: ['A', 'B', 'C'], targetTile: { x: 18, y: 0, z: 27 } },
        { id: 'stage.7.ip_cidr_panel.04', objectiveId: 'solve_cidr_panel_04', title: 'SOLVE CIDR BINARY PANEL 04', label: 'CIDR Panel 04', mapId: 7, randomizeTarget: true, targetClasses: ['A', 'B', 'C'], targetTile: { x: 27, y: 0, z: 30 } },
        { id: 'stage.7.ip_cidr_panel.05', objectiveId: 'solve_cidr_panel_05', title: 'SOLVE CIDR BINARY PANEL 05', label: 'CIDR Panel 05', mapId: 7, randomizeTarget: true, targetClasses: ['A', 'B', 'C'], targetTile: { x: 31, y: 0, z: 21 } },
        { id: 'stage.8.cidr_chain.01', label: 'CIDR Chain 01', handoffKey: 'stage8-cidr-chain-01', mapId: 8, targetClass: 'C', randomizeTarget: true, objectives: [
            { gameplayId: 'ip_cidr_binary_panel', objectiveId: 'solve_cidr_chain_01_panel', title: 'SOLVE CIDR PANEL 01', label: 'CIDR Panel 01', targetTile: { x: 5, y: 0, z: 28 } },
            { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_cidr_chain_01_subnet', title: 'SOLVE SUBNET SIMULATOR 01', label: 'Subnet Simulator 01', tutorial: true, targetTile: { x: 7, y: 0, z: 28 } },
        ] },
        { id: 'stage.8.cidr_chain.02', label: 'CIDR Chain 02', handoffKey: 'stage8-cidr-chain-02', mapId: 8, targetClass: 'C', randomizeTarget: true, objectives: [
            { gameplayId: 'ip_cidr_binary_panel', objectiveId: 'solve_cidr_chain_02_panel', title: 'SOLVE CIDR PANEL 02', label: 'CIDR Panel 02', targetTile: { x: 12, y: 0, z: 30 } },
            { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_cidr_chain_02_subnet', title: 'SOLVE SUBNET SIMULATOR 02', label: 'Subnet Simulator 02', targetTile: { x: 12, y: 0, z: 28 } },
        ] },
        { id: 'stage.8.cidr_chain.03', label: 'CIDR Chain 03', handoffKey: 'stage8-cidr-chain-03', mapId: 8, targetClass: 'C', randomizeTarget: true, objectives: [
            { gameplayId: 'ip_cidr_binary_panel', objectiveId: 'solve_cidr_chain_03_panel', title: 'SOLVE CIDR PANEL 03', label: 'CIDR Panel 03', targetTile: { x: 24, y: 0, z: 28 } },
            { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_cidr_chain_03_subnet', title: 'SOLVE SUBNET SIMULATOR 03', label: 'Subnet Simulator 03', targetTile: { x: 26, y: 0, z: 28 } },
        ] },
        { id: 'stage.8.cidr_chain.04', label: 'CIDR Chain 04', handoffKey: 'stage8-cidr-chain-04', mapId: 8, targetClass: 'C', randomizeTarget: true, objectives: [
            { gameplayId: 'ip_cidr_binary_panel', objectiveId: 'solve_cidr_chain_04_panel', title: 'SOLVE CIDR PANEL 04', label: 'CIDR Panel 04', targetTile: { x: 8, y: 0, z: 18 } },
            { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_cidr_chain_04_subnet', title: 'SOLVE SUBNET SIMULATOR 04', label: 'Subnet Simulator 04', targetTile: { x: 10, y: 0, z: 18 } },
        ] },
        { id: 'stage.8.cidr_chain.05', label: 'CIDR Chain 05', handoffKey: 'stage8-cidr-chain-05', mapId: 8, targetClass: 'C', randomizeTarget: true, objectives: [
            { gameplayId: 'ip_cidr_binary_panel', objectiveId: 'solve_cidr_chain_05_panel', title: 'SOLVE CIDR PANEL 05', label: 'CIDR Panel 05', targetTile: { x: 22, y: 0, z: 18 } },
            { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_cidr_chain_05_subnet', title: 'SOLVE SUBNET SIMULATOR 05', label: 'Subnet Simulator 05', targetTile: { x: 24, y: 0, z: 18 } },
        ] },
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

    _tutorialQuestSpec() {
        const specs = this._questSpecs();
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            if (spec && Number(spec.mapId || 7) === 7 && spec.tutorial) return spec;
        }
        return specs[0] || this.CIDR_PANEL_QUESTS[0];
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        const stageId = Number(stage && stage.id);
        if (!qm || (stageId !== 7 && stageId !== 8) || typeof qm.registerQuest !== 'function') return [];

        const questIds = [];
        const specs = this._questSpecs();
        for (let i = 0; i < specs.length; i++) {
            const questSpec = specs[i];
            if (!questSpec || !questSpec.id || Number(questSpec.mapId) !== stageId) continue;
            questIds.push(questSpec.id);
            if (this._registeredQuestIds[questSpec.id] && qm.quests && qm.quests[questSpec.id]) continue;

            const objectiveSpecs = Array.isArray(questSpec.objectives) && questSpec.objectives.length
                ? questSpec.objectives
                : [questSpec];
            const objectives = objectiveSpecs.map((objectiveSpec) => {
                const merged = Object.assign({}, questSpec, objectiveSpec, { id: questSpec.id });
                const target = Object.assign({}, objectiveSpec.targetTile || { x: 0, y: 0, z: 0 });
                return {
                    id: objectiveSpec.objectiveId,
                    title: objectiveSpec.title,
                    detail: this._targetDetail(target),
                    targetTile: target,
                    completionRadiusTiles: 0.55,
                    isComplete: (context, activeQuestManager) => {
                        if (objectiveSpec.gameplayId === 'ip_subnet_simulator') {
                            const simulator = IP2Live.SubnetSimulatorGameplayManager;
                            return simulator && typeof simulator._handleObjective === 'function'
                                ? simulator._handleObjective(merged, context, activeQuestManager)
                                : false;
                        }
                        return CIDRPanelGameplayManager._handleCIDRObjective(merged, context, activeQuestManager);
                    },
                };
            });
            qm.registerQuest({
                id: questSpec.id,
                title: 'QUEST AREA',
                stageMapId: stageId,
                resetOnMapEnter: true,
                objectives,
            });
            this._registeredQuestIds[questSpec.id] = true;
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

        const mapId = Number(context && context.mapId) || Number(spec.mapId) || 7;
        const isCIDRTutorial = mapId === 7 && !!spec.tutorial;
        const launchOptions = {
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId,
            targetMask: spec.targetMask,
            targetClass: spec.targetClass || (mapId === 8 ? 'C' : null),
            targetClasses: spec.targetClasses || (mapId === 7 ? ['A', 'B', 'C'] : null),
            randomizeTarget: spec.randomizeTarget !== false,
            handoffKey: spec.handoffKey,
            _fromObjective: true,
            tutorialMode: isCIDRTutorial,
            enforceAttemptLimit: mapId === 7,
            maxAttempts: 3,
        };

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_cidr_binary_panel', Object.assign({}, launchOptions, {
                showIntro: isCIDRTutorial && !this._introShown,
                _reservedAttempt: attemptKey,
            }));
            return false;
        }

        this.launchCIDRGameplay(Object.assign({}, launchOptions, {
            mode: 'replace',
            showIntro: isCIDRTutorial && !this._introShown,
        }));
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
        if (IP2Live.QuestMinimap) {
            if (!IP2Live.QuestMinimap.isActive()) IP2Live.QuestMinimap.create();
            else IP2Live.QuestMinimap.update();
        }
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;
        const shouldShowIntro = opts.showIntro !== false && !this._introShown;
        if (shouldShowIntro) this._introShown = true;

        const open = () => {
            const screen = new IP2LiveCIDRPanelGameplayScreen({
                targetMask: opts.targetMask,
                targetClass: opts.targetClass,
                targetClasses: opts.targetClasses,
                randomizeTarget: !!opts.randomizeTarget,
                handoffKey: opts.handoffKey,
                tutorialMode: !!opts.tutorialMode,
                guidedTutorial: shouldShowIntro && !!opts.tutorialMode,
                enforceAttemptLimit: !!opts.enforceAttemptLimit,
                maxAttempts: opts.maxAttempts || 3,
                mapId: opts.mapId,
                questId: opts.questId,
                objectiveId: opts.objectiveId,
                onComplete: (result) => this._onComplete(opts, result),
                onFailed: (result) => this._onFailed(opts, result),
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

        openSafely();

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
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || spec.mapId || 7,
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

    _onFailed(options, result) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);

        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            if (Number(opts.mapId || spec.mapId) === 7) this._sendBackToCIDRTutorial(spec);
            if (typeof opts.onFailed === 'function') opts.onFailed(result);
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_cidr_binary_panel', {
                    gameplayId: 'ip_cidr_binary_panel',
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || spec.mapId || 7,
                    result,
                });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading CIDR Training',
            detail: 'Retry budget exhausted - returning to the tutorial relay',
            onComplete: finalizeExit,
        })) finalizeExit();
    },

    _sendBackToCIDRTutorial(failedSpec) {
        const tutorialSpec = this._tutorialQuestSpec();
        const qm = IP2Live.QuestManager;
        this._introShown = false;
        if (qm && tutorialSpec && tutorialSpec.id) {
            qm.completedObjectives[tutorialSpec.id] = {};
            qm.startQuest(tutorialSpec.id, {
                mapId: 7,
                mapQuestMode: true,
                keepLastCompletion: true,
                visible: true,
                preview: false,
                guideActive: true,
                allowCompletion: true,
                restart: true,
            });
        }
        const tutorial = IP2Live.IPCIDRPanelTutorial;
        if (tutorial && typeof tutorial.showAttemptReset === 'function') {
            setTimeout(() => tutorial.showAttemptReset(failedSpec && failedSpec.label), 220);
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
            detail: 'Returning to Stage 2',
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
