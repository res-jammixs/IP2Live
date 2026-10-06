/**
 * IP2Live - Gameplay Five: Network Re-Segmentation
 * Recover a legacy allocation, subnet it, then secure the quarantine route.
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
        this.phase = 'classify';
        this.tutorialMode = !!this.options.tutorialMode;
        this.maxAttempts = this.tutorialMode ? 999999 : Math.max(1, Number(this.options.maxAttempts) || 3);
        this.attemptsUsed = 0;
        const virusConfig = this.options.virusConfig || {};
        this.virusConfig = {
            edgeBuffer: Math.max(0, Number(virusConfig.edgeBuffer) || 0),
            solutionBufferMin: Math.max(0, Number(virusConfig.solutionBufferMin) || 1),
            solutionBufferMax: Math.max(0, Number(virusConfig.solutionBufferMax) || 4),
        };
        this.directionWeights = { R: 1, L: 2, U: 3, D: 4 };
        this.problem = this.options.problem || this._generateProblem(this.options.spec || {});
        this._normalizeHostPowerProblem();
        this.directionWeights = this._normalizeDirectionWeights(this.problem.directionWeights || this.directionWeights);
        this._prepareSegmentation();
        this._initVirusSpread();
        this.path = [this._cloneTile(this.problem.start)];
        this.draggingPath = false;
        this.buttonRects = [];
        this.controlRects = {};
        this.confirmRect = null;
        this.hostPowerToolRect = null;
        this.hostPowerToolOpen = false;
        this.lastDiagnostic = null;
        this.statusText = 'Identify the IPv4 address class.';
        this.statusTone = 'idle';
        this.trace = null;
        this.tutorialStep = this.tutorialMode ? 1 : 0;
        this.tutorialPromptActive = false;
        this.tutorialStarted = false;
        this.tutorialSeenPhases = {};
        this.classMistakes = 0;
        this.classUnlockAt = 0;
        this.classUnlockSurface = null;
        this.classFormation = null;
    }

    _prepareSegmentation() {
        const p = this.problem;
        // Older saved problems were host-first. Preserve their route exponent
        // while deriving an equivalent minimum-subnet requirement.
        const requested = Number(p.requiredSubnets);
        p.requiredSubnets = Number.isInteger(requested) && requested > 0
            ? requested : (p.borrowedBits ? Math.pow(2, p.borrowedBits - 1) + 1 : 1);
        p.borrowedBits = Math.ceil(Math.log2(p.requiredSubnets));
        p.targetCIDR = p.originalCIDR + p.borrowedBits;
        if (p.targetCIDR > 30) throw new Error('Subnet requirement must leave at least two host bits.');
        p.targetHostBits = p.optimizedHostBits = p.targetAddedBits = 32 - p.targetCIDR;
        p.optimizedCapacity = this._capacityForHostBits(p.targetHostBits);
        p.requiredHosts = p.optimizedCapacity;
        p.allocatedSubnets = Math.pow(2, p.borrowedBits);
        // Display an allocated network address, never a host address posing as one.
        const octets = p.ipAddress.split('.').map(Number);
        for (let i = p.originalCIDR / 8; i < 4; i++) octets[i] = 0;
        p.ipAddress = octets.join('.');
        p.ipInt = octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
        p.allocatedCIDR = this._allocatedCIDR(p.ipInt, p.targetCIDR);
        if (!p.solutionPath || this._pathExponent(p.solutionPath) !== p.targetHostBits) {
            const route = this._generateSolutionRoute(p.start, p.targetHostBits, p.questIndex || 1,
                p.difficulty || this._difficultyProfile(p.questIndex || 1));
            if (!route) throw new Error('Unable to build a route for this subnet requirement.');
            p.solutionPath = route.path;
            p.solutionMoves = route.moves;
            p.end = this._cloneTile(route.path[route.path.length - 1]);
            p.solutionBufferKeys = this._buildSolutionBufferKeys(route.path);
            p.viruses = (p.viruses || []).filter((v) => !p.solutionBufferKeys[this._tileKey(v)]
                && !route.path.some((tile) => this._sameTile(v, tile)));
        }
        this.borrowedBits = 0;
        this.answer = '';
        this.reducedMotion = !!this.options.reducedMotion || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        this.phaseRevealAt = Date.now();
        this.routeRevealAt = 0;
        this.answerError = '';
        this.segmentationRects = [];
        const configured = this.options.timeLimitSeconds !== undefined ? this.options.timeLimitSeconds
            : (this.options.spec || {}).timeLimitSeconds;
        this.timeLimitSeconds = configured === 0 ? 0
            : (Number.isFinite(Number(configured)) && Number(configured) > 0 ? Number(configured) : 180);
        this.questElapsedMs = 0;
        this.lastUpdateAt = Date.now();
    }

    _generateProblem(spec) {
        const profile = spec && spec.profile ? spec.profile : {};
        const questIndex = Number(profile.index || 1) || 1;
        const difficulty = this._difficultyProfile(questIndex);
        // Choose once: route-generation retries must not bias the class mix.
        const classInfo = this._randomCIDRClass(difficulty, spec && spec.classOverride);
        const minAddedBits = Math.min(classInfo.maxAddedBits, Math.max(classInfo.minAddedBits, difficulty.minAddedBits));
        const borrowedBits = this._randomInt(minAddedBits, classInfo.maxAddedBits);
        for (let attempt = 0; attempt < 80; attempt++) {
            const directionWeights = this._randomDirectionWeights(questIndex, !!spec.tutorial);
            this.directionWeights = directionWeights;
            const targetCIDR = classInfo.originalCIDR + borrowedBits;
            const optimizedHostBits = Math.max(0, 32 - targetCIDR);
            const optimizedCapacity = this._capacityForHostBits(optimizedHostBits);
            const requiredHosts = this._randomRequiredHosts(optimizedHostBits);
            const ipAddress = this._randomIPForClass(classInfo.ipClass);
            const ipInt = this.tools && typeof this.tools.ipToInt === 'function' ? this.tools.ipToInt(ipAddress) : null;
            const start = this._randomStartTile(difficulty.edgeMargin);
            // Gameplay 4.5 teaches h in 2^h - 2. Gameplay 5 must therefore
            // make the route total equal h, not the number of borrowed bits.
            const solutionRoute = this._generateSolutionRoute(start, optimizedHostBits, questIndex, difficulty);
            if (!solutionRoute || !solutionRoute.path || solutionRoute.path.length < 3) continue;

            const solutionMoves = solutionRoute.moves;
            const solutionPath = solutionRoute.path;
            const cursor = this._cloneTile(solutionPath[solutionPath.length - 1]);
            if (this._sameTile(start, cursor) || this._manhattan(start, cursor) < Math.min(difficulty.minEndpointDistance, optimizedHostBits)) continue;

            const blockedKeys = {};
            for (let i = 0; i < solutionPath.length; i++) blockedKeys[this._tileKey(solutionPath[i])] = true;
            const edgeBuffer = this._virusEdgeBuffer();
            const solutionBufferKeys = this._buildSolutionBufferKeys(solutionPath);
            const viruses = [];
            this._addDefaultPathDecoyViruses(viruses, blockedKeys, start, cursor, solutionPath, solutionBufferKeys, edgeBuffer, questIndex);
            const desiredVirusCount = Math.min(difficulty.maxViruses, difficulty.baseViruses + questIndex * difficulty.virusStep);
            this._fillRandomViruses(viruses, blockedKeys, start, cursor, solutionBufferKeys, edgeBuffer, desiredVirusCount, 950);

            return {
                id: ['path-quarantine', questIndex, classInfo.ipClass, targetCIDR, Date.now(), Math.floor(Math.random() * 9999)].join(':'),
                questIndex,
                difficulty,
                directionWeights,
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
                requiredSubnets: this._randomInt(Math.pow(2, borrowedBits - 1) + 1, Math.pow(2, borrowedBits)),
                requiredHosts,
                targetAddedBits: optimizedHostBits,
                targetHostBits: optimizedHostBits,
                borrowedBits,
                targetCIDR,
                optimizedHostBits,
                optimizedCapacity,
                allocatedCIDR: this._allocatedCIDR(ipInt, targetCIDR),
            };
        }

        return this._fallbackProblem(Object.assign({}, spec, { classOverride: classInfo.ipClass, borrowedOverride: borrowedBits }), difficulty);
    }

    _normalizeHostPowerProblem() {
        const problem = this.problem || {};
        if (Number.isInteger(problem.requiredSubnets) && problem.requiredSubnets > 0) return;
        const requiredHosts = Math.max(1, Math.floor(Number(problem.requiredHosts) || 1));
        const classHostBits = Math.max(0, 32 - Number(problem.originalCIDR || 0));
        const targetHostBits = this._minimumHostBits(requiredHosts);
        const safeHostBits = Math.min(classHostBits, targetHostBits);
        const targetCIDR = 32 - safeHostBits;

        problem.requiredHosts = requiredHosts;
        problem.targetHostBits = safeHostBits;
        problem.targetAddedBits = safeHostBits;
        problem.optimizedHostBits = safeHostBits;
        problem.targetCIDR = targetCIDR;
        problem.borrowedBits = Math.max(0, targetCIDR - Number(problem.originalCIDR || 0));
        problem.optimizedCapacity = this._capacityForHostBits(safeHostBits);
        problem.allocatedCIDR = this._allocatedCIDR(problem.ipInt, targetCIDR);
        this.problem = problem;
    }

    _minimumHostBits(requiredHosts) {
        const required = Math.max(1, Math.floor(Number(requiredHosts) || 1));
        let bits = Math.max(1, Math.ceil(Math.log(required + 2) / Math.log(2)));
        while (this._capacityForHostBits(bits) < required && bits < 32) bits++;
        return bits;
    }

    _isPrerequisitePhase() {
        return ['classify', 'default_prefix', 'borrow_bits', 'new_cidr', 'host_bits', 'host_capacity'].includes(this.phase);
    }

    _updateQuestClock(now = Date.now()) {
        const delta = Math.max(0, now - this.lastUpdateAt);
        this.lastUpdateAt = now;
        if (this.finished || this._classUnlockActive(now) || this.tutorialPromptActive || this._isDialogueActive() || (IP2Live.GameplayPause && IP2Live.GameplayPause.menuOpen)) return;
        if (!this._isPrerequisitePhase() && this.phase !== 'build') return;
        this.questElapsedMs += delta;
        if (this.timeLimitSeconds && this.questElapsedMs >= this.timeLimitSeconds * 1000) {
            this.questElapsedMs = this.timeLimitSeconds * 1000;
            this._triggerVirusOverrun();
        }
    }

    _submitSegmentation(value) {
        this._updateQuestClock();
        if (this.finished || this._classUnlockActive() || this._classFormationActive()) return false;
        if (!this._isPrerequisitePhase()) return false;
        const p = this.problem;
        const raw = String(value === undefined ? this.answer : value).trim();
        if (this.phase === 'classify') {
            if (!raw) return false;
            const answer = raw.toUpperCase().match(/^(?:CLASS\s+)?([ABC])$/);
            if (!answer || answer[1] !== p.ipClass) {
                this.classMistakes++;
                this.answer = '';
                this._playCancel();
                if (this.classMistakes >= 3) {
                    const result = this._baseResult(this._pathStats());
                    result.reason = 'class_lockout';
                    result.classMistakes = this.classMistakes;
                    this._failOut(result);
                } else {
                    this._rerollClassLock();
                    this.answerError = 'ACCESS DENIED  //  ' + (3 - this.classMistakes) + ' ATTEMPTS LEFT';
                }
                return false;
            }
            this.classUnlockAt = this.reducedMotion ? 0 : Date.now();
            this.classUnlockSurface = null;
        }
        const numeric = /^\/?\d+$/.test(raw) ? Number(raw.replace('/', '')) : NaN;
        const expected = { default_prefix: p.originalCIDR, new_cidr: p.targetCIDR,
            host_bits: p.targetHostBits, host_capacity: p.optimizedCapacity };
        let correct = this.phase === 'classify' ? true : numeric === expected[this.phase];
        if (this.phase === 'borrow_bits') correct = this.borrowedBits === p.borrowedBits;
        if (!correct) {
            const hints = {
                default_prefix: 'Recall the legacy prefixes: A /8, B /16, C /24.',
                borrow_bits: this.borrowedBits < p.borrowedBits ? 'Too few subnets. Switch on another host bulb.' : 'Use the minimum bits; keep the remaining bits for hosts.',
                new_cidr: 'Add the starting prefix and your borrowed bits.',
                host_bits: 'IPv4 has 32 bits. Subtract your new prefix.',
                host_capacity: 'Calculate 2^h, then subtract network and broadcast addresses.',
            };
            this.answerError = hints[this.phase];
            this._playCancel();
            return false;
        }
        const next = { classify: 'default_prefix', default_prefix: 'borrow_bits', borrow_bits: 'new_cidr',
            new_cidr: 'host_bits', host_bits: 'host_capacity', host_capacity: 'build' };
        this.phase = next[this.phase];
        this.phaseRevealAt = Date.now();
        this.answer = '';
        this.answerError = '';
        if (this.phase === 'build') {
            this.routeRevealAt = Date.now();
            this._setStatus('Connect A to B. Match the target path total.', 'good');
        }
        this._playConfirm();
        return true;
    }

    _setBorrowedBits(bits) {
        if (this.phase !== 'borrow_bits') return;
        this.borrowedBits = Math.max(0, Math.min(30 - this.problem.originalCIDR, bits));
        this.answerError = '';
    }

    _rerollClassLock() {
        const oldViruses = this.problem.viruses.map((tile) => this._cloneTile(tile));
        const choices = ['A', 'B', 'C'].filter((letter) => letter !== this.problem.ipClass);
        const nextClass = choices[this._randomInt(0, choices.length - 1)];
        const elapsed = this.questElapsedMs;
        const profile = (this.options.spec && this.options.spec.profile) || { index: this.problem.questIndex || 1 };
        this.problem = this._generateProblem({ profile, classOverride: nextClass });
        this.directionWeights = this._normalizeDirectionWeights(this.problem.directionWeights || this.directionWeights);
        this._prepareSegmentation();
        this.questElapsedMs = elapsed;
        this.lastUpdateAt = Date.now();
        this._initVirusSpread();
        this.classFormation = this.reducedMotion ? null : { at: Date.now(), oldViruses };
        this.path = [this._cloneTile(this.problem.start)];
        this.answer = '';
    }

    _classFormationActive(now = Date.now()) {
        return !!this.classFormation && now - this.classFormation.at < 800;
    }

    _classUnlockActive(now = Date.now()) {
        return !!this.classUnlockAt && now - this.classUnlockAt < 1000;
    }

    _segmentationKey(upper) {
        const key = upper.replace(/^KEY/, '').replace(/^(DIGIT|NUMPAD)(\d)$/, '$2');
        if (this._classUnlockActive() || this._classFormationActive()) return true;
        if (this.phase === 'classify') {
            if (/^[A-Z]$/.test(key) && this.answer.length < 18) this.answer += key;
            if ((key === 'SPACE' || key === 'SPACEBAR' || key === ' ') && this.answer.length > 0 && this.answer.length < 18 && !this.answer.endsWith(' ')) this.answer += ' ';
            if (key === 'BACKSPACE' || key === 'DELETE') this.answer = this.answer.slice(0, -1);
            if (key === 'ENTER') this._submitSegmentation();
            if (key !== 'ENTER') this.answerError = '';
            return true;
        }
        if (key === 'H') { this._openHostPowerTool(); return true; }
        if (this.phase === 'borrow_bits') {
            if (key === 'ARROWRIGHT' || key === '+' || key === '=') this._setBorrowedBits(this.borrowedBits + 1);
            if (key === 'ARROWLEFT' || key === '-') this._setBorrowedBits(this.borrowedBits - 1);
            if (key === 'ENTER') this._submitSegmentation();
        } else {
            if (/^\d$/.test(key) && this.answer.length < 10) this.answer += key;
            if (key === 'BACKSPACE' || key === 'DELETE') this.answer = this.answer.slice(0, -1);
            if (key === 'ENTER') this._submitSegmentation();
        }
        return true;
    }

    _closeGameplayOverlay() {
        // The calculator is a separate scene and closes through its manager.
        // Returning false lets the shared pause handler open normally.
        return false;
    }

    _revealProgress(start, duration = 380) {
        if (this.reducedMotion || !start) return 1;
        const t = Math.min(1, Math.max(0, (Date.now() - start) / duration));
        return 1 - Math.pow(1 - t, 3);
    }

    onGameplayResume() {
        this.lastUpdateAt = Date.now();
    }

    _segmentationClick(x, y) {
        if (this._classUnlockActive() || this._classFormationActive()) return true;
        // Rebuild targets from current phase even if input arrives before paint.
        this._segmentationLayout(this._metrics());
        const hit = this.segmentationRects.find((r) => this._pointInRect(x, y, r));
        if (hit) {
            if (hit.action === 'submit') this._submitSegmentation();
            if (hit.action === 'bit') this._setBorrowedBits(hit.value <= this.borrowedBits ? hit.value - 1 : hit.value);
            if (hit.action === 'calculator') this._openHostPowerTool();
            if (hit.action === 'digit' && this.answer.length < 10) this.answer += hit.value;
            if (hit.action === 'erase') this.answer = this.answer.slice(0, -1);
            return true;
        }
        return this._isPrerequisitePhase();
    }

    _segmentationLayout(m) {
        this.segmentationRects = [];
        const add = (action, x, y, w, h, label, value) => {
            const rect = { action, x: x * m.sX, y: y * m.sY, w: w * m.sX, h: h * m.sY, label, value };
            this.segmentationRects.push(rect);
            return rect;
        };
        const classify = this.phase === 'classify';
        if (classify) {
            const { x, y, w, h } = this._classLockLayout().input;
            add('entry', x, y, w, h, 'CLASS ANSWER');
        } else if (this.phase === 'borrow_bits') {
            for (let bit = 0; bit < 32; bit++) {
                if (bit < this.problem.originalCIDR || bit >= 30) continue;
                add('bit', 667 + (bit % 8) * 57, 305 + Math.floor(bit / 8) * 43, 42, 42, '', bit - this.problem.originalCIDR + 1);
            }
            add('submit', 659, 527, 456, 36, 'VERIFY');
        } else if (['default_prefix', 'new_cidr', 'host_bits', 'host_capacity'].includes(this.phase)) {
            const y = 411, x = 646;
            for (let i = 0; i < 10; i++) add('digit', x + 26 + (i % 5) * 65, y + Math.floor(i / 5) * 45, 57, 38, String(i), String(i));
            add('erase', x + 356, y, 100, 38, 'DELETE');
            add('submit', x + 356, y + 45, 100, 38, 'VERIFY');
        }
        if (this._calculatorAvailable() && this.phase !== 'build') add('calculator', 1112, 144, 44, 44, 'CALCULATOR');
    }

    _terminalText(ctx, m, text, x, y, size = 13, color = '#B9CCD6', align = 'left', tracking = 0, face = '') {
        ctx.fillStyle = color;
        const assets = IP2Live.Assets || {};
        const family = face === 'Astronomous' && assets.astronomousLoaded ? 'Astronomous'
            : (assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'monospace');
        ctx.font = (family === 'Astronomous' ? 'bold ' : '500 ') + Math.round(size * m.sY) + 'px ' + family;
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
        const label = String(text);
        if (!tracking || label.length < 2 || typeof ctx.measureText !== 'function') {
            ctx.fillText(label, x * m.sX, y * m.sY);
            return;
        }
        // Explicit spacing keeps the same look in game runtimes without
        // CanvasRenderingContext2D.letterSpacing.
        const letters = Array.from(label);
        const widths = letters.map((letter) => ctx.measureText(letter).width);
        if (widths.some((width) => !Number.isFinite(width))) {
            ctx.fillText(label, x * m.sX, y * m.sY);
            return;
        }
        const gap = tracking * m.sX;
        const total = widths.reduce((sum, width) => sum + width, 0) + gap * (letters.length - 1);
        let cursor = x * m.sX - (align === 'center' ? total / 2 : align === 'right' ? total : 0);
        ctx.textAlign = 'left';
        letters.forEach((letter, i) => { ctx.fillText(letter, cursor, y * m.sY); cursor += widths[i] + gap; });
        ctx.textAlign = align;
    }

    // Projected glass uses one luminous edge, soft color and sparse scan lines.
    _holoPanel(ctx, m, x, y, w, h, accent = '#57CFE5') {
        ctx.save(); ctx.scale(m.sX, m.sY);
        const large = w >= 180 && h >= 48;
        const face = ctx.createLinearGradient(x, y, x + w, y + h);
        face.addColorStop(0, 'rgba(18,69,91,0.92)');
        face.addColorStop(0.34, 'rgba(7,27,47,0.93)');
        face.addColorStop(0.72, 'rgba(8,19,43,0.95)');
        face.addColorStop(1, 'rgba(51,32,86,0.84)');
        ctx.shadowColor = 'rgba(3,10,24,0.8)'; ctx.shadowBlur = large ? 23 : 12; ctx.shadowOffsetY = large ? 7 : 3;
        this._fillChamferRect(ctx, x, y, w, h, 10, face);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        this._strokeChamferRect(ctx, x, y, w, h, 10, 'rgba(96,191,223,0.32)', 0.8);
        ctx.save(); this._traceChamferPath(ctx, x, y, w, h, 10); ctx.clip();
        const left = ctx.createLinearGradient(x, y, x + Math.min(w * 0.35, 120), y);
        left.addColorStop(0, 'rgba(50,195,236,0.19)'); left.addColorStop(1, 'rgba(50,195,236,0)');
        ctx.fillStyle = left; ctx.fillRect(x, y, Math.min(w * 0.35, 120), h);
        const right = ctx.createLinearGradient(x + w - Math.min(w * 0.4, 150), y, x + w, y);
        right.addColorStop(0, 'rgba(135,103,234,0)'); right.addColorStop(1, 'rgba(135,103,234,0.18)');
        ctx.fillStyle = right; ctx.fillRect(x + w - Math.min(w * 0.4, 150), y, Math.min(w * 0.4, 150), h);
        for (let line = y + 6; line < y + h; line += 6) {
            ctx.fillStyle = 'rgba(150,218,247,0.027)'; ctx.fillRect(x, line, w, 0.55);
        }
        if (large) {
            // Restrained circuit traces and deterministic grain give the projection depth.
            ctx.strokeStyle = 'rgba(77,182,222,0.09)'; ctx.lineWidth = 0.7;
            for (let i = 0; i < 4; i++) {
                const yy = y + h * (0.22 + i * 0.17);
                ctx.beginPath(); ctx.moveTo(x + 12, yy); ctx.lineTo(x + Math.min(w * 0.11 + i * 8, 75), yy);
                ctx.lineTo(x + Math.min(w * 0.14 + i * 8, 95), yy - 9); ctx.stroke();
            }
            for (let i = 0; i < 26; i++) {
                const xx = x + 14 + ((i * 97 + Math.round(x)) % Math.max(1, w - 28));
                const yy = y + 12 + ((i * 47 + Math.round(y)) % Math.max(1, h - 24));
                ctx.fillStyle = i % 3 ? 'rgba(125,214,245,0.07)' : 'rgba(191,155,255,0.1)';
                ctx.fillRect(xx, yy, 1.1, 1.1);
            }
        }
        const shine = ctx.createLinearGradient(x, y, x + w, y);
        shine.addColorStop(0, 'rgba(107,237,255,0)'); shine.addColorStop(0.35, 'rgba(107,237,255,0.55)');
        shine.addColorStop(0.8, 'rgba(163,139,255,0.24)'); shine.addColorStop(1, 'rgba(163,139,255,0)');
        ctx.fillStyle = shine; ctx.fillRect(x, y, w, 1);
        ctx.restore();
        if (large) {
            const edge = ctx.createLinearGradient(x, y, x, y + h);
            edge.addColorStop(0, 'rgba(101,233,253,0)'); edge.addColorStop(0.35, 'rgba(101,233,253,0.43)');
            edge.addColorStop(0.7, 'rgba(101,233,253,0.12)'); edge.addColorStop(1, 'rgba(101,233,253,0)');
            ctx.fillStyle = edge; ctx.fillRect(x, y + 10, 1.2, h - 20);
            ctx.fillStyle = 'rgba(141,115,234,0.23)'; ctx.fillRect(x + w - 1.2, y + 14, 1.2, h - 28);
            ctx.fillStyle = 'rgba(76,189,221,0.12)'; ctx.fillRect(x + 12, y + h - 2, w - 24, 1);
        }
        ctx.strokeStyle = accent; ctx.lineWidth = 1.4;
        ctx.shadowColor = accent; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.moveTo(x, y + 23); ctx.lineTo(x, y + 10); ctx.lineTo(x + 10, y); ctx.lineTo(x + 30, y);
        ctx.moveTo(x + w - 30, y + h); ctx.lineTo(x + w - 10, y + h); ctx.lineTo(x + w, y + h - 10); ctx.lineTo(x + w, y + h - 23); ctx.stroke();
        if (w >= 350 && h >= 180) {
            // A few detached pixels keep large projections airy without
            // introducing visual noise around the text and controls.
            const drift = this.reducedMotion ? 0 : Math.sin(Date.now() / 1100 + x) * 1.3;
            const fragments = [
                [-4, 0.24, 3, '#77E8F2', 0.42], [-11, 0.24, 2, '#77E8F2', 0.25],
                [-5, 0.68, 2, '#77E8F2', 0.28], [w + 3, 0.38, 3, '#A890F3', 0.36],
                [w + 10, 0.38, 2, '#A890F3', 0.23], [w + 4, 0.77, 2, '#A890F3', 0.3],
            ];
            ctx.shadowBlur = 0;
            const baseAlpha = ctx.globalAlpha;
            fragments.forEach(([offsetX, ratio, size, color, opacity], i) => {
                ctx.globalAlpha = baseAlpha * opacity;
                ctx.fillStyle = color;
                ctx.fillRect(x + offsetX + (i % 2 ? -drift : drift), y + h * ratio + drift, size, size);
            });
            ctx.globalAlpha = baseAlpha;
        }
        ctx.restore();
    }


    _glassDisplay(ctx, m, x, y, w, h) {
        ctx.save(); ctx.scale(m.sX, m.sY);
        const glass = ctx.createLinearGradient(x, y, x + w, y + h);
        glass.addColorStop(0, 'rgba(29,105,137,0.24)');
        glass.addColorStop(0.6, 'rgba(6,26,47,0.6)');
        glass.addColorStop(1, 'rgba(75,53,122,0.19)');
        this._fillChamferRect(ctx, x, y, w, h, 6, glass);
        this._strokeChamferRect(ctx, x, y, w, h, 6, 'rgba(114,218,244,0.3)', 0.8);
        const light = ctx.createLinearGradient(x, y, x + w, y);
        light.addColorStop(0, 'rgba(72,211,243,0)'); light.addColorStop(0.5, 'rgba(123,235,255,0.6)'); light.addColorStop(1, 'rgba(150,129,249,0)');
        ctx.fillStyle = light; ctx.fillRect(x + 8, y + h - 1, w - 16, 1);
        ctx.restore();
    }


    _drawClassificationConsole(ctx, m) {
        this._drawDigitalClassLock(ctx, m);
    }

    _drawClassLockBackdrop(ctx, m) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 3, 7, 0.85)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }

    _classLockLayout() {
        return {
            panel: { x: 420, y: 256, w: 440, h: 208 },
            display: { x: 448, y: 282, w: 384, h: 66 },
            input: { x: 448, y: 366, w: 384, h: 34 },
            footerY: 432,
        };
    }

    _drawDigitalClassLock(ctx, m, accepted = false) {
        const { panel, display, input, footerY } = this._classLockLayout();
        const { x, y, w, h } = panel;
        const denied = this.answerError.startsWith('ACCESS DENIED');
        const accent = denied ? (this.classMistakes >= 2 ? '#DC7F87' : '#D7B078') : '#83BFC5';
        ctx.save(); ctx.scale(m.sX, m.sY);
        // A shallow smoked-glass instrument case: quiet edges, tight proportions.
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
        this._fillChamferRect(ctx, x, y + 3, w, h, 9, '#050D14');
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        const casing = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
        casing.addColorStop(0, '#1A2C36'); casing.addColorStop(0.48, '#101E28'); casing.addColorStop(1, '#0B1720');
        this._fillChamferRect(ctx, x, y, w, h, 9, casing);
        this._strokeChamferRect(ctx, x, y, w, h, 9, '#49646E', 0.8);
        this._strokeChamferRect(ctx, x + 3, y + 3, w - 6, h - 6, 7, 'rgba(136,192,200,0.1)', 0.6);
        const texture = this._classLockEtching();
        if (texture) ctx.drawImage(texture, x + 5, y + 5, w - 10, h - 10);
        // Thin reflected highlights sit flush with the housing, not floating tabs.
        const edge = ctx.createLinearGradient(x + 10, y, x + w - 10, y);
        edge.addColorStop(0, 'rgba(141,209,213,0)'); edge.addColorStop(0.23, 'rgba(141,209,213,0.65)');
        edge.addColorStop(0.65, 'rgba(141,209,213,0.12)'); edge.addColorStop(1, 'rgba(141,209,213,0)');
        ctx.fillStyle = edge; ctx.fillRect(x + 10, y, w - 20, 1);
        ctx.fillStyle = accent; ctx.fillRect(x + 28, y + 11, 27, 1);
        ctx.fillStyle = '#3E555F'; ctx.fillRect(x + 60, y + 11, 9, 1);
        for (let i = 0; i < 5; i++) ctx.fillRect(x + w - 48 + i * 4, y + 10, 1, 3);

        // Bevel slopes into the display well; the darker upper lip casts an inset shadow.
        const bezel = ctx.createLinearGradient(0, display.y - 4, 0, display.y + display.h + 4);
        bezel.addColorStop(0, '#040B10'); bezel.addColorStop(0.3, '#0A151D'); bezel.addColorStop(1, '#405960');
        this._fillChamferRect(ctx, display.x - 4, display.y - 4, display.w + 8, display.h + 8, 5, bezel);
        this._strokeChamferRect(ctx, display.x - 4, display.y - 4, display.w + 8, display.h + 8, 5, '#213740', 0.7);
        const lcd = ctx.createLinearGradient(0, display.y, 0, display.y + display.h);
        lcd.addColorStop(0, '#08191D'); lcd.addColorStop(0.55, '#112F34'); lcd.addColorStop(1, '#193B3E');
        this._fillChamferRect(ctx, display.x, display.y, display.w, display.h, 2, lcd);
        ctx.save(); this._traceChamferPath(ctx, display.x, display.y, display.w, display.h, 2); ctx.clip();
        ctx.fillStyle = 'rgba(123,184,174,0.04)';
        for (let py = display.y + 2; py < display.y + display.h; py += 3) ctx.fillRect(display.x, py, display.w, 0.6);
        for (let px = display.x + 2; px < display.x + display.w; px += 3) ctx.fillRect(px, display.y, 0.5, display.h);
        const inset = ctx.createLinearGradient(0, display.y, 0, display.y + 12);
        inset.addColorStop(0, 'rgba(0,0,0,0.65)'); inset.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = inset; ctx.fillRect(display.x, display.y, display.w, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.fillRect(display.x, display.y, 3, display.h);
        // The small diagonal glass reflection stays below the contrast of the digits.
        ctx.fillStyle = 'rgba(163,214,207,0.025)';
        ctx.beginPath(); ctx.moveTo(display.x + 220, display.y); ctx.lineTo(display.x + 266, display.y);
        ctx.lineTo(display.x + 224, display.y + display.h); ctx.lineTo(display.x + 178, display.y + display.h); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(149,195,184,0.2)'; ctx.fillRect(display.x + 2, display.y + display.h - 1, display.w - 4, 0.6);

        // A conventional text field: rectangular recess, inner padding and a fine focus edge.
        ctx.fillStyle = '#060F17'; ctx.fillRect(input.x, input.y, input.w, input.h);
        ctx.strokeStyle = denied ? accent : '#466671'; ctx.lineWidth = 0.8;
        ctx.strokeRect(input.x + 0.5, input.y + 0.5, input.w - 1, input.h - 1);
        ctx.fillStyle = '#030A10'; ctx.fillRect(input.x + 1, input.y + 1, input.w - 2, 2);
        ctx.fillStyle = accent; ctx.fillRect(input.x + 1, input.y + input.h - 1, input.w - 2, 1);
        // The instruction and attempt LEDs share one compact footer baseline.
        ctx.fillStyle = 'rgba(115,151,165,0.16)'; ctx.fillRect(input.x, footerY - 18, input.w, 0.6);
        ctx.strokeStyle = 'rgba(122,167,178,0.18)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x + 28, y + h - 19); ctx.lineTo(x + 114, y + h - 19);
        ctx.lineTo(x + 120, y + h - 13); ctx.lineTo(x + 146, y + h - 13); ctx.stroke();
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = i === 0 ? '#658891' : '#2F4652';
            ctx.fillRect(x + w - 53 + i * 4, y + h - 17, 1, 4);
        }
        ctx.restore();

        ctx.save(); ctx.shadowColor = 'rgba(151,221,201,0.35)'; ctx.shadowBlur = 3 * m.sX;
        this._terminalText(ctx, m, this.problem.ipAddress, display.x + display.w / 2, display.y + 42,
            24, '#B1DCCF', 'center', 0.7);
        ctx.restore();
        const value = accepted ? 'CLASS ' + this.problem.ipClass : this.answer || 'CLASS _';
        ctx.save();
        this._terminalText(ctx, m, value, input.x + 13, input.y + 22, 15,
            accepted || this.answer ? '#C9DFE4' : '#708C99');
        if (!accepted && (this.reducedMotion || Math.floor(Date.now() / 500) % 2 === 0)) {
            // With an empty field, the caret precedes the existing placeholder.
            const textWidth = this.answer ? ctx.measureText(value).width || value.length * 8 * m.sX : 0;
            const caretX = (input.x + (this.answer ? 16 : 10)) * m.sX + textWidth;
            ctx.fillStyle = '#8DC4CB'; ctx.fillRect(caretX, (input.y + 10) * m.sY, m.sX, 15 * m.sY);
        }
        ctx.restore();
        this._terminalText(ctx, m, 'Enter IP Address to unlock.', input.x, footerY + 4, 11, '#91AAB5');
        this._drawClassAttemptRings(ctx, m);
    }

    _classLockEtching() {
        if (this.classLockEtching) return this.classLockEtching;
        if (typeof document === 'undefined') return null;
        const surface = document.createElement('canvas');
        surface.width = 880; surface.height = 464;
        const ink = surface.getContext('2d');
        if (!ink) return null;
        // Cached brushed grain stays subtle and never consumes gameplay randomness.
        let seed = 517;
        const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        for (let i = 0; i < 12000; i++) {
            ink.fillStyle = i % 3 ? 'rgba(169,202,214,0.035)' : 'rgba(0,3,10,0.10)';
            ink.fillRect(random() * surface.width, random() * surface.height, 1 + random() * 3, 0.7);
        }
        this.classLockEtching = surface;
        return surface;
    }

    _drawClassAttemptRings(ctx, m) {
        const remaining = Math.max(0, 3 - this.classMistakes);
        const { input, footerY } = this._classLockLayout();
        const color = remaining === 3 ? '#82BFC3' : remaining === 2 ? '#D7B078' : '#DC7F87';
        ctx.save(); ctx.scale(m.sX, m.sY);
        for (let i = 0; i < 3; i++) {
            const active = i < remaining;
            const cx = input.x + input.w - 55 + i * 24;
            ctx.fillStyle = '#07121A'; ctx.strokeStyle = active ? '#527D84' : '#2F414C'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(cx, footerY, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            if (active) {
                ctx.shadowColor = color; ctx.shadowBlur = 3;
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, footerY, 2.8, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                ctx.strokeStyle = '#4C626E'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(cx - 2, footerY + 2); ctx.lineTo(cx + 2, footerY - 2); ctx.stroke();
            }
        }
        ctx.restore();
    }

    _drawClassUnlockTransition(ctx, m) {
        if (!this._classUnlockActive()) return;
        const t = Math.max(0, Math.min(1, (Date.now() - this.classUnlockAt) / 1000));
        const width = ctx.canvas.width, height = ctx.canvas.height;
        // Capture only the accepted pane once; slice the pixels, including its
        // lettering and rings, so the actual popup tears apart as it fades.
        if ((!this.classUnlockSurface || this.classUnlockSurface.width !== width
            || this.classUnlockSurface.height !== height) && typeof document !== 'undefined') {
            const surface = document.createElement('canvas');
            surface.width = width; surface.height = height;
            const ink = surface.getContext('2d');
            if (ink) {
                this._drawDigitalClassLock(ink, m, true);
                this.classUnlockSurface = surface;
            }
        }
        const dissolve = Math.max(0, Math.min(1, (t - 0.12) / 0.76));
        const frame = Math.floor(t * 1000 / 45);
        ctx.save();
        ctx.globalAlpha = 1 - t;
        this._drawClassLockBackdrop(ctx, m);
        const opacity = Math.pow(1 - dissolve, 1.25);
        const { panel } = this._classLockLayout();
        const bandHeight = (panel.h + 64) * m.sY / 24;
        for (let i = 0; i < 24; i++) {
            const hash = Math.abs(Math.sin(i * 17.13 + 1) * 43758.5453) % 1;
            if (dissolve > 0.35 && hash < (dissolve - 0.35) / 0.65) continue;
            const jitter = Math.sin(i * 43.7 + frame * 2.4);
            const offset = (i % 4 === frame % 4 ? 1 : 0.18) * jitter * 52 * dissolve * m.sX;
            const sy = (panel.y - 24) * m.sY + i * bandHeight;
            ctx.globalAlpha = opacity * (0.8 + hash * 0.2);
            if (this.classUnlockSurface) {
                ctx.drawImage(this.classUnlockSurface, 0, sy, width, bandHeight,
                    offset, sy, width, bandHeight);
            } else {
                ctx.save(); ctx.beginPath(); ctx.rect(0, sy, width, bandHeight); ctx.clip();
                ctx.translate(offset, 0); this._drawDigitalClassLock(ctx, m, true); ctx.restore();
            }
            // Thin chromatic separation at displaced bands; no full-screen flash.
            if (dissolve > 0 && i % 4 === frame % 4) {
                ctx.globalAlpha = opacity * 0.4;
                ctx.fillStyle = i % 2 ? '#CB8BEE' : '#76F9F1';
                ctx.fillRect((panel.x + 28) * m.sX + offset, sy, (65 + hash * 200) * m.sX, m.sY);
            }
        }
        ctx.globalAlpha = opacity * dissolve;
        for (let i = 0; i < 42; i++) {
            const side = i % 2 ? -1 : 1;
            const px = panel.x + panel.w / 2 + side * (120 + (i * 47) % 100 + dissolve * 60);
            const py = panel.y + (i * 67) % panel.h;
            ctx.fillStyle = i % 3 ? '#7BEFEF' : '#C899F1';
            ctx.fillRect(px * m.sX, py * m.sY, (2 + i % 5 * 3) * m.sX, (1 + i % 3) * m.sY);
        }
        ctx.restore();
    }

    _drawNetworkSummary(ctx, m, p, showPrefix) {
        ctx.save(); ctx.scale(m.sX, m.sY);
        const x = 610, y = 145, w = 554, h = 42;
        const face = ctx.createLinearGradient(x, y, x + w, y + h);
        face.addColorStop(0, 'rgba(15,83,111,0.68)');
        face.addColorStop(0.65, 'rgba(8,30,56,0.67)');
        face.addColorStop(1, 'rgba(43,31,88,0.58)');
        this._fillChamferRect(ctx, x, y, w, h, 7, face);
        this._strokeChamferRect(ctx, x, y, w, h, 7, 'rgba(112,219,239,0.36)', 0.9);
        ctx.fillStyle = '#65E4ED'; ctx.fillRect(x + 9, y + 11, 2, 19);
        ctx.fillStyle = 'rgba(113,217,236,0.25)'; ctx.fillRect(x + 20, y + h - 4, 353, 1);
        const pill = ctx.createLinearGradient(1014, y + 5, 1150, y + 36);
        pill.addColorStop(0, 'rgba(38,108,135,0.52)');
        pill.addColorStop(1, 'rgba(55,41,109,0.46)');
        this._fillChamferRect(ctx, 1014, y + 5, 136, 32, 6, pill);
        this._strokeChamferRect(ctx, 1014, y + 5, 136, 32, 6, 'rgba(231,208,114,0.58)', 0.9);
        ctx.fillStyle = '#F4D975'; ctx.fillRect(1022, y + 13, 2, 16);
        ctx.restore();
        this._terminalText(ctx, m, 'ALLOCATED NETWORK', 633, 160, 8, '#91C2D2', 'left', 1.2);
        this._terminalText(ctx, m, p.ipAddress + (showPrefix ? '/' + p.originalCIDR : ''), 633, 180, 18, '#E9FAFF', 'left', 0.55);
        this._terminalText(ctx, m, 'CLASS ' + p.ipClass, 1082, 171, 12, '#F6DF8C', 'center', 0.8);
    }

    _drawPrerequisiteGlyph(ctx, index, x, y, scale) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 1.35;
        if (index === 0) {
            // Three address classes.
            [-5, 0, 5].forEach((dx, i) => ctx.strokeRect(dx - 1.6, 2 - i * 2, 3.2, 4 + i * 2));
        } else if (index === 1) {
            ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(4, -6); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(6, -6); ctx.moveTo(-6, 6); ctx.lineTo(-2, 6); ctx.stroke();
        } else if (index === 2) {
            ctx.strokeRect(-7, -3, 4, 6); ctx.strokeRect(3, -3, 4, 6);
            ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(2, 0); ctx.moveTo(0, -2); ctx.lineTo(2, 0); ctx.lineTo(0, 2); ctx.stroke();
        } else if (index === 3) {
            ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(3, -6); ctx.stroke();
            ctx.strokeRect(2, 1, 5, 5);
        } else if (index === 4) {
            [-5, 0, 5].forEach((dx) => ctx.strokeRect(dx - 1.3, -4, 2.6, 8));
        } else {
            ctx.beginPath(); ctx.arc(0, -4, 2.2, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-4, 5); ctx.quadraticCurveTo(0, 0, 4, 5); ctx.stroke();
            ctx.beginPath(); ctx.arc(-6, 1, 1.4, 0, Math.PI * 2); ctx.arc(6, 1, 1.4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }

    _drawPrerequisiteProgress(ctx, m, current, compact = false) {
        const labels = ['CLASS', 'PREFIX', 'BORROW', 'CIDR', 'BITS', 'HOSTS'];
        const x0 = compact ? 799 : 645;
        const gap = compact ? 23 : 96;
        const y = compact ? 196 : 209;
        const radius = compact ? 9 : 12;
        ctx.save(); ctx.scale(m.sX, m.sY);
        const baseAlpha = ctx.globalAlpha;
        for (let i = 0; i < 6; i++) {
            const x = x0 + i * gap;
            const complete = i < current;
            const active = i === current;
            const color = active ? '#F5D878' : complete ? '#70E7EF' : '#69869F';
            if (i < 5) {
                ctx.strokeStyle = complete ? 'rgba(102,221,232,0.62)' : 'rgba(87,126,154,0.34)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x + radius + 3, y); ctx.lineTo(x + gap - radius - 3, y); ctx.stroke();
            }
            const fill = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, radius + 2);
            fill.addColorStop(0, active ? 'rgba(121,91,35,0.42)' : complete ? 'rgba(32,116,134,0.57)' : 'rgba(20,45,69,0.7)');
            fill.addColorStop(1, 'rgba(8,22,40,0.86)');
            ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = color; ctx.globalAlpha = baseAlpha * (active ? 0.98 : complete ? 0.85 : 0.48);
            ctx.lineWidth = active ? 1.5 : 1;
            if (active) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
            ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = baseAlpha;
            ctx.strokeStyle = color; ctx.fillStyle = color;
            ctx.globalAlpha = baseAlpha * (active || complete ? 1 : 0.56);
            this._drawPrerequisiteGlyph(ctx, i, x, y, compact ? 0.66 : 0.9);
            ctx.globalAlpha = baseAlpha;
        }
        ctx.restore();
        if (!compact) labels.forEach((label, i) => {
            this._terminalText(ctx, m, label, x0 + i * gap, 233, 8, i === current ? '#EED58B' : i < current ? '#A1E3E9' : '#7898A9', 'center', 0.55);
        });
    }

    _drawPhaseTitle(ctx, m, step, title, reveal) {
        ctx.save(); ctx.scale(m.sX, m.sY);
        const x = 610, y = 243, w = 554, h = 33;
        const face = ctx.createLinearGradient(x, y, x + w, y);
        face.addColorStop(0, 'rgba(39,116,136,0.32)');
        face.addColorStop(0.65, 'rgba(19,41,70,0.33)');
        face.addColorStop(1, 'rgba(88,55,130,0.14)');
        this._fillChamferRect(ctx, x, y, w, h, 6, face);
        ctx.strokeStyle = 'rgba(105,189,215,0.24)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x + 58, y + h - 1); ctx.lineTo(x + w - 12, y + h - 1); ctx.stroke();
        const badge = ctx.createLinearGradient(x + 8, y + 4, x + 54, y + h - 4);
        badge.addColorStop(0, 'rgba(231,194,83,0.25)'); badge.addColorStop(1, 'rgba(68,56,46,0.42)');
        this._fillChamferRect(ctx, x + 8, y + 4, 45, h - 8, 4, badge);
        this._strokeChamferRect(ctx, x + 8, y + 4, 45, h - 8, 4, 'rgba(242,215,114,0.64)', 0.8);
        ctx.restore();
        this._terminalText(ctx, m, String(step).padStart(2, '0'), 640, 266, 16, '#FFE390', 'center', 0.6);
        this._terminalText(ctx, m, title, 904 + (1 - reveal) * 8, 265, 17, '#E9F8FD', 'center', 0.7, 'Astronomous');
    }

    _lockVisualState() {
        const phases = ['classify', 'default_prefix', 'borrow_bits', 'new_cidr', 'host_bits', 'host_capacity'];
        const index = phases.indexOf(this.phase);
        const verified = index >= 0 ? index : 6;
        const reveal = this._revealProgress(verified === 6 ? this.routeRevealAt : this.phaseRevealAt, 650);
        return { verified, progress: verified ? verified - 1 + reveal : 0,
            open: verified === 6 ? reveal : 0 };
    }

    _drawLockIcon(ctx, m, state) {
        const cx = (m.gridX + m.gridSize / 2) / m.sX;
        const cy = (m.gridY + m.gridSize / 2) / m.sY - 10;
        const drift = this.reducedMotion ? 0 : Math.sin(Date.now() / 800) * 2;
        const color = state.open ? '#92F9E0' : '#77E6FF';
        ctx.save(); ctx.scale(m.sX, m.sY); ctx.translate(cx, cy + drift);
        const aura = ctx.createRadialGradient(0, 0, 20, 0, 0, 150);
        aura.addColorStop(0, 'rgba(8,25,51,0.98)'); aura.addColorStop(0.6, 'rgba(7,22,44,0.88)'); aura.addColorStop(1, 'rgba(8,22,44,0)');
        ctx.fillStyle = aura; ctx.fillRect(-150, -150, 300, 300);
        ctx.save(); ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = 'rgba(118,200,235,0.17)'; ctx.lineWidth = 0.8;
        ctx.strokeRect(-67, -67, 134, 134);
        ctx.strokeStyle = 'rgba(118,200,235,0.1)';
        ctx.strokeRect(-55, -55, 110, 110);
        ctx.restore();
        // Six separate arcs release one by one as answers are accepted.
        ctx.lineCap = 'round'; ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
            const start = -Math.PI / 2 + i * Math.PI / 3 + 0.075;
            const span = Math.PI / 3 - 0.15;
            ctx.strokeStyle = 'rgba(107,167,217,0.2)';
            ctx.beginPath(); ctx.arc(0, 0, 86, start, start + span); ctx.stroke();
            const fill = Math.min(1, Math.max(0, state.progress - i));
            if (fill > 0) {
                ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.arc(0, 0, 86, start, start + span * fill); ctx.stroke(); ctx.shadowBlur = 0;
            }
        }
        ctx.strokeStyle = 'rgba(162,148,255,0.4)'; ctx.lineWidth = 0.8;
        const orbit = this.reducedMotion ? 0 : Date.now() / 5500;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(0, 0, 98, orbit + i * Math.PI * 2 / 3, orbit + i * Math.PI * 2 / 3 + 0.34); ctx.stroke();
        }
        for (let i = 0; i < 6; i++) {
            const angle = -Math.PI / 2 + (i + 0.5) * Math.PI / 3;
            const x = Math.cos(angle) * 104, y = Math.sin(angle) * 104;
            ctx.fillStyle = state.progress >= i + 1 ? '#9CE9EE' : 'rgba(111,158,190,0.38)';
            ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.save();
        // The left post is the hinge. The right post swings clear on unlock.
        ctx.translate(-23, -4 - state.progress * 0.6);
        ctx.rotate(-state.open * 0.72);
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.arc(23, -22, 23, Math.PI, 0); ctx.lineTo(46, 0); ctx.stroke();
        ctx.restore();
        const body = ctx.createLinearGradient(-34, -8, 34, 45);
        body.addColorStop(0, 'rgba(62,173,215,0.2)'); body.addColorStop(1, 'rgba(95,81,200,0.14)');
        this._fillChamferRect(ctx, -34, -8, 68, 52, 7, body);
        ctx.shadowColor = color; ctx.shadowBlur = 12;
        this._strokeChamferRect(ctx, -34, -8, 68, 52, 7, color, 1.6);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 13, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-1.4, 16, 2.8, 10);
        ctx.strokeStyle = 'rgba(150,226,248,0.22)'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(-27, 1 + i * 12); ctx.lineTo(-14, 1 + i * 12); ctx.moveTo(14, 1 + i * 12); ctx.lineTo(27, 1 + i * 12); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        const scan = this.reducedMotion ? 18 : (Date.now() / 45) % 40;
        ctx.fillStyle = 'rgba(125,228,255,0.18)'; ctx.fillRect(-27, -3 + scan, 54, 0.8);
        ctx.restore();
        this._terminalText(ctx, m, state.open ? 'ROUTING UNLOCKED' : 'ROUTING LOCKED', cx, cy + 124, 12, '#B7DFEE', 'center');
        if (!state.open) this._terminalText(ctx, m, state.verified + ' / 6', cx, cy + 146, 14, '#78DCEA', 'center');
    }


    _drawQuarantineLock(ctx, m) {
        this._drawLockIcon(ctx, m, this._lockVisualState());
    }

    _drawVirusFooter(ctx, m) {
        const density = Math.round(this._virusDensity() * 100);
        ctx.save(); ctx.scale(m.sX, m.sY);
        const face = ctx.createLinearGradient(96, 584, 536, 620);
        face.addColorStop(0, 'rgba(5,24,42,0.92)');
        face.addColorStop(1, 'rgba(15,23,49,0.85)');
        ctx.fillStyle = face; ctx.fillRect(96, 585, 440, 35);
        ctx.fillStyle = 'rgba(100,202,225,0.27)'; ctx.fillRect(104, 585, 424, 1);
        ctx.fillStyle = 'rgba(122,170,198,0.22)'; ctx.fillRect(234, 600, 286, 5);
        ctx.fillStyle = '#D4829A'; ctx.fillRect(234, 600, 286 * density / 100, 5);
        ctx.restore();
        this._terminalText(ctx, m, 'INFECTED ' + density + '%', 112, 608, 10, '#E8A998', 'left', 0.25);
    }


    _drawBitSocket(ctx, m, x, y, kind) {
        const on = kind !== 'host', borrowed = kind === 'borrowed';
        const radius = 12.5;
        const color = borrowed ? '#FFE600' : '#65D8EC';
        const pulse = this.reducedMotion ? 1 : 0.84 + 0.16 * Math.sin(Date.now() / 520 + x * 0.08);
        ctx.save(); ctx.scale(m.sX, m.sY);
        if (on) {
            const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 2.2);
            glow.addColorStop(0, borrowed ? 'rgba(255,230,0,' + (0.5 + pulse * 0.25) + ')' : 'rgba(79,208,236,' + (0.32 + pulse * 0.17) + ')');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2); ctx.fill();
        }
        // Match Gameplay 4's recessed lamp geometry; the fixed bits use cyan.
        const socket = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.08, x, y, radius * 1.4);
        socket.addColorStop(0, '#A8BCC3'); socket.addColorStop(0.36, '#30444E');
        socket.addColorStop(0.68, '#08151D'); socket.addColorStop(1, '#546A76');
        ctx.fillStyle = socket; ctx.beginPath(); ctx.arc(x, y, radius * 1.4, 0, Math.PI * 2); ctx.fill();
        const face = ctx.createRadialGradient(x - 4, y - 5, 0, x, y, radius);
        face.addColorStop(0, on ? (borrowed ? '#FFFFBD' : '#D4FBFF') : '#253944');
        face.addColorStop(0.55, on ? color : '#162B36');
        face.addColorStop(1, on ? (borrowed ? '#A67C24' : '#2A8296') : '#101E27');
        ctx.globalAlpha = on ? 0.78 + pulse * 0.22 : 1;
        ctx.fillStyle = face; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = on ? (borrowed ? '#FFF4A0' : '#B6F8FF') : '#526D78';
        ctx.lineWidth = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawHoloKey(ctx, m, r) {
        const x = r.x / m.sX, y = r.y / m.sY, w = r.w / m.sX, h = r.h / m.sY;
        const hover = this._hoverPoint && this._pointInRect(this._hoverPoint.x, this._hoverPoint.y, r);
        const submit = r.action === 'submit';
        const accent = submit ? '#F3D777' : r.action === 'erase' ? '#B69CE9' : '#72DDEB';
        ctx.save(); ctx.scale(m.sX, m.sY);
        ctx.beginPath(); ctx.moveTo(x + 11, y); ctx.lineTo(x + w - 13, y);
        ctx.lineTo(x + w, y + 9); ctx.lineTo(x + w - 6, y + h);
        ctx.lineTo(x + 7, y + h); ctx.lineTo(x, y + h - 9); ctx.closePath();
        const face = ctx.createLinearGradient(x, y, x + w, y + h);
        face.addColorStop(0, hover ? 'rgba(30,132,156,0.94)' : 'rgba(18,79,106,0.84)');
        face.addColorStop(0.62, 'rgba(8,30,54,0.94)');
        face.addColorStop(1, submit ? 'rgba(95,70,79,0.8)' : 'rgba(65,44,109,0.82)');
        ctx.shadowColor = hover ? accent : 'rgba(0,8,22,0.9)';
        ctx.shadowBlur = hover ? 12 : 8; ctx.shadowOffsetY = hover ? 0 : 3;
        ctx.fillStyle = face; ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = hover ? accent : 'rgba(104,195,220,0.55)';
        ctx.lineWidth = hover ? 1.5 : 0.9; ctx.stroke();
        ctx.save(); ctx.clip();
        const wash = ctx.createLinearGradient(x, y, x + Math.min(w, 95), y);
        wash.addColorStop(0, submit ? 'rgba(244,216,113,0.19)' : 'rgba(95,229,245,0.17)');
        wash.addColorStop(1, 'rgba(100,210,244,0)');
        ctx.fillStyle = wash; ctx.fillRect(x, y, Math.min(w, 95), h);
        for (let yy = y + 6; yy < y + h; yy += 7) {
            ctx.fillStyle = 'rgba(146,224,240,0.035)'; ctx.fillRect(x, yy, w, 0.6);
        }
        ctx.restore();
        ctx.strokeStyle = accent; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(x + 11, y + 1); ctx.lineTo(x + Math.min(w * 0.28, 45), y + 1);
        ctx.moveTo(x + w - Math.min(w * 0.25, 40), y + h - 1);
        ctx.lineTo(x + w - 7, y + h - 1); ctx.stroke();
        ctx.restore();
    }

    _drawCornerCalculator(ctx, m, r) {
        if (!r || !this._calculatorAvailable()) return;
        const x = r.x / m.sX, y = r.y / m.sY, w = r.w / m.sX, h = r.h / m.sY;
        const hover = this._hoverPoint && this._pointInRect(this._hoverPoint.x, this._hoverPoint.y, r);
        ctx.save(); ctx.scale(m.sX, m.sY);
        const face = ctx.createLinearGradient(x, y, x + w, y + h);
        face.addColorStop(0, hover ? 'rgba(32,122,148,0.97)' : 'rgba(21,77,105,0.93)');
        face.addColorStop(1, 'rgba(23,30,65,0.96)');
        ctx.shadowColor = hover ? '#78EBF2' : 'rgba(4,13,27,0.88)';
        ctx.shadowBlur = hover ? 13 : 8; ctx.shadowOffsetY = hover ? 0 : 3;
        this._fillChamferRect(ctx, x, y, w, h, 6, face);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        this._strokeChamferRect(ctx, x, y, w, h, 6, hover ? '#A6F5F7' : '#69D4E8', hover ? 1.5 : 1);
        ctx.fillStyle = '#86EAF1'; ctx.fillRect(x + 8, y + 1, 18, 2);
        this._fillChamferRect(ctx, x + 10, y + 7, 24, 31, 2, '#081B27');
        this._strokeChamferRect(ctx, x + 10, y + 7, 24, 31, 2, '#7297A5', 0.8);
        ctx.fillStyle = '#193B40'; ctx.fillRect(x + 13, y + 10, 18, 9);
        ctx.fillStyle = '#A5D7CE';
        for (let i = 0; i < 3; i++) { ctx.fillRect(x + 18 + i * 4, y + 12, 2, 1); ctx.fillRect(x + 18 + i * 4, y + 15, 2, 1); }
        ctx.fillStyle = '#9FBFCC';
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 3; col++) ctx.fillRect(x + 14 + col * 6, y + 23 + row * 6, 4, 3);
        }
        ctx.fillStyle = '#D5C485'; ctx.fillRect(x + 26, y + 29, 4, 5);
        ctx.restore();
    }

    _drawSegmentationButtons(ctx, m) {
        for (const r of this.segmentationRects) {
            if (r.action === 'bit') continue;
            if (r.action === 'calculator') { this._drawCornerCalculator(ctx, m, r); continue; }
            if (['digit', 'erase', 'submit'].includes(r.action)) {
                this._drawHoloKey(ctx, m, r);
                this._terminalText(ctx, m, r.label, (r.x + r.w / 2) / m.sX, (r.y + r.h / 2) / m.sY + 5,
                    r.action === 'digit' ? 14 : 11, r.action === 'submit' ? '#FFE58B' : '#D8F8FA', 'center', r.action === 'digit' ? 0 : 0.55);
                continue;
            }
        }
    }

    _drawSegmentation(ctx, m) {
        this._segmentationLayout(m);
        const p = this.problem;
        const dark = this.phase === 'classify';
        ctx.save();
        ctx.fillStyle = dark ? 'rgba(2,7,12,0.92)' : 'rgba(2,7,12,0.48)';
        ctx.fillRect(m.gridX, m.gridY, m.gridSize, m.gridSize);
        const reveal = this._revealProgress(this.phaseRevealAt);
        ctx.globalAlpha = 0.25 + 0.75 * reveal;
        if (dark) {
            this._drawClassificationConsole(ctx, m);
        } else {
            this._holoPanel(ctx, m, 590, 134, 594, 496, '#496371');
            const phases = ['default_prefix', 'borrow_bits', 'new_cidr', 'host_bits', 'host_capacity'];
            const n = phases.indexOf(this.phase);
            this._drawQuarantineLock(ctx, m);
            this._drawNetworkSummary(ctx, m, p, n > 0);
            this._drawPrerequisiteProgress(ctx, m, n + 1);
            const titles = { default_prefix: 'DEFAULT CLASSFUL PREFIX', borrow_bits: 'BORROW THE MINIMUM BITS',
                new_cidr: 'ENTER THE NEW PREFIX', host_bits: 'REMAINING HOST BITS', host_capacity: 'USABLE HOSTS PER SUBNET' };
            this._drawPhaseTitle(ctx, m, n + 2, titles[this.phase], reveal);
            if (this.phase === 'borrow_bits') this._drawBitPanel(ctx, m);
            else {
                const hints = { default_prefix: 'Enter the default prefix for Class ' + p.ipClass + '.', new_cidr: 'Starting /' + p.originalCIDR + ' + ' + this.borrowedBits + ' borrowed bits',
                    host_bits: 'New prefix /' + p.targetCIDR + '  |  IPv4 has 32 bits.', host_capacity: p.targetHostBits + ' host bits remain. Use 2^h - 2.' };
                this._terminalText(ctx, m, hints[this.phase], 887, 311, 13, '#BAD1DC', 'center', 0.35);
                this._drawEntryDeck(ctx, m);
                this._drawAnswer(ctx, m, 672, 331, 430, 68, 'center');
            }
        }
        this._drawSegmentationButtons(ctx, m);
        if (!dark) this._terminalText(ctx, m, this.answerError || '', 640, 651, 11, this.answerError ? '#FF8D99' : '#718E9B', 'center');
        ctx.restore();
    }

    _drawAnswer(ctx, m, x, y, w, h, align = 'left') {
        this._glassDisplay(ctx, m, x, y, w, h);
        const prefix = ['default_prefix', 'new_cidr'].includes(this.phase) ? '/' : '';
        this._terminalText(ctx, m, prefix + (this.answer || '_'), align === 'center' ? x + w / 2 : x + 20,
            y + h * 0.68, h < 40 ? 20 : 30, '#E3FAFF', align, 0.7);
    }

    _drawEntryDeck(ctx, m) {
        // The display and keypad read as one input device, separate from the
        // network facts and step navigation above it.
        this._holoPanel(ctx, m, 653, 322, 468, 187, '#5A9FBA');
        ctx.save(); ctx.scale(m.sX, m.sY);
        const seam = ctx.createLinearGradient(671, 405, 1103, 405);
        seam.addColorStop(0, 'rgba(91,210,232,0)');
        seam.addColorStop(0.5, 'rgba(106,214,234,0.28)');
        seam.addColorStop(1, 'rgba(165,130,232,0)');
        ctx.fillStyle = seam; ctx.fillRect(671, 405, 432, 1);
        ctx.strokeStyle = 'rgba(109,207,233,0.24)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(662, 335); ctx.lineTo(662, 380);
        ctx.moveTo(1112, 449); ctx.lineTo(1112, 494); ctx.stroke();
        ctx.restore();
    }


    _drawBitPanel(ctx, m) {
        const p = this.problem;
        this._terminalText(ctx, m, 'REQUIRED SUBNETS: ' + p.requiredSubnets, 887, 298, 14, '#D0ECF5', 'center', 0.45);
        for (let row = 0; row < 4; row++) {
            ctx.fillStyle = 'rgba(46,98,143,0.07)';
            ctx.fillRect(659 * m.sX, (305 + row * 43) * m.sY, 456 * m.sX, 42 * m.sY);
            ctx.strokeStyle = 'rgba(106,173,213,0.15)'; ctx.lineWidth = m.sY;
            ctx.beginPath(); ctx.moveTo(672 * m.sX, (326 + row * 43) * m.sY); ctx.lineTo(1102 * m.sX, (326 + row * 43) * m.sY); ctx.stroke();
        }
        for (let bit = 0; bit < 32; bit++) {
            const x = 688 + (bit % 8) * 57;
            const y = 326 + Math.floor(bit / 8) * 43;
            const locked = bit < p.originalCIDR;
            const borrowed = !locked && bit < p.originalCIDR + this.borrowedBits;
            this._drawBitSocket(ctx, m, x, y, locked ? 'network' : (borrowed ? 'borrowed' : 'host'));
            this._terminalText(ctx, m, locked || borrowed ? '1' : '0', x, y + 21, 9, locked ? '#699FAB' : '#A4BDCF', 'center');
        }
        // Compact key; instructions and reserved-bit rules live in the tutorial.
        [['Network', '#75E3F2'], ['Borrowed', '#FFE600'], ['Host', '#6388A4']].forEach(([label, color], i) => {
            const x = [722, 861, 1010][i];
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x * m.sX, 490 * m.sY, 2.5 * m.sX, 0, Math.PI * 2); ctx.fill();
            this._terminalText(ctx, m, label, x + 10, 493, 10, '#A0BBCE', 'left', 0.25);
        });
    }

    _drawQuestClock(ctx, m) {
        const remaining = this.timeLimitSeconds ? Math.max(0, Math.ceil(this.timeLimitSeconds - this.questElapsedMs / 1000)) : null;
        const label = remaining === null ? 'NO LIMIT' : Math.floor(remaining / 60).toString().padStart(2, '0') + ':' + (remaining % 60).toString().padStart(2, '0');
        this._terminalText(ctx, m, label, 1180, 92, 25, remaining !== null && remaining <= 15 ? '#FF6B83' : '#D8F4F8', 'right');
        this._terminalText(ctx, m, remaining !== null && remaining <= 15 ? 'TIME RUNNING OUT' : 'TIME REMAINING', 1180, 112, 9, '#8AA6B2', 'right');
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        if (this.classFormation && !this._classFormationActive()) this.classFormation = null;
        if (this.classUnlockAt && !this._classUnlockActive()) {
            this.classUnlockAt = 0;
            this.classUnlockSurface = null;
            this.lastUpdateAt = Date.now();
        }
        if (IP2Live.GameplayCompletionPopup && typeof IP2Live.GameplayCompletionPopup.update === 'function') {
            IP2Live.GameplayCompletionPopup.update(this);
        }
        if (this.tutorialMode && !this.finished && !this._classUnlockActive() && !this._classFormationActive() && !this.tutorialPromptActive && !this._isDialogueActive()) {
            if (!this.tutorialStarted) {
                this.tutorialStarted = true;
                this._showTutorialIntro();
            } else {
                this._showTutorialPhase();
            }
        }
        this._updateQuestClock();
        if (this.trace) this._updateTrace();
        this._updateVirusSpread();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _showTutorialIntro() {
        const helper = IP2Live.IPCIDRQuarantineTutorial;
        if (!helper || typeof helper.showIntro !== 'function') {
            this._showTutorialPhase();
            return;
        }
        this.tutorialPromptActive = true;
        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            this.tutorialPromptActive = false;
            this.lastUpdateAt = Date.now();
            this._showTutorialPhase();
        };
        if (!helper.showIntro(this._tutorialContext(), finish)) finish();
    }

    _showTutorialPhase() {
        if (!this.tutorialMode || this.finished || this._classUnlockActive() || this._classFormationActive() || this.tutorialPromptActive || this._isDialogueActive()) return false;
        if (!this._isPrerequisitePhase() && this.phase !== 'build') return false;
        if (this.tutorialSeenPhases[this.phase]) return false;
        const helper = IP2Live.IPCIDRQuarantineTutorial;
        const route = this.phase === 'build';
        const method = route ? 'showRouteGuide' : 'showPhaseGuide';
        if (!helper || typeof helper[method] !== 'function') return false;
        this.tutorialSeenPhases[this.phase] = true;
        this.tutorialPromptActive = true;
        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            this.tutorialPromptActive = false;
            this.lastUpdateAt = Date.now();
            if (route) this._showTutorialStep(1);
        };
        const started = route
            ? helper.showRouteGuide(this._tutorialContext(), finish)
            : helper.showPhaseGuide(this.phase, this._tutorialContext(), finish);
        if (!started) finish();
        return started;
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
        if (this.finished) return true;
        const value = key && (key.name || key.code || key);
        const upper = String(value || '').toUpperCase().replace(/^KEY(?=[A-Z]$)/, '');
        if (this._classUnlockActive() || this._classFormationActive()) return true;
        if (this.hostPowerToolOpen) return true;
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._openPauseMenu();
            return true;
        }
        if (this._isPrerequisitePhase()) {
            return this._segmentationKey(upper);
        }
        if (this.phase !== 'build') return true;
        if (upper === 'ARROWRIGHT' || upper === 'D') this._appendDirection('R');
        if (upper === 'ARROWLEFT' || upper === 'A') this._appendDirection('L');
        if (upper === 'ARROWUP' || upper === 'W') this._appendDirection('U');
        if (upper === 'ARROWDOWN' || upper === 'S') this._appendDirection('D');
        if (upper === 'Z' || upper === 'BACKSPACE') this._undoPath();
        if (upper === 'R') this._clearPath();
        if (upper === 'H' || upper === 'KEYH') this._openHostPowerTool();
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') this._confirmPath();
        return true;
    }

    onMouseDown(x, y) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        if (this.finished || this.hostPowerToolOpen || this._classUnlockActive() || this._classFormationActive()) return true;
        if (this._segmentationClick(x, y)) return true;
        if (this.phase !== 'build') return true;
        this._buildInteractionRects(this._metrics());
        if (this.hostPowerToolRect && this._pointInRect(x, y, this.hostPowerToolRect)) {
            this._openHostPowerTool();
            return true;
        }
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
        this._hoverPoint = { x, y };
        if (this.phase !== 'build' || this.hostPowerToolOpen || !this.draggingPath) return true;
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
            requiredSubnets: this.problem.requiredSubnets,
            allocatedSubnets: this.problem.allocatedSubnets,
            totalAddresses: this._formatHosts(Math.pow(2, this.problem.optimizedHostBits)),
            timeLimitSeconds: this.timeLimitSeconds,
            requiredHosts: this._formatHosts(this.problem.requiredHosts),
            targetCIDR: this.problem.targetCIDR,
            optimizedHostBits: this.problem.optimizedHostBits,
            optimizedCapacity: this._formatHosts(this.problem.optimizedCapacity),
            borrowedBits: this.problem.borrowedBits,
            currentAddedBits: stats.addedBits,
            currentCIDR: stats.currentCIDR,
            currentHostBits: stats.currentHostBits,
            currentCapacity: this._formatHosts(stats.currentCapacity),
            startLabel: this._tileLabel(this.problem.start),
            endLabel: this._tileLabel(this.problem.end),
            directionWeights: Object.assign({}, this.directionWeights),
            moveWeightsLine: this._directionWeightLine(),
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
            if (step === 3 && this.tutorialMode && this._pathStats().connected) this._showTutorialStep(4);
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
            if (this._pathStats().connected) this._showTutorialStep(4);
            return;
        }
        if (this.tutorialStep === 4 && (action === 'path' || action === 'connect')) {
            const reason = this._tutorialFeedbackReasonForCurrentPath();
            if (reason === 'submitEarly') {
                this.tutorialStep = 3;
                return;
            }
            this._showTutorialFeedback(reason);
        }
    }

    _confirmPath() {
        if (this.phase !== 'build') return;
        this._updateQuestClock();
        if (this.phase !== 'build') return;
        if (this.tutorialMode && !this._pathStats().connected) {
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

    _tutorialFeedbackReasonForCurrentPath() {
        const stats = this._pathStats();
        if (!stats.connected) return 'submitEarly';
        if (stats.hitVirus) return 'virus';
        if (stats.currentCapacity < this.problem.requiredHosts) return 'too_small';
        if (stats.currentCapacity > this.problem.optimizedCapacity) return 'too_big';
        if (stats.currentCIDR !== this.problem.targetCIDR) return 'not_optimized';
        return 'submitReady';
    }

    _syncTutorialStepAfterPathEdit() {
        if (!this.tutorialMode || this.tutorialStep < 4) return;
        if (!this._pathStats().connected) this.tutorialStep = 3;
    }

    _evaluatePath() {
        const stats = this._pathStats();
        const base = this._baseResult(stats);
        if (!stats.connected) {
            return this._diagnostic('disconnected', [
                'ROUTE INCOMPLETE.',
                'The path does not reach node B.',
                'Connect A to B before confirming.',
            ], base);
        }
        if (stats.hitVirus) {
            return this._diagnostic('virus', [
                'ROUTE BLOCKED.',
                'The path crosses an infected tile.',
                'Rebuild the route without touching red virus nodes.',
            ], base);
        }
        if (stats.currentCapacity < this.problem.requiredHosts) {
            return this._diagnostic('too_small', [
                'PATH TOTAL TOO SMALL.',
                'The path total is below the verified host-bit count.',
                'Adjust the route so its total equals ' + this.problem.targetHostBits + '.',
            ], base);
        }
        if (stats.currentCapacity > this.problem.optimizedCapacity) {
            return this._diagnostic('too_big', [
                'PATH TOTAL TOO LARGE.',
                'The path total exceeds the verified host-bit count.',
                'Adjust the route so its total equals ' + this.problem.targetHostBits + '.',
            ], base);
        }
        if (stats.currentCIDR !== this.problem.targetCIDR) {
            return this._diagnostic('not_optimized', [
                'PATH TOTAL INCORRECT.',
                'The route connects, but its total does not match the verified host bits.',
                'Adjust the direction values and try again.',
            ], base);
        }
        return Object.assign(base, { ok: true, passed: true, diagnosticReason: null });
    }

    _diagnostic(reason, lines, base) {
        return Object.assign(base || {}, { ok: false, passed: false, reason, diagnosticReason: reason, lines });
    }

    _showDiagnostic(result) {
        this._failOut(result);
    }

    _finishSuccess(result) {
        if (this.finished) return;
        this.finished = true;
        this.phase = 'success';
        const payload = Object.assign({}, result, {
            gameplayId: 'ip_cidr_quarantine',
            passed: true,
            attemptsUsed: this.attemptsUsed,
            maxAttempts: this.maxAttempts,
            retries: Math.max(0, this.attemptsUsed - 1),
        });
        const complete = () => {
            if (typeof this.options.onComplete === 'function') this.options.onComplete(payload);
        };
        const sharedPopup = IP2Live.GameplayCompletionPopup;
        if (sharedPopup && typeof sharedPopup.begin === 'function' && sharedPopup.begin(this, {
            gameplayId: 'ip_cidr_quarantine',
            label: this.options.questLabel || (this.options.spec && this.options.spec.label) || 'Subnet calculations and route complete',
            footer: 'SUBNET CALCULATIONS AND ROUTE VERIFIED',
            durationMs: 950,
            result: payload,
            onComplete: complete,
        })) {
            return;
        }
        complete();
    }

    _failOut(result) {
        if (this.finished) return;
        this.finished = true;
        const classLockout = result && result.reason === 'class_lockout';
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed(Object.assign({}, result, {
                gameplayId: 'ip_cidr_quarantine',
                passed: false,
                reason: 'attempts_exhausted',
                attemptsUsed: classLockout ? 3 : this.attemptsUsed,
                maxAttempts: classLockout ? 3 : this.maxAttempts,
                retries: classLockout ? 2 : this.attemptsUsed,
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
        if (this.phase === 'classify') {
            this._drawBackdrop(ctx, m);
            this._drawPanel(ctx, m);
            this._drawGrid(ctx, m);
            this._drawRouteUnlock(ctx, m);
            this._drawClassLockBackdrop(ctx, m);
            this._segmentationLayout(m);
            this._drawClassificationConsole(ctx, m);
        } else {
            this._drawBackdrop(ctx, m);
            this._drawPanel(ctx, m);
            this._drawGrid(ctx, m);
            this._drawRouteUnlock(ctx, m);
            if (this._isPrerequisitePhase()) this._drawSegmentation(ctx, m);
            else {
                this._drawControls(ctx, m);
                this._drawStatus(ctx, m);
            }
            this._drawVirusAlert(ctx, m);
        }
        this._drawQuestClock(ctx, m);
        this._drawClassUnlockTransition(ctx, m);
        this._drawTutorialFocus(ctx, m);
        if (this.phase === 'overrun') this._drawVirusTakeover(ctx, m);
        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.drawOverlay === 'function') {
            IP2Live.DialogueManager.drawOverlay(ctx);
        }
        if (IP2Live.GameplayCompletionPopup && typeof IP2Live.GameplayCompletionPopup.drawFor === 'function') {
            IP2Live.GameplayCompletionPopup.drawFor(this, ctx, { tick: this.animTick || 0 });
        }
    }

    _tutorialFocusRects(m, dialogue) {
        const context = dialogue && dialogue.context || {};
        const targets = context.gameplayFocus && context.gameplayFocus[Number(dialogue.slideIndex) || 0] || [];
        const rect = (x, y, w, h) => ({ x: x * m.sX, y: y * m.sY, w: w * m.sX, h: h * m.sY });
        const lock = this._classLockLayout();
        const bounds = {
            address: rect(lock.display.x, lock.display.y, lock.display.w, lock.display.h),
            class_input: rect(lock.input.x, lock.input.y, lock.input.w, lock.input.h),
            attempts: rect(770, 424, 60, 16),
            class_badge: rect(1014, 150, 136, 32),
            network: rect(610, 145, 400, 42),
            answer: rect(672, 331, 430, 68),
            verify: rect(659, 527, 456, 36),
            bulbs: rect(659, 305, 456, 174),
            subnets: rect(735, 282, 304, 22),
            calculator: rect(1112, 144, 44, 44),
            grid: this._gridRect,
            network_facts: rect(610, 299, 554, 92),
            path_total: rect(610, 190, 350, 96),
            moves: rect(610, 413, 554, 53),
            actions: rect(610, 576, 356, 36),
            check: this.confirmRect,
        };
        if (this.phase !== 'borrow_bits') {
            const submit = this.segmentationRects.find(r => r.action === 'submit');
            if (submit) bounds.verify = submit;
        }
        return targets.map(name => bounds[name]).filter(Boolean);
    }

    _drawTutorialFocus(ctx, m) {
        if (!this.tutorialMode || this._classUnlockActive()) return;
        const dialogue = IP2Live.DialogueManager && IP2Live.DialogueManager._active;
        if (!dialogue || !String(dialogue.id || '').startsWith('stage3.cidrquarantine.')) return;
        const rects = this._tutorialFocusRects(m, dialogue);
        const context = dialogue.context || (dialogue.context = {});
        // Keep the compact lesson beside its subject, including the bottom
        // action row. The dialogue must never hide the controls it explains.
        const gridFocus = rects.some(r => r === this._gridRect);
        context.panelBounds = this.phase === 'classify'
            ? { x: 320, y: 478, w: 640 }
            : gridFocus ? { x: 610, y: 295, w: 554 } : { x: 100, y: 220, w: 430 };
        if (!rects.length) return;
        ctx.save();
        ctx.save();
        for (const r of rects) {
            ctx.beginPath(); ctx.rect(0, 0, m.cW, m.cH);
            ctx.rect(r.x - 4 * m.sX, r.y - 4 * m.sY, r.w + 8 * m.sX, r.h + 8 * m.sY);
            ctx.clip('evenodd');
        }
        ctx.fillStyle = 'rgba(0,4,10,0.6)'; ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.restore();
        ctx.strokeStyle = '#D7C57D'; ctx.lineWidth = 1.5 * m.sX;
        for (const r of rects) ctx.strokeRect(r.x - 4 * m.sX, r.y - 4 * m.sY, r.w + 8 * m.sX, r.h + 8 * m.sY);
        ctx.restore();
    }
    _calculatorAvailable() {
        return ['borrow_bits', 'new_cidr', 'host_bits', 'host_capacity', 'build'].includes(this.phase);
    }

    _subnetCalculatorMode() {
        return ['borrow_bits', 'new_cidr'].includes(this.phase);
    }

    _openHostPowerTool() {
        if (this.finished || !this._calculatorAvailable() || this.hostPowerToolOpen) return false;
        const toolManager = IP2Live.HostPowerToolManager;
        if (!toolManager || typeof toolManager.launchHostPowerTool !== 'function') {
            this._setStatus('Calculator unavailable. Reopen the gameplay and try again.', 'bad');
            this._playCancel();
            return false;
        }

        this.draggingPath = false;
        this.hostPowerToolOpen = true;
        const opened = toolManager.launchHostPowerTool({
            targetClass: this.problem.ipClass,
            requiredHosts: this.problem.requiredHosts,
            startExponent: 0,
            align: 'right',
            showIntro: false,
            sourceGameplayId: 'ip_cidr_quarantine',
            onClose: (result) => {
                this.hostPowerToolOpen = false;
                this._setStatus(this._subnetCalculatorMode() ? 'Use your calculated exponent to borrow the minimum bits.' : 'Apply your calculated host-bit value to the current task.', 'idle');
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            },
            backgroundScene: this,
            preserveBackground: true,
            neutralFeedback: true,
            lockScenario: true,
            calculationMode: this._subnetCalculatorMode() ? 'subnets' : 'hosts',
            requiredSubnets: this.problem.requiredSubnets,
            allocatedPrefix: this._subnetCalculatorMode() ? undefined : this.problem.targetCIDR,
            onBackgroundUpdate: () => {
                this.update();
                return this.finished || this.phase === 'overrun' || this.phase === 'diagnostic';
            },
        });
        if (!opened) {
            this.hostPowerToolOpen = false;
            this._setStatus('Calculator is already open or could not be started.', 'bad');
            this._playCancel();
            return false;
        }
        this._playConfirm();
        return true;
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
        const railX = 610 * m.sX;
        const railY = 576 * m.sY;
        this.hostPowerToolRect = {
            action: 'host_power_tool',
            x: 1112 * m.sX,
            y: 144 * m.sY,
            w: 44 * m.sX,
            h: 44 * m.sY,
        };
        this.buttonRects = [
            { action: 'undo', label: 'UNDO', x: railX, y: railY, w: 172 * m.sX, h: 36 * m.sY },
            { action: 'clear', label: 'CLEAR', x: railX + 184 * m.sX, y: railY, w: 172 * m.sX, h: 36 * m.sY },
            { action: 'confirm', label: 'CHECK', x: railX + 368 * m.sX, y: railY, w: 186 * m.sX, h: 36 * m.sY },
        ];
        this.controlRects = {};
        for (let i = 0; i < this.buttonRects.length; i++) this.controlRects[this.buttonRects[i].action] = this.buttonRects[i];
        this.confirmRect = this.controlRects.confirm;
        this._gridRect = { x: m.gridX, y: m.gridY, w: m.gridSize, h: m.gridSize };
    }

    _drawBackdrop(ctx, m) {
        ctx.clearRect(0, 0, m.cW, m.cH);
        const g = ctx.createLinearGradient(0, 0, 0, m.cH);
        g.addColorStop(0, '#020407');
        g.addColorStop(1, '#000102');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.save();
        const tick = this.reducedMotion ? 0 : this.animTick || 0;
        // Fixed seeds keep decorative particles independent of puzzle randomness.
        for (let i = 0; i < 150; i++) {
            const seed = ((Math.imul(i + 1, 2654435761) >>> 0) / 4294967296);
            const depth = 0.25 + (i % 7) / 10;
            const x = ((seed * 1280 + tick * depth * 0.08) % 1280) * m.sX;
            const y = (((i * 197.31) % 720 + 720 - tick * depth * 0.045 % 720) % 720) * m.sY;
            const radius = (i % 11 === 0 ? 1.6 : 0.6) * Math.min(m.sX, m.sY);
            ctx.globalAlpha = (0.1 + depth * 0.25) * (0.75 + 0.25 * Math.sin(tick * 0.008 + i));
            ctx.fillStyle = i % 9 === 0 ? '#87AAB6' : '#C2CBD2';
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }


    _drawPanel(ctx, m) {
        this._holoPanel(ctx, m, 54, 48, 1172, 624, '#4CADC8');
        this._drawPanelTitle(ctx, m);
        ctx.save();
        const line = ctx.createLinearGradient(84 * m.sX, 0, 1196 * m.sX, 0);
        line.addColorStop(0, 'rgba(94,225,245,0.6)'); line.addColorStop(1, 'rgba(164,124,255,0.15)');
        ctx.fillStyle = line; ctx.fillRect(84 * m.sX, 120 * m.sY, 1112 * m.sX, m.sY);
        ctx.restore();
    }

    _drawPanelTitle(ctx, m) {
        // Gameplay 1's angled title plate, widened for Gameplay 5's name.
        ctx.save(); ctx.scale(m.sX, m.sY);
        const x = 76, y = 60, w = 700, h = 54;
        ctx.shadowColor = 'rgba(0,0,0,0.82)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
        const plate = ctx.createLinearGradient(x, y, x + w, y + h);
        plate.addColorStop(0, '#202A34'); plate.addColorStop(0.18, '#090D13');
        plate.addColorStop(0.74, '#111821'); plate.addColorStop(1, '#030508');
        this._fillChamferRect(ctx, x, y, w, h, 11, plate);
        ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
        this._strokeChamferRect(ctx, x, y, w, h, 11, 'rgba(180,205,217,0.3)', 1);
        ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 70, y);
        ctx.lineTo(x + 62, y + h); ctx.lineTo(x, y + h - 8); ctx.closePath();
        const badge = ctx.createLinearGradient(x, y, x + 70, y + h);
        badge.addColorStop(0, '#FF315F'); badge.addColorStop(0.62, '#B50032'); badge.addColorStop(1, '#4A071C');
        ctx.fillStyle = badge; ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#FFFFFF'; ctx.fillText('IP2', x + 28, y + 19);
        ctx.fillStyle = '#FFE600'; ctx.fillText('Q-05', x + 28, y + 34);
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : this._titleFont();
        ctx.font = 'bold 18px ' + titleFont; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.shadowColor = 'rgba(0,240,255,0.22)'; ctx.shadowBlur = 5;
        ctx.fillStyle = '#F7FCFF'; ctx.fillText('NETWORK', x + 82, y + 31);
        const networkW = ctx.measureText('NETWORK').width;
        ctx.shadowColor = 'transparent'; ctx.fillStyle = '#00F0FF';
        ctx.fillText('RE-SEGMENTATION', x + 82 + networkW + 12, y + 31, w - 102 - networkW);
        ctx.font = 'bold 7.2px monospace'; ctx.fillStyle = 'rgba(190,211,222,0.74)';
        ctx.fillText('GAMEPLAY 5 // IPv4 SUBNETTING', x + 82, y + 46);
        ctx.fillStyle = '#FF315F'; ctx.fillRect(x + 75, y + 6, 28, 2);
        ctx.fillStyle = '#00F0FF'; ctx.fillRect(x + 106, y + 6, 72, 2);
        ctx.fillStyle = 'rgba(210,228,237,0.26)';
        for (let i = 0; i < 5; i++) ctx.fillRect(x + w - (48 - i * 8), y + 8, 5, 2);
        ctx.restore();
    }

    _drawHostPowerToolButton(ctx, m) {
        const b = this.hostPowerToolRect;
        if (!b) return;
        const available = !!(IP2Live.HostPowerToolManager &&
            typeof IP2Live.HostPowerToolManager.launchHostPowerTool === 'function');
        const enabled = available && this.phase === 'build' && !this.finished && !this.hostPowerToolOpen;
        const glow = 0.45 + 0.22 * Math.sin((this.animTick || 0) * 0.08);

        ctx.save();
        ctx.shadowColor = enabled ? 'rgba(0, 229, 255, ' + glow + ')' : 'transparent';
        ctx.shadowBlur = enabled ? 8 * m.sX : 0;
        const gradient = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        gradient.addColorStop(0, enabled ? '#12394A' : '#13212A');
        gradient.addColorStop(1, enabled ? '#071923' : '#091118');
        ctx.fillStyle = gradient;
        this._fillChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX);
        this._strokeChamferRect(ctx, b.x, b.y, b.w, b.h, 7 * m.sX, enabled ? '#00E5FF' : '#4E6872', 1.4 * m.sX);
        ctx.shadowBlur = 0;

        const iconX = b.x + 13 * m.sX;
        const iconY = b.y + 8 * m.sY;
        const iconW = 18 * m.sX;
        const iconH = 21 * m.sY;
        ctx.strokeStyle = enabled ? '#8FF8FF' : '#668089';
        ctx.lineWidth = 1.3 * m.sX;
        ctx.strokeRect(iconX, iconY, iconW, iconH);
        ctx.strokeRect(iconX + 3 * m.sX, iconY + 3 * m.sY, iconW - 6 * m.sX, 5 * m.sY);
        ctx.fillStyle = enabled ? '#FFE600' : '#668089';
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                ctx.fillRect(iconX + (4 + col * 7) * m.sX, iconY + (12 + row * 5) * m.sY, 3 * m.sX, 2 * m.sY);
            }
        }

        ctx.fillStyle = enabled ? '#FFFFFF' : '#758B94';
        ctx.font = 'bold ' + Math.round(11 * m.sY) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.hostPowerToolOpen ? 'TOOL OPEN' : 'HOST CALC', b.x + 40 * m.sX, b.y + 13 * m.sY);
        ctx.fillStyle = enabled ? '#8FF8FF' : '#58717A';
        ctx.font = 'bold ' + Math.round(8 * m.sY) + 'px monospace';
        ctx.fillText('2^h - 2  //  H', b.x + 40 * m.sX, b.y + 25 * m.sY);
        ctx.restore();
    }

    _drawGrid(ctx, m) {
        const g = this._gridRect;
        const cell = g.w / 16;
        this._holoPanel(ctx, m, g.x / m.sX - 8, g.y / m.sY - 8, g.w / m.sX + 16, 496, '#4E91AA');
        ctx.fillStyle = '#0B1C32';
        ctx.fillRect(g.x, g.y, g.w, g.h);
        for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 16; col++) {
                const x = g.x + col * cell;
                const y = g.y + row * cell;
                const tileFace = ctx.createLinearGradient(0, y, 0, y + cell);
                tileFace.addColorStop(0, '#0C233B'); tileFace.addColorStop(1, '#0B192D');
                ctx.fillStyle = tileFace;
                ctx.fillRect(x + 1 * m.sX, y + 1 * m.sY, cell - 2 * m.sX, cell - 2 * m.sY);
                ctx.strokeStyle = 'rgba(69,133,177,0.14)';
                ctx.lineWidth = 2 * m.sX;
                ctx.strokeRect(x, y, cell, cell);
                const tile = { col, row };
                if (!this._classFormationActive() && this._isVirus(tile)) this._drawVirusIcon(ctx, x + cell / 2, y + cell / 2, cell * 0.34, m);
            }
        }
        if (this._classFormationActive()) this._drawClassFormation(ctx, m, g, cell);
        this._drawPath(ctx, m, this.path, '#FFE600', 0.96, this._traceVisibleMoves());
        this._drawNodeIcon(ctx, this._cellCenter(this.problem.start, g), cell * 0.38, '#00D8FF', m, 'A');
        this._drawNodeIcon(ctx, this._cellCenter(this.problem.end, g), cell * 0.38, '#2F80FF', m, 'B');
        ctx.strokeStyle = 'rgba(98,196,225,0.4)';
        ctx.lineWidth = m.sX;
        ctx.strokeRect(g.x, g.y, g.w, g.h);
        this._drawVirusFooter(ctx, m);
    }

    _drawClassFormation(ctx, m, grid, cell) {
        const t = Math.max(0, Math.min(1, (Date.now() - this.classFormation.at) / 800));
        const incoming = t >= 0.5;
        const visibility = incoming ? (t - 0.5) * 2 : 1 - t * 2;
        const viruses = incoming ? this.problem.viruses : this.classFormation.oldViruses;
        const pixel = cell / 8;
        for (const tile of viruses) {
            const x = grid.x + tile.col * cell, y = grid.y + tile.row * cell;
            ctx.save();
            ctx.beginPath();
            // A fixed pixel mask dissolves the old sprites and assembles the new
            // ones without changing the random sequence used by the puzzle.
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const hash = Math.abs(Math.sin(tile.col * 31.7 + tile.row * 19.3
                        + col * 12.9898 + row * 78.233) * 43758.5453) % 1;
                    if (hash < visibility) ctx.rect(x + col * pixel, y + row * pixel, pixel + 0.25, pixel + 0.25);
                }
            }
            ctx.clip();
            ctx.globalAlpha = Math.pow(visibility, 0.45);
            this._drawVirusIcon(ctx, x + cell / 2, y + cell / 2, cell * 0.34, m);
            ctx.restore();
            // Detached flecks remain local to the sprite as it breaks up/reforms.
            ctx.save(); ctx.globalAlpha = 0.5 * Math.sin(visibility * Math.PI);
            ctx.fillStyle = '#DA6588';
            for (let i = 0; i < 4; i++) {
                const angle = (tile.col * 7 + tile.row * 11 + i) * 2.4;
                const distance = cell * (0.15 + (1 - visibility) * 0.3);
                ctx.fillRect(x + cell / 2 + Math.cos(angle) * distance,
                    y + cell / 2 + Math.sin(angle) * distance, pixel * 0.65, pixel * 0.65);
            }
            ctx.restore();
        }
    }


    _drawRouteUnlock(ctx, m) {
        if (this.phase !== 'build' || !this.routeRevealAt || this.reducedMotion) return;
        const elapsed = Date.now() - this.routeRevealAt;
        if (elapsed >= 1300) return;
        ctx.save();
        // Finish the sixth arc, swing the shackle open, then dissolve the icon.
        ctx.globalAlpha *= Math.min(1, Math.max(0, (1300 - elapsed) / 500));
        this._drawLockIcon(ctx, m, this._lockVisualState());
        ctx.restore();
    }

    _drawControls(ctx, m) {
        const stats = this.trace ? this._traceStats() : this._pathStats();
        this._holoPanel(ctx, m, 590, 134, 594, 496, '#68B5CD');
        ctx.save(); ctx.scale(m.sX, m.sY);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        const font = (IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded) ? 'Oxanium-Medium' : 'monospace';
        ctx.fillStyle = '#DDF7FF'; ctx.font = 'bold 18px ' + font;
        ctx.fillText('CONNECT A TO B', 610, 164);
        this._routeRule(ctx, 610, 178, 554);

        this._holoPanel(ctx, { sX: 1, sY: 1 }, 610, 190, 350, 96, '#D9C779');
        this._holoPanel(ctx, { sX: 1, sY: 1 }, 972, 190, 192, 96, '#68D2E8');
        ctx.fillStyle = '#D9CB86'; ctx.font = 'bold 11px ' + font;
        ctx.fillText('PATH TOTAL  h', 625, 213);
        const over = stats.addedBits > this.problem.targetHostBits;
        const matched = stats.addedBits === this.problem.targetHostBits && stats.connected;
        ctx.fillStyle = over ? '#FF819D' : (matched ? '#8DFFD2' : '#FFF0AE');
        ctx.font = 'bold 38px ' + font;
        ctx.fillText(String(stats.addedBits) + ' / ' + this.problem.targetHostBits, 625, 262, 272);
        ctx.fillStyle = 'rgba(184,216,232,0.16)'; ctx.fillRect(625, 275, 320, 3);
        ctx.fillStyle = over ? '#FF819D' : (matched ? '#8DFFD2' : '#EBCB72');
        ctx.fillRect(625, 275, 320 * Math.min(1, stats.addedBits / Math.max(1, this.problem.targetHostBits)), 3);
        ctx.fillStyle = '#A9C8D8'; ctx.font = 'bold 11px ' + font;
        ctx.fillText('MOVES MADE', 988, 213);
        ctx.fillStyle = '#D9FAFF'; ctx.font = 'bold 38px ' + font;
        ctx.fillText(String(stats.moves.length), 988, 262, 130);

        ctx.fillStyle = '#7ED8E9'; ctx.font = 'bold 11px ' + font;
        ctx.fillText('VERIFIED NETWORK', 610, 310);
        this._routeField(ctx, font, 'NETWORK', this.problem.ipAddress + '/' + this.problem.originalCIDR, 610, 337, 704);
        this._routeField(ctx, font, 'CLASS', this.problem.ipClass, 900, 337, 1024);
        this._routeField(ctx, font, 'NEW PREFIX', '/' + this.problem.targetCIDR, 610, 360, 704);
        this._routeField(ctx, font, 'BORROWED', String(this.problem.borrowedBits), 900, 360, 1024);
        this._routeField(ctx, font, 'HOST BITS', String(this.problem.targetHostBits), 610, 383, 704);
        this._routeField(ctx, font, 'USABLE HOSTS', this._formatHosts(this.problem.requiredHosts), 900, 383, 1024);
        this._routeRule(ctx, 610, 400, 554);

        ctx.fillStyle = '#7ED8E9'; ctx.font = 'bold 11px ' + font;
        ctx.fillText('DIRECTION VALUES', 610, 420);
        const directions = [['R', '→', this.directionWeights.R], ['L', '←', this.directionWeights.L],
            ['U', '↑', this.directionWeights.U], ['D', '↓', this.directionWeights.D]];
        directions.forEach(([direction, arrow, weight], i) => {
            const x = 610 + i * 141;
            ctx.fillStyle = 'rgba(33,89,122,0.25)'; this._fillChamferRect(ctx, x, 430, 130, 36, 5);
            ctx.strokeStyle = 'rgba(105,196,221,0.25)'; ctx.lineWidth = 0.8;
            this._strokeChamferRect(ctx, x, 430, 130, 36, 5, ctx.strokeStyle, ctx.lineWidth);
            ctx.fillStyle = '#72DCF0'; ctx.font = 'bold 16px ' + font;
            ctx.fillText(arrow, x + 12, 454);
            ctx.fillStyle = '#D6EDF5'; ctx.font = '500 13px ' + font;
            ctx.fillText(direction + '  +' + weight, x + 40, 453);
        });
        ctx.restore();
        this._drawVirusMeter(ctx, m, 610 * m.sX, 483 * m.sY, 554 * m.sX, 6 * m.sY);
        ctx.save(); ctx.scale(m.sX, m.sY);
        this._routeRule(ctx, 610, 519, 554);
        ctx.fillStyle = this.statusTone === 'bad' ? '#FF8DA4' : (this.statusTone === 'good' ? '#8DFFD2' : '#BDEEFF');
        ctx.font = '500 12px ' + ((IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded) ? 'Oxanium-Medium' : 'monospace');
        ctx.textAlign = 'left';
        ctx.fillText(this.trace ? this._traceCalculationLine() : this.statusText, 610, 542, 554);
        ctx.restore();
        for (let i = 0; i < this.buttonRects.length; i++) this._drawButton(ctx, this.buttonRects[i], m, this.buttonRects[i].label);
    }

    _routeRule(ctx, x, y, w) {
        const line = ctx.createLinearGradient(x, y, x + w, y);
        line.addColorStop(0, 'rgba(108,225,245,0.6)'); line.addColorStop(0.75, 'rgba(108,225,245,0.2)');
        line.addColorStop(1, 'rgba(166,122,238,0)');
        ctx.fillStyle = line; ctx.fillRect(x, y, w, 1);
    }

    _routeField(ctx, font, label, value, x, y, valueX) {
        ctx.fillStyle = '#8BAFC3'; ctx.font = 'bold 11px ' + font;
        ctx.fillText(label, x, y);
        ctx.fillStyle = '#E1F4FC'; ctx.font = '500 14px ' + font;
        ctx.fillText(value, valueX, y, x < 800 ? 206 : 80);
    }

    _drawStatus(ctx, m) {
        ctx.font = 'bold ' + Math.round(12 * m.sY) + 'px monospace';
        ctx.fillStyle = '#8FF8FF';
        ctx.textAlign = 'left';
        ctx.fillText('TRIES ' + this.attemptsUsed + '/' + this._attemptLimitLabel() + '   DRAG / CLICK TO BUILD PATH   H: HOST CALC', m.panelX + 30 * m.sX, m.panelY + m.panelH - 28 * m.sY);
    }

    _drawVirusAlert(ctx, m) {
        if (!this.virusState) return;
        const density = this._virusDensity();
        const difficulty = this.problem && this.problem.difficulty ? this.problem.difficulty : {};
        const warning = Number(difficulty.warningDensity) || 0.30;
        const critical = Number(difficulty.criticalDensity) || 0.50;
        let intensity = 0;
        if (this.virusState.overrun) intensity = 0.65;
        else if (this._shouldTriggerOverrun()) intensity = 0.35;
        else if (density >= critical) intensity = 0.28;
        else if (density >= warning) intensity = 0.14;
        if (intensity <= 0) return;

        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.3);
        const alpha = Math.min(0.85, intensity + pulse * (density >= critical ? 0.30 : 0.14));
        ctx.save();
        ctx.globalAlpha = Math.min(0.42, alpha);
        ctx.strokeStyle = '#FF0B2F';
        ctx.lineWidth = (density >= critical ? 10 : 6) * m.sX;
        ctx.strokeRect(4 * m.sX, 4 * m.sY, m.cW - 8 * m.sX, m.cH - 8 * m.sY);
        ctx.fillStyle = 'rgba(255, 11, 47, 0.12)';
        ctx.fillRect(0, 0, m.cW, m.cH);
        ctx.restore();

    }

    _drawVirusTakeover(ctx, m) {
        const elapsed = Math.max(0, Date.now() - this.virusState.overrunAt);
        const progress = Math.max(0, Math.min(1, (elapsed - 1600) / 3200));
        ctx.save();
        ctx.fillStyle = 'rgba(2,6,14,0.72)'; ctx.fillRect(0, 0, m.cW, m.cH);
        this._holoPanel(ctx, m, 420, 280, 440, 156, '#BF536E');
        this._terminalText(ctx, m, 'QUARANTINE BREACHED', 640, 319, 18, '#FF95AF', 'center');
        this._terminalText(ctx, m, 'Time expired. The virus has taken over the network.', 640, 354, 11, '#DBBFCB', 'center');
        this._terminalText(ctx, m, 'Disconnecting compromised system...', 640, 391, 11, '#97B1C0', 'center');
        // A deterministic pixel front spreads from the edges, with scattered
        // infection ahead of it. At 100% every tile is opaque.
        const size = 16, cols = Math.ceil(m.cW / size), rows = Math.ceil(m.cH / size);
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
            let seed = Math.imul(col + 1, 73856093) ^ Math.imul(row + 1, 19349663);
            seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
            const hash = ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
            const edge = Math.min(col / cols, (cols - col - 1) / cols, row / rows, (rows - row - 1) / rows) * 2;
            if (progress < 1 && progress <= edge * 0.65 + hash * 0.35) continue;
            ctx.fillStyle = hash < 0.2 ? '#671B37' : (hash < 0.5 ? '#361328' : '#120D1B');
            ctx.fillRect(col * size, row * size, size, size);
            if (hash < 0.24) {
                ctx.fillStyle = '#BC4163';
                ctx.fillRect(col * size + 3, row * size + 4, 3, 3);
                ctx.fillRect(col * size + 10, row * size + 4, 3, 3);
                ctx.fillRect(col * size + 6, row * size + 10, 4, 2);
            }
        }
        ctx.restore();
    }

    _drawButton(ctx, b, m, label) {
        if (!b) return;
        const hover = this._hoverPoint && this._pointInRect(this._hoverPoint.x, this._hoverPoint.y, b);
        this._drawHoloKey(ctx, m, Object.assign({}, b, { action: b.action === 'confirm' ? 'submit' : b.action }));
        const x = b.x / m.sX, y = b.y / m.sY;
        ctx.save(); ctx.scale(m.sX, m.sY);
        ctx.strokeStyle = b.action === 'confirm' ? '#F4D881' : '#94D5E3';
        ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        if (b.action === 'confirm') { ctx.moveTo(x + 20, y + 18); ctx.lineTo(x + 24, y + 22); ctx.lineTo(x + 32, y + 13); }
        else if (b.action === 'clear') { ctx.moveTo(x + 22, y + 14); ctx.lineTo(x + 30, y + 22); ctx.moveTo(x + 30, y + 14); ctx.lineTo(x + 22, y + 22); }
        else { ctx.moveTo(x + 20, y + 18); ctx.lineTo(x + 20, y + 13); ctx.lineTo(x + 25, y + 13); ctx.moveTo(x + 20, y + 13); ctx.bezierCurveTo(x + 36, y + 10, x + 36, y + 25, x + 24, y + 24); }
        ctx.stroke(); ctx.restore();
        this._terminalText(ctx, m, label, x + b.w / m.sX / 2 + 8, y + 23, 11,
            hover ? '#F0FCFF' : (b.action === 'confirm' ? '#FFE59A' : '#C1E1EB'), 'center', 0.6);
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
            else {
                this._setStatus('Only adjacent tiles can extend the connector.', 'bad');
                if (this.tutorialMode) this._showTutorialFeedback('adjacent');
            }
            return false;
        }
        if (this._isVirus(tile)) {
            this._setStatus('Virus node blocks that route. Choose another tile.', 'bad');
            this._playCancel();
            if (this.tutorialMode) this._showTutorialFeedback('virus');
            return false;
        }
        this.path.push(this._cloneTile(tile));
        const connected = this._pathStats().connected;
        this._setStatus(connected ? 'A and B connected. Confirm to check the path total.' : 'Path preview updated.', connected ? 'good' : 'idle');
        this._playCursor();
        this._afterTutorialAction(connected ? 'connect' : 'path');
        return true;
    }

    _undoPath() {
        if (this.phase !== 'build' || this.path.length <= 1) return false;
        this.path.pop();
        this._syncTutorialStepAfterPathEdit();
        this._setStatus('Last tile removed.', 'idle');
        return true;
    }

    _clearPath() {
        if (this.phase !== 'build') return false;
        this.path = [this._cloneTile(this.problem.start)];
        this._syncTutorialStepAfterPathEdit();
        this._setStatus('Path cleared. Start from the blue node.', 'idle');
        return true;
    }

    _rewindTo(index) {
        if (index < 0 || index >= this.path.length) return false;
        this.path = this.path.slice(0, index + 1);
        this._syncTutorialStepAfterPathEdit();
        this._setStatus('Path rewound to tile ' + this._tileLabel(this.path[index]) + '.', 'idle');
        this._playCursor();
        return true;
    }

    _startTrace(result) {
        this.phase = 'tracing';
        this.trace = { result, tick: 0, stepTicks: 24, finished: false, resolveDelay: 44 };
        this.statusText = result.ok ? 'Route correct. Checking the path total.' : 'Route incorrect. Checking the path total.';
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
            initialViruses: viruses.map((v) => this._cloneTile(v)),
        };
    }

    _updateVirusSpread() {
        if (this.finished || this._classUnlockActive() || this._classFormationActive()) return;
        if (!this.virusState) this._initVirusSpread();
        if (this.tutorialPromptActive || this._isDialogueActive()) return;
        if (this.phase === 'tracing' || this.phase === 'diagnostic' || this.phase === 'tutorial_complete') return;

        if (this.virusState.overrun) {
            this._advanceVirusOverrun();
            return;
        }

        if (this.phase !== 'build' && !this._isPrerequisitePhase()) return;
        this.virusState.elapsedTicks = this.questElapsedMs * 60 / 1000;

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
        return this.timeLimitSeconds > 0 && this.questElapsedMs >= this.timeLimitSeconds * 1000;
    }

    _triggerVirusOverrun() {
        if (this.virusState.overrun) return;
        this.virusState.overrun = true;
        this.virusState.overrunTick = 0;
        this.virusState.overrunAt = Date.now();
        this.phase = 'overrun';
        this.trace = null;
        this._setStatus('TIME EXPIRED', 'bad');
        this._playCancel();
    }

    _advanceVirusOverrun() {
        if (!this.virusState || !this.virusState.overrun) return;
        this.virusState.overrunTick++;
        const burst = this.virusState.overrunTick < 20 ? 10 : 18;
        this._spawnVirusBatch(burst, {
            allowSolution: true,
            avoidPath: false,
            minPathDistance: 0,
            minSolutionDistance: this.virusState.solutionBuffer,
            edgeBuffer: this.virusState.edgeBuffer,
        });

        if (Date.now() - this.virusState.overrunAt >= 5200) {
            this._applyVirusOverrunFailure();
        }
    }

    _applyVirusOverrunFailure() {
        if (this.finished) return;
        const result = this._diagnostic('virus_overrun', [
            'TIME EXPIRED.',
            'The subnet calculations and route were not completed in time.',
        ], this._baseResult(this._pathStats()));
        this.lastDiagnostic = result;
        this.attemptsUsed++;
        this._failOut(result);
    }

    _resetTutorialAttemptAfterFailure() {
        if (this.virusState && this.virusState.initialViruses) {
            this.problem.viruses = this.virusState.initialViruses.map((v) => this._cloneTile(v));
        }
        this.path = [this._cloneTile(this.problem.start)];
        this.phase = 'classify';
        this.phaseRevealAt = Date.now();
        this.routeRevealAt = 0;
        this.tutorialSeenPhases = {};
        this.tutorialStep = this.tutorialMode ? 1 : 0;
        this.classMistakes = 0;
        this.classUnlockAt = 0;
        this.classFormation = null;
        this.borrowedBits = 0;
        this.answer = '';
        this.answerError = '';
        this.questElapsedMs = 0;
        this.lastUpdateAt = Date.now();
        this.trace = null;
        this._initVirusSpread();
        this.statusText = 'Attempt reset. Identify the IP class.';
        this.statusTone = 'idle';
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
        // Saturation never removes the protected route before the deadline.
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

    _virusDensity() {
        const total = this.virusState && this.virusState.totalTiles ? this.virusState.totalTiles : 256;
        const count = this.problem && this.problem.viruses ? this.problem.viruses.length : 0;
        return total > 0 ? count / total : 0;
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
        this._failOut(result);
    }

    _baseResult(stats) {
        return {
            gameplayId: 'ip_cidr_quarantine',
            problemId: this.problem.id,
            ipAddress: this.problem.ipAddress,
            ipClass: this.problem.ipClass,
            originalCIDR: this.problem.originalCIDR,
            requiredHosts: this.problem.requiredHosts,
            requiredSubnets: this.problem.requiredSubnets,
            allocatedSubnets: this.problem.allocatedSubnets,
            timeLimitSeconds: this.timeLimitSeconds,
            elapsedSeconds: this.questElapsedMs / 1000,
            targetAddedBits: this.problem.targetAddedBits,
            targetHostBits: this.problem.targetHostBits,
            targetBorrowedBits: this.problem.borrowedBits,
            currentAddedBits: stats.addedBits,
            targetCIDR: this.problem.targetCIDR,
            currentCIDR: stats.currentCIDR,
            optimizedHostBits: this.problem.optimizedHostBits,
            currentHostBits: stats.currentHostBits,
            currentBorrowedBits: stats.borrowedBits,
            optimizedCapacity: this.problem.optimizedCapacity,
            currentCapacity: stats.currentCapacity,
            allocatedCIDR: stats.allocatedCIDR,
            pathLength: this.path.length,
            pathTiles: this.path.map((t) => this._cloneTile(t)),
            moveWeights: stats.moves.map((m) => ({ direction: m.direction, weight: m.weight })),
            directionWeights: Object.assign({}, this.directionWeights),
            difficulty: Object.assign({}, this.problem.difficulty || {}),
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
        // The path sum is the host exponent h. Borrowed bits and the prefix
        // are derived values: borrowed = class host bits - h; CIDR = 32 - h.
        const currentHostBits = Math.max(0, addedBits);
        const currentCIDR = Math.max(0, Math.min(32, 32 - currentHostBits));
        const currentCapacity = this._capacityForHostBits(currentHostBits);
        return {
            addedBits,
            borrowedBits: Math.max(0, currentCIDR - Number(this.problem.originalCIDR || 0)),
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
        if (visibleMoves <= 0 || !stats.moves.length) return 'Path total starts at 0.';
        const last = stats.moves[stats.moves.length - 1];
        const before = stats.addedBits - last.weight;
        return 'Move ' + last.direction + ' +' + last.weight + ': ' + before + ' + ' + last.weight + ' = ' + stats.addedBits;
    }

    _traceCIDRLine(stats) {
        const s = stats || this._traceStats();
        if (this.tutorialMode) return 'Host bits h=' + s.currentHostBits + '  |  CIDR 32-' + s.currentHostBits + ' = /' + s.currentCIDR + '  |  borrowed ' + s.borrowedBits;
        return 'Host bits h=' + s.currentHostBits + '  ->  CIDR /' + s.currentCIDR;
    }

    _finalTraceLine() {
        const stats = this._pathStats();
        if (this.tutorialMode) return 'Final: ' + stats.allocatedCIDR + '  ' + this._formatHosts(stats.currentCapacity) + ' hosts / needed ' + this._formatHosts(this.problem.requiredHosts);
        return 'Final: ' + stats.allocatedCIDR + ' connector validated.';
    }

    _setStatus(text, tone) {
        this.statusText = text;
        this.statusTone = tone || 'idle';
    }

    _isDialogueActive() {
        return !!(IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive());
    }

    _formatHosts(value) {
        if (typeof value === 'string') return value;
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value || 0);
        return n.toLocaleString ? n.toLocaleString('en-US') : String(n);
    }

    _difficultyProfile(questIndex) {
        const q = Math.max(1, Number(questIndex) || 1);
        return {
            level: q,
            minAddedBits: Math.min(13, 2 + q * 2),
            minEndpointDistance: Math.min(7, 2 + q),
            maxRouteMoves: Math.min(12, 5 + q * 2),
            edgeMargin: q >= 3 ? 2 : 1,
            baseViruses: 13 + q * 2,
            virusStep: 3,
            maxViruses: Math.min(48, 24 + q * 5),
            warningDensity: Math.max(0.25, 0.32 - q * 0.02),
            criticalDensity: Math.max(0.40, 0.52 - q * 0.02),
        };
    }

    _attemptLimitLabel() {
        return (this.tutorialMode || this.options.practiceMode) ? '∞' : String(this.maxAttempts);
    }

    _retryLabel(value) {
        return (this.tutorialMode || this.options.practiceMode) ? '∞' : String(Math.max(0, Number(value) || 0));
    }

    _normalizeDirectionWeights(weights) {
        const source = weights || {};
        const fallback = { R: 1, L: 2, U: 3, D: 4 };
        const out = {};
        const used = {};
        const dirs = ['R', 'L', 'U', 'D'];
        for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            let value = Math.max(1, Math.min(4, Number(source[d]) || fallback[d]));
            while (used[value]) value = value % 4 + 1;
            out[d] = value;
            used[value] = true;
        }
        return out;
    }

    _randomDirectionWeights(questIndex, tutorialMode) {
        if (tutorialMode && Number(questIndex || 1) <= 1) {
            return { R: 1, L: 2, U: 3, D: 4 };
        }
        const values = [1, 2, 3, 4];
        for (let i = values.length - 1; i > 0; i--) {
            const j = this._randomInt(0, i);
            const tmp = values[i];
            values[i] = values[j];
            values[j] = tmp;
        }
        const dirs = ['R', 'L', 'U', 'D'];
        const out = {};
        for (let i = 0; i < dirs.length; i++) out[dirs[i]] = values[i];
        return out;
    }

    _directionWeightLine() {
        const w = this.directionWeights || {};
        return 'Host-power moves: R +' + (w.R || 0) + '  L +' + (w.L || 0) + '  U +' + (w.U || 0) + '  D +' + (w.D || 0);
    }

    _maxDirectionWeight() {
        const w = this.directionWeights || {};
        return Math.max(1, Number(w.R) || 1, Number(w.L) || 1, Number(w.U) || 1, Number(w.D) || 1);
    }

    _minDirectionWeight() {
        const w = this.directionWeights || {};
        return Math.max(1, Math.min(Number(w.R) || 1, Number(w.L) || 1, Number(w.U) || 1, Number(w.D) || 1));
    }

    _randomStartTile(edgeMargin) {
        const m = Math.max(0, Math.min(5, Number(edgeMargin) || 0));
        return {
            col: this._randomInt(m, 15 - m),
            row: this._randomInt(m, 15 - m),
        };
    }

    _fillRandomViruses(viruses, blockedKeys, start, end, solutionBufferKeys, edgeBuffer, desiredCount, maxTries) {
        for (let tries = 0; viruses.length < desiredCount && tries < maxTries; tries++) {
            const tile = { col: this._randomInt(0, 15), row: this._randomInt(0, 15) };
            const key = this._tileKey(tile);
            if (blockedKeys[key]) continue;
            if (edgeBuffer > 0 && this._isInEdgeBuffer(tile, edgeBuffer)) continue;
            if (solutionBufferKeys && solutionBufferKeys[key]) continue;
            if (this._manhattan(tile, start) <= 1 || this._manhattan(tile, end) <= 1) continue;
            blockedKeys[key] = true;
            viruses.push(this._cloneTile(tile));
        }
    }

    _drawVirusMeter(ctx, m, x, y, w, h) {
        const density = this._virusDensity();
        const difficulty = this.problem && this.problem.difficulty ? this.problem.difficulty : {};
        const warning = Number(difficulty.warningDensity) || 0.30;
        const critical = Number(difficulty.criticalDensity) || 0.50;
        const pulse = 0.5 + 0.5 * Math.sin(this.animTick * 0.24);
        const fillW = Math.max(0, Math.min(w, w * density));
        const danger = density >= critical;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = danger ? 'rgba(255, 0, 56, ' + (0.70 + pulse * 0.25) + ')' : (density >= warning ? '#FFB000' : '#70E9FF');
        ctx.fillRect(x, y, fillW, h);
        ctx.strokeStyle = danger ? '#FF2D6F' : '#70E9FF';
        ctx.lineWidth = 1.3 * m.sX;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = danger ? '#FFB7C6' : '#BDEEFF';
        ctx.font = 'bold ' + Math.round(11 * m.sY) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Infected tiles: ' + this.problem.viruses.length + '/256', x, y + h + 16 * m.sY);
        ctx.restore();
    }

    _fallbackProblem(spec, difficulty) {
        const profile = spec && spec.profile ? spec.profile : {};
        const questIndex = Number(profile.index || 1) || 1;
        this.directionWeights = { R: 1, L: 2, U: 3, D: 4 };
        const classInfo = this._randomCIDRClass(difficulty, spec && spec.classOverride);
        const borrowedBits = Number.isInteger(spec && spec.borrowedOverride) ? spec.borrowedOverride
            : this._randomInt(classInfo.minAddedBits, classInfo.maxAddedBits);
        const targetCIDR = classInfo.originalCIDR + borrowedBits;
        const optimizedHostBits = Math.max(0, 32 - targetCIDR);
        const ipAddress = this._randomIPForClass(classInfo.ipClass);
        const ipInt = this.tools && typeof this.tools.ipToInt === 'function' ? this.tools.ipToInt(ipAddress) : null;
        const start = { col: 2, row: 4 };
        // Keep the fallback solvable and long enough for the routing tutorial,
        // including small Class C host exponents. Greedy weights can make a
        // four-bit target a single D move, skipping the path-building lesson.
        const downMoves = Math.max(0, Math.ceil((optimizedHostBits - 13) / 4));
        const rightMoves = optimizedHostBits - downMoves * 4;
        const route = this._routeFromMoves(start,
            Array(downMoves).fill('D').concat(Array(rightMoves).fill('R')));
        const end = route.path[route.path.length - 1];
        const blockedKeys = {};
        for (let i = 0; i < route.path.length; i++) blockedKeys[this._tileKey(route.path[i])] = true;
        const solutionBufferKeys = this._buildSolutionBufferKeys(route.path);
        const viruses = [];
        this._fillRandomViruses(viruses, blockedKeys, start, end, solutionBufferKeys, this._virusEdgeBuffer(), Math.min(20, difficulty.baseViruses), 400);
        return {
            id: ['path-quarantine-fallback', questIndex, Date.now(), Math.floor(Math.random() * 9999)].join(':'),
            questIndex,
            difficulty,
            directionWeights: this._normalizeDirectionWeights(this.directionWeights),
            start: this._cloneTile(start),
            end: this._cloneTile(end),
            viruses,
            solutionPath: route.path,
            solutionBufferKeys,
            solutionMoves: route.moves,
            ipAddress,
            ipInt,
            ipClass: classInfo.ipClass,
            originalCIDR: classInfo.originalCIDR,
            requiredHosts: this._randomRequiredHosts(optimizedHostBits),
            targetAddedBits: optimizedHostBits,
            targetHostBits: optimizedHostBits,
            borrowedBits,
            targetCIDR,
            optimizedHostBits,
            optimizedCapacity: this._capacityForHostBits(optimizedHostBits),
            allocatedCIDR: this._allocatedCIDR(ipInt, targetCIDR),
        };
    }

    _pathExponent(path) {
        let out = 0;
        for (let i = 1; i < path.length; i++) out += this.directionWeights[this._directionBetween(path[i - 1], path[i])] || 0;
        return out;
    }

    _randomCIDRClass(difficulty, classOverride) {
        const classes = [
            { ipClass: 'A', originalCIDR: 8, minAddedBits: 2, maxAddedBits: 18 },
            { ipClass: 'B', originalCIDR: 16, minAddedBits: 2, maxAddedBits: 10 },
            { ipClass: 'C', originalCIDR: 24, minAddedBits: 1, maxAddedBits: 4 },
        ];
        if (classOverride) return classes.find((c) => c.ipClass === classOverride) || classes[2];
        let bag = IP2LiveCIDRQuarantineGameplayScreen._classBag;
        if (!bag || !bag.length) {
            bag = ['A', 'B', 'C'];
            for (let i = bag.length - 1; i > 0; i--) {
                const j = this._randomInt(0, i);
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
            IP2LiveCIDRQuarantineGameplayScreen._classBag = bag;
        }
        const selected = bag.pop();
        return classes.find((c) => c.ipClass === selected);
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
        const maximum = Math.max(minimum, capacity);
        return this._randomInt(minimum, maximum);
    }

    _capacityForHostBits(hostBits) {
        const bits = Math.max(0, Number(hostBits) || 0);
        if (bits <= 52) return Math.max(0, Math.pow(2, bits) - 2);
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

    _generateSolutionRoute(start, bits, questIndex, difficulty) {
        const candidates = this._routeCandidatesForBits(start, bits, questIndex, difficulty);
        if (candidates.length) {
            candidates.sort((a, b) => b.score - a.score);
            const topCount = Math.min(Math.max(3, Number(questIndex || 1) + 2), candidates.length);
            const chosen = candidates[this._randomInt(0, topCount - 1)];
            return { moves: chosen.moves.slice(), path: chosen.path.map((t) => this._cloneTile(t)) };
        }
        const fallback = this._routeFromMoves(start, this._movesForAddedBits(bits));
        return fallback && fallback.path && fallback.path.length > 2 && this._inGrid(fallback.path[fallback.path.length - 1]) ? fallback : null;
    }

    _routeCandidatesForBits(start, bits, questIndex, difficulty) {
        const total = Math.max(1, Number(bits) || 1);
        const candidates = [];
        const directions = this._routeDirectionOrder(questIndex);
        const maxWeight = this._maxDirectionWeight();
        const minWeight = this._minDirectionWeight();
        const targetMoves = Math.ceil(total / maxWeight) + Math.max(1, Math.floor(Number(questIndex || 1) / 2));
        const maxMoves = Math.min((difficulty && difficulty.maxRouteMoves) || 12, Math.max(3, targetMoves + 5, Math.ceil(total / minWeight)));
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
            if (remaining > (maxMoves - moves.length) * maxWeight) return;

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
            ['L', 'D', 'R', 'U'],
            ['D', 'L', 'U', 'R'],
            ['U', 'L', 'D', 'R'],
        ];
        const order = orders[(Math.abs(Number(questIndex || 1)) + this._randomInt(0, orders.length - 1)) % orders.length].slice();
        if (Math.random() < 0.5) order.reverse();
        return order;
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
            if (!this._inGrid(cursor)) break;
            solutionPath.push(this._cloneTile(cursor));
        }
        return { moves: solutionMoves.slice(0, Math.max(0, solutionPath.length - 1)), path: solutionPath };
    }

    _movesForAddedBits(bits) {
        const total = Math.max(1, Number(bits) || 1);
        const moves = [];
        let remaining = total;
        const dirs = ['R', 'L', 'U', 'D'].sort((a, b) => (this.directionWeights[b] || 0) - (this.directionWeights[a] || 0));
        while (remaining > 0 && moves.length < 16) {
            let used = false;
            for (let i = 0; i < dirs.length; i++) {
                const weight = this.directionWeights[dirs[i]] || 0;
                if (weight > 0 && weight <= remaining) {
                    moves.push(dirs[i]);
                    remaining -= weight;
                    used = true;
                    break;
                }
            }
            if (!used) break;
        }
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

    _traceChamferPath(ctx, x, y, w, h, cut) {
        const c = Math.min(cut, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
        ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }

    _fillChamferRect(ctx, x, y, w, h, cut, fillStyle) {
        if (fillStyle) ctx.fillStyle = fillStyle;
        this._traceChamferPath(ctx, x, y, w, h, cut);
        ctx.fill();
    }

    _strokeChamferRect(ctx, x, y, w, h, cut, strokeStyle, lineWidth) {
        this._traceChamferPath(ctx, x, y, w, h, cut);
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
            too_small: 'path total too small',
            too_big: 'path total too large',
            not_optimized: 'path total does not match host bits',
        };
        return labels[reason] || 'check the path total';
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
        { id: 'stage.12.mixed.03.cidr_quarantine.tutorial', objectiveId: 'solve_cidr_quarantine_12_03', title: 'CALIBRATE QUARANTINE NODE', label: 'Quarantine Node 03', mapId: 12, sequence: 3, tutorial: true, targetTile: { x: 17, y: 0, z: 0 }, profile: { index: 1, minHosts: 18, maxHosts: 34 } },
        { id: 'stage.12.mixed.04.cidr_quarantine', objectiveId: 'solve_cidr_quarantine_12_04', title: 'TRAP ROGUE AI CLUSTER', label: 'Quarantine Node 04', mapId: 12, sequence: 4, targetTile: { x: 34, y: 0, z: 16 }, profile: { index: 2, minHosts: 26, maxHosts: 58 } },
        { id: 'stage.12.mixed.05.cidr_quarantine', objectiveId: 'solve_cidr_quarantine_12_05', title: 'SEAL INFECTED SEGMENT', label: 'Quarantine Node 05', mapId: 12, sequence: 5, targetTile: { x: 17, y: 0, z: 19 }, profile: { index: 3, minHosts: 42, maxHosts: 92 } },
        { id: 'stage.13.mixed.02.cidr_quarantine', objectiveId: 'solve_cidr_quarantine_13_02', title: 'BUILD SINGLE-ZONE QUARANTINE', label: 'Quarantine Node 02', mapId: 13, sequence: 2, targetTile: { x: 34, y: 0, z: 17 }, profile: { index: 4, minHosts: 70, maxHosts: 120 } },
        { id: 'stage.13.mixed.04.cidr_quarantine', objectiveId: 'solve_cidr_quarantine_13_04', title: 'SEAL APEX RELAY AI', label: 'Quarantine Node 04', mapId: 13, sequence: 4, targetTile: { x: 10, y: 0, z: 25 }, profile: { index: 5, minHosts: 96, maxHosts: 180 } },
    ],

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_cidr_quarantine');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return this.CIDR_QUARANTINE_QUESTS;
    },

    _defaultQuestSpec(mapId) {
        const specs = this._questSpecs();
        const requestedMapId = Number(mapId);
        if (requestedMapId) {
            const sameMap = specs.filter((spec) => Number(spec.mapId || 12) === requestedMapId);
            return sameMap.find((spec) => !!spec.tutorial) || sameMap[0] || specs[0] || this.CIDR_QUARANTINE_QUESTS[0];
        }
        return specs.find((spec) => !!spec.tutorial) || specs[0] || this.CIDR_QUARANTINE_QUESTS[0];
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        const stageId = Number(stage && stage.id);
        if (!qm || !stageId) return [];
        const questIds = [];
        const specs = this._questSpecs().filter((spec) => Number(spec.mapId || 12) === stageId);
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            questIds.push(spec.id);
            if (this._registeredQuestIds[spec.id] && qm.quests && qm.quests[spec.id]) continue;
            const target = Object.assign({}, spec.targetTile);
            qm.registerQuest({
                id: spec.id,
                title: 'QUEST AREA',
                stageMapId: stageId,
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
        const launchOptions = { spec, questId: spec.id, objectiveId: spec.objectiveId, mapId: Number(spec.mapId) || 12, _fromObjective: true };
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
        const problem = this._freshProblem(opts.spec || this._defaultQuestSpec(opts.mapId));
        const open = () => {
            const screen = new IP2LiveCIDRQuarantineGameplayScreen({
                spec: opts.spec,
                questId: opts.questId,
                objectiveId: opts.objectiveId,
                mapId: opts.mapId || (opts.spec && opts.spec.mapId) || 12,
                maxAttempts: 3,
                timeLimitSeconds: opts.timeLimitSeconds,
                problem,
                tutorialMode: !!(opts.spec && opts.spec.tutorial),
                onComplete: (result) => this._onComplete(opts, result),
                onFailed: (result) => this._onFailed(opts, result),
                onCancel: () => this._onCancel(opts),
            });
            const openGameplay = () => {
                this._playMusicZone('GAMEPLAY_1');
                if (opts.tutorialReplay) IP2Live.GameManager.prepareTutorialReplayScreen(screen, opts);
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
        const openSafely = () => {
            try { open(); } catch (e) {
                this._active = false; this._activeAttempt = null; console.warn('[IP2Live] CIDRQuarantineGameplayManager failed to open gameplay:', e);
                if (opts.tutorialReplay && IP2Live.GameManager) IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine', opts, 'unavailable');
            }
        };
        openSafely();
        return true;
    },

    _freshProblem(spec) {
        const temp = new IP2LiveCIDRQuarantineGameplayScreen({ spec });
        return temp.problem;
    },

    _onComplete(options, result) {
        if (IP2Live.GameManager && IP2Live.GameManager.finishTutorialReplay && IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine', options, 'completed', result)) return true;
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec(opts.mapId);
        const mapId = Number(opts.mapId || spec.mapId) || 12;
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
                        mapId,
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
                IP2Live.GameManager.handleGameplayCompleted('ip_cidr_quarantine', { gameplayId: 'ip_cidr_quarantine', spec, questId: opts.questId, objectiveId: opts.objectiveId, mapId, result });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        finalizeExit();
    },

    _onFailed(options, result) {
        if (IP2Live.GameManager && IP2Live.GameManager.finishTutorialReplay && IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine', options, 'failed', result)) return true;
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec(opts.mapId);
        const mapId = Number(opts.mapId || spec.mapId) || 12;
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_cidr_quarantine', { gameplayId: 'ip_cidr_quarantine', spec, questId: opts.questId, objectiveId: opts.objectiveId, mapId, result, skipDiagnosticScreen: true });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        const timedOut = result && (result.diagnosticReason === 'virus_overrun' || result.reason === 'virus_overrun');
        if (timedOut && IP2Live.LoadingScreen2 && typeof IP2Live.LoadingScreen2.show === 'function') {
            IP2Live.LoadingScreen2.show({
                mode: 'replace', status: 'Disconnecting compromised system',
                detail: opts.developerTest ? 'Returning to testing panel' : 'Returning to floor',
                onComplete: finalizeExit,
            });
        } else finalizeExit();
    },

    recoverAfterFailure(spec) {
        this._recoverToTutorial(spec);
        return true;
    },

    _recoverToTutorial(failedSpec) {
        const qm = IP2Live.QuestManager;
        const failedMapId = Number(failedSpec && failedSpec.mapId) || 12;
        const sameMapSpecs = this._questSpecs().filter((spec) => Number(spec.mapId || 12) === failedMapId);
        const tutorial = sameMapSpecs.find((spec) => !!spec.tutorial) || failedSpec || sameMapSpecs[0] || this._defaultQuestSpec(failedMapId);
        this._introShown = false;
        if (qm && tutorial) {
            qm.completedObjectives[tutorial.id] = {};
            if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
            qm.startQuest(tutorial.id, { mapId: failedMapId, mapQuestMode: true, keepLastCompletion: true, visible: true, preview: false, guideActive: true, allowCompletion: true });
        }
        if (IP2Live.IPCIDRQuarantineTutorial && typeof IP2Live.IPCIDRQuarantineTutorial.showRecovery === 'function') {
            setTimeout(() => IP2Live.IPCIDRQuarantineTutorial.showRecovery({ failedLabel: failedSpec && failedSpec.label }), 220);
        }
    },

    _onCancel(options) {
        if (IP2Live.GameManager && IP2Live.GameManager.finishTutorialReplay && IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine', options, 'cancelled', null)) return true;
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec(opts.mapId);
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        this._restoreStageMusic();
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
            IP2Live.GameManager.handleGameplayCancelled('ip_cidr_quarantine', {
                gameplayId: 'ip_cidr_quarantine',
                spec,
                questId: opts.questId || spec.id,
                objectiveId: opts.objectiveId || spec.objectiveId,
                mapId: opts.mapId || spec.mapId || 12,
                result: { cancelled: true },
            });
        }
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
