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
        this.validationAttempts = 0;
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

        const state = (IP2Live.CIDRGameplayState && IP2Live.CIDRGameplayState.latest) || null;
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
            r: 20,
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
            r: 20,
            minus: false,
            duplicate: true,
            usesLeft: this.duplicateUsesLeft,
            pulse: 0,
            slotKey: null,
        });
    }

    _minusHomePoint() {
        const m = this._metrics();
        return { x: m.arenaX + m.arenaW - 48 * m.sX, y: m.arenaY + 48 * m.sY };
    }

    _duplicateHomePoint() {
        const m = this._metrics();
        return { x: m.arenaX + 48 * m.sX, y: m.arenaY + 48 * m.sY };
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
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) return true;
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel();
            return true;
        }
        return true;
    }

    onMouseDown(x, y) {
        if (this.phase !== 'build') return true;
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) return true;
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
        const ball = this._dragBall();
        if (!ball || this.phase !== 'build') return true;
        ball.x = x - this.dragOffset.x;
        ball.y = y - this.dragOffset.y;
        const slot = this._slotAt(x, y);
        this.hoverSlotKey = slot && !slot.ballId && !ball.minus && !ball.duplicate ? slot.key : null;
        return true;
    }

    onMouseUp(x, y) {
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
        this.validationAttempts++;
        let hasMissing = false;
        let wrongCount = 0;
        let correctCount = 0;
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            const expected = this._expectedForSlot(s.key);
            const actual = this._slotValue(s.key);
            if (actual === null) {
                hasMissing = true;
                s.result = 'wrong';
                s.resultTimer = 75;
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
            s.result = 'wrong';
            s.resultTimer = 130;
            const wrongBall = this._ballById(s.ballId);
            if (wrongBall) this._emitPixelDissolve(wrongBall, '#FF5E79', 36);
            if (s.ballId) this._removeBall(s.ballId);
            s.ballId = null;
        }

        if (hasMissing) {
            this.failBanner = 'FILL ALL FOUR ANSWER SLOTS.';
            this.failBannerTimer = 100;
            this.shake = 12;
            this._playCancel();
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
        this.failBanner = 'ANSWER MISMATCH. WRONG SLOTS PURGED.';
        this.failBannerTimer = 120;
        this._playCancel();
    }

    _saveState() {
        if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
        if (!IP2Live.CIDRGameplayState.latest) IP2Live.CIDRGameplayState.latest = {};
        IP2Live.CIDRGameplayState.latest.gameplay4 = {
            totalSubnets: this.answers.totalSubnets,
            usableSubnets: this.answers.usableSubnets,
            totalHosts: this.answers.totalHosts,
            usableHosts: this.answers.usableHosts,
            hosts: this.answers.usableHosts,
            borrowedBits: this.borrowedBits,
            hostBits: this.hostBits,
            solvedAt: Date.now(),
        };
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
                passed: true,
                answers: Object.assign({}, this.answers),
                validationAttempts: this.validationAttempts,
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
        this._drawBalls(ctx, m);
        this._drawBottomTargets(ctx, m);
        this._drawSubmit(ctx, m);
        this._drawBanner(ctx, m);
        this._drawParticles(ctx, m);
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
        const panelX = 44 * sX;
        const panelY = 42 * sY;
        const panelW = cW - panelX * 2;
        const panelH = cH - panelY * 2;
        const arenaX = panelX + 74 * sX;
        const arenaY = panelY + 130 * sY;
        const arenaW = panelW - 148 * sX;
        const arenaH = panelH * 0.56;
        return { cW, cH, sX, sY, panelX, panelY, panelW, panelH, arenaX, arenaY, arenaW, arenaH };
    }

    _layoutSlots() {
        const m = this._metrics();
        const y = m.panelY + m.panelH - 94 * m.sY;
        const count = this.slots.length;
        const gap = m.panelW * 0.14;
        const centerX = m.panelX + m.panelW * 0.5;
        const startX = centerX - ((count - 1) * gap * 0.5);
        for (let i = 0; i < this.slots.length; i++) {
            this.slots[i].x = startX + i * gap;
            this.slots[i].y = y;
            const b = this._ballById(this.slots[i].ballId);
            if (b && this.dragBallId !== b.id) {
                b.x = this.slots[i].x;
                b.y = this.slots[i].y;
                b.slotKey = this.slots[i].key;
            }
        }
        this.submitRect = {
            x: m.panelX + m.panelW * 0.43,
            y: m.panelY + m.panelH - 54 * m.sY,
            w: m.panelW * 0.14,
            h: 34 * m.sY,
        };
    }

    _drawBackdrop(ctx, m) {
        const g = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        g.addColorStop(0, '#060A12');
        g.addColorStop(0.5, '#0D1726');
        g.addColorStop(1, '#050A12');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);
        this._drawBackdropDecor(ctx, m);
    }

    _drawBackdropDecor(ctx, m) {
        const t = this.animTick;
        ctx.globalAlpha = 0.14;
        for (let i = 0; i < 8; i++) {
            const x = m.panelX + (m.panelW * (0.08 + i * 0.11));
            const y = m.panelY + 24 * m.sY + Math.sin((t + i * 18) * 0.02) * 8 * m.sY;
            const r = (12 + (i % 3) * 6) * m.sX;
            const ring = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
            ring.addColorStop(0, 'rgba(120,240,255,0.6)');
            ring.addColorStop(1, 'rgba(120,240,255,0)');
            ctx.fillStyle = ring;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#7DEEFF';
        ctx.lineWidth = 1.2 * m.sX;
        for (let i = 0; i < 5; i++) {
            const y = m.panelY + m.panelH * (0.18 + i * 0.14);
            ctx.beginPath();
            ctx.moveTo(m.panelX + 34 * m.sX, y);
            ctx.lineTo(m.panelX + 96 * m.sX, y);
            ctx.lineTo(m.panelX + 126 * m.sX, y + 16 * m.sY);
            ctx.lineTo(m.panelX + 188 * m.sX, y + 16 * m.sY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(m.panelX + m.panelW - 34 * m.sX, y);
            ctx.lineTo(m.panelX + m.panelW - 96 * m.sX, y);
            ctx.lineTo(m.panelX + m.panelW - 126 * m.sX, y + 16 * m.sY);
            ctx.lineTo(m.panelX + m.panelW - 188 * m.sX, y + 16 * m.sY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    _drawFrame(ctx, m) {
        const g = ctx.createLinearGradient(m.panelX, m.panelY, m.panelX, m.panelY + m.panelH);
        g.addColorStop(0, '#111A29');
        g.addColorStop(1, '#09111B');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 15 * m.sX);
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 15 * m.sX, '#33516E', 2 * m.sX);
        this._strokeChamferRect(ctx, m.panelX + 9 * m.sX, m.panelY + 9 * m.sY, m.panelW - 18 * m.sX, m.panelH - 18 * m.sY, 12 * m.sX, '#B5152A', 3.4 * m.sX);
    }

    _drawHeader(ctx, m) {
        const titleFont = this._uiTitleFont();
        const bx = m.panelX + 16 * m.sX;
        const by = m.panelY + 12 * m.sY;
        const bw = m.panelW * 0.54;
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
        ctx.fillText('SUBNET SIMULATOR :: CIRCLE ENGINE', bx + 14 * m.sX, by + bh * 0.64);

        this._drawCIDRWidget(ctx, m);
    }

    _drawCIDRWidget(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const w = m.panelW * 0.24;
        const h = 48 * m.sY;
        const x = m.panelX + (m.panelW - w) * 0.5;
        const y = 8 * m.sY;
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, '#0F1B2A');
        g.addColorStop(1, '#0A1320');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, x, y, w, h, 8 * m.sX);
        this._strokeChamferRect(ctx, x, y, w, h, 8 * m.sX, '#4B6F90', 1.4 * m.sX);

        ctx.fillStyle = '#D5EEFF';
        ctx.font = 'bold ' + (9.2 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.fillText('CARRIED OCTET WIDGET', x + 9 * m.sX, y + 13 * m.sY);
        const startX = x + 12 * m.sX;
        const cy = y + 27 * m.sY;
        for (let i = 0; i < this.bitsBinary.length; i++) {
            const bit = this.bitsBinary[i] === '1';
            const cx = startX + i * (14 * m.sX);
            const blink = bit ? (0.5 + 0.45 * Math.sin(this.animTick * 0.22 + i * 0.35)) : 0.12;
            ctx.globalAlpha = bit ? blink : 0.7;
            ctx.fillStyle = bit ? '#FFD84A' : '#5C6775';
            ctx.beginPath();
            ctx.arc(cx, cy, 4.1 * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#9CC3E6';
        ctx.font = 'bold ' + (9 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText(this.bitsBinary, x + 12 * m.sX, y + h - 7 * m.sY);
    }

    _drawArena(ctx, m) {
        const g = ctx.createLinearGradient(m.arenaX, m.arenaY, m.arenaX, m.arenaY + m.arenaH);
        g.addColorStop(0, 'rgba(126,139,153,0.2)');
        g.addColorStop(1, 'rgba(26,36,49,0.92)');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, m.arenaX, m.arenaY, m.arenaW, m.arenaH, 12 * m.sX);
        this._strokeChamferRect(ctx, m.arenaX, m.arenaY, m.arenaW, m.arenaH, 12 * m.sX, '#35D5FF', 2 * m.sX);

        ctx.globalAlpha = 0.22;
        for (let i = 0; i < 18; i++) {
            const y = m.arenaY + (i / 18) * m.arenaH;
            ctx.fillStyle = i % 2 ? '#7FDFFF' : '#A2B6CB';
            ctx.fillRect(m.arenaX + 8 * m.sX, y, m.arenaW - 16 * m.sX, 1.8 * m.sY);
        }
        ctx.globalAlpha = 1;
    }

    _drawBalls(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            const pulseScale = b.pulse > 0 ? (1 + (b.pulse / 18) * 0.14) : 1;
            const rr = b.r * pulseScale;
            const glow = ctx.createRadialGradient(b.x, b.y, rr * 0.2, b.x, b.y, rr * 2.2);
            if (b.minus) {
                glow.addColorStop(0, 'rgba(255,95,120,0.85)');
                glow.addColorStop(1, 'rgba(255,95,120,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(b.x, b.y, rr * 2.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FF5E7A';
            } else if (b.duplicate) {
                glow.addColorStop(0, 'rgba(120,255,205,0.9)');
                glow.addColorStop(1, 'rgba(120,255,205,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(b.x, b.y, rr * 2.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1F4E4A';
            } else {
                glow.addColorStop(0, 'rgba(112,231,255,0.85)');
                glow.addColorStop(1, 'rgba(112,231,255,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(b.x, b.y, rr * 2.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1A3550';
            }
            ctx.beginPath();
            ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = b.minus ? '#FFD4DD' : (b.duplicate ? '#CCFFE8' : '#D9F8FF');
            ctx.lineWidth = 2 * m.sX;
            ctx.stroke();

            ctx.fillStyle = '#F4FDFF';
            const textPx = b.duplicate ? (10.5 * m.sY) : Math.max(10 * m.sY, rr * 0.56);
            ctx.font = 'bold ' + textPx.toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const txt = b.minus ? '-2' : (b.duplicate ? 'DUP' : String(b.value));
            ctx.fillText(txt, b.x, b.y + 1 * m.sY);
            if (b.duplicate) {
                ctx.font = 'bold ' + (8.2 * m.sY).toFixed(1) + 'px ' + primaryFont;
                ctx.fillText(String(Math.max(0, b.usesLeft || 0)), b.x, b.y + 11 * m.sY);
            }
        }
        ctx.textBaseline = 'alphabetic';
    }

    _drawBottomTargets(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            const hasResult = !!s.result && (s.resultTimer || 0) > 0;
            const isCorrect = s.result === 'correct';
            const resultGlow = isCorrect ? 'rgba(90,255,146,0.45)' : 'rgba(255,99,124,0.42)';
            if (hasResult) {
                const glow = ctx.createRadialGradient(s.x, s.y, s.r * 0.2, s.x, s.y, s.r * 2.1);
                glow.addColorStop(0, resultGlow);
                glow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r * 2.1, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#0F1B2A';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r + 8 * m.sY, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = hasResult ? (isCorrect ? '#76FFA0' : '#FF7A94') : '#5E7D9D';
            ctx.lineWidth = 2 * m.sX;
            ctx.stroke();

            ctx.fillStyle = '#D3E8FF';
            ctx.font = 'bold ' + (9.2 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'center';
            ctx.fillText(s.label, s.x, s.y - s.r - 12 * m.sY);

            if (!s.ballId) {
                ctx.fillStyle = '#7A8EA4';
                ctx.font = 'bold ' + (9 * m.sY).toFixed(1) + 'px ' + monoFont;
                const drag = this._dragBall();
                const hover = this.hoverSlotKey === s.key && drag && !drag.minus && !drag.duplicate;
                if (hover) {
                    ctx.fillStyle = '#B5F7FF';
                    ctx.fillText(String(drag.value), s.x, s.y + 3 * m.sY);
                } else {
                    ctx.fillText('DROP', s.x, s.y + 3 * m.sY);
                }
            } else {
                const b = this._ballById(s.ballId);
                if (b) {
                    ctx.fillStyle = '#BFE8FF';
                    ctx.font = 'bold ' + (11.2 * m.sY).toFixed(1) + 'px ' + monoFont;
                    ctx.fillText(String(b.value), s.x, s.y + 3 * m.sY);
                }
            }
        }
    }

    _drawSubmit(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const b = this.submitRect;
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, '#1E5E2E');
        g.addColorStop(1, '#2E8D45');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 8 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 8 * m.sX, '#B4FFD0', 1.6 * m.sX);
        ctx.fillStyle = '#F4FCFF';
        ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.fillText('VALIDATE', b.x + b.w * 0.5, b.y + b.h * 0.64);
    }

    _drawBanner(ctx, m) {
        const monoFont = this._uiMonoFont();
        const text = this.failBanner || 'RULE: AT 10, ONLY DUPLICATE CAN SPAWN. NORMAL SPAWN RESUMES AFTER CIRCLES DROP TO 6.';
        const x = m.panelX + m.panelW * 0.22;
        const y = m.panelY + 86 * m.sY;
        const w = m.panelW * 0.56;
        const h = 24 * m.sY;
        const g = ctx.createLinearGradient(x, y, x + w, y);
        g.addColorStop(0, 'rgba(28,62,86,0.72)');
        g.addColorStop(1, 'rgba(24,46,70,0.7)');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, x, y, w, h, 6 * m.sX);
        ctx.strokeStyle = 'rgba(140,219,255,0.75)';
        ctx.lineWidth = 1.1 * m.sX;
        this._strokeChamferRect(ctx, x, y, w, h, 6 * m.sX);
        ctx.fillStyle = this.failBannerTimer > 0 ? '#FFD6DF' : '#D5F2FF';
        ctx.font = 'bold ' + (9.8 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textAlign = 'center';
        ctx.fillText(text, x + w * 0.5, y + h * 0.66);
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
    VERSION: 'ip-subnetsim-gameplay-manager-20260529-01',
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

        const launchOptions = {
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId: Number(context && context.mapId) || 5,
            _fromObjective: true,
        };

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_subnet_simulator', Object.assign({}, launchOptions, {
                showIntro: !this._introShown,
                _reservedAttempt: attemptKey,
            }));
            return false;
        }
        this.launchSubnetSimulatorGameplay(Object.assign({}, launchOptions, { mode: 'replace', showIntro: !this._introShown }));
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

    launchSubnetSimulatorGameplay(options) {
        const opts = options || {};
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;

        const open = () => {
            const screen = new IP2LiveSubnetSimulatorGameplayScreen({
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

        const shouldShowIntro = opts.showIntro !== false && !this._introShown;
        if (shouldShowIntro && IP2Live.IPSubnetSimulatorTutorial && typeof IP2Live.IPSubnetSimulatorTutorial.showIntro === 'function') {
            this._introShown = true;
            const state = (IP2Live.CIDRGameplayState && IP2Live.CIDRGameplayState.latest) || {};
            IP2Live.IPSubnetSimulatorTutorial.showIntro(state, openSafely);
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
                IP2Live.GameManager.handleGameplayCompleted('ip_subnet_simulator', {
                    gameplayId: 'ip_subnet_simulator',
                    result,
                });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Returning to Stage 1 Level 3',
            onComplete: finalizeExit,
        })) finalizeExit();
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
                IP2Live.GameManager.handleGameplayFailed('ip_subnet_simulator', {
                    gameplayId: 'ip_subnet_simulator',
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
