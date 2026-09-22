/**
 * IP2Live - Gameplay 4.5 Host-Power Reactor
 *
 * A timed bridge lesson for analytical subnetting:
 *   1. Read the required usable host count.
 *   2. Collect energy until h is the smallest exponent where 2^h - 2 >= required hosts.
 *   3. Step between five lanes and press Space to deploy a collector tether.
 *   4. Grab positive coal-energy cells and avoid broken battery cells.
 *   5. Click CALCULATE to reveal 2^h - 2 and validate the engine load.
 *
 * The left side is the five-lane energy intake and collector. The right side
 * is a glass reactor engine with thermal trace columns, collected-energy
 * controls, the required-host target, and the calculation readout.
 */

const IPHostPowerRules = {
    VERSION: 'ip-host-power-rules-20260821-01',
    RESERVED_ADDRESSES: 2,
    CLASS_LIMITS: {
        A: { className: 'A', defaultPrefix: 8, maxHostBits: 24, minHosts: 65535, maxHosts: 16777214 },
        B: { className: 'B', defaultPrefix: 16, maxHostBits: 16, minHosts: 255, maxHosts: 65534 },
        C: { className: 'C', defaultPrefix: 24, maxHostBits: 8, minHosts: 2, maxHosts: 254 },
    },

    normalizeClass(value) {
        const className = String(value || '').trim().toUpperCase();
        return this.CLASS_LIMITS[className] ? className : 'C';
    },

    classConfig(value) {
        return this.CLASS_LIMITS[this.normalizeClass(value)];
    },

    randomClass(allowedClasses) {
        const source = Array.isArray(allowedClasses) && allowedClasses.length
            ? allowedClasses
            : ['A', 'B', 'C'];
        const valid = source
            .map((value) => this.normalizeClass(value))
            .filter((value, index, all) => all.indexOf(value) === index);
        const choices = valid.length ? valid : ['A', 'B', 'C'];
        return choices[Math.floor(Math.random() * choices.length)];
    },

    randomRequiredHosts(className) {
        const config = this.classConfig(className);
        const min = Math.max(1, Number(config.minHosts) || 1);
        const max = Math.max(min, Number(config.maxHosts) || min);

        // Keep the distribution varied across exponent bands instead of
        // allowing the very large Class A band to dominate every draw.
        const minExponent = this.minimumExponent(min);
        const maxExponent = config.maxHostBits;
        const exponent = minExponent + Math.floor(Math.random() * Math.max(1, maxExponent - minExponent + 1));
        const bandLow = Math.max(min, exponent <= 1 ? 1 : Math.pow(2, exponent - 1) - 1);
        const bandHigh = Math.min(max, Math.pow(2, exponent) - this.RESERVED_ADDRESSES);
        const low = Math.max(min, Math.min(bandLow, bandHigh));
        const high = Math.max(low, bandHigh);
        return low + Math.floor(Math.random() * (high - low + 1));
    },

    clampRequiredHosts(className, value) {
        const config = this.classConfig(className);
        const parsed = Math.floor(Number(value));
        if (!Number.isFinite(parsed)) return this.randomRequiredHosts(className);
        return Math.max(1, Math.min(config.maxHosts, parsed));
    },

    minimumExponent(requiredHosts) {
        const required = Math.max(1, Math.floor(Number(requiredHosts) || 1));
        const addressDemand = required + this.RESERVED_ADDRESSES;
        let exponent = Math.max(1, Math.ceil(Math.log(addressDemand) / Math.log(2)));
        while (Math.pow(2, exponent) < addressDemand) exponent++;
        return exponent;
    },

    totalAddresses(exponent) {
        const h = Math.max(0, Math.floor(Number(exponent) || 0));
        return Math.pow(2, h);
    },

    usableHosts(exponent) {
        return Math.max(0, this.totalAddresses(exponent) - this.RESERVED_ADDRESSES);
    },

    evaluate(requiredHosts, exponent) {
        const required = Math.max(1, Math.floor(Number(requiredHosts) || 1));
        const h = Math.max(0, Math.floor(Number(exponent) || 0));
        const targetExponent = this.minimumExponent(required);
        const totalAddresses = this.totalAddresses(h);
        const usableHosts = Math.max(0, totalAddresses - this.RESERVED_ADDRESSES);
        const status = h < targetExponent ? 'under' : (h === targetExponent ? 'just-right' : 'over');
        return {
            requiredHosts: required,
            exponent: h,
            targetExponent,
            totalAddresses,
            usableHosts,
            reservedAddresses: this.RESERVED_ADDRESSES,
            addressDemand: required + this.RESERVED_ADDRESSES,
            status,
            valid: status === 'just-right' && usableHosts >= required,
        };
    },

    createScenario(options) {
        const opts = options || {};
        const className = opts.targetClass
            ? this.normalizeClass(opts.targetClass)
            : this.randomClass(opts.targetClasses);
        const classConfig = this.classConfig(className);
        const requiredHosts = opts.requiredHosts === undefined || opts.requiredHosts === null
            ? this.randomRequiredHosts(className)
            : this.clampRequiredHosts(className, opts.requiredHosts);
        const targetExponent = this.minimumExponent(requiredHosts);

        if (targetExponent > classConfig.maxHostBits) {
            throw new Error('Required hosts exceed Class ' + className + ' capacity.');
        }

        return {
            className,
            classConfig: Object.assign({}, classConfig),
            requiredHosts,
            targetExponent,
            bitsToBorrow: Math.max(0, classConfig.maxHostBits - targetExponent),
            totalAddresses: this.totalAddresses(targetExponent),
            usableHosts: this.usableHosts(targetExponent),
            addressDemand: requiredHosts + this.RESERVED_ADDRESSES,
        };
    },
};

const IP_HOST_POWER_PLAYFIELD = Object.freeze({
    LANE_COUNT: 5,
    // A balanced sweep visits every fixed lane before returning to one. This
    // prevents consecutive drops from visually merging in the same column.
    LANE_ORDER: Object.freeze([0, 2, 4, 1, 3]),
    // Curated learning rhythm: eight positive coal-energy cells and two
    // broken battery cells per cycle, with no long run of negative values.
    DROP_SEQUENCE: Object.freeze([1, 3, 2, -1, 4, 2, 5, -2, 3, 1]),
    VALUE_COLORS: Object.freeze({
        1: '#00eaff',
        2: '#54f59a',
        3: '#ffe45d',
        4: '#ff9f43',
        5: '#b88aff',
    }),
    SPAWN_INTERVAL_MS: 1500,
    FALL_SPEED_PX_PER_SECOND: 48,
    BULLET_SPEED_PX_PER_SECOND: 430,
    TETHER_RETURN_SPEED_PX_PER_SECOND: 560,
    SHOT_COOLDOWN_MS: 230,
    LANE_HOLD_DELAY_MS: 330,
    LANE_REPEAT_INTERVAL_MS: 190,
});

class IP2LiveHostPowerReactorGameplayScreen extends Scene.Base {
    constructor(options, timeSeconds) {
        super(true);
        this.options = options || {};
        const explicitTime = Number(timeSeconds);
        this._explicitDurationSeconds = Number.isFinite(explicitTime) && explicitTime > 0 ? explicitTime : null;
        this._configure();
    }

    initialize() {
        this.options = this.options || {};
        this._configure();
    }

    _configure() {
        this.scenario = this.options.scenario || IPHostPowerRules.createScenario(this.options);
        this.guidedTutorial = this.options.guidedTutorial === true ||
            this.options.tutorial === true ||
            !!(this.options.spec && this.options.spec.tutorial);
        this.tutorialActive = this.guidedTutorial;
        this.tutorialComplete = !this.guidedTutorial;
        this.tutorialPaused = this.guidedTutorial;
        this.tutorialStep = this.guidedTutorial ? 'reactor_intro' : 'done';
        this.tutorialDialogueOpen = false;
        this.tutorialHighlight = null;
        this.tutorialSpotlightTimer = 0;
        this.tutorialSpotlightComplete = null;

        const spec = this.options.spec || {};
        const configuredSeconds =
            this._explicitDurationSeconds ||
            Number(this.options.timeSeconds) ||
            Number(this.options.durationSeconds) ||
            Number(spec.timeSeconds) ||
            Number(spec.durationSeconds) ||
            120;

        this.durationSeconds = Math.max(10, configuredSeconds);
        this.durationMs = this.durationSeconds * 1000;

        this.animTick = 0;
        this.finished = false;
        this.roundState = this.guidedTutorial ? 'tutorial' : 'ready';
        const configuredMaxCollected =
            Number(this.options.maxCollectedExponent) ||
            Number(spec.maxCollectedExponent) ||
            0;
        this.maxCollectedExponent = Math.max(
            12,
            this.scenario.targetExponent + 12,
            this.scenario.classConfig.maxHostBits + 12,
            configuredMaxCollected
        );
        this.maxCollectedExponent = Math.min(32, this.maxCollectedExponent);
        this.exponent = Math.max(0, Math.min(this.maxCollectedExponent, Number(this.options.startExponent) || 0));
        this.exponentPulseUntil = 0;
        this.outputPulseUntil = 0;
        this.engineNotice = null;
        this.evaluation = IPHostPowerRules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.entities = [];
        this.bullets = [];
        this.hits = [];
        this.overshoots = 0;
        this.spawnIntervalMs = IP_HOST_POWER_PLAYFIELD.SPAWN_INTERVAL_MS;
        this.nextSpawnAt = null;
        this.lastUpdateAt = null;
        this.laneCursor = 0;
        this.dropCursor = 0;
        this.nextEntityId = 1;
        this.nextTetherId = 1;
        this.gunLaneIndex = Math.floor(IP_HOST_POWER_PLAYFIELD.LANE_COUNT / 2);
        this.gunX = null;
        this.heldLeft = false;
        this.heldRight = false;
        this.laneHoldElapsedMs = 0;
        this.laneHoldRepeating = false;
        this.shootHeld = false;
        this.lastShotAt = -Infinity;
        this.calculatedEvaluation = null;
        this.calculationAttempts = [];

        // The reactor glass does not respond to raw collected energy. It only
        // changes after CALCULATE is pressed, so the visual reinforces the
        // deliberate subnetting step: collect h -> calculate -> observe capacity.
        this.engineFillRatioDisplayed = 0;
        this.engineFillRatioFrom = 0;
        this.engineFillRatioTarget = 0;
        this.engineFillAnimationStartedAt = null;
        this.engineFillAnimationDurationMs = 1050;
        this.engineCalculationPulseStartedAt = null;
        this.startedAt = null;
        this.endsAt = null;
        this.stabilizeStartedAt = null;
        this.failureStartedAt = null;
        this.failureAnimationDurationMs = 3000;
        this.failureReason = null;
        this.buttons = [];
        this.lastMetrics = null;
        this.lastMouseX = null;
        this._lastStatus = this.evaluation.status;
    }

    async load() {
        this.loading = false;
        // The guided version owns the screen before the timed round begins.
        // Scene.Base may call load() before the derived constructor has its
        // options, so _configure() remains the final authority on whether the
        // clock should be held for training.
        if (!this.guidedTutorial) this._startRoundClock();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _startRoundClock(nowValue) {
        if (this.roundState === 'active' && Number(this.endsAt) > Date.now()) return false;
        const numericNow = Number(nowValue);
        const now = Number.isFinite(numericNow) ? numericNow : Date.now();
        this.startedAt = now;
        this.endsAt = now + this.durationMs;
        this.nextSpawnAt = now;
        this.lastUpdateAt = now;
        this.roundState = 'active';
        return true;
    }

    update() {
        this.animTick++;
        const now = Date.now();

        if (IP2Live.GameplayCompletionPopup && typeof IP2Live.GameplayCompletionPopup.update === 'function') {
            IP2Live.GameplayCompletionPopup.update(this, now);
        }

        if (this.tutorialActive && !this.tutorialComplete) this._updateGuidedTutorial();

        const dialogueActive = this._dialogueActive();
        if (!this.finished && !dialogueActive && !this.tutorialPaused && this.roundState === 'ready') {
            this._startRoundClock(now);
        }

        if (this.finished || dialogueActive || this.tutorialPaused) {
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return;
        }

        const metrics = this._metrics();
        this.lastMetrics = metrics;
        this._ensureGun(metrics);
        const deltaSeconds = this._frameDeltaSeconds(now);
        this._updateEngineFillAnimation(now);

        if (this.roundState === 'active') {
            if (now >= this.endsAt) {
                this._timeout();
            } else {
                this._updateHeldMovement(metrics, deltaSeconds);
                this._updateSpawner(metrics, now);
                this._updateEntities(metrics, deltaSeconds);
                this._updateBullets(metrics, deltaSeconds);
                this._resolveCollisions();
            }
        } else if (this.roundState === 'stabilizing') {
            if (now - this.stabilizeStartedAt >= Math.max(1250, this.engineFillAnimationDurationMs + 180)) this._complete();
        } else if (this.roundState === 'overflow_failure') {
            if (!this.failureStartedAt) this.failureStartedAt = now;
            if (now - this.failureStartedAt >= this.failureAnimationDurationMs) {
                this.roundState = 'failed';
            }
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _updateEngineFillAnimation(nowValue) {
        if (!Number.isFinite(this.engineFillAnimationStartedAt)) return false;

        const now = Number(nowValue) || Date.now();
        const duration = Math.max(1, Number(this.engineFillAnimationDurationMs) || 1050);
        const raw = Math.max(0, Math.min(1, (now - this.engineFillAnimationStartedAt) / duration));
        const eased = raw < 0.5
            ? 4 * raw * raw * raw
            : 1 - Math.pow(-2 * raw + 2, 3) / 2;

        this.engineFillRatioDisplayed = this.engineFillRatioFrom +
            (this.engineFillRatioTarget - this.engineFillRatioFrom) * eased;

        if (raw >= 1) {
            this.engineFillRatioDisplayed = this.engineFillRatioTarget;
            this.engineFillAnimationStartedAt = null;
        }

        return true;
    }

    _dialogueActive() {
        return !!(
            IP2Live.DialogueManager &&
            typeof IP2Live.DialogueManager.isActive === 'function' &&
            IP2Live.DialogueManager.isActive()
        );
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
        if (this.tutorialDialogueOpen || this._dialogueActive()) return;

        if (this.tutorialStep === 'reactor_intro') {
            this._showGuidedDialogue(
                'showReactorGuide',
                { type: 'reactor', label: '01 // TARGET CAPACITY CORE' },
                'formula_intro',
                92
            );
            return;
        }
        if (this.tutorialStep === 'formula_intro') {
            this._showGuidedDialogue(
                'showFormulaGuide',
                { type: 'formula', label: '02 // 2^H - 2 CAPACITY CHECK' },
                'intake_intro',
                100
            );
            return;
        }
        if (this.tutorialStep === 'intake_intro') {
            this._showGuidedDialogue(
                'showIntakeGuide',
                { type: 'intake', label: '03 // FIVE FIXED INTAKE LANES' },
                'shell_intro',
                100
            );
            return;
        }
        if (this.tutorialStep === 'shell_intro') {
            this._showGuidedDialogue(
                'showShellGuide',
                { type: 'shell', label: '04 // COAL CELLS // BROKEN BATTERY CELLS' },
                'controls_intro',
                105
            );
            return;
        }
        if (this.tutorialStep === 'controls_intro') {
            this._showGuidedDialogue(
                'showControlsGuide',
                { type: 'controls', label: '05 // STEP LANES // SPACE GRAB' },
                'timer_intro',
                100
            );
            return;
        }
        if (this.tutorialStep === 'timer_intro') {
            this._showGuidedDialogue(
                'showTimerGuide',
                { type: 'timer', label: '06 // APEX TRACE WINDOW' },
                'done',
                100
            );
            return;
        }
        if (this.tutorialStep === 'done') this._finishGuidedTutorial();
    }

    _showGuidedDialogue(methodName, highlight, nextStep, spotlightFrames) {
        this.tutorialPaused = true;
        this.tutorialDialogueOpen = true;
        this.tutorialHighlight = Object.assign({}, highlight || {});
        let completed = false;
        const done = () => {
            if (completed) return;
            completed = true;
            this.tutorialDialogueOpen = false;
            this._showTutorialSpotlight(highlight, spotlightFrames, () => {
                this.tutorialStep = nextStep;
                if (nextStep === 'done') this._finishGuidedTutorial();
            });
        };
        const tutorial = IP2Live.IPHostPowerReactorTutorial;
        if (tutorial && typeof tutorial[methodName] === 'function') {
            const shown = tutorial[methodName](this.scenario, done);
            if (shown !== false) return true;
        }
        done();
        return false;
    }

    _showTutorialSpotlight(highlight, duration, onComplete) {
        this.tutorialPaused = true;
        this.tutorialHighlight = Object.assign({}, highlight || {});
        this.tutorialSpotlightTimer = Math.max(45, Number(duration) || 90);
        this.tutorialSpotlightComplete = typeof onComplete === 'function' ? onComplete : null;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _finishGuidedTutorial() {
        if (this.tutorialComplete) return;
        this.tutorialComplete = true;
        this.tutorialPaused = false;
        this.tutorialDialogueOpen = false;
        this.tutorialHighlight = null;
        this.tutorialSpotlightTimer = 0;
        this.tutorialSpotlightComplete = null;
        this.tutorialStep = 'done';
        this.roundState = 'ready';
        this.lastUpdateAt = null;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _frameDeltaSeconds(now) {
        const numericNow = Number(now);
        const current = Number.isFinite(numericNow) ? numericNow : Date.now();
        const previous = Number(this.lastUpdateAt);
        this.lastUpdateAt = current;
        if (!Number.isFinite(previous)) return 0;
        // Prevent a focus loss or debugger pause from teleporting objects.
        return Math.max(0, Math.min(0.05, (current - previous) / 1000));
    }

    _metrics() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const designW = (Common.ScreenResolution && Common.ScreenResolution.SCREEN_X) || 1280;
        const designH = (Common.ScreenResolution && Common.ScreenResolution.SCREEN_Y) || 720;
        const sX = cW / designW;
        const sY = cH / designH;
        const scale = Math.max(0.65, Math.min(1.25, Math.min(sX, sY)));
        const margin = Math.max(16, 24 * scale);
        const w = Math.min(cW - margin * 2, 1160 * sX);
        const h = Math.min(cH - margin * 2, 635 * sY);
        const x = (cW - w) * 0.5;
        const y = (cH - h) * 0.5;
        const leftW = w * 0.41;
        const gap = 14 * scale;
        const headerH = 70 * scale;
        const arena = {
            x: x + 14 * scale,
            y: y + headerH,
            w: leftW - 28 * scale,
            h: h - headerH - 18 * scale,
        };
        const right = {
            x: x + leftW + gap,
            y: y + headerH,
            w: w - leftW - gap - 16 * scale,
            h: h - headerH - 18 * scale,
        };
        return { cW, cH, sX, sY, scale, x, y, w, h, leftW, gap, headerH, arena, right };
    }

    _ensureGun(m) {
        const arena = m.arena;
        const laneCount = IP_HOST_POWER_PLAYFIELD.LANE_COUNT;
        const laneWidth = arena.w / laneCount;
        if (!Number.isInteger(this.gunLaneIndex)) {
            const sourceX = Number.isFinite(this.gunX) ? this.gunX : arena.x + arena.w * 0.5;
            this.gunLaneIndex = Math.floor((sourceX - arena.x) / laneWidth);
        }
        this.gunLaneIndex = Math.max(0, Math.min(laneCount - 1, this.gunLaneIndex));
        this.gunX = arena.x + laneWidth * (this.gunLaneIndex + 0.5);
    }

    _moveGunLane(direction, m) {
        const step = direction < 0 ? -1 : (direction > 0 ? 1 : 0);
        if (!step) return false;
        this._ensureGun(m);
        const nextLane = Math.max(0, Math.min(IP_HOST_POWER_PLAYFIELD.LANE_COUNT - 1, this.gunLaneIndex + step));
        if (nextLane === this.gunLaneIndex) return false;
        this.gunLaneIndex = nextLane;
        this._ensureGun(m);
        this._playLaneMove();
        return true;
    }

    _updateSpawner(m, now) {
        const numericNow = Number(now);
        const current = Number.isFinite(numericNow) ? numericNow : Date.now();
        if (!Number.isFinite(this.nextSpawnAt)) this.nextSpawnAt = current;
        if (current < this.nextSpawnAt) return false;

        this.nextSpawnAt = current + this.spawnIntervalMs;

        const laneOrder = IP_HOST_POWER_PLAYFIELD.LANE_ORDER;
        const laneIndex = laneOrder[this.laneCursor % laneOrder.length];
        this.laneCursor++;

        const dropSequence = IP_HOST_POWER_PLAYFIELD.DROP_SEQUENCE;
        const value = dropSequence[this.dropCursor % dropSequence.length];
        this.dropCursor++;

        const isBroken = value < 0;
        const radius = (isBroken ? 20 : 21) * m.scale;
        const laneWidth = m.arena.w / IP_HOST_POWER_PLAYFIELD.LANE_COUNT;

        this.entities.push({
            id: this.nextEntityId++,
            type: isBroken ? 'broken-cell' : 'coal',
            value,
            laneIndex,
            x: m.arena.x + laneWidth * (laneIndex + 0.5),
            y: m.arena.y - radius,
            radius,
            speed: IP_HOST_POWER_PLAYFIELD.FALL_SPEED_PX_PER_SECOND * m.scale,
            spin: isBroken ? (this.nextEntityId % 8) * Math.PI / 4 : 0,
            maxHits: 1,
            hitsRemaining: 1,
            hitFlashUntil: 0,
            grabbed: false,
            grabbedBy: null,
        });

        return true;
    }

    _fireBullet(m, now) {
        if (this.roundState !== 'active' || this.finished || this.tutorialPaused) return false;

        const numericNow = Number(now);
        const current = Number.isFinite(numericNow) ? numericNow : Date.now();
        if (current - this.lastShotAt < IP_HOST_POWER_PLAYFIELD.SHOT_COOLDOWN_MS) return false;

        this._ensureGun(m);
        this.lastShotAt = current;

        const collectorY = m.arena.y + m.arena.h - 48 * m.scale;
        this.bullets.push({
            id: this.nextTetherId++,
            x: this.gunX,
            homeX: this.gunX,
            y: collectorY - 20 * m.scale,
            originY: collectorY - 8 * m.scale,
            radius: 7 * m.scale,
            speed: IP_HOST_POWER_PLAYFIELD.BULLET_SPEED_PX_PER_SECOND * m.scale,
            returnSpeed: IP_HOST_POWER_PLAYFIELD.TETHER_RETURN_SPEED_PX_PER_SECOND * m.scale,
            state: 'extending',
            targetId: null,
            pulse: 0,
        });

        this._playShot();
        return true;
    }

    _updateHeldMovement(m, deltaSeconds) {
        const direction = (this.heldRight ? 1 : 0) - (this.heldLeft ? 1 : 0);
        if (!direction || deltaSeconds <= 0) {
            this.laneHoldElapsedMs = 0;
            this.laneHoldRepeating = false;
            return false;
        }
        this.laneHoldElapsedMs += deltaSeconds * 1000;
        const threshold = this.laneHoldRepeating
            ? IP_HOST_POWER_PLAYFIELD.LANE_REPEAT_INTERVAL_MS
            : IP_HOST_POWER_PLAYFIELD.LANE_HOLD_DELAY_MS;
        if (this.laneHoldElapsedMs < threshold) return false;
        this.laneHoldElapsedMs = 0;
        this.laneHoldRepeating = true;
        return this._moveGunLane(direction, m);
    }

    _updateEntities(m, deltaSeconds) {
        const bottom = m.arena.y + m.arena.h - 16 * m.scale;

        for (let i = this.entities.length - 1; i >= 0; i--) {
            const entity = this.entities[i];
            if (entity.grabbed) continue;

            entity.y += entity.speed * deltaSeconds;
            if (entity.type === 'broken-cell') entity.spin += 1.05 * deltaSeconds;

            if (entity.y - entity.radius > bottom) {
                this.entities.splice(i, 1);
            }
        }
    }

    _updateBullets(m, deltaSeconds) {
        const top = m.arena.y + 26 * m.scale;
        const collectorY = m.arena.y + m.arena.h - 48 * m.scale;

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const tether = this.bullets[i];

            if (tether.state === 'extending') {
                tether.y -= tether.speed * deltaSeconds;
                tether.pulse += deltaSeconds * 8;

                if (tether.y <= top) {
                    tether.y = top;
                    tether.state = 'returning';
                }
            } else {
                tether.y += tether.returnSpeed * deltaSeconds;
                tether.pulse += deltaSeconds * 10;
                if (Number.isFinite(this.gunX)) {
                    tether.homeX = this.gunX;
                    tether.x += (tether.homeX - tether.x) * Math.min(1, deltaSeconds * 12);
                }

                const target = tether.targetId
                    ? this.entities.find((entity) => entity.id === tether.targetId)
                    : null;

                if (target) {
                    target.x += (tether.x - target.x) * Math.min(1, deltaSeconds * 16);
                    target.y = tether.y - 12 * m.scale;
                    target.spin *= 0.88;
                }

                if (tether.y >= collectorY) {
                    if (target) {
                        const entityIndex = this.entities.findIndex((entity) => entity.id === target.id);
                        if (entityIndex >= 0) this.entities.splice(entityIndex, 1);
                        this._applyPower(target.value, target.type);
                    }

                    this.bullets.splice(i, 1);
                    if (this.roundState !== 'active') return;
                }
            }
        }
    }

    _resolveCollisions() {
        for (let b = this.bullets.length - 1; b >= 0; b--) {
            const tether = this.bullets[b];
            if (tether.state !== 'extending' || tether.targetId) continue;

            let hitIndex = -1;
            let bestDistance = Infinity;

            for (let e = this.entities.length - 1; e >= 0; e--) {
                const entity = this.entities[e];
                if (entity.grabbed) continue;

                const dx = tether.x - entity.x;
                const dy = tether.y - entity.y;
                const hitRadius = tether.radius + entity.radius * 0.82;
                const distanceSquared = dx * dx + dy * dy;

                if (distanceSquared <= hitRadius * hitRadius && distanceSquared < bestDistance) {
                    hitIndex = e;
                    bestDistance = distanceSquared;
                }
            }

            if (hitIndex < 0) continue;

            const entity = this.entities[hitIndex];
            entity.grabbed = true;
            entity.grabbedBy = tether.id;
            entity.hitFlashUntil = Date.now() + 180;

            tether.targetId = entity.id;
            tether.state = 'returning';
            tether.y = Math.min(tether.y, entity.y + entity.radius * 0.25);

            this._playArmorImpact();
        }
    }

    _applyPower(delta, source) {
        const previous = this.exponent;
        const maximum = this.maxCollectedExponent || Math.max(this.scenario.classConfig.maxHostBits, 12);
        this.exponent = Math.max(0, Math.min(maximum, this.exponent + Number(delta || 0)));
        this.exponentPulseUntil = Date.now() + 280;
        this.outputPulseUntil = Date.now() + 240;

        this.hits.push({
            value: Number(delta || 0),
            source: source || 'unknown',
            previousExponent: previous,
            exponent: this.exponent,
            status: 'pending-calculation',
            atMs: Math.max(0, Date.now() - this.startedAt),
        });

        this._lastStatus = 'pending-calculation';
        this._playHit(source === 'broken-cell');
    }

    _calculateCurrentPower() {
        if (this.roundState !== 'active' || this.finished || this.tutorialPaused) return false;
        if (this.calculatedEvaluation && this.calculatedEvaluation.exponent === this.exponent) return false;

        const evaluation = IPHostPowerRules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.evaluation = evaluation;
        this.calculatedEvaluation = Object.assign({}, evaluation);
        this.calculationAttempts.push({
            exponent: this.exponent,
            totalAddresses: evaluation.totalAddresses,
            usableHosts: evaluation.usableHosts,
            status: evaluation.status,
            atMs: this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0,
        });

        // Only CALCULATE changes the visible reactor fill. Catching energy cells
        // changes h, but the glass remains on the last verified state until the
        // player explicitly evaluates the new power.
        const targetExponent = Math.max(1, Number(this.scenario.targetExponent) || 1);
        const visualRatio = Math.max(0, Math.min(1, this.exponent / targetExponent));
        this.engineFillRatioFrom = Math.max(0, Math.min(1, Number(this.engineFillRatioDisplayed) || 0));
        this.engineFillRatioTarget = visualRatio;
        this.engineFillAnimationStartedAt = Date.now();
        this.engineCalculationPulseStartedAt = Date.now();
        this.outputPulseUntil = Date.now() + 380;

        if (evaluation.status === 'over') {
            this.engineNotice = {
                text: 'ENERGY INPUT OVERLOAD',
                color: '#FF5C74',
                startedAt: Date.now(),
                durationMs: 2000,
            };
        } else {
            this.engineNotice = null;
        }

        if (evaluation.valid) {
            this.roundState = 'stabilizing';
            this.stabilizeStartedAt = Date.now();
            this.entities = [];
            this.bullets = [];
            this._playSuccess();
            return true;
        }

        if (evaluation.status === 'over') this.overshoots++;
        this._notifyMistake('calculation-' + evaluation.status);
        this._playError();
        return false;
    }

    _notifyMistake(reason) {
        if (!IP2Live.GameManager || typeof IP2Live.GameManager.handleGameplayMistake !== 'function') return;
        IP2Live.GameManager.handleGameplayMistake('ip_host_power_reactor', {
            gameplayId: 'ip_host_power_reactor',
            spec: this.options.spec || null,
            questId: this.options.questId || null,
            objectiveId: this.options.objectiveId || null,
            mapId: Number(this.options.mapId) || null,
            reason,
            requiredHosts: this.scenario.requiredHosts,
            targetExponent: this.scenario.targetExponent,
            currentExponent: this.exponent,
            mistakes: [{ type: reason, currentExponent: this.exponent, targetExponent: this.scenario.targetExponent }],
        });
    }

    _timeout() {
        if (this.roundState !== 'active') return;

        this.roundState = 'overflow_failure';
        this.heldLeft = false;
        this.heldRight = false;
        this.shootHeld = false;
        this.failureReason = 'timeout';
        this.failureStartedAt = Date.now();

        this.entities = [];
        this.bullets = [];

        this._playError();
        this._notifyMistake('timeout');
    }

    _restart() {
        this.exponent = 0;
        this.evaluation = IPHostPowerRules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.entities = [];
        this.bullets = [];
        this.hits = [];
        this.overshoots = 0;
        this.nextSpawnAt = null;
        this.lastUpdateAt = null;
        this.laneCursor = 0;
        this.dropCursor = 0;
        this.gunLaneIndex = Math.floor(IP_HOST_POWER_PLAYFIELD.LANE_COUNT / 2);
        this.gunX = null;
        this.heldLeft = false;
        this.heldRight = false;
        this.laneHoldElapsedMs = 0;
        this.laneHoldRepeating = false;
        this.shootHeld = false;
        this.lastShotAt = -Infinity;
        this.calculatedEvaluation = null;
        this.calculationAttempts = [];
        this.failureReason = null;
        this.failureStartedAt = null;
        this.exponentPulseUntil = 0;
        this.outputPulseUntil = 0;
        this.engineNotice = null;
        this.engineFillRatioDisplayed = 0;
        this.engineFillRatioFrom = 0;
        this.engineFillRatioTarget = 0;
        this.engineFillAnimationStartedAt = null;
        this.engineCalculationPulseStartedAt = null;
        this._lastStatus = this.evaluation.status;
        this._startRoundClock();
    }

    _result(extra) {
        const now = Date.now();
        return Object.assign({
            gameplayId: 'ip_host_power_reactor',
            className: this.scenario.className,
            requiredHosts: this.scenario.requiredHosts,
            addressDemand: this.scenario.addressDemand,
            exponent: this.exponent,
            targetExponent: this.scenario.targetExponent,
            bitsToBorrow: Math.max(0, this.scenario.classConfig.maxHostBits - this.exponent),
            targetBitsToBorrow: this.scenario.bitsToBorrow,
            totalAddresses: IPHostPowerRules.totalAddresses(this.exponent),
            usableHosts: IPHostPowerRules.usableHosts(this.exponent),
            reservedAddresses: IPHostPowerRules.RESERVED_ADDRESSES,
            elapsedMs: this.startedAt ? Math.max(0, now - this.startedAt) : 0,
            timeRemainingMs: this.endsAt ? Math.max(0, this.endsAt - now) : 0,
            overshoots: this.overshoots,
            calculationAttempts: this.calculationAttempts.slice(),
            hits: this.hits.slice(),
        }, extra || {});
    }

    _complete() {
        if (this.finished) return;
        this.finished = true;
        this.roundState = 'complete';
        this.heldLeft = false;
        this.heldRight = false;
        this.shootHeld = false;
        const result = this._result({ success: true });
        const finish = () => {
            if (typeof this.options.onComplete === 'function') this.options.onComplete(result);
        };
        if (IP2Live.GameplayCompletionPopup && typeof IP2Live.GameplayCompletionPopup.begin === 'function') {
            IP2Live.GameplayCompletionPopup.begin(this, {
                title: 'REACTOR STABILIZED',
                label: '2^' + result.exponent + ' = ' + result.totalAddresses + ' addresses // ' + result.usableHosts + ' usable hosts',
                footer: 'SMALLEST VALID HOST-BIT POWER SECURED',
                result,
                onComplete: finish,
            });
        } else finish();
    }

    _cancel(failed) {
        if (this.finished) return;
        this.finished = true;
        this.heldLeft = false;
        this.heldRight = false;
        this.shootHeld = false;
        const result = this._result({ success: false, cancelled: !failed, failed: !!failed, reason: this.failureReason });
        if (failed && typeof this.options.onFailed === 'function') this.options.onFailed(result);
        else if (typeof this.options.onCancel === 'function') this.options.onCancel(result);
    }

    onKeyPressed(key) {
        if (this._dialogueActive()) {
            const valueWhenDialogue = key && (key.name || key.code || key);
            const upperWhenDialogue = String(valueWhenDialogue || '').toUpperCase();
            if (upperWhenDialogue === 'ENTER' || upperWhenDialogue === 'SPACE' || upperWhenDialogue === 'SPACEBAR') {
                IP2Live.DialogueManager.advance();
            }
            return true;
        }
        if (this.finished) return true;
        const upper = this._keyToken(key);
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel(false);
            return true;
        }
        if (this.roundState === 'failed') {
            if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') {
                this._cancel(true);
                return true;
            }
            return true;
        }
        if (this._isShootKey(upper)) {
            if (this.roundState === 'active' && !this.shootHeld) {
                this.shootHeld = true;
                this._fireBullet(this.lastMetrics || this._metrics(), Date.now());
            }
            return true;
        }
        const direction = this._directionForKey(upper);
        if (direction && this.roundState === 'active') {
            const m = this.lastMetrics || this._metrics();
            this._ensureGun(m);
            const wasHeld = direction < 0 ? this.heldLeft : this.heldRight;
            if (direction < 0) {
                this.heldLeft = true;
                this.heldRight = false;
            } else {
                this.heldRight = true;
                this.heldLeft = false;
            }
            if (!wasHeld) {
                this.laneHoldElapsedMs = 0;
                this.laneHoldRepeating = false;
                this._moveGunLane(direction, m);
            }
        }
        return true;
    }

    onKeyPressedRepeat(key) {
        return this.onKeyPressed(key);
    }

    onKeyPressedAndRepeat(key) {
        return this.onKeyPressed(key);
    }

    onKeyReleased(key) {
        const token = this._keyToken(key);
        if (this._isShootKey(token)) this.shootHeld = false;
        const direction = this._directionForKey(token);
        if (direction < 0) this.heldLeft = false;
        else if (direction > 0) this.heldRight = false;
        if (!this.heldLeft && !this.heldRight) {
            this.laneHoldElapsedMs = 0;
            this.laneHoldRepeating = false;
        }
        return true;
    }

    _keyToken(key) {
        const value = key && (key.code || key.name || key);
        return String(value || '').toUpperCase();
    }

    _directionForKey(token) {
        if (token === 'ARROWLEFT' || token === 'A' || token === 'KEYA') return -1;
        if (token === 'ARROWRIGHT' || token === 'D' || token === 'KEYD') return 1;
        return 0;
    }

    _isShootKey(token) {
        return token === 'SPACE' || token === 'SPACEBAR' || token === ' ';
    }

    onMouseMove(x, y) {
        if (this.finished || this.roundState !== 'active') return true;
        const m = this.lastMetrics || this._metrics();
        if (x >= m.arena.x && x <= m.arena.x + m.arena.w && y >= m.arena.y && y <= m.arena.y + m.arena.h) {
            this.heldLeft = false;
            this.heldRight = false;
            this.laneHoldElapsedMs = 0;
            this.laneHoldRepeating = false;
            const laneWidth = m.arena.w / IP_HOST_POWER_PLAYFIELD.LANE_COUNT;
            this.gunLaneIndex = Math.max(0, Math.min(
                IP_HOST_POWER_PLAYFIELD.LANE_COUNT - 1,
                Math.floor((x - m.arena.x) / laneWidth)
            ));
            this.lastMouseX = x;
            this._ensureGun(m);
        }
        return true;
    }

    onMouseDown(x, y) {
        if (this._dialogueActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        if (this.finished) return true;
        const m = this.lastMetrics || this._metrics();
        if (this.roundState === 'active') {
            const calculateButton = this._calculateButtonRect(m);
            if (this._pointInRect(x, y, calculateButton)) {
                this._calculateCurrentPower();
                return true;
            }
        }
        if (this.roundState === 'failed') {
            this._cancel(true);
            return true;
        }
        return this.onMouseMove(x, y);
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const m = this._metrics();
        this.lastMetrics = m;
        this._ensureGun(m);
        this.buttons = [];

        const warningIntensity = this._criticalWarningIntensity(Date.now());

        ctx.save();

        if (warningIntensity > 0 && this.roundState === 'active') {
            const shakeAmount = warningIntensity * 2.8 * m.scale;
            const shakeX = Math.sin(this.animTick * 1.73) * shakeAmount;
            const shakeY = Math.cos(this.animTick * 1.41) * shakeAmount * 0.72;
            ctx.translate(shakeX, shakeY);
        }

        this._drawBackdrop(ctx, m);
        this._drawShell(ctx, m);
        this._drawHeader(ctx, m);
        this._drawArena(ctx, m);
        this._drawRightPanel(ctx, m);

        if (this.roundState === 'overflow_failure') {
            this._drawOverflowFailure(ctx, m, false);
        } else if (this.roundState === 'failed') {
            // Keep the coolant breach fully raised and animated behind the
            // explanation card until the player leaves the scene.
            this._drawOverflowFailure(ctx, m, true);
            this._drawFailure(ctx, m);
        }

        this._drawTutorialHighlight(ctx, m);
        ctx.restore();

        if (warningIntensity > 0 && this.roundState === 'active') {
            this._drawCriticalWarningOverlay(ctx, m, warningIntensity);
        }

        if (IP2Live.GameplayCompletionPopup && typeof IP2Live.GameplayCompletionPopup.drawFor === 'function') {
            IP2Live.GameplayCompletionPopup.drawFor(this, ctx, { tick: this.animTick });
        }

        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.drawOverlay === 'function') {
            IP2Live.DialogueManager.drawOverlay(ctx);
        }
    }

    _drawBackdrop(ctx, m) {
        const gradient = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        gradient.addColorStop(0, '#02050b');
        gradient.addColorStop(0.52, '#08111c');
        gradient.addColorStop(1, '#03060c');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, m.cW, m.cH);

        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#00b9cf';
        ctx.lineWidth = Math.max(1, m.scale);
        const spacing = 48 * m.scale;
        const offset = (this.animTick * 0.24) % spacing;
        for (let x = -m.cH + offset; x < m.cW + m.cH; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + m.cH * 0.28, m.cH);
            ctx.stroke();
        }
        for (let y = m.cH * 0.18; y < m.cH; y += 42 * m.scale) {
            ctx.globalAlpha = Math.min(0.13, 0.025 + y / m.cH * 0.1);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(m.cW, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawShell(ctx, m) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 28 * m.scale;
        ctx.shadowOffsetY = 12 * m.scale;
        this._chamferPath(ctx, m.x, m.y, m.w, m.h, 18 * m.scale);
        const fill = ctx.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h);
        fill.addColorStop(0, '#202a34');
        fill.addColorStop(0.045, '#101720');
        fill.addColorStop(0.5, '#05090e');
        fill.addColorStop(0.955, '#18232d');
        fill.addColorStop(1, '#4f5c66');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(177, 207, 220, 0.32)';
        ctx.lineWidth = 2 * m.scale;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        this._chamferPath(ctx, m.x + 8 * m.scale, m.y + 8 * m.scale, m.w - 16 * m.scale, m.h - 16 * m.scale, 13 * m.scale);
        const deck = ctx.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h);
        deck.addColorStop(0, 'rgba(12, 22, 31, 0.99)');
        deck.addColorStop(0.48, 'rgba(3, 8, 13, 0.995)');
        deck.addColorStop(1, 'rgba(8, 14, 22, 0.99)');
        ctx.fillStyle = deck;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();

        const dividerX = m.x + m.leftW + m.gap * 0.5;
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.20)';
        ctx.lineWidth = 1 * m.scale;
        ctx.beginPath();
        ctx.moveTo(dividerX, m.y + 44 * m.scale);
        ctx.lineTo(dividerX, m.y + m.h - 18 * m.scale);
        ctx.stroke();

        const boltYs = [m.y + 95 * m.scale, m.y + m.h * 0.5, m.y + m.h - 52 * m.scale];
        for (let i = 0; i < boltYs.length; i++) {
            this._drawFastener(ctx, m.x + 13 * m.scale, boltYs[i], 4.5 * m.scale);
            this._drawFastener(ctx, m.x + m.w - 13 * m.scale, boltYs[i], 4.5 * m.scale);
        }
        ctx.restore();
    }

    _drawHeader(ctx, m) {
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : this._uiFont();
        const font = this._uiFont();
        const plateX = m.x + 20 * m.scale;
        const plateY = m.y + 10 * m.scale;
        const plateW = Math.min(m.w * 0.53, 445 * m.scale);
        const plateH = 43 * m.scale;

        ctx.save();

        this._chamferPath(ctx, plateX, plateY, plateW, plateH, 9 * m.scale);
        const plate = ctx.createLinearGradient(plateX, plateY, plateX + plateW, plateY + plateH);
        plate.addColorStop(0, '#202a34');
        plate.addColorStop(0.18, '#090d13');
        plate.addColorStop(0.76, '#111821');
        plate.addColorStop(1, '#030508');
        ctx.fillStyle = plate;
        ctx.fill();
        ctx.strokeStyle = 'rgba(180, 205, 217, 0.25)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(plateX, plateY + 7 * m.scale);
        ctx.lineTo(plateX + 64 * m.scale, plateY);
        ctx.lineTo(plateX + 57 * m.scale, plateY + plateH);
        ctx.lineTo(plateX, plateY + plateH - 7 * m.scale);
        ctx.closePath();

        const badge = ctx.createLinearGradient(plateX, plateY, plateX + 64 * m.scale, plateY + plateH);
        badge.addColorStop(0, '#ff315f');
        badge.addColorStop(0.62, '#b50032');
        badge.addColorStop(1, '#4a071c');
        ctx.fillStyle = badge;
        ctx.fill();

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px ' + font;
        ctx.fillText('IP2', plateX + 26 * m.scale, plateY + 15 * m.scale);
        ctx.fillStyle = '#ffe600';
        ctx.fillText('P-45', plateX + 26 * m.scale, plateY + 29 * m.scale);

        const titleX = plateX + 73 * m.scale;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f7fcff';
        ctx.font = 'bold ' + Math.round(17 * m.scale) + 'px ' + titleFont;
        ctx.fillText('HOST', titleX, plateY + 19 * m.scale);
        const hostW = ctx.measureText('HOST').width;
        ctx.fillStyle = '#00f0ff';
        ctx.fillText('POWER', titleX + hostW + 9 * m.scale, plateY + 19 * m.scale);

        ctx.fillStyle = 'rgba(190, 211, 222, 0.68)';
        ctx.font = 'bold ' + Math.round(6.5 * m.scale) + 'px ' + font;
        ctx.fillText('GAMEPLAY 4.5 // REACTOR CAPACITY', titleX, plateY + 34 * m.scale);
        ctx.restore();

        const chipY = m.y + 13 * m.scale;
        const liveColor = this.roundState === 'failed' || this.roundState === 'overflow_failure'
            ? '#ff315f'
            : (this.guidedTutorial ? '#ffe600' : (this.roundState === 'ready' ? '#ffe600' : '#00f0ff'));

        const statusText = this.roundState === 'failed'
            ? 'OFFLINE'
            : (this.roundState === 'overflow_failure'
                ? 'BREACH'
                : (this.guidedTutorial ? 'TRAINING' : (this.roundState === 'ready' ? 'SYNC' : 'LIVE')));

        let chipRight = m.x + m.w - 20 * m.scale;
        chipRight = this._drawStatusChip(ctx, chipRight, chipY, 'SYS ' + statusText, liveColor, m);
        chipRight = this._drawStatusChip(ctx, chipRight - 7 * m.scale, chipY, 'HOSTS ' + this._formatNumber(this.scenario.requiredHosts), '#ffe600', m);
        this._drawStatusChip(ctx, chipRight - 7 * m.scale, chipY, 'CLASS ' + this.scenario.className + ' /' + this.scenario.classConfig.defaultPrefix, '#00f0ff', m);

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(173, 205, 216, 0.62)';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px ' + font;
        ctx.fillText('A/D OR LEFT/RIGHT STEP LANES  //  SPACE GRAB  //  ESC EXIT', m.x + m.w - 22 * m.scale, m.y + 52 * m.scale);
    }

    _drawArena(ctx, m) {
        const a = m.arena;
        const font = this._uiFont();

        ctx.save();
        this._roundedRect(ctx, a.x, a.y, a.w, a.h, 10 * m.scale);
        ctx.fillStyle = 'rgba(0, 7, 12, 0.96)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.42)';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.stroke();
        ctx.clip();

        const laneCount = IP_HOST_POWER_PLAYFIELD.LANE_COUNT;
        const laneWidth = a.w / laneCount;

        for (let lane = 0; lane < laneCount; lane++) {
            if (lane % 2 === 0) {
                ctx.fillStyle = 'rgba(0, 174, 199, 0.025)';
                ctx.fillRect(a.x + lane * laneWidth, a.y, laneWidth, a.h);
            }
        }

        if (Number.isInteger(this.gunLaneIndex)) {
            const selectedX = a.x + laneWidth * this.gunLaneIndex;
            const selectedGlow = ctx.createLinearGradient(selectedX, a.y, selectedX + laneWidth, a.y);
            selectedGlow.addColorStop(0, 'rgba(0, 240, 255, 0.015)');
            selectedGlow.addColorStop(0.5, 'rgba(0, 240, 255, 0.09)');
            selectedGlow.addColorStop(1, 'rgba(0, 240, 255, 0.015)');
            ctx.fillStyle = selectedGlow;
            ctx.fillRect(selectedX, a.y + 30 * m.scale, laneWidth, a.h - 54 * m.scale);
        }

        ctx.strokeStyle = 'rgba(35, 171, 190, 0.22)';
        ctx.lineWidth = Math.max(0.8, m.scale);

        for (let lane = 1; lane < laneCount; lane++) {
            const laneX = a.x + lane * laneWidth;
            ctx.beginPath();
            ctx.moveTo(laneX, a.y + 30 * m.scale);
            ctx.lineTo(laneX, a.y + a.h - 24 * m.scale);
            ctx.stroke();
        }

        const grid = 42 * m.scale;
        ctx.strokeStyle = 'rgba(26, 112, 128, 0.10)';
        ctx.lineWidth = Math.max(0.5, m.scale * 0.7);

        for (let y = a.y + 30 * m.scale; y < a.y + a.h - 24 * m.scale; y += grid) {
            ctx.beginPath();
            ctx.moveTo(a.x, y);
            ctx.lineTo(a.x + a.w, y);
            ctx.stroke();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px ' + font;

        for (let lane = 0; lane < laneCount; lane++) {
            const laneX = a.x + laneWidth * (lane + 0.5);
            ctx.fillStyle = 'rgba(0, 8, 13, 0.72)';
            this._roundedRect(ctx, laneX - 12 * m.scale, a.y + 35 * m.scale, 24 * m.scale, 14 * m.scale, 4 * m.scale);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
            ctx.stroke();
            ctx.fillStyle = 'rgba(145, 229, 239, 0.72)';
            ctx.fillText('L' + (lane + 1), laneX, a.y + 42 * m.scale);
        }

        const scanY = a.y + ((this.animTick * 1.6 * m.scale) % Math.max(1, a.h));
        const scan = ctx.createLinearGradient(a.x, scanY - 18 * m.scale, a.x, scanY + 18 * m.scale);
        scan.addColorStop(0, 'rgba(0, 230, 255, 0)');
        scan.addColorStop(0.5, 'rgba(0, 230, 255, 0.07)');
        scan.addColorStop(1, 'rgba(0, 230, 255, 0)');
        ctx.fillStyle = scan;
        ctx.fillRect(a.x, scanY - 18 * m.scale, a.w, 36 * m.scale);

        const tutorialSamples = this._tutorialSampleEntities(m);
        for (let i = 0; i < tutorialSamples.length; i++) this._drawEntity(ctx, tutorialSamples[i], m);
        for (let i = 0; i < this.entities.length; i++) this._drawEntity(ctx, this.entities[i], m);
        for (let i = 0; i < this.bullets.length; i++) this._drawBullet(ctx, this.bullets[i], m);
        this._drawGun(ctx, m);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
        ctx.fillRect(a.x, a.y, a.w, 30 * m.scale);

        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px ' + font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('ENERGY INTAKE // 5 LANES // COLLECTOR GRID', a.x + 13 * m.scale, a.y + 15 * m.scale);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffe600';
        ctx.fillText('ENERGY 1..5', a.x + a.w - 98 * m.scale, a.y + 15 * m.scale);
        ctx.fillStyle = '#ff315f';
        ctx.fillText('BROKEN 1..2', a.x + a.w - 13 * m.scale, a.y + 15 * m.scale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
        ctx.fillRect(a.x, a.y + a.h - 24 * m.scale, a.w, 24 * m.scale);

        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(183, 218, 227, 0.64)';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px ' + font;
        ctx.fillText('COLLECTOR LINK // TAP SPACE TO GRAB', a.x + 13 * m.scale, a.y + a.h - 12 * m.scale);

        ctx.textAlign = 'right';
        ctx.fillStyle = this.roundState === 'active' ? '#55ff91' : '#ffe600';
        const arenaStatus = this.guidedTutorial
            ? 'STEP LANES // GRAB ENERGY CELLS'
            : (this.roundState === 'active' ? 'COLLECTOR L' + (this.gunLaneIndex + 1) + ' // READY' : 'ENGINE SYNC');

        ctx.fillText(arenaStatus, a.x + a.w - 13 * m.scale, a.y + a.h - 12 * m.scale);
        ctx.restore();
    }

    _tutorialSampleEntities(m) {
        if (!this.tutorialActive || this.tutorialComplete || !this.tutorialHighlight) return [];
        if (this.tutorialHighlight.type !== 'intake' && this.tutorialHighlight.type !== 'shell') return [];

        const laneWidth = m.arena.w / IP_HOST_POWER_PLAYFIELD.LANE_COUNT;
        const y = m.arena.y + Math.min(m.arena.h * 0.26, 118 * m.scale);

        return [
            {
                id: 'tutorial-coal',
                type: 'coal',
                value: 2,
                laneIndex: 1,
                x: m.arena.x + laneWidth * 1.5,
                y,
                radius: 21 * m.scale,
                spin: 0,
                maxHits: 1,
                hitsRemaining: 1,
                hitFlashUntil: 0,
                grabbed: false,
            },
            {
                id: 'tutorial-broken-cell',
                type: 'broken-cell',
                value: -1,
                laneIndex: 3,
                x: m.arena.x + laneWidth * 3.5,
                y,
                radius: 20 * m.scale,
                spin: Math.PI / 8,
                maxHits: 1,
                hitsRemaining: 1,
                hitFlashUntil: 0,
                grabbed: false,
            },
        ];
    }

    _drawTutorialHighlight(ctx, m) {
        if (!this.tutorialHighlight || (!this.tutorialPaused && !this.tutorialDialogueOpen)) return;
        const focus = this._tutorialHighlightRects(m);
        if (!focus || !focus.rects || !focus.rects.length) return;
        const rects = focus.rects;
        const pulse = 0.55 + 0.45 * Math.sin((this.animTick || 0) * 0.15);
        const cut = Math.max(5, 8 * m.scale);

        ctx.save();
        ctx.beginPath();
        ctx.rect(m.x + 8 * m.scale, m.y + 8 * m.scale, m.w - 16 * m.scale, m.h - 16 * m.scale);
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            this._appendChamferPath(ctx, rect.x, rect.y, rect.w, rect.h, cut);
        }
        ctx.fillStyle = 'rgba(0, 3, 9, 0.76)';
        try { ctx.fill('evenodd'); } catch (e) { ctx.fill(); }

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            const accent = i === 0 ? '#ffe600' : '#00f0ff';
            ctx.save();
            this._chamferPath(ctx, rect.x, rect.y, rect.w, rect.h, cut);
            ctx.fillStyle = i === 0 ? 'rgba(255, 230, 0, 0.08)' : 'rgba(0, 240, 255, 0.07)';
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = (2.1 + pulse * 1.2) * m.scale;
            ctx.shadowColor = accent;
            ctx.shadowBlur = (10 + pulse * 12) * m.scale;
            ctx.stroke();
            ctx.clip();
            const sweepH = Math.max(2, 3 * m.scale);
            const sweepY = rect.y + ((this.animTick * 2.2 + i * 31) % Math.max(1, rect.h - sweepH));
            ctx.fillStyle = i === 0 ? 'rgba(255, 230, 0, 0.28)' : 'rgba(0, 240, 255, 0.24)';
            ctx.fillRect(rect.x + cut, sweepY, Math.max(0, rect.w - cut * 2), sweepH);
            ctx.restore();
        }

        const anchor = rects[0];
        const label = String(focus.label || this.tutorialHighlight.label || 'SYSTEM FOCUS');
        const labelH = 20 * m.scale;
        const labelW = Math.min(
            Math.max(176 * m.scale, label.length * 6.6 * m.scale),
            Math.max(176 * m.scale, m.w * 0.46)
        );
        const labelX = Math.max(m.x + 18 * m.scale, Math.min(anchor.x, m.x + m.w - labelW - 18 * m.scale));
        const labelY = Math.max(m.y + 48 * m.scale, anchor.y - labelH - 7 * m.scale);
        this._chamferPath(ctx, labelX, labelY, labelW, labelH, 5 * m.scale);
        ctx.fillStyle = '#ffe600';
        ctx.shadowColor = '#ffe600';
        ctx.shadowBlur = 9 * m.scale;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#05070a';
        ctx.font = 'bold ' + Math.max(7, Math.round(8 * m.scale)) + 'px ' + this._uiFont();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX + 10 * m.scale, labelY + labelH * 0.54);
        ctx.restore();
    }

    _tutorialHighlightRects(m) {
        const highlight = this.tutorialHighlight || {};
        const pad = 7 * m.scale;

        const clamp = (rect) => {
            const minX = m.x + 14 * m.scale;
            const minY = m.y + 62 * m.scale;
            const maxX = m.x + m.w - 14 * m.scale;
            const maxY = m.y + m.h - 14 * m.scale;
            const x = Math.max(minX, rect.x - pad);
            const y = Math.max(minY, rect.y - pad);

            return {
                x,
                y,
                w: Math.max(24 * m.scale, Math.min(maxX, rect.x + rect.w + pad) - x),
                h: Math.max(24 * m.scale, Math.min(maxY, rect.y + rect.h + pad) - y),
            };
        };

        const layout = this._rightPanelLayout(m);
        const result = { label: highlight.label || '', rects: [] };

        if (highlight.type === 'reactor') {
            result.rects.push(clamp(layout.engine));
            result.rects.push(clamp(layout.needed));
        } else if (highlight.type === 'formula') {
            result.rects.push(clamp(layout.controls));
            result.rects.push(clamp(layout.needed));
        } else if (highlight.type === 'intake') {
            result.rects.push(clamp({
                x: m.arena.x,
                y: m.arena.y,
                w: m.arena.w,
                h: Math.min(m.arena.h * 0.43, 205 * m.scale),
            }));
        } else if (highlight.type === 'shell') {
            const samples = this._tutorialSampleEntities(m);
            for (let i = 0; i < samples.length; i++) {
                const sample = samples[i];
                result.rects.push(clamp({
                    x: sample.x - 40 * m.scale,
                    y: sample.y - 36 * m.scale,
                    w: 80 * m.scale,
                    h: 74 * m.scale,
                }));
            }
        } else if (highlight.type === 'controls') {
            const collectorY = m.arena.y + m.arena.h - 48 * m.scale;
            result.rects.push(clamp({
                x: this.gunX - 36 * m.scale,
                y: collectorY - 39 * m.scale,
                w: 72 * m.scale,
                h: 66 * m.scale,
            }));
            result.rects.push(clamp({
                x: m.arena.x,
                y: m.arena.y + m.arena.h - 28 * m.scale,
                w: m.arena.w,
                h: 28 * m.scale,
            }));
        } else if (highlight.type === 'timer') {
            result.rects.push(clamp(layout.leftGauge));
            result.rects.push(clamp(layout.rightGauge));
        }

        return result.rects.length ? result : null;
    }

    _drawEntity(ctx, entity, m) {
        const isBroken = entity.type === 'broken-cell';
        const magnitude = Math.max(1, Math.abs(Number(entity.value) || 1));
        const valueColor = isBroken
            ? '#ff315f'
            : (IP_HOST_POWER_PLAYFIELD.VALUE_COLORS[entity.value] || '#00eaff');
        const font = this._uiFont();
        const pulse = 0.5 + 0.5 * Math.sin((this.animTick + (entity.id || 0) * 13) * 0.13);

        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.rotate(entity.spin || 0);

        if (isBroken) {
            const r = entity.radius;
            const bodyW = r * 1.92;
            const bodyH = r * 1.42;

            ctx.shadowColor = '#ff315f';
            ctx.shadowBlur = (12 + pulse * 7) * m.scale;

            this._chamferPath(ctx, -bodyW * 0.5, -bodyH * 0.5, bodyW, bodyH, 5 * m.scale);
            const brokenShell = ctx.createLinearGradient(-bodyW * 0.5, -bodyH * 0.5, bodyW * 0.5, bodyH * 0.5);
            brokenShell.addColorStop(0, '#25050d');
            brokenShell.addColorStop(0.28, '#6d1025');
            brokenShell.addColorStop(0.55, '#19060c');
            brokenShell.addColorStop(0.82, '#4b0b1a');
            brokenShell.addColorStop(1, '#0d0306');
            ctx.fillStyle = brokenShell;
            ctx.fill();
            ctx.strokeStyle = '#ff5d78';
            ctx.lineWidth = 1.5 * m.scale;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Damaged battery terminals.
            ctx.fillStyle = '#8d263a';
            ctx.fillRect(-bodyW * 0.58, -bodyH * 0.18, bodyW * 0.12, bodyH * 0.36);
            ctx.fillRect(bodyW * 0.46, -bodyH * 0.18, bodyW * 0.12, bodyH * 0.36);
            ctx.fillStyle = '#ff8195';
            ctx.fillRect(-bodyW * 0.60, -bodyH * 0.08, bodyW * 0.05, bodyH * 0.16);

            // Dark inner cell with fractured charge plates.
            this._roundedRect(ctx, -bodyW * 0.32, -bodyH * 0.31, bodyW * 0.64, bodyH * 0.62, 4 * m.scale);
            ctx.fillStyle = 'rgba(7, 3, 6, 0.94)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,98,121,0.55)';
            ctx.lineWidth = 1 * m.scale;
            ctx.stroke();

            for (let i = 0; i < 3; i++) {
                const sy = -bodyH * 0.20 + i * bodyH * 0.20;
                ctx.strokeStyle = 'rgba(255,49,95,' + (0.28 + i * 0.11) + ')';
                ctx.lineWidth = 1 * m.scale;
                ctx.beginPath();
                ctx.moveTo(-bodyW * 0.22, sy);
                ctx.lineTo(bodyW * 0.17, sy + Math.sin(i + this.animTick * 0.06) * 2 * m.scale);
                ctx.stroke();
            }

            ctx.strokeStyle = '#ff9aac';
            ctx.lineWidth = 2 * m.scale;
            ctx.beginPath();
            ctx.moveTo(-bodyW * 0.30, -bodyH * 0.34);
            ctx.lineTo(-bodyW * 0.03, -bodyH * 0.06);
            ctx.lineTo(-bodyW * 0.18, bodyH * 0.15);
            ctx.lineTo(bodyW * 0.08, bodyH * 0.02);
            ctx.lineTo(bodyW * 0.28, bodyH * 0.34);
            ctx.stroke();

            // Magnitude only. The red broken-cell treatment communicates subtraction.
            ctx.fillStyle = '#ffe9ed';
            ctx.font = 'bold ' + Math.max(10, Math.round(14 * m.scale)) + 'px ' + font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(magnitude), 0, 0);

            ctx.fillStyle = 'rgba(255,145,164,0.70)';
            ctx.font = 'bold ' + Math.max(5, Math.round(5.3 * m.scale)) + 'px ' + font;
            ctx.fillText('BROKEN', 0, bodyH * 0.43);
        } else {
            const r = entity.radius;
            const bodyW = r * 2.18;
            const bodyH = r * 1.34;

            ctx.shadowColor = valueColor;
            ctx.shadowBlur = (10 + pulse * 7) * m.scale;

            this._chamferPath(ctx, -bodyW * 0.5, -bodyH * 0.5, bodyW, bodyH, 5 * m.scale);
            const shell = ctx.createLinearGradient(-bodyW * 0.5, -bodyH * 0.5, bodyW * 0.5, bodyH * 0.5);
            shell.addColorStop(0, '#031017');
            shell.addColorStop(0.18, '#15323b');
            shell.addColorStop(0.43, valueColor);
            shell.addColorStop(0.50, '#e9ffff');
            shell.addColorStop(0.58, valueColor);
            shell.addColorStop(0.86, '#10272f');
            shell.addColorStop(1, '#030a0f');
            ctx.fillStyle = shell;
            ctx.fill();
            ctx.strokeStyle = '#dbfdff';
            ctx.lineWidth = 1.3 * m.scale;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Outer reinforcement rails and tiny terminal caps.
            ctx.fillStyle = 'rgba(2,10,14,0.92)';
            ctx.fillRect(-bodyW * 0.47, -bodyH * 0.22, 4 * m.scale, bodyH * 0.44);
            ctx.fillRect(bodyW * 0.47 - 4 * m.scale, -bodyH * 0.22, 4 * m.scale, bodyH * 0.44);
            ctx.strokeStyle = 'rgba(255,255,255,0.30)';
            ctx.lineWidth = 0.8 * m.scale;
            ctx.beginPath();
            ctx.moveTo(-bodyW * 0.34, -bodyH * 0.33);
            ctx.lineTo(bodyW * 0.33, -bodyH * 0.33);
            ctx.stroke();

            // Coal/energy fragments behind the value window.
            for (let i = 0; i < 6; i++) {
                const px = -bodyW * 0.31 + (i % 3) * bodyW * 0.31;
                const py = -bodyH * 0.16 + Math.floor(i / 3) * bodyH * 0.30;
                const size = (3.4 + (i % 2) * 1.2) * m.scale;
                ctx.fillStyle = i % 2 ? 'rgba(1,7,10,0.95)' : 'rgba(11,19,21,0.95)';
                ctx.beginPath();
                ctx.moveTo(px - size, py + size * 0.3);
                ctx.lineTo(px - size * 0.2, py - size);
                ctx.lineTo(px + size, py - size * 0.5);
                ctx.lineTo(px + size * 0.7, py + size);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 0.7 * m.scale;
                ctx.stroke();
            }

            // Central glass readout. No + sign: the cyan/green/yellow cartridge
            // already communicates that this is usable energy.
            this._roundedRect(ctx, -13 * m.scale, -10 * m.scale, 26 * m.scale, 20 * m.scale, 5 * m.scale);
            const windowFill = ctx.createLinearGradient(0, -10 * m.scale, 0, 10 * m.scale);
            windowFill.addColorStop(0, 'rgba(2,13,17,0.98)');
            windowFill.addColorStop(0.52, 'rgba(7,25,29,0.96)');
            windowFill.addColorStop(1, 'rgba(1,7,10,0.98)');
            ctx.fillStyle = windowFill;
            ctx.fill();
            ctx.strokeStyle = valueColor;
            ctx.lineWidth = 1.2 * m.scale;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold ' + Math.max(10, Math.round(14 * m.scale)) + 'px ' + font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(magnitude), 0, 0);

            ctx.fillStyle = 'rgba(222,255,255,0.62)';
            ctx.font = 'bold ' + Math.max(5, Math.round(5 * m.scale)) + 'px ' + font;
            ctx.fillText('ENERGY', 0, bodyH * 0.43);
        }

        ctx.rotate(-(entity.spin || 0));

        if (Number(entity.hitFlashUntil) > Date.now()) {
            ctx.globalAlpha = 0.86;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.1 * m.scale;
            ctx.beginPath();
            ctx.arc(0, 0, entity.radius * 1.46, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        if (entity.grabbed) {
            ctx.strokeStyle = '#dfffff';
            ctx.globalAlpha = 0.72;
            ctx.lineWidth = 1.3 * m.scale;
            ctx.beginPath();
            ctx.arc(0, 0, entity.radius * 1.30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    _drawBullet(ctx, tether, m) {
        const collectorY = m.arena.y + m.arena.h - 48 * m.scale;
        const pulse = 0.5 + 0.5 * Math.sin((this.animTick + (tether.id || 0) * 7) * 0.22);
        const anchorX = Number.isFinite(this.gunX) ? this.gunX : (Number.isFinite(tether.homeX) ? tether.homeX : tether.x);

        ctx.save();

        const cable = ctx.createLinearGradient(anchorX, collectorY, tether.x, tether.y);
        cable.addColorStop(0, 'rgba(224,255,255,0.92)');
        cable.addColorStop(0.35, 'rgba(0,240,255,0.82)');
        cable.addColorStop(1, 'rgba(0,110,135,0.18)');

        ctx.strokeStyle = cable;
        ctx.lineWidth = 1.6 * m.scale;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = (5 + pulse * 5) * m.scale;
        ctx.setLineDash([6 * m.scale, 5 * m.scale]);
        ctx.beginPath();
        ctx.moveTo(anchorX, collectorY - 18 * m.scale);
        ctx.lineTo(tether.x, tether.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        const netR = (8 + pulse * 2) * m.scale;
        ctx.strokeStyle = tether.targetId ? '#72ffb6' : '#b9fbff';
        ctx.lineWidth = 1.25 * m.scale;
        ctx.beginPath();
        ctx.arc(tether.x, tether.y, netR, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(tether.x, tether.y);
            ctx.lineTo(tether.x + Math.cos(a) * netR, tether.y + Math.sin(a) * netR);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(210,255,255,0.60)';
        ctx.lineWidth = 0.9 * m.scale;
        ctx.beginPath();
        ctx.moveTo(anchorX, collectorY - 22 * m.scale);
        ctx.lineTo(tether.x, tether.y + netR * 0.30);
        ctx.stroke();

        ctx.restore();
    }

    _drawGun(ctx, m) {
        const a = m.arena;
        const x = this.gunX;
        const y = a.y + a.h - 48 * m.scale;
        const font = this._uiFont();
        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.12);

        ctx.save();

        ctx.shadowColor = '#00eaff';
        ctx.shadowBlur = (8 + pulse * 6) * m.scale;

        const body = ctx.createLinearGradient(x - 24 * m.scale, y, x + 24 * m.scale, y);
        body.addColorStop(0, '#061116');
        body.addColorStop(0.28, '#153641');
        body.addColorStop(0.52, '#1b5966');
        body.addColorStop(0.72, '#12313a');
        body.addColorStop(1, '#050b0f');

        this._chamferPath(ctx, x - 25 * m.scale, y - 13 * m.scale, 50 * m.scale, 24 * m.scale, 6 * m.scale);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.strokeStyle = '#67efff';
        ctx.lineWidth = 1.4 * m.scale;
        ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.fillStyle = '#09151a';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.beginPath();
        ctx.arc(x, y - 6 * m.scale, 10 * m.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#91fbff';
        ctx.lineWidth = 2 * m.scale;
        ctx.beginPath();
        ctx.arc(x, y - 6 * m.scale, 5.5 * m.scale, -Math.PI * 0.15, Math.PI * 1.15);
        ctx.stroke();

        ctx.fillStyle = '#5fffd0';
        ctx.fillRect(x - 2 * m.scale, y - 29 * m.scale, 4 * m.scale, 15 * m.scale);

        ctx.strokeStyle = '#5fffd0';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.beginPath();
        ctx.moveTo(x - 8 * m.scale, y - 24 * m.scale);
        ctx.lineTo(x, y - 31 * m.scale);
        ctx.lineTo(x + 8 * m.scale, y - 24 * m.scale);
        ctx.stroke();

        for (let i = -1; i <= 1; i += 2) {
            ctx.fillStyle = '#1a3038';
            ctx.fillRect(x + i * 19 * m.scale - 3 * m.scale, y + 10 * m.scale, 6 * m.scale, 5 * m.scale);
        }

        ctx.fillStyle = '#dffcff';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px ' + font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('L' + (this.gunLaneIndex + 1), x, y + 20 * m.scale);

        ctx.restore();
    }

    _drawRightPanel(ctx, m) {
        const layout = this._rightPanelLayout(m);

        this._drawEngineAssembly(ctx, layout, m);
        this._drawEngineControls(ctx, layout.controls, m);
    }


    _rightPanelLayout(m) {
        const r = m.right;
        const controlsH = Math.max(108 * m.scale, r.h * 0.225);
        const gap = 11 * m.scale;

        const engine = {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h - controlsH - gap,
        };

        const controls = {
            x: r.x,
            y: engine.y + engine.h + gap,
            w: r.w,
            h: controlsH,
        };

        const gaugeW = Math.max(29 * m.scale, engine.w * 0.048);
        const gaugeTop = engine.y + 48 * m.scale;
        const gaugeH = engine.h - 76 * m.scale;

        const leftGauge = {
            x: engine.x + 18 * m.scale,
            y: gaugeTop,
            w: gaugeW,
            h: gaugeH,
        };

        const rightGauge = {
            x: engine.x + engine.w - 18 * m.scale - gaugeW,
            y: gaugeTop,
            w: gaugeW,
            h: gaugeH,
        };

        const glass = {
            x: leftGauge.x + leftGauge.w + 18 * m.scale,
            y: engine.y + 40 * m.scale,
            w: rightGauge.x - (leftGauge.x + leftGauge.w) - 36 * m.scale,
            h: engine.h - 65 * m.scale,
        };

        const needed = {
            x: glass.x + glass.w * 0.22,
            y: glass.y + 17 * m.scale,
            w: glass.w * 0.56,
            h: 68 * m.scale,
        };

        const calculator = {
            x: controls.x + 11 * m.scale,
            y: controls.y + 9 * m.scale,
            w: controls.w - 22 * m.scale,
            h: controls.h - 18 * m.scale,
        };

        return {
            reactor: engine,
            engine,
            controls,
            calculator,
            needed,
            leftGauge,
            rightGauge,
            glass,
            timer: {
                x: leftGauge.x,
                y: leftGauge.y,
                w: rightGauge.x + rightGauge.w - leftGauge.x,
                h: leftGauge.h,
            },
        };
    }


    _calculateButtonRect(m, calculatorBox) {
        const box = calculatorBox || this._rightPanelLayout(m).calculator;
        const size = Math.min(84 * m.scale, box.h - 10 * m.scale);

        return {
            x: box.x + box.w - size - 7 * m.scale,
            y: box.y + (box.h - size) * 0.5,
            w: size,
            h: size,
        };
    }

    _reactorColor() {
        const checked = this.calculatedEvaluation;
        if (this.roundState === 'stabilizing' || (checked && checked.valid)) return '#55ff9b';
        if (checked && checked.status === 'over') return '#ff315f';
        if (checked && checked.status === 'under') return '#ffd05e';
        return '#27e8d2';
    }


    _drawReactor(ctx, box, m) {
        const layout = this._rightPanelLayout(m);
        this._drawEngineAssembly(ctx, layout, m);
    }

    _drawCalculatorCard(ctx, box, m) {
        this._drawEngineControls(ctx, this._rightPanelLayout(m).controls, m);
    }

    _drawNeededCard(ctx, box, m) {
        this._drawNeededPlaque(ctx, box, m);
    }



    _drawCalculateButton(ctx, button, m) {
        const enabled = this.roundState === 'active' && !this.finished && !this.tutorialPaused;
        const dirty = !this.calculatedEvaluation || this.calculatedEvaluation.exponent !== this.exponent;
        const font = this._uiFont();
        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.11);

        const cx = button.x + button.w * 0.5;
        const cy = button.y + button.h * 0.44;
        const outerR = Math.min(button.w, button.h) * 0.31;
        const ringColor = enabled ? '#FFE600' : '#67757A';
        const iconColor = enabled ? '#FFB300' : '#7A868A';

        ctx.save();

        ctx.shadowColor = 'rgba(0,0,0,0.88)';
        ctx.shadowBlur = 10 * m.scale;
        ctx.shadowOffsetY = 3 * m.scale;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR + 9 * m.scale, 0, Math.PI * 2);
        const mount = ctx.createRadialGradient(cx - outerR * 0.35, cy - outerR * 0.38, outerR * 0.08, cx, cy, outerR + 9 * m.scale);
        mount.addColorStop(0, '#68757A');
        mount.addColorStop(0.18, '#232C31');
        mount.addColorStop(0.64, '#090E11');
        mount.addColorStop(1, '#020304');
        ctx.fillStyle = mount;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(196,219,227,0.24)';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        const core = ctx.createRadialGradient(cx - outerR * 0.25, cy - outerR * 0.30, outerR * 0.10, cx, cy, outerR);
        core.addColorStop(0, enabled ? 'rgba(70,58,8,0.96)' : 'rgba(34,40,43,0.94)');
        core.addColorStop(0.52, 'rgba(9,13,16,0.98)');
        core.addColorStop(1, 'rgba(1,3,4,1)');
        ctx.fillStyle = core;
        ctx.fill();
        ctx.strokeStyle = enabled ? 'rgba(255,230,0,0.82)' : 'rgba(118,136,141,0.34)';
        ctx.lineWidth = 1.4 * m.scale;
        ctx.stroke();

        ctx.strokeStyle = enabled ? ringColor : 'rgba(98,110,116,0.42)';
        ctx.lineWidth = 2.8 * m.scale;
        ctx.shadowColor = enabled ? ringColor : 'transparent';
        ctx.shadowBlur = enabled ? (4 + pulse * 4) * m.scale : 0;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR * 0.82, Math.PI * 0.18, Math.PI * 1.62);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        const arrowA = Math.PI * 0.20;
        const ax = cx + Math.cos(arrowA) * outerR * 0.82;
        const ay = cy + Math.sin(arrowA) * outerR * 0.82;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 7 * m.scale, ay - 1.5 * m.scale);
        ctx.lineTo(ax - 2.4 * m.scale, ay - 6.2 * m.scale);
        ctx.closePath();
        ctx.fillStyle = iconColor;
        ctx.fill();

        ctx.strokeStyle = enabled ? 'rgba(255,255,220,0.30)' : 'rgba(220,235,240,0.12)';
        ctx.lineWidth = 1.0 * m.scale;
        ctx.beginPath();
        ctx.arc(cx - 1 * m.scale, cy - 1 * m.scale, outerR * 0.60, Math.PI * 1.02, Math.PI * 1.52);
        ctx.stroke();

        const labelW = Math.min(button.w - 6 * m.scale, 70 * m.scale);
        const labelH = 16 * m.scale;
        const labelX = cx - labelW * 0.5;
        const labelY = button.y + button.h - labelH - 1 * m.scale;
        this._chamferPath(ctx, labelX, labelY, labelW, labelH, 4 * m.scale);
        ctx.fillStyle = enabled ? 'rgba(255,230,0,0.94)' : 'rgba(79,92,97,0.82)';
        ctx.fill();
        ctx.fillStyle = enabled ? '#06080A' : '#172025';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(6.3 * m.scale) + 'px ' + font;
        ctx.fillText('CALCULATE', cx, labelY + labelH * 0.55);

        if (dirty && enabled) {
            ctx.fillStyle = '#FFE052';
            ctx.beginPath();
            ctx.arc(button.x + button.w - 7 * m.scale, button.y + 8 * m.scale, 2.4 * m.scale, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }


    _card(ctx, box, m, label) {
        this._roundedRect(ctx, box.x, box.y, box.w, box.h, 8 * m.scale);
        ctx.fillStyle = 'rgba(3, 14, 21, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(61, 134, 148, 0.42)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();
        ctx.fillStyle = '#6f9ba5';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px ' + this._uiFont();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, box.x + 12 * m.scale, box.y + 15 * m.scale);
    }

    _drawTimer(ctx, box, m) {
        const remaining = this._remainingMs(Date.now());
        const seconds = Math.ceil(remaining / 1000);
        const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secondsText = String(seconds % 60).padStart(2, '0');
        const font = this._uiFont();

        ctx.fillStyle = '#ffca53';
        ctx.font = 'bold ' + Math.round(11 * m.scale) + 'px ' + font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(minutesText + ':' + secondsText, box.x + box.w * 0.5, box.y + 9 * m.scale);
    }



    _drawFailure(ctx, m) {
        const font = this._uiFont();
        const current = IPHostPowerRules.evaluate(this.scenario.requiredHosts, this.exponent);
        const target = this.scenario.targetExponent;
        const difference = this.exponent - target;

        ctx.save();

        const shade = ctx.createRadialGradient(
            m.cW * 0.5,
            m.cH * 0.5,
            Math.min(m.cW, m.cH) * 0.12,
            m.cW * 0.5,
            m.cH * 0.5,
            Math.max(m.cW, m.cH) * 0.72
        );
        shade.addColorStop(0, 'rgba(0,2,5,0.28)');
        shade.addColorStop(0.55, 'rgba(0,2,6,0.44)');
        shade.addColorStop(1, 'rgba(0,1,4,0.62)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, m.cW, m.cH);

        const w = Math.min(680 * m.scale, m.cW - 34 * m.scale);
        const h = 332 * m.scale;
        const x = (m.cW - w) * 0.5;
        const y = (m.cH - h) * 0.5;

        ctx.shadowColor = '#FF315F';
        ctx.shadowBlur = 22 * m.scale;
        ctx.shadowOffsetY = 6 * m.scale;
        this._chamferPath(ctx, x, y, w, h, 18 * m.scale);
        const shell = ctx.createLinearGradient(x, y, x + w, y + h);
        shell.addColorStop(0, '#5A1326');
        shell.addColorStop(0.035, '#260812');
        shell.addColorStop(0.26, '#10070B');
        shell.addColorStop(0.76, '#09070A');
        shell.addColorStop(0.965, '#3E0D1B');
        shell.addColorStop(1, '#7A1831');
        ctx.fillStyle = shell;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = '#FF4C6A';
        ctx.lineWidth = 1.7 * m.scale;
        ctx.stroke();

        this._chamferPath(ctx, x + 7 * m.scale, y + 7 * m.scale, w - 14 * m.scale, h - 14 * m.scale, 13 * m.scale);
        ctx.fillStyle = 'rgba(8,5,9,0.96)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,132,151,0.18)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,49,95,0.15)';
        ctx.fillRect(x + 22 * m.scale, y + 15 * m.scale, w - 44 * m.scale, 3 * m.scale);
        for (let i = 0; i < 4; i++) {
            this._drawFastener(ctx, x + 22 * m.scale + i * (w - 44 * m.scale) / 3, y + 16.5 * m.scale, 2.6 * m.scale);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FF7087';
        ctx.shadowColor = '#FF315F';
        ctx.shadowBlur = 8 * m.scale;
        ctx.font = 'bold ' + Math.round(23 * m.scale) + 'px ' + font;
        ctx.fillText('ENGINE TRACE BREACH', x + w * 0.5, y + 47 * m.scale);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#CFE5EA';
        ctx.font = 'bold ' + Math.round(9.6 * m.scale) + 'px ' + font;
        ctx.fillText('APEX completed the trace before the host-capacity bypass was stabilized.', x + w * 0.5, y + 79 * m.scale);

        const bayX = x + 34 * m.scale;
        const bayY = y + 100 * m.scale;
        const bayW = w - 68 * m.scale;
        const bayH = 142 * m.scale;
        this._chamferPath(ctx, bayX, bayY, bayW, bayH, 8 * m.scale);
        const bay = ctx.createLinearGradient(bayX, bayY, bayX, bayY + bayH);
        bay.addColorStop(0, 'rgba(14,20,24,0.95)');
        bay.addColorStop(0.10, 'rgba(3,9,12,0.96)');
        bay.addColorStop(1, 'rgba(2,6,9,0.98)');
        ctx.fillStyle = bay;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,103,126,0.34)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();

        ctx.textAlign = 'left';
        const tx = bayX + 22 * m.scale;
        const contentW = bayW - 44 * m.scale;

        ctx.fillStyle = '#86A8B0';
        ctx.font = 'bold ' + Math.round(7.4 * m.scale) + 'px ' + font;
        ctx.fillText('CORRECT HOST-CAPACITY ROUTE', tx, bayY + 20 * m.scale);

        const answerScreenX = tx;
        const answerScreenY = bayY + 31 * m.scale;
        const answerScreenW = contentW;
        const answerScreenH = 44 * m.scale;
        this._chamferPath(ctx, answerScreenX, answerScreenY, answerScreenW, answerScreenH, 7 * m.scale);
        ctx.fillStyle = 'rgba(3,8,11,0.98)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,90,0.28)';
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(16 * m.scale) + 'px ' + font;
        ctx.fillText(this._formatNumber(this.scenario.requiredHosts) + ' usable hosts  ->  h = ' + target, tx + 12 * m.scale, answerScreenY + 15 * m.scale);

        ctx.fillStyle = '#FFD65A';
        ctx.font = 'bold ' + Math.round(11 * m.scale) + 'px ' + font;
        ctx.fillText('2^' + target + ' = ' + this._formatNumber(this.scenario.totalAddresses) + ' addresses  //  ' + this._formatNumber(this.scenario.totalAddresses) + ' - 2 = ' + this._formatNumber(this.scenario.usableHosts) + ' usable', tx + 12 * m.scale, answerScreenY + 31 * m.scale);

        let diagnosis;
        if (difference < 0) {
            diagnosis = 'Collected h = ' + this.exponent + ' was too low. You needed ' + Math.abs(difference) + ' more host bit' + (Math.abs(difference) === 1 ? '' : 's') + ' before calculating.';
        } else if (difference > 0) {
            diagnosis = 'Collected h = ' + this.exponent + ' exceeded the smallest valid power by ' + difference + ' host bit' + (difference === 1 ? '' : 's') + '. Use a broken cell to reduce the input.';
        } else {
            diagnosis = 'You reached the correct h = ' + this.exponent + ', but APEX completed the trace before the engine finished stabilizing.';
        }

        ctx.fillStyle = difference === 0 ? '#68FFB5' : '#FF758D';
        ctx.font = 'bold ' + Math.round(10.5 * m.scale) + 'px ' + font;
        ctx.fillText(diagnosis, tx, bayY + 98 * m.scale);

        ctx.fillStyle = '#A6C5CC';
        ctx.font = 'bold ' + Math.round(8.2 * m.scale) + 'px ' + font;
        ctx.fillText('Your current h = ' + this.exponent + ' represents 2^' + this.exponent + ' - 2 = ' + this._formatNumber(current.usableHosts) + ' usable hosts.', tx, bayY + 122 * m.scale);

        ctx.textAlign = 'center';
        const pulse = 0.62 + 0.38 * Math.sin(this.animTick * 0.12);
        ctx.fillStyle = 'rgba(235,252,255,' + (0.70 + pulse * 0.24) + ')';
        ctx.font = 'bold ' + Math.round(10.3 * m.scale) + 'px ' + font;
        ctx.fillText('PRESS SPACE / ENTER TO CONTINUE', x + w * 0.5, y + h - 48 * m.scale);

        ctx.fillStyle = 'rgba(124,165,173,0.72)';
        ctx.font = 'bold ' + Math.round(6.4 * m.scale) + 'px ' + font;
        ctx.fillText('RETURNING TO THE INFILTRATION ROUTE', x + w * 0.5, y + h - 24 * m.scale);

        ctx.restore();
    }


    _buildFailureButtons(m, card) {
        // Timeout failure now uses a single keyboard/mouse continuation state.
        // Keeping this method as a no-op preserves compatibility with any older
        // code that still calls it.
        this.buttons = [];
        return this.buttons;
    }

    _drawButton(ctx, button, m) {
        const font = this._uiFont();

        this._roundedRect(ctx, button.x, button.y, button.w, button.h, 5 * m.scale);
        ctx.fillStyle = button.action === 'retry' ? 'rgba(0, 105, 119, 0.9)' : 'rgba(91, 18, 36, 0.9)';
        ctx.fill();
        ctx.strokeStyle = button.action === 'retry' ? '#5eefff' : '#ff526e';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.stroke();

        ctx.fillStyle = '#f1fcff';
        ctx.font = 'bold ' + Math.round(10 * m.scale) + 'px ' + font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(button.label, button.x + button.w * 0.5, button.y + button.h * 0.5);
    }

    _drawStatusChip(ctx, rightX, y, label, color, m) {
        const text = String(label || '');
        const font = this._uiFont();

        ctx.save();
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px ' + font;

        const w = Math.max(68 * m.scale, ctx.measureText(text).width + 20 * m.scale);
        const h = 20 * m.scale;
        const x = rightX - w;

        this._chamferPath(ctx, x, y, w, h, 5 * m.scale);
        ctx.fillStyle = 'rgba(3, 8, 13, 0.94)';
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.62;
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w * 0.5, y + h * 0.54);
        ctx.restore();

        return x;
    }

    _drawFastener(ctx, x, y, radius) {
        const r = Math.max(2, Number(radius) || 3);
        ctx.save();
        const metal = ctx.createRadialGradient(x - r * 0.32, y - r * 0.32, r * 0.15, x, y, r);
        metal.addColorStop(0, '#d4e1e7');
        metal.addColorStop(0.34, '#62717a');
        metal.addColorStop(0.7, '#182129');
        metal.addColorStop(1, '#05080b');
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(206, 231, 240, 0.24)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.strokeStyle = '#071016';
        ctx.beginPath();
        ctx.moveTo(x - r * 0.48, y + r * 0.18);
        ctx.lineTo(x + r * 0.48, y - r * 0.18);
        ctx.stroke();
        ctx.restore();
    }


    _uiFont() {
        return 'Oxanium-Medium, Oxanium, monospace';
    }

    _remainingMs(nowValue) {
        const numericNow = Number(nowValue);
        const now = Number.isFinite(numericNow) ? numericNow : Date.now();

        if (this.roundState === 'ready' || this.roundState === 'tutorial' || !this.endsAt) {
            return this.durationMs;
        }

        return Math.max(0, this.endsAt - now);
    }

    _timeRatio(nowValue) {
        return Math.max(0, Math.min(1, this._remainingMs(nowValue) / Math.max(1, this.durationMs)));
    }

    _criticalWarningIntensity(nowValue) {
        if (this.roundState !== 'active' || !this.endsAt) return 0;

        const remainingSeconds = this._remainingMs(nowValue) / 1000;
        if (remainingSeconds > 20) return 0;

        const urgency = Math.max(0, Math.min(1, (20 - remainingSeconds) / 20));
        const blink = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((Number(nowValue) || Date.now()) * 0.020 + urgency * 2.6));

        return urgency * (0.46 + blink * 0.54);
    }

    _drawEngineAssembly(ctx, layout, m) {
        const engine = layout.engine;
        const glass = layout.glass;
        const font = this._uiFont();
        const checked = this.calculatedEvaluation;
        const overload = !!(checked && checked.status === 'over');
        const timeRatio = this._timeRatio(Date.now());
        const traceRatio = 1 - timeRatio;
        const fillRatio = Math.max(0, Math.min(1, Number(this.engineFillRatioDisplayed) || 0));
        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.08);

        ctx.save();

        // Deep cast-metal reactor housing.
        ctx.shadowColor = 'rgba(0,0,0,0.88)';
        ctx.shadowBlur = 22 * m.scale;
        ctx.shadowOffsetY = 7 * m.scale;
        this._roundedRect(ctx, engine.x, engine.y, engine.w, engine.h, 11 * m.scale);
        const shell = ctx.createLinearGradient(engine.x, engine.y, engine.x + engine.w, engine.y + engine.h);
        shell.addColorStop(0, '#33434a');
        shell.addColorStop(0.035, '#111a20');
        shell.addColorStop(0.18, '#050a0e');
        shell.addColorStop(0.52, '#101a20');
        shell.addColorStop(0.82, '#05090c');
        shell.addColorStop(0.97, '#263940');
        shell.addColorStop(1, '#506067');
        ctx.fillStyle = shell;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(130, 200, 210, 0.52)';
        ctx.lineWidth = 1.3 * m.scale;
        ctx.stroke();

        // Brushed-metal texture and recessed bands.
        ctx.save();
        this._roundedRect(ctx, engine.x + 5 * m.scale, engine.y + 5 * m.scale, engine.w - 10 * m.scale, engine.h - 10 * m.scale, 9 * m.scale);
        ctx.clip();
        for (let y = engine.y + 7 * m.scale; y < engine.y + engine.h - 7 * m.scale; y += 7 * m.scale) {
            const alpha = 0.025 + ((Math.floor(y / (7 * m.scale)) % 3) * 0.012);
            ctx.strokeStyle = 'rgba(190,220,225,' + alpha + ')';
            ctx.lineWidth = 0.6 * m.scale;
            ctx.beginPath();
            ctx.moveTo(engine.x + 10 * m.scale, y);
            ctx.lineTo(engine.x + engine.w - 10 * m.scale, y + Math.sin(y * 0.04) * 1.2 * m.scale);
            ctx.stroke();
        }
        ctx.restore();

        // Heavy side rails.
        const railW = 13 * m.scale;
        const railInset = 18 * m.scale;
        [engine.x + railInset, engine.x + engine.w - railInset - railW].forEach((rx) => {
            const rail = ctx.createLinearGradient(rx, 0, rx + railW, 0);
            rail.addColorStop(0, '#020405');
            rail.addColorStop(0.32, '#68757a');
            rail.addColorStop(0.52, '#c1c9cb');
            rail.addColorStop(0.72, '#404c51');
            rail.addColorStop(1, '#020405');
            ctx.fillStyle = rail;
            ctx.fillRect(rx, engine.y + 40 * m.scale, railW, engine.h - 54 * m.scale);
        });

        for (let i = 0; i < 4; i++) {
            const boltY = engine.y + 24 * m.scale + i * (engine.h - 48 * m.scale) / 3;
            this._drawFastener(ctx, engine.x + 10 * m.scale, boltY, 3.4 * m.scale);
            this._drawFastener(ctx, engine.x + engine.w - 10 * m.scale, boltY, 3.4 * m.scale);
        }

        ctx.fillStyle = '#90aeb6';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px ' + font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('APEX BYPASS ENGINE // ENERGY REACTOR', engine.x + 18 * m.scale, engine.y + 18 * m.scale);

        const remainingSeconds = Math.ceil(this._remainingMs(Date.now()) / 1000);
        const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
        const ss = String(remainingSeconds % 60).padStart(2, '0');
        ctx.textAlign = 'right';
        ctx.fillStyle = remainingSeconds <= 20 ? '#ff5d72' : '#ffc94f';
        ctx.font = 'bold ' + Math.round(10 * m.scale) + 'px ' + font;
        ctx.fillText('APEX TRACE ' + mm + ':' + ss, engine.x + engine.w - 18 * m.scale, engine.y + 18 * m.scale);

        // The trace coolant now RISES bottom -> top as APEX gets closer.
        this._drawThermalColumn(ctx, layout.leftGauge, m, traceRatio, true);
        this._drawThermalColumn(ctx, layout.rightGauge, m, traceRatio, false);

        // Glass chamber outer frame.
        ctx.shadowColor = overload ? '#ff315f' : '#1fd8d0';
        ctx.shadowBlur = (overload ? 16 : 8) * m.scale;
        this._roundedRect(ctx, glass.x - 5 * m.scale, glass.y - 5 * m.scale, glass.w + 10 * m.scale, glass.h + 10 * m.scale, 20 * m.scale);
        const bezel = ctx.createLinearGradient(glass.x, glass.y, glass.x + glass.w, glass.y + glass.h);
        bezel.addColorStop(0, overload ? '#8b1832' : '#1e7776');
        bezel.addColorStop(0.18, '#071116');
        bezel.addColorStop(0.78, '#061016');
        bezel.addColorStop(1, overload ? '#5e0c20' : '#135e61');
        ctx.fillStyle = bezel;
        ctx.fill();
        ctx.shadowBlur = 0;

        this._roundedRect(ctx, glass.x, glass.y, glass.w, glass.h, 17 * m.scale);
        const glassFill = ctx.createLinearGradient(glass.x, glass.y, glass.x + glass.w, glass.y + glass.h);
        glassFill.addColorStop(0, 'rgba(12, 43, 50, 0.78)');
        glassFill.addColorStop(0.28, 'rgba(3, 17, 23, 0.74)');
        glassFill.addColorStop(0.64, 'rgba(3, 21, 24, 0.74)');
        glassFill.addColorStop(1, 'rgba(6, 39, 33, 0.82)');
        ctx.fillStyle = glassFill;
        ctx.fill();
        ctx.strokeStyle = overload ? 'rgba(255,68,96,0.94)' : 'rgba(86,239,229,0.62)';
        ctx.lineWidth = 1.55 * m.scale;
        ctx.stroke();

        ctx.save();
        this._roundedRect(ctx, glass.x + 5 * m.scale, glass.y + 5 * m.scale, glass.w - 10 * m.scale, glass.h - 10 * m.scale, 14 * m.scale);
        ctx.clip();

        // Dark chamber texture visible before the first calculation.
        for (let i = 0; i < 14; i++) {
            const yy = glass.y + 20 * m.scale + i * (glass.h - 40 * m.scale) / 13;
            ctx.strokeStyle = 'rgba(92,168,176,' + (0.025 + (i % 3) * 0.012) + ')';
            ctx.lineWidth = 0.7 * m.scale;
            ctx.beginPath();
            ctx.moveTo(glass.x + 12 * m.scale, yy);
            ctx.lineTo(glass.x + glass.w - 12 * m.scale, yy);
            ctx.stroke();
        }

        const fillH = Math.max(0, glass.h * fillRatio);
        const fillY = glass.y + glass.h - fillH;

        if (fillH > 0) {
            // Multi-layer translucent energy fluid.
            const energy = ctx.createLinearGradient(0, fillY, 0, glass.y + glass.h);
            if (overload) {
                energy.addColorStop(0, 'rgba(255,55,91,0.58)');
                energy.addColorStop(0.30, 'rgba(255,80,58,0.52)');
                energy.addColorStop(0.68, 'rgba(245,130,44,0.48)');
                energy.addColorStop(1, 'rgba(105,9,27,0.74)');
            } else {
                energy.addColorStop(0, 'rgba(69,255,191,0.56)');
                energy.addColorStop(0.30, 'rgba(29,226,196,0.54)');
                energy.addColorStop(0.68, 'rgba(24,151,205,0.50)');
                energy.addColorStop(1, 'rgba(13,73,141,0.66)');
            }
            ctx.fillStyle = energy;
            ctx.fillRect(glass.x, fillY, glass.w, fillH);

            // Subsurface turbulence bands.
            for (let band = 0; band < 7; band++) {
                const bandY = fillY + fillH * ((band + 0.55) / 7);
                const bandGrad = ctx.createLinearGradient(glass.x, bandY, glass.x + glass.w, bandY);
                bandGrad.addColorStop(0, 'rgba(255,255,255,0)');
                bandGrad.addColorStop(0.30, overload ? 'rgba(255,210,111,0.08)' : 'rgba(122,255,234,0.08)');
                bandGrad.addColorStop(0.62, overload ? 'rgba(255,104,77,0.12)' : 'rgba(62,190,255,0.10)');
                bandGrad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.strokeStyle = bandGrad;
                ctx.lineWidth = (1.2 + (band % 2) * 0.8) * m.scale;
                ctx.beginPath();
                for (let i = 0; i <= 24; i++) {
                    const px = glass.x + glass.w * (i / 24);
                    const py = bandY + Math.sin(i * 0.72 + this.animTick * (0.05 + band * 0.004) + band) * (2 + band * 0.22) * m.scale;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }

            // Bright fluid surface and refracted secondary edge.
            const waveY = fillY + Math.sin(this.animTick * 0.09) * 2.5 * m.scale;
            ctx.shadowColor = overload ? '#ff526d' : '#6dffdc';
            ctx.shadowBlur = 10 * m.scale;
            ctx.strokeStyle = overload ? '#ff7588' : '#8affdf';
            ctx.lineWidth = 1.9 * m.scale;
            ctx.beginPath();
            for (let i = 0; i <= 30; i++) {
                const px = glass.x + glass.w * (i / 30);
                const py = waveY + Math.sin(i * 0.68 + this.animTick * 0.12) * 2.4 * m.scale + Math.sin(i * 1.73 + this.animTick * 0.07) * 1.2 * m.scale;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.strokeStyle = overload ? 'rgba(255,193,119,0.30)' : 'rgba(189,255,245,0.30)';
            ctx.lineWidth = 0.9 * m.scale;
            ctx.beginPath();
            ctx.moveTo(glass.x, waveY + 5 * m.scale);
            ctx.lineTo(glass.x + glass.w, waveY + 5 * m.scale);
            ctx.stroke();
        }

        this._drawEngineParticles(ctx, glass, fillRatio, overload, m);

        // Static glass sheen. The old moving vertical reflection was removed
        // because it read as an unrelated scanning line rather than glass.
        const sheen = ctx.createLinearGradient(
            glass.x,
            glass.y,
            glass.x + glass.w * 0.62,
            glass.y + glass.h * 0.40
        );
        sheen.addColorStop(0, 'rgba(240,255,255,0.10)');
        sheen.addColorStop(0.16, 'rgba(240,255,255,0.028)');
        sheen.addColorStop(0.38, 'rgba(240,255,255,0)');
        sheen.addColorStop(1, 'rgba(240,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.moveTo(glass.x + 10 * m.scale, glass.y + 9 * m.scale);
        ctx.lineTo(glass.x + glass.w * 0.48, glass.y + 9 * m.scale);
        ctx.lineTo(glass.x + glass.w * 0.26, glass.y + glass.h * 0.24);
        ctx.lineTo(glass.x + 10 * m.scale, glass.y + glass.h * 0.37);
        ctx.closePath();
        ctx.fill();

        // Static bevel reflection.
        const rim = ctx.createLinearGradient(glass.x, glass.y, glass.x + glass.w * 0.55, glass.y + glass.h * 0.45);
        rim.addColorStop(0, 'rgba(240,255,255,0.17)');
        rim.addColorStop(0.18, 'rgba(240,255,255,0.03)');
        rim.addColorStop(0.56, 'rgba(240,255,255,0)');
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.moveTo(glass.x + 14 * m.scale, glass.y + 10 * m.scale);
        ctx.lineTo(glass.x + glass.w * 0.42, glass.y + 10 * m.scale);
        ctx.lineTo(glass.x + glass.w * 0.22, glass.y + glass.h * 0.24);
        ctx.lineTo(glass.x + 10 * m.scale, glass.y + glass.h * 0.38);
        ctx.closePath();
        ctx.fill();

        // Reinforced glass corner clamps add the same layered mechanical depth
        // used by the IP Wires terminal housings.
        const clampLen = 23 * m.scale;
        const clampInset = 5 * m.scale;
        const clampColor = overload ? 'rgba(255,80,103,0.72)' : 'rgba(102,225,225,0.48)';
        ctx.strokeStyle = clampColor;
        ctx.lineWidth = 2 * m.scale;

        const corners = [
            { x: glass.x + clampInset, y: glass.y + clampInset, sx: 1, sy: 1 },
            { x: glass.x + glass.w - clampInset, y: glass.y + clampInset, sx: -1, sy: 1 },
            { x: glass.x + clampInset, y: glass.y + glass.h - clampInset, sx: 1, sy: -1 },
            { x: glass.x + glass.w - clampInset, y: glass.y + glass.h - clampInset, sx: -1, sy: -1 },
        ];

        for (let i = 0; i < corners.length; i++) {
            const c = corners[i];
            ctx.beginPath();
            ctx.moveTo(c.x, c.y + c.sy * clampLen);
            ctx.lineTo(c.x, c.y);
            ctx.lineTo(c.x + c.sx * clampLen, c.y);
            ctx.stroke();
        }

        ctx.restore();

        // Engine ribs and service markings above the glass.
        const ribCount = 6;
        for (let i = 0; i < ribCount; i++) {
            const y = glass.y + glass.h * ((i + 1) / (ribCount + 1));
            ctx.strokeStyle = 'rgba(150, 223, 221, 0.075)';
            ctx.lineWidth = 1 * m.scale;
            ctx.beginPath();
            ctx.moveTo(glass.x + 9 * m.scale, y);
            ctx.lineTo(glass.x + glass.w - 9 * m.scale, y);
            ctx.stroke();
        }

        // Calculation pulse around the chamber.
        if (Number.isFinite(this.engineCalculationPulseStartedAt)) {
            const age = Date.now() - this.engineCalculationPulseStartedAt;
            if (age < 900) {
                const q = 1 - age / 900;
                ctx.strokeStyle = overload
                    ? 'rgba(255,80,103,' + (q * 0.55) + ')'
                    : 'rgba(93,255,222,' + (q * 0.55) + ')';
                ctx.lineWidth = (1 + q * 4) * m.scale;
                ctx.shadowColor = overload ? '#ff315f' : '#58ffda';
                ctx.shadowBlur = q * 22 * m.scale;
                this._roundedRect(ctx, glass.x - 3 * m.scale, glass.y - 3 * m.scale, glass.w + 6 * m.scale, glass.h + 6 * m.scale, 19 * m.scale);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        // Bottom service rail beneath the glass, echoing Gameplay 1's routing bus.
        const serviceY = glass.y + glass.h - 18 * m.scale;
        this._chamferPath(
            ctx,
            glass.x + 16 * m.scale,
            serviceY,
            glass.w - 32 * m.scale,
            12 * m.scale,
            4 * m.scale
        );
        ctx.fillStyle = 'rgba(1,7,10,0.42)';
        ctx.fill();
        ctx.strokeStyle = overload ? 'rgba(255,49,95,0.12)' : 'rgba(0,240,255,0.11)';
        ctx.lineWidth = 0.7 * m.scale;
        ctx.stroke();

        for (let i = 0; i < 7; i++) {
            const bx = glass.x + 28 * m.scale + i * (glass.w - 56 * m.scale) / 6;
            ctx.fillStyle = i <= Math.floor((this.animTick * 0.035) % 8)
                ? (overload ? 'rgba(255,82,96,0.36)' : 'rgba(82,255,217,0.30)')
                : 'rgba(81,103,111,0.16)';
            ctx.fillRect(bx, serviceY + 4.5 * m.scale, 10 * m.scale, 2.3 * m.scale);
        }

        this._drawNeededPlaque(ctx, layout.needed, m);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px ' + font;
        const calculationStale = !!(checked && checked.exponent !== this.exponent);
        if (!checked) {
            ctx.fillStyle = '#75a7af';
            ctx.fillText('ENERGY LOAD UNVERIFIED // PRESS CALCULATE', glass.x + glass.w * 0.5, glass.y + glass.h - 16 * m.scale);
        } else if (calculationStale) {
            ctx.fillStyle = '#75a7af';
            ctx.fillText('NEW ENERGY INPUT DETECTED // PRESS CALCULATE', glass.x + glass.w * 0.5, glass.y + glass.h - 16 * m.scale);
        } else if (checked.status === 'under') {
            ctx.fillStyle = '#ffd05e';
            ctx.fillText('INSUFFICIENT ENGINE LOAD // COLLECT MORE ENERGY', glass.x + glass.w * 0.5, glass.y + glass.h - 16 * m.scale);
        } else if (checked.status === 'just-right') {
            ctx.fillStyle = '#71ffb2';
            ctx.fillText('OPTIMAL ENGINE LOAD // BYPASS STABILIZING', glass.x + glass.w * 0.5, glass.y + glass.h - 16 * m.scale);
        }

        ctx.restore();
    }

    _drawThermalColumn(ctx, box, m, ratio, mirror) {
        const font = this._uiFont();
        const level = Math.max(0, Math.min(1, Number(ratio) || 0));
        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.11 + (mirror ? 0 : 1.4));

        ctx.save();

        // Tube housing.
        ctx.shadowColor = 'rgba(0,0,0,0.80)';
        ctx.shadowBlur = 8 * m.scale;
        this._roundedRect(ctx, box.x, box.y, box.w, box.h, box.w * 0.38);
        const housing = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
        housing.addColorStop(0, '#10171a');
        housing.addColorStop(0.18, '#546166');
        housing.addColorStop(0.38, '#10191d');
        housing.addColorStop(0.72, '#26353a');
        housing.addColorStop(1, '#05090b');
        ctx.fillStyle = housing;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(175, 206, 211, 0.46)';
        ctx.lineWidth = 1.1 * m.scale;
        ctx.stroke();

        const inset = 6 * m.scale;
        const innerX = box.x + inset;
        const innerY = box.y + inset;
        const innerW = box.w - inset * 2;
        const innerH = box.h - inset * 2;
        const fillH = Math.max(0, innerH * level);
        const fillY = innerY + innerH - fillH;

        this._roundedRect(ctx, innerX, innerY, innerW, innerH, innerW * 0.42);
        const emptyGlass = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY);
        emptyGlass.addColorStop(0, 'rgba(2,5,6,0.92)');
        emptyGlass.addColorStop(0.46, 'rgba(31,25,4,0.35)');
        emptyGlass.addColorStop(0.68, 'rgba(7,8,5,0.64)');
        emptyGlass.addColorStop(1, 'rgba(1,4,5,0.95)');
        ctx.fillStyle = emptyGlass;
        ctx.fill();

        if (fillH > 0) {
            ctx.save();
            this._roundedRect(ctx, innerX, innerY, innerW, innerH, innerW * 0.42);
            ctx.clip();

            // Rising trace fluid: yellow at the bottom, orange in the body,
            // red toward the top. The level itself rises bottom -> top.
            const heat = ctx.createLinearGradient(0, innerY + innerH, 0, innerY);
            heat.addColorStop(0, '#ffe75c');
            heat.addColorStop(0.38, '#ffc13f');
            heat.addColorStop(0.67, '#ff7b32');
            heat.addColorStop(0.86, '#ff493f');
            heat.addColorStop(1, '#ff234f');
            ctx.globalAlpha = 0.80 + pulse * 0.12;
            ctx.fillStyle = heat;
            ctx.fillRect(innerX, fillY, innerW, fillH);
            ctx.globalAlpha = 1;

            // Dense internal heat texture.
            for (let i = 0; i < 14; i++) {
                const seed = i * 29 + (mirror ? 71 : 17);
                const px = innerX + innerW * (0.12 + ((seed * 0.173) % 0.76));
                const travel = Math.max(1, fillH - 3 * m.scale);
                const py = innerY + innerH - ((this.animTick * (0.58 + (i % 5) * 0.055) + seed * 2.9) % travel);
                if (py < fillY) continue;
                const br = (1.0 + (i % 4) * 0.58) * m.scale;
                ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,205,0.56)' : 'rgba(255,170,78,0.34)';
                ctx.beginPath();
                ctx.arc(px, py, br, 0, Math.PI * 2);
                ctx.fill();
                if (i % 4 === 0) {
                    ctx.strokeStyle = 'rgba(255,255,223,0.38)';
                    ctx.lineWidth = 0.7 * m.scale;
                    ctx.beginPath();
                    ctx.arc(px, py, br * 1.8, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            // Animated fluid surface.
            ctx.shadowColor = level > 0.82 ? '#ff315f' : '#ffd94d';
            ctx.shadowBlur = (4 + level * 9) * m.scale;
            ctx.strokeStyle = level > 0.82 ? '#ff7486' : '#fff09a';
            ctx.lineWidth = 1.2 * m.scale;
            ctx.beginPath();
            for (let i = 0; i <= 8; i++) {
                const px = innerX + innerW * (i / 8);
                const py = fillY + Math.sin(i * 1.2 + this.animTick * 0.13) * 1.4 * m.scale;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Tube glass reflection.
            const gloss = ctx.createLinearGradient(innerX, 0, innerX + innerW, 0);
            gloss.addColorStop(0, 'rgba(255,255,255,0.02)');
            gloss.addColorStop(0.24, 'rgba(255,255,255,0.19)');
            gloss.addColorStop(0.38, 'rgba(255,255,255,0.035)');
            gloss.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gloss;
            ctx.fillRect(innerX, innerY, innerW, innerH);

            ctx.restore();
        }

        // Tube scale marks.
        for (let i = 1; i < 10; i++) {
            const yy = innerY + innerH * (i / 10);
            ctx.strokeStyle = 'rgba(255,229,126,' + (i % 5 === 0 ? 0.42 : 0.18) + ')';
            ctx.lineWidth = (i % 5 === 0 ? 1.2 : 0.7) * m.scale;
            ctx.beginPath();
            ctx.moveTo(innerX + innerW * 0.64, yy);
            ctx.lineTo(innerX + innerW * 0.90, yy);
            ctx.stroke();
        }

        ctx.fillStyle = level > 0.78 ? '#ff6a65' : '#ffcf51';
        ctx.font = 'bold ' + Math.max(5, Math.round(5.5 * m.scale)) + 'px ' + font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.translate(box.x + box.w * 0.5, box.y + box.h * 0.5);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('APEX TRACE FLUID', 0, 0);
        ctx.restore();

        ctx.restore();
    }

    _drawEngineParticles(ctx, glass, fillRatio, overload, m) {
        if (fillRatio <= 0) return;

        const activeHeight = glass.h * fillRatio;
        const floorY = glass.y + glass.h;
        const topY = floorY - activeHeight;

        ctx.save();

        // Floating energy motes, bars, rings and micro-bubbles inside the reactor.
        for (let i = 0; i < 38; i++) {
            const seed = i * 61 + 11;
            const px = glass.x + 14 * m.scale + ((seed * 17.13) % Math.max(1, glass.w - 28 * m.scale));
            const travel = Math.max(1, activeHeight - 10 * m.scale);
            const py = floorY - ((this.animTick * (0.26 + (i % 7) * 0.045) + seed * 3.2) % travel);
            if (py < topY || py > floorY) continue;

            const size = (1.0 + (i % 5) * 0.55) * m.scale;
            const alpha = 0.24 + (i % 4) * 0.08;
            const color = overload
                ? (i % 3 === 0 ? '255,220,108' : '255,102,77')
                : (i % 3 === 0 ? '79,178,255' : '86,255,196');

            ctx.fillStyle = 'rgba(' + color + ',' + alpha + ')';
            if (i % 4 === 0) {
                ctx.fillRect(px, py, size * 2.8, size * 0.75);
            } else if (i % 4 === 1) {
                ctx.strokeStyle = 'rgba(' + color + ',' + (alpha + 0.12) + ')';
                ctx.lineWidth = 0.8 * m.scale;
                ctx.beginPath();
                ctx.arc(px, py, size * 1.5, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Slow electrical filaments inside the active fluid.
        for (let line = 0; line < 5; line++) {
            const baseY = topY + activeHeight * ((line + 1) / 6);
            ctx.strokeStyle = overload
                ? 'rgba(255,184,104,' + (0.08 + line * 0.015) + ')'
                : 'rgba(105,255,225,' + (0.07 + line * 0.014) + ')';
            ctx.lineWidth = 0.8 * m.scale;
            ctx.beginPath();
            for (let p = 0; p <= 18; p++) {
                const px = glass.x + glass.w * (p / 18);
                const py = baseY + Math.sin(p * 1.24 + line * 2.1 + this.animTick * 0.035) * 4 * m.scale;
                if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    _drawNeededPlaque(ctx, box, m) {
        const font = this._uiFont();
        const notice = this.engineNotice;
        const now = Date.now();
        let noticeAlpha = 0;

        if (notice && Number(notice.startedAt)) {
            const elapsed = now - notice.startedAt;
            const duration = Math.max(1, Number(notice.durationMs) || 2000);
            if (elapsed >= 0 && elapsed < duration) {
                const fadeIn = Math.min(1, elapsed / 220);
                const fadeOut = Math.min(1, (duration - elapsed) / 520);
                noticeAlpha = Math.max(0, Math.min(1, fadeIn, fadeOut));
            } else if (elapsed >= duration) {
                this.engineNotice = null;
            }
        }

        ctx.save();

        ctx.shadowColor = 'rgba(0,0,0,0.78)';
        ctx.shadowBlur = 12 * m.scale;
        ctx.shadowOffsetY = 4 * m.scale;
        this._chamferPath(ctx, box.x, box.y, box.w, box.h, 10 * m.scale);
        const metal = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
        metal.addColorStop(0, '#46535a');
        metal.addColorStop(0.13, '#11191e');
        metal.addColorStop(0.55, '#202c32');
        metal.addColorStop(0.88, '#0c1216');
        metal.addColorStop(1, '#526168');
        ctx.fillStyle = metal;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = noticeAlpha > 0 ? 'rgba(255,92,116,' + (0.45 + noticeAlpha * 0.55) + ')' : '#ffd34f';
        ctx.lineWidth = (noticeAlpha > 0 ? 1.8 : 1.2) * m.scale;
        ctx.stroke();

        this._drawFastener(ctx, box.x + 8 * m.scale, box.y + 8 * m.scale, 2.6 * m.scale);
        this._drawFastener(ctx, box.x + box.w - 8 * m.scale, box.y + 8 * m.scale, 2.6 * m.scale);
        this._drawFastener(ctx, box.x + 8 * m.scale, box.y + box.h - 8 * m.scale, 2.6 * m.scale);
        this._drawFastener(ctx, box.x + box.w - 8 * m.scale, box.y + box.h - 8 * m.scale, 2.6 * m.scale);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffdf65';
        ctx.font = 'bold ' + Math.round(7.5 * m.scale) + 'px ' + font;
        ctx.fillText('HOSTS NEEDED', box.x + box.w * 0.5, box.y + 15 * m.scale);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + Math.round(27 * m.scale) + 'px ' + font;
        ctx.fillText(this._formatNumber(this.scenario.requiredHosts), box.x + box.w * 0.5, box.y + box.h * 0.55);

        if (noticeAlpha > 0) {
            const bandH = 18 * m.scale;
            const bandX = box.x + 16 * m.scale;
            const bandY = box.y + box.h - bandH - 6 * m.scale;
            const bandW = box.w - 32 * m.scale;
            this._chamferPath(ctx, bandX, bandY, bandW, bandH, 4 * m.scale);
            ctx.fillStyle = 'rgba(86,5,22,' + (0.50 + noticeAlpha * 0.34) + ')';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,92,116,' + (0.32 + noticeAlpha * 0.58) + ')';
            ctx.lineWidth = 1 * m.scale;
            ctx.stroke();

            ctx.globalAlpha = noticeAlpha;
            ctx.fillStyle = notice.color || '#FF5C74';
            ctx.font = 'bold ' + Math.round(7.2 * m.scale) + 'px ' + font;
            ctx.fillText(notice.text || 'ENERGY INPUT OVERLOAD', box.x + box.w * 0.5, bandY + bandH * 0.52);
            ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = 'rgba(194,219,224,0.72)';
            ctx.font = 'bold ' + Math.round(6.5 * m.scale) + 'px ' + font;
            ctx.fillText('+2 RESERVED ADDRESSES REQUIRED', box.x + box.w * 0.5, box.y + box.h - 10 * m.scale);
        }

        ctx.restore();
    }



    _drawEngineControls(ctx, box, m) {
        const font = this._uiFont();
        const button = this._calculateButtonRect(m);
        const checked = this.calculatedEvaluation;
        const stale = !!(checked && checked.exponent !== this.exponent);
        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.09);
        const numberPulse = this.exponentPulseUntil > Date.now()
            ? 1 + (this.exponentPulseUntil - Date.now()) / 280 * 0.08
            : 1;
        const outputPulse = this.outputPulseUntil > Date.now()
            ? 1 + (this.outputPulseUntil - Date.now()) / 380 * 0.04
            : 1;

        ctx.save();

        ctx.shadowColor = 'rgba(0,0,0,0.90)';
        ctx.shadowBlur = 18 * m.scale;
        ctx.shadowOffsetY = 7 * m.scale;
        this._chamferPath(ctx, box.x, box.y, box.w, box.h, 11 * m.scale);
        const shell = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
        shell.addColorStop(0, '#3A4950');
        shell.addColorStop(0.035, '#10171C');
        shell.addColorStop(0.22, '#060A0D');
        shell.addColorStop(0.76, '#0B1216');
        shell.addColorStop(0.965, '#26363C');
        shell.addColorStop(1, '#56656B');
        ctx.fillStyle = shell;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(145,207,214,0.46)';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.stroke();

        const inset = 6 * m.scale;
        this._chamferPath(ctx, box.x + inset, box.y + inset, box.w - inset * 2, box.h - inset * 2, 8 * m.scale);
        const deck = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
        deck.addColorStop(0, 'rgba(8,17,21,0.98)');
        deck.addColorStop(0.52, 'rgba(2,6,9,0.995)');
        deck.addColorStop(1, 'rgba(7,15,18,0.99)');
        ctx.fillStyle = deck;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.11)';
        ctx.lineWidth = 0.9 * m.scale;
        ctx.stroke();

        const moduleY = box.y + 14 * m.scale;
        const moduleH = box.h - 28 * m.scale;
        const buttonGap = 16 * m.scale;
        const contentLeft = box.x + 16 * m.scale;
        const contentRight = button.x - buttonGap;
        const availableW = Math.max(1, contentRight - contentLeft);
        const moduleGap = 14 * m.scale;
        const collectedW = Math.max(205 * m.scale, availableW * 0.30);
        const outputX = contentLeft + collectedW + moduleGap;
        const outputW = Math.max(230 * m.scale, contentRight - outputX);

        const drawModuleFrame = (x, y, w, h, frameAccent) => {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.72)';
            ctx.shadowBlur = 7 * m.scale;
            ctx.shadowOffsetY = 2 * m.scale;
            this._chamferPath(ctx, x, y, w, h, 8 * m.scale);
            const housing = ctx.createLinearGradient(x, y, x, y + h);
            housing.addColorStop(0, '#2B373D');
            housing.addColorStop(0.10, '#0A1014');
            housing.addColorStop(0.50, '#04080B');
            housing.addColorStop(0.92, '#111B20');
            housing.addColorStop(1, '#2E3C42');
            ctx.fillStyle = housing;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = frameAccent;
            ctx.lineWidth = 1.0 * m.scale;
            ctx.globalAlpha = 0.56;
            ctx.stroke();
            ctx.globalAlpha = 1;

            this._chamferPath(ctx, x + 5 * m.scale, y + 5 * m.scale, w - 10 * m.scale, h - 10 * m.scale, 5 * m.scale);
            ctx.fillStyle = 'rgba(1,7,10,0.94)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(155,205,214,0.10)';
            ctx.stroke();

            ctx.fillStyle = frameAccent;
            ctx.globalAlpha = 0.75;
            ctx.fillRect(x + w * 0.5 - 27 * m.scale, y + 8 * m.scale, 54 * m.scale, 2 * m.scale);
            ctx.globalAlpha = 1;
            ctx.restore();
        };

        drawModuleFrame(contentLeft, moduleY, collectedW, moduleH, 'rgba(0,240,255,0.36)');
        const outputFrameColor = !checked
            ? 'rgba(106,154,163,0.28)'
            : checked.status === 'over'
                ? 'rgba(255,49,95,0.54)'
                : checked.status === 'under'
                    ? 'rgba(255,214,77,0.46)'
                    : 'rgba(84,255,187,0.54)';
        drawModuleFrame(outputX, moduleY, outputW, moduleH, outputFrameColor);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // COLLECTED ENERGY — centered label + single digital h readout.
        const collectedCenterX = contentLeft + collectedW * 0.5;
        const collectedPad = 16 * m.scale;
        const collectedDigitalX = contentLeft + collectedPad;
        const collectedDigitalY = moduleY + 28 * m.scale;
        const collectedDigitalW = collectedW - collectedPad * 2;
        const collectedDigitalH = 46 * m.scale;

        ctx.fillStyle = '#7EA9B1';
        ctx.font = 'bold ' + Math.round(7.4 * m.scale) + 'px ' + font;
        ctx.fillText('COLLECTED ENERGY', collectedCenterX, moduleY + 17 * m.scale);

        this._chamferPath(ctx, collectedDigitalX, collectedDigitalY, collectedDigitalW, collectedDigitalH, 6 * m.scale);
        const collectedScreen = ctx.createLinearGradient(collectedDigitalX, collectedDigitalY, collectedDigitalX, collectedDigitalY + collectedDigitalH);
        collectedScreen.addColorStop(0, 'rgba(14,28,34,0.98)');
        collectedScreen.addColorStop(0.52, 'rgba(3,10,13,0.99)');
        collectedScreen.addColorStop(1, 'rgba(5,18,22,0.98)');
        ctx.fillStyle = collectedScreen;
        ctx.fill();
        ctx.strokeStyle = 'rgba(62,230,236,0.28)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();

        ctx.save();
        ctx.translate(collectedCenterX, collectedDigitalY + collectedDigitalH * 0.54);
        ctx.scale(numberPulse, numberPulse);
        ctx.fillStyle = '#EAF8FA';
        ctx.font = 'bold ' + Math.round(24 * m.scale) + 'px ' + font;
        ctx.fillText('h = ' + this.exponent, 0, 0);
        ctx.restore();

        ctx.fillStyle = '#6CA8B0';
        ctx.font = 'bold ' + Math.round(6.2 * m.scale) + 'px ' + font;
        ctx.fillText('HOST-BIT POWER INPUT', collectedCenterX, moduleY + moduleH - 14 * m.scale);

        // CALCULATED OUTPUT — last verified calculation remains frozen until Calculate is pressed again.
        const outputCenterX = outputX + outputW * 0.5;
        const outputPad = 16 * m.scale;
        const outputScreenX = outputX + outputPad;
        const outputScreenY = moduleY + 28 * m.scale;
        const outputScreenW = outputW - outputPad * 2;
        const outputScreenH = 45 * m.scale;

        ctx.fillStyle = '#7EA9B1';
        ctx.font = 'bold ' + Math.round(7.4 * m.scale) + 'px ' + font;
        ctx.fillText('CALCULATED OUTPUT', outputCenterX, moduleY + 17 * m.scale);

        this._chamferPath(ctx, outputScreenX, outputScreenY, outputScreenW, outputScreenH, 6 * m.scale);
        const outScreen = ctx.createLinearGradient(outputScreenX, outputScreenY, outputScreenX, outputScreenY + outputScreenH);
        outScreen.addColorStop(0, 'rgba(15,22,26,0.98)');
        outScreen.addColorStop(0.52, 'rgba(4,9,12,0.99)');
        outScreen.addColorStop(1, 'rgba(7,16,20,0.98)');
        ctx.fillStyle = outScreen;
        ctx.fill();
        ctx.strokeStyle = checked ? outputFrameColor : 'rgba(120,142,149,0.18)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();

        if (!checked) {
            ctx.fillStyle = '#768A91';
            ctx.font = 'bold ' + Math.round(14 * m.scale) + 'px ' + font;
            ctx.fillText('OUTPUT LOCKED', outputCenterX, outputScreenY + outputScreenH * 0.55);

            ctx.fillStyle = '#526970';
            ctx.font = 'bold ' + Math.round(6.2 * m.scale) + 'px ' + font;
            ctx.fillText('PRESS CALCULATE TO VERIFY CAPACITY', outputCenterX, moduleY + moduleH - 14 * m.scale);
        } else {
            ctx.save();
            ctx.translate(outputCenterX, outputScreenY + outputScreenH * 0.54);
            ctx.scale(outputPulse, outputPulse);
            ctx.fillStyle = '#EEF8FA';
            ctx.font = 'bold ' + Math.round(18 * m.scale) + 'px ' + font;
            ctx.fillText('2^' + checked.exponent + ' = ' + this._formatNumber(checked.totalAddresses), 0, 0);
            ctx.restore();

            // Usable host result is intentionally outside the digital formula screen.
            ctx.textAlign = 'right';
            ctx.fillStyle = checked.status === 'over' ? '#FF6F86' : checked.status === 'under' ? '#FFD166' : '#69E6B1';
            ctx.font = 'bold ' + Math.round(10.4 * m.scale) + 'px ' + font;
            ctx.fillText(
                this._formatNumber(checked.usableHosts) + ' USABLE HOSTS',
                outputX + outputW - 16 * m.scale,
                moduleY + moduleH - 12 * m.scale
            );

            ctx.textAlign = 'left';
            ctx.fillStyle = stale ? '#7FA2AA' : '#6F8E95';
            ctx.font = 'bold ' + Math.round(6.0 * m.scale) + 'px ' + font;
            ctx.fillText(
                stale ? 'NEW INPUT UNVERIFIED // PRESS CALCULATE' : 'LAST VERIFIED CAPACITY',
                outputX + 16 * m.scale,
                moduleY + moduleH - 11 * m.scale
            );
        }

        const ledX = contentRight - 7 * m.scale;
        const ledY = moduleY + 15 * m.scale;
        ctx.fillStyle = stale || !checked ? '#FFE052' : '#59FFB7';
        ctx.shadowColor = stale || !checked ? '#FFE052' : '#59FFB7';
        ctx.shadowBlur = (4 + pulse * 4) * m.scale;
        ctx.beginPath();
        ctx.arc(ledX, ledY, 2.5 * m.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const dividerX = button.x - 7 * m.scale;
        const divider = ctx.createLinearGradient(dividerX - 2 * m.scale, 0, dividerX + 2 * m.scale, 0);
        divider.addColorStop(0, 'rgba(0,0,0,0)');
        divider.addColorStop(0.5, 'rgba(180,214,221,0.28)');
        divider.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = divider;
        ctx.fillRect(dividerX - 2 * m.scale, box.y + 13 * m.scale, 4 * m.scale, box.h - 26 * m.scale);

        this._drawCalculateButton(ctx, button, m);
        ctx.restore();
    }


    _drawCriticalWarningOverlay(ctx, m, intensity) {
        if (intensity <= 0) return;

        const blink = 0.5 + 0.5 * Math.sin(this.animTick * 0.62);

        ctx.save();

        const vignette = ctx.createRadialGradient(
            m.cW * 0.5,
            m.cH * 0.5,
            Math.min(m.cW, m.cH) * 0.20,
            m.cW * 0.5,
            m.cH * 0.5,
            Math.max(m.cW, m.cH) * 0.70
        );

        vignette.addColorStop(0, 'rgba(255,0,20,0)');
        vignette.addColorStop(0.58, 'rgba(255,0,25,' + (0.015 * intensity) + ')');
        vignette.addColorStop(1, 'rgba(255,18,40,' + ((0.13 + blink * 0.12) * intensity) + ')');

        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, m.cW, m.cH);

        ctx.strokeStyle = 'rgba(255,55,75,' + ((0.18 + blink * 0.28) * intensity) + ')';
        ctx.lineWidth = (2 + intensity * 3) * m.scale;
        ctx.strokeRect(3 * m.scale, 3 * m.scale, m.cW - 6 * m.scale, m.cH - 6 * m.scale);

        const warningBars = Math.floor(3 + intensity * 6);
        for (let i = 0; i < warningBars; i++) {
            const y = ((i * 97 + this.animTick * (3 + i * 0.31)) % Math.max(1, m.cH));
            ctx.fillStyle = 'rgba(255,49,95,' + (0.018 + intensity * 0.025) + ')';
            ctx.fillRect(0, y, m.cW, Math.max(1, (1 + (i % 3)) * m.scale));
        }

        ctx.restore();
    }


    _drawOverflowFailure(ctx, m, holdFinal) {
        if (!this.failureStartedAt) return;

        const elapsed = Date.now() - this.failureStartedAt;
        const rawProgress = Math.max(0, Math.min(1, elapsed / this.failureAnimationDurationMs));
        const progress = holdFinal ? 1 : rawProgress;
        const eased = holdFinal ? 1 : (1 - Math.pow(1 - progress, 2.25));
        const topY = holdFinal ? -12 * m.scale : m.cH * (1 - eased);
        const font = this._uiFont();

        ctx.save();

        // Deep thermal coolant body. Once the breach finishes, this layer stays
        // latched at full height until the scene closes.
        const deepFluid = ctx.createLinearGradient(0, topY, 0, m.cH);
        deepFluid.addColorStop(0, holdFinal ? 'rgba(255,108,58,0.60)' : 'rgba(255,115,56,0.64)');
        deepFluid.addColorStop(0.16, 'rgba(255,60,61,0.80)');
        deepFluid.addColorStop(0.56, 'rgba(154,17,35,0.93)');
        deepFluid.addColorStop(1, 'rgba(66,2,18,0.98)');
        ctx.fillStyle = deepFluid;
        ctx.beginPath();
        ctx.moveTo(0, m.cH);
        ctx.lineTo(0, topY);

        for (let i = 0; i <= 44; i++) {
            const x = m.cW * (i / 44);
            const y = topY +
                Math.sin(i * 0.63 + this.animTick * 0.13) * (8 + progress * 12) * m.scale +
                Math.sin(i * 1.47 + this.animTick * 0.075) * 4.2 * m.scale;
            ctx.lineTo(x, y);
        }

        ctx.lineTo(m.cW, m.cH);
        ctx.closePath();
        ctx.fill();

        // Hot translucent surface layer.
        const hotTop = Math.min(m.cH, topY + 42 * m.scale);
        const hotLayer = ctx.createLinearGradient(0, topY - 4 * m.scale, 0, hotTop);
        hotLayer.addColorStop(0, 'rgba(255,241,149,0.38)');
        hotLayer.addColorStop(0.22, 'rgba(255,157,70,0.38)');
        hotLayer.addColorStop(0.58, 'rgba(255,67,66,0.17)');
        hotLayer.addColorStop(1, 'rgba(255,49,83,0)');
        ctx.fillStyle = hotLayer;
        ctx.beginPath();
        ctx.moveTo(0, hotTop);

        for (let i = 0; i <= 40; i++) {
            const x = m.cW * (i / 40);
            const y = topY +
                Math.sin(i * 0.82 + this.animTick * 0.19) * 7 * m.scale +
                Math.sin(i * 2.1 + this.animTick * 0.07) * 2.3 * m.scale;
            ctx.lineTo(x, y);
        }

        ctx.lineTo(m.cW, hotTop);
        ctx.closePath();
        ctx.fill();

        // Rolling internal currents provide layered fluid depth.
        for (let layer = 0; layer < 7; layer++) {
            const layerY = topY + (28 + layer * 40) * m.scale;
            if (layerY > m.cH + 12 * m.scale) continue;

            ctx.strokeStyle = layer % 2
                ? 'rgba(255,94,61,' + (0.11 + progress * 0.08) + ')'
                : 'rgba(83,2,24,' + (0.18 + progress * 0.09) + ')';

            ctx.lineWidth = (1.7 + layer * 0.35) * m.scale;
            ctx.beginPath();

            for (let i = 0; i <= 34; i++) {
                const x = m.cW * (i / 34);
                const y = layerY +
                    Math.sin(i * 0.73 + layer + this.animTick * (0.055 + layer * 0.005)) * 7 * m.scale +
                    Math.sin(i * 1.39 + this.animTick * 0.035) * 2.4 * m.scale;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }

            ctx.stroke();
        }

        // Fine suspended thermal particles.
        for (let i = 0; i < 54; i++) {
            const seed = i * 71 + 19;
            const px = (seed * 37.31) % m.cW;
            const available = Math.max(10 * m.scale, m.cH - topY);
            const py = m.cH - ((this.animTick * (0.26 + (i % 5) * 0.04) + seed * 2.3) % available);
            if (py < topY) continue;

            const sz = (0.8 + (i % 4) * 0.42) * m.scale;
            ctx.fillStyle = i % 3 === 0
                ? 'rgba(255,229,143,0.23)'
                : 'rgba(255,98,72,0.18)';
            ctx.fillRect(px, py, sz * 2.3, sz * 0.8);
        }

        // Dense bubbling rises bottom -> top and continues behind the failure card.
        const bubbleCount = holdFinal ? 86 : Math.floor(30 + progress * 58);
        for (let i = 0; i < bubbleCount; i++) {
            const seed = i * 47 + 13;
            const x = (seed * 73.7) % m.cW;
            const available = Math.max(8 * m.scale, m.cH - topY);
            const speed = 0.85 + (i % 7) * 0.14;
            const y = m.cH - ((this.animTick * speed + seed * 4.7) % available);
            if (y < topY) continue;

            const r = (1.8 + (i % 6) * 1.15) * m.scale;
            const bubbleAlpha = holdFinal ? 0.34 : (0.16 + progress * 0.34);

            ctx.strokeStyle = i % 3 === 0
                ? 'rgba(255,244,183,' + bubbleAlpha + ')'
                : 'rgba(255,171,108,' + (bubbleAlpha * 0.72) + ')';

            ctx.lineWidth = (0.7 + (i % 3) * 0.3) * m.scale;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();

            if (i % 5 === 0) {
                ctx.fillStyle = 'rgba(255,236,180,' + (holdFinal ? 0.08 : 0.05 + progress * 0.08) + ')';
                ctx.beginPath();
                ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Electrical interference peaks during the breach, then remains as a
        // restrained background flicker while the feedback card is visible.
        const glitchStrength = holdFinal
            ? 0.34
            : (progress > 0.28 ? (progress - 0.28) / 0.72 : 0);

        if (glitchStrength > 0) {
            const strips = Math.floor(6 + glitchStrength * 20);
            for (let i = 0; i < strips; i++) {
                const y = (i * 61 + this.animTick * (3.1 + i * 0.13)) % m.cH;
                const h = Math.max(1, (1 + (i % 3)) * m.scale);
                const shift = Math.sin(this.animTick * 0.61 + i * 3.1) * 24 * m.scale * glitchStrength;

                ctx.fillStyle = i % 3 === 0
                    ? 'rgba(0,240,255,' + (0.035 + glitchStrength * 0.08) + ')'
                    : (i % 2
                        ? 'rgba(255,255,255,' + (0.026 + glitchStrength * 0.055) + ')'
                        : 'rgba(255,49,95,' + (0.030 + glitchStrength * 0.065) + ')');

                ctx.fillRect(Math.max(0, shift), y, m.cW - Math.abs(shift), h);
            }

            const lightningCount = holdFinal ? 3 : Math.floor(2 + glitchStrength * 7);
            for (let i = 0; i < lightningCount; i++) {
                const startX = ((i * 193 + this.animTick * 5) % m.cW);
                const startY = Math.max(topY, (i * 89 + this.animTick * 1.7) % m.cH);

                ctx.strokeStyle = 'rgba(202,248,255,' + (0.14 + glitchStrength * 0.34) + ')';
                ctx.shadowColor = '#C8FBFF';
                ctx.shadowBlur = 5 * m.scale * glitchStrength;
                ctx.lineWidth = (0.8 + glitchStrength * 1.0) * m.scale;

                ctx.beginPath();
                ctx.moveTo(startX, startY);

                for (let p = 1; p <= 6; p++) {
                    ctx.lineTo(
                        startX + Math.sin(i * 7 + p * 2.2 + this.animTick * 0.09) * 18 * m.scale,
                        startY + p * 13 * m.scale
                    );
                }

                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        if (!holdFinal) {
            const labelY = Math.max(28 * m.scale, topY - 24 * m.scale);
            ctx.fillStyle = 'rgba(255,244,226,' + (0.54 + progress * 0.40) + ')';
            ctx.shadowColor = '#FF604F';
            ctx.shadowBlur = 10 * m.scale * progress;
            ctx.font = 'bold ' + Math.round(12 * m.scale) + 'px ' + font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('THERMAL TRACE BREACH // COOLANT OVERRUN', m.cW * 0.5, labelY);
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    _formatNumber(value) {
        const number = Math.max(0, Number(value) || 0);
        return Math.floor(number).toLocaleString('en-US');
    }

    _roundedRect(ctx, x, y, w, h, radius) {
        const r = Math.max(0, Math.min(radius || 0, w * 0.5, h * 0.5));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    _chamferPath(ctx, x, y, w, h, cut) {
        const c = Math.max(0, Math.min(cut || 0, w * 0.2, h * 0.2));
        ctx.beginPath();
        this._appendChamferPath(ctx, x, y, w, h, c);
    }

    _appendChamferPath(ctx, x, y, w, h, cut) {
        const c = Math.max(0, Math.min(cut || 0, w * 0.2, h * 0.2));
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c, y);
        ctx.lineTo(x + w, y + c);
        ctx.lineTo(x + w, y + h - c);
        ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c, y + h);
        ctx.lineTo(x, y + h - c);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }

    _pointInRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    _playShot() {
        try {
            if (Data.Systems.soundCursor && typeof Data.Systems.soundCursor.playSound === 'function') {
                Data.Systems.soundCursor.playSound();
            }
        } catch (e) { }
    }

    _playLaneMove() {
        try {
            if (Data.Systems.soundCursor && typeof Data.Systems.soundCursor.playSound === 'function') {
                Data.Systems.soundCursor.playSound();
            }
        } catch (e) { }
    }

    _playHit(isVirus) {
        try {
            const sound = isVirus ? Data.Systems.soundCancel : Data.Systems.soundConfirmation;
            if (sound && typeof sound.playSound === 'function') sound.playSound();
        } catch (e) { }
    }

    _playArmorImpact() {
        try {
            if (Data.Systems.soundCursor && typeof Data.Systems.soundCursor.playSound === 'function') {
                Data.Systems.soundCursor.playSound();
            }
        } catch (e) { }
    }

    _playSuccess() {
        try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) { }
    }

    _playError() {
        try { if (Data.Systems.soundImpossible) Data.Systems.soundImpossible.playSound(); } catch (e) { }
    }
}

const HostPowerReactorGameplayManager = {
    VERSION: 'ip-host-power-reactor-manager-20260921-04',
    _active: false,
    _activeAttempt: null,
    _introShown: false,
    _tutorialOwnerGame: null,
    _tutorialShownKeys: {},
    _triggerLocks: {},
    // Normal quest nodes deliberately retain their class but draw a new host
    // requirement on every launch. Keeping the last draw lets a replay never
    // repeat the immediately preceding value by chance.
    _regularQuestHostCounts: {},

    createScenario(options) {
        return IPHostPowerRules.createScenario(options || {});
    },

    _resolveAttemptKey(options) {
        const opts = options || {};
        const spec = opts.spec || {};
        return (opts.questId || spec.id || 'quest') + ':' + (opts.objectiveId || spec.objectiveId || 'objective');
    },

    _syncTutorialState() {
        const currentGame = Core && Core.Game ? Core.Game.current : null;
        if (this._tutorialOwnerGame === currentGame) return;
        this._tutorialOwnerGame = currentGame;
        this._tutorialShownKeys = {};
        this._introShown = false;
        this._regularQuestHostCounts = {};
    },

    _isGuidedTutorialSpec(spec) {
        const source = spec || {};
        if (source.tutorial === true) return true;
        // Identity fallback protects the introductory quest if a future quest
        // adapter copies only selected fields and accidentally drops tutorial.
        return Number(source.mapId) === 11 && (
            Number(source.sequence) === 1 ||
            source.id === 'stage.11.host_power.01.tutorial' ||
            source.objectiveId === 'stabilize_host_power_11_01'
        );
    },

    _refreshTriggerLock(spec, distance, radius) {
        if (!spec || !spec.objectiveId || !this._triggerLocks[spec.objectiveId]) return;
        if (distance === null || distance > radius + 0.35) delete this._triggerLocks[spec.objectiveId];
    },

    _lockUntilStepOff(spec) {
        if (spec && spec.objectiveId) this._triggerLocks[spec.objectiveId] = true;
    },

    _mapIdFor(options, spec) {
        const opts = options || {};
        const source = spec || opts.spec || {};
        return Number(opts.mapId || source.mapId || (Core && Core.Game && Core.Game.current && Core.Game.current.currentMapID)) || 11;
    },

    _handleObjective(spec, context, questManager) {
        this._syncTutorialState();
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;
        const objective = qm.currentObjective();
        if (!objective || objective.id !== spec.objectiveId) return false;
        const distance = qm.distanceToObjective(objective, context && context.hero);
        const radius = typeof objective.completionRadiusTiles === 'number' ? objective.completionRadiusTiles : 0.55;
        this._refreshTriggerLock(spec, distance, radius);
        if (distance === null || distance > radius || this._triggerLocks[spec.objectiveId]) return false;

        const attemptKey = this._resolveAttemptKey({ spec, questId: spec.id, objectiveId: spec.objectiveId });
        if (this._activeAttempt === attemptKey || this._active) return false;
        this._activeAttempt = attemptKey;
        const guidedTutorial = this._isGuidedTutorialSpec(spec);
        const launchOptions = {
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId: Number(spec.mapId) || 11,
            _fromObjective: true,
            _reservedAttempt: attemptKey,
            guidedTutorial,
            tutorial: guidedTutorial,
            tutorialKey: attemptKey,
            showIntro: guidedTutorial && !this._tutorialShownKeys[attemptKey],
        };
        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_host_power_reactor', launchOptions);
            return false;
        }
        this.launchHostPowerReactorGameplay(launchOptions);
        return false;
    },

    _playMusicZone(zoneName) {
        const music = IP2Live.MusicManager;
        if (!music || !music.ZONE || !music.ZONE[zoneName] || typeof music.play !== 'function') return false;
        music.play(music.ZONE[zoneName]);
        return true;
    },

    _restoreStageMusic() {
        return this._playMusicZone('STAGE_3') || this._playMusicZone('STAGE_1');
    },

    launchHostPowerReactorGameplay(options) {
        this._syncTutorialState();
        const opts = options || {};
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;

        const guidedTutorial = opts.guidedTutorial === true || opts.tutorial === true || this._isGuidedTutorialSpec(opts.spec);
        let scenario;
        try {
            const scenarioOptions = Object.assign({}, opts.spec || {}, opts);
            const isRegularQuest = !guidedTutorial && !!opts.spec && !opts.scenario;

            if (isRegularQuest) {
                // Quest definitions provide a class and an original balancing
                // value. Omit that value for normal play so restarting a floor
                // creates a fresh, valid host-capacity puzzle. Tutorial specs
                // never enter this branch and therefore remain fixed.
                delete scenarioOptions.requiredHosts;
                const previousHosts = this._regularQuestHostCounts[attemptKey];
                scenario = this.createScenario(scenarioOptions);
                for (let draw = 0; draw < 8 && scenario.requiredHosts === previousHosts; draw++) {
                    scenario = this.createScenario(scenarioOptions);
                }
                if (scenario.requiredHosts === previousHosts) {
                    const limits = IPHostPowerRules.classConfig(scenario.className);
                    const alternateHosts = previousHosts < limits.maxHosts ? previousHosts + 1 : previousHosts - 1;
                    scenario = this.createScenario({ targetClass: scenario.className, requiredHosts: alternateHosts });
                }
                this._regularQuestHostCounts[attemptKey] = scenario.requiredHosts;
            } else {
                scenario = opts.scenario || this.createScenario(scenarioOptions);
            }
        } catch (error) {
            this._active = false;
            this._activeAttempt = null;
            console.warn('[IP2Live] Host-Power Reactor scenario rejected:', error);
            return false;
        }

        const tutorialKey = String(opts.tutorialKey || attemptKey);
        const shouldShowIntro = guidedTutorial && opts.showIntro !== false && !this._tutorialShownKeys[tutorialKey];

        const openGameplay = () => {
            const screen = new IP2LiveHostPowerReactorGameplayScreen(Object.assign({}, opts, {
                scenario,
                guidedTutorial,
                onComplete: (result) => this._onComplete(opts, result),
                onFailed: (result) => this._onFailed(opts, result),
                onCancel: (result) => this._onCancel(opts, result),
            }));
            try {
                this._playMusicZone('GAMEPLAY_1');
                if (Manager && Manager.Stack && opts.mode === 'replace' && typeof Manager.Stack.replace === 'function') {
                    Manager.Stack.replace(screen);
                } else if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
                    Manager.Stack.push(screen);
                } else {
                    this._active = false;
                    this._activeAttempt = null;
                    return false;
                }
                return true;
            } catch (error) {
                this._active = false;
                this._activeAttempt = null;
                console.warn('[IP2Live] Host-Power Reactor failed to open:', error);
                return false;
            }
        };

        const tutorial = IP2Live.IPHostPowerReactorTutorial;
        if (shouldShowIntro && tutorial && typeof tutorial.showIntro === 'function') {
            let openedFromTutorial = false;
            const openFromTutorial = () => {
                if (openedFromTutorial) return true;
                openedFromTutorial = true;
                return openGameplay();
            };
            const shown = tutorial.showIntro(scenario, openFromTutorial);
            if (shown || openedFromTutorial) {
                this._tutorialShownKeys[tutorialKey] = true;
                this._introShown = true;
                return true;
            }
        }
        return openGameplay();
    },

    _returnToPreviousScreen() {
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },

    _onComplete(options, result) {
        const opts = options || {};
        const spec = opts.spec || {};
        const mapId = this._mapIdFor(opts, spec);
        this._active = false;
        this._activeAttempt = null;
        if (spec.objectiveId) delete this._triggerLocks[spec.objectiveId];
        this._returnToPreviousScreen();
        this._restoreStageMusic();
        if (opts.questId && opts.objectiveId && IP2Live.QuestManager) {
            const qm = IP2Live.QuestManager;
            if (qm.activeQuestId !== opts.questId && typeof qm.startQuest === 'function') {
                qm.startQuest(opts.questId, {
                    mapId,
                    mapQuestMode: true,
                    keepLastCompletion: true,
                    visible: true,
                    preview: false,
                    guideActive: true,
                    allowCompletion: true,
                });
            }
            if (typeof qm.completeObjective === 'function') qm.completeObjective(opts.objectiveId);
        }
        if (typeof opts.onComplete === 'function') opts.onComplete(result);
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
            IP2Live.GameManager.handleGameplayCompleted('ip_host_power_reactor', {
                gameplayId: 'ip_host_power_reactor',
                spec,
                questId: opts.questId || null,
                objectiveId: opts.objectiveId || null,
                mapId,
                result,
            });
        }
    },

    _onFailed(options, result) {
        const opts = options || {};
        const spec = opts.spec || {};
        const mapId = this._mapIdFor(opts, spec);
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        this._returnToPreviousScreen();
        this._restoreStageMusic();
        if (typeof opts.onFailed === 'function') opts.onFailed(result);
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
            IP2Live.GameManager.handleGameplayFailed('ip_host_power_reactor', {
                gameplayId: 'ip_host_power_reactor',
                spec,
                questId: opts.questId || null,
                objectiveId: opts.objectiveId || null,
                mapId,
                result,
            });
        }
    },

    _onCancel(options, result) {
        const opts = options || {};
        const spec = opts.spec || {};
        const mapId = this._mapIdFor(opts, spec);
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        this._returnToPreviousScreen();
        this._restoreStageMusic();
        if (typeof opts.onCancel === 'function') opts.onCancel(result);
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
            IP2Live.GameManager.handleGameplayCancelled('ip_host_power_reactor', {
                gameplayId: 'ip_host_power_reactor',
                spec,
                questId: opts.questId || null,
                objectiveId: opts.objectiveId || null,
                mapId,
                result,
            });
        }
    },
};

IP2Live.HostPowerRules = IPHostPowerRules;
IP2Live.HostPowerPlayfield = IP_HOST_POWER_PLAYFIELD;
IP2Live.HostPowerReactorGameplayScreen = IP2LiveHostPowerReactorGameplayScreen;
IP2Live.HostPowerReactorGameplayManager = HostPowerReactorGameplayManager;
window.IP2LiveHostPowerRules = IPHostPowerRules;
window.IP2LiveHostPowerReactorGameplayScreen = IP2LiveHostPowerReactorGameplayScreen;
window.IP2LiveHostPowerReactorGameplayManager = HostPowerReactorGameplayManager;

window.startHostPowerGameplayFourPointFive = function (options, timeSeconds) {
    const opts = Object.assign({}, options || {});
    if (Number.isFinite(Number(timeSeconds)) && Number(timeSeconds) > 0) opts.timeSeconds = Number(timeSeconds);
    return HostPowerReactorGameplayManager.launchHostPowerReactorGameplay(opts);
};

console.log('[IP2Live] ip_host_power_gameplay.js loaded.');
