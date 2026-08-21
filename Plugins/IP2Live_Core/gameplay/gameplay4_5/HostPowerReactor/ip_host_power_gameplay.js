/**
 * IP2Live - Gameplay 4.5 Host-Power Reactor
 *
 * A one-minute bridge lesson for analytical subnetting:
 *   1. Read the required usable host count.
 *   2. Build the smallest exponent h where 2^h - 2 >= required hosts.
 *   3. Shoot +1..+5 capsules or -1/-2 viruses to adjust h.
 *
 * The left third is the falling-object shooter. The right two thirds contain
 * the reactor, live capacity calculator, required-host display, and timer.
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
    // Curated learning rhythm: eight clearly positive capsules and two
    // viruses per cycle, with no long run of negative values.
    DROP_SEQUENCE: Object.freeze([1, 3, 2, -1, 4, 2, 5, -2, 3, 1]),
    VALUE_COLORS: Object.freeze({
        1: '#00eaff',
        2: '#54f59a',
        3: '#ffe45d',
        4: '#ff9f43',
        5: '#b88aff',
    }),
    SPAWN_INTERVAL_MS: 1500,
    SHOT_INTERVAL_MS: 1000,
    FALL_SPEED_PX_PER_SECOND: 48,
    BULLET_SPEED_PX_PER_SECOND: 390,
    GUN_SPEED_PX_PER_SECOND: 270,
});

class IP2LiveHostPowerReactorGameplayScreen extends Scene.Base {
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
        this.scenario = this.options.scenario || IPHostPowerRules.createScenario(this.options);
        this.durationMs = Math.max(10000, (Number(this.options.durationSeconds) || 60) * 1000);
        this.animTick = 0;
        this.finished = false;
        this.roundState = 'ready';
        this.exponent = Math.max(0, Math.min(this.scenario.classConfig.maxHostBits, Number(this.options.startExponent) || 0));
        this.evaluation = IPHostPowerRules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.entities = [];
        this.bullets = [];
        this.hits = [];
        this.overshoots = 0;
        this.spawnIntervalMs = IP_HOST_POWER_PLAYFIELD.SPAWN_INTERVAL_MS;
        this.shotIntervalMs = IP_HOST_POWER_PLAYFIELD.SHOT_INTERVAL_MS;
        this.nextSpawnAt = null;
        this.nextShotAt = null;
        this.lastUpdateAt = null;
        this.laneCursor = 0;
        this.dropCursor = 0;
        this.nextEntityId = 1;
        this.gunX = null;
        this.heldLeft = false;
        this.heldRight = false;
        this.startedAt = null;
        this.endsAt = null;
        this.stabilizeStartedAt = null;
        this.failureReason = null;
        this.buttons = [];
        this.lastMetrics = null;
        this.lastMouseX = null;
        this._lastStatus = this.evaluation.status;
    }

    async load() {
        this.loading = false;
        this._startRoundClock();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _startRoundClock(nowValue) {
        if (this.roundState === 'active' && Number(this.endsAt) > Date.now()) return false;
        const numericNow = Number(nowValue);
        const now = Number.isFinite(numericNow) ? numericNow : Date.now();
        this.startedAt = now;
        this.endsAt = now + this.durationMs;
        this.nextSpawnAt = now;
        this.nextShotAt = now;
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
        const dialogueActive = this._dialogueActive();
        if (!this.finished && !dialogueActive && this.roundState === 'ready') {
            // RPG Paper Maker can invoke async load() from Scene.Base before
            // the derived constructor finishes. _configure() then restores
            // the initial "ready" state. Starting again on the first live
            // update makes the lifecycle deterministic in editor and export.
            this._startRoundClock(now);
        }
        if (this.finished || dialogueActive) {
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return;
        }

        const metrics = this._metrics();
        this.lastMetrics = metrics;
        this._ensureGun(metrics);
        const deltaSeconds = this._frameDeltaSeconds(now);

        if (this.roundState === 'active') {
            if (now >= this.endsAt) {
                this._timeout();
            } else {
                this._updateHeldMovement(metrics, deltaSeconds);
                this._updateSpawner(metrics, now);
                this._updateGun(metrics, now);
                this._updateEntities(metrics, deltaSeconds);
                this._updateBullets(metrics, deltaSeconds);
                this._resolveCollisions();
            }
        } else if (this.roundState === 'stabilizing') {
            if (now - this.stabilizeStartedAt >= 900) this._complete();
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _dialogueActive() {
        return !!(
            IP2Live.DialogueManager &&
            typeof IP2Live.DialogueManager.isActive === 'function' &&
            IP2Live.DialogueManager.isActive()
        );
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
        if (!Number.isFinite(this.gunX)) this.gunX = arena.x + arena.w * 0.5;
        this.gunX = Math.max(arena.x + 20 * m.scale, Math.min(arena.x + arena.w - 20 * m.scale, this.gunX));
    }

    _updateSpawner(m, now) {
        const numericNow = Number(now);
        const current = Number.isFinite(numericNow) ? numericNow : Date.now();
        if (!Number.isFinite(this.nextSpawnAt)) this.nextSpawnAt = current;
        if (current < this.nextSpawnAt) return false;
        // Never catch up a backlog after lag; one calm, evenly spaced drop is
        // easier to read than several capsules appearing in one frame.
        this.nextSpawnAt = current + this.spawnIntervalMs;
        const laneOrder = IP_HOST_POWER_PLAYFIELD.LANE_ORDER;
        const laneIndex = laneOrder[this.laneCursor % laneOrder.length];
        this.laneCursor++;
        const dropSequence = IP_HOST_POWER_PLAYFIELD.DROP_SEQUENCE;
        const value = dropSequence[this.dropCursor % dropSequence.length];
        this.dropCursor++;
        const isVirus = value < 0;
        const radius = (isVirus ? 19 : 20) * m.scale;
        const laneWidth = m.arena.w / IP_HOST_POWER_PLAYFIELD.LANE_COUNT;
        this.entities.push({
            id: this.nextEntityId++,
            type: isVirus ? 'virus' : 'capsule',
            value,
            laneIndex,
            x: m.arena.x + laneWidth * (laneIndex + 0.5),
            y: m.arena.y - radius,
            radius,
            speed: IP_HOST_POWER_PLAYFIELD.FALL_SPEED_PX_PER_SECOND * m.scale,
            spin: isVirus ? (this.nextEntityId % 8) * Math.PI / 4 : 0,
            maxHits: 3,
            hitsRemaining: 3,
            hitFlashUntil: 0,
        });
        return true;
    }

    _updateGun(m, now) {
        const numericNow = Number(now);
        const current = Number.isFinite(numericNow) ? numericNow : Date.now();
        if (!Number.isFinite(this.nextShotAt)) this.nextShotAt = current;
        if (current < this.nextShotAt) return false;
        this.nextShotAt = current + this.shotIntervalMs;
        this.bullets.push({
            x: this.gunX,
            y: m.arena.y + m.arena.h - 40 * m.scale,
            radius: 3.4 * m.scale,
            speed: IP_HOST_POWER_PLAYFIELD.BULLET_SPEED_PX_PER_SECOND * m.scale,
        });
        this._playShot();
        return true;
    }

    _updateHeldMovement(m, deltaSeconds) {
        const direction = (this.heldRight ? 1 : 0) - (this.heldLeft ? 1 : 0);
        if (!direction || deltaSeconds <= 0) return;
        this.gunX += direction * IP_HOST_POWER_PLAYFIELD.GUN_SPEED_PX_PER_SECOND * m.scale * deltaSeconds;
        this._ensureGun(m);
    }

    _updateEntities(m, deltaSeconds) {
        const bottom = m.arena.y + m.arena.h - 16 * m.scale;
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const entity = this.entities[i];
            entity.y += entity.speed * deltaSeconds;
            if (entity.type === 'virus') entity.spin += 1.15 * deltaSeconds;
            if (entity.y - entity.radius > bottom) this.entities.splice(i, 1);
        }
    }

    _updateBullets(m, deltaSeconds) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.y -= bullet.speed * deltaSeconds;
            if (bullet.y + bullet.radius < m.arena.y) this.bullets.splice(i, 1);
        }
    }

    _resolveCollisions() {
        for (let b = this.bullets.length - 1; b >= 0; b--) {
            const bullet = this.bullets[b];
            let hitIndex = -1;
            for (let e = this.entities.length - 1; e >= 0; e--) {
                const entity = this.entities[e];
                const dx = bullet.x - entity.x;
                const dy = bullet.y - entity.y;
                const hitRadius = bullet.radius + entity.radius;
                if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                    hitIndex = e;
                    break;
                }
            }
            if (hitIndex < 0) continue;
            const entity = this.entities[hitIndex];
            this.bullets.splice(b, 1);
            const storedHits = Number(entity.hitsRemaining);
            const currentHits = Number.isFinite(storedHits) ? storedHits : 3;
            entity.maxHits = 3;
            entity.hitsRemaining = Math.max(0, currentHits - 1);
            entity.hitFlashUntil = Date.now() + 180;
            if (entity.hitsRemaining > 0) {
                this._playArmorImpact();
                continue;
            }
            this.entities.splice(hitIndex, 1);
            this._applyPower(entity.value, entity.type);
            if (this.roundState !== 'active') return;
        }
    }

    _applyPower(delta, source) {
        const previous = this.exponent;
        const maximum = this.scenario.classConfig.maxHostBits;
        this.exponent = Math.max(0, Math.min(maximum, this.exponent + Number(delta || 0)));
        this.evaluation = IPHostPowerRules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.hits.push({
            value: Number(delta || 0),
            source: source || 'unknown',
            previousExponent: previous,
            exponent: this.exponent,
            status: this.evaluation.status,
            atMs: Math.max(0, Date.now() - this.startedAt),
        });

        if (this.evaluation.status === 'over' && this._lastStatus !== 'over') {
            this.overshoots++;
            this._notifyMistake('over-capacity');
        }
        this._lastStatus = this.evaluation.status;
        this._playHit(source === 'virus');

        if (this.evaluation.valid) {
            this.roundState = 'stabilizing';
            this.stabilizeStartedAt = Date.now();
            this.entities = [];
            this.bullets = [];
            this._playSuccess();
        }
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
        this.roundState = 'failed';
        this.heldLeft = false;
        this.heldRight = false;
        this.failureReason = 'timeout';
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
        this.nextShotAt = null;
        this.lastUpdateAt = null;
        this.laneCursor = 0;
        this.dropCursor = 0;
        this.heldLeft = false;
        this.heldRight = false;
        this.failureReason = null;
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
            hits: this.hits.slice(),
        }, extra || {});
    }

    _complete() {
        if (this.finished) return;
        this.finished = true;
        this.roundState = 'complete';
        this.heldLeft = false;
        this.heldRight = false;
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
            if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR' || upper === 'R' || upper === 'KEYR') this._restart();
            return true;
        }
        const direction = this._directionForKey(upper);
        if (direction) {
            const m = this.lastMetrics || this._metrics();
            this._ensureGun(m);
            const wasHeld = direction < 0 ? this.heldLeft : this.heldRight;
            if (direction < 0) this.heldLeft = true;
            else this.heldRight = true;
            // Keep quick taps useful while continuous motion is handled from
            // update() for as long as RPG Paper Maker reports the key held.
            if (!wasHeld) this.gunX += direction * 8 * m.scale;
            this._ensureGun(m);
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
        const direction = this._directionForKey(this._keyToken(key));
        if (direction < 0) this.heldLeft = false;
        else if (direction > 0) this.heldRight = false;
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

    onMouseMove(x, y) {
        if (this.finished || this.roundState !== 'active') return true;
        const m = this.lastMetrics || this._metrics();
        if (x >= m.arena.x && x <= m.arena.x + m.arena.w && y >= m.arena.y && y <= m.arena.y + m.arena.h) {
            this.heldLeft = false;
            this.heldRight = false;
            this.gunX = x;
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
        this.buttons = [];
        const m = this.lastMetrics || this._metrics();
        if (this.roundState === 'failed') this._buildFailureButtons(m);
        for (let i = 0; i < this.buttons.length; i++) {
            const button = this.buttons[i];
            if (!this._pointInRect(x, y, button)) continue;
            if (button.action === 'retry') this._restart();
            else if (button.action === 'exit') this._cancel(true);
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
        ctx.save();
        this._drawBackdrop(ctx, m);
        this._drawShell(ctx, m);
        this._drawHeader(ctx, m);
        this._drawArena(ctx, m);
        this._drawRightPanel(ctx, m);
        if (this.roundState === 'failed') this._drawFailure(ctx, m);
        ctx.restore();
        if (IP2Live.GameplayCompletionPopup && typeof IP2Live.GameplayCompletionPopup.drawFor === 'function') {
            IP2Live.GameplayCompletionPopup.drawFor(this, ctx, { tick: this.animTick });
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
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'monospace';
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
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px monospace';
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
        ctx.font = 'bold ' + Math.round(6.5 * m.scale) + 'px monospace';
        ctx.fillText('GAMEPLAY 4.5 // REACTOR CAPACITY', titleX, plateY + 34 * m.scale);
        ctx.restore();

        const chipY = m.y + 13 * m.scale;
        const chipH = 20 * m.scale;
        const liveColor = this.roundState === 'failed' ? '#ff315f' : (this.roundState === 'ready' ? '#ffe600' : '#00f0ff');
        const statusText = this.roundState === 'failed' ? 'OFFLINE' : (this.roundState === 'ready' ? 'SYNC' : 'LIVE');
        let chipRight = m.x + m.w - 20 * m.scale;
        chipRight = this._drawStatusChip(ctx, chipRight, chipY, 'SYS ' + statusText, liveColor, m);
        chipRight = this._drawStatusChip(ctx, chipRight - 7 * m.scale, chipY, 'TARGET H=' + this.scenario.targetExponent, '#ffe600', m);
        this._drawStatusChip(ctx, chipRight - 7 * m.scale, chipY, 'CLASS ' + this.scenario.className + ' /' + this.scenario.classConfig.defaultPrefix, '#00f0ff', m);

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(173, 205, 216, 0.62)';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px monospace';
        ctx.fillText('HOLD A/D OR ←/→  //  1 SHOT/SEC  //  ESC EXIT', m.x + m.w - 22 * m.scale, m.y + 52 * m.scale);
    }

    _drawArena(ctx, m) {
        const a = m.arena;
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
            ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); ctx.stroke();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px monospace';
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
        scan.addColorStop(0.5, 'rgba(0, 230, 255, 0.08)');
        scan.addColorStop(1, 'rgba(0, 230, 255, 0)');
        ctx.fillStyle = scan;
        ctx.fillRect(a.x, scanY - 18 * m.scale, a.w, 36 * m.scale);

        for (let i = 0; i < this.entities.length; i++) this._drawEntity(ctx, this.entities[i], m);
        for (let i = 0; i < this.bullets.length; i++) this._drawBullet(ctx, this.bullets[i], m);
        this._drawGun(ctx, m);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
        ctx.fillRect(a.x, a.y, a.w, 30 * m.scale);
        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('CAPSULE INTAKE // 5 LANES // 3-HIT SHELLS', a.x + 13 * m.scale, a.y + 15 * m.scale);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffe600';
        ctx.fillText('+1..+5', a.x + a.w - 74 * m.scale, a.y + 15 * m.scale);
        ctx.fillStyle = '#ff315f';
        ctx.fillText('VIRUS -1..-2', a.x + a.w - 13 * m.scale, a.y + 15 * m.scale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(a.x, a.y + a.h - 24 * m.scale, a.w, 24 * m.scale);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(183, 218, 227, 0.64)';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px monospace';
        ctx.fillText('AUTO-PULSE // 1 SHOT PER SEC', a.x + 13 * m.scale, a.y + a.h - 12 * m.scale);
        ctx.textAlign = 'right';
        ctx.fillStyle = this.roundState === 'active' ? '#55ff91' : '#ffe600';
        ctx.fillText(this.roundState === 'active' ? 'TRACKING // FIRE ENABLED' : 'REACTOR SYNC', a.x + a.w - 13 * m.scale, a.y + a.h - 12 * m.scale);
        ctx.restore();
    }

    _drawEntity(ctx, entity, m) {
        const valueColor = entity.type === 'virus'
            ? '#ff315f'
            : (IP_HOST_POWER_PLAYFIELD.VALUE_COLORS[entity.value] || '#00eaff');
        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.rotate(entity.spin);
        if (entity.type === 'virus') {
            ctx.shadowColor = '#ff284f';
            ctx.shadowBlur = 11 * m.scale;
            ctx.fillStyle = 'rgba(116, 7, 28, 0.96)';
            ctx.strokeStyle = '#ff315f';
            ctx.lineWidth = 2 * m.scale;
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
                const angle = i * Math.PI / 8;
                const r = i % 2 === 0 ? entity.radius * 1.18 : entity.radius * 0.78;
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.shadowColor = valueColor;
            ctx.shadowBlur = 10 * m.scale;
            const gradient = ctx.createLinearGradient(-entity.radius, 0, entity.radius, 0);
            gradient.addColorStop(0, '#06131b');
            gradient.addColorStop(0.42, valueColor);
            gradient.addColorStop(0.54, '#eaffff');
            gradient.addColorStop(1, valueColor);
            this._roundedRect(ctx, -entity.radius * 1.34, -entity.radius * 0.84, entity.radius * 2.68, entity.radius * 1.68, entity.radius * 0.80);
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.strokeStyle = '#eaffff';
            ctx.lineWidth = 1.8 * m.scale;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -entity.radius * 0.78);
            ctx.lineTo(0, entity.radius * 0.78);
            ctx.strokeStyle = 'rgba(0, 13, 20, 0.72)';
            ctx.stroke();
        }
        ctx.rotate(-entity.spin);
        if (Number(entity.hitFlashUntil) > Date.now()) {
            ctx.globalAlpha = 0.82;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.2 * m.scale;
            ctx.beginPath();
            ctx.arc(0, 0, entity.radius * 1.48, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        const labelW = (entity.type === 'virus' ? 31 : 36) * m.scale;
        const labelH = 21 * m.scale;
        this._roundedRect(ctx, -labelW * 0.5, -labelH * 0.5, labelW, labelH, 6 * m.scale);
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 5 * m.scale;
        ctx.fillStyle = 'rgba(0, 5, 9, 0.92)';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = valueColor;
        ctx.lineWidth = 1.4 * m.scale;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.max(10, Math.round(15 * m.scale)) + 'px monospace';
        ctx.fillText((entity.value > 0 ? '+' : '') + entity.value, 0, 0);

        const maximumHits = 3;
        const storedHits = Number(entity.hitsRemaining);
        const hitsRemaining = Math.max(0, Math.min(maximumHits, Number.isFinite(storedHits) ? storedHits : maximumHits));
        const pipW = 7 * m.scale;
        const pipH = 3 * m.scale;
        const pipGap = 2.5 * m.scale;
        const pipsWidth = maximumHits * pipW + (maximumHits - 1) * pipGap;
        const pipStartX = -pipsWidth * 0.5;
        const pipY = labelH * 0.5 + 5 * m.scale;
        for (let index = 0; index < maximumHits; index++) {
            this._roundedRect(ctx, pipStartX + index * (pipW + pipGap), pipY, pipW, pipH, pipH * 0.5);
            ctx.fillStyle = index < hitsRemaining ? valueColor : 'rgba(112, 132, 140, 0.30)';
            ctx.fill();
        }
        ctx.restore();
    }

    _drawBullet(ctx, bullet, m) {
        ctx.save();
        ctx.shadowColor = '#dffcff';
        ctx.shadowBlur = 8 * m.scale;
        ctx.fillStyle = '#efffff';
        ctx.fillRect(bullet.x - bullet.radius, bullet.y - bullet.radius * 3, bullet.radius * 2, bullet.radius * 6);
        ctx.restore();
    }

    _drawGun(ctx, m) {
        const a = m.arena;
        const gunY = a.y + a.h - 42 * m.scale;
        ctx.save();
        ctx.shadowColor = '#00eaff';
        ctx.shadowBlur = 12 * m.scale;
        ctx.fillStyle = '#102e3a';
        ctx.strokeStyle = '#56e7f5';
        ctx.lineWidth = 1.5 * m.scale;
        ctx.fillRect(this.gunX - 18 * m.scale, gunY - 10 * m.scale, 36 * m.scale, 17 * m.scale);
        ctx.strokeRect(this.gunX - 18 * m.scale, gunY - 10 * m.scale, 36 * m.scale, 17 * m.scale);
        ctx.fillStyle = '#75f2ff';
        ctx.fillRect(this.gunX - 4 * m.scale, gunY - 24 * m.scale, 8 * m.scale, 17 * m.scale);
        ctx.fillStyle = '#ff315f';
        ctx.fillRect(this.gunX - 8 * m.scale, gunY + 8 * m.scale, 16 * m.scale, 3 * m.scale);
        ctx.restore();
    }

    _drawRightPanel(ctx, m) {
        const r = m.right;
        const reactorH = r.h * 0.55;
        this._drawReactor(ctx, { x: r.x, y: r.y, w: r.w, h: reactorH }, m);
        const cardsY = r.y + reactorH + 10 * m.scale;
        const cardsH = r.h * 0.25;
        const cardGap = 12 * m.scale;
        const cardW = (r.w - cardGap) * 0.5;
        this._drawCalculatorCard(ctx, { x: r.x, y: cardsY, w: cardW, h: cardsH }, m);
        this._drawNeededCard(ctx, { x: r.x + cardW + cardGap, y: cardsY, w: cardW, h: cardsH }, m);
        const timerY = cardsY + cardsH + 13 * m.scale;
        this._drawTimer(ctx, { x: r.x, y: timerY, w: r.w, h: Math.max(38 * m.scale, r.y + r.h - timerY) }, m);
    }

    _reactorColor() {
        if (this.evaluation.status === 'just-right') return '#52ff8f';
        if (this.evaluation.status === 'over') return '#ff315f';
        return '#f6b73c';
    }

    _drawReactor(ctx, box, m) {
        const color = this._reactorColor();
        const target = Math.max(1, this.scenario.targetExponent);
        const ratio = Math.max(0, Math.min(1.25, this.exponent / target));
        const cx = box.x + box.w * 0.5;
        const cy = box.y + box.h * 0.54;
        const radius = Math.min(box.w * 0.22, box.h * 0.35);
        const pulse = 1 + Math.sin(this.animTick * 0.08) * 0.025;

        ctx.save();
        this._roundedRect(ctx, box.x, box.y, box.w, box.h, 10 * m.scale);
        const panelFill = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
        panelFill.addColorStop(0, 'rgba(5, 20, 29, 0.94)');
        panelFill.addColorStop(1, 'rgba(2, 8, 14, 0.98)');
        ctx.fillStyle = panelFill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(60, 143, 157, 0.48)';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.stroke();

        ctx.fillStyle = '#7fa8b2';
        ctx.font = 'bold ' + Math.round(9 * m.scale) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('REACTOR CAPACITY CORE', box.x + 16 * m.scale, box.y + 18 * m.scale);
        ctx.textAlign = 'right';
        ctx.fillStyle = color;
        ctx.fillText(this.evaluation.status === 'under' ? 'LOW POWER' : (this.evaluation.status === 'over' ? 'OVER-ALLOCATED' : 'OPTIMAL'), box.x + box.w - 16 * m.scale, box.y + 18 * m.scale);

        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);
        ctx.shadowColor = color;
        ctx.shadowBlur = 24 * m.scale * Math.max(0.25, ratio);
        ctx.strokeStyle = 'rgba(73, 122, 134, 0.52)';
        ctx.lineWidth = 13 * m.scale;
        ctx.beginPath();
        ctx.arc(0, 0, radius, -Math.PI * 0.78, Math.PI * 0.78);
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.lineWidth = 13 * m.scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, radius, -Math.PI * 0.78, -Math.PI * 0.78 + Math.PI * 1.56 * Math.min(1, ratio));
        ctx.stroke();

        ctx.globalAlpha = 0.18 + Math.min(1, ratio) * 0.36;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ecfcff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(31 * m.scale) + 'px monospace';
        ctx.fillText(String(this.exponent), 0, -4 * m.scale);
        ctx.fillStyle = '#8eacb3';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.fillText('HOST BITS', 0, 23 * m.scale);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.font = 'bold ' + Math.round(10 * m.scale) + 'px monospace';
        const footer = this.roundState === 'stabilizing'
            ? 'STABILIZING // BORROW ' + this.scenario.bitsToBorrow + ' BIT(S)'
            : (this.evaluation.status === 'under'
                ? 'ADD ' + (this.scenario.targetExponent - this.exponent) + ' HOST BIT(S)'
                : (this.evaluation.status === 'over'
                    ? 'REMOVE ' + (this.exponent - this.scenario.targetExponent) + ' HOST BIT(S)'
                    : 'SMALLEST VALID EXPONENT ACQUIRED'));
        ctx.fillText(footer, cx, box.y + box.h - 16 * m.scale);
        ctx.restore();
    }

    _drawCalculatorCard(ctx, box, m) {
        this._card(ctx, box, m, 'LIVE POWER CALCULATOR');
        const total = this.evaluation.totalAddresses;
        const usable = this.evaluation.usableHosts;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f1fbff';
        ctx.font = 'bold ' + Math.round(20 * m.scale) + 'px monospace';
        ctx.fillText('2^' + this.exponent + ' = ' + this._formatNumber(total), box.x + box.w * 0.5, box.y + box.h * 0.47);
        ctx.fillStyle = '#8db5be';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.fillText(this._formatNumber(total) + ' - 2 RESERVED', box.x + box.w * 0.5, box.y + box.h * 0.70);
        ctx.fillStyle = this._reactorColor();
        ctx.font = 'bold ' + Math.round(10 * m.scale) + 'px monospace';
        ctx.fillText(this._formatNumber(usable) + ' USABLE HOSTS', box.x + box.w * 0.5, box.y + box.h * 0.84);
    }

    _drawNeededCard(ctx, box, m) {
        this._card(ctx, box, m, 'NEEDED USABLE HOSTS');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + Math.round(25 * m.scale) + 'px monospace';
        ctx.fillText(this._formatNumber(this.scenario.requiredHosts), box.x + box.w * 0.5, box.y + box.h * 0.52);
        ctx.fillStyle = '#ffce69';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.fillText('ADDRESS DEMAND: ' + this._formatNumber(this.scenario.addressDemand), box.x + box.w * 0.5, box.y + box.h * 0.76);
        ctx.fillStyle = '#789ca6';
        ctx.fillText('BORROW AT TARGET: ' + this.scenario.classConfig.maxHostBits + ' - ' + this.scenario.targetExponent + ' = ' + this.scenario.bitsToBorrow + ' BITS', box.x + box.w * 0.5, box.y + box.h * 0.89);
    }

    _card(ctx, box, m, label) {
        this._roundedRect(ctx, box.x, box.y, box.w, box.h, 8 * m.scale);
        ctx.fillStyle = 'rgba(3, 14, 21, 0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(61, 134, 148, 0.42)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();
        ctx.fillStyle = '#6f9ba5';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, box.x + 12 * m.scale, box.y + 15 * m.scale);
    }

    _drawTimer(ctx, box, m) {
        const now = Date.now();
        const remaining = this.endsAt ? Math.max(0, this.endsAt - now) : this.durationMs;
        const ratio = Math.max(0, Math.min(1, remaining / this.durationMs));
        const seconds = Math.ceil(remaining / 1000);
        const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secondsText = String(seconds % 60).padStart(2, '0');
        const color = ratio > 0.5 ? '#54e9ff' : (ratio > 0.2 ? '#ffbf47' : '#ff315f');
        ctx.fillStyle = '#789ca6';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('ONE-MINUTE REACTOR WINDOW', box.x, box.y + 8 * m.scale);
        ctx.textAlign = 'right';
        ctx.fillStyle = color;
        ctx.font = 'bold ' + Math.round(12 * m.scale) + 'px monospace';
        ctx.fillText(minutesText + ':' + secondsText, box.x + box.w, box.y + 8 * m.scale);
        const railY = box.y + 23 * m.scale;
        const railH = 12 * m.scale;
        this._roundedRect(ctx, box.x, railY, box.w, railH, railH * 0.5);
        ctx.fillStyle = 'rgba(35, 61, 70, 0.82)';
        ctx.fill();
        if (ratio > 0) {
            this._roundedRect(ctx, box.x, railY, Math.max(railH, box.w * ratio), railH, railH * 0.5);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8 * m.scale;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    _drawFailure(ctx, m) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 2, 6, 0.74)';
        ctx.fillRect(0, 0, m.cW, m.cH);
        const w = Math.min(470 * m.scale, m.cW - 32 * m.scale);
        const h = 210 * m.scale;
        const x = (m.cW - w) * 0.5;
        const y = (m.cH - h) * 0.5;
        this._chamferPath(ctx, x, y, w, h, 15 * m.scale);
        ctx.fillStyle = 'rgba(18, 5, 12, 0.98)';
        ctx.fill();
        ctx.strokeStyle = '#ff315f';
        ctx.lineWidth = 1.5 * m.scale;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff6480';
        ctx.font = 'bold ' + Math.round(20 * m.scale) + 'px monospace';
        ctx.fillText('REACTOR WINDOW EXPIRED', x + w * 0.5, y + 42 * m.scale);
        ctx.fillStyle = '#d6e9ed';
        ctx.font = Math.round(10 * m.scale) + 'px monospace';
        ctx.fillText('Required: ' + this._formatNumber(this.scenario.requiredHosts) + ' usable hosts', x + w * 0.5, y + 78 * m.scale);
        ctx.fillText('Smallest correct power: 2^' + this.scenario.targetExponent + ' = ' + this._formatNumber(this.scenario.totalAddresses), x + w * 0.5, y + 98 * m.scale);
        ctx.fillStyle = '#ffcf67';
        ctx.fillText(this._formatNumber(this.scenario.totalAddresses) + ' - 2 = ' + this._formatNumber(this.scenario.usableHosts) + ' usable', x + w * 0.5, y + 118 * m.scale);
        this._buildFailureButtons(m, { x, y, w, h });
        for (let i = 0; i < this.buttons.length; i++) this._drawButton(ctx, this.buttons[i], m);
        ctx.restore();
    }

    _buildFailureButtons(m, card) {
        const w = card ? card.w : Math.min(470 * m.scale, m.cW - 32 * m.scale);
        const x = card ? card.x : (m.cW - w) * 0.5;
        const y = card ? card.y : (m.cH - 210 * m.scale) * 0.5;
        const buttonW = 150 * m.scale;
        const buttonH = 38 * m.scale;
        const gap = 14 * m.scale;
        const startX = x + (w - buttonW * 2 - gap) * 0.5;
        this.buttons = [
            { x: startX, y: y + 150 * m.scale, w: buttonW, h: buttonH, action: 'retry', label: 'RETRY (R)' },
            { x: startX + buttonW + gap, y: y + 150 * m.scale, w: buttonW, h: buttonH, action: 'exit', label: 'EXIT' },
        ];
    }

    _drawButton(ctx, button, m) {
        this._roundedRect(ctx, button.x, button.y, button.w, button.h, 5 * m.scale);
        ctx.fillStyle = button.action === 'retry' ? 'rgba(0, 105, 119, 0.9)' : 'rgba(91, 18, 36, 0.9)';
        ctx.fill();
        ctx.strokeStyle = button.action === 'retry' ? '#5eefff' : '#ff526e';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.stroke();
        ctx.fillStyle = '#f1fcff';
        ctx.font = 'bold ' + Math.round(10 * m.scale) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(button.label, button.x + button.w * 0.5, button.y + button.h * 0.5);
    }

    _drawStatusChip(ctx, rightX, y, label, color, m) {
        const text = String(label || '');
        ctx.save();
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px monospace';
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
        // Intentionally quiet when no dedicated effect is registered; the
        // automatic fire rate would make menu cursor sounds overwhelming.
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
    VERSION: 'ip-host-power-reactor-manager-20260821-02',
    _active: false,
    _activeAttempt: null,
    _introShown: false,
    _triggerLocks: {},

    createScenario(options) {
        return IPHostPowerRules.createScenario(options || {});
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

    _mapIdFor(options, spec) {
        const opts = options || {};
        const source = spec || opts.spec || {};
        return Number(opts.mapId || source.mapId || (Core && Core.Game && Core.Game.current && Core.Game.current.currentMapID)) || 11;
    },

    _handleObjective(spec, context, questManager) {
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
        const launchOptions = {
            spec,
            questId: spec.id,
            objectiveId: spec.objectiveId,
            mapId: Number(spec.mapId) || 11,
            _fromObjective: true,
            _reservedAttempt: attemptKey,
            showIntro: !!spec.tutorial && !this._introShown,
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
        const opts = options || {};
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;

        let scenario;
        try {
            const scenarioOptions = Object.assign({}, opts.spec || {}, opts);
            scenario = opts.scenario || this.createScenario(scenarioOptions);
        } catch (error) {
            this._active = false;
            this._activeAttempt = null;
            console.warn('[IP2Live] Host-Power Reactor scenario rejected:', error);
            return false;
        }

        const guidedTutorial = opts.guidedTutorial === true || opts.tutorial === true || !!(opts.spec && opts.spec.tutorial);
        const shouldShowIntro = guidedTutorial && opts.showIntro !== false;
        if (shouldShowIntro) this._introShown = true;

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
            const shown = tutorial.showIntro(scenario, openGameplay);
            if (shown) return true;
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

window.startHostPowerGameplayFourPointFive = function (options) {
    return HostPowerReactorGameplayManager.launchHostPowerReactorGameplay(options || {});
};

console.log('[IP2Live] ip_host_power_gameplay.js loaded.');
