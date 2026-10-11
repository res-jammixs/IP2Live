/**
 * Gameplay 6: Subnet Blaster. Canvas-native subnet analysis arcade.
 * Keep the legacy gameplay ID and manager API so campaign saves remain valid.
 */
const IP2LiveSubnetBlasterRules = {
    defaults: { A: 8, B: 16, C: 24 },
    shuffle(items, random = Math.random) {
        const result = items.slice();
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    },
    toIP(value) {
        // Use arithmetic, not signed bitwise addition: Class C exceeds 2^31.
        return [24, 16, 8, 0].map(shift => Math.floor(value / Math.pow(2, shift)) % 256).join('.');
    },
    generate(settings = {}, random = Math.random) {
        const integer = (low, high) => low + Math.floor(random() * (high - low + 1));
        const ipClass = settings.ipClass || ['A', 'B', 'C'][integer(0, 2)];
        const defaultPrefix = this.defaults[ipClass];
        if (!defaultPrefix) throw new Error('Subnet Blaster supports Classes A, B and C.');
        const availableBits = 32 - defaultPrefix;
        // /31 and /32 have special semantics and no conventional broadcast exercise.
        const hostBits = settings.hostBits === undefined ? integer(2, availableBits - 1) : settings.hostBits;
        if (!Number.isInteger(hostBits) || hostBits < 2 || hostBits > availableBits) throw new Error('Invalid host-bit count.');
        const blockSize = Math.pow(2, hostBits);
        const prefix = 32 - hostBits;
        const borrowedBits = availableBits - hostBits;
        const first = ipClass === 'A' ? 10 : ipClass === 'B' ? 172 : 192;
        const second = ipClass === 'A' ? 0 : ipClass === 'B' ? integer(16, 31) : 168;
        const third = ipClass === 'C' ? integer(0, 255) : 0;
        const parent = first * Math.pow(2, 24) + second * 65536 + third * 256;
        const subnetIndex = integer(0, Math.pow(2, borrowedBits) - 1);
        const network = parent + subnetIndex * blockSize;
        const broadcast = network + blockSize - 1;
        const asked = settings.asked || (random() < 0.5 ? 'broadcast' : 'network');
        const givenBits = settings.givenBits || (random() < 0.5 ? 'borrowed' : 'host');
        if (!['network', 'broadcast'].includes(asked) || !['borrowed', 'host'].includes(givenBits)) throw new Error('Invalid challenge mode.');
        return {
            id: [ipClass, prefix, network, asked, givenBits].join(':'),
            ipClass, defaultPrefix, availableBits, hostBits, borrowedBits, prefix, blockSize,
            network, broadcast, asked, givenBits,
            givenAddress: this.toIP(asked === 'broadcast' ? network : broadcast),
            answerAddress: this.toIP(asked === 'broadcast' ? broadcast : network),
            operator: asked === 'broadcast' ? '+' : '-',
            correction: asked === 'broadcast' ? '- 1' : '+ 1',
            baseCIDR: this.toIP(network) + '/' + prefix,
        };
    },
    waves(problem) {
        const p = problem;
        const h = p.hostBits;
        const candidates = [
            { key: 'operator', title: 'CHOOSE THE OPERATOR', prompt: 'Which operation moves toward the requested address?', correct: p.operator,
                choices: ['+', '-', '\u00d7'].map(value => ({ value, label: value, detail: value === '+' ? 'ADD THE BLOCK' : value === '-' ? 'SUBTRACT THE BLOCK' : 'MULTIPLY THE ADDRESS' })) },
            { key: 'blockSize', title: 'LOAD THE BLOCK SIZE', prompt: 'Choose the total address count, including both endpoints.', correct: p.blockSize,
                choices: [
                    { value: p.blockSize, label: p.blockSize.toLocaleString('en-US'), detail: 'ADDRESSES' },
                    { value: p.blockSize - 2, label: (p.blockSize - 2).toLocaleString('en-US'), detail: 'ADDRESSES' },
                    { value: h * 2, label: String(h * 2), detail: 'ADDRESSES' },
                ] },
        ];
        // Equal host/borrowed counts or h=2 can produce duplicate answers.
        // Keep three distinct values so only one barrier can be correct.
        for (const wave of candidates) {
            const seen = new Set();
            for (const choice of wave.choices) {
                if (seen.has(choice.value)) {
                    let replacement = typeof wave.correct === 'number' ? wave.correct + 1 : '/';
                    while (seen.has(replacement) || replacement === wave.correct) replacement++;
                    choice.value = replacement;
                    choice.label = String(replacement);
                    choice.detail = 'ALTERNATE VALUE';
                }
                seen.add(choice.value);
            }
        }
        return candidates;
    },
    explain(problem, key) {
        const p = problem;
        if (key === 'operator') return p.asked === 'broadcast' ? 'Broadcast is the last address: add the block, then subtract 1.' : 'Network is the first address: subtract the block, then add 1.';
        if (key === 'hostBits') return p.givenBits === 'host' ? 'Host bits are already given: use h = ' + p.hostBits + ' directly.' : 'Class ' + p.ipClass + ' has ' + p.availableBits + ' default host bits. ' + p.availableBits + ' - ' + p.borrowedBits + ' = ' + p.hostBits + ' host bits.';
        return 'Use the familiar 2^h step: 2^' + p.hostBits + ' = ' + p.blockSize.toLocaleString('en-US') + ' total addresses. Keep all addresses for block size; do not subtract 2.';
    },
    calculate(expression) {
        // A small arithmetic parser; never execute player input as JavaScript.
        const source = String(expression).replace(/\s/g, '');
        if (!source || source.length > 60 || /[^0-9.+\-*/^()]/.test(source)) throw new Error('Use numbers and arithmetic operators.');
        const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+\-*/^()]/g) || [];
        if (tokens.join('') !== source) throw new Error('Check the expression.');
        let i = 0;
        const atom = () => {
            if (tokens[i] === '(') {
                i++;
                const value = add();
                if (tokens[i++] !== ')') throw new Error('Close the parentheses.');
                return value;
            }
            const token = tokens[i++];
            if (!token || !/^(?:\d|\.)/.test(token)) throw new Error('Enter a number.');
            return Number(token);
        };
        const power = () => { const left = atom(); return tokens[i] === '^' ? (i++, Math.pow(left, unary())) : left; };
        const unary = () => tokens[i] === '-' ? (i++, -unary()) : tokens[i] === '+' ? (i++, unary()) : power();
        const multiply = () => {
            let value = unary();
            while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++]; const right = unary(); value = op === '*' ? value * right : value / right; }
            return value;
        };
        const add = () => {
            let value = multiply();
            while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++]; const right = multiply(); value = op === '+' ? value + right : value - right; }
            return value;
        };
        const result = add();
        if (i !== tokens.length || !Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) throw new Error('Check the expression or result size.');
        return result;
    },
};

class IP2LiveCIDRQuarantineMatrixConnectorScreen extends Scene.Base {
    static ADDRESS_DROP = { release: 260, fall: 620, hold: 2600, transfer: 950, settle: 700 };
    static DOCK_TYPING = { erase: 180, stagger: 25, type: 420,
        fields: ['classValue', 'addressLabel', 'addressValue', 'bitsLabel', 'bitsValue', 'formulaGiven', 'operator', 'blockSize', 'correction', 'answer'] };
    constructor(options) { super(true); this.options = options || {}; this._configure(); }
    initialize() { this.options = this.options || {}; this._configure(); }
    _configure() {
        this.gameplayId = 'ip_cidr_quarantine_matrix';
        this.gameplayVersion = 'subnet-blaster-v4';
        this.tutorialMode = !!(this.options.tutorialMode || (this.options.spec && this.options.spec.tutorial));
        this.finished = false; this.maxAttempts = 3; this.attemptsUsed = 0;
        this.hearts = 3; this.bossHP = 3; this.previousBossHP = 3;
        this.correctShots = 0; this.totalShots = 0; this.bulletsFired = 0;
        this.roundHistory = [];
        this.decisionHistory = [];
        this.decisionHistoryComplete = true;
        this.activeElapsedMs = 0; this.preparationMs = 0; this.preparationSkips = 0;
        this.calculatorUses = 0; this.calculatorElapsedMs = 0; this.helpElapsedMs = 0;
        this.phaseDurationsMs = {}; this.barrierImpacts = 0; this.bossBulletImpacts = 0;
        this.classOrder = IP2LiveSubnetBlasterRules.shuffle(['A', 'B', 'C']);
        this.askedOrder = IP2LiveSubnetBlasterRules.shuffle(['broadcast', 'network']);
        this.bitsOrder = IP2LiveSubnetBlasterRules.shuffle(['borrowed', 'host']);
        this.challengeSerial = 0; this.animTick = 0; this.elapsedMs = 0; this.lastUpdateAt = null;
        this.selectedLane = 1; this.calculatorOpen = false; this.helpOpen = false;
        this.tutorialWalkthroughActive = false; this.tutorialPromptActive = false; this.tutorialSeenPhases = {};
        this.pointerPosition = null;
        this.skipHoverStartedAt = null;
        this.buttonRects = [];
        this._newEncounter(this.options.problem);
    }
    async load() { this.loading = false; this.lastUpdateAt = null; this._paint(); }
    _newEncounter(problem) {
        const rules = IP2LiveSubnetBlasterRules, old = this.problem;
        const previous = old && old.asked && old.givenAddress ? this._dockValues(old) : null;
        const settings = { ipClass: this.classOrder[3 - this.bossHP], asked: this.askedOrder[this.challengeSerial % 2], givenBits: this.bitsOrder[Math.floor(this.challengeSerial / 2) % 2] };
        this.problem = problem && problem.asked && problem.answerAddress ? problem : rules.generate(settings);
        for (let n = 0; old && this.problem.id === old.id && n < 10; n++) this.problem = rules.generate(settings);
        if (problem && problem.ipClass) this.classOrder = [problem.ipClass].concat(this.classOrder.filter(value => value !== problem.ipClass));
        this.challengeSerial++;
        this.waves = rules.waves(this.problem).map(wave => ({ ...wave, choices: rules.shuffle(wave.choices) }));
        this.waveIndex = 0; this.weapon = {}; this.weaponLabels = {}; this.encounterResult = null;
        this.encounterTelemetry = { preparationMs: 0, preparationSkipped: false, calculatorUses: 0, calculatorElapsedMs: 0,
            activeElapsedMs: 0, barrierImpacts: 0, bossBulletImpacts: 0, collectedAtMs: {} };
        this.thinkRemainingMs = 60000; this.pickup = null; this.projectiles = []; this.barrierHits = [0, 0, 0];
        this.fireCooldownMs = 500; this.waveAgeMs = 0;
        this.bossImpactCount = 0; this.bossImpactFlashMs = 0;
        this.calculatorOpen = false; this.calculatorExponent = 0;
        this.addressDrop = null;
        this.dockTyping = previous && !this.options.reducedMotion ? { elapsedMs: 0, previous } : null;
        this._setPhase('think'); this.lastUpdateAt = null; this._paint();
    }
    _setPhase(phase) { this.phase = phase; this.phaseElapsedMs = 0; if (phase !== 'think') this.skipHoverStartedAt = null; }
    _paint() { if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true; }
    _dialogueActive() { return !!(IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive()); }
    startTutorialWalkthrough() {
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!helper || typeof helper.showIntro !== 'function') return false;
        this._finishDockTyping();
        this.tutorialWalkthroughActive = true;
        const started = this._showTutorialLesson('intro', finish => helper.showIntro(this.problem, finish), () => {
            if (!this.finished && !this._ip2liveGameplayExited && typeof helper.showPreparationGuide === 'function') {
                this._showTutorialLesson('preparation', finish => helper.showPreparationGuide(this.problem, finish));
            }
        });
        if (started === false) this.tutorialWalkthroughActive = false;
        return started;
    }
    _showTutorialLesson(key, show, after) {
        this.tutorialSeenPhases = this.tutorialSeenPhases || {};
        this.tutorialSeenPhases[key] = true; this.tutorialPromptActive = true;
        const finish = () => {
            this.tutorialPromptActive = false; this.onGameplayResume(); this._paint();
            if (typeof after === 'function') after();
        };
        const started = show(finish);
        if (started === false) this.tutorialPromptActive = false;
        return started;
    }
    _maybeShowTutorialGuide() {
        if (!this.tutorialWalkthroughActive || this.tutorialPromptActive || this.finished || this.calculatorOpen || this.helpOpen || this._dialogueActive()) return;
        const key = this.phase === 'barriers' ? this.waves[this.waveIndex].key : this.phase === 'boss' ? 'boss' : null;
        const helper = IP2Live.IPCIDRQuarantineMatrixTutorial;
        if (!key || this.tutorialSeenPhases[key] || !helper || typeof helper.showPhaseGuide !== 'function') return;
        this._showTutorialLesson(key, finish => helper.showPhaseGuide(key, this.problem, finish));
    }
    _ensureSessionCompatible() {
        if (this.gameplayVersion !== 'subnet-blaster-v4' || !this.problem || !this.problem.asked || !Array.isArray(this.projectiles) ||
            !['think', 'barriers', 'pickup', 'boss_enter', 'boss', 'boss_hit', 'counterattack', 'player_hit', 'boss_retreat', 'drop', 'success', 'failed'].includes(this.phase)) this._configure();
        // Resume older v4 scenes without inventing the telemetry they never stored.
        if (!this.encounterTelemetry) {
            this.decisionHistoryComplete = false;
            this.encounterTelemetry = { preparationMs: 0, preparationSkipped: false, calculatorUses: 0, calculatorElapsedMs: 0,
                activeElapsedMs: 0, barrierImpacts: 0, bossBulletImpacts: 0, collectedAtMs: {} };
        }
        for (const key of ['activeElapsedMs', 'preparationMs', 'preparationSkips', 'calculatorUses', 'calculatorElapsedMs', 'helpElapsedMs', 'barrierImpacts', 'bossBulletImpacts']) {
            if (!Number.isFinite(this[key])) this[key] = 0;
        }
        this.phaseDurationsMs = this.phaseDurationsMs || {}; this.decisionHistory = this.decisionHistory || [];
        this.tutorialSeenPhases = this.tutorialSeenPhases || {};
        if (!this.addressDrop && this.encounterResult && this.encounterResult.passed &&
            ['boss_hit', 'boss_retreat', 'drop', 'success'].includes(this.phase)) {
            // Existing v4 saves keep their current encounter and join the new pickup sequence.
            const elapsed = this.phase === 'boss_hit' ? this.phaseElapsedMs
                : this.phase === 'boss_retreat' ? 950 + this.phaseElapsedMs : 1800 + this.phaseElapsedMs;
            this.addressDrop = { elapsedMs: elapsed, installed: this.phase === 'success' || elapsed >= this._addressArrivalMs() };
        }
        if (this.addressDrop === undefined) this.addressDrop = null;
        if (this.dockTyping === undefined) this.dockTyping = null;
    }
    update() {
        this._ensureSessionCompatible();
        const now = Date.now(), dt = this.lastUpdateAt === null ? 0 : Math.max(0, Math.min(100, now - this.lastUpdateAt));
        this.lastUpdateAt = now;
        const popup = IP2Live.GameplayCompletionPopup;
        if (popup && popup.update) popup.update(this);
        if (this.finished || this._dialogueActive() || this.tutorialPromptActive || this.calculatorOpen || this.helpOpen) {
            if (!this.finished && this.helpOpen) this.helpElapsedMs = (this.helpElapsedMs || 0) + dt;
            this._paint(); return;
        }
        this._maybeShowTutorialGuide();
        if (this._dialogueActive() || this.tutorialPromptActive) { this._paint(); return; }
        if (this.phase === 'think' && this._dockTypingActive()) {
            this.dockTyping.elapsedMs += dt;
            if (!this.options.reducedMotion) this.animTick += dt / 16.667;
            this._paint(); return;
        }
        if (this.addressDrop) {
            this.addressDrop.elapsedMs += dt;
            if (this.addressDrop.elapsedMs >= this._addressArrivalMs()) this.addressDrop.installed = true;
        }
        this.phaseDurationsMs = this.phaseDurationsMs || {};
        this.phaseDurationsMs[this.phase] = (this.phaseDurationsMs[this.phase] || 0) + dt;
        if (this.phase === 'barriers') {
            this.activeElapsedMs = (this.activeElapsedMs || 0) + dt;
            this.encounterTelemetry.activeElapsedMs += dt;
        }
        if (this.phase === 'think') { this.preparationMs = (this.preparationMs || 0) + dt; this.encounterTelemetry.preparationMs += dt; }
        this.elapsedMs += dt; this.phaseElapsedMs += dt;
        this.bossImpactFlashMs = Math.max(0, this.bossImpactFlashMs - dt);
        if (!this.options.reducedMotion) this.animTick += dt / 16.667;
        const phase = this.phase;
        if (phase === 'think') {
            this.thinkRemainingMs = Math.max(0, this.thinkRemainingMs - dt);
            if (!this.thinkRemainingMs) this._beginWave();
        } else if (phase === 'barriers' || phase === 'boss') {
            this.waveAgeMs += dt;
            this._updateShots(dt);
            if (this.phase === phase) {
                this.fireCooldownMs -= dt;
                if (this.fireCooldownMs <= 0) { this._fire(); this.fireCooldownMs += 160; }
            }
        } else if (phase === 'pickup') {
            if (this.phaseElapsedMs >= 720) this._completePickup();
        } else if (phase === 'boss_enter') {
            if (this.phaseElapsedMs >= 850) { this._setPhase('boss'); this.fireCooldownMs = 180; }
        } else if (phase === 'boss_hit') {
            if (this.phaseElapsedMs >= 950) this._setPhase('boss_retreat');
        } else if (phase === 'counterattack') {
            if (this.phaseElapsedMs >= 1100) this._takeBossAttack();
        } else if (phase === 'player_hit') {
            if (this.phaseElapsedMs >= 700) this._setPhase('boss_retreat');
        } else if (phase === 'boss_retreat') {
            if (this.phaseElapsedMs >= 850) {
                if (this.encounterResult.passed) this._setPhase('drop');
                else if (!this.hearts) this._failOut();
                else this._newEncounter();
            }
        } else if (phase === 'drop' && this.addressDrop &&
            this.addressDrop.elapsedMs >= this._addressArrivalMs() + this.constructor.ADDRESS_DROP.settle) this._continue();
        this._paint();
    }
    _skipPreparation() {
        if (this.phase !== 'think' || this.finished || this.calculatorOpen || this.helpOpen || this.tutorialPromptActive || this._dialogueActive()) return;
        this._finishDockTyping();
        this.preparationSkips = (this.preparationSkips || 0) + 1; this.encounterTelemetry.preparationSkipped = true;
        this._beginWave(); this._paint();
    }
    _beginWave() {
        this._setPhase('barriers'); this.barrierHits = [0, 0, 0]; this.projectiles = [];
        this.waveAgeMs = 0; this.fireCooldownMs = 500;
    }
    _updateShots(dt) {
        const remaining = [];
        for (const bullet of this.projectiles) {
            bullet.y -= dt * 1.05;
            if (bullet.y <= (bullet.kind === 'boss' ? 345 : 355)) {
                if (bullet.kind === 'boss') this._hitBoss();
                else this._hitBarrier(bullet.lane);
                if (!['barriers', 'boss'].includes(this.phase)) break;
            } else remaining.push(bullet);
        }
        this.projectiles = ['barriers', 'boss'].includes(this.phase) ? remaining : [];
    }
    _fire() {
        if (this.finished || this.calculatorOpen || this.helpOpen || this.tutorialPromptActive || this._dialogueActive() || !['barriers', 'boss'].includes(this.phase)) return false;
        if (this.phase === 'boss' && this.projectiles.length) return false;
        this.projectiles.push({ lane: this.selectedLane, y: 510, kind: this.phase === 'boss' ? 'boss' : 'barrier' });
        this.bulletsFired++; return true;
    }
    _hitBarrier(lane) {
        if (this.phase !== 'barriers' || lane < 0 || lane > 2) return;
        this.barrierHits[lane]++;
        this.barrierImpacts = (this.barrierImpacts || 0) + 1; this.encounterTelemetry.barrierImpacts++;
        if (this.barrierHits[lane] < 10) return;
        const wave = this.waves[this.waveIndex], choice = wave.choices[lane];
        this.pickup = { key: wave.key, value: choice.value, label: choice.label, lane, x: 240 + lane * 400, y: 285 };
        this.projectiles = []; this._setPhase('pickup'); this._sound('soundCursor');
    }
    _completePickup() {
        if (this.phase !== 'pickup' || !this.pickup) return;
        const item = this.pickup;
        // Every choice is collected. Nothing is graded or rejected before APEX.
        this.weapon[item.key] = item.value; this.weaponLabels[item.key] = item.label;
        this.encounterTelemetry.collectedAtMs[item.key] = this.encounterTelemetry.activeElapsedMs;
        this.pickup = null; this.waveIndex++;
        if (this.waveIndex >= this.waves.length) { this._setPhase('boss_enter'); this.projectiles = []; }
        else this._beginWave();
    }
    _hitBoss() {
        if (this.phase !== 'boss') return;
        this.bossImpactCount++; this.bossImpactFlashMs = 180;
        this.bossBulletImpacts = (this.bossBulletImpacts || 0) + 1; this.encounterTelemetry.bossBulletImpacts++;
        if (this.bossImpactCount < 5) return;
        const p = this.problem;
        const mistakes = ['operator', 'blockSize'].filter(key => this.weapon[key] !== p[key]);
        this.totalShots += 2; this.correctShots += 2 - mistakes.length;
        this.decisionHistory = this.decisionHistory || [];
        for (const key of ['operator', 'blockSize']) this.decisionHistory.push({
            stepKey: key === 'operator' ? 'address_operator' : 'subnet_block_size',
            concept: key === 'operator' ? 'network_broadcast_direction' : 'host_bits_to_block_size',
            submitted: this.weapon[key], expected: p[key], correct: this.weapon[key] === p[key],
            issueType: this.weapon[key] === p[key] ? null : key === 'operator' ? 'wrong_address_direction'
                : this.weapon[key] === p.blockSize - 2 ? 'usable_hosts_instead_of_total_addresses'
                : this.weapon[key] === p.hostBits * 2 ? 'linear_instead_of_exponential' : 'wrong_block_size',
            problemId: p.id, ipClass: p.ipClass, asked: p.asked, givenBits: p.givenBits, hostBits: p.hostBits,
            borrowedBits: p.borrowedBits, givenAddress: p.givenAddress, collectedAtMs: this.encounterTelemetry.collectedAtMs[key] || 0,
        });
        this.encounterResult = { passed: !mistakes.length, mistakes, weapon: { ...this.weapon } };
        this.projectiles = [];
        if (mistakes.length) {
            this._setPhase('counterattack');
        } else {
            this.previousBossHP = this.bossHP; this.bossHP--;
            this.addressDrop = { elapsedMs: 0, installed: false };
            this._recordEncounter(true, []); this._setPhase('boss_hit'); this._sound('soundConfirmation');
        }
    }
    _takeBossAttack() {
        if (this.phase !== 'counterattack') return;
        this.hearts--; this.attemptsUsed++;
        const mistakes = this.encounterResult.mistakes;
        this._recordEncounter(false, mistakes); this._setPhase('player_hit'); this._sound('soundImpossible');
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
            IP2Live.GameManager.handleGameplayMistake(this.gameplayId, {
                mapId: this.options.mapId || 13, questId: this.options.questId, objectiveId: this.options.objectiveId,
                spec: this.options.spec,
                developerTest: !!this.options.developerTest,
                mistakes: this.decisionHistory.slice(-2).filter(decision => !decision.correct).map(decision => ({ ...decision, reason: decision.stepKey })),
                attemptsRemaining: this.hearts, telemetryOnly: true,
                result: { weapon: { ...this.weapon }, expected: { operator: this.problem.operator, blockSize: this.problem.blockSize } }, onComplete() {},
            });
        }
    }
    _recordEncounter(passed, mistakes) {
        const p = this.problem;
        this.roundHistory.push({ problemId: p.id, ipClass: p.ipClass, asked: p.asked, givenBits: p.givenBits, prefix: p.prefix,
            defaultPrefix: p.defaultPrefix, availableBits: p.availableBits, hostBits: p.hostBits, borrowedBits: p.borrowedBits,
            givenAddress: p.givenAddress, blockSize: p.blockSize, answer: p.answerAddress, correction: p.correction,
            expected: { operator: p.operator, blockSize: p.blockSize }, passed, mistakes: mistakes.slice(), weapon: { ...this.weapon },
            ...this.encounterTelemetry, collectedAtMs: { ...this.encounterTelemetry.collectedAtMs } });
    }
    _continue() {
        if (this.finished || this.phase !== 'drop' || !this.addressDrop || !this.addressDrop.installed) return;
        if (!this.hearts) this._failOut();
        else if (!this.bossHP) this._finishSuccess();
        else this._newEncounter();
    }
    _result(passed) {
        return { telemetrySchemaVersion: 2, gameplayVersion: this.gameplayVersion, gameplayId: this.gameplayId, passed, problemId: this.problem.id,
            baseCIDR: this.problem.baseCIDR, attemptsUsed: this.attemptsUsed + (passed ? 1 : 0), maxAttempts: 3,
            retries: this.attemptsUsed, mistakeCount: this.attemptsUsed, heartsRemaining: this.hearts,
            bossHits: 3 - this.bossHP, correctShots: this.correctShots, totalShots: this.totalShots, bulletsFired: this.bulletsFired,
            correctDecisions: this.correctShots, totalDecisions: this.totalShots, incorrectDecisions: this.totalShots - this.correctShots,
            decisionHistory: (this.decisionHistory || []).map(decision => ({ ...decision })), decisionHistoryComplete: this.decisionHistoryComplete === true,
            activeElapsedMs: this.activeElapsedMs, durationMethod: 'subnet_decisions_v1', timingMethod: 'active_decision_clock', preparationMs: this.preparationMs, preparationSkips: this.preparationSkips,
            calculatorUses: this.calculatorUses, calculatorElapsedMs: this.calculatorElapsedMs, helpElapsedMs: this.helpElapsedMs,
            assistanceElapsedMs: this.calculatorElapsedMs + this.helpElapsedMs, phaseDurationsMs: { ...this.phaseDurationsMs },
            barrierImpacts: this.barrierImpacts, bossBulletImpacts: this.bossBulletImpacts,
            roundHistory: this.roundHistory.map(round => ({ ...round, mistakes: round.mistakes.slice(), weapon: { ...round.weapon },
                expected: { ...round.expected }, collectedAtMs: { ...round.collectedAtMs } })), elapsedMs: this.elapsedMs };
    }
    _finishSuccess(result) {
        if (this.finished) return;
        this.finished = true; this._setPhase('success');
        const payload = { ...result, ...this._result(true) };
        const complete = () => { if (typeof this.options.onComplete === 'function') this.options.onComplete(payload); };
        const popup = IP2Live.GameplayCompletionPopup;
        if (popup && popup.begin && popup.begin(this, { gameplayId: this.gameplayId, label: 'Subnet Blaster cleared', footer: 'THREE ADDRESS CORES RECOVERED', durationMs: 950, result: payload, onComplete: complete })) return;
        complete();
    }
    _failOut() {
        if (this.finished) return;
        this.finished = true; this._setPhase('failed');
        if (typeof this.options.onFailed === 'function') this.options.onFailed({ ...this._result(false), reason: 'hearts_exhausted' });
    }
    _cancel() { if (this.finished) return; this.finished = true; if (typeof this.options.onCancel === 'function') this.options.onCancel(); }
    _openPauseMenu() { this.lastUpdateAt = null; if (IP2Live.GameplayPause && IP2Live.GameplayPause.open) IP2Live.GameplayPause.open(this, this.gameplayId); else this._cancel(); }
    onGameplayResume() {
        this.lastUpdateAt = null;
        if (!this._dialogueActive()) this.tutorialPromptActive = false;
        const top = Manager && Manager.Stack && Manager.Stack.top;
        // Durable saves restore the gameplay scene; transient helper overlays are reopened manually.
        if (this.calculatorOpen && !(top && top.options && top.options.backgroundScene === this)) this.calculatorOpen = false;
    }
    _closeGameplayOverlay() {
        if (this.helpOpen) { this.helpOpen = false; this.onGameplayResume(); return true; }
        return false;
    }
    _keyToken(key) { return String(key && (key.code || key.name || key) || '').toUpperCase().replace(/^KEY/, '').replace(/^(DIGIT|NUMPAD)(\d)$/, '$2'); }
    onKeyPressed(key) {
        const token = this._keyToken(key);
        if (this._dialogueActive()) { if (['ENTER', 'SPACE', 'SPACEBAR', ' '].includes(token)) IP2Live.DialogueManager.advance(); return true; }
        if (this.tutorialPromptActive) return true;
        if (token === 'ESCAPE' || (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key))) { if (!this._closeGameplayOverlay()) this._openPauseMenu(); return true; }
        if (this.finished) return true;
        if (this.helpOpen) { if (['ENTER', 'SPACE', 'SPACEBAR', ' '].includes(token)) { this.helpOpen = false; this.onGameplayResume(); } return true; }
        if (this.calculatorOpen) return true;
        if (token === 'C') { this._openCalculator(); return true; }
        if (token === 'H') { this.helpOpen = true; return true; }
        if (['ENTER', 'SPACE', 'SPACEBAR', ' '].includes(token)) {
            if (this.phase === 'think') this._skipPreparation();
            else if (this.phase === 'drop') this._continue();
            return true;
        }
        this._aimKey(token); this._paint(); return true;
    }
    _aimKey(token) {
        if (this.phase !== 'barriers') return;
        if (['ARROWLEFT', 'A'].includes(token)) this.selectedLane = Math.max(0, this.selectedLane - 1);
        if (['ARROWRIGHT', 'D'].includes(token)) this.selectedLane = Math.min(2, this.selectedLane + 1);
        if (/^[123]$/.test(token)) this.selectedLane = Number(token) - 1;
    }
    onKeyPressedRepeat() { return true; }
    onKeyPressedAndRepeat() { return true; }
    _layout() {
        this.consoleRect = { x: 16, y: 46, w: 1248, h: 538 };
        this.aimRect = { x: 40, y: 214, w: 1200, h: 348 };
        this.formulaTargets = { operator: { x: 625, y: 661 }, blockSize: { x: 767, y: 661 }, answer: { x: 1101, y: 661 } };
        this.buttonRects = [
            { x: 1096, y: 9, w: 97, h: 27, action: 'calculator', label: 'CALC [C]' },
            { x: 1202, y: 9, w: 62, h: 27, action: 'help', label: '? [H]' },
        ];
        if (this.phase === 'think') this.buttonRects.push({ x: 618, y: 364, w: 44, h: 44, radius: 22, action: 'skip', tooltip: 'Skip preparation' });
        if (this.helpOpen) this.buttonRects = [{ x: 500, y: 542, w: 280, h: 44, action: 'closeHelp', label: 'ENTER THE CONSOLE [ENTER]' }];
        if (this.calculatorOpen) this.buttonRects = [];
    }
    _toLogical(x, y) {
        const canvas = Common.Platform.ctx.canvas, scale = Math.min(canvas.width / 1280, canvas.height / 720);
        return { x: (x - (canvas.width - 1280 * scale) / 2) / scale, y: (y - (canvas.height - 720 * scale) / 2) / scale };
    }
    _inside(x, y, rect) {
        if (rect.radius) return Math.hypot(x - rect.x - rect.w / 2, y - rect.y - rect.h / 2) <= rect.radius;
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }
    onMouseDown(x, y) {
        if (this._dialogueActive()) { IP2Live.DialogueManager.advance(); return true; }
        if (this.tutorialPromptActive) return true;
        if (this.finished) return true;
        if (this.calculatorOpen) return true;
        const p = this._toLogical(x, y); this._layout();
        const b = this.buttonRects.find(rect => this._inside(p.x, p.y, rect));
        if (b) {
            if (b.action === 'calculator') this._openCalculator();
            if (b.action === 'help') this.helpOpen = true;
            if (b.action === 'skip') this._skipPreparation();
            if (b.action === 'closeHelp') { this.helpOpen = false; this.onGameplayResume(); }
        } else this._aimPointer(p);
        this._paint(); return true;
    }
    _aimPointer(p) { if (!this.helpOpen && !this.calculatorOpen && !this.tutorialPromptActive && !this._dialogueActive() && this.phase === 'barriers' && this._inside(p.x, p.y, this.aimRect)) this.selectedLane = Math.max(0, Math.min(2, Math.floor((p.x - 40) / 400))); }
    onMouseMove(x, y) {
        if (!this.finished) {
            this._layout(); this.pointerPosition = this._toLogical(x, y);
            const skip = this.buttonRects.find(button => button.action === 'skip');
            if (skip && this._inside(this.pointerPosition.x, this.pointerPosition.y, skip)) {
                if (this.skipHoverStartedAt == null) this.skipHoverStartedAt = Date.now();
            } else this.skipHoverStartedAt = null;
            this._aimPointer(this.pointerPosition); this._paint();
        }
        return true;
    }
    onMouseLeave() { this.pointerPosition = null; this.skipHoverStartedAt = null; this._paint(); return true; }
    onMouseUp() { return true; }
    _sound(name) { const sound = Data.Systems && Data.Systems[name]; if (sound && sound.playSound) sound.playSound(); }
    _openCalculator() {
        const manager = IP2Live.HostPowerToolManager;
        if (this.finished || this.calculatorOpen || this.helpOpen || this.tutorialPromptActive || this._dialogueActive() || !['think', 'barriers', 'boss_enter', 'boss'].includes(this.phase) || !manager) return false;
        this.calculatorOpen = true;
        const p = this.problem;
        const opened = manager.launchHostPowerTool({
            targetClass: p.ipClass, requiredHosts: 1, startExponent: this.calculatorExponent,
            align: 'right', showIntro: false, sourceGameplayId: this.gameplayId,
            backgroundScene: this, preserveBackground: true, neutralFeedback: true, lockScenario: true,
            calculationMode: 'blockSize', closeKey: 'C',
            subnetContext: { ipClass: p.ipClass, defaultPrefix: p.defaultPrefix, givenBits: p.givenBits, bitCount: p.givenBits === 'borrowed' ? p.borrowedBits : p.hostBits },
            onBackgroundUpdate: () => { this.update(); return this.finished; },
            onClose: result => {
                const dwell = Math.max(0, Date.now() - this.calculatorOpenedAt);
                this.calculatorElapsedMs += dwell; this.encounterTelemetry.calculatorElapsedMs += dwell;
                this.calculatorOpenedAt = null;
                this.calculatorExponent = result.exponent; this.calculatorOpen = false; this.onGameplayResume(); this._paint();
            },
        });
        if (!opened) this.calculatorOpen = false;
        else { this.calculatorOpenedAt = Date.now(); this.calculatorUses++; this.encounterTelemetry.calculatorUses++; }
        this._paint(); return opened;
    }
    draw3D() { if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear(); }
    drawHUD() {
        this._ensureSessionCompatible();
        const ctx = Common.Platform.ctx; if (!ctx || !ctx.canvas) return;
        const w = ctx.canvas.width, h = ctx.canvas.height, scale = Math.min(w / 1280, h / 720);
        ctx.save(); ctx.fillStyle = '#03040e'; ctx.fillRect(0, 0, w, h);
        ctx.translate((w - 1280 * scale) / 2, (h - 720 * scale) / 2); ctx.scale(scale, scale);
        this._layout(); this._drawConsole(ctx); this._drawDock(ctx); this._drawPickup(ctx); this._drawAddressDrop(ctx);
        if (this.helpOpen) this._drawHelp(ctx);
        for (const button of this.buttonRects) this._button(ctx, button);
        ctx.restore();
        this._drawTutorialFocus(ctx);
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.drawOverlay) IP2Live.DialogueManager.drawOverlay(ctx);
        if (IP2Live.GameplayCompletionPopup && IP2Live.GameplayCompletionPopup.drawFor) IP2Live.GameplayCompletionPopup.drawFor(this, ctx, { tick: this.animTick });
    }
    _tutorialViewport(ctx) {
        const w = ctx.canvas.width, h = ctx.canvas.height, scale = Math.min(w / 1280, h / 720);
        return { w, h, scale, x: (w - 1280 * scale) / 2, y: (h - 720 * scale) / 2 };
    }
    _tutorialFocusRects(dialogue, view) {
        const targets = dialogue.context.gameplayFocus[Number(dialogue.slideIndex) || 0] || [];
        const entry = this.options.reducedMotion ? 0 : Math.max(0, 1 - this.waveAgeMs / 380) * 26;
        const bounds = {
            console: [{ x: 24, y: 54, w: 1232, h: 522 }],
            given: [{ x: 31, y: 609, w: 325, h: 84 }],
            class: [{ x: 31, y: 609, w: 325, h: 25 }],
            bits: [{ x: 31, y: 667, w: 325, h: 25 }],
            answer: [{ x: 962, y: 647, w: 278, h: 28 }],
            formula: [{ x: 391, y: 639, w: 854, h: 43 }],
            operator: [{ x: 584, y: 647, w: 82, h: 28 }],
            blockSize: [{ x: 680, y: 647, w: 174, h: 28 }],
            correction: [{ x: 872, y: 647, w: 44, h: 28 }],
            preparation: [{ x: 450, y: 248, w: 380, h: 81 }],
            skip: [{ x: 618, y: 364, w: 44, h: 44 }],
            calculator: [{ x: 1096, y: 9, w: 97, h: 27 }],
            range: [{ x: 230, y: 328, w: 820, h: 114 }],
            barriers: [0, 1, 2].map(i => ({ x: 78 + i * 400, y: 225 - entry, w: 324, h: 130 })),
            boss: [{ x: 452, y: 190, w: 376, h: 221 }],
            bossHP: [{ x: 410, y: 68, w: 460, h: 34 }],
            hearts: [{ x: 1113, y: 61, w: 120, h: 37 }],
        };
        return targets.flatMap(name => bounds[name] || []).map(r => ({
            x: view.x + r.x * view.scale, y: view.y + r.y * view.scale,
            w: r.w * view.scale, h: r.h * view.scale,
        }));
    }
    _drawTutorialFocus(ctx) {
        const dialogue = IP2Live.DialogueManager && IP2Live.DialogueManager._active;
        if (!this.tutorialWalkthroughActive || !dialogue || !String(dialogue.id || '').startsWith('stage3.subnetblaster.')) return;
        const context = dialogue.context || {};
        if (!context.gameplayFocus) return;
        const targets = context.gameplayFocus[Number(dialogue.slideIndex) || 0] || [];
        const view = this._tutorialViewport(ctx);
        const rects = this._tutorialFocusRects(dialogue, view);
        let panel = { x: 260, y: 150, w: 760 };
        if (targets.includes('console')) panel = { x: 280, y: 210, w: 720 };
        else if (targets.includes('preparation')) panel = { x: 240, y: 435, w: 800 };
        else if (targets.includes('barriers')) panel = { x: 78, y: 365, w: 1124 };
        else if (targets.includes('boss')) panel = { x: 54, y: 210, w: 350 };
        else if (targets.includes('hearts')) panel = { x: 260, y: 185, w: 760 };
        else if (targets.includes('range')) panel = { x: 240, y: 80, w: 800 };
        // DialogueManager uses independent axis scaling; convert from this game's letterboxed canvas.
        const resolution = Common.ScreenResolution || { SCREEN_X: 1280, SCREEN_Y: 720 };
        context.panelBounds = {
            x: (view.x + panel.x * view.scale) * resolution.SCREEN_X / view.w,
            y: (view.y + panel.y * view.scale) * resolution.SCREEN_Y / view.h,
            w: panel.w * view.scale * resolution.SCREEN_X / view.w,
        };
        if (targets.includes('range')) {
            ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);
            this._drawTutorialRange(ctx); ctx.restore();
        }
        if (!rects.length) return;
        const pad = 4 * view.scale;
        ctx.save(); ctx.save();
        for (const r of rects) {
            ctx.beginPath(); ctx.rect(0, 0, view.w, view.h);
            ctx.rect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad); ctx.clip('evenodd');
        }
        ctx.fillStyle = 'rgba(0,4,10,0.68)'; ctx.fillRect(0, 0, view.w, view.h); ctx.restore();
        ctx.strokeStyle = '#ffe38a'; ctx.lineWidth = 1.5 * view.scale;
        for (const r of rects) ctx.strokeRect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad);
        ctx.restore();
    }
    _drawTutorialRange(ctx) {
        this._panel(ctx, 230, 328, 820, 114, '#0a1525', '#36576c');
        this._text(ctx, 'NETWORK', 300, 351, 14, '#9ffff0', 'center');
        this._text(ctx, 'USABLE DEVICE ADDRESSES', 640, 351, 12, '#b7cadb', 'center');
        this._text(ctx, 'BROADCAST', 980, 351, 14, '#ffadd1', 'center');
        ctx.fillStyle = '#224457'; ctx.fillRect(300, 377, 680, 20);
        ctx.fillStyle = '#80e8da'; ctx.fillRect(291, 373, 18, 28);
        ctx.fillStyle = '#ef8db7'; ctx.fillRect(971, 373, 18, 28);
        for (let i = 1; i < 16; i++) { ctx.fillStyle = '#4a6c7d'; ctx.fillRect(300 + i * 42.5, 381, 1, 12); }
        this._text(ctx, 'FIRST ADDRESS', 300, 421, 11, '#a0b8c6', 'center');
        this._text(ctx, 'LAST ADDRESS', 980, 421, 11, '#a0b8c6', 'center');
    }
    _text(ctx, text, x, y, size = 14, color = '#bfd4e5', align = 'left', font = 'Oxanium-Medium, monospace') {
        ctx.font = size + 'px ' + font; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, x, y);
    }
    _fitText(ctx, text, x, y, width, size = 18, color = '#d8f8f7', align = 'left') {
        ctx.font = size + 'px Oxanium-Medium, monospace';
        while (size > 10 && ctx.measureText(text).width > width) { size--; ctx.font = size + 'px Oxanium-Medium, monospace'; }
        this._text(ctx, text, x, y, size, color, align);
    }
    _panel(ctx, x, y, w, h, fill = '#0b1022', stroke = '#283553') {
        ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    }
    _cutPanel(ctx, x, y, w, h, fill, stroke) {
        ctx.beginPath(); ctx.moveTo(x + 12, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 12); ctx.lineTo(x + w - 12, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + 12); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke();
    }
    _button(ctx, b) {
        if (b.action !== 'skip') {
            this._cutPanel(ctx, b.x, b.y, b.w, b.h, '#102336', '#397b88');
            this._text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, 11, '#9bf9eb', 'center'); return;
        }
        const hovered = this.pointerPosition && this._inside(this.pointerPosition.x, this.pointerPosition.y, b);
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ctx.save(); ctx.shadowColor = '#59e2d0'; ctx.shadowBlur = hovered ? 18 : 8;
        const fill = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
        fill.addColorStop(0, hovered ? '#205462' : '#173f4b'); fill.addColorStop(1, '#0b202e');
        ctx.beginPath(); ctx.arc(cx, cy, b.radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
        ctx.strokeStyle = hovered ? '#b4fff1' : '#78e8d7'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.shadowBlur = 0;
        this._polygon(ctx, [[cx-10,cy-7],[cx-1,cy],[cx-10,cy+7]], '#dcfff6');
        this._polygon(ctx, [[cx-1,cy-7],[cx+8,cy],[cx-1,cy+7]], '#dcfff6');
        ctx.fillStyle = '#dcfff6'; ctx.fillRect(cx+9,cy-7,2,14);
        if (hovered && this.skipHoverStartedAt != null) {
            const fade = this.options.reducedMotion ? 1 : Math.min(1, Math.max(0, (Date.now() - this.skipHoverStartedAt) / 180));
            if (fade > 0) {
                ctx.globalAlpha *= fade;
                this._text(ctx, b.tooltip, cx, b.y + b.h + 20, 11, '#c8e4e0', 'center');
            }
        }
        ctx.restore();
    }
    _drawConsole(ctx) {
        this._text(ctx, '06 / SUBNET BLASTER', 24, 23, 18, '#e4faff');
        this._panel(ctx, 16, 46, 1248, 538, '#06091a', '#57618c');
        ctx.save(); ctx.beginPath(); ctx.rect(18, 48, 1244, 534); ctx.clip();
        this._drawBackdrop(ctx);
        if (this.phase !== 'think') this._drawCombatHUD(ctx);
        if (this.phase === 'think') this._drawThinking(ctx);
        else if (this.phase === 'barriers' || this.phase === 'pickup') this._drawBarriers(ctx);
        else if (['boss_enter', 'boss', 'boss_hit', 'boss_retreat', 'counterattack', 'player_hit'].includes(this.phase)) this._drawBossEncounter(ctx);
        else if (this.phase !== 'drop') this._drawReview(ctx);
        if (['barriers', 'pickup', 'boss_enter', 'boss', 'boss_hit', 'counterattack', 'player_hit', 'boss_retreat', 'drop'].includes(this.phase)) this._drawShip(ctx);
        for (const bullet of this.projectiles) {
            const x = bullet.kind === 'boss' ? 640 : 240 + bullet.lane * 400;
            ctx.shadowColor = '#6cffff'; ctx.shadowBlur = 14; ctx.fillStyle = '#adffff'; ctx.fillRect(x - 2, bullet.y, 4, 21); ctx.shadowBlur = 0;
            ctx.fillStyle = '#cc61ff'; ctx.fillRect(x - 1, bullet.y + 21, 2, 9);
        }
        if (this.phase === 'player_hit') { ctx.fillStyle = 'rgba(255,45,94,' + (0.22 * (1 - this.phaseElapsedMs / 700)) + ')'; ctx.fillRect(18, 48, 1244, 534); }
        for (let y = 50; y < 584; y += 4) { ctx.fillStyle = 'rgba(1,2,9,0.065)'; ctx.fillRect(18, y, 1244, 1); }
        ctx.restore();
        this._drawConsoleFrame(ctx);
    }
    _drawConsoleFrame(ctx) {
        const { x, y, w, h } = this.consoleRect;
        ctx.save();
        const edge = ctx.createLinearGradient(0, y, 0, y + h);
        edge.addColorStop(0, '#40556b'); edge.addColorStop(0.45, '#162334'); edge.addColorStop(1, '#324253');
        ctx.strokeStyle = edge; ctx.lineWidth = 6; ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = '#0a1222'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
        ctx.strokeStyle = 'rgba(113,194,197,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
        // Cut metal corner plates, inset fasteners and short luminous rails frame the glass.
        for (const [cx, cy, dx, dy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]) {
            ctx.save(); ctx.translate(cx, cy); ctx.scale(dx, dy);
            this._polygon(ctx, [[-3,-3],[65,-3],[53,5],[24,5],[5,24],[5,49],[-3,61]], '#142638', '#567887');
            this._polygon(ctx, [[1,1],[51,1],[42,5],[21,5],[5,21],[5,39],[1,44]], '#285363');
            ctx.strokeStyle = '#87e9dc'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(8, 34); ctx.lineTo(8, 22); ctx.lineTo(22, 8); ctx.lineTo(46, 8); ctx.stroke();
            ctx.fillStyle = '#07111f'; ctx.beginPath(); ctx.arc(13,13,3.5,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#7e9aa4'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(11,13); ctx.lineTo(15,13); ctx.stroke();
            for (let i = 0; i < 3; i++) { ctx.fillStyle = '#67b5ba'; ctx.fillRect(58 + i * 7, -1, 3, 2); }
            ctx.restore();
        }
        for (const side of [-1, 1]) {
            const cx = side < 0 ? x : x + w;
            this._panel(ctx, cx - 3, y + h / 2 - 34, 6, 68, '#0a1525', '#425363');
            ctx.fillStyle = side < 0 ? '#76c9c7' : '#ba85c6'; ctx.fillRect(cx - 1, y + h / 2 - 19, 2, 38);
            for (let i = 0; i < 4; i++) { ctx.fillStyle = '#556a7a'; ctx.fillRect(cx - 2, y + 74 + i * 7, 4, 2); }
        }
        ctx.restore();
    }
    _drawBackdrop(ctx) {
        const glow = ctx.createRadialGradient(640, 275, 10, 640, 275, 700);
        glow.addColorStop(0, '#25133f'); glow.addColorStop(0.5, '#101c36'); glow.addColorStop(1, '#040713');
        ctx.fillStyle = glow; ctx.fillRect(18, 48, 1244, 534);
        ctx.save(); ctx.filter = 'blur(3px)';
        // A soft distant skyline sits behind the sharper foreground towers.
        for (let i = 0; i < 26; i++) {
            const x = 20 + i * 49, height = 35 + i * 73 % 145;
            ctx.fillStyle = i % 3 ? '#171d3a' : '#23203e'; ctx.fillRect(x, 415 - height, 37, height);
            ctx.fillStyle = 'rgba(94,100,177,0.3)'; ctx.fillRect(x + 8, 420 - height, 2, height - 14);
        }
        ctx.restore();
        for (let i = 0; i < 85; i++) {
            const x = 30 + (i * 151.7) % 1220, y = 125 + (i * 57.9 + this.animTick * (i % 3 + 1) * 0.12) % 310;
            ctx.fillStyle = i % 5 ? '#6880a1' : '#f899f4'; ctx.fillRect(x, y, i % 3 ? 1 : 2, 2);
        }
        for (let i = 0; i < 32; i++) {
            const x = 22 + i * 40, height = 25 + (i * 47) % 100;
            ctx.fillStyle = '#0b1028'; ctx.fillRect(x, 426 - height, 30, height);
            ctx.fillStyle = i % 2 ? '#3d3162' : '#1c4d63';
            for (let y = 434 - height; y < 410; y += 13) ctx.fillRect(x + 7, y, 3, 4);
        }
        const mist = ctx.createLinearGradient(0, 325, 0, 445);
        mist.addColorStop(0, 'rgba(43,48,89,0)'); mist.addColorStop(0.7, 'rgba(72,64,117,0.18)'); mist.addColorStop(1, 'rgba(24,40,68,0)');
        ctx.fillStyle = mist; ctx.fillRect(18, 325, 1244, 120);
        ctx.strokeStyle = '#733461'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, 427); ctx.lineTo(1262, 427); ctx.stroke();
        ctx.strokeStyle = '#26365a';
        for (let i = 0; i < 17; i++) { ctx.beginPath(); ctx.moveTo(640, 395); ctx.lineTo(-250 + i * 112, 584); ctx.stroke(); }
        for (let i = 0; i < 7; i++) { const y = 431 + Math.pow(i / 6, 1.8) * 153; ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(1262, y); ctx.stroke(); }
        // Stable fine grain avoids flicker and keeps text and foreground art crisp.
        for (let i = 0; i < 220; i++) {
            ctx.fillStyle = i % 2 ? 'rgba(179,199,240,0.035)' : 'rgba(0,0,0,0.08)';
            ctx.fillRect(20 + i * 137.3 % 1240, 50 + i * 83.7 % 530, 2, 1);
        }
        const vignette = ctx.createRadialGradient(640, 290, 180, 640, 290, 700);
        vignette.addColorStop(0, 'rgba(2,4,14,0)'); vignette.addColorStop(1, 'rgba(1,3,12,0.75)');
        ctx.fillStyle = vignette; ctx.fillRect(18, 48, 1244, 534);
        if (this.phase === 'think') { ctx.fillStyle = 'rgba(4,8,20,0.35)'; ctx.fillRect(18, 48, 1244, 534); }
        if (['barriers', 'pickup'].includes(this.phase)) {
            ctx.setLineDash([3, 11]); ctx.strokeStyle = '#35576d';
            for (const x of [440, 840]) { ctx.beginPath(); ctx.moveTo(x, 225); ctx.lineTo(x, 565); ctx.stroke(); } ctx.setLineDash([]);
            const x = 240 + this.selectedLane * 400;
            const beam = ctx.createLinearGradient(x, 360, x, 555); beam.addColorStop(0, 'rgba(61,226,242,0)'); beam.addColorStop(1, 'rgba(61,226,242,0.09)');
            ctx.fillStyle = beam; ctx.fillRect(x - 150, 360, 300, 195);
        }
    }
    _drawCombatHUD(ctx) {
        const hit = this.phase === 'boss_hit', age = this.phaseElapsedMs;
        const hp = hit ? this.previousBossHP + (this.bossHP - this.previousBossHP) * Math.min(1, age / 500) : this.bossHP;
        const trail = hit ? this.previousBossHP + (this.bossHP - this.previousBossHP) * Math.max(0, Math.min(1, (age - 220) / 650)) : this.bossHP;
        ctx.save(); ctx.shadowColor = hit ? '#ff426d' : '#ad67e3'; ctx.shadowBlur = hit ? 19 : 9;
        this._cutPanel(ctx, 410, 68, 460, 34, '#141326', hit ? '#ff7494' : '#786091'); ctx.shadowBlur = 0;
        this._cutPanel(ctx, 416, 73, 448, 24, '#060b19', '#30253f');
        for (let segment = 0; segment < 3; segment++) {
            const x = 423 + segment * 146, width = 138;
            ctx.fillStyle = '#1e1a30'; ctx.fillRect(x, 78, width, 14);
            ctx.fillStyle = '#fbc29f'; ctx.fillRect(x, 78, width * Math.max(0, Math.min(1, trail - segment)), 14);
            const paint = ctx.createLinearGradient(x, 78, x, 92);
            paint.addColorStop(0, hit ? '#ffadbd' : '#f9a1e6'); paint.addColorStop(0.4, hit ? '#f34a79' : '#cc5dc4'); paint.addColorStop(1, hit ? '#9b204d' : '#783573');
            ctx.fillStyle = paint; ctx.fillRect(x, 78, width * Math.max(0, Math.min(1, hp - segment)), 14);
            ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, 78, width * Math.max(0, Math.min(1, hp - segment)), 2);
            for (let mark = 1; mark < 8; mark++) { ctx.fillStyle = 'rgba(5,7,18,0.25)'; ctx.fillRect(x + mark * width / 8, 87, 1, 5); }
        }
        ctx.restore();
        for (let i = 0; i < 3; i++) this._text(ctx, i < this.hearts ? '\u2665' : '\u2661', 1132 + i * 39, 80, 29, i < this.hearts ? '#ff709d' : '#4b3d57', 'center', 'sans-serif');
    }
    _drawThinking(ctx) {
        ctx.save(); ctx.globalAlpha = this.options.reducedMotion ? 1 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.animTick * 0.055));
        this._text(ctx, 'PREPARATION PHASE', 640, 271, 22, '#d8fff7', 'center', 'Abnes, "Arial Black", sans-serif'); ctx.restore();
        const seconds = Math.ceil(this.thinkRemainingMs / 1000);
        this._text(ctx, Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'), 640, 313, 18, '#a9bccd', 'center');
    }
    _drawBarriers(ctx) {
        const wave = this.waves[this.waveIndex];
        this._text(ctx, wave.title, 640, 167, 24, '#edf6ff', 'center');
        wave.choices.forEach((choice, i) => {
            if (this.phase === 'pickup' && this.pickup && this.pickup.lane === i) {
                this._drawBarrierShards(ctx, 240 + i * 400, 285);
                return;
            }
            const entry = this.options.reducedMotion ? 0 : Math.max(0, 1 - this.waveAgeMs / 380) * 26;
            const x = 78 + i * 400, y = 225 - entry, active = this.selectedLane === i;
            const glass = ctx.createLinearGradient(x, y, x + 324, y + 130);
            glass.addColorStop(0, active ? '#23445a' : '#252343'); glass.addColorStop(0.45, '#101d32'); glass.addColorStop(1, active ? '#123444' : '#18172d');
            ctx.save(); ctx.shadowColor = active ? '#44dce0' : '#ad56d1'; ctx.shadowBlur = active ? 16 : 7;
            this._cutPanel(ctx, x, y, 324, 130, glass, active ? '#6ceeea' : '#67547e'); ctx.restore();
            this._cutPanel(ctx, x + 7, y + 7, 310, 116, 'rgba(15,28,45,0.25)', active ? '#315d70' : '#383352');
            ctx.fillStyle = active ? '#62e9e2' : '#b859d4'; ctx.fillRect(x, y + 16, 3, 90);
            this._fitText(ctx, choice.label, x + 162, y + 58, 290, wave.key === 'operator' ? 45 : 25, '#e7ffff', 'center');
            this._text(ctx, choice.detail, x + 162, y + 92, 10, '#a0adc9', 'center');
            this._drawBarrierCracks(ctx, x, y, this.barrierHits[i], i);
        });
    }
    _drawBarrierCracks(ctx, x, y, hits, lane) {
        if (!hits) return;
        ctx.save(); ctx.beginPath(); ctx.rect(x + 5, y + 5, 314, 120); ctx.clip();
        ctx.translate(x, y);
        ctx.strokeStyle = 'rgba(177,245,255,' + (0.3 + hits * 0.06) + ')'; ctx.lineWidth = 0.7 + hits / 18;
        ctx.shadowColor = '#65e6ff'; ctx.shadowBlur = 4;
        // Fractures grow outward from the bullet impact; each hit extends the glass damage.
        const reach = 12 + hits * 12;
        for (let ray = 0; ray < 7; ray++) {
            const angle = Math.PI + ray * Math.PI / 6 + Math.sin(lane + ray) * 0.12;
            const length = reach * (0.55 + (ray % 3) * 0.2);
            const dx = Math.cos(angle), dy = Math.sin(angle);
            ctx.beginPath(); ctx.moveTo(162, 124);
            for (let segment = 1; segment <= 4; segment++) {
                const r = length * segment / 4, bend = Math.sin(ray * 7 + segment * 5 + lane) * 7;
                ctx.lineTo(162 + dx * r - dy * bend, 124 + dy * r + dx * bend);
            }
            ctx.stroke();
            if (hits >= 4) {
                const r = length * 0.6, direction = angle + (ray % 2 ? 0.7 : -0.7);
                ctx.beginPath(); ctx.moveTo(162 + dx * r, 124 + dy * r);
                ctx.lineTo(162 + dx * r + Math.cos(direction) * hits * 3, 124 + dy * r + Math.sin(direction) * hits * 3); ctx.stroke();
            }
        }
        if (hits >= 7) {
            ctx.fillStyle = 'rgba(157,228,255,0.08)';
            ctx.beginPath(); ctx.moveTo(162, 124); ctx.lineTo(106, 89); ctx.lineTo(126, 119); ctx.lineTo(203, 106); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
    _drawBarrierShards(ctx, x, y) {
        const t = Math.min(1, this.phaseElapsedMs / 720);
        ctx.save(); ctx.globalAlpha = (1 - t) * 0.85;
        ctx.fillStyle = '#83edf3'; ctx.strokeStyle = '#b6ffff'; ctx.lineWidth = 0.7;
        for (let i = 0; i < 14; i++) {
            const angle = i * 2.399, travel = this.options.reducedMotion ? 20 : 15 + t * (60 + i * 4);
            const sx = x + Math.cos(angle) * travel * 1.6, sy = y + Math.sin(angle) * travel;
            ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 7, sy + 3); ctx.lineTo(sx - 4, sy + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
    }
    _drawShip(ctx) {
        const arena = ['barriers', 'pickup'].includes(this.phase), x = arena ? 240 + this.selectedLane * 400 : 640;
        const hurt = this.phase === 'player_hit';
        const shake = hurt && !this.options.reducedMotion ? Math.sin(this.phaseElapsedMs / 16) * 9 * (1 - this.phaseElapsedMs / 700) : 0;
        ctx.save(); ctx.translate(x + shake, 536);
        const accent = hurt ? '#ff6b91' : '#71ecdf', tick = this.options.reducedMotion ? 0 : this.animTick;
        ctx.fillStyle = 'rgba(0,3,12,0.5)'; ctx.beginPath(); ctx.ellipse(0, 21, 58, 10, 0, 0, Math.PI * 2); ctx.fill();
        for (const side of [-1, 1]) {
            const ex = side * 17, length = 16 + Math.sin(tick * 0.7 + side) * 4;
            const exhaust = ctx.createLinearGradient(ex, 15, ex, 43);
            exhaust.addColorStop(0, '#b6fff5'); exhaust.addColorStop(0.3, '#797aff'); exhaust.addColorStop(1, 'rgba(116,70,255,0)');
            ctx.shadowColor = '#747dff'; ctx.shadowBlur = 13;
            this._polygon(ctx, [[ex - 5, 15], [ex + 5, 15], [ex + 3, 24], [ex, 24 + length], [ex - 3, 24]], exhaust);
        }
        ctx.shadowColor = accent; ctx.shadowBlur = 12;
        this._polygon(ctx, [[0,-39],[9,-22],[14,-6],[29,-16],[27,-1],[49,20],[30,17],[12,14],[0,23],[-12,14],[-30,17],[-49,20],[-27,-1],[-29,-16],[-14,-6],[-9,-22]], '#1e3a50', accent);
        ctx.shadowBlur = 0;
        for (const side of [-1, 1]) {
            const mirror = points => points.map(([px, py]) => [px * side, py]);
            this._polygon(ctx, mirror([[9,-18],[14,-5],[25,5],[12,13],[8,2]]), hurt ? '#ac4f70' : '#567e91', '#8dc6d0');
            this._polygon(ctx, mirror([[14,-5],[27,-1],[44,16],[25,10],[12,13]]), '#29475e', '#58889b');
            this._polygon(ctx, mirror([[27,-1],[49,20],[31,13],[23,1]]), hurt ? '#d57994' : '#7da8b5');
            this._polygon(ctx, mirror([[29,-16],[27,-1],[23,1],[23,-10]]), '#658998', '#b5dfe3');
            this._polygon(ctx, mirror([[12,1],[22,5],[22,19],[12,18]]), '#112338', '#4f8299');
            this._polygon(ctx, mirror([[12,14],[22,14],[20,20],[14,20]]), '#070d24', '#b183ee');
            for (let vent = 0; vent < 3; vent++) {
                ctx.strokeStyle = '#0b2031'; ctx.lineWidth = 1.5; ctx.beginPath();
                ctx.moveTo(side * (24 + vent * 4), 6 + vent * 2); ctx.lineTo(side * (27 + vent * 4), 10 + vent * 2); ctx.stroke();
            }
            ctx.fillStyle = accent; ctx.fillRect(side * 25 - 1, -14, 2, 10);
            ctx.shadowColor = '#f09cff'; ctx.shadowBlur = 6; ctx.fillStyle = '#e5b4ff'; ctx.fillRect(side * 32 - 2, 10, 4, 2); ctx.shadowBlur = 0;
        }
        this._polygon(ctx, [[0,-39],[5,-24],[7,10],[0,20],[-7,10],[-5,-24]], hurt ? '#b06787' : '#86aaba', '#c8e8ec');
        this._polygon(ctx, [[0,-25],[5,-15],[4,-1],[0,4],[-4,-1],[-5,-15]], '#092b41', '#65d8de');
        this._polygon(ctx, [[0,-22],[3,-14],[2,-4],[0,-2]], '#77dbe0');
        this._polygon(ctx, [[-3,7],[3,7],[2,15],[-2,15]], '#203d52');
        ctx.fillStyle = '#dcfff7'; ctx.fillRect(-1, -40, 2, 8);
        ctx.restore();
    }
    _polygon(ctx, points, fill, stroke) {
        ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
    }
    _drawBossEncounter(ctx) {
        const t = this.phaseElapsedMs;
        const entering = this.phase === 'boss_enter', hit = this.phase === 'boss_hit', retreat = this.phase === 'boss_retreat';
        const danger = ['counterattack', 'player_hit'].includes(this.phase);
        const progress = retreat ? Math.min(1, t / 850) : entering ? Math.min(1, t / 850) : 0;
        const y = (entering ? 105 + 190 * progress : retreat ? 295 - 210 * progress : 295) + (hit && !this.options.reducedMotion ? Math.cos(t / 13) * 4 * (1 - t / 950) : 0);
        const size = retreat ? 1.65 * (1 - progress * 0.75) : 1.65;
        const shake = hit && !this.options.reducedMotion ? (Math.sin(t / 11) * 11 + Math.sin(t / 7) * 4) * (1 - t / 950) : 0;
        this._text(ctx, hit ? 'DIRECT HIT / SHIELD BREAK' : danger ? 'INCOMING / COUNTERATTACK' : retreat ? this.bossHP ? 'APEX RETREATING' : 'APEX NEUTRALIZED' : 'WEAPON ASSEMBLED / ENGAGING APEX', 640, 151, 22, danger ? '#ff91af' : '#e9f7ff', 'center');
        ctx.save(); ctx.globalAlpha = retreat ? Math.max(0, 1 - progress) : entering ? progress : 1;
        this._drawBoss(ctx, 640 + shake, y, size, hit, danger);
        if (this.phase === 'boss' && this.bossImpactFlashMs > 0) {
            ctx.strokeStyle = 'rgba(147,255,242,' + this.bossImpactFlashMs / 180 + ')'; ctx.lineWidth = 2;
            ctx.shadowColor = '#87f9ff'; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(640, 347, 12 + (180 - this.bossImpactFlashMs) * 0.15, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        }
        ctx.restore();
        if (!hit && !retreat) this._text(ctx, danger ? 'APEX is charging a return shot...' : 'AUTO FIRE / testing the assembled formula', 640, 443, 12, danger ? '#ff9ab6' : '#a7b3cd', 'center');
        if (danger) this._drawBossAttack(ctx);
    }
    _drawBossAttack(ctx) {
        const impacting = this.phase === 'player_hit', t = this.phaseElapsedMs;
        const charge = impacting ? 1 : Math.min(1, t / 750);
        const motion = this.options.reducedMotion ? 0 : this.animTick;
        ctx.save();
        if (!impacting) {
            const aura = ctx.createRadialGradient(640, 354, 2, 640, 354, 64 * charge + 1);
            aura.addColorStop(0, '#fff2ef'); aura.addColorStop(0.15, '#ff8fa9'); aura.addColorStop(0.4, 'rgba(255,44,104,0.65)'); aura.addColorStop(1, 'rgba(255,30,95,0)');
            ctx.fillStyle = aura; ctx.fillRect(572, 286, 136, 136);
            for (let ring = 0; ring < 3; ring++) {
                ctx.strokeStyle = ring === 1 ? '#ffcfda' : '#f45b99'; ctx.lineWidth = ring === 1 ? 1 : 2;
                const angle = motion * 0.06 * (ring % 2 ? -1 : 1) + ring * 2;
                ctx.beginPath(); ctx.arc(640, 354, 14 + charge * (9 + ring * 10), angle, angle + Math.PI * 1.4); ctx.stroke();
            }
            for (let spark = 0; spark < 12; spark++) {
                const angle = spark * Math.PI / 6 + motion * 0.02, radius = 65 * (1 - charge) + 22;
                ctx.fillStyle = '#ffa6c5'; ctx.fillRect(640 + Math.cos(angle) * radius, 354 + Math.sin(angle) * radius, 2, 2);
            }
        }
        const end = impacting ? 530 : 354 + 180 * Math.min(1, Math.max(0, (t - 750) / 250));
        if (impacting || t > 750) {
            ctx.globalAlpha = impacting ? Math.max(0, 1 - t / 300) : 1;
            ctx.shadowColor = '#ff286e'; ctx.shadowBlur = 22; ctx.lineCap = 'round';
            for (const [width, color] of [[32,'rgba(255,36,111,0.18)'],[16,'#bd245e'],[8,'#ff739c'],[3,'#fff5ed']]) {
                ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(640, 354); ctx.lineTo(640, end); ctx.stroke();
            }
        }
        if (impacting) {
            const fade = Math.max(0, 1 - t / 700), radius = 8 + t * 0.12;
            ctx.globalAlpha = fade; ctx.shadowBlur = 12; ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffc7d9'; ctx.beginPath(); ctx.ellipse(640, 529, radius, radius * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
            for (let i = 0; i < 24; i++) {
                const angle = i * 2.399, distance = this.options.reducedMotion ? 26 : 10 + t * (0.05 + i % 4 * 0.03);
                ctx.fillStyle = i % 3 ? '#ff729d' : '#fff5e9';
                ctx.fillRect(640 + Math.cos(angle) * distance, 528 + Math.sin(angle) * distance, i % 3 ? 2 : 4, 2);
            }
        }
        ctx.restore();
    }
    _drawBoss(ctx, x, y, size, hit, danger) {
        ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
        if (hit && !this.options.reducedMotion) ctx.rotate(Math.sin(this.phaseElapsedMs / 17) * 0.025 * (1 - this.phaseElapsedMs / 950));
        const color = hit ? '#ff355e' : danger ? '#ff597a' : '#cc6beb';
        const tick = this.options.reducedMotion ? 0 : this.animTick;
        const damage = 3 - this.bossHP;
        const opacity = ctx.globalAlpha;
        const aura = ctx.createRadialGradient(0, 0, 12, 0, 0, 140);
        aura.addColorStop(0, hit ? 'rgba(255,42,88,0.5)' : 'rgba(137,59,213,0.25)'); aura.addColorStop(1, 'rgba(44,18,84,0)');
        ctx.fillStyle = aura; ctx.fillRect(-145, -145, 290, 290);
        // Orbiting debris and suspended energy particles belong to the guardian.
        for (let i = 0; i < 42; i++) {
            const angle = i * 2.399 + tick * (i % 2 ? 0.006 : -0.004);
            const radius = 106 + i % 6 * 7 + Math.sin(tick * 0.03 + i) * 5;
            const px = Math.cos(angle) * radius, py = Math.sin(angle) * radius * 0.66;
            ctx.globalAlpha = opacity * (0.25 + (Math.sin(tick * 0.05 + i) + 1) * 0.3);
            ctx.fillStyle = hit || danger ? '#ff7f9d' : i % 3 ? '#be8cff' : '#75ffed';
            ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = i % 4 ? 0 : 9;
            ctx.fillRect(px, py, i % 4 ? 1.4 : 3, i % 4 ? 1.4 : 3);
        }
        ctx.globalAlpha = opacity; ctx.shadowBlur = 0;
        ctx.strokeStyle = hit ? '#ff647f' : '#514773'; ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.arc(0, 0, 111, side < 0 ? 2.5 : -0.65, side < 0 ? 3.8 : 0.65); ctx.stroke();
            const drift = Math.sin(tick * 0.04) * 3;
            if (damage < 2 || side > 0) {
                this._cutPanel(ctx, side < 0 ? -132 : 104, -27 + drift, 28, 58, '#1c2543', color);
                ctx.fillStyle = hit ? '#ffb9c5' : '#70f4ed'; ctx.fillRect(side < 0 ? -126 : 110, -15 + drift, 3, 26);
            }
        }
        ctx.shadowColor = color; ctx.shadowBlur = hit ? 35 : 17;
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-100, -25); ctx.lineTo(-62, -66); ctx.lineTo(-48, -33); ctx.lineTo(-25, -47); ctx.lineTo(25, -47); ctx.lineTo(48, -33); ctx.lineTo(62, -66); ctx.lineTo(100, -25); ctx.lineTo(78, 29); ctx.lineTo(45, 26); ctx.lineTo(24, 57); ctx.lineTo(-24, 57); ctx.lineTo(-45, 26); ctx.lineTo(-78, 29); ctx.closePath();
        const armor = ctx.createLinearGradient(-80, -65, 70, 65);
        armor.addColorStop(0, hit ? '#d84266' : '#675183'); armor.addColorStop(0.4, hit ? '#8b1e41' : '#252943'); armor.addColorStop(1, hit ? '#421329' : '#14172c');
        ctx.fillStyle = armor; ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = hit ? '#ffb2c3' : '#7b548b';
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 25, -47); ctx.lineTo(side * 48, 6); ctx.lineTo(side * 24, 57); ctx.stroke();
            ctx.fillStyle = hit ? '#c44462' : '#34304f';
            ctx.beginPath(); ctx.moveTo(side * 57, -34); ctx.lineTo(side * 87, -21); ctx.lineTo(side * 70, 16); ctx.lineTo(side * 51, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = hit ? '#ff95ad' : '#b276cc';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath(); ctx.moveTo(side * (61 + i * 3), -17 + i * 8); ctx.lineTo(side * (77 - i * 2), -13 + i * 8); ctx.stroke();
            }
            ctx.strokeStyle = hit ? '#ffb2c3' : '#7b548b';
        }
        ctx.fillStyle = '#11162c'; ctx.beginPath(); ctx.moveTo(-25, -33); ctx.lineTo(0, -43); ctx.lineTo(25, -33); ctx.lineTo(19, 16); ctx.lineTo(0, 28); ctx.lineTo(-19, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, -17); ctx.stroke();
        ctx.shadowColor = hit || danger ? '#ff6088' : '#6df3f1'; ctx.shadowBlur = 13;
        ctx.fillStyle = hit ? '#ffcfda' : danger ? '#ff719a' : '#6df3f1'; ctx.fillRect(-45, -11, 29, 9); ctx.fillRect(16, -11, 29, 9);
        ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(-19, 25); ctx.lineTo(0, 13); ctx.lineTo(19, 25); ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 37, 11, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = hit ? '#fff0f3' : danger ? '#ff90ae' : '#b4fff5'; ctx.beginPath(); ctx.arc(0, 37, 5 + Math.sin(tick * 0.09), 0, Math.PI * 2); ctx.fill();
        if (damage) this._drawBossWear(ctx, damage, hit);
        ctx.restore();
    }
    _drawBossWear(ctx, damage, hit) {
        ctx.save(); ctx.shadowBlur = 0;
        for (let scar = 0; scar < damage * 5; scar++) {
            const x = -70 + scar * 37 % 135, y = -27 + scar * 29 % 64;
            this._polygon(ctx, [[x-4,y-7],[x+9,y-3],[x+4,y+8],[x-7,y+3]], '#0b1021', '#704154');
            ctx.strokeStyle = '#d58481'; ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(x-8,y-11); ctx.lineTo(x-2,y-4); ctx.lineTo(x-4,y+1); ctx.lineTo(x+5,y+12); ctx.stroke();
        }
        // Broken edge pixels persist into later encounters as the armor wears down.
        for (let chip = 0; chip < damage * 9; chip++) {
            const side = chip % 2 ? 1 : -1, x = side * (72 + chip * 7 % 18), y = -28 + chip * 11 % 54;
            ctx.fillStyle = '#080e20'; ctx.fillRect(x, y, 4 + chip % 4, 4 + chip % 3);
            ctx.fillStyle = '#b76e83'; ctx.fillRect(x, y + 4 + chip % 3, 3, 1);
        }
        if (damage >= 2) {
            this._polygon(ctx, [[-65,-64],[-57,-48],[-64,-39],[-76,-38],[-70,-50]], '#080e20');
            this._polygon(ctx, [[41,27],[30,36],[28,51],[24,57],[24,39],[34,29]], '#080e20');
        }
        if (hit) {
            const t = Math.min(1, this.phaseElapsedMs / 950), opacity = ctx.globalAlpha;
            ctx.globalAlpha = opacity * (1 - t);
            for (let particle = 0; particle < 36; particle++) {
                const angle = particle * 2.399, radius = this.options.reducedMotion ? 85 : 45 + t * (55 + particle % 6 * 15);
                const px = Math.cos(angle) * radius, py = Math.sin(angle) * radius * 0.65 + (this.options.reducedMotion ? 0 : t * t * 25);
                ctx.fillStyle = particle % 3 ? '#d36490' : '#ffe6f0';
                const width = 2 + particle % 4; ctx.fillRect(px, py, width, width);
                if (!this.options.reducedMotion) { ctx.fillStyle = 'rgba(255,121,157,0.2)'; ctx.fillRect(px - Math.cos(angle) * 7, py - Math.sin(angle) * 7, width, width); }
            }
        }
        ctx.restore();
    }
    _drawReview(ctx) {
        const passed = this.encounterResult && this.encounterResult.passed;
        if (passed) {
            this._text(ctx, 'SECTOR SECURED / APEX DEFEATED', 640, 189, 27, '#cbfff1', 'center');
        } else {
            this._text(ctx, 'HULL DEPLETED', 640, 295, 27, '#ff9fba', 'center');
        }
    }
    _dockValues(problem = this.problem) {
        const p = problem, weapon = this.weapon || {};
        return {
            classValue: p.ipClass + '  /  default /' + p.defaultPrefix,
            addressLabel: p.asked === 'broadcast' ? 'Network' : 'Broadcast', addressValue: p.givenAddress,
            bitsLabel: p.givenBits === 'borrowed' ? 'Borrowed bits' : 'Host bits',
            bitsValue: String(p.givenBits === 'borrowed' ? p.borrowedBits : p.hostBits), formulaGiven: p.givenAddress,
            operator: weapon.operator === undefined ? '?' : String(weapon.operator),
            blockSize: weapon.blockSize === undefined ? 'BLOCK ?' : Number(weapon.blockSize).toLocaleString('en-US'),
            correction: p.correction,
            answer: this.addressDrop && this.addressDrop.installed ? p.answerAddress : p.asked.toUpperCase() + ' ?',
        };
    }
    _dockTypingDurationMs() {
        const t = this.constructor.DOCK_TYPING;
        return t.erase + (t.fields.length - 1) * t.stagger + t.type;
    }
    _dockTypingActive() {
        return !!(this.dockTyping && !this.options.reducedMotion && this.dockTyping.elapsedMs < this._dockTypingDurationMs());
    }
    _finishDockTyping() { if (this.dockTyping) this.dockTyping.elapsedMs = this._dockTypingDurationMs(); }
    _dockText(key, text) {
        if (!this._dockTypingActive() || this.phase !== 'think') return text;
        const t = this.constructor.DOCK_TYPING, age = this.dockTyping.elapsedMs;
        if (age < t.erase) {
            const previous = this.dockTyping.previous[key] || '';
            return previous.slice(0, Math.ceil(previous.length * (1 - age / t.erase)));
        }
        const progress = Math.max(0, Math.min(1, (age - t.erase - t.fields.indexOf(key) * t.stagger) / t.type));
        const partial = text.slice(0, Math.floor(text.length * progress));
        return progress > 0 && progress < 1 && Math.floor(age / 150) % 2 === 0 ? partial + '\u258f' : partial;
    }
    _drawDock(ctx) {
        const fields = this._dockValues();
        ctx.save(); ctx.shadowColor = '#020610'; ctx.shadowBlur = 12;
        const glass = ctx.createLinearGradient(0, 596, 0, 704);
        glass.addColorStop(0, '#26303f'); glass.addColorStop(0.14, '#121c2d'); glass.addColorStop(1, '#090e1c');
        this._panel(ctx, 16, 596, 1248, 108, glass, '#617281'); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#030811'; ctx.lineWidth = 3; ctx.strokeRect(20, 600, 1240, 100);
        ctx.save(); ctx.beginPath(); ctx.rect(23, 603, 1234, 94); ctx.clip();
        this._polygon(ctx, [[374,603],[1248,603],[1230,630],[390,630]], 'rgba(103,144,162,0.08)');
        ctx.strokeStyle = 'rgba(159,188,202,0.035)'; ctx.lineWidth = 10;
        for (let i = 0; i < 26; i++) {
            const x = 340 + i * 39; ctx.beginPath(); ctx.moveTo(x,603); ctx.lineTo(x-70,697); ctx.stroke();
        }
        // Halftone ink, slash marks and paper-bright edge cuts give the rectangular chassis character.
        ctx.fillStyle = 'rgba(189,211,221,0.065)';
        for (let row = 0; row < 4; row++) for (let col = 0; col < 28; col++) {
            ctx.beginPath(); ctx.arc(35 + col * 9 + row % 2 * 4, 606 + row * 5, 0.75, 0, Math.PI * 2); ctx.fill();
        }
        this._polygon(ctx, [[1159,603],[1176,603],[1168,615],[1151,615]], '#e5e6df');
        this._polygon(ctx, [[1181,603],[1193,603],[1185,615],[1173,615]], '#e5e6df');
        this._polygon(ctx, [[1198,603],[1207,603],[1199,615],[1190,615]], '#e98cab');
        ctx.fillStyle = '#99b9bf'; ctx.fillRect(392, 695, 807, 1);
        ctx.strokeStyle = '#495c6b'; ctx.lineWidth = 1;
        for (let i = 0; i < 60; i++) { const x = 398 + i * 14; ctx.beginPath(); ctx.moveTo(x,697); ctx.lineTo(x+3,693); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = '#c9dfd9'; ctx.fillRect(24, 618, 3, 66);
        ctx.fillStyle = '#e790ac'; ctx.fillRect(24, 618, 3, 16);
        ctx.fillStyle = '#030914'; ctx.fillRect(368, 608, 4, 84);
        ctx.fillStyle = '#425567'; ctx.fillRect(372, 608, 1, 84);
        ctx.fillStyle = 'rgba(199,215,220,0.2)'; ctx.fillRect(24, 601, 1228, 1);
        const rows = [622, 651, 680];
        const values = ['classValue', 'addressValue', 'bitsValue'].map(key => this._dockText(key, fields[key]));
        const labels = ['Class', this._dockText('addressLabel', fields.addressLabel), this._dockText('bitsLabel', fields.bitsLabel)];
        labels.forEach((label, i) => {
            this._text(ctx, label, 36, rows[i], 11, '#839ab5');
            this._fitText(ctx, values[i], 155, rows[i], 193, i === 2 ? 17 : 14, i === 2 ? '#d9a3fc' : '#d6f3f1');
        });
        this._text(ctx, 'FORMULA / WEAPON ASSEMBLY', 398, 620, 10, '#b5d1d3');
        const token = (key, x, width) => {
            const loaded = this.weapon[key] !== undefined;
            this._drawRecessedScreen(ctx, x, 647, width, 28,
                this._dockText(key, fields[key]), loaded);
        };
        this._fitText(ctx, this._dockText('formulaGiven', fields.formulaGiven), 398, 661, 170, 17, '#e3f4ee');
        token('operator', 584, 82); token('blockSize', 680, 174);
        this._text(ctx, this._dockText('correction', fields.correction), 878, 661, 17, '#d4b6dc'); this._text(ctx, '=', 935, 661, 17, '#d3e2df');
        this._drawRecessedScreen(ctx, 962, 647, 278, 28,
            this._dockText('answer', fields.answer), !!(this.addressDrop && this.addressDrop.installed));
        ctx.restore();
    }
    _drawRecessedScreen(ctx, x, y, w, h, text, loaded) {
        ctx.save();
        const bezel = ctx.createLinearGradient(0,y,0,y+h);
        bezel.addColorStop(0,'#080d17'); bezel.addColorStop(0.55,'#1a2635'); bezel.addColorStop(1,'#536371');
        ctx.fillStyle = bezel; ctx.fillRect(x,y,w,h);
        ctx.strokeStyle = '#4b5866'; ctx.lineWidth = 1; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
        ctx.fillStyle = '#03070e'; ctx.fillRect(x+1,y+1,w-2,h-2);
        const sx = x+4, sy = y+3, sw = w-8, sh = h-6;
        const lcd = ctx.createLinearGradient(0,sy,0,sy+sh);
        lcd.addColorStop(0,loaded ? '#0d292c' : '#0b171f'); lcd.addColorStop(1,loaded ? '#183a3a' : '#142830');
        ctx.fillStyle = lcd; ctx.fillRect(sx,sy,sw,sh);
        ctx.save(); ctx.beginPath(); ctx.rect(sx,sy,sw,sh); ctx.clip();
        for (let line = 0; line < sh; line += 3) { ctx.fillStyle = 'rgba(170,216,207,0.035)'; ctx.fillRect(sx,sy+line,sw,1); }
        this._polygon(ctx, [[sx+sw*0.55,sy],[sx+sw*0.8,sy],[sx+sw*0.45,sy+sh],[sx+sw*0.2,sy+sh]], 'rgba(205,238,223,0.025)');
        // The dark inner lip and lower reflection make the display sit inside the housing.
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx,sy,sw,2); ctx.fillRect(sx,sy,1,sh);
        ctx.fillStyle = 'rgba(181,220,211,0.12)'; ctx.fillRect(sx,sy+sh-1,sw,1);
        ctx.shadowColor = loaded ? '#9cf3d6' : '#8fbcb7'; ctx.shadowBlur = loaded ? 5 : 2;
        this._fitText(ctx, text, x+w/2, y+h/2, sw-12, 17, loaded ? '#c6ffdf' : '#96b4b5', 'center');
        ctx.restore(); ctx.restore();
    }
    _drawPickup(ctx) {
        if (this.phase !== 'pickup' || !this.pickup) return;
        const item = this.pickup, target = this.formulaTargets[item.key];
        const t = Math.min(1, this.phaseElapsedMs / 720), ease = 1 - Math.pow(1 - t, 3);
        const x = item.x + (target.x - item.x) * ease, y = item.y + (target.y - item.y) * ease - (this.options.reducedMotion ? 0 : Math.sin(t * Math.PI) * 85);
        const w = 210 * (1 - t) + 70 * t;
        ctx.save(); ctx.shadowColor = '#6af6e6'; ctx.shadowBlur = 20;
        this._cutPanel(ctx, x - w / 2, y - 18, w, 36, '#123344', '#9affed'); ctx.shadowBlur = 0;
        this._fitText(ctx, t < 0.65 ? item.label : String(item.value), x, y, w - 12, 18, '#cffff3', 'center'); ctx.restore();
    }
    _addressArrivalMs() {
        const t = this.constructor.ADDRESS_DROP;
        return t.release + t.fall + t.hold + t.transfer;
    }
    _addressDropPose() {
        if (!this.addressDrop || this.addressDrop.installed) return null;
        const age = this.addressDrop.elapsedMs, t = this.constructor.ADDRESS_DROP;
        if (age < t.release) return null;
        const fall = Math.min(1, (age - t.release) / t.fall);
        const transfer = Math.max(0, Math.min(1, (age - t.release - t.fall - t.hold) / t.transfer));
        if (this.options.reducedMotion) return { x: 640, y: 385, size: 34, alpha: 1, transfer: 0, stage: 'hold' };
        if (fall < 1) {
            const ease = 1 - Math.pow(1 - fall, 3);
            return { x: 640, y: 305 + ease * 80 - Math.sin(fall * Math.PI) * 18,
                size: 18 + 16 * ease, alpha: Math.min(1, fall * 4), transfer: 0, stage: 'fall' };
        }
        if (transfer <= 0) return { x: 640, y: 385 + Math.sin((age - t.release - t.fall) / 270) * 3,
            size: 34, alpha: 1, transfer: 0, stage: 'hold' };
        const ease = transfer < 0.5 ? 2 * transfer * transfer : 1 - Math.pow(-2 * transfer + 2, 2) / 2;
        const position = this._addressTransferPoint(ease);
        return { ...position, size: 34 - 17 * ease, alpha: 1, transfer: ease, stage: 'transfer' };
    }
    _addressTransferPoint(t) {
        const target = this.formulaTargets && this.formulaTargets.answer || { x: 1101, y: 661 };
        const u = 1 - t;
        return { x: u*u*u*640 + 3*u*u*t*780 + 3*u*t*t*1080 + t*t*t*target.x,
            y: u*u*u*385 + 3*u*u*t*370 + 3*u*t*t*545 + t*t*t*target.y };
    }
    _drawAddressDrop(ctx) {
        if (!this.addressDrop) return;
        const pose = this._addressDropPose();
        if (!pose) {
            const sinceArrival = this.addressDrop.elapsedMs - this._addressArrivalMs();
            if (this.addressDrop.installed && sinceArrival < this.constructor.ADDRESS_DROP.settle && !this.options.reducedMotion) {
                ctx.save(); ctx.globalAlpha = Math.max(0, 1 - sinceArrival / this.constructor.ADDRESS_DROP.settle);
                ctx.shadowColor = '#9affdf'; ctx.shadowBlur = 20; ctx.strokeStyle = '#baffed'; ctx.lineWidth = 1.5;
                ctx.strokeRect(963, 648, 276, 26); ctx.restore();
            }
            return;
        }
        ctx.save(); ctx.globalAlpha = pose.alpha;
        const radius = 120 * pose.size / 34;
        const aura = ctx.createRadialGradient(pose.x, pose.y, 1, pose.x, pose.y, radius);
        aura.addColorStop(0, 'rgba(86,255,211,0.15)'); aura.addColorStop(1, 'rgba(86,255,211,0)');
        ctx.fillStyle = aura; ctx.fillRect(pose.x-radius, pose.y-radius, radius*2, radius*2);
        if (!this.options.reducedMotion) {
            if (pose.stage === 'transfer') {
                for (let i = 1; i <= 8; i++) {
                    const p = this._addressTransferPoint(Math.max(0, pose.transfer - i * 0.018));
                    ctx.fillStyle = 'rgba(131,255,226,' + (0.3 * (1 - i/9)) + ')';
                    ctx.fillRect(p.x - 2, p.y - 2, 3, 3);
                }
            }
            for (let i = 0; i < 16; i++) {
                const angle = i * 2.399 + this.addressDrop.elapsedMs / 1400;
                const spread = (0.5 + i % 4 * 0.13) * pose.size / 34;
                const x = pose.x + Math.cos(angle) * 175 * spread, y = pose.y + Math.sin(angle) * 45 * spread;
                ctx.fillStyle = i % 3 ? '#74ddc8' : '#e0fff1';
                ctx.globalAlpha = pose.alpha * (0.25 + i % 4 * 0.12); ctx.fillRect(x, y, i % 3 + 1, i % 3 + 1);
            }
        }
        ctx.globalAlpha = pose.alpha; ctx.shadowColor = '#73ffd9'; ctx.shadowBlur = 17 * pose.size / 34;
        this._text(ctx, this.problem.answerAddress, pose.x, pose.y, pose.size, '#b3ffed', 'center');
        ctx.shadowBlur = 0;
        if (pose.stage === 'hold') this._text(ctx, this.problem.asked.toUpperCase() + ' ADDRESS', pose.x, pose.y + 32, 11, '#9bbfbf', 'center');
        ctx.restore();
    }
    _drawHelp(ctx) {
        ctx.fillStyle = 'rgba(2,3,14,0.94)'; ctx.fillRect(0, 0, 1280, 720);
        this._panel(ctx, 235, 104, 810, 508, '#0e132b', '#72cfcf');
        this._text(ctx, 'PILOT BRIEFING / SUBNET BLASTER', 275, 144, 23, '#e0fff7');
        const lines = [
            'Default host bits: A = 24, B = 16, C = 8.',
            'h = default host bits - borrowed bits. If h is given, use it directly.',
            'Block = 2^h: the familiar host-capacity step, counting ALL addresses.',
            'Keep network + broadcast. Do not subtract 2; that counts usable hosts.',
            'Broadcast = network + block - 1. Network = broadcast - block + 1.',
            'Choose operator, then block size. The -1 or +1 is already in the bar.',
            'Prepare for one minute, or Skip / Enter. C opens the calculator.',
            'Aim: A/D, arrows, 1/2/3 or mouse. Auto-fire: 10 hits per barrier.',
            'Five boss hits: correct drops the answer; wrong costs a heart. APEX retreats.',
            'Win three times before losing three hearts. Escape closes this briefing.',
        ];
        lines.forEach((line, i) => this._fitText(ctx, line, 275, 191 + i * 34, 730, 13,
            i === 2 || i === 4 ? '#ddc397' : '#b9c7df'));
    }
}

IP2Live.SubnetBlasterRules = IP2LiveSubnetBlasterRules;
IP2Live.SubnetBlasterGameplayScreen = IP2LiveCIDRQuarantineMatrixConnectorScreen;

const CIDRQuarantineMatrixGameplayManager = {
    VERSION: 'subnet-blaster-manager-20261011-01',
    _active: false,
    _activeAttempt: null,
    _introShown: false,
    _registeredQuestIds: {},
    _triggerLocks: {},
    _recoveryLoops: {},
    RECOVERY_LIMIT: 3,

    CIDR_MATRIX_QUESTS: [
        { id: 'stage.13.mixed.05.cidr_matrix.tutorial', objectiveId: 'solve_cidr_matrix_13_05', title: 'CALIBRATE SUBNET BLASTER', label: 'Subnet Blaster Node 05', mapId: 13, sequence: 5, tutorial: true, targetTile: { x: 18, y: 0, z: 1 }, profile: { index: 1 } },
    ],

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_cidr_quarantine_matrix');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return this.CIDR_MATRIX_QUESTS;
    },

    _defaultQuestSpec(mapId) {
        const specs = this._questSpecs();
        const requestedMapId = Number(mapId);
        if (requestedMapId) {
            const sameMap = specs.filter((spec) => Number(spec.mapId || 13) === requestedMapId);
            return sameMap.find((spec) => !!spec.tutorial) || sameMap[0] || specs[0] || this.CIDR_MATRIX_QUESTS[0];
        }
        return specs.find((spec) => !!spec.tutorial) || specs[0] || this.CIDR_MATRIX_QUESTS[0];
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        const stageId = Number(stage && stage.id);
        if (!qm || !stageId) return [];
        const questIds = [];
        const specs = this._questSpecs().filter((spec) => Number(spec.mapId || 13) === stageId);
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
                    isComplete: (context, activeQuestManager) => CIDRQuarantineMatrixGameplayManager._handleObjective(spec, context, activeQuestManager),
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
        const launchOptions = { spec, questId: spec.id, objectiveId: spec.objectiveId, mapId: Number(spec.mapId) || 13, _fromObjective: true };
        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_cidr_quarantine_matrix', Object.assign({}, launchOptions, { showIntro: !!spec.tutorial && !this._introShown, _reservedAttempt: attemptKey }));
            return false;
        }
        this.launchCIDRQuarantineMatrixGameplay(Object.assign({}, launchOptions, { showIntro: !!spec.tutorial && !this._introShown }));
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

    launchCIDRQuarantineMatrixGameplay(options) {
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
        const problem = opts.problem || null;
        const open = () => {
            const screen = new IP2LiveCIDRQuarantineMatrixConnectorScreen({
                spec: opts.spec,
                questId: opts.questId,
                objectiveId: opts.objectiveId,
                mapId: opts.mapId || (opts.spec && opts.spec.mapId) || 13,
                maxAttempts: 3,
                problem,
                tutorialMode: !!(opts.tutorialMode || (opts.spec && opts.spec.tutorial)),
                developerTest: !!(opts.developerTest || (opts.spec && opts.spec.developerTest)),
                reducedMotion: !!opts.reducedMotion,
                onComplete: (result) => this._onComplete(opts, result),
                onFailed: (result) => this._onFailed(opts, result),
                onCancel: () => this._onCancel(opts),
            });
            const openGameplay = () => {
                this._playMusicZone('GAMEPLAY_56');
                if (opts.tutorialReplay) IP2Live.GameManager.prepareTutorialReplayScreen(screen, opts);
                const stack = Manager && Manager.Stack ? Manager.Stack : null;
                if (stack) {
                    if (opts.mode === 'push' && typeof stack.push === 'function') stack.push(screen);
                    else if (typeof stack.replace === 'function') stack.replace(screen);
                    else if (typeof stack.push === 'function') stack.push(screen);
                }
                const shouldTeach = !opts.practiceGameplay && !opts._ip2liveResumeGameplay &&
                    (opts.tutorialReplay || (screen.tutorialMode && opts.showIntro !== false && !this._introShown));
                if (shouldTeach && typeof screen.startTutorialWalkthrough === 'function') {
                    const started = screen.startTutorialWalkthrough();
                    if (started !== false) this._introShown = true;
                }
            };
            if (opts.useLoading === true && this._showLoadingScreen2({ mode: 'push', status: 'Loading Gameplay', detail: 'Opening Subnet Blaster', onComplete: openGameplay })) return;
            openGameplay();
        };
        const openSafely = () => {
            try { open(); } catch (e) {
                this._active = false; this._activeAttempt = null; console.warn('[IP2Live] CIDRQuarantineMatrixGameplayManager failed to open gameplay:', e);
                if (opts.tutorialReplay && IP2Live.GameManager) IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine_matrix', opts, 'unavailable');
            }
        };
        openSafely();
        return true;
    },

    _freshProblem() {
        return IP2LiveSubnetBlasterRules.generate();
    },

    _onComplete(options, result) {
        if (IP2Live.GameManager && IP2Live.GameManager.finishTutorialReplay && IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine_matrix', options, 'completed', result)) return true;
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec(opts.mapId);
        const mapId = Number(opts.mapId || spec.mapId) || 13;
        this._active = false;
        this._activeAttempt = null;
        if (spec && spec.objectiveId) delete this._triggerLocks[spec.objectiveId];
        this._recoveryLoops[spec.id] = 0;
        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            // Always advance the quest so the next objective marker appears on the map.
            if (!(opts.developerTest || spec.developerTest) && opts.questId && opts.objectiveId && IP2Live.QuestManager) {
                const qm = IP2Live.QuestManager;
                // If the quest is not yet active (e.g. first time after tutorial launch), start it first.
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
                IP2Live.GameManager.handleGameplayCompleted('ip_cidr_quarantine_matrix', { gameplayId: 'ip_cidr_quarantine_matrix', spec, developerTest: !!opts.developerTest, questId: opts.questId, objectiveId: opts.objectiveId, mapId, result });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        finalizeExit();
    },

    _onFailed(options, result) {
        if (IP2Live.GameManager && IP2Live.GameManager.finishTutorialReplay && IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine_matrix', options, 'failed', result)) return true;
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec(opts.mapId);
        const mapId = Number(opts.mapId || spec.mapId) || 13;
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_cidr_quarantine_matrix', { gameplayId: 'ip_cidr_quarantine_matrix', spec, developerTest: !!opts.developerTest, questId: opts.questId, objectiveId: opts.objectiveId, mapId, result, skipDiagnosticScreen: true });
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };
        finalizeExit();
    },

    recoverAfterFailure(spec) {
        const failed = spec || this._defaultQuestSpec();
        const key = failed && failed.id ? failed.id : 'unknown';
        this._recoveryLoops[key] = (this._recoveryLoops[key] || 0) + 1;
        if (this._recoveryLoops[key] > this.RECOVERY_LIMIT) {
            this._rollbackToPreviousLevel();
            return true;
        }
        this._recoverToTutorial(failed);
        return true;
    },

    _recoverToTutorial(failedSpec) {
        const qm = IP2Live.QuestManager;
        const failedMapId = Number(failedSpec && failedSpec.mapId) || 13;
        const tutorial = this._defaultQuestSpec(failedMapId);
        this._introShown = false;
        if (qm && tutorial) {
            qm.completedObjectives[tutorial.id] = {};
            if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
            qm.startQuest(tutorial.id, { mapId: failedMapId, mapQuestMode: true, keepLastCompletion: true, visible: true, preview: false, guideActive: true, allowCompletion: true });
        }
        if (IP2Live.IPCIDRQuarantineMatrixTutorial && typeof IP2Live.IPCIDRQuarantineMatrixTutorial.showRecovery === 'function') {
            setTimeout(() => IP2Live.IPCIDRQuarantineMatrixTutorial.showRecovery({ failedLabel: failedSpec && failedSpec.label }), 220);
        }
    },

    _rollbackToPreviousLevel() {
        const goBack = () => {
            if (IP2Live.MapManager && typeof IP2Live.MapManager.goTo === 'function') {
                IP2Live.MapManager.goTo(12, { status: 'Loading Previous Level', detail: 'Stage 3 Level 2' });
            }
        };
        if (IP2Live.IPCIDRQuarantineMatrixTutorial && typeof IP2Live.IPCIDRQuarantineMatrixTutorial.showRollback === 'function') {
            setTimeout(() => IP2Live.IPCIDRQuarantineMatrixTutorial.showRollback(goBack), 220);
        } else {
            goBack();
        }
    },

    _onCancel(options) {
        if (IP2Live.GameManager && IP2Live.GameManager.finishTutorialReplay && IP2Live.GameManager.finishTutorialReplay('ip_cidr_quarantine_matrix', options, 'cancelled', null)) return true;
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec(opts.mapId);
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        this._restoreStageMusic();
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
            IP2Live.GameManager.handleGameplayCancelled('ip_cidr_quarantine_matrix', {
                gameplayId: 'ip_cidr_quarantine_matrix',
                spec,
                developerTest: !!opts.developerTest,
                questId: opts.questId || spec.id,
                objectiveId: opts.objectiveId || spec.objectiveId,
                mapId: opts.mapId || spec.mapId || 13,
                result: { cancelled: true },
            });
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },
};

IP2Live.CIDRQuarantineMatrixGameplayManager = CIDRQuarantineMatrixGameplayManager;
IP2Live.CIDRQuarantineMatrixGameplayScreen = IP2LiveCIDRQuarantineMatrixConnectorScreen;
window.IP2LiveCIDRQuarantineMatrixGameplayManager = CIDRQuarantineMatrixGameplayManager;
window.IP2LiveCIDRQuarantineMatrixGameplayScreen = IP2LiveCIDRQuarantineMatrixConnectorScreen;
window.startCIDRQuarantineMatrixGameplaySix = function (options) {
    return CIDRQuarantineMatrixGameplayManager.launchCIDRQuarantineMatrixGameplay(options || {});
};

console.log('[IP2Live] ip_cidr_quarantine_matrix_gameplay.js module loaded.');
