/**
 * IP2Live - Patch Panel Classifier Gameplay
 *
 * Gameplay Two:
 * - 15 packets per round
 * - Secure at least 10 correct classifications
 * - End regular rounds immediately when the target score is reached
 * - Auto-restart round if score is below target at delivery end
 *
 * Loaded from gameplay/gameplay2/IPPatchPanel by code.js.
 */

class IP2LivePatchPanelGameplayScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this._ensureCoreState();
        this._buildPacketPools();
        this._configure();
    }

    initialize() {
        this.options = this.options || {};
        this._ensureCoreState();
        if (!Array.isArray(this.ipPool) || !Array.isArray(this.maskPool)) {
            this._buildPacketPools();
        }
        this._configure();
    }

    _ensureCoreState() {
        if (!Array.isArray(this.classOrder) || this.classOrder.length !== 5) {
            this.classOrder = ['A', 'B', 'C', 'D', 'E'];
        }
        this.classColors = Object.assign({
            A: '#FFE600',
            B: '#296CFF',
            C: '#00D9C7',
            D: '#FF315F',
            E: '#E347FF',
        }, this.classColors || {});
        if (!this.keyFlash || typeof this.keyFlash !== 'object') this.keyFlash = {};
    }

    _configure() {
        this._ensureCoreState();
        this.totalPackets = Math.max(1, Number(this.options.totalPackets) || 15);
        this.targetScore = Math.min(this.totalPackets, Math.max(1, Number(this.options.targetScore) || 10));
        this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 2);
        this.speedMultiplier = Math.max(0.2, Number(this.options.speedMultiplier) || 0.88);
        this.baseSpeed = Math.max(0.45, Number(this.options.baseSpeed) || 1.9);
        this.guidedTutorial = !!this.options.guidedTutorial;
        this.tutorialActive = this.guidedTutorial;
        this.tutorialStep = this.guidedTutorial ? 'wait_packet' : 'done';
        this.tutorialPaused = false;
        this.tutorialHighlight = null;
        this.tutorialDialogueOpen = false;
        this.tutorialComplete = !this.guidedTutorial;
        this.tutorialSpotlightTimer = 0;
        this.tutorialSpotlightComplete = null;
        this.tutorialLessonSeen = {};
        this.tutorialFreePlayAnnounced = false;
        this.roundNumber = 0;
        this.autoRestartCount = 0;
        this.finished = false;
        this.keyFlash = {};
        this._lastMetrics = null;
        this._resetRound();
    }

    _resetRound() {
        this.roundNumber++;
        this.animTick = 0;
        this.scanTick = 0;
        this.selectedClassIndex = 0;
        this.wheelAngle = this._classIndexToAngle(this.selectedClassIndex);
        this.targetWheelAngle = this.wheelAngle;
        this.roundPackets = this.guidedTutorial && this.roundNumber === 1
            ? this._generateTutorialRoundPackets(this.totalPackets)
            : this._generateRoundPackets(this.totalPackets);
        this.packetCursor = 0;
        this.delivered = 0;
        this.score = 0;
        this.mistakes = 0;
        this.packetX = 0;
        this.packetTrail = [];
        this.activePackets = [];
        this.nextSpawnTimer = 0;
        this.packetSerial = 0;
        this.packetResolved = false;
        this.packetWasCorrect = false;
        this.packetEnteredDecision = false;
        this.activePacket = null;
        this.fxBursts = [];
        this.routeShocks = [];
        this.correctTunnelFeedback = null;
        this.lastRouteNote = 'SECURED: WAITING FOR PACKETS';
        this.lastRouteTone = 'info';
        this.bannerText = 'ROUTE PACKETS BY CLASS';
        this.bannerTone = 'info';
        this.bannerTimer = 120;
        this.phase = 'active';
        this.phaseTimer = 0;
        this.endResult = null;
        this.classButtonRects = [];
        this._spawnPacket();
    }

    _buildPacketPools() {
        this.ipPool = [
            { text: '10.4.18.77', className: 'A', kind: 'IP' },
            { text: '25.31.88.201', className: 'A', kind: 'IP' },
            { text: '88.200.7.19', className: 'A', kind: 'IP' },
            { text: '126.22.44.90', className: 'A', kind: 'IP' },
            { text: '140.16.99.2', className: 'B', kind: 'IP' },
            { text: '172.21.8.254', className: 'B', kind: 'IP' },
            { text: '189.2.91.12', className: 'B', kind: 'IP' },
            { text: '191.200.1.4', className: 'B', kind: 'IP' },
            { text: '192.168.40.1', className: 'C', kind: 'IP' },
            { text: '203.11.77.9', className: 'C', kind: 'IP' },
            { text: '210.33.55.18', className: 'C', kind: 'IP' },
            { text: '223.90.14.222', className: 'C', kind: 'IP' },
            { text: '224.1.5.11', className: 'D', kind: 'IP' },
            { text: '230.18.7.200', className: 'D', kind: 'IP' },
            { text: '235.90.1.44', className: 'D', kind: 'IP' },
            { text: '239.255.12.8', className: 'D', kind: 'IP' },
            { text: '240.18.7.42', className: 'E', kind: 'IP' },
            { text: '246.90.14.201', className: 'E', kind: 'IP' },
            { text: '251.44.8.99', className: 'E', kind: 'IP' },
            { text: '255.201.17.6', className: 'E', kind: 'IP' },
        ];

        this.maskPool = [
            { text: '255.0.0.0', className: 'A', kind: 'MASK' },
            { text: '255.128.0.0', className: 'A', kind: 'MASK' },
            { text: '255.255.0.0', className: 'B', kind: 'MASK' },
            { text: '255.255.192.0', className: 'B', kind: 'MASK' },
            { text: '255.255.255.0', className: 'C', kind: 'MASK' },
            { text: '255.255.255.224', className: 'C', kind: 'MASK' },
        ];
    }

    _generateRoundPackets(count) {
        this._ensureCoreState();
        const packets = [];
        const classes = Array.isArray(this.classOrder) ? this.classOrder : ['A', 'B', 'C', 'D', 'E'];
        const desiredPerClass = Math.max(1, Math.floor(count / Math.max(1, classes.length)));
        const classBuckets = {};
        for (let i = 0; i < classes.length; i++) classBuckets[classes[i]] = [];
        const ipPool = Array.isArray(this.ipPool) ? this.ipPool : [];
        const maskPool = Array.isArray(this.maskPool) ? this.maskPool : [];
        const sourcePool = ipPool.concat(maskPool);
        const source = this._shuffle(sourcePool.map((entry) => Object.assign({}, entry)));

        if (!source.length) {
            return [{ text: '192.168.1.1', className: 'C', kind: 'IP' }];
        }

        for (let i = 0; i < source.length; i++) {
            const entry = source[i];
            if (classBuckets[entry.className] && classBuckets[entry.className].length < desiredPerClass) {
                classBuckets[entry.className].push(entry);
            }
        }

        const leftovers = [];
        for (let i = 0; i < source.length; i++) {
            const entry = source[i];
            if (!classBuckets[entry.className] || classBuckets[entry.className].indexOf(entry) === -1) leftovers.push(entry);
        }

        classes.forEach((name) => {
            for (let i = 0; i < classBuckets[name].length; i++) packets.push(classBuckets[name][i]);
        });

        while (packets.length < count && leftovers.length) {
            packets.push(leftovers.shift());
        }

        while (packets.length < count) {
            const fallback = source[Math.floor(Math.random() * source.length)];
            packets.push(Object.assign({}, fallback));
        }

        return this._shuffle(packets).slice(0, count);
    }

    _generateTutorialRoundPackets(count) {
        const findPacket = (pool, className, preferredText) => {
            const list = Array.isArray(pool) ? pool : [];
            for (let i = 0; i < list.length; i++) {
                if (list[i].className === className && (!preferredText || list[i].text === preferredText)) {
                    return Object.assign({}, list[i]);
                }
            }
            for (let i = 0; i < list.length; i++) {
                if (list[i].className === className) return Object.assign({}, list[i]);
            }
            return null;
        };

        const guided = [];
        const maskExamples = [
            ['A', '255.0.0.0'],
            ['B', '255.255.0.0'],
            ['C', '255.255.255.0'],
        ];
        for (let i = 0; i < maskExamples.length; i++) {
            const entry = findPacket(this.maskPool, maskExamples[i][0], maskExamples[i][1]);
            if (entry) {
                entry.tutorialLesson = { phase: 'mask', order: i + 1, className: entry.className };
                guided.push(entry);
            }
        }

        const ipExamples = [
            ['A', '25.31.88.201'],
            ['B', '172.21.8.254'],
            ['C', '203.11.77.9'],
            ['D', '230.18.7.200'],
            ['E', '240.18.7.42'],
        ];
        for (let i = 0; i < ipExamples.length; i++) {
            const entry = findPacket(this.ipPool, ipExamples[i][0], ipExamples[i][1]);
            if (entry) {
                entry.tutorialLesson = { phase: 'ip', order: i + 1, className: entry.className };
                guided.push(entry);
            }
        }

        const used = {};
        for (let i = 0; i < guided.length; i++) used[guided[i].kind + ':' + guided[i].text] = true;
        // The guided floor teaches only the three standard classful masks.
        // The remaining practice packets are IP addresses so no custom mask
        // can be mistaken for a Class D/E subnet-mask lesson.
        const remainderPool = this._shuffle(this.ipPool.filter((entry) => !used[entry.kind + ':' + entry.text]));
        while (guided.length < count && remainderPool.length) guided.push(Object.assign({}, remainderPool.shift()));
        while (guided.length < count) {
            const fallback = this.ipPool[Math.floor(Math.random() * this.ipPool.length)];
            guided.push(Object.assign({}, fallback));
        }
        return guided.slice(0, count);
    }

    _spawnPacket() {
        if (this.packetCursor >= this.totalPackets) return false;
        const m = this._metrics();
        const entry = this.roundPackets[this.packetCursor] || null;
        if (!entry) return false;
        const packet = Object.assign({}, entry, {
            serial: ++this.packetSerial,
            spawnIndex: this.packetCursor,
            x: m.leftWireX - 26 * m.sX,
            trail: [],
            resolved: false,
            correct: false,
            enteredDecision: false,
            speedVariance: 1,
            blinkTick: Math.random() * Math.PI * 2,
            flashWrong: 0,
            flashPass: 0,
            reverting: false,
            tutorialRetries: 0,
        });
        packet.speed = this._packetSpeed(m, packet);
        this.activePackets.push(packet);
        this.packetCursor++;
        this.nextSpawnTimer = this._nextSpawnDelay();
        this._syncFocusPacket(m);
        return true;
    }

    _nextSpawnDelay() {
        return 110;
    }

    _packetSpeed(m, packet) {
        const variance = packet && packet.speedVariance ? packet.speedVariance : 1;
        const curve = 1 + (this.roundNumber - 1) * 0.02;
        return this.baseSpeed * this.speedMultiplier * curve * variance * Math.max(0.68, m.sX);
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this._ensureCoreState();
        this.animTick++;
        this.scanTick = (this.scanTick + 1.2) % 24;

        const wheelDiff = this._angleDelta(this.wheelAngle, this.targetWheelAngle);
        this.wheelAngle += wheelDiff * 0.22;

        for (let i = this.fxBursts.length - 1; i >= 0; i--) {
            const fx = this.fxBursts[i];
            fx.life--;
            fx.x += fx.vx;
            fx.y += fx.vy;
            fx.vy *= 0.97;
            fx.vx *= 0.99;
            if (fx.life <= 0) this.fxBursts.splice(i, 1);
        }

        for (let i = this.routeShocks.length - 1; i >= 0; i--) {
            const shock = this.routeShocks[i];
            shock.life--;
            if (shock.life <= 0) this.routeShocks.splice(i, 1);
        }

        Object.keys(this.keyFlash || {}).forEach((key) => {
            this.keyFlash[key] = Math.max(0, this.keyFlash[key] - 1);
            if (this.keyFlash[key] <= 0) delete this.keyFlash[key];
        });

        if (this.bannerTimer > 0) this.bannerTimer--;

        if (this.phase === 'active') {
            if (this.tutorialActive) this._updateGuidedTutorial();
            if (this.tutorialPaused || this._isGuidedDialogueActive()) {
                this._syncFocusPacket(this._metrics());
            } else {
                this._updatePacketMotion();
                if (this.tutorialActive) this._updateGuidedTutorial();
            }
        } else if (this.phase === 'retry') {
            const resetDialogueActive = !!(
                IP2Live.DialogueManager &&
                typeof IP2Live.DialogueManager.isActive === 'function' &&
                IP2Live.DialogueManager.isActive()
            );
            if (!resetDialogueActive) this.phaseTimer--;
            if (this.phaseTimer <= 0) {
                this._resetRound();
            }
        } else if (this.phase === 'success') {
            const victoryDialogueActive = !!(
                IP2Live.DialogueManager &&
                typeof IP2Live.DialogueManager.isActive === 'function' &&
                IP2Live.DialogueManager.isActive()
            );
            if (!victoryDialogueActive) this.phaseTimer--;
            if (this.phaseTimer <= 0) {
                this._finishSuccess();
            }
        } else if (this.phase === 'failure') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) {
                this._finishFailure();
            }
        }

        if (this.correctTunnelFeedback) {
            this.correctTunnelFeedback.life--;
            if (this.correctTunnelFeedback.life <= 0) this.correctTunnelFeedback = null;
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _updatePacketMotion() {
        const m = this._metrics();
        const maxTrail = 22;
        const hasReturningPacket = (this.activePackets || []).some((packet) => packet.reverting);

        if (this.packetCursor < this.totalPackets) {
            this.nextSpawnTimer--;
            // Keep one unresolved lead in the inspection lane. A resolved
            // packet may leave on the output side while the next one enters,
            // but players never have to read several live signals at once.
            if (this.nextSpawnTimer <= 0 && !hasReturningPacket && !this._signalPacket(m)) {
                this._spawnPacket();
            }
        }

        for (let i = this.activePackets.length - 1; i >= 0; i--) {
            const packet = this.activePackets[i];
            const reverting = !!packet.reverting;
            const returnSpeed = Math.max(packet.speed * 2.15, 3.8 * m.sX);
            packet.x += reverting ? -returnSpeed : packet.speed;
            packet.blinkTick += 0.13;
            if (packet.flashWrong > 0) packet.flashWrong--;
            if (packet.flashPass > 0) packet.flashPass--;
            packet.trail.push({
                x: packet.x,
                y: m.wireY,
                correct: packet.correct,
                resolved: packet.resolved,
                reverting,
            });
            if (packet.trail.length > maxTrail) packet.trail.shift();

            if (reverting) {
                if (packet.x <= m.leftWireX - 8 * m.sX) {
                    packet.x = m.leftWireX - 8 * m.sX;
                    packet.reverting = false;
                    packet.resolved = false;
                    packet.correct = false;
                    packet.enteredDecision = false;
                    packet.flashWrong = 0;
                    packet.trail = [];
                    this._setBanner('TRAINING RETRY: SELECT CLASS ' + packet.className, 'info', 90);
                    this.lastRouteNote = 'SIGNAL RESTORED: TRY CLASS ' + packet.className;
                    this.lastRouteTone = 'info';
                    this._emitBurst(packet.x, m.wireY, '#FFE600', 18, 2.1);
                }
                continue;
            }

            if (!packet.enteredDecision && packet.x >= m.wheelX - m.wheelRadius * 0.16) {
                packet.enteredDecision = true;
                this._evaluateCurrentPacket(packet);
                if (this.phase !== 'active') return;
            }

            if (packet.x > m.rightWireX + 34 * m.sX) {
                this._emitTransitExit(packet, m);
                this.activePackets.splice(i, 1);
            }
        }

        this._syncFocusPacket(m);
        if (this.delivered >= this.totalPackets && this.activePackets.length === 0) {
            this._onRoundEnd();
        }
    }

    _preTunnelQueue(m) {
        const metrics = m || this._metrics();
        const decisionX = metrics.wheelX - metrics.wheelRadius * 0.16;
        return this.activePackets
            .filter((packet) => !packet.enteredDecision && packet.x < decisionX && packet.x >= metrics.leftWireX - 8 * metrics.sX)
            .sort((a, b) => b.x - a.x);
    }

    _signalPacket(m) {
        const queue = this._preTunnelQueue(m);
        return queue.length ? queue[0] : null;
    }

    _queuePreview(m, limit) {
        const metrics = m || this._metrics();
        const maxItems = Math.max(1, Number(limit) || 3);
        const signal = this._signalPacket(metrics);
        const preview = this._preTunnelQueue(metrics)
            .filter((packet) => !signal || packet.serial !== signal.serial)
            .map((packet) => Object.assign({ queueState: 'LIVE' }, packet));

        for (let i = this.packetCursor; i < this.roundPackets.length && preview.length < maxItems; i++) {
            preview.push(Object.assign({ queueState: 'NEXT' }, this.roundPackets[i]));
        }
        return preview.slice(0, maxItems);
    }

    _syncFocusPacket(m) {
        const metrics = m || this._metrics();
        let focus = this._signalPacket(metrics);
        if (!focus && this.activePackets.length) {
            focus = this.activePackets.slice().sort((a, b) => b.x - a.x)[0];
        }
        this.activePacket = focus;
        this.packetX = focus ? focus.x : 0;
        this.packetTrail = focus ? focus.trail : [];
        this.packetResolved = focus ? focus.resolved : false;
        this.packetWasCorrect = focus ? focus.correct : false;
        this.packetEnteredDecision = focus ? focus.enteredDecision : false;
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
        const m = this._metrics();
        const packet = this._signalPacket(m) || (this.activePackets && this.activePackets[0]) || null;

        if (this.tutorialStep === 'wait_packet') {
            if (packet && packet.x >= m.leftWireX - 8 * m.sX) {
                this.tutorialPaused = true;
                this.tutorialHighlight = null;
                this.tutorialStep = 'packet_dialogue';
                this._showGuidedPacketDialogue(packet);
            }
            return;
        }

        if (this.tutorialStep === 'xray_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'xray_dialogue';
            this._showGuidedXrayDialogue(packet);
            return;
        }

        if (this.tutorialStep === 'goal_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'goal_dialogue';
            this._showGuidedGoalDialogue();
            return;
        }

        if (this.tutorialStep === 'controls_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'controls_dialogue';
            this._showGuidedControlsDialogue();
            return;
        }

        if (this.tutorialStep === 'upcoming_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'upcoming_dialogue';
            this._showGuidedUpcomingDialogue();
            return;
        }

        if (this.tutorialStep === 'current_intro') {
            this.tutorialPaused = true;
            this.tutorialStep = 'current_dialogue';
            this._showGuidedCurrentDialogue();
            return;
        }

        if (this.tutorialStep === 'training_wait' && packet && packet.x >= m.leftWireX - 8 * m.sX) {
            const lesson = packet.tutorialLesson || null;
            if (lesson && !this.tutorialLessonSeen[packet.spawnIndex]) {
                this.tutorialLessonSeen[packet.spawnIndex] = true;
                this.tutorialPaused = true;
                this.tutorialHighlight = null;
                this.tutorialStep = 'training_dialogue';
                this._showGuidedTrainingDialogue(packet);
                return;
            }

            if (!lesson && !this.tutorialFreePlayAnnounced) {
                this.tutorialFreePlayAnnounced = true;
                this.tutorialPaused = true;
                this.tutorialHighlight = null;
                this.tutorialStep = 'independent_dialogue';
                this._showGuidedIndependentDialogue(packet);
            }
        }
    }

    _showTutorialSpotlight(highlight, duration, onComplete) {
        this.tutorialPaused = true;
        this.tutorialHighlight = Object.assign({}, highlight || {});
        this.tutorialSpotlightTimer = Math.max(45, Number(duration) || 105);
        this.tutorialSpotlightComplete = typeof onComplete === 'function' ? onComplete : null;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
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

    _showGuidedPacketDialogue(packet) {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'packet',
                packetSerial: packet && packet.serial,
                label: '01 // LIVE PACKET',
            }, 105, () => {
                this.tutorialStep = 'xray_intro';
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showPacketGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showPacketGuide(done);
        } else {
            done();
        }
    }

    _showGuidedXrayDialogue(packet) {
        this._setGuidedDialogueOpen(true);
        const kind = packet && packet.kind ? packet.kind : 'IP';
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'xray',
                label: '02 // CONDUIT XRAY',
            }, 120, () => {
                this.tutorialStep = 'goal_intro';
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showXrayGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showXrayGuide(kind, done);
        } else {
            done();
        }
    }

    _showGuidedGoalDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'goal',
                label: '03 // PACKET FLOW: 15 TOTAL // TARGET 10',
            }, 120, () => {
                this.tutorialStep = 'controls_intro';
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showGoalGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showGoalGuide(done);
        } else {
            done();
        }
    }

    _showGuidedControlsDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'controls',
                label: '04 // ARROW KEYS: ROTATE ACTIVE TUNNEL',
            }, 125, () => {
                this.tutorialStep = 'upcoming_intro';
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showControlsGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showControlsGuide(done);
        } else {
            done();
        }
    }

    _showGuidedUpcomingDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'upcoming',
                label: '05 // UPCOMING PACKETS',
            }, 110, () => {
                this.tutorialStep = 'current_intro';
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showUpcomingGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showUpcomingGuide(done);
        } else {
            done();
        }
    }

    _showGuidedCurrentDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'current_card',
                label: '06 // CURRENT PACKET // ROUTE THIS SIGNAL',
            }, 110, () => {
                this.tutorialStep = 'training_wait';
                // Keep the stream locked for one more update so the first
                // guided packet lesson opens before motion resumes.
                this.tutorialPaused = true;
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showCurrentGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showCurrentGuide(done);
        } else {
            done();
        }
    }

    _showGuidedTrainingDialogue(packet) {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            const lesson = packet && packet.tutorialLesson ? packet.tutorialLesson : {};
            const phaseLabel = lesson.phase === 'mask' ? 'SUBNET MASK' : 'IP ADDRESS';
            this._showTutorialSpotlight({
                type: 'training',
                packetSerial: packet && packet.serial,
                className: packet && packet.className,
                label: phaseLabel + ' // ROUTE TO CLASS ' + (packet && packet.className ? packet.className : '?'),
            }, 95, () => {
                this.tutorialStep = 'training_wait';
                this.tutorialPaused = false;
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showTrainingPacketGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showTrainingPacketGuide(packet, done);
        } else {
            done();
        }
    }

    _showGuidedIndependentDialogue(packet) {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._showTutorialSpotlight({
                type: 'independent',
                packetSerial: packet && packet.serial,
                label: '07 // INDEPENDENT ROUTING BEGINS',
            }, 105, () => {
                this.tutorialActive = false;
                this.tutorialComplete = true;
                this.tutorialStep = 'done';
                this.tutorialPaused = false;
            });
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showIndependentGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showIndependentGuide(done);
        } else {
            done();
        }
    }

    _onRoundEnd() {
        const metTarget = this.score >= this.targetScore;
        this.endResult = {
            gameplayId: 'ip_patch_panel_classes',
            questId: this.options.questId || null,
            objectiveId: this.options.objectiveId || null,
            mapId: Number(this.options.mapId) || 4,
            score: this.score,
            mistakes: this.mistakes,
            delivered: this.delivered,
            totalPackets: this.totalPackets,
            targetScore: this.targetScore,
            round: this.roundNumber,
            restarts: this.autoRestartCount,
            attemptsUsed: this.roundNumber,
            maxAttempts: this.maxAttempts,
            passed: metTarget,
            reason: metTarget ? 'completed' : 'score_below_threshold',
        };

        if (metTarget) {
            this.bannerText = 'PATCH PANEL SECURED';
            this.bannerTone = 'success';
            this.bannerTimer = 220;
            this.phase = 'success';
            this.phaseTimer = 120;
            if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showVictory === 'function') {
                IP2Live.IPPatchPanelTutorial.showVictory(this.endResult);
            }
            this._emitBurst(this._metrics().wheelX, this._metrics().wireY, '#59FF7A', 70, 4.2);
            return;
        }

        if (this.roundNumber >= this.maxAttempts) {
            this.endResult.reason = 'attempts_exhausted';
            this.phase = 'failure';
            this.phaseTimer = 110;
            this.bannerText = 'ATTEMPT LIMIT REACHED. RETURNING TO TRAINING.';
            this.bannerTone = 'danger';
            this.bannerTimer = 9999;
            this._emitBurst(this._metrics().wheelX, this._metrics().wireY, '#FF1744', 58, 3.8);
            return;
        }

        this.autoRestartCount++;
        this.phase = 'retry';
        this.phaseTimer = 130;
        this.bannerText = 'SCORE BELOW THRESHOLD. AUTO-REROUTE.';
        this.bannerTone = 'danger';
        this.bannerTimer = 9999;
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showRoundReset === 'function') {
            IP2Live.IPPatchPanelTutorial.showRoundReset(
                this.score,
                this.targetScore,
                this.totalPackets,
                this.maxAttempts - this.roundNumber
            );
        }
        this._emitBurst(this._metrics().wheelX, this._metrics().wireY, '#FF4B5E', 44, 3.4);
    }

    _finishSuccess() {
        if (this.finished) return;
        this.finished = true;
        if (typeof this.options.onComplete === 'function') {
            this.options.onComplete(Object.assign({}, this.endResult || {}));
            return;
        }
        if (Manager && Manager.Stack) Manager.Stack.pop();
    }

    _finishFailure() {
        if (this.finished) return;
        this.finished = true;
        const result = Object.assign({}, this.endResult || {}, {
            gameplayId: 'ip_patch_panel_classes',
            reason: 'attempts_exhausted',
            passed: false,
            attemptsUsed: this.roundNumber,
            maxAttempts: this.maxAttempts,
            restarts: this.autoRestartCount,
        });
        if (typeof this.options.onFailed === 'function') {
            this.options.onFailed(result);
            return;
        }
        if (Manager && Manager.Stack) Manager.Stack.pop();
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) return true;

        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._cancel();
            return true;
        }

        if (this.phase !== 'active') return true;
        if (this.tutorialPaused) return true;

        const keyName = this._normalizeKeyName(key);
        if (!keyName) return true;

        if (keyName === 'A' || keyName === 'B' || keyName === 'C' || keyName === 'D' || keyName === 'E') {
            this._switchClassByName(keyName);
            return true;
        }
        if (keyName === 'ARROWLEFT' || keyName === 'ARROWUP') {
            this._stepClass(-1);
            return true;
        }
        if (keyName === 'ARROWRIGHT' || keyName === 'ARROWDOWN') {
            this._stepClass(1);
            return true;
        }
        return true;
    }

    onMouseDown(x, y) {
        if (this.phase !== 'active' || !Array.isArray(this.classButtonRects)) return true;
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) return true;
        if (this.tutorialPaused) return true;
        for (let i = 0; i < this.classButtonRects.length; i++) {
            const hit = this.classButtonRects[i];
            if (this._pointInRect(x, y, hit)) {
                this._switchClassByName(hit.key);
                return true;
            }
        }
        return true;
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

    _normalizeKeyName(key) {
        const value = key && (key.name || key.code || key);
        if (!value) return null;
        const text = String(value).trim();
        if (!text) return null;

        const upper = text.toUpperCase();
        if (upper.length === 1 && ['A', 'B', 'C', 'D', 'E'].includes(upper)) return upper;
        if (upper === 'KEYA') return 'A';
        if (upper === 'KEYB') return 'B';
        if (upper === 'KEYC') return 'C';
        if (upper === 'KEYD') return 'D';
        if (upper === 'KEYE') return 'E';
        if (upper === 'ARROWLEFT' || upper === 'LEFT') return 'ARROWLEFT';
        if (upper === 'ARROWRIGHT' || upper === 'RIGHT') return 'ARROWRIGHT';
        if (upper === 'ARROWUP' || upper === 'UP') return 'ARROWUP';
        if (upper === 'ARROWDOWN' || upper === 'DOWN') return 'ARROWDOWN';
        return null;
    }

    _switchClassByName(name) {
        const next = this.classOrder.indexOf(name);
        if (next < 0) return;
        if (this.selectedClassIndex === next) return;
        this.selectedClassIndex = next;
        this.targetWheelAngle = this._classIndexToAngle(next);
        this.keyFlash[name] = 12;
        this._playCursor();
        this._setBanner('CLASS ' + name + ' ARMED', 'info', 32);
    }

    _stepClass(delta) {
        const total = this.classOrder.length;
        const next = (this.selectedClassIndex + delta + total) % total;
        this._switchClassByName(this.classOrder[next]);
    }

    _classIndexToAngle(index) {
        const total = Math.max(1, this.classOrder.length);
        return Math.PI + (Math.PI * 2 * index / total);
    }

    _classAtDirection(directionIndex) {
        const idx = (this.selectedClassIndex + directionIndex) % this.classOrder.length;
        return this.classOrder[idx];
    }

    _angleDelta(from, to) {
        let delta = to - from;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        return delta;
    }

    _evaluateCurrentPacket(packet) {
        const target = packet || this.activePacket;
        if (!target || target.resolved || target.reverting) return;
        const selectedClass = this.classOrder[this.selectedClassIndex];
        const correctClass = target.className;
        const correct = selectedClass === correctClass;
        const protectedTutorialPacket = !!(
            this.guidedTutorial &&
            this.tutorialActive &&
            target.tutorialLesson
        );

        if (!correct && protectedTutorialPacket) {
            target.reverting = true;
            target.resolved = false;
            target.correct = false;
            target.enteredDecision = true;
            target.tutorialRetries = (Number(target.tutorialRetries) || 0) + 1;
            target.flashWrong = 32;
            target.trail = [];
            this._syncFocusPacket(this._metrics());
            this._emitBurst(target.x + 24, this._metrics().wireY, '#FFE600', 28, 3);
            this._emitRouteShock(target, selectedClass, correctClass);
            this._setBanner('TRAINING MISROUTE: RETURNING SIGNAL', 'danger', 90);
            this.lastRouteNote = 'REVERTING: CLASS ' + selectedClass + ' -> RETRY ' + correctClass;
            this.lastRouteTone = 'danger';
            this._playCancel();
            return;
        }

        this.delivered = Math.min(this.totalPackets, this.delivered + 1);

        target.resolved = true;
        target.correct = correct;
        target.enteredDecision = true;
        this._syncFocusPacket(this._metrics());

        if (correct) {
            this.score++;
            target.flashPass = 16;
            this._emitBurst(target.x + 24, this._metrics().wireY, '#66FF8A', 20, 2.3);
            this._setBanner('SECURED: CLASS ' + correctClass, 'success', 46);
            this.lastRouteNote = 'SECURED: CLASS ' + correctClass;
            this.lastRouteTone = 'success';
            this._playConfirm();
            if (!this.guidedTutorial && this.score >= this.targetScore) {
                this._onRoundEnd();
                return;
            }
        } else {
            this.mistakes++;
            this._reportRouteMistake(target, selectedClass, correctClass);
            target.flashWrong = 22;
            this._emitBurst(target.x + 24, this._metrics().wireY, '#FF4B5E', 26, 2.8);
            this._emitRouteShock(target, selectedClass, correctClass);
            this._setBanner('MISROUTE: ' + selectedClass + ' -> ' + correctClass, 'danger', 58);
            this.lastRouteNote = 'MISROUTE: CLASS ' + selectedClass + ' -> ' + correctClass;
            this.lastRouteTone = 'danger';
            this._playCancel();
        }
    }

    _pointInRect(x, y, rect) {
        if (!rect) return false;
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    _setBanner(text, tone, timer) {
        this.bannerText = text;
        this.bannerTone = tone || 'info';
        this.bannerTimer = Math.max(1, Number(timer) || 30);
    }

    _emitBurst(x, y, color, count, speed) {
        const particles = Math.max(1, Number(count) || 16);
        const baseSpeed = Math.max(0.6, Number(speed) || 2.2);
        for (let i = 0; i < particles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const amp = baseSpeed * (0.45 + Math.random());
            this.fxBursts.push({
                x,
                y,
                vx: Math.cos(angle) * amp,
                vy: Math.sin(angle) * amp,
                life: 14 + Math.floor(Math.random() * 24),
                color: color || '#00D9FF',
                size: 1 + Math.random() * 3.3,
            });
        }
    }

    _reportRouteMistake(packet, selectedClass, correctClass) {
        if (!IP2Live.GameManager || typeof IP2Live.GameManager.handleGameplayMistake !== 'function') return false;
        IP2Live.GameManager.handleGameplayMistake('ip_patch_panel_classes', {
            gameplayId: 'ip_patch_panel_classes',
            mapId: this.options.mapId || 4,
            questId: this.options.questId,
            objectiveId: this.options.objectiveId,
            mistakes: [{
                stepKey: 'ip_classification_route',
                stepLabel: 'IP packet class routing',
                issueType: 'misroute',
                expected: correctClass,
                submitted: selectedClass,
                sourceClass: correctClass,
                targetClass: selectedClass,
                packetIp: packet && packet.text ? packet.text : null,
                packetSerial: packet && packet.serial ? packet.serial : null,
                gameplayStep: 'packet_classification',
            }],
            attemptsRemaining: Math.max(0, this.totalPackets - this.delivered),
        });
        return true;
    }

    _emitRouteShock(packet, selectedClass, correctClass) {
        const m = this._metrics();
        const wrongColor = this.classColors[selectedClass] || '#FF4B5E';
        const expectedColor = this.classColors[correctClass] || '#7DFF7A';
        this.routeShocks.push({
            x: packet.x,
            y: m.wireY,
            life: 26,
            maxLife: 26,
            wrongColor,
            expectedColor,
        });
        this.correctTunnelFeedback = {
            className: correctClass,
            life: 72,
            maxLife: 72,
        };
    }

    _emitTransitExit(packet, m) {
        const metrics = m || this._metrics();
        const color = packet.correct ? '#76FF93' : '#FF5B75';
        this._emitBurst(metrics.rightWireX - 4 * metrics.sX, metrics.wireY, color, packet.correct ? 10 : 14, 2.1);
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        if (!ctx || !ctx.canvas) return;
        const m = this._metrics();
        this._lastMetrics = m;

        ctx.save();
        this._drawBackdrop(ctx, m);
        this._drawPatchPanel(ctx, m);
        this._drawPersonaPanels(ctx, m);
        this._drawXray(ctx, m);
        this._drawTrafficWire(ctx, m);
        this._drawPacketTrail(ctx, m);
        this._drawActivePacket(ctx, m);
        this._drawWheelCore(ctx, m);
        this._drawParticles(ctx, m);
        this._drawProgressRail(ctx, m);
        this._drawPacketDeck(ctx, m);
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

        const panelX = 48 * sX;
        const panelY = 42 * sY;
        const panelW = cW - panelX * 2;
        const panelH = cH - panelY * 2;

        const headH = 82 * sY;
        const footH = 154 * sY;
        const midY = panelY + headH;
        const midH = panelH - headH - footH;

        const xrayW = panelW * 0.78;
        const xrayH = Math.min(362 * sY, panelH * 0.57);
        const xrayX = panelX + (panelW - xrayW) * 0.5;
        const xrayY = panelY + 94 * sY;
        const wireY = xrayY + xrayH * 0.54;
        const leftWireX = panelX + 24 * sX;
        const rightWireX = panelX + panelW - 24 * sX;
        const wheelX = panelX + panelW * 0.5;
        const wheelRadius = Math.min(panelW, panelH) * 0.142;

        const packetFlowY = xrayY + xrayH + 17 * sY;
        const packetCardsY = packetFlowY + 38 * sY;
        const packetCardsH = 70 * sY;

        return {
            cW,
            cH,
            sX,
            sY,
            panelX,
            panelY,
            panelW,
            panelH,
            headH,
            footH,
            midY,
            midH,
            wireY,
            leftWireX,
            rightWireX,
            wheelX,
            wheelRadius,
            xrayX,
            xrayY,
            xrayW,
            xrayH,
            packetFlowY,
            packetCardsY,
            packetCardsH,
        };
    }

    _drawTutorialHighlight(ctx, m) {
        if (!this.tutorialHighlight || (!this.tutorialPaused && !this._isGuidedDialogueActive())) return;
        const focus = this._tutorialHighlightRects(m);
        if (!focus || !focus.rects || !focus.rects.length) return;
        const pulse = 0.55 + 0.45 * Math.sin((this.animTick || 0) * 0.16);
        const cut = Math.max(4 * m.sX, 4);
        const rects = focus.rects;

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.rect(m.panelX, m.panelY, m.panelW, m.panelH);
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            this._appendChamferPath(ctx, rect.x, rect.y, rect.w, rect.h, cut);
        }
        ctx.fillStyle = 'rgba(0, 3, 9, 0.74)';
        ctx.fill('evenodd');

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            const accent = i === 0 ? '#FFE600' : '#00F0FF';
            ctx.shadowColor = accent;
            ctx.shadowBlur = (12 + pulse * 12) * m.sX;
            ctx.fillStyle = i === 0 ? 'rgba(255,230,0,0.09)' : 'rgba(0,240,255,0.08)';
            this._fillChamferRect(ctx, rect.x, rect.y, rect.w, rect.h, cut);
            ctx.strokeStyle = accent;
            ctx.globalAlpha = 0.78 + pulse * 0.22;
            ctx.lineWidth = (i === 0 ? 3 : 2.2) * m.sX;
            this._strokeChamferRect(ctx, rect.x, rect.y, rect.w, rect.h, cut);
            ctx.globalAlpha = 1;

            const sweepH = Math.max(2 * m.sY, rect.h * 0.045);
            const sweepRange = Math.max(1, rect.h - sweepH);
            const sweepY = rect.y + ((this.animTick * 2.4 + i * 19) % sweepRange);
            ctx.shadowBlur = 8 * m.sX;
            ctx.fillStyle = i === 0 ? 'rgba(255,230,0,0.32)' : 'rgba(0,240,255,0.26)';
            ctx.fillRect(rect.x + cut, sweepY, Math.max(0, rect.w - cut * 2), sweepH);
        }

        const anchor = rects[0];
        const label = String(focus.label || this.tutorialHighlight.label || 'SYSTEM FOCUS');
        const labelH = 18 * m.sY;
        const labelY = Math.max(m.panelY + 75 * m.sY, anchor.y - labelH - 7 * m.sY);
        const labelW = Math.min(anchor.w, Math.max(190 * m.sX, label.length * 7.2 * m.sX));
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 9 * m.sX;
        this._fillChamferRect(ctx, anchor.x, labelY, labelW, labelH, 5 * m.sX, '#FFE600');
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#05070A';
        ctx.font = 'bold ' + (7.4 * m.sY).toFixed(1) + 'px ' + this._uiMonoFont();
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
            const minX = m.panelX + padX;
            const minY = m.panelY + 68 * m.sY;
            const maxX = m.panelX + m.panelW - padX;
            const maxY = m.panelY + m.panelH - padY;
            const x = Math.max(minX, rect.x);
            const y = Math.max(minY, rect.y);
            return {
                x,
                y,
                w: Math.max(18 * m.sX, Math.min(rect.x + rect.w, maxX) - x),
                h: Math.max(18 * m.sY, Math.min(rect.y + rect.h, maxY) - y),
            };
        };
        const result = { rects: [], label: highlight.label || '' };

        if (highlight.type === 'packet') {
            let packet = null;
            for (let i = 0; i < this.activePackets.length; i++) {
                if (this.activePackets[i].serial === highlight.packetSerial) {
                    packet = this.activePackets[i];
                    break;
                }
            }
            packet = packet || this.activePacket || (this.activePackets && this.activePackets[0]);
            if (!packet) return null;
            result.rects.push(clampRect({
                x: packet.x - 26 * m.sX,
                y: m.wireY - 24 * m.sY,
                w: 52 * m.sX,
                h: 48 * m.sY,
            }));
            return result;
        }

        if (highlight.type === 'xray') {
            result.rects.push(clampRect({
                x: m.xrayX + 8 * m.sX,
                y: m.xrayY + 36 * m.sY,
                w: m.xrayW - 16 * m.sX,
                h: m.xrayH - 46 * m.sY,
            }));
            return result;
        }

        if (highlight.type === 'goal') {
            result.rects.push(clampRect({
                x: m.xrayX - 8 * m.sX,
                y: m.packetFlowY - 15 * m.sY,
                w: m.xrayW + 16 * m.sX,
                h: 42 * m.sY,
            }));
            return result;
        }

        if (highlight.type === 'controls') {
            result.rects.push(clampRect({
                x: m.wheelX - m.wheelRadius * 1.55,
                y: m.wireY - m.wheelRadius * 1.55,
                w: m.wheelRadius * 3.1,
                h: m.wheelRadius * 3.1,
            }));
            return result;
        }

        const gap = 12 * m.sX;
        const cardW = (m.xrayW - gap * 2) / 3;
        if (highlight.type === 'upcoming' || highlight.type === 'independent') {
            result.rects.push(clampRect({
                x: m.xrayX - 5 * m.sX,
                y: m.packetCardsY - 8 * m.sY,
                w: highlight.type === 'upcoming' ? cardW * 2 + gap + 10 * m.sX : m.xrayW + 10 * m.sX,
                h: m.packetCardsH + 16 * m.sY,
            }));
            return result;
        }

        const currentCardRect = {
            x: m.xrayX + 2 * (cardW + gap) - 5 * m.sX,
            y: m.packetCardsY - 8 * m.sY,
            w: cardW + 10 * m.sX,
            h: m.packetCardsH + 16 * m.sY,
        };
        if (highlight.type === 'current_card') {
            result.rects.push(clampRect(currentCardRect));
            return result;
        }

        if (highlight.type === 'training') {
            result.rects.push(clampRect(currentCardRect));
            let port = null;
            for (let i = 0; i < (this.classButtonRects || []).length; i++) {
                if (this.classButtonRects[i].key === highlight.className) {
                    port = this.classButtonRects[i];
                    break;
                }
            }
            if (port) {
                result.rects.push(clampRect({
                    x: port.x - 8 * m.sX,
                    y: port.y - 8 * m.sY,
                    w: port.w + 16 * m.sX,
                    h: port.h + 16 * m.sY,
                }));
            }
            return result;
        }

        return null;
    }

    _drawBackdrop(ctx, m) {
        const grad = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        grad.addColorStop(0, '#02050B');
        grad.addColorStop(0.5, '#07101C');
        grad.addColorStop(1, '#03060C');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, m.cW, m.cH);

        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#00B9CF';
        ctx.lineWidth = Math.max(0.7, m.sX * 0.7);
        const spacing = 54 * m.sX;
        const drift = (this.animTick * 0.22) % spacing;
        for (let x = -m.cH; x < m.cW + m.cH; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x + drift, 0);
            ctx.lineTo(x + m.cH * 0.3 + drift, m.cH);
            ctx.stroke();
        }
        for (let y = m.cH * 0.15; y < m.cH; y += 42 * m.sY) {
            ctx.globalAlpha = Math.min(0.17, 0.035 + y / m.cH * 0.12);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(m.cW, y);
            ctx.stroke();
        }
        ctx.restore();

        ctx.globalAlpha = 0.28;
        this._drawCable(ctx, -90 * m.sX, m.cH * 0.19, m.cW * 0.2, m.cH * 0.28, m.cW * 0.78, m.cH * 0.09, m.cW + 90 * m.sX, m.cH * 0.21, '#151C27', 11 * m.sX);
        this._drawCable(ctx, -90 * m.sX, m.cH * 0.8, m.cW * 0.22, m.cH * 0.88, m.cW * 0.86, m.cH * 0.7, m.cW + 90 * m.sX, m.cH * 0.81, '#121822', 14 * m.sX);
        ctx.globalAlpha = 1;

        for (let i = 0; i < 34; i++) {
            const px = (i * 173 + this.animTick * (i % 3 + 1) * 0.7) % m.cW;
            const py = (i * 79 + 37) % m.cH;
            ctx.fillStyle = i % 5 === 0 ? 'rgba(255,49,95,0.2)' : 'rgba(0,240,255,0.14)';
            ctx.fillRect(px, py, (i % 4 + 1) * 3 * m.sX, Math.max(1, m.sY));
        }
    }

    _drawPatchPanel(ctx, m) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 28 * m.sX;
        ctx.shadowOffsetY = 10 * m.sY;
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 20 * m.sX, '#060A10');
        ctx.restore();

        const outer = ctx.createLinearGradient(m.panelX, m.panelY, m.panelX, m.panelY + m.panelH);
        outer.addColorStop(0, '#4B5762');
        outer.addColorStop(0.035, '#151D26');
        outer.addColorStop(0.5, '#070C12');
        outer.addColorStop(0.965, '#202A33');
        outer.addColorStop(1, '#59636B');
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 20 * m.sX, outer);
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 20 * m.sX, '#354554', 2.2 * m.sX);

        const innerX = m.panelX + 9 * m.sX;
        const innerY = m.panelY + 9 * m.sY;
        const innerW = m.panelW - 18 * m.sX;
        const innerH = m.panelH - 18 * m.sY;
        const deck = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH);
        deck.addColorStop(0, '#0D151F');
        deck.addColorStop(0.46, '#05090E');
        deck.addColorStop(1, '#10131C');
        this._fillChamferRect(ctx, innerX, innerY, innerW, innerH, 15 * m.sX, deck);
        this._strokeChamferRect(ctx, innerX, innerY, innerW, innerH, 15 * m.sX, '#121F2A', 1.5 * m.sX);

        ctx.save();
        ctx.globalAlpha = 0.15;
        for (let y = innerY + 4 * m.sY; y < innerY + innerH - 4 * m.sY; y += 3 * m.sY) {
            ctx.strokeStyle = ((Math.round(y / m.sY) % 2) ? '#8CA0AB' : '#05070A');
            ctx.lineWidth = Math.max(0.6, 0.7 * m.sY);
            ctx.beginPath();
            ctx.moveTo(innerX + 13 * m.sX, y);
            ctx.lineTo(innerX + innerW - 13 * m.sX, y);
            ctx.stroke();
        }
        ctx.restore();

        const railTop = m.panelY + 76 * m.sY;
        const railBottom = m.panelY + m.panelH - 23 * m.sY;
        const railXs = [m.panelX + 13 * m.sX, m.panelX + m.panelW - 13 * m.sX];
        for (let i = 0; i < railXs.length; i++) {
            const rx = railXs[i];
            const rail = ctx.createLinearGradient(rx - 5 * m.sX, 0, rx + 5 * m.sX, 0);
            rail.addColorStop(0, '#05080B');
            rail.addColorStop(0.45, '#5B6971');
            rail.addColorStop(0.62, '#182129');
            rail.addColorStop(1, '#020406');
            ctx.fillStyle = rail;
            ctx.fillRect(rx - 5 * m.sX, railTop, 10 * m.sX, railBottom - railTop);
            for (let n = 0; n < 4; n++) {
                this._drawFastener(ctx, rx, railTop + (railBottom - railTop) * (n / 3), 5.2 * m.sX, m);
            }
        }

        ctx.strokeStyle = 'rgba(0,240,255,0.25)';
        ctx.lineWidth = 1.2 * m.sX;
        ctx.beginPath();
        ctx.moveTo(m.panelX + 24 * m.sX, m.midY - 5 * m.sY);
        ctx.lineTo(m.panelX + m.panelW - 24 * m.sX, m.midY - 5 * m.sY);
        ctx.moveTo(m.panelX + 24 * m.sX, m.panelY + m.panelH - m.footH - 4 * m.sY);
        ctx.lineTo(m.panelX + m.panelW - 24 * m.sX, m.panelY + m.panelH - m.footH - 4 * m.sY);
        ctx.stroke();

        for (let i = 0; i < 12; i++) {
            const color = i % 3 === 0 ? '#FFE600' : '#00D6E6';
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.32 + 0.18 * Math.sin(this.animTick * 0.08 + i);
            ctx.fillRect(m.panelX + 45 * m.sX + i * 13 * m.sX, m.panelY + m.panelH - 17 * m.sY, 7 * m.sX, 2 * m.sY);
        }
        ctx.globalAlpha = 1;
    }

    _drawPersonaPanels(ctx, m) {
        const titleFont = this._uiTitleFont();
        const x = m.panelX + 22 * m.sX;
        const y = m.panelY + 12 * m.sY;
        const w = 408 * m.sX;
        const h = 54 * m.sY;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.82)';
        ctx.shadowBlur = 12 * m.sX;
        ctx.shadowOffsetY = 5 * m.sY;
        const plate = ctx.createLinearGradient(x, y, x + w, y + h);
        plate.addColorStop(0, '#202A34');
        plate.addColorStop(0.18, '#090D13');
        plate.addColorStop(0.74, '#111821');
        plate.addColorStop(1, '#030508');
        this._fillChamferRect(ctx, x, y, w, h, 11 * m.sX, plate);
        ctx.shadowColor = 'transparent';
        this._strokeChamferRect(ctx, x, y, w, h, 11 * m.sX, 'rgba(180,205,217,0.24)', 1 * m.sX);

        ctx.beginPath();
        ctx.moveTo(x, y + 8 * m.sY);
        ctx.lineTo(x + 70 * m.sX, y);
        ctx.lineTo(x + 62 * m.sX, y + h);
        ctx.lineTo(x, y + h - 8 * m.sY);
        ctx.closePath();
        const badge = ctx.createLinearGradient(x, y, x + 70 * m.sX, y + h);
        badge.addColorStop(0, '#FF315F');
        badge.addColorStop(0.62, '#B50032');
        badge.addColorStop(1, '#4A071C');
        ctx.fillStyle = badge;
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(7 * m.sX) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('IP2', x + 28 * m.sX, y + 19 * m.sY);
        ctx.fillStyle = '#FFE600';
        ctx.fillText('P-02', x + 28 * m.sX, y + 34 * m.sY);

        const titleX = x + 82 * m.sX;
        const titleY = y + 31 * m.sY;
        ctx.font = 'bold ' + Math.round(21 * m.sX) + 'px ' + titleFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#F7FCFF';
        ctx.shadowColor = 'rgba(0,240,255,0.22)';
        ctx.shadowBlur = 5 * m.sX;
        ctx.fillText('NETWORK', titleX, titleY);
        const networkW = ctx.measureText('NETWORK').width;
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#00F0FF';
        ctx.fillText('PATCH', titleX + networkW + 13 * m.sX, titleY);

        ctx.font = 'bold ' + Math.round(6.3 * m.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(190,211,222,0.68)';
        ctx.fillText('PHYSICAL ROUTING // CONDUIT CLASSIFIER', titleX, y + 46 * m.sY);
        ctx.fillStyle = '#FF315F';
        ctx.fillRect(x + 75 * m.sX, y + 6 * m.sY, 28 * m.sX, 2 * m.sY);
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(x + 106 * m.sX, y + 6 * m.sY, 72 * m.sX, 2 * m.sY);
        ctx.fillStyle = 'rgba(210,228,237,0.26)';
        for (let i = 0; i < 5; i++) ctx.fillRect(x + w - (48 - i * 8) * m.sX, y + 8 * m.sY, 5 * m.sX, 2 * m.sY);
        ctx.restore();

        const statusX = m.panelX + m.panelW - 26 * m.sX;
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(0,240,255,0.78)';
        ctx.font = Math.round(8 * m.sX) + 'px monospace';
        ctx.fillText('SYS::IP_CLASS_ROUTER // LIVE', statusX, m.panelY + 28 * m.sY);
        ctx.fillStyle = '#D6E8EE';
        ctx.fillText(
            'ATTEMPT ' + String(this.roundNumber).padStart(2, '0') + '/' + String(this.maxAttempts).padStart(2, '0') +
            '  //  SCORE ' + this.score + '/' + this.targetScore +
            '  //  FLOW ' + this.delivered + '/' + this.totalPackets,
            statusX,
            m.panelY + 46 * m.sY
        );
        ctx.fillStyle = this.lastRouteTone === 'danger' ? '#FF315F' : (this.lastRouteTone === 'success' ? '#76FF93' : '#7E98A4');
        ctx.font = Math.round(6.5 * m.sX) + 'px monospace';
        ctx.fillText(this.lastRouteNote, statusX, m.panelY + 62 * m.sY);
    }

    _drawTrafficWire(ctx, m) {
        ctx.lineCap = 'round';
        const wireR = 10 * m.sY;
        const xrayPad = 10 * m.sX;
        const xrayLeft = m.xrayX + xrayPad;
        const xrayRight = m.xrayX + m.xrayW - xrayPad;

        const drawSheath = (startX, endX) => {
            if (endX <= startX) return;
            const base = ctx.createLinearGradient(startX, 0, endX, 0);
            base.addColorStop(0, '#0E2E39');
            base.addColorStop(0.5, '#165A70');
            base.addColorStop(1, '#143D4C');
            ctx.strokeStyle = base;
            ctx.lineWidth = wireR * 1.9;
            ctx.beginPath();
            ctx.moveTo(startX, m.wireY);
            ctx.lineTo(endX, m.wireY);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(0,0,0,0.42)';
            ctx.lineWidth = wireR * 1.95;
            ctx.beginPath();
            ctx.moveTo(startX, m.wireY + wireR * 0.28);
            ctx.lineTo(endX, m.wireY + wireR * 0.28);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(176,245,255,0.42)';
            ctx.lineWidth = wireR * 0.36;
            ctx.beginPath();
            ctx.moveTo(startX, m.wireY - wireR * 0.34);
            ctx.lineTo(endX, m.wireY - wireR * 0.34);
            ctx.stroke();
        };

        drawSheath(m.leftWireX, xrayLeft);
        drawSheath(xrayRight, m.rightWireX);

        const innerGrad = ctx.createLinearGradient(xrayLeft, 0, xrayRight, 0);
        innerGrad.addColorStop(0, 'rgba(66,226,255,0.35)');
        innerGrad.addColorStop(0.5, 'rgba(164,255,221,0.34)');
        innerGrad.addColorStop(1, 'rgba(66,226,255,0.35)');
        ctx.strokeStyle = innerGrad;
        ctx.lineWidth = wireR * 1.72;
        ctx.beginPath();
        ctx.moveTo(xrayLeft, m.wireY);
        ctx.lineTo(xrayRight, m.wireY);
        ctx.stroke();

        const corePulse = 0.45 + 0.55 * Math.sin(this.animTick * 0.08);
        const conductorColors = [
            'rgba(255,86,112,' + (0.45 + corePulse * 0.3) + ')',
            'rgba(110,255,177,' + (0.42 + corePulse * 0.28) + ')',
            'rgba(111,220,255,' + (0.5 + corePulse * 0.25) + ')',
        ];
        for (let i = 0; i < conductorColors.length; i++) {
            const yOff = (i - 1) * (4.2 * m.sY);
            ctx.strokeStyle = conductorColors[i];
            ctx.lineWidth = 1.6 * m.sY;
            ctx.setLineDash([8 * m.sX, 10 * m.sX]);
            ctx.lineDashOffset = -((this.animTick * 1.6) + i * 7);
            ctx.beginPath();
            ctx.moveTo(xrayLeft, m.wireY + yOff);
            ctx.lineTo(xrayRight, m.wireY + yOff);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        const collars = [xrayLeft, xrayRight];
        for (let i = 0; i < collars.length; i++) {
            const cx = collars[i];
            const metal = ctx.createLinearGradient(cx - 8 * m.sX, 0, cx + 8 * m.sX, 0);
            metal.addColorStop(0, '#05080B');
            metal.addColorStop(0.38, '#9AABB3');
            metal.addColorStop(0.55, '#2A3740');
            metal.addColorStop(1, '#070A0E');
            ctx.fillStyle = metal;
            ctx.fillRect(cx - 7 * m.sX, m.wireY - 17 * m.sY, 14 * m.sX, 34 * m.sY);
            ctx.strokeStyle = '#080C10';
            ctx.lineWidth = 2 * m.sX;
            ctx.strokeRect(cx - 7 * m.sX, m.wireY - 17 * m.sY, 14 * m.sX, 34 * m.sY);
        }

        ctx.font = 'bold ' + (7.2 * m.sY).toFixed(1) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00D7E5';
        ctx.fillText('INGRESS', m.leftWireX + 54 * m.sX, m.wireY - 19 * m.sY);
        ctx.fillText('EGRESS', m.rightWireX - 54 * m.sX, m.wireY - 19 * m.sY);
        for (let i = 0; i < 4; i++) {
            const ax = m.leftWireX + (82 + i * 29) * m.sX;
            const pulse = 0.25 + 0.55 * ((Math.sin(this.animTick * 0.16 - i) + 1) * 0.5);
            ctx.strokeStyle = 'rgba(0,240,255,' + pulse + ')';
            ctx.lineWidth = 2 * m.sX;
            ctx.beginPath();
            ctx.moveTo(ax - 7 * m.sX, m.wireY - 5 * m.sY);
            ctx.lineTo(ax, m.wireY);
            ctx.lineTo(ax - 7 * m.sX, m.wireY + 5 * m.sY);
            ctx.stroke();
        }
    }

    _drawWheelCore(ctx, m) {
        const x = m.wheelX;
        const y = m.wireY;
        const r = m.wheelRadius;
        const primaryFont = this._uiPrimaryFont();
        const activeClass = this.classOrder[this.selectedClassIndex];
        const activeColor = this.classColors[activeClass] || '#7DFF7A';
        this.classButtonRects = [];

        ctx.save();
        ctx.translate(x, y);

        const baseRing = ctx.createRadialGradient(-r * 0.18, -r * 0.2, r * 0.15, 0, 0, r * 1.25);
        baseRing.addColorStop(0, '#79868D');
        baseRing.addColorStop(0.18, '#27323A');
        baseRing.addColorStop(0.46, '#090D12');
        baseRing.addColorStop(0.82, '#171F27');
        baseRing.addColorStop(1, '#030507');
        ctx.fillStyle = baseRing;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#020407';
        ctx.lineWidth = 9 * m.sX;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(169,193,204,0.65)';
        ctx.lineWidth = 2.2 * m.sX;
        ctx.stroke();

        ctx.save();
        ctx.rotate(this.wheelAngle);
        ctx.strokeStyle = activeColor;
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = 2 * m.sX;
        ctx.setLineDash([7 * m.sX, 12 * m.sX]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.93, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.globalAlpha = 1;

        const selectedAngle = -Math.PI * 0.5 + this.selectedClassIndex * (Math.PI * 2 / this.classOrder.length);
        const selectedX = Math.cos(selectedAngle) * r * 0.79;
        const selectedY = Math.sin(selectedAngle) * r * 0.79;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#020407';
        ctx.lineWidth = 25 * m.sY;
        ctx.beginPath();
        ctx.moveTo(-r * 1.04, 0);
        ctx.bezierCurveTo(-r * 0.45, 0, selectedX * 0.28, selectedY * 0.28, selectedX, selectedY);
        ctx.stroke();
        const channelMetal = ctx.createLinearGradient(-r, -r, selectedX, selectedY);
        channelMetal.addColorStop(0, '#35444D');
        channelMetal.addColorStop(0.5, '#A8B8BE');
        channelMetal.addColorStop(1, '#303B42');
        ctx.strokeStyle = channelMetal;
        ctx.lineWidth = 18 * m.sY;
        ctx.stroke();
        ctx.strokeStyle = '#05080B';
        ctx.lineWidth = 10 * m.sY;
        ctx.stroke();
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2.2 * m.sY;
        ctx.setLineDash([8 * m.sX, 8 * m.sX]);
        ctx.lineDashOffset = -this.animTick * 1.6;
        ctx.stroke();
        ctx.setLineDash([]);

        const dirs = [];
        for (let i = 0; i < this.classOrder.length; i++) {
            dirs.push({ angle: -Math.PI * 0.5 + i * (Math.PI * 2 / this.classOrder.length), idx: i });
        }
        for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];
            const cls = this.classOrder[dir.idx];
            const color = this.classColors[cls] || '#8AC9FF';
            const active = dir.idx === this.selectedClassIndex;
            const correctHint = !!(
                this.correctTunnelFeedback &&
                this.correctTunnelFeedback.className === cls &&
                this.correctTunnelFeedback.life > 0
            );
            const hintPulse = correctHint
                ? 0.58 + 0.42 * Math.sin(this.animTick * 0.42)
                : 0;
            const ux = Math.cos(dir.angle);
            const uy = Math.sin(dir.angle);
            const innerX = ux * (r * 0.6);
            const innerY = uy * (r * 0.6);
            const outerX = ux * (r * 1.03);
            const outerY = uy * (r * 1.03);

            ctx.save();
            if (correctHint) {
                ctx.shadowColor = '#59FF8A';
                ctx.shadowBlur = (13 + hintPulse * 12) * m.sX;
            }

            ctx.strokeStyle = '#020407';
            ctx.lineWidth = 22 * m.sY;
            ctx.beginPath();
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
            ctx.stroke();
            ctx.strokeStyle = correctHint ? '#B8FFC8' : (active ? '#AEBFC6' : '#35434C');
            ctx.lineWidth = 16 * m.sY;
            ctx.stroke();
            ctx.strokeStyle = '#05080B';
            ctx.lineWidth = 9 * m.sY;
            ctx.stroke();
            ctx.strokeStyle = correctHint ? '#59FF8A' : (active ? color : 'rgba(85,109,120,0.55)');
            ctx.lineWidth = correctHint ? 4.2 * m.sY : (active ? 2.4 * m.sY : 1.2 * m.sY);
            ctx.beginPath();
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
            ctx.stroke();

            const socketX = ux * (r * 1.04);
            const socketY = uy * (r * 1.04);
            ctx.fillStyle = '#05080B';
            ctx.beginPath();
            ctx.arc(socketX, socketY, 12 * m.sY, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = correctHint ? '#59FF8A' : (active ? color : '#50616B');
            ctx.lineWidth = correctHint ? 4 * m.sX : (active ? 3 * m.sX : 1.5 * m.sX);
            ctx.stroke();
            ctx.fillStyle = correctHint ? '#59FF8A' : (active ? color : '#0B1117');
            ctx.globalAlpha = correctHint ? 0.82 + hintPulse * 0.18 : (active ? 0.72 : 1);
            ctx.beginPath();
            ctx.arc(socketX, socketY, 5.5 * m.sY, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            const labelX = ux * (r * 1.34);
            const labelY = uy * (r * 1.34);
            const boxW = 30 * m.sX;
            const boxH = 18 * m.sY;
            const boxX = labelX - boxW * 0.5;
            const boxY = labelY - boxH * 0.5;
            this._fillChamferRect(ctx, boxX, boxY, boxW, boxH, 4 * m.sX, correctHint ? '#59FF8A' : (active ? color : '#101820'));
            this._strokeChamferRect(ctx, boxX, boxY, boxW, boxH, 4 * m.sX, (correctHint || active) ? '#FFFFFF' : '#4D626E', correctHint ? 2.1 * m.sX : 1.3 * m.sX);
            ctx.fillStyle = (correctHint || active) ? '#020407' : '#BCD0D8';
            ctx.font = 'bold ' + (11 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cls, boxX + boxW * 0.5, boxY + boxH * 0.56);
            ctx.restore();
            this.classButtonRects.push({
                key: cls,
                x: x + Math.min(socketX - 15 * m.sX, boxX - 5 * m.sX),
                y: y + Math.min(socketY - 15 * m.sY, boxY - 5 * m.sY),
                w: Math.max(socketX + 15 * m.sX, boxX + boxW + 5 * m.sX) - Math.min(socketX - 15 * m.sX, boxX - 5 * m.sX),
                h: Math.max(socketY + 15 * m.sY, boxY + boxH + 5 * m.sY) - Math.min(socketY - 15 * m.sY, boxY - 5 * m.sY),
            });
        }

        const hub = ctx.createRadialGradient(-r * 0.08, -r * 0.1, 2, 0, 0, r * 0.48);
        hub.addColorStop(0, '#26343D');
        hub.addColorStop(0.45, '#070B10');
        hub.addColorStop(1, '#010305');
        ctx.fillStyle = hub;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3 * m.sX;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.24)';
        ctx.lineWidth = 1 * m.sX;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (27 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(activeClass, 0, 1 * m.sY);
        ctx.fillStyle = activeColor;
        ctx.font = 'bold ' + (6.5 * m.sY).toFixed(1) + 'px monospace';
        ctx.fillText('ROUTE', 0, 20 * m.sY);

        ctx.restore();
    }

    _drawXray(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const signalPacket = this._signalPacket(m);
        const returningPacket = (this.activePackets || []).find((packet) => packet.reverting) || null;
        const bezel = ctx.createLinearGradient(m.xrayX, m.xrayY, m.xrayX, m.xrayY + m.xrayH);
        bezel.addColorStop(0, '#53626B');
        bezel.addColorStop(0.035, '#121A20');
        bezel.addColorStop(0.5, '#05080B');
        bezel.addColorStop(0.965, '#27333A');
        bezel.addColorStop(1, '#66757C');
        this._fillChamferRect(ctx, m.xrayX, m.xrayY, m.xrayW, m.xrayH, 13 * m.sX, bezel);
        this._strokeChamferRect(ctx, m.xrayX, m.xrayY, m.xrayW, m.xrayH, 13 * m.sX, '#0A0E12', 3 * m.sX);

        const sx = m.xrayX + 9 * m.sX;
        const sy = m.xrayY + 9 * m.sY;
        const sw = m.xrayW - 18 * m.sX;
        const sh = m.xrayH - 18 * m.sY;
        const screen = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
        screen.addColorStop(0, 'rgba(1,15,21,0.96)');
        screen.addColorStop(0.54, 'rgba(4,23,29,0.95)');
        screen.addColorStop(1, 'rgba(2,10,15,0.97)');
        this._fillChamferRect(ctx, sx, sy, sw, sh, 8 * m.sX, screen);
        this._strokeChamferRect(ctx, sx, sy, sw, sh, 8 * m.sX, '#00D8E8', 1.4 * m.sX);

        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.strokeStyle = '#54DDEC';
        ctx.lineWidth = Math.max(0.6, 0.7 * m.sX);
        const grid = 34 * m.sX;
        for (let gx = sx + grid; gx < sx + sw; gx += grid) {
            ctx.beginPath();
            ctx.moveTo(gx, sy + 34 * m.sY);
            ctx.lineTo(gx, sy + sh - 8 * m.sY);
            ctx.stroke();
        }
        for (let gy = sy + 44 * m.sY; gy < sy + sh; gy += 26 * m.sY) {
            ctx.beginPath();
            ctx.moveTo(sx + 7 * m.sX, gy);
            ctx.lineTo(sx + sw - 7 * m.sX, gy);
            ctx.stroke();
        }
        ctx.restore();

        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#92F7FF';
        for (let i = 0; i < 28; i++) {
            const scanY = sy + ((i * 13 + this.scanTick) % sh);
            ctx.fillRect(sx + 5 * m.sX, scanY, sw - 10 * m.sX, Math.max(1, 1.2 * m.sY));
        }
        ctx.globalAlpha = 1;

        const sweepX = sx + ((this.animTick * 2.1 * m.sX) % Math.max(1, sw));
        const sweep = ctx.createLinearGradient(sweepX - 28 * m.sX, 0, sweepX + 28 * m.sX, 0);
        sweep.addColorStop(0, 'rgba(0,240,255,0)');
        sweep.addColorStop(0.5, 'rgba(0,240,255,0.09)');
        sweep.addColorStop(1, 'rgba(0,240,255,0)');
        ctx.fillStyle = sweep;
        ctx.fillRect(sweepX - 28 * m.sX, sy + 34 * m.sY, 56 * m.sX, sh - 42 * m.sY);

        const headerH = 32 * m.sY;
        const header = ctx.createLinearGradient(sx, sy, sx + sw, sy);
        header.addColorStop(0, '#101D23');
        header.addColorStop(0.65, '#060B0F');
        header.addColorStop(1, '#11141A');
        this._fillChamferRect(ctx, sx + 2 * m.sX, sy + 2 * m.sY, sw - 4 * m.sX, headerH, 6 * m.sX, header);
        ctx.fillStyle = '#ECFCFF';
        ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('CONDUIT XRAY // INTERNAL ROUTE', sx + 13 * m.sX, sy + 21 * m.sY);
        ctx.fillStyle = '#00E5F4';
        ctx.font = 'bold ' + (7 * m.sY).toFixed(1) + 'px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('SCOPE::LIVE  CH-02', sx + sw - 13 * m.sX, sy + 20 * m.sY);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#66828D';
        ctx.font = 'bold ' + (7 * m.sY).toFixed(1) + 'px monospace';
        ctx.fillText('FIVE-CHANNEL HOLLOW CONDUIT // ROUTE CORE', sx + 14 * m.sX, sy + sh - 14 * m.sY);
        ctx.textAlign = 'right';
        ctx.fillStyle = returningPacket ? '#FFE600' : (signalPacket ? '#FFE600' : '#546A73');
        ctx.fillText(
            returningPacket ? 'SIGNAL REVERSING // RETRY' : (signalPacket ? 'PACKET INSIDE CONDUIT' : 'CONDUIT CLEAR'),
            sx + sw - 14 * m.sX,
            sy + sh - 14 * m.sY
        );

        const corners = [
            [m.xrayX + 6 * m.sX, m.xrayY + 6 * m.sY],
            [m.xrayX + m.xrayW - 6 * m.sX, m.xrayY + 6 * m.sY],
            [m.xrayX + 6 * m.sX, m.xrayY + m.xrayH - 6 * m.sY],
            [m.xrayX + m.xrayW - 6 * m.sX, m.xrayY + m.xrayH - 6 * m.sY],
        ];
        for (let i = 0; i < corners.length; i++) this._drawFastener(ctx, corners[i][0], corners[i][1], 3.6 * m.sX, m);
    }

    _packetVisibleInXray(m, packet) {
        const x = packet ? packet.x : this.packetX;
        return x >= m.xrayX + 6 * m.sX && x <= m.xrayX + m.xrayW - 18 * m.sX;
    }

    _drawPacketTrail(ctx, m) {
        const packets = this.activePackets && this.activePackets.length
            ? this.activePackets
            : (this.activePacket ? [this.activePacket] : []);
        for (let packetIndex = 0; packetIndex < packets.length; packetIndex++) {
            const trail = packets[packetIndex].trail || [];
            for (let i = 0; i < trail.length; i++) {
                const p = trail[i];
                const alpha = (i + 1) / trail.length * 0.28;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.reverting
                    ? '#FFE600'
                    : p.resolved
                    ? (p.correct ? '#76FF93' : '#FF6271')
                    : '#57E7FF';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4.2 * m.sY, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    _drawActivePacket(ctx, m) {
        const packets = this.activePackets && this.activePackets.length
            ? this.activePackets
            : (this.activePacket ? [this.activePacket] : []);
        if (!packets.length) return;
        const r = 8 * m.sY;
        for (let i = 0; i < packets.length; i++) {
            const packet = packets[i];
            const color = packet.reverting
                ? '#FFE600'
                : packet.resolved
                ? (packet.correct ? '#7BFF8A' : '#FF5267')
                : '#4BE3FF';
            const inXray = this._packetVisibleInXray(m, packet);
            const wrongPulse = packet.flashWrong > 0 ? (0.4 + 0.6 * Math.sin(this.animTick * 0.8)) : 0;
            const passPulse = packet.flashPass > 0 ? (0.45 + 0.55 * Math.sin(this.animTick * 0.55)) : 0;

            const glow = ctx.createRadialGradient(packet.x, m.wireY, r * 0.2, packet.x, m.wireY, r * 3.1);
            glow.addColorStop(0, color);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(packet.x, m.wireY, r * 3.1, 0, Math.PI * 2);
            ctx.fill();

            if (packet.reverting) {
                const pulse = 0.45 + 0.55 * Math.sin(this.animTick * 0.42);
                ctx.save();
                ctx.globalAlpha = 0.55 + pulse * 0.4;
                ctx.strokeStyle = '#FFE600';
                ctx.lineWidth = 2.2 * m.sX;
                ctx.shadowColor = '#FFE600';
                ctx.shadowBlur = (7 + pulse * 8) * m.sX;
                for (let arrow = 0; arrow < 3; arrow++) {
                    const ax = packet.x + (25 + arrow * 15) * m.sX;
                    ctx.beginPath();
                    ctx.moveTo(ax + 6 * m.sX, m.wireY - 6 * m.sY);
                    ctx.lineTo(ax - 2 * m.sX, m.wireY);
                    ctx.lineTo(ax + 6 * m.sX, m.wireY + 6 * m.sY);
                    ctx.stroke();
                }
                ctx.setLineDash([5 * m.sX, 5 * m.sX]);
                ctx.lineDashOffset = this.animTick * 2.5;
                ctx.beginPath();
                ctx.arc(packet.x, m.wireY, r * (1.45 + pulse * 0.25), 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }

            if (!inXray) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(packet.x, m.wireY, r, 0, Math.PI * 2);
                ctx.fill();

                if (wrongPulse > 0) {
                    ctx.globalAlpha = wrongPulse * 0.5;
                    ctx.strokeStyle = '#FF4F68';
                    ctx.lineWidth = 2 * m.sX;
                    ctx.beginPath();
                    ctx.arc(packet.x, m.wireY, r * (1.25 + wrongPulse * 0.7), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }

                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1.4 * m.sX;
                ctx.beginPath();
                ctx.arc(packet.x, m.wireY, r, 0, Math.PI * 2);
                ctx.stroke();
                continue;
            }

            const w = 22 * m.sX;
            const h = 14 * m.sY;
            ctx.fillStyle = 'rgba(5,14,18,0.92)';
            ctx.fillRect(packet.x - w * 0.5, m.wireY - h * 0.5, w, h);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5 * m.sX;
            ctx.strokeRect(packet.x - w * 0.5, m.wireY - h * 0.5, w, h);
            ctx.fillStyle = color;
            ctx.fillRect(packet.x - w * 0.5 + 3 * m.sX, m.wireY - 1.2 * m.sY, w - 6 * m.sX, 2.4 * m.sY);
            if (passPulse > 0) {
                ctx.globalAlpha = passPulse * 0.45;
                ctx.fillStyle = '#A4FFD1';
                ctx.fillRect(packet.x - w * 0.5, m.wireY - h * 0.8, w, h * 1.6);
                ctx.globalAlpha = 1;
            }
            ctx.fillStyle = '#DFFFFF';
            ctx.beginPath();
            ctx.arc(packet.x - w * 0.3, m.wireY, 1.9 * m.sY, 0, Math.PI * 2);
            ctx.arc(packet.x + w * 0.3, m.wireY, 1.9 * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawPacketDeck(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const unresolved = (this.activePackets || [])
            .filter((packet) => !packet.enteredDecision)
            .sort((a, b) => b.x - a.x);
        const current = this._signalPacket(m) || unresolved[0] || this.activePacket || null;
        const upcoming = this._queuePreview(m, 2);
        const cards = [upcoming[1] || null, upcoming[0] || null, current];
        const labels = ['NEXT +2', 'NEXT +1', 'CURRENT'];
        const opacities = [0.28, 0.48, 1];
        const gap = 12 * m.sX;
        const cardW = (m.xrayW - gap * 2) / 3;
        const cardH = m.packetCardsH;

        for (let i = 0; i < cards.length; i++) {
            const packet = cards[i];
            const x = m.xrayX + i * (cardW + gap);
            const y = m.packetCardsY;
            const currentCard = i === 2;
            const kindColor = packet && packet.reverting
                ? '#FFE600'
                : packet && packet.kind === 'MASK' ? '#FFE066' : '#63EDFF';

            ctx.save();
            ctx.globalAlpha = opacities[i];
            const shell = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
            shell.addColorStop(0, currentCard ? '#1B2930' : '#131B21');
            shell.addColorStop(0.12, '#070B0F');
            shell.addColorStop(1, '#030609');
            this._fillChamferRect(ctx, x, y, cardW, cardH, 9 * m.sX, shell);
            this._strokeChamferRect(ctx, x, y, cardW, cardH, 9 * m.sX, currentCard ? kindColor : '#4A5B63', currentCard ? 2 * m.sX : 1.2 * m.sX);

            ctx.fillStyle = currentCard ? '#FFE600' : '#6D838C';
            ctx.font = 'bold ' + (7 * m.sY).toFixed(1) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(labels[i], x + 13 * m.sX, y + 17 * m.sY);
            ctx.textAlign = 'right';
            ctx.fillText(currentCard ? 'NOW' : 'STAGED', x + cardW - 13 * m.sX, y + 17 * m.sY);

            ctx.fillStyle = packet ? kindColor : '#52666E';
            ctx.font = 'bold ' + (16 * m.sY).toFixed(1) + 'px ' + monoFont;
            ctx.textAlign = 'left';
            ctx.fillText(packet ? packet.text : 'BUFFER EMPTY', x + 13 * m.sX, y + 45 * m.sY);
            ctx.fillStyle = currentCard ? '#A8BDC5' : '#657982';
            ctx.font = 'bold ' + (6.5 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.fillText(
                packet
                    ? (packet.reverting
                        ? 'REVERSING TO INGRESS // TRY AGAIN'
                        : (packet.kind === 'MASK' ? 'SUBNET MASK PACKET' : 'IP ADDRESS PACKET'))
                    : 'NO PENDING SIGNAL',
                x + 13 * m.sX,
                y + 61 * m.sY
            );

            ctx.fillStyle = currentCard ? kindColor : '#334149';
            ctx.fillRect(x + cardW - 42 * m.sX, y + cardH - 7 * m.sY, 29 * m.sX, 2 * m.sY);
            ctx.restore();
        }
    }

    _drawParticles(ctx, m) {
        for (let i = 0; i < this.routeShocks.length; i++) {
            const shock = this.routeShocks[i];
            const p = 1 - (shock.life / shock.maxLife);
            const radius = (16 + p * 70) * m.sX;
            ctx.globalAlpha = Math.max(0, 0.7 - p * 0.65);
            ctx.strokeStyle = shock.wrongColor;
            ctx.lineWidth = (2.8 - p * 1.8) * m.sX;
            ctx.beginPath();
            ctx.arc(shock.x, shock.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = Math.max(0, 0.55 - p * 0.5);
            ctx.strokeStyle = shock.expectedColor;
            ctx.setLineDash([8 * m.sX, 8 * m.sX]);
            ctx.lineDashOffset = -this.animTick * 2.4;
            ctx.beginPath();
            ctx.arc(shock.x, shock.y, radius * 0.68, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        for (let i = 0; i < this.fxBursts.length; i++) {
            const fx = this.fxBursts[i];
            const alpha = Math.max(0, fx.life / 32);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fx.color;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, fx.size * m.sY, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    _drawProgressRail(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const w = m.xrayW;
        const x = m.xrayX;
        const y = m.packetFlowY;
        const h = 23 * m.sY;

        this._fillChamferRect(ctx, x, y, w, h, 6 * m.sX, '#070C11');
        this._strokeChamferRect(ctx, x, y, w, h, 6 * m.sX, '#40515B', 1.4 * m.sX);

        const segments = Math.max(1, this.totalPackets);
        const innerX = x + 7 * m.sX;
        const innerW = w - 14 * m.sX;
        const gap = 3 * m.sX;
        const segmentW = (innerW - gap * (segments - 1)) / segments;
        for (let i = 0; i < segments; i++) {
            let color = '#1E2A30';
            if (i < this.delivered) color = i < this.score ? '#00D9C7' : '#FF315F';
            ctx.fillStyle = color;
            ctx.fillRect(innerX + i * (segmentW + gap), y + 6 * m.sY, segmentW, h - 12 * m.sY);
        }

        ctx.fillStyle = '#F4F8FF';
        ctx.font = 'bold ' + (8 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('PACKET FLOW', x + 8 * m.sX, y - 6 * m.sY);
        ctx.fillStyle = '#7C949E';
        ctx.font = 'bold ' + (6.8 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textAlign = 'right';
        ctx.fillText('DELIVERED ' + String(this.delivered).padStart(2, '0') + '/' + this.totalPackets + ' // TARGET ' + this.targetScore, x + w - 8 * m.sX, y - 6 * m.sY);
    }

    _drawPhaseOverlay(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        if (this.phase !== 'retry' && this.phase !== 'success' && this.phase !== 'failure') return;

        const success = this.phase === 'success';
        const terminalFailure = this.phase === 'failure';
        const accent = success ? '#59FF8A' : '#FF315F';
        const secondary = success ? '#00F0FF' : '#FFE600';
        const title = success
            ? 'SECURITY TUNNEL LOCKED'
            : (terminalFailure ? 'ATTEMPT LIMIT REACHED' : 'ROUTE THRESHOLD MISSED');
        const boxW = Math.min(620 * m.sX, m.panelW * 0.56);
        const boxH = 214 * m.sY;
        const boxX = (m.cW - boxW) * 0.5;
        const boxY = (m.cH - boxH) * 0.5;

        ctx.save();
        try {
            if (ctx.canvas && typeof ctx.drawImage === 'function') {
                ctx.filter = 'blur(' + Math.max(2, 3.5 * m.sX).toFixed(1) + 'px)';
                ctx.globalAlpha = 0.42;
                ctx.drawImage(ctx.canvas, -3 * m.sX, -3 * m.sY, m.cW + 6 * m.sX, m.cH + 6 * m.sY);
                ctx.filter = 'none';
            }
        } catch (e) {
            ctx.filter = 'none';
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0, 2, 8, 0.79)';
        ctx.fillRect(0, 0, m.cW, m.cH);

        ctx.shadowColor = accent;
        ctx.shadowBlur = 24 * m.sX;
        const shell = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
        shell.addColorStop(0, '#121C24');
        shell.addColorStop(0.16, '#05080D');
        shell.addColorStop(0.78, '#090A10');
        shell.addColorStop(1, success ? '#092018' : '#230711');
        this._fillChamferRect(ctx, boxX, boxY, boxW, boxH, 18 * m.sX, shell);
        this._strokeChamferRect(ctx, boxX, boxY, boxW, boxH, 18 * m.sX, accent, 2.6 * m.sX);
        ctx.shadowBlur = 0;
        this._strokeChamferRect(ctx, boxX + 8 * m.sX, boxY + 8 * m.sY, boxW - 16 * m.sX, boxH - 16 * m.sY, 12 * m.sX, '#31434D', 1.1 * m.sX);

        ctx.fillStyle = accent;
        this._fillChamferRect(ctx, boxX, boxY, 92 * m.sX, 23 * m.sY, 6 * m.sX);
        ctx.fillStyle = '#020407';
        ctx.font = 'bold ' + (7.5 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(success ? 'ROUTE PASS' : 'ROUTE FAIL', boxX + 46 * m.sX, boxY + 12 * m.sY);

        ctx.fillStyle = '#F5FAFF';
        ctx.font = 'bold ' + (27 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.fillText(title, m.cW * 0.5, boxY + 66 * m.sY);
        ctx.fillStyle = secondary;
        ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText(
            'SECURED ' + this.score + ' / ' + this.totalPackets + '  //  REQUIRED ' + this.targetScore,
            m.cW * 0.5,
            boxY + 98 * m.sY
        );

        ctx.fillStyle = '#B7C7CF';
        ctx.font = 'bold ' + (9 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText(
            success
                ? 'THRESHOLD CONFIRMED // PROCEEDING TO NEXT NODE'
                : (terminalFailure ? 'TWO UNSUCCESSFUL ROUNDS RECORDED' : 'A PASSING SCORE IS REQUIRED TO PROCEED'),
            m.cW * 0.5,
            boxY + 127 * m.sY
        );
        ctx.fillStyle = success ? '#80FFA2' : '#FF9CAD';
        ctx.fillText(
            success
                ? 'FINALIZING SECURE ROUTE'
                : (terminalFailure
                    ? 'RETURNING TO THE PATCH PANEL TUTORIAL'
                    : 'RESTARTING THE FULL 15-PACKET ROUND // ONE ATTEMPT REMAINS'),
            m.cW * 0.5,
            boxY + 149 * m.sY
        );

        const railX = boxX + 45 * m.sX;
        const railY = boxY + 174 * m.sY;
        const railW = boxW - 90 * m.sX;
        const railH = 12 * m.sY;
        const timerMax = success ? 120 : (terminalFailure ? 110 : 130);
        const progress = Math.max(0, Math.min(1, 1 - this.phaseTimer / timerMax));
        this._fillChamferRect(ctx, railX, railY, railW, railH, 4 * m.sX, '#141E25');
        this._fillChamferRect(ctx, railX, railY, Math.max(6 * m.sX, railW * progress), railH, 4 * m.sX, accent);
        ctx.restore();
    }

    _drawFastener(ctx, x, y, radius, m) {
        const r = Math.max(2, radius || 4);
        const metal = ctx.createRadialGradient(x - r * 0.32, y - r * 0.32, r * 0.08, x, y, r);
        metal.addColorStop(0, '#D6E1E5');
        metal.addColorStop(0.32, '#69777E');
        metal.addColorStop(0.72, '#1A2227');
        metal.addColorStop(1, '#020406');
        ctx.save();
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#020305';
        ctx.lineWidth = Math.max(1, m.sX);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.82)';
        ctx.lineWidth = Math.max(1, 1.1 * m.sX);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.55, y);
        ctx.lineTo(x + r * 0.55, y);
        ctx.stroke();
        ctx.restore();
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

    _drawCable(ctx, x1, y1, cx1, cy1, cx2, cy2, x2, y2, color, lineWidth) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
        ctx.stroke();
    }

    _appendChamferPath(ctx, x, y, w, h, cut) {
        const inset = Math.max(0, Math.min(Math.abs(cut || 0), w * 0.22, h * 0.22));
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

    _traceChamferPath(ctx, x, y, w, h, cut) {
        ctx.beginPath();
        this._appendChamferPath(ctx, x, y, w, h, cut);
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

    _fillSkewRect(ctx, x, y, w, h, skew, fill) {
        this._fillChamferRect(ctx, x, y, w, h, Math.abs(skew), fill);
    }

    _strokeSkewRect(ctx, x, y, w, h, skew, stroke, lineWidth) {
        this._strokeChamferRect(ctx, x, y, w, h, Math.abs(skew), stroke, lineWidth);
    }

    _shuffle(input) {
        const array = input.slice();
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = array[i];
            array[i] = array[j];
            array[j] = tmp;
        }
        return array;
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

const PatchPanelGameplayManager = {
    VERSION: 'ip-patchpanel-gameplay-manager-20260817-08',
    _active: false,
    _introShown: false,
    _activeAttempt: null,
    _registeredQuestIds: {},
    _triggerLocks: {},

    PATCH_PANEL_QUESTS: [
        {
            id: 'stage.4.mixed.03.ip_patch_panel.tutorial',
            objectiveId: 'route_stage4_ip_patch_panel_03',
            title: 'LEARN PATCH PANEL ROUTING',
            label: 'Patch Panel Tutorial',
            mapId: 4,
            sequence: 3,
            targetTile: { x: 21, y: 0, z: 26 },
            tutorial: true,
        },
        {
            id: 'stage.4.mixed.06.ip_patch_panel',
            objectiveId: 'route_stage4_ip_patch_panel_06',
            title: 'SECURE PATCH PANEL NODE 06',
            label: 'Patch Panel Node 06',
            mapId: 4,
            sequence: 6,
            targetTile: { x: 19, y: 0, z: 6 },
        },
    ],

    _questSpecs() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_patch_panel_classes');
            if (Array.isArray(specs) && specs.length) return specs;
        }
        return this.PATCH_PANEL_QUESTS;
    },

    _defaultQuestSpec() {
        const specs = this._questSpecs();
        return specs[0] || this.PATCH_PANEL_QUESTS[0];
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !stage || Number(stage.id) !== 4) return [];

        const questIds = [];
        const specs = this._questSpecs();
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            questIds.push(spec.id);

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
                            return PatchPanelGameplayManager._handlePatchObjective(spec, context, activeQuestManager);
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

    _isTutorialSpec(spec, options) {
        const s = spec || {};
        return !!s.tutorial;
    },

    _refreshTriggerLock(spec, distance, radius) {
        if (!spec || !spec.objectiveId) return;
        if (!this._triggerLocks[spec.objectiveId]) return;
        if (distance === null || distance > radius + 0.35) delete this._triggerLocks[spec.objectiveId];
    },

    _lockUntilStepOff(spec) {
        if (spec && spec.objectiveId) this._triggerLocks[spec.objectiveId] = true;
    },

    _handlePatchObjective(spec, context, questManager) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;

        const objective = qm.currentObjective();
        if (!objective || objective.id !== spec.objectiveId) return false;
        const dist = qm.distanceToObjective(objective, context && context.hero);
        const radius = typeof objective.completionRadiusTiles === 'number'
            ? objective.completionRadiusTiles
            : 0.55;

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
            mapId: Number(context && context.mapId) || 4,
            _fromObjective: true,
            guidedTutorial: this._isTutorialSpec(spec),
        };

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
            IP2Live.GameManager.startGameplayNode('ip_patch_panel_classes', Object.assign({}, launchOptions, {
                showIntro: !this._introShown,
                _reservedAttempt: attemptKey,
            }));
            return false;
        }

        this.launchPatchPanelGameplay(Object.assign({}, launchOptions, {
            mode: 'replace',
            showIntro: !this._introShown,
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

    launchPatchPanelGameplay(options) {
        const opts = options || {};
        if (IP2Live.QuestMinimap) {
            if (!IP2Live.QuestMinimap.isActive()) IP2Live.QuestMinimap.create();
            else IP2Live.QuestMinimap.update();
        }
        const guidedTutorial = !!opts.guidedTutorial || this._isTutorialSpec(opts.spec, opts);
        const attemptKey = this._resolveAttemptKey(opts);
        const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
        if (this._active) return false;
        if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
        this._active = true;
        if (opts.questId) this._activeAttempt = attemptKey;

        const open = () => {
            const screen = new IP2LivePatchPanelGameplayScreen({
                totalPackets: opts.totalPackets,
                targetScore: opts.targetScore,
                maxAttempts: opts.maxAttempts || 2,
                speedMultiplier: opts.speedMultiplier,
                baseSpeed: opts.baseSpeed,
                guidedTutorial: guidedTutorial,
                mapId: opts.mapId || (opts.spec && opts.spec.mapId) || 4,
                questId: opts.questId || (opts.spec && opts.spec.id),
                objectiveId: opts.objectiveId || (opts.spec && opts.spec.objectiveId),
                onComplete: (result) => this._onComplete(opts, result),
                onFailed: (result) => this._onFailed(opts, result),
                onCancel: () => this._onCancel(opts),
            });

            const openGameplay = () => {
                this._playMusicZone('GAMEPLAY_2');
                if (Manager && Manager.Stack && typeof Manager.Stack.replace === 'function') {
                    Manager.Stack.replace(screen);
                } else if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
                    Manager.Stack.push(screen);
                }
            };

            if (opts.useLoading !== false && this._showLoadingScreen2({
                mode: 'push',
                status: opts.loadingStatus || 'Loading Gameplay',
                detail: opts.loadingDetail || 'Opening Patch Panel Classifier',
                onComplete: openGameplay,
            })) {
                return;
            } else {
                openGameplay();
            }
        };

        const openSafely = () => {
            try {
                open();
            } catch (e) {
                this._active = false;
                this._activeAttempt = null;
                console.warn('[IP2Live] PatchPanelGameplayManager failed to open gameplay:', e);
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            }
        };

        const shouldShowIntro = opts.showIntro !== false && !this._introShown;
        if (shouldShowIntro && IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showIntro === 'function') {
            this._introShown = true;
            IP2Live.IPPatchPanelTutorial.showIntro(openSafely);
        } else {
            openSafely();
        }

        return true;
    },

    _onComplete(options, result) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        const completionResult = Object.assign({}, result || {}, {
            gameplayId: 'ip_patch_panel_classes',
            questId: opts.questId || spec.id,
            objectiveId: opts.objectiveId || spec.objectiveId,
            mapId: Number(opts.mapId || spec.mapId) || 4,
            attemptsUsed: Number(result && result.attemptsUsed) || 1,
            maxAttempts: Number(result && result.maxAttempts) || 2,
            restarts: Number(result && result.restarts) || 0,
            reason: (result && result.reason) || 'completed',
            passed: true,
        });
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

            if (typeof opts.onComplete === 'function') {
                opts.onComplete(completionResult);
            }

            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
                IP2Live.GameManager.handleGameplayCompleted('ip_patch_panel_classes', {
                    gameplayId: 'ip_patch_panel_classes',
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: Number(opts.mapId || spec.mapId) || 4,
                    result: completionResult,
                });
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: Number(opts.mapId || spec.mapId) === 4
                ? 'Returning to Stage 1 Level 2'
                : 'Returning to Stage',
            onComplete: finalizeExit,
        })) {
            finalizeExit();
        }
    },

    _onFailed(options, result) {
        const opts = options || {};
        const spec = opts.spec || this._defaultQuestSpec();
        const failureResult = Object.assign({}, result || {}, {
            gameplayId: 'ip_patch_panel_classes',
            questId: opts.questId || spec.id,
            objectiveId: opts.objectiveId || spec.objectiveId,
            mapId: Number(opts.mapId || spec.mapId) || 4,
            reason: 'attempts_exhausted',
            attemptsUsed: Number(result && result.attemptsUsed) || 2,
            maxAttempts: Number(result && result.maxAttempts) || 2,
            restarts: Number(result && result.restarts) || 1,
            passed: false,
        });
        this._active = false;
        this._activeAttempt = null;
        this._lockUntilStepOff(spec);

        const finalizeExit = () => {
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();

            if (typeof opts.onFailed === 'function') opts.onFailed(failureResult);
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_patch_panel_classes', {
                    gameplayId: 'ip_patch_panel_classes',
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: Number(opts.mapId || spec.mapId) || 4,
                    result: failureResult,
                });
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: Number(opts.mapId || spec.mapId) === 4
                ? 'Returning to Patch Panel Training'
                : 'Returning to Stage',
            onComplete: finalizeExit,
        })) {
            finalizeExit();
        }
    },

    recoverAfterFailure(failedSpec, payload) {
        const data = payload || {};
        const result = data.result || {};
        if (String(result.reason || '') !== 'attempts_exhausted') return false;
        const mapId = Number(data.mapId || (failedSpec && failedSpec.mapId)) || 4;
        if (mapId !== 4) return false;

        const specs = this._questSpecs();
        const tutorial = specs.find(function (spec) {
            return Number(spec && spec.mapId) === 4 && !!spec.tutorial;
        }) || this.PATCH_PANEL_QUESTS[0];
        const qm = IP2Live.QuestManager;
        if (!tutorial || !qm) return false;

        qm.completedObjectives[tutorial.id] = {};
        if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
        qm.startQuest(tutorial.id, {
            mapId: 4,
            mapQuestMode: true,
            keepLastCompletion: true,
            visible: true,
            preview: false,
            guideActive: true,
            allowCompletion: true,
        });
        this._introShown = false;

        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showRecovery === 'function') {
            setTimeout(() => IP2Live.IPPatchPanelTutorial.showRecovery(failedSpec && failedSpec.label), 220);
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
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
                IP2Live.GameManager.handleGameplayCancelled('ip_patch_panel_classes', {
                    gameplayId: 'ip_patch_panel_classes',
                    spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: Number(opts.mapId || spec.mapId) || 4,
                    result: { cancelled: true },
                });
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: Number(opts.mapId || spec.mapId) === 4
                ? 'Returning to Stage 1 Level 2'
                : 'Returning to Stage',
            onComplete: finalizeExit,
        })) {
            finalizeExit();
        }
    },
};

IP2Live.PatchPanelGameplayManager = PatchPanelGameplayManager;
IP2Live.PatchPanelGameplayScreen = IP2LivePatchPanelGameplayScreen;
window.IP2LivePatchPanelGameplayManager = PatchPanelGameplayManager;
window.IP2LivePatchPanelGameplayScreen = IP2LivePatchPanelGameplayScreen;
window.startPatchPanelGameplayTwo = function (options) {
    return PatchPanelGameplayManager.launchPatchPanelGameplay(options || {});
};

console.log('[IP2Live] ip_patchpanel_gameplay.js module loaded.');
