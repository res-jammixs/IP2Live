/**
 * IP2Live - Subnet Simulator Gameplay
 *
 * Gameplay Four:
 * - Merge equal-number circles to form powers of two
 * - Use "-2" bubble helper
 * - Fill answer slots: usable subnets, total subnets, total hosts, usable hosts
 */

class IP2LiveSubnetSimulatorGameplayScreen extends Scene.Base {
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
        this.phase = 'build';
        this.phaseTimer = 0;
        this.finished = false;
        this.dragBallId = null;
        this.dragOffset = { x: 0, y: 0 };
        this.shake = 0;
        this.failBanner = '';
        this.failBannerTimer = 0;
        this.particles = [];
        this.maxNormalBalls = 10;
        this.minBaseBalls = 6;
        this.baseBallValue = 2;
        this.duplicateUsesLeft = 3;
        this.spawnPausedByLimit = false;
        this.hoverSlotKey = null;
        this.guidedTutorial = !!this.options.guidedTutorial;
        this.tutorialActive = this.guidedTutorial;
        this.tutorialComplete = !this.guidedTutorial;
        this.tutorialStep = this.guidedTutorial ? 'carried_intro' : 'done';
        this.tutorialPaused = this.guidedTutorial;
        this.tutorialDialogueOpen = false;
        this.tutorialHighlight = null;
        this.tutorialSpotlightTimer = 0;
        this.tutorialSpotlightComplete = null;
        this.validationAttempts = 0;
        this.enforceAttemptLimit = !!this.options.enforceAttemptLimit;
        this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 3);
        this.slotStatTotals = {
            totalChecks: 0,
            wrongChecks: 0,
            wrongSlotFrequency: {
                usableSubnets: 0,
                totalSubnets: 0,
                totalHosts: 0,
                usableHosts: 0,
            },
        };

        const state = this._resolveCIDRState();
        this.cidrState = state;
        this.bitsBinary = state && state.bitsBinary ? state.bitsBinary : '11100000';
        this.borrowedBits = this._countBits(this.bitsBinary);
        this.hostBits = Math.max(0, 8 - this.borrowedBits);
        const totalSubnets = Math.pow(2, this.borrowedBits);
        const totalHosts = Math.pow(2, this.hostBits);
        this.answers = {
            totalSubnets: totalSubnets,
            usableSubnets: Math.max(0, totalSubnets - 2),
            totalHosts: totalHosts,
            usableHosts: Math.max(0, totalHosts - 2),
        };

        this.nextBallId = 1;
        this.balls = [];
        this.slots = [
            { key: 'usableSubnets', label: 'USABLE SUBNETS', x: 0, y: 0, r: 34, ballId: null, result: null, resultTimer: 0 },
            { key: 'totalSubnets', label: 'TOTAL SUBNETS', x: 0, y: 0, r: 34, ballId: null, result: null, resultTimer: 0 },
            { key: 'totalHosts', label: 'TOTAL HOSTS', x: 0, y: 0, r: 34, ballId: null, result: null, resultTimer: 0 },
            { key: 'usableHosts', label: 'USABLE HOSTS', x: 0, y: 0, r: 34, ballId: null, result: null, resultTimer: 0 },
        ];
        this.submitRect = null;
        this._seedBalls();
    }

    _countBits(bitsBinary) {
        let count = 0;
        const s = String(bitsBinary || '');
        for (let i = 0; i < s.length; i++) if (s[i] === '1') count++;
        return count;
    }

    _resolveCIDRState() {
        const key = this.options && this.options.handoffKey ? String(this.options.handoffKey) : null;
        const store = IP2Live.CIDRGameplayState || {};
        if (key && store.handoffs && store.handoffs[key]) return store.handoffs[key];
        const latest = store.latest || null;
        if (latest && (!key || latest.handoffKey === key)) return latest;
        if (this.options && this.options.targetMask) return this._buildCIDRStateFromMask(this.options.targetMask, key);
        return latest;
    }

    _buildCIDRStateFromMask(mask, handoffKey) {
        const octets = this._parseMask(mask);
        const cidr = this._maskToCIDR(octets);
        const octetIndex = this._interestingOctetIndex(octets);
        const bitsBinary = this._octetToBits(octets[octetIndex] || 0);
        return {
            gameplayId: 'ip_cidr_binary_panel',
            handoffKey: handoffKey || null,
            mask: octets.join('.'),
            cidr,
            enteredCIDR: cidr,
            enteredCIDRText: '/' + cidr,
            targetOctets: octets,
            interestingOctetIndex: octetIndex,
            interestingOctetValue: octets[octetIndex] || 0,
            bitsBinary,
            icon: {
                type: 'octet-borrowed-bits',
                circles: bitsBinary.split('').map((bit, index) => ({
                    index,
                    borrowed: bit === '1',
                    color: bit === '1' ? '#FFD84A' : '#6E7886',
                    blink: bit === '1',
                })),
            },
            rebuiltFromQuestSpec: true,
            savedAt: Date.now(),
        };
    }

    _parseMask(mask) {
        const parts = String(mask || '').split('.').map((part) => Number(part));
        if (parts.length !== 4) return [255, 255, 255, 0];
        for (let i = 0; i < parts.length; i++) {
            if (!Number.isInteger(parts[i]) || parts[i] < 0 || parts[i] > 255) return [255, 255, 255, 0];
        }
        return parts;
    }

    _maskToCIDR(octets) {
        let total = 0;
        for (let i = 0; i < octets.length; i++) total += this._countBits(this._octetToBits(octets[i]));
        return total;
    }

    _interestingOctetIndex(octets) {
        for (let i = 0; i < octets.length; i++) if (octets[i] !== 255 && octets[i] !== 0) return i;
        for (let i = 0; i < octets.length; i++) if (octets[i] !== 255) return i;
        return 3;
    }

    _octetToBits(value) {
        let n = Math.max(0, Math.min(255, Number(value) || 0));
        let out = '';
        for (let i = 7; i >= 0; i--) out += (n & (1 << i)) ? '1' : '0';
        return out;
    }

    _seedBalls() {
        this.balls = [];
        for (let i = 0; i < this.minBaseBalls; i++) this._spawnOneBall();
        this._spawnMinusBall();
        this._spawnDuplicateBall();
    }

    _spawnOneBall() {
        if (!this._canSpawnNormalBall()) return false;
        const pos = this._randomArenaPoint();
        this.balls.push({
            id: this.nextBallId++,
            value: this.baseBallValue,
            x: pos.x,
            y: pos.y,
            homeX: pos.x,
            homeY: pos.y,
            r: this._radiusForValue(this.baseBallValue),
            minus: false,
            duplicate: false,
            pulse: 0,
            slotKey: null,
        });
        return true;
    }

    _spawnMinusBall() {
        const pos = this._minusHomePoint();
        this.balls.push({
            id: this.nextBallId++,
            value: -2,
            x: pos.x,
            y: pos.y,
            homeX: pos.x,
            homeY: pos.y,
            r: 30,
            minus: true,
            duplicate: false,
            pulse: 0,
            slotKey: null,
        });
    }

    _spawnDuplicateBall() {
        const pos = this._duplicateHomePoint();
        this.balls.push({
            id: this.nextBallId++,
            value: 0,
            x: pos.x,
            y: pos.y,
            homeX: pos.x,
            homeY: pos.y,
            r: 30,
            minus: false,
            duplicate: true,
            usesLeft: this.duplicateUsesLeft,
            pulse: 0,
            slotKey: null,
        });
    }

    _minusHomePoint() {
        const m = this._metrics();
        return { x: m.arenaX + m.arenaW - 58 * m.sX, y: m.arenaY + 60 * m.sY };
    }

    _duplicateHomePoint() {
        const m = this._metrics();
        return { x: m.arenaX + 58 * m.sX, y: m.arenaY + 60 * m.sY };
    }

    _randomArenaPoint() {
        const m = this._metrics();
        return {
            x: m.arenaX + 58 * m.sX + Math.random() * (m.arenaW - 150 * m.sX),
            y: m.arenaY + 58 * m.sY + Math.random() * (m.arenaH - 145 * m.sY),
        };
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        if (this.shake > 0) this.shake--;
        if (this.failBannerTimer > 0) this.failBannerTimer--;
        for (let i = 0; i < this.slots.length; i++) {
            this.slots[i].resultTimer = Math.max(0, (this.slots[i].resultTimer || 0) - 1);
            if (this.slots[i].resultTimer === 0) this.slots[i].result = null;
        }
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            if (b.pulse && b.pulse > 0) b.pulse--;
        }

        this._refreshSpawnPauseState();
        this._layoutSlots();
        this._snapMinusHome();
        this._snapDuplicateHome();
        this._ensureBaseBalls();
        this._updateGuidedTutorial();

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life--;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.03;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        if (this.phase === 'success') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) this._finishSuccess();
        } else if (this.phase === 'failed') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) this._failOut();
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _tutorialContext() {
        return Object.assign({}, this.cidrState || {}, {
            bitsBinary: this.bitsBinary,
            borrowedBits: this.borrowedBits,
            hostBits: this.hostBits,
            totalSubnets: this.answers.totalSubnets,
            usableSubnets: this.answers.usableSubnets,
            totalHosts: this.answers.totalHosts,
            usableHosts: this.answers.usableHosts,
            duplicateUsesLeft: this.duplicateUsesLeft,
        });
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

        if (this.tutorialStep === 'carried_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'carried_dialogue';
            this._showGuidedCarriedDialogue();
            return;
        }

        if (this.tutorialStep === 'powers_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'powers_dialogue';
            this._showGuidedPowersDialogue();
            return;
        }

        if (this.tutorialStep === 'usable_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'usable_dialogue';
            this._showGuidedUsableDialogue();
            return;
        }

        if (this.tutorialStep === 'duplicate_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'duplicate_dialogue';
            this._showGuidedDuplicateDialogue();
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

    _showGuidedCarriedDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'carried_reference',
                label: '01 // RETAINED OCTET FROM THE PREVIOUS PANEL',
            }, 135, () => {
                this.tutorialStep = 'powers_intro';
            });
        };
        const tutorial = IP2Live.IPSubnetSimulatorTutorial;
        if (tutorial && typeof tutorial.showCarriedReference === 'function') {
            tutorial.showCarriedReference(this._tutorialContext(), done);
        } else {
            done();
        }
    }

    _showGuidedPowersDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'power_totals',
                label: '02 // ON BITS = SUBNETS // OFF BITS = HOSTS',
            }, 150, () => {
                this.tutorialStep = 'usable_intro';
            });
        };
        const tutorial = IP2Live.IPSubnetSimulatorTutorial;
        if (tutorial && typeof tutorial.showPowerGuide === 'function') {
            tutorial.showPowerGuide(this._tutorialContext(), done);
        } else {
            done();
        }
    }

    _showGuidedUsableDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'usable_values',
                label: '03 // APPLY -2 FOR RESERVED VALUES',
            }, 150, () => {
                this.tutorialStep = 'duplicate_intro';
            });
        };
        const tutorial = IP2Live.IPSubnetSimulatorTutorial;
        if (tutorial && typeof tutorial.showUsableGuide === 'function') {
            tutorial.showUsableGuide(this._tutorialContext(), done);
        } else {
            done();
        }
    }

    _showGuidedDuplicateDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'duplicate_strategy',
                label: '04 // MERGE, DUPLICATE WISELY, THEN VALIDATE',
            }, 180, () => {
                this.tutorialPaused = false;
                this.tutorialActive = false;
                this.tutorialComplete = true;
                this.tutorialStep = 'done';
            });
        };
        const tutorial = IP2Live.IPSubnetSimulatorTutorial;
        if (tutorial && typeof tutorial.showDuplicateGuide === 'function') {
            tutorial.showDuplicateGuide(this._tutorialContext(), done);
        } else {
            done();
        }
    }

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            const value = key && (key.name || key.code || key);
            const upper = String(value || '').toUpperCase();
            if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') {
                IP2Live.DialogueManager.advance();
            }
            return true;
        }
        if (this.tutorialPaused) return true;
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel();
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
        if (this.phase !== 'build') return true;
        this._layoutSlots();

        if (this.submitRect && this._pointInRect(x, y, this.submitRect)) {
            this._submitAnswers();
            return true;
        }

        const ball = this._ballAt(x, y);
        if (!ball) return true;
        this.dragBallId = ball.id;
        this.hoverSlotKey = null;
        this.dragOffset.x = x - ball.x;
        this.dragOffset.y = y - ball.y;
        if (ball.slotKey) {
            const slot = this._slotByKey(ball.slotKey);
            if (slot) slot.ballId = null;
            if (slot) {
                slot.result = null;
                slot.resultTimer = 0;
            }
            ball.slotKey = null;
        }
        this._playCursor();
        return true;
    }

    onMouseMove(x, y) {
        if (this.tutorialPaused || (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive())) return true;
        const ball = this._dragBall();
        if (!ball || this.phase !== 'build') return true;
        ball.x = x - this.dragOffset.x;
        ball.y = y - this.dragOffset.y;
        const slot = this._slotAt(x, y);
        this.hoverSlotKey = slot && !slot.ballId && !ball.minus && !ball.duplicate ? slot.key : null;
        return true;
    }

    onMouseUp(x, y) {
        if (this.tutorialPaused || (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive())) return true;
        if (this.phase !== 'build') return true;
        const ball = this._dragBall();
        this.dragBallId = null;
        this.hoverSlotKey = null;
        if (!ball) return true;

        const slot = this._slotAt(x, y);
        if (slot && !slot.ballId && !ball.minus && !ball.duplicate) {
            slot.ballId = ball.id;
            slot.result = null;
            slot.resultTimer = 0;
            ball.slotKey = slot.key;
            ball.x = slot.x;
            ball.y = slot.y;
            ball.homeX = slot.x;
            ball.homeY = slot.y;
            this._playConfirm();
            return true;
        }

        let target = this._overlapBall(ball);
        if (!target && ball.duplicate) target = this._nearestNormalBall(ball.x, ball.y, 62);
        if (target && target.id !== ball.id) {
            if (ball.minus && !target.minus && !target.duplicate) {
                this._applyMinus(target);
                return true;
            }
            if (ball.duplicate && !target.minus && !target.duplicate) {
                this._applyDuplicate(target, ball);
                return true;
            }
            if (!ball.minus && !ball.duplicate && !target.minus && !target.duplicate && ball.value === target.value) {
                this._mergeBalls(ball, target);
                return true;
            }
        }

        if (ball.minus || ball.duplicate) {
            ball.x = ball.homeX;
            ball.y = ball.homeY;
        } else {
            const p = this._clampPointToArena(ball.x, ball.y, ball.r);
            ball.x = p.x;
            ball.y = p.y;
            ball.homeX = p.x;
            ball.homeY = p.y;
        }
        return true;
    }

    _nearestNormalBall(x, y, maxDist) {
        let best = null;
        let bestD = Math.max(1, maxDist || 60);
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            if (b.minus || b.duplicate) continue;
            const d = Math.hypot(x - b.x, y - b.y);
            if (d <= bestD) {
                best = b;
                bestD = d;
            }
        }
        return best;
    }

    _dragBall() {
        if (!this.dragBallId) return null;
        return this._ballById(this.dragBallId);
    }

    _ballById(id) {
        for (let i = 0; i < this.balls.length; i++) if (this.balls[i].id === id) return this.balls[i];
        return null;
    }

    _ballAt(x, y) {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const b = this.balls[i];
            const d = Math.hypot(x - b.x, y - b.y);
            if (d <= b.r * 1.05) return b;
        }
        return null;
    }

    _overlapBall(source) {
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            if (b.id === source.id) continue;
            const d = Math.hypot(source.x - b.x, source.y - b.y);
            if (d <= (source.r + b.r) * 0.72) return b;
        }
        return null;
    }

    _slotByKey(key) {
        for (let i = 0; i < this.slots.length; i++) if (this.slots[i].key === key) return this.slots[i];
        return null;
    }

    _slotAt(x, y) {
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            if (Math.hypot(x - s.x, y - s.y) <= s.r * 1.12) return s;
        }
        return null;
    }

    _applyMinus(target) {
        if (target.value < 2) {
            this._playCancel();
            return;
        }
        target.value = Math.max(0, target.value - 2);
        target.r = this._radiusForValue(target.value);
        this._emitPop(target.x, target.y, '#FF6E86', 18);
        this._playConfirm();
        const minus = this._minusBall();
        if (minus) {
            minus.x = minus.homeX;
            minus.y = minus.homeY;
        }
    }

    _mergeBalls(a, b) {
        const x = (a.x + b.x) * 0.5;
        const y = (a.y + b.y) * 0.5;
        const next = Math.min(128, a.value * 2);
        this._removeBall(a.id);
        this._removeBall(b.id);
        this.balls.push({
            id: this.nextBallId++,
            value: next,
            x,
            y,
            homeX: x,
            homeY: y,
            r: this._radiusForValue(next) * 1.12,
            minus: false,
            duplicate: false,
            pulse: 18,
            slotKey: null,
        });
        this._spawnOneBall();
        this._spawnOneBall();
        this._emitPop(x, y, '#7EEDFF', 24);
        this._playConfirm();
    }

    _applyDuplicate(target, duplicateBall) {
        if (!duplicateBall || duplicateBall.usesLeft <= 0) {
            this._playCancel();
            return;
        }
        const pos = this._findNearbyArenaPoint(target.x, target.y, target.r + 26);
        this.balls.push({
            id: this.nextBallId++,
            value: target.value,
            x: pos.x,
            y: pos.y,
            homeX: pos.x,
            homeY: pos.y,
            r: this._radiusForValue(target.value),
            minus: false,
            duplicate: false,
            pulse: 10,
            slotKey: null,
        });
        duplicateBall.usesLeft = Math.max(0, duplicateBall.usesLeft - 1);
        this.duplicateUsesLeft = duplicateBall.usesLeft;
        duplicateBall.x = duplicateBall.homeX;
        duplicateBall.y = duplicateBall.homeY;
        if (duplicateBall.usesLeft <= 0) this._removeBall(duplicateBall.id);
        this._emitPop(target.x, target.y, '#78F5C0', 20);
        this._playConfirm();
    }

    _radiusForValue(value) {
        const n = Math.max(1, Number(value) || 1);
        const scaled = 20 + Math.log2(n + 1) * 4.3;
        return Math.max(22, Math.min(42, scaled));
    }

    _removeBall(id) {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            if (this.balls[i].id === id) this.balls.splice(i, 1);
        }
        for (let i = 0; i < this.slots.length; i++) {
            if (this.slots[i].ballId === id) this.slots[i].ballId = null;
        }
    }

    _ensureBaseBalls() {
        let base = 0;
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            if (!b.minus && !b.duplicate && b.value === this.baseBallValue) base++;
        }
        while (base < this.minBaseBalls && this._canSpawnNormalBall()) {
            if (!this._spawnOneBall()) break;
            base++;
        }
    }

    _minusBall() {
        for (let i = 0; i < this.balls.length; i++) if (this.balls[i].minus) return this.balls[i];
        return null;
    }

    _duplicateBall() {
        for (let i = 0; i < this.balls.length; i++) if (this.balls[i].duplicate) return this.balls[i];
        return null;
    }

    _snapMinusHome() {
        const minus = this._minusBall();
        if (!minus || this.dragBallId === minus.id) return;
        const p = this._minusHomePoint();
        minus.homeX = p.x;
        minus.homeY = p.y;
        if (!minus.slotKey) {
            minus.x += (p.x - minus.x) * 0.16;
            minus.y += (p.y - minus.y) * 0.16;
        }
    }

    _snapDuplicateHome() {
        const dup = this._duplicateBall();
        if (!dup || this.dragBallId === dup.id) return;
        const p = this._duplicateHomePoint();
        dup.homeX = p.x;
        dup.homeY = p.y;
        if (!dup.slotKey) {
            dup.x += (p.x - dup.x) * 0.16;
            dup.y += (p.y - dup.y) * 0.16;
        }
    }

    _countNormalBalls() {
        let count = 0;
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            if (!b.minus && !b.duplicate) count++;
        }
        return count;
    }

    _refreshSpawnPauseState() {
        const normalCount = this._countNormalBalls();
        if (!this.spawnPausedByLimit && normalCount >= this.maxNormalBalls) {
            this.spawnPausedByLimit = true;
            return;
        }
        if (this.spawnPausedByLimit && normalCount <= this.minBaseBalls) {
            this.spawnPausedByLimit = false;
        }
    }

    _canSpawnNormalBall() {
        if (this.spawnPausedByLimit) return false;
        return this._countNormalBalls() < this.maxNormalBalls;
    }

    _clampPointToArena(x, y, r) {
        const m = this._metrics();
        const pad = Math.max(6 * m.sX, r + 2 * m.sX);
        const minX = m.arenaX + pad;
        const maxX = m.arenaX + m.arenaW - pad;
        const minY = m.arenaY + pad;
        const maxY = m.arenaY + m.arenaH - pad;
        return {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y)),
        };
    }

    _findNearbyArenaPoint(cx, cy, distance) {
        const base = this._clampPointToArena(cx + distance, cy, 20);
        for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = distance + Math.random() * 24;
            const p = this._clampPointToArena(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 20);
            let overlapped = false;
            for (let j = 0; j < this.balls.length; j++) {
                const b = this.balls[j];
                if (b.minus || b.duplicate) continue;
                if (Math.hypot(p.x - b.x, p.y - b.y) < (b.r + 18)) {
                    overlapped = true;
                    break;
                }
            }
            if (!overlapped) return p;
        }
        return base;
    }

    _slotValue(slotKey) {
        const slot = this._slotByKey(slotKey);
        if (!slot || !slot.ballId) return null;
        const b = this._ballById(slot.ballId);
        return b ? b.value : null;
    }

    _expectedForSlot(slotKey) {
        if (!this.answers) return null;
        if (slotKey === 'usableSubnets') return this.answers.usableSubnets;
        if (slotKey === 'totalSubnets') return this.answers.totalSubnets;
        if (slotKey === 'totalHosts') return this.answers.totalHosts;
        if (slotKey === 'usableHosts') return this.answers.usableHosts;
        return null;
    }

    _submitAnswers() {
        if (this.finished || this.phase !== 'build') return;
        this.validationAttempts++;
        let hasMissing = false;
        let wrongCount = 0;
        let correctCount = 0;
        const mistakeRows = [];
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            const expected = this._expectedForSlot(s.key);
            const actual = this._slotValue(s.key);
            if (actual === null) {
                hasMissing = true;
                s.result = 'wrong';
                s.resultTimer = 75;
                mistakeRows.push({
                    stepKey: s.key,
                    stepLabel: s.label,
                    issueType: 'missing_answer',
                    expected: expected,
                    submitted: null,
                    tryNumber: this.validationAttempts,
                    gameplayStep: 'subnet_calculation',
                });
                continue;
            }
            this.slotStatTotals.totalChecks++;
            if (actual === expected) {
                correctCount++;
                s.result = 'correct';
                s.resultTimer = 130;
                continue;
            }
            wrongCount++;
            this.slotStatTotals.wrongChecks++;
            if (this.slotStatTotals.wrongSlotFrequency[s.key] !== undefined) {
                this.slotStatTotals.wrongSlotFrequency[s.key]++;
            }
            mistakeRows.push({
                stepKey: s.key,
                stepLabel: s.label,
                issueType: 'wrong_answer',
                expected: expected,
                submitted: actual,
                tryNumber: this.validationAttempts,
                gameplayStep: 'subnet_calculation',
            });
            s.result = 'wrong';
            s.resultTimer = 130;
            const wrongBall = this._ballById(s.ballId);
            if (wrongBall) this._emitPixelDissolve(wrongBall, '#FF5E79', 36);
            if (s.ballId) this._removeBall(s.ballId);
            s.ballId = null;
        }

        if (hasMissing) {
            this._reportValidationMistakes(mistakeRows);
            this.failBanner = 'FILL ALL FOUR ANSWER SLOTS.';
            this.failBannerTimer = 100;
            this.shake = 12;
            this._playCancel();
            this._applyAttemptLimitFailure();
            return;
        }

        if (wrongCount === 0 && correctCount === this.slots.length) {
            this.phase = 'success';
            this.phaseTimer = 120;
            this.failBanner = 'VALIDATED. SUBNET SIMULATION COMPLETE.';
            this.failBannerTimer = 120;
            this._saveState();
            this._playConfirm();
            return;
        }

        this.shake = 24;
        this._reportValidationMistakes(mistakeRows);
        this.failBanner = 'ANSWER MISMATCH. WRONG SLOTS PURGED.';
        this.failBannerTimer = 120;
        this._playCancel();
        this._applyAttemptLimitFailure();
    }

    _attemptsRemaining() {
        if (!this.enforceAttemptLimit) return 0;
        return Math.max(0, this.maxAttempts - this.validationAttempts);
    }

    _applyAttemptLimitFailure() {
        if (!this.enforceAttemptLimit || this.validationAttempts < this.maxAttempts) return false;
        this.phase = 'failed';
        this.phaseTimer = 70;
        this.failBanner = 'THREE ATTEMPTS EXHAUSTED. RETURNING TO SIMULATOR TRAINING.';
        this.failBannerTimer = 90;
        this.shake = 28;
        return true;
    }

    _reportValidationMistakes(mistakes) {
        if (!Array.isArray(mistakes) || !mistakes.length) return false;
        if (!IP2Live.GameManager || typeof IP2Live.GameManager.handleGameplayMistake !== 'function') return false;
        IP2Live.GameManager.handleGameplayMistake('ip_subnet_simulator', {
            gameplayId: 'ip_subnet_simulator',
            mapId: this.options.mapId || 8,
            questId: this.options.questId,
            objectiveId: this.options.objectiveId,
            mistakes: mistakes,
            attemptsRemaining: this._attemptsRemaining(),
        });
        return true;
    }

    _saveState() {
        if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
        const state = this.cidrState || IP2Live.CIDRGameplayState.latest || {};
        state.gameplay4 = {
            totalSubnets: this.answers.totalSubnets,
            usableSubnets: this.answers.usableSubnets,
            totalHosts: this.answers.totalHosts,
            usableHosts: this.answers.usableHosts,
            hosts: this.answers.usableHosts,
            borrowedBits: this.borrowedBits,
            hostBits: this.hostBits,
            solvedAt: Date.now(),
        };
        IP2Live.CIDRGameplayState.latest = state;
        if (state.handoffKey) {
            if (!IP2Live.CIDRGameplayState.handoffs) IP2Live.CIDRGameplayState.handoffs = {};
            IP2Live.CIDRGameplayState.handoffs[state.handoffKey] = Object.assign({}, state);
        }
    }

    _emitPop(x, y, color, count) {
        const n = Math.max(6, count || 16);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 0.8 + Math.random() * 2.4;
            this.particles.push({
                x,
                y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 0.5,
                life: 14 + Math.floor(Math.random() * 18),
                color: color || '#7EEDFF',
                size: 1 + Math.random() * 2.8,
            });
        }
    }

    _emitPixelDissolve(ball, color, count) {
        if (!ball) return;
        const n = Math.max(18, count || 30);
        for (let i = 0; i < n; i++) {
            const px = ball.x + (Math.random() - 0.5) * ball.r * 1.6;
            const py = ball.y + (Math.random() - 0.5) * ball.r * 1.6;
            const a = Math.random() * Math.PI * 2;
            const sp = 0.7 + Math.random() * 2.1;
            this.particles.push({
                x: px,
                y: py,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 0.25,
                life: 12 + Math.floor(Math.random() * 18),
                color: color || '#FF5E79',
                size: 1.6 + Math.random() * 2.4,
                pixel: true,
            });
        }
    }

    _finishSuccess() {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete({
                gameplayId: 'ip_subnet_simulator',
                handoffKey: this.cidrState && this.cidrState.handoffKey,
                mask: this.cidrState && this.cidrState.mask,
                cidr: this.cidrState && this.cidrState.cidr,
                passed: true,
                answers: Object.assign({}, this.answers),
                validationAttempts: this.validationAttempts,
                attemptsUsed: this.validationAttempts,
                maxAttempts: this.enforceAttemptLimit ? this.maxAttempts : 0,
                slotStats: {
                    totalChecks: this.slotStatTotals.totalChecks,
                    wrongChecks: this.slotStatTotals.wrongChecks,
                    wrongSlotFrequency: Object.assign({}, this.slotStatTotals.wrongSlotFrequency),
                },
            });
            return;
        }
        if (Manager && Manager.Stack) Manager.Stack.pop();
    }

    _failOut() {
        if (this.finished) return;
        this.finished = true;
        const result = {
            gameplayId: 'ip_subnet_simulator',
            handoffKey: this.cidrState && this.cidrState.handoffKey,
            mask: this.cidrState && this.cidrState.mask,
            cidr: this.cidrState && this.cidrState.cidr,
            passed: false,
            reason: 'attempts_exhausted',
            attemptsUsed: this.validationAttempts,
            maxAttempts: this.maxAttempts,
            validationAttempts: this.validationAttempts,
            slotStats: {
                totalChecks: this.slotStatTotals.totalChecks,
                wrongChecks: this.slotStatTotals.wrongChecks,
                wrongSlotFrequency: Object.assign({}, this.slotStatTotals.wrongSlotFrequency),
            },
        };
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed(result);
            return;
        }
        if (typeof this.options.onCancel === 'function') this.options.onCancel();
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
        this._layoutSlots();

        ctx.save();
        if (this.shake > 0) {
            const amp = this.shake * 0.14 * m.sX;
            ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
        }
        this._drawBackdrop(ctx, m);
        this._drawFrame(ctx, m);
        this._drawHeader(ctx, m);
        this._drawArena(ctx, m);
        this._drawBottomTargets(ctx, m);
        this._drawBalls(ctx, m);
        this._drawSubmit(ctx, m);
        this._drawBanner(ctx, m);
        this._drawParticles(ctx, m);
        this._drawTutorialHighlight(ctx, m);
        ctx.restore();

        const sharedPopup = IP2Live.GameplayCompletionPopup;
        if (this.phase === 'success' && sharedPopup && typeof sharedPopup.draw === 'function') {
            sharedPopup.draw(ctx, {
                gameplayId: 'ip_subnet_simulator',
                label: this.options.questLabel || 'Subnet capacity simulation validated',
                footer: 'SUBNET MODEL STABLE  //  PROGRESS SECURED',
                progress: Math.max(0, Math.min(1, 1 - this.phaseTimer / 120)),
                tick: this.animTick || 0,
            });
        }

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
        const panelY = 48 * sY;
        const panelW = cW - panelX * 2;
        const panelH = cH - panelY * 2;
        const arenaX = panelX + 28 * sX;
        const arenaY = panelY + 92 * sY;
        const arenaW = panelW - 56 * sX;
        const arenaH = panelH - 230 * sY;
        return { cW, cH, sX, sY, panelX, panelY, panelW, panelH, arenaX, arenaY, arenaW, arenaH };
    }

    _layoutSlots() {
        const m = this._metrics();
        const bayH = 100 * m.sY;
        const bayBottom = m.panelY + m.panelH - 16 * m.sY;
        const bayY = bayBottom - bayH;
        const y = bayY + bayH * 0.5;
        const submitW = 76 * m.sX;
        const submitH = 84 * m.sY;
        const submitX = m.panelX + m.panelW - submitW - 26 * m.sX;
        const dockLeft = m.panelX + 28 * m.sX;
        const dockRight = submitX - 18 * m.sX;
        const dockGap = 12 * m.sX;
        const dockW = (dockRight - dockLeft - dockGap * 3) / 4;
        for (let i = 0; i < this.slots.length; i++) {
            this.slots[i].x = dockLeft + dockW * 0.5 + i * (dockW + dockGap);
            this.slots[i].y = y;
            this.slots[i].bayY = bayY;
            this.slots[i].bayW = dockW;
            this.slots[i].bayH = bayH;
            this.slots[i].r = 36 * Math.min(1, m.sX, m.sY);
            const b = this._ballById(this.slots[i].ballId);
            if (b && this.dragBallId !== b.id) {
                b.x = this.slots[i].x;
                b.y = this.slots[i].y;
                b.slotKey = this.slots[i].key;
            }
        }
        this.submitRect = {
            x: submitX,
            y: m.panelY + m.panelH - 100 * m.sY,
            w: submitW,
            h: submitH,
        };
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
        const desiredW = Math.max(220 * m.sX, label.length * 7.2 * m.sX);
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
        const slotRect = (slotKey) => {
            const slot = this._slotByKey(slotKey);
            if (!slot) return null;
            const w = slot.bayW || 210 * m.sX;
            const h = slot.bayH || 100 * m.sY;
            const y = Number.isFinite(slot.bayY) ? slot.bayY : slot.y - h * 0.5;
            return clampRect({
                x: slot.x - w * 0.5 - 5 * m.sX,
                y: y - 10 * m.sY,
                w: w + 10 * m.sX,
                h: h + 15 * m.sY,
            });
        };
        const ballRect = (ball) => {
            if (!ball) return null;
            const padding = 12 * m.sX;
            return clampRect({
                x: ball.x - ball.r - padding,
                y: ball.y - ball.r - padding,
                w: (ball.r + padding) * 2,
                h: (ball.r + padding) * 2,
            });
        };
        const result = { rects: [], label: highlight.label || '' };
        const widgetW = 286 * m.sX;
        const widgetH = 54 * m.sY;
        const widgetX = m.panelX + m.panelW - widgetW - 24 * m.sX;
        const widgetY = m.panelY + 12 * m.sY;

        if (highlight.type === 'carried_reference') {
            result.rects.push(clampRect({
                x: widgetX - 8 * m.sX,
                y: widgetY - 8 * m.sY,
                w: widgetW + 16 * m.sX,
                h: widgetH + 16 * m.sY,
            }));
            return result;
        }

        if (highlight.type === 'power_totals') {
            result.rects.push(clampRect({
                x: widgetX - 8 * m.sX,
                y: widgetY - 8 * m.sY,
                w: widgetW + 16 * m.sX,
                h: widgetH + 16 * m.sY,
            }));
            const totalSubnets = slotRect('totalSubnets');
            const totalHosts = slotRect('totalHosts');
            if (totalSubnets) result.rects.push(totalSubnets);
            if (totalHosts) result.rects.push(totalHosts);
            return result;
        }

        if (highlight.type === 'usable_values') {
            const minus = ballRect(this._minusBall());
            const usableSubnets = slotRect('usableSubnets');
            const usableHosts = slotRect('usableHosts');
            if (minus) result.rects.push(minus);
            if (usableSubnets) result.rects.push(usableSubnets);
            if (usableHosts) result.rects.push(usableHosts);
            return result;
        }

        if (highlight.type === 'duplicate_strategy') {
            const duplicate = ballRect(this._duplicateBall());
            if (duplicate) result.rects.push(duplicate);
            result.rects.push(clampRect({
                x: m.panelX + 24 * m.sX,
                y: m.panelY + m.panelH - 120 * m.sY,
                w: m.panelW - 145 * m.sX,
                h: 116 * m.sY,
            }));
            if (this.submitRect) {
                result.rects.push(clampRect({
                    x: this.submitRect.x - 7 * m.sX,
                    y: this.submitRect.y - 7 * m.sY,
                    w: this.submitRect.w + 14 * m.sX,
                    h: this.submitRect.h + 14 * m.sY,
                }));
            }
            return result;
        }

        return null;
    }

    _drawBackdrop(ctx, m) {
        const g = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        g.addColorStop(0, '#03080F');
        g.addColorStop(0.52, '#0A1622');
        g.addColorStop(1, '#02070D');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);
        this._drawBackdropDecor(ctx, m);
    }

    _drawBackdropDecor(ctx, m) {
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.strokeStyle = '#356176';
        ctx.lineWidth = Math.max(0.7, 0.8 * m.sX);
        for (let x = -m.cH; x < m.cW + m.cH; x += 48 * m.sX) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + m.cH * 0.22, m.cH);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.17;
        ctx.fillStyle = '#00DCE8';
        for (let i = 0; i < 22; i++) {
            const px = (37 + i * 83) % Math.max(1, m.cW);
            const py = (19 + i * 47) % Math.max(1, m.cH);
            ctx.fillRect(px, py, 2 * m.sX, 2 * m.sY);
        }
        ctx.restore();
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
        this._drawMetalTexture(ctx, m.panelX + 13 * m.sX, m.panelY + 13 * m.sY, m.panelW - 26 * m.sX, m.panelH - 26 * m.sY, m, 0.14);

        const railTop = m.panelY + 76 * m.sY;
        const railBottom = m.panelY + m.panelH - 18 * m.sY;
        [m.panelX + 12 * m.sX, m.panelX + m.panelW - 12 * m.sX].forEach((rx) => {
            const rail = ctx.createLinearGradient(rx - 5 * m.sX, 0, rx + 5 * m.sX, 0);
            rail.addColorStop(0, '#020304');
            rail.addColorStop(0.32, '#5B6B73');
            rail.addColorStop(0.52, '#AAB5B9');
            rail.addColorStop(1, '#030506');
            ctx.fillStyle = rail;
            ctx.fillRect(rx - 5 * m.sX, railTop, 10 * m.sX, railBottom - railTop);
            for (let i = 0; i < 4; i++) this._drawFastener(ctx, rx, railTop + (railBottom - railTop) * (i / 3), 4.2 * m.sX, m);
        });

        ctx.fillStyle = '#00E7F2';
        ctx.globalAlpha = 0.46;
        ctx.fillRect(m.panelX + 30 * m.sX, m.panelY + 72 * m.sY, m.panelW - 60 * m.sX, 1.4 * m.sY);
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
        const plate = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        plate.addColorStop(0, '#202A34');
        plate.addColorStop(0.18, '#090D13');
        plate.addColorStop(0.74, '#111821');
        plate.addColorStop(1, '#030508');
        ctx.fillStyle = plate;
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
        ctx.fillText('S-04', bx + 28 * m.sX, by + 34 * m.sY);

        const titleX = bx + 82 * m.sX;
        const titleY = by + 31 * m.sY;
        ctx.font = 'bold ' + Math.round(20 * m.sX) + 'px ' + titleFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#F7FCFF';
        ctx.shadowColor = 'rgba(0,240,255,0.22)';
        ctx.shadowBlur = 5 * m.sX;
        ctx.fillText('SUBNET', titleX, titleY);
        const subnetW = ctx.measureText('SUBNET').width;
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#00F0FF';
        ctx.fillText('SIMULATOR', titleX + subnetW + 12 * m.sX, titleY);

        ctx.font = 'bold ' + Math.round(6.3 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(190,211,222,0.68)';
        ctx.fillText('SUBNET CAPACITY // MERGE & ALLOCATION CONSOLE', titleX, by + 46 * m.sY);
        ctx.fillStyle = '#FF315F';
        ctx.fillRect(bx + 75 * m.sX, by + 6 * m.sY, 28 * m.sX, 2 * m.sY);
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(bx + 106 * m.sX, by + 6 * m.sY, 72 * m.sX, 2 * m.sY);
        ctx.restore();

        this._drawCIDRWidget(ctx, m);
    }

    _drawCIDRWidget(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const w = 286 * m.sX;
        const h = 54 * m.sY;
        const x = m.panelX + m.panelW - w - 24 * m.sX;
        const y = m.panelY + 12 * m.sY;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.76)';
        ctx.shadowBlur = 10 * m.sX;
        ctx.shadowOffsetY = 4 * m.sY;
        const shell = ctx.createLinearGradient(x, y, x, y + h);
        shell.addColorStop(0, '#45535B');
        shell.addColorStop(0.08, '#0B1116');
        shell.addColorStop(0.72, '#132029');
        shell.addColorStop(1, '#05080B');
        ctx.fillStyle = shell;
        this._fillChamferRect(ctx, x, y, w, h, 10 * m.sX);
        ctx.shadowColor = 'transparent';
        this._strokeChamferRect(ctx, x, y, w, h, 10 * m.sX, '#536B76', 1.4 * m.sX);
        this._strokeChamferRect(ctx, x + 5 * m.sX, y + 5 * m.sY, w - 10 * m.sX, h - 10 * m.sY, 7 * m.sX, 'rgba(0,234,242,0.46)', 1 * m.sX);
        this._drawMetalTexture(ctx, x + 7 * m.sX, y + 7 * m.sY, w - 14 * m.sX, h - 14 * m.sY, m, 0.15);

        const cidr = this.cidrState && Number.isFinite(Number(this.cidrState.cidr)) ? Number(this.cidrState.cidr) : 0;
        const octetIndex = this.cidrState && Number.isFinite(Number(this.cidrState.interestingOctetIndex)) ? Number(this.cidrState.interestingOctetIndex) + 1 : 4;
        const octetValue = this.cidrState && Number.isFinite(Number(this.cidrState.interestingOctetValue)) ? Number(this.cidrState.interestingOctetValue) : 0;
        ctx.fillStyle = '#00EAF2';
        ctx.font = 'bold ' + (6.8 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('CARRIED OCTET // CIDR /' + cidr, x + 13 * m.sX, y + 14 * m.sY);
        if (this.enforceAttemptLimit) {
            ctx.fillStyle = this.validationAttempts > 0 ? '#FFE600' : 'rgba(190,218,228,0.72)';
            ctx.font = 'bold ' + (6.2 * m.sY).toFixed(1) + 'px ' + monoFont;
            ctx.textAlign = 'right';
            ctx.fillText('TRIES ' + this._attemptsRemaining() + '/' + this.maxAttempts, x + w - 13 * m.sX, y + 14 * m.sY);
            ctx.textAlign = 'left';
        }
        ctx.fillStyle = '#FFE600';
        ctx.font = 'bold ' + (7.8 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText('O' + octetIndex + ' // ' + octetValue, x + 13 * m.sX, y + 34 * m.sY);

        const startX = x + 132 * m.sX;
        const cy = y + 25 * m.sY;
        for (let i = 0; i < this.bitsBinary.length; i++) {
            const bit = this.bitsBinary[i] === '1';
            const cx = startX + i * (17 * m.sX);
            this._drawOctetLamp(ctx, cx, cy, 4.2 * m.sY, bit, i, m);
        }
        ctx.fillStyle = 'rgba(190,218,228,0.68)';
        ctx.font = 'bold ' + (6.4 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textAlign = 'center';
        ctx.fillText(this.bitsBinary, startX + 59.5 * m.sX, y + 45 * m.sY);
        this._drawFastener(ctx, x + w - 11 * m.sX, y + 11 * m.sY, 3.2 * m.sX, m);
        ctx.restore();
    }

    _drawArena(ctx, m) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.78)';
        ctx.shadowBlur = 16 * m.sX;
        ctx.shadowOffsetY = 6 * m.sY;
        const shell = ctx.createLinearGradient(m.arenaX, m.arenaY, m.arenaX, m.arenaY + m.arenaH);
        shell.addColorStop(0, '#2D3A43');
        shell.addColorStop(0.035, '#0A1015');
        shell.addColorStop(0.52, '#111B22');
        shell.addColorStop(0.965, '#070B0F');
        shell.addColorStop(1, '#29363E');
        ctx.fillStyle = shell;
        this._fillChamferRect(ctx, m.arenaX, m.arenaY, m.arenaW, m.arenaH, 12 * m.sX);
        ctx.shadowColor = 'transparent';
        this._strokeChamferRect(ctx, m.arenaX, m.arenaY, m.arenaW, m.arenaH, 12 * m.sX, '#536873', 2.2 * m.sX);
        this._strokeChamferRect(ctx, m.arenaX + 7 * m.sX, m.arenaY + 7 * m.sY, m.arenaW - 14 * m.sX, m.arenaH - 14 * m.sY, 8 * m.sX, 'rgba(0,231,242,0.4)', 1 * m.sX);
        this._drawMetalTexture(ctx, m.arenaX + 9 * m.sX, m.arenaY + 9 * m.sY, m.arenaW - 18 * m.sX, m.arenaH - 18 * m.sY, m, 0.22);

        const tabX = m.arenaX + 18 * m.sX;
        const tabY = m.arenaY + 8 * m.sY;
        const tabW = 260 * m.sX;
        const tabH = 19 * m.sY;
        const tab = ctx.createLinearGradient(tabX, tabY, tabX + tabW, tabY);
        tab.addColorStop(0, '#00DDE8');
        tab.addColorStop(0.72, '#087783');
        tab.addColorStop(1, '#10242A');
        ctx.fillStyle = tab;
        this._fillChamferRect(ctx, tabX, tabY, tabW, tabH, 5 * m.sX);
        ctx.fillStyle = '#031014';
        ctx.font = 'bold ' + (6.8 * m.sY).toFixed(1) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SUBNET MERGE FIELD // DRAG + COMBINE', tabX + 12 * m.sX, tabY + 13 * m.sY);

        const liveX = m.arenaX + m.arenaW - 184 * m.sX;
        ctx.fillStyle = '#FFE600';
        this._fillChamferRect(ctx, liveX, tabY, 160 * m.sX, tabH, 5 * m.sX);
        ctx.fillStyle = '#120F00';
        ctx.fillText('LIVE NODES // ' + this._countNormalBalls() + '/10', liveX + 12 * m.sX, tabY + 13 * m.sY);

        ctx.save();
        ctx.beginPath();
        this._traceChamferPath(ctx, m.arenaX + 13 * m.sX, m.arenaY + 34 * m.sY, m.arenaW - 26 * m.sX, m.arenaH - 47 * m.sY, 7 * m.sX);
        ctx.clip();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#00DCE8';
        const lineSpan = m.arenaH - 58 * m.sY;
        const lineStep = lineSpan / 15;
        const lineOffset = (this.animTick * 0.22 * m.sY) % lineStep;
        for (let i = 0; i < 16; i++) {
            const y = m.arenaY + 42 * m.sY + ((i * lineStep + lineOffset) % lineSpan);
            ctx.fillRect(m.arenaX + 16 * m.sX, y, m.arenaW - 32 * m.sX, 1 * m.sY);
        }

        ctx.globalAlpha = 0.2;
        for (let packet = 0; packet < 6; packet++) {
            const travel = m.arenaW - 88 * m.sX;
            const progress = (this.animTick * (0.28 + packet * 0.025) * m.sX + packet * 181 * m.sX) % travel;
            const px = m.arenaX + 44 * m.sX + progress;
            const py = m.arenaY + 66 * m.sY + packet * ((m.arenaH - 116 * m.sY) / 5);
            ctx.strokeStyle = packet % 2 ? '#00DCE8' : '#7FE9F4';
            ctx.lineWidth = Math.max(0.7, 0.8 * m.sX);
            ctx.beginPath();
            ctx.moveTo(px - 30 * m.sX, py);
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.fillStyle = packet % 2 ? '#FFE600' : '#00EAF2';
            ctx.fillRect(px, py - 1.5 * m.sY, 3 * m.sX, 3 * m.sY);
        }

        ctx.globalAlpha = 0.09;
        ctx.strokeStyle = '#FFE600';
        ctx.lineWidth = 1 * m.sX;
        const watermarkX = m.arenaX + m.arenaW * 0.5;
        const watermarkY = m.arenaY + m.arenaH * 0.56;
        for (let ring = 0; ring < 3; ring++) {
            ctx.beginPath();
            ctx.arc(watermarkX, watermarkY, (38 + ring * 28 + Math.sin(this.animTick * 0.025 + ring) * 1.5) * m.sY, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8 + this.animTick * 0.004;
            ctx.beginPath();
            ctx.moveTo(watermarkX + Math.cos(a) * 28 * m.sX, watermarkY + Math.sin(a) * 28 * m.sY);
            ctx.lineTo(watermarkX + Math.cos(a) * 96 * m.sX, watermarkY + Math.sin(a) * 96 * m.sY);
            ctx.stroke();
        }
        ctx.restore();

        const railTop = m.arenaY + 36 * m.sY;
        const railBottom = m.arenaY + m.arenaH - 14 * m.sY;
        [m.arenaX + 12 * m.sX, m.arenaX + m.arenaW - 12 * m.sX].forEach((rx) => {
            ctx.fillStyle = '#52636B';
            ctx.fillRect(rx - 3 * m.sX, railTop, 6 * m.sX, railBottom - railTop);
            for (let i = 0; i < 3; i++) this._drawFastener(ctx, rx, railTop + (railBottom - railTop) * (i / 2), 3.4 * m.sX, m);
        });
        ctx.restore();
    }

    _drawBalls(ctx, m) {
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            const pulseScale = b.pulse > 0 ? (1 + (b.pulse / 18) * 0.14) : 1;
            const rr = b.r * pulseScale;
            this._drawSubnetToken(ctx, b, rr, m);
        }
        ctx.textBaseline = 'alphabetic';
    }

    _drawBottomTargets(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            const bayW = s.bayW || 210 * m.sX;
            const bayH = s.bayH || 100 * m.sY;
            const bayX = s.x - bayW * 0.5;
            const bayY = Number.isFinite(s.bayY) ? s.bayY : s.y - bayH * 0.5;
            const hasResult = !!s.result && (s.resultTimer || 0) > 0;
            const isCorrect = s.result === 'correct';
            const hover = this.hoverSlotKey === s.key;
            const accent = hasResult ? (isCorrect ? '#76FF93' : '#FF315F') : (hover ? '#FFE600' : '#00EAF2');
            if (hasResult) {
                const glow = ctx.createRadialGradient(s.x, s.y, s.r * 0.2, s.x, s.y, s.r * 2.4);
                glow.addColorStop(0, isCorrect ? 'rgba(118,255,147,0.46)' : 'rgba(255,49,95,0.45)');
                glow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r * 2.35, 0, Math.PI * 2);
                ctx.fill();
            }

            const shell = ctx.createLinearGradient(bayX, bayY, bayX, bayY + bayH);
            shell.addColorStop(0, '#3B4850');
            shell.addColorStop(0.06, '#0B1115');
            shell.addColorStop(0.7, '#131D23');
            shell.addColorStop(1, '#05080A');
            ctx.fillStyle = shell;
            this._fillChamferRect(ctx, bayX, bayY, bayW, bayH, 9 * m.sX);
            this._strokeChamferRect(ctx, bayX, bayY, bayW, bayH, 9 * m.sX, accent, hover ? 2 * m.sX : 1.2 * m.sX);
            this._strokeChamferRect(ctx, bayX + 5 * m.sX, bayY + 5 * m.sY, bayW - 10 * m.sX, bayH - 10 * m.sY, 6 * m.sX, 'rgba(100,124,135,0.44)', 0.9 * m.sX);
            this._drawMetalTexture(ctx, bayX + 7 * m.sX, bayY + 7 * m.sY, bayW - 14 * m.sX, bayH - 14 * m.sY, m, 0.13);

            const tabX = bayX + 10 * m.sX;
            const tabY = bayY - 7 * m.sY;
            const tabW = bayW - 20 * m.sX;
            const tabH = 20 * m.sY;
            ctx.fillStyle = i % 2 === 0 ? '#00DCE8' : '#FFE600';
            this._fillChamferRect(ctx, tabX, tabY, tabW, tabH, 5 * m.sX);
            ctx.fillStyle = '#071015';
            ctx.font = 'bold ' + (8.6 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.label, tabX + tabW * 0.5, tabY + tabH * 0.54);

            if (hover || hasResult) {
                const socketGlow = ctx.createRadialGradient(s.x, s.y, s.r * 0.45, s.x, s.y, s.r * 1.55);
                socketGlow.addColorStop(0, hover ? 'rgba(255,230,0,0.26)' : (isCorrect ? 'rgba(118,255,147,0.24)' : 'rgba(255,49,95,0.24)'));
                socketGlow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = socketGlow;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r * 1.55, 0, Math.PI * 2);
                ctx.fill();
            }

            const socket = ctx.createRadialGradient(s.x - s.r * 0.22, s.y - s.r * 0.26, s.r * 0.1, s.x, s.y, s.r * 1.12);
            socket.addColorStop(0, '#17313A');
            socket.addColorStop(0.5, '#0B2028');
            socket.addColorStop(1, '#03090D');
            ctx.fillStyle = socket;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r + 3 * m.sY, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(90,174,193,0.46)';
            ctx.lineWidth = 1.2 * m.sX;
            ctx.stroke();

            ctx.strokeStyle = accent;
            ctx.lineWidth = hover ? 3 * m.sX : 2.2 * m.sX;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r - 4 * m.sY, 0, Math.PI * 2);
            ctx.stroke();

            if (!s.ballId) {
                const drag = this._dragBall();
                const canDrop = hover && drag && !drag.minus && !drag.duplicate;
                this._drawDropArrow(ctx, s.x, s.y - s.r - 2 * m.sY, canDrop ? '#FFE600' : '#00EAF2', i, m);
                ctx.fillStyle = canDrop ? '#FFE600' : '#78909A';
                ctx.font = 'bold ' + (6.5 * m.sY).toFixed(1) + 'px ' + monoFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(canDrop ? String(drag.value) : 'DROP NODE', s.x, s.y + 2 * m.sY);
            }

            this._drawFastener(ctx, bayX + 10 * m.sX, bayY + bayH - 10 * m.sY, 2.8 * m.sX, m);
            this._drawFastener(ctx, bayX + bayW - 10 * m.sX, bayY + bayH - 10 * m.sY, 2.8 * m.sX, m);
        }
        ctx.textBaseline = 'alphabetic';
    }

    _drawSubmit(ctx, m) {
        const b = this.submitRect;
        if (!b) return;
        ctx.save();
        ctx.shadowColor = 'rgba(255,230,0,0.24)';
        ctx.shadowBlur = 12 * m.sX;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, '#FFF05A');
        g.addColorStop(0.46, '#FFE600');
        g.addColorStop(1, '#887700');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 10 * m.sX);
        ctx.shadowColor = 'transparent';
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 10 * m.sX, '#FFF7AA', 1.8 * m.sX);
        this._strokeChamferRect(ctx, b.x + 5 * m.sX, b.y + 5 * m.sY, b.w - 10 * m.sX, b.h - 10 * m.sY, 7 * m.sX, 'rgba(44,40,0,0.46)', 1 * m.sX);
        ctx.fillStyle = '#FF315F';
        ctx.fillRect(b.x + 7 * m.sX, b.y + 8 * m.sY, 4 * m.sX, b.h - 16 * m.sY);
        this._drawValidationGlyph(ctx, b.x + b.w * 0.5 + 2 * m.sX, b.y + b.h * 0.5, m);
        ctx.restore();
    }

    _drawBanner(ctx, m) {
        if (!this.failBanner || this.failBannerTimer <= 0) return;
        const monoFont = this._uiMonoFont();
        const text = this.failBanner;
        const x = m.arenaX + m.arenaW * 0.25;
        const y = m.arenaY + 42 * m.sY;
        const w = m.arenaW * 0.5;
        const h = 26 * m.sY;
        const success = this.phase === 'success';
        const g = ctx.createLinearGradient(x, y, x + w, y);
        g.addColorStop(0, success ? 'rgba(21,77,57,0.94)' : 'rgba(92,18,39,0.94)');
        g.addColorStop(1, 'rgba(8,15,20,0.96)');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, x, y, w, h, 6 * m.sX);
        this._strokeChamferRect(ctx, x, y, w, h, 6 * m.sX, success ? '#76FF93' : '#FF315F', 1.4 * m.sX);
        ctx.fillStyle = success ? '#D9FFE5' : '#FFD6DF';
        ctx.font = 'bold ' + (8.6 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textAlign = 'center';
        ctx.fillText(text, x + w * 0.5, y + h * 0.66);
    }

    _drawSubnetToken(ctx, ball, radius, m) {
        const primaryFont = this._uiPrimaryFont();
        const accent = ball.minus ? '#FF4D71' : (ball.duplicate ? '#78F5C0' : '#6EEBFF');
        const accentGlow = ball.minus ? 'rgba(255,49,95,0.32)' : (ball.duplicate ? 'rgba(118,255,176,0.3)' : 'rgba(63,221,245,0.3)');
        const pulse = 0.78 + 0.22 * Math.sin(this.animTick * 0.12 + ball.id * 0.51);
        const x = ball.x;
        const y = ball.y;

        ctx.save();
        const glow = ctx.createRadialGradient(x, y, radius * 0.42, x, y, radius * 1.45);
        glow.addColorStop(0, accentGlow);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.58 + pulse * 0.2;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.shadowColor = 'rgba(0,0,0,0.82)';
        ctx.shadowBlur = 7 * m.sX;
        ctx.shadowOffsetY = 3 * m.sY;
        const face = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.28, radius * 0.08, x, y, radius);
        face.addColorStop(0, ball.minus ? '#34202A' : (ball.duplicate ? '#14312D' : '#16313B'));
        face.addColorStop(0.58, '#0B222A');
        face.addColorStop(1, '#061218');
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = ball.minus ? 'rgba(255,77,113,0.42)' : (ball.duplicate ? 'rgba(120,245,192,0.42)' : 'rgba(93,199,218,0.5)');
        ctx.lineWidth = 1.1 * m.sX;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.08, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.8, 2.4 * m.sX);
        ctx.globalAlpha = 0.78 + pulse * 0.2;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.87, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (ball.duplicate) {
            ctx.strokeStyle = '#DFFFF0';
            ctx.lineWidth = Math.max(1, 1.5 * m.sX);
            ctx.beginPath();
            ctx.arc(x - 5 * m.sX, y - 6 * m.sY, 6.5 * m.sY, 0, Math.PI * 2);
            ctx.arc(x + 5 * m.sX, y - 6 * m.sY, 6.5 * m.sY, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#FFE600';
            ctx.font = 'bold ' + Math.max(10 * m.sY, radius * 0.48).toFixed(1) + 'px ' + primaryFont;
            ctx.fillText(String(Math.max(0, ball.usesLeft || 0)), x, y + 9 * m.sY);
        } else {
            ctx.fillStyle = '#F5FCFF';
            const textPx = Math.max(11 * m.sY, Math.min(19 * m.sY, radius * 0.76));
            ctx.font = 'bold ' + textPx.toFixed(1) + 'px ' + primaryFont;
            ctx.fillText(ball.minus ? '-2' : String(ball.value), x, y);
        }
        ctx.restore();
    }

    _drawDropArrow(ctx, x, tipY, color, index, m) {
        const bob = Math.sin(this.animTick * 0.12 + index * 0.65) * 3 * m.sY;
        const tip = tipY + bob;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 7 * m.sX;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2 * m.sX;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(x, tip - 13 * m.sY);
        ctx.lineTo(x, tip - 4 * m.sY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 5 * m.sX, tip - 6 * m.sY);
        ctx.lineTo(x + 5 * m.sX, tip - 6 * m.sY);
        ctx.lineTo(x, tip);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    _drawValidationGlyph(ctx, x, y, m) {
        ctx.save();
        ctx.strokeStyle = '#071015';
        ctx.fillStyle = 'rgba(7,16,21,0.08)';
        ctx.lineWidth = 3.2 * m.sX;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(x, y - 25 * m.sY);
        ctx.lineTo(x + 20 * m.sX, y - 17 * m.sY);
        ctx.lineTo(x + 17 * m.sX, y + 9 * m.sY);
        ctx.lineTo(x, y + 27 * m.sY);
        ctx.lineTo(x - 17 * m.sX, y + 9 * m.sY);
        ctx.lineTo(x - 20 * m.sX, y - 17 * m.sY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#FF315F';
        ctx.lineWidth = 1.3 * m.sX;
        ctx.beginPath();
        ctx.arc(x, y - 3 * m.sY, 10 * m.sY, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
            const nx = x - 8 * m.sX + i * 8 * m.sX;
            ctx.fillStyle = i === 1 ? '#00AEBB' : '#071015';
            ctx.beginPath();
            ctx.arc(nx, y - 3 * m.sY, 2.2 * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = '#071015';
        ctx.lineWidth = 4.3 * m.sX;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(x - 9 * m.sX, y + 4 * m.sY);
        ctx.lineTo(x - 2 * m.sX, y + 11 * m.sY);
        ctx.lineTo(x + 12 * m.sX, y - 4 * m.sY);
        ctx.stroke();
        ctx.restore();
    }

    _drawOctetLamp(ctx, x, y, radius, isOn, index, m) {
        const pulse = 0.7 + 0.3 * Math.sin(this.animTick * 0.2 + index * 0.42);
        if (isOn) {
            const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 2.2);
            glow.addColorStop(0, 'rgba(255,230,0,' + (0.7 + pulse * 0.25) + ')');
            glow.addColorStop(1, 'rgba(255,230,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        const socket = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.08, x, y, radius * 1.4);
        socket.addColorStop(0, '#B8C5C9');
        socket.addColorStop(0.36, '#34434A');
        socket.addColorStop(0.68, '#080D10');
        socket.addColorStop(1, '#52636A');
        ctx.fillStyle = socket;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = isOn ? (0.78 + pulse * 0.22) : 1;
        ctx.fillStyle = isOn ? '#FFE600' : '#1A252B';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isOn ? '#FFF6A0' : '#52656D';
        ctx.lineWidth = Math.max(0.7, 0.8 * m.sX);
        ctx.stroke();
        ctx.globalAlpha = 1;
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
        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = '#00DCE8';
        ctx.lineWidth = Math.max(0.6, 0.7 * m.sX);
        for (let i = 0; i < 5; i++) {
            const yy = y + (i + 1) * h / 6;
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(x + w, yy);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawParticles(ctx, m) {
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = Math.max(0, p.life / 30);
            ctx.fillStyle = p.color;
            if (p.pixel) {
                const sz = Math.max(1.4 * m.sY, p.size * m.sY);
                ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * m.sY, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
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
        try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) { }
    }

    _playConfirm() {
        try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) { }
    }

    _playCancel() {
        try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) { }
    }
}

const SubnetSimulatorGameplayManager = {
    VERSION: 'ip-subnetsim-gameplay-manager-20260816-03',
    _active: false,
    _introShown: false,
    _activeAttempt: null,
    _registeredQuestIds: {},
    _triggerLocks: {},

    SUBNET_SIM_QUESTS: [
        {
            id: 'stage.5.ip_subnetsim.01',
            objectiveId: 'solve_subnet_sim_01',
            title: 'SOLVE SUBNET SIMULATOR',
            label: 'Subnet Simulator',
            targetTile: { x: 16, y: 0, z: 20 },
        },
    ],

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_subnet_simulator');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return this.SUBNET_SIM_QUESTS;
    },

    _defaultQuestSpec() {
        const specs = this._questSpecs();
        return specs[0] || this.SUBNET_SIM_QUESTS[0];
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
                        detail: 'TARGET TILE  X:' + target.x + '  Y:' + (target.y || 0) + '  Z:' + target.z,
                        targetTile: target,
                        completionRadiusTiles: 0.55,
                        isComplete: (context, activeQuestManager) => {
                            return SubnetSimulatorGameplayManager._handleObjective(spec, context, activeQuestManager);
                        },
                    },
                ],
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
        if (!spec || !spec.objectiveId) return;
        if (!this._triggerLocks[spec.objectiveId]) return;
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
        if (dist === null || dist > radius) return false;
        if (this._triggerLocks[spec.objectiveId]) return false;

        const attemptKey = this._resolveAttemptKey({ spec, questId: spec.id, objectiveId: spec.objectiveId });
        if (this._activeAttempt === attemptKey || this._active) return false;
        this._activeAttempt = attemptKey;

        const mapId = Number(context && context.mapId) || Number(spec.mapId) || 8;
        const isTutorialSimulator = mapId === 8 && !!spec.tutorial;
        const launchOptions = {
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId,
            targetMask: spec.targetMask,
            handoffKey: spec.handoffKey,
            _fromObjective: true,
            enforceAttemptLimit: mapId === 8,
            maxAttempts: 3,
        };

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_subnet_simulator', Object.assign({}, launchOptions, {
                showIntro: isTutorialSimulator && !this._introShown,
                _reservedAttempt: attemptKey,
            }));
            return false;
        }
        this.launchSubnetSimulatorGameplay(Object.assign({}, launchOptions, {
            mode: 'replace',
            showIntro: isTutorialSimulator && !this._introShown,
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

    _handoffStateForOptions(options) {
        const opts = options || {};
        const key = opts.handoffKey ? String(opts.handoffKey) : null;
        const store = IP2Live.CIDRGameplayState || {};
        if (key && store.handoffs && store.handoffs[key]) return store.handoffs[key];
        if (store.latest && (!key || store.latest.handoffKey === key)) return store.latest;
        if (opts.targetMask) return this._buildCIDRStateFromMask(opts.targetMask, key);
        return store.latest || {};
    },

    _buildCIDRStateFromMask(mask, handoffKey) {
        const octets = String(mask || '255.255.255.0').split('.').map((part) => Number(part));
        while (octets.length < 4) octets.push(0);
        const normalized = octets.slice(0, 4).map((value) => Math.max(0, Math.min(255, Number(value) || 0)));
        let cidr = 0;
        for (let i = 0; i < normalized.length; i++) {
            const bits = this._octetToBits(normalized[i]);
            for (let b = 0; b < bits.length; b++) if (bits[b] === '1') cidr++;
        }
        let octetIndex = 3;
        for (let i = 0; i < normalized.length; i++) {
            if (normalized[i] !== 255 && normalized[i] !== 0) {
                octetIndex = i;
                break;
            }
        }
        const bitsBinary = this._octetToBits(normalized[octetIndex]);
        return {
            gameplayId: 'ip_cidr_binary_panel',
            handoffKey: handoffKey || null,
            mask: normalized.join('.'),
            cidr,
            enteredCIDR: cidr,
            enteredCIDRText: '/' + cidr,
            targetOctets: normalized,
            interestingOctetIndex: octetIndex,
            interestingOctetValue: normalized[octetIndex],
            bitsBinary,
            rebuiltFromQuestSpec: true,
            savedAt: Date.now(),
        };
    },

    _octetToBits(value) {
        const n = Math.max(0, Math.min(255, Number(value) || 0));
        let out = '';
        for (let i = 7; i >= 0; i--) out += (n & (1 << i)) ? '1' : '0';
        return out;
    },

    launchSubnetSimulatorGameplay(options) {
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
            const screen = new IP2LiveSubnetSimulatorGameplayScreen({
                targetMask: opts.targetMask,
                handoffKey: opts.handoffKey,
                mapId: opts.mapId,
                questId: opts.questId,
                objectiveId: opts.objectiveId,
                guidedTutorial: shouldShowIntro,
                enforceAttemptLimit: !!opts.enforceAttemptLimit,
                maxAttempts: opts.maxAttempts || 3,
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
                detail: opts.loadingDetail || 'Opening Subnet Simulator',
                onComplete: openGameplay,
            })) return;
            openGameplay();
        };

        const openSafely = () => {
            try { open(); }
            catch (e) {
                this._active = false;
                this._activeAttempt = null;
                console.warn('[IP2Live] SubnetSimulatorGameplayManager failed to open gameplay:', e);
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
                IP2Live.GameManager.handleGameplayCompleted('ip_subnet_simulator', {
                    gameplayId: 'ip_subnet_simulator',
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || spec.mapId || 8,
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
        })) finalizeExit();
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
            if (Number(opts.mapId || spec.mapId) === 8) this._sendBackToSubnetTutorial();
            if (typeof opts.onFailed === 'function') opts.onFailed(result);
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_subnet_simulator', {
                    gameplayId: 'ip_subnet_simulator',
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || spec.mapId || 8,
                    result,
                });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Simulator Training',
            detail: 'Retry budget exhausted - returning to the guided simulator',
            onComplete: finalizeExit,
        })) finalizeExit();
    },

    _sendBackToSubnetTutorial() {
        const qm = IP2Live.QuestManager;
        const questId = 'stage.8.cidr_chain.01';
        const panelObjectiveId = 'solve_cidr_chain_01_panel';
        this._introShown = false;
        if (qm && qm.quests && qm.quests[questId]) {
            qm.completedObjectives[questId] = {};
            qm.completedObjectives[questId][panelObjectiveId] = true;
            qm.startQuest(questId, {
                mapId: 8,
                mapQuestMode: true,
                keepLastCompletion: true,
                visible: true,
                preview: false,
                guideActive: true,
                allowCompletion: true,
                restart: true,
                completedObjectives: qm.completedObjectives[questId],
            });
        }
        const tutorial = IP2Live.IPSubnetSimulatorTutorial;
        if (tutorial && typeof tutorial.showAttemptReset === 'function') {
            setTimeout(() => tutorial.showAttemptReset(), 220);
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
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
                IP2Live.GameManager.handleGameplayCancelled('ip_subnet_simulator', {
                    gameplayId: 'ip_subnet_simulator',
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || spec.mapId || 8,
                    result: { cancelled: true },
                });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Returning to Stage 2',
            onComplete: finalizeExit,
        })) finalizeExit();
    },
};

IP2Live.SubnetSimulatorGameplayManager = SubnetSimulatorGameplayManager;
IP2Live.SubnetSimulatorGameplayScreen = IP2LiveSubnetSimulatorGameplayScreen;
window.IP2LiveSubnetSimulatorGameplayManager = SubnetSimulatorGameplayManager;
window.IP2LiveSubnetSimulatorGameplayScreen = IP2LiveSubnetSimulatorGameplayScreen;
window.startSubnetSimulatorGameplayFour = function (options) {
    return SubnetSimulatorGameplayManager.launchSubnetSimulatorGameplay(options || {});
};

console.log('[IP2Live] ip_subnetsim_gameplay.js module loaded.');
