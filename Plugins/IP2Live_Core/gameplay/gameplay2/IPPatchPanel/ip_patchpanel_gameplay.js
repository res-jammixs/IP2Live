/**
 * IP2Live - Patch Panel Classifier Gameplay
 *
 * Gameplay Two:
 * - 15 packets per round
 * - Secure at least 10 correct classifications
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
        if (!Array.isArray(this.classOrder) || this.classOrder.length !== 4) {
            this.classOrder = ['A', 'B', 'C', 'D'];
        }
        if (!this.classColors) {
            this.classColors = {
                A: '#F5D40A',
                B: '#2EE6FF',
                C: '#7DFF7A',
                D: '#FF4B5E',
            };
        }
        if (!this.keyFlash || typeof this.keyFlash !== 'object') this.keyFlash = {};
    }

    _configure() {
        this._ensureCoreState();
        this.totalPackets = Math.max(1, Number(this.options.totalPackets) || 15);
        this.targetScore = Math.max(1, Number(this.options.targetScore) || 10);
        this.speedMultiplier = Math.max(0.2, Number(this.options.speedMultiplier) || 0.78);
        this.baseSpeed = Math.max(0.45, Number(this.options.baseSpeed) || 1.9);
        this.guidedTutorial = !!this.options.guidedTutorial;
        this.tutorialActive = this.guidedTutorial;
        this.tutorialStep = this.guidedTutorial ? 'wait_packet' : 'done';
        this.tutorialPaused = false;
        this.tutorialHighlight = null;
        this.tutorialDialogueOpen = false;
        this.tutorialComplete = !this.guidedTutorial;
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
        this.roundPackets = this._generateRoundPackets(this.totalPackets);
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
        ];

        this.maskPool = [
            { text: '255.0.0.0', className: 'A', kind: 'MASK' },
            { text: '255.128.0.0', className: 'A', kind: 'MASK' },
            { text: '255.255.0.0', className: 'B', kind: 'MASK' },
            { text: '255.255.192.0', className: 'B', kind: 'MASK' },
            { text: '255.255.255.0', className: 'C', kind: 'MASK' },
            { text: '255.255.255.224', className: 'C', kind: 'MASK' },
            { text: '240.0.0.0', className: 'D', kind: 'MASK' },
            { text: '239.0.0.0', className: 'D', kind: 'MASK' },
        ];
    }

    _generateRoundPackets(count) {
        this._ensureCoreState();
        const packets = [];
        const desiredPerClass = Math.max(1, Math.floor(count / 4));
        const classBuckets = { A: [], B: [], C: [], D: [] };
        const ipPool = Array.isArray(this.ipPool) ? this.ipPool : [];
        const maskPool = Array.isArray(this.maskPool) ? this.maskPool : [];
        const sourcePool = ipPool.concat(maskPool);
        const source = this._shuffle(sourcePool.map((entry) => Object.assign({}, entry)));

        if (!source.length) {
            return [{ text: '192.168.1.1', className: 'C', kind: 'IP' }];
        }

        for (let i = 0; i < source.length; i++) {
            const entry = source[i];
            if (classBuckets[entry.className].length < desiredPerClass) classBuckets[entry.className].push(entry);
        }

        const leftovers = [];
        for (let i = 0; i < source.length; i++) {
            const entry = source[i];
            if (classBuckets[entry.className].indexOf(entry) === -1) leftovers.push(entry);
        }

        const classes = Array.isArray(this.classOrder) ? this.classOrder : ['A', 'B', 'C', 'D'];
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
        });
        packet.speed = this._packetSpeed(m, packet);
        this.activePackets.push(packet);
        this.packetCursor++;
        this.nextSpawnTimer = this._nextSpawnDelay();
        this._syncFocusPacket(m);
        return true;
    }

    _nextSpawnDelay() {
        return 240;
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
            this.phaseTimer--;
            if (this.phaseTimer <= 0) {
                this._resetRound();
            }
        } else if (this.phase === 'success') {
            this.phaseTimer--;
            if (this.phaseTimer <= 0) {
                this._finishSuccess();
            }
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _updatePacketMotion() {
        const m = this._metrics();
        const maxTrail = 22;

        if (this.packetCursor < this.totalPackets) {
            this.nextSpawnTimer--;
            if (this.nextSpawnTimer <= 0) {
                this._spawnPacket();
            }
        }

        for (let i = this.activePackets.length - 1; i >= 0; i--) {
            const packet = this.activePackets[i];
            packet.x += packet.speed;
            packet.blinkTick += 0.13;
            if (packet.flashWrong > 0) packet.flashWrong--;
            if (packet.flashPass > 0) packet.flashPass--;
            packet.trail.push({
                x: packet.x,
                y: m.wireY,
                correct: packet.correct,
                resolved: packet.resolved,
            });
            if (packet.trail.length > maxTrail) packet.trail.shift();

            if (!packet.enteredDecision && packet.x >= m.wheelX - m.wheelRadius * 0.16) {
                packet.enteredDecision = true;
                this._evaluateCurrentPacket(packet);
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
        if (!this.tutorialActive || this.tutorialComplete || this.tutorialDialogueOpen) return;
        const m = this._metrics();
        const packet = this.activePackets && this.activePackets.length ? this.activePackets[0] : null;

        if (this.tutorialStep === 'wait_packet') {
            if (packet && packet.x >= m.leftWireX - 8 * m.sX) {
                this.tutorialPaused = true;
                this.tutorialHighlight = { type: 'packet', packetSerial: packet.serial };
                this.tutorialStep = 'packet_dialogue';
                this._showGuidedPacketDialogue();
            }
            return;
        }

        if (this.tutorialStep === 'wait_xray') {
            const signal = this._signalPacket(m);
            if (signal && this._packetVisibleInXray(m, signal)) {
                this._syncFocusPacket(m);
                this.tutorialPaused = true;
                this.tutorialHighlight = { type: 'xray', packetSerial: signal.serial };
                this.tutorialStep = 'xray_dialogue';
                this._showGuidedXrayDialogue(signal);
            }
            return;
        }

        if (this.tutorialStep === 'controls') {
            this.tutorialPaused = true;
            this.tutorialHighlight = { type: 'controls' };
            this.tutorialStep = 'controls_dialogue';
            this._showGuidedControlsDialogue();
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

    _showGuidedPacketDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this.tutorialPaused = false;
            this.tutorialHighlight = null;
            this.tutorialStep = 'wait_xray';
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
            this.tutorialStep = 'controls';
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showXrayGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showXrayGuide(kind, done);
        } else {
            done();
        }
    }

    _showGuidedControlsDialogue() {
        this._setGuidedDialogueOpen(true);
        const done = () => {
            this._setGuidedDialogueOpen(false);
            this._ensureGuidedUpcomingPacket();
            this.tutorialHighlight = { type: 'upcoming' };
            this.tutorialStep = 'upcoming_dialogue';
            this._showGuidedUpcomingDialogue();
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
            this.tutorialPaused = false;
            this.tutorialHighlight = null;
            this.tutorialActive = false;
            this.tutorialComplete = true;
            this.tutorialStep = 'done';
        };
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showUpcomingGuide === 'function') {
            IP2Live.IPPatchPanelTutorial.showUpcomingGuide(done);
        } else {
            done();
        }
    }

    _ensureGuidedUpcomingPacket() {
        const m = this._metrics();
        const signal = this._signalPacket(m);
        const upcoming = this._preTunnelQueue(m)
            .filter((packet) => !signal || packet.serial !== signal.serial);
        if (upcoming.length || this.packetCursor >= this.totalPackets) return;

        const before = this.activePackets.length;
        if (!this._spawnPacket() || this.activePackets.length <= before) return;
        const staged = this.activePackets[this.activePackets.length - 1];
        staged.x = m.leftWireX + 16 * m.sX;
        staged.trail = [];
        staged.speed = this._packetSpeed(m, staged);
        this.nextSpawnTimer = this._nextSpawnDelay();
        this._syncFocusPacket(m);
    }

    _onRoundEnd() {
        const metTarget = this.score >= this.targetScore;
        this.endResult = {
            gameplayId: 'ip_patch_panel_classes',
            score: this.score,
            mistakes: this.mistakes,
            delivered: this.delivered,
            totalPackets: this.totalPackets,
            targetScore: this.targetScore,
            round: this.roundNumber,
            restarts: this.autoRestartCount,
            passed: metTarget,
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

        this.autoRestartCount++;
        this.phase = 'retry';
        this.phaseTimer = 130;
        this.bannerText = 'SCORE BELOW THRESHOLD. AUTO-REROUTE.';
        this.bannerTone = 'danger';
        this.bannerTimer = 9999;
        if (IP2Live.IPPatchPanelTutorial && typeof IP2Live.IPPatchPanelTutorial.showRoundReset === 'function') {
            IP2Live.IPPatchPanelTutorial.showRoundReset(this.score, this.targetScore, this.totalPackets);
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

        if (keyName === 'A' || keyName === 'B' || keyName === 'C' || keyName === 'D') {
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
        if (upper.length === 1 && ['A', 'B', 'C', 'D'].includes(upper)) return upper;
        if (upper === 'KEYA') return 'A';
        if (upper === 'KEYB') return 'B';
        if (upper === 'KEYC') return 'C';
        if (upper === 'KEYD') return 'D';
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
        if (index === 0) return -Math.PI * 0.5;
        if (index === 1) return Math.PI;
        if (index === 2) return Math.PI * 0.5;
        return 0;
    }

    _classAtDirection(directionIndex) {
        const idx = (this.selectedClassIndex + directionIndex + 1) % this.classOrder.length;
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
        if (!target || target.resolved) return;
        this.delivered = Math.min(this.totalPackets, this.delivered + 1);
        const selectedClass = this.classOrder[this.selectedClassIndex];
        const correctClass = target.className;
        const correct = selectedClass === correctClass;

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
                packetIp: packet && packet.ip ? packet.ip : null,
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
        this._drawTrafficWire(ctx, m);
        this._drawXray(ctx, m);
        this._drawPacketTrail(ctx, m);
        this._drawActivePacket(ctx, m);
        this._drawWheelCore(ctx, m);
        this._drawRightClassifierBox(ctx, m);
        this._drawUpcomingPacketBox(ctx, m);
        this._drawParticles(ctx, m);
        this._drawHudStats(ctx, m);
        this._drawControlHints(ctx, m);
        this._drawProgressRail(ctx, m);
        this._drawBanner(ctx, m);
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

        const panelX = 30 * sX;
        const panelY = 46 * sY;
        const panelW = cW - panelX * 2;
        const panelH = cH - panelY * 2;

        const headH = 68 * sY;
        const footH = 128 * sY;
        const midY = panelY + headH;
        const midH = panelH - headH - footH;

        const wireY = midY + midH * 0.56;
        const leftWireX = panelX + panelW * 0.065;
        const rightWireX = panelX + panelW * 0.935;
        const wheelX = panelX + panelW * 0.52;
        const wheelRadius = Math.min(panelW, panelH) * 0.132;

        const xrayW = panelW * 0.52;
        const xrayH = midH * 0.9;
        const xrayX = wheelX - xrayW * 0.5;
        const xrayY = midY + midH * 0.05;

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
        };
    }

    _drawTutorialHighlight(ctx, m) {
        if (!this.tutorialHighlight || (!this.tutorialPaused && !this._isGuidedDialogueActive())) return;
        const rect = this._tutorialHighlightRect(m);
        if (!rect) return;
        const pulse = 0.55 + 0.45 * Math.sin((this.animTick || 0) * 0.16);
        const cut = Math.max(4 * m.sX, 4);

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = (12 + pulse * 12) * m.sX;
        ctx.fillStyle = 'rgba(255,230,0,0.08)';
        this._fillChamferRect(ctx, rect.x, rect.y, rect.w, rect.h, cut);
        ctx.strokeStyle = 'rgba(255,230,0,' + (0.82 + pulse * 0.18) + ')';
        ctx.lineWidth = 3 * m.sX;
        this._strokeChamferRect(ctx, rect.x, rect.y, rect.w, rect.h, cut);
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = (7 + pulse * 7) * m.sX;
        ctx.strokeStyle = 'rgba(0,240,255,0.72)';
        ctx.lineWidth = 1.4 * m.sX;
        this._strokeChamferRect(ctx, rect.x - 4 * m.sX, rect.y - 4 * m.sY, rect.w + 8 * m.sX, rect.h + 8 * m.sY, cut);
        ctx.restore();
    }

    _tutorialHighlightRect(m) {
        const highlight = this.tutorialHighlight || {};
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
            return {
                x: packet.x - 26 * m.sX,
                y: m.wireY - 24 * m.sY,
                w: 52 * m.sX,
                h: 48 * m.sY,
            };
        }

        if (highlight.type === 'xray') {
            return {
                x: m.xrayX + 10 * m.sX,
                y: m.xrayY + 62 * m.sY,
                w: m.xrayW * 0.58,
                h: 34 * m.sY,
            };
        }

        if (highlight.type === 'controls') {
            return {
                x: m.panelX + m.panelW * 0.37 - 8 * m.sX,
                y: m.panelY + m.panelH - m.footH + 39 * m.sY,
                w: m.panelW * 0.33 + 16 * m.sX,
                h: m.footH - 56 * m.sY,
            };
        }

        if (highlight.type === 'upcoming') {
            return {
                x: m.panelX + m.panelW * 0.792 - 8 * m.sX,
                y: m.midY + m.midH * 0.685 - 8 * m.sY,
                w: m.panelW * 0.165 + 16 * m.sX,
                h: m.midH * 0.225 + 16 * m.sY,
            };
        }

        return null;
    }

    _drawBackdrop(ctx, m) {
        const grad = ctx.createLinearGradient(0, 0, m.cW, m.cH);
        grad.addColorStop(0, '#060A12');
        grad.addColorStop(0.42, '#0C1624');
        grad.addColorStop(1, '#070C14');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, m.cW, m.cH);

        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = '#1E3652';
        ctx.lineWidth = Math.max(1, m.sX);
        const spacing = 46 * m.sX;
        for (let x = -spacing + ((this.animTick * 0.8) % spacing); x < m.cW + spacing; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + m.cH * 0.22, m.cH);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.globalAlpha = 0.27;
        this._drawCable(ctx, -80 * m.sX, m.cH * 0.16, m.cW * 0.2, m.cH * 0.23, m.cW * 0.78, m.cH * 0.11, m.cW + 80 * m.sX, m.cH * 0.22, '#1D222A', 10 * m.sX);
        this._drawCable(ctx, -90 * m.sX, m.cH * 0.76, m.cW * 0.22, m.cH * 0.84, m.cW * 0.86, m.cH * 0.69, m.cW + 90 * m.sX, m.cH * 0.78, '#181C24', 12 * m.sX);
        ctx.globalAlpha = 1;

        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 80; i++) {
            const px = (i * 193 + this.animTick * 4) % m.cW;
            const py = (i * 91 + this.animTick * 1.5) % m.cH;
            ctx.fillStyle = i % 2 ? '#8AEFFF' : '#4C8DE8';
            ctx.fillRect(px, py, 2 * m.sX, 2 * m.sY);
        }
        ctx.globalAlpha = 1;

        const motifY = m.panelY + m.panelH * 0.14;
        for (let i = 0; i < 6; i++) {
            const mx = m.panelX + m.panelW * (0.08 + i * 0.16);
            const pulse = 0.22 + 0.1 * Math.sin(this.animTick * 0.04 + i);
            ctx.strokeStyle = 'rgba(86, 214, 255, ' + pulse + ')';
            ctx.lineWidth = 1.2 * m.sX;
            this._strokeChamferRect(ctx, mx, motifY, 28 * m.sX, 18 * m.sY, 4 * m.sX);
        }
    }

    _drawPatchPanel(ctx, m) {
        const frame = ctx.createLinearGradient(m.panelX, m.panelY, m.panelX, m.panelY + m.panelH);
        frame.addColorStop(0, '#121B29');
        frame.addColorStop(0.55, '#0B1420');
        frame.addColorStop(1, '#09101A');
        ctx.fillStyle = frame;
        this._fillChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX);

        ctx.strokeStyle = '#2E4765';
        ctx.lineWidth = 2.2 * m.sX;
        this._strokeChamferRect(ctx, m.panelX, m.panelY, m.panelW, m.panelH, 18 * m.sX);

        ctx.strokeStyle = '#B3152A';
        ctx.lineWidth = 3.8 * m.sX;
        this._strokeChamferRect(ctx, m.panelX + 10 * m.sX, m.panelY + 10 * m.sY, m.panelW - 20 * m.sX, m.panelH - 20 * m.sY, 14 * m.sX);

        const texture = ctx.createLinearGradient(m.panelX, m.panelY, m.panelX + m.panelW, m.panelY);
        texture.addColorStop(0, 'rgba(74, 219, 255, 0.05)');
        texture.addColorStop(0.45, 'rgba(9, 22, 38, 0.0)');
        texture.addColorStop(1, 'rgba(255, 78, 105, 0.05)');
        ctx.fillStyle = texture;
        this._fillChamferRect(ctx, m.panelX + 14 * m.sX, m.panelY + 14 * m.sY, m.panelW - 28 * m.sX, m.panelH - 28 * m.sY, 12 * m.sX);

        const slotRows = 5;
        const slotCols = 16;
        const slotW = (m.panelW * 0.78) / slotCols;
        const slotH = m.panelH * 0.052;
        const startX = m.panelX + m.panelW * 0.08;
        const startY = m.panelY + m.panelH * 0.145;
        for (let r = 0; r < slotRows; r++) {
            for (let c = 0; c < slotCols; c++) {
                const x = startX + c * slotW;
                const y = startY + r * (slotH + 14 * m.sY);
                ctx.fillStyle = (r + c) % 2 === 0 ? '#10151E' : '#0E131B';
                ctx.fillRect(x, y, slotW - 4 * m.sX, slotH);
                ctx.strokeStyle = '#273140';
                ctx.lineWidth = 1 * m.sX;
                ctx.strokeRect(x, y, slotW - 4 * m.sX, slotH);
            }
        }
    }

    _drawPersonaPanels(ctx, m) {
        const titleFont = this._uiTitleFont();
        const primaryFont = this._uiPrimaryFont();
        const leftX = m.panelX + 18 * m.sX;
        const leftY = m.panelY + 16 * m.sY;
        const leftW = m.panelW * 0.56;
        const leftH = 44 * m.sY;

        const lg = ctx.createLinearGradient(leftX, leftY, leftX + leftW, leftY);
        lg.addColorStop(0, '#BE1B33');
        lg.addColorStop(1, '#F44763');
        ctx.fillStyle = lg;
        this._fillChamferRect(ctx, leftX, leftY, leftW, leftH, 10 * m.sX);
        ctx.strokeStyle = '#FFC7D1';
        ctx.lineWidth = 1.6 * m.sX;
        this._strokeChamferRect(ctx, leftX, leftY, leftW, leftH, 10 * m.sX);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (15 * m.sY).toFixed(1) + 'px ' + titleFont;
        ctx.textAlign = 'left';
        ctx.fillText('PATCH PANEL :: CLASSIFIER TWO', leftX + 14 * m.sX, leftY + leftH * 0.63);

        const rightX = m.panelX + m.panelW * 0.74;
        const rightY = leftY;
        const rightW = m.panelW * 0.23;
        const rightH = leftH;
        const rg = ctx.createLinearGradient(rightX, rightY, rightX + rightW, rightY);
        rg.addColorStop(0, '#07111D');
        rg.addColorStop(1, '#0D2236');
        ctx.fillStyle = rg;
        this._fillChamferRect(ctx, rightX, rightY, rightW, rightH, 10 * m.sX);
        ctx.strokeStyle = '#58D3FF';
        ctx.lineWidth = 2.4 * m.sX;
        this._strokeChamferRect(ctx, rightX, rightY, rightW, rightH, 10 * m.sX);

        ctx.fillStyle = '#F2F7FF';
        ctx.font = 'bold ' + (14.5 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.fillText('ROUND ' + this.roundNumber, rightX + 14 * m.sX, rightY + rightH * 0.63);

        const secX = m.panelX + m.panelW * 0.31;
        const secY = leftY + leftH + 10 * m.sY;
        const secW = m.panelW * 0.38;
        const secH = 30 * m.sY;
        const secG = ctx.createLinearGradient(secX, secY, secX + secW, secY);
        if (this.lastRouteTone === 'success') {
            secG.addColorStop(0, '#14552E');
            secG.addColorStop(1, '#2A9654');
        } else if (this.lastRouteTone === 'danger') {
            secG.addColorStop(0, '#5F1A2A');
            secG.addColorStop(1, '#A5334E');
        } else {
            secG.addColorStop(0, '#20445E');
            secG.addColorStop(1, '#2C678B');
        }
        ctx.fillStyle = secG;
        this._fillChamferRect(ctx, secX, secY, secW, secH, 7 * m.sX);
        this._strokeChamferRect(ctx, secX, secY, secW, secH, 7 * m.sX, '#E4F6FF', 1.4 * m.sX);
        ctx.fillStyle = '#F3FDFF';
        ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.fillText(this.lastRouteNote, secX + secW * 0.5, secY + secH * 0.68);
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
    }

    _drawWheelCore(ctx, m) {
        const x = m.wheelX;
        const y = m.wireY;
        const r = m.wheelRadius;
        const primaryFont = this._uiPrimaryFont();
        const activeClass = this.classOrder[this.selectedClassIndex];
        const activeColor = this.classColors[activeClass] || '#7DFF7A';

        ctx.save();
        ctx.translate(x, y);

        const baseRing = ctx.createRadialGradient(0, 0, r * 0.28, 0, 0, r * 1.23);
        baseRing.addColorStop(0, '#1A2432');
        baseRing.addColorStop(1, '#0A1018');
        ctx.fillStyle = baseRing;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.34;
        ctx.fillStyle = activeColor;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.97, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.rotate(this.wheelAngle);
        ctx.strokeStyle = 'rgba(255,255,255,0.36)';
        ctx.lineWidth = 2.2 * m.sX;
        ctx.setLineDash([10 * m.sX, 12 * m.sX]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        ctx.strokeStyle = '#EAF6FF';
        ctx.lineWidth = 3 * m.sX;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
        ctx.stroke();

        const dirs = [
            { angle: -Math.PI * 0.5, idx: 0 },
            { angle: 0, idx: 1 },
            { angle: Math.PI * 0.5, idx: 2 },
            { angle: Math.PI, idx: 3 },
        ];
        for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];
            const cls = this._classAtDirection(dir.idx);
            const color = this.classColors[cls] || '#8AC9FF';
            const active = dir.idx === 3;
            const ux = Math.cos(dir.angle);
            const uy = Math.sin(dir.angle);
            const innerX = ux * (r * 0.84);
            const innerY = uy * (r * 0.84);
            const outerX = ux * (r * 1.48);
            const outerY = uy * (r * 1.48);

            ctx.strokeStyle = active ? color : '#2A3B4F';
            ctx.lineWidth = active ? 10 * m.sY : 8 * m.sY;
            ctx.beginPath();
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
            ctx.stroke();

            ctx.strokeStyle = active ? '#FFFFFF' : 'rgba(198,225,247,0.3)';
            ctx.lineWidth = 1.8 * m.sY;
            ctx.beginPath();
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
            ctx.stroke();

            const boxW = 26 * m.sX;
            const boxH = 18 * m.sY;
            const boxX = outerX - boxW * 0.5;
            const boxY = outerY - boxH * 0.5;
            ctx.fillStyle = active ? color : '#132232';
            this._fillChamferRect(ctx, boxX, boxY, boxW, boxH, 4 * m.sX);
            this._strokeChamferRect(ctx, boxX, boxY, boxW, boxH, 4 * m.sX, active ? '#FFFFFF' : '#4D6A86', 1.4 * m.sX);
            ctx.fillStyle = active ? '#05080E' : '#D4E7F8';
            ctx.font = 'bold ' + (12.5 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cls, boxX + boxW * 0.5, boxY + boxH * 0.56);
        }

        ctx.fillStyle = '#0A0D12';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.43, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#EB3147';
        ctx.lineWidth = 2.6 * m.sX;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (30 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(activeClass, 0, 1 * m.sY);

        ctx.restore();
    }

    _drawXray(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const signalPacket = this._signalPacket(m);
        const g = ctx.createLinearGradient(m.xrayX, m.xrayY, m.xrayX + m.xrayW, m.xrayY + m.xrayH);
        g.addColorStop(0, 'rgba(5,16,22,0.74)');
        g.addColorStop(1, 'rgba(9,31,39,0.72)');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, m.xrayX, m.xrayY, m.xrayW, m.xrayH, 8 * m.sX);

        ctx.strokeStyle = '#38D6FF';
        ctx.lineWidth = 2 * m.sX;
        this._strokeChamferRect(ctx, m.xrayX, m.xrayY, m.xrayW, m.xrayH, 8 * m.sX);

        ctx.globalAlpha = 0.19;
        ctx.fillStyle = '#8CF2FF';
        for (let i = 0; i < 30; i++) {
            const y = m.xrayY + ((i * 12 + this.scanTick) % m.xrayH);
            ctx.fillRect(m.xrayX + 6 * m.sX, y, m.xrayW - 12 * m.sX, 2 * m.sY);
        }
        ctx.globalAlpha = 1;

        const headerH = 34 * m.sY;
        ctx.fillStyle = 'rgba(0,0,0,0.44)';
        this._fillChamferRect(ctx, m.xrayX + 2 * m.sX, m.xrayY + 2 * m.sY, m.xrayW - 4 * m.sX, headerH, 6 * m.sX);
        ctx.fillStyle = '#D8F8FF';
        ctx.font = 'bold ' + (14 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('XRAY INSPECTOR', m.xrayX + 12 * m.sX, m.xrayY + 22 * m.sY);

        const kind = signalPacket ? signalPacket.kind : null;
        const isMask = kind === 'MASK';
        const kindLabel = !signalPacket ? 'QUEUE STANDBY' : (isMask ? 'SUBNET MASK' : 'IP ADDRESS');
        const kindColor = !signalPacket ? '#7AA4C8' : (isMask ? '#FFE066' : '#5AE3FF');
        const pillW = 166 * m.sX;
        const pillH = 26 * m.sY;
        const pillX = m.xrayX + m.xrayW - pillW - 10 * m.sX;
        const pillY = m.xrayY + 5 * m.sY;
        ctx.fillStyle = 'rgba(1,10,14,0.92)';
        this._fillChamferRect(ctx, pillX, pillY, pillW, pillH, 5 * m.sX);
        ctx.strokeStyle = kindColor;
        ctx.lineWidth = 1.4 * m.sX;
        this._strokeChamferRect(ctx, pillX, pillY, pillW, pillH, 5 * m.sX);
        ctx.fillStyle = kindColor;
        ctx.font = 'bold ' + (11.5 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.textAlign = 'center';
        ctx.fillText(kindLabel, pillX + pillW * 0.5, pillY + pillH * 0.7);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#A6DCE9';
        ctx.font = 'bold ' + (13.5 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText('LIVE SIGNAL', m.xrayX + 14 * m.sX, m.xrayY + 56 * m.sY);

        ctx.fillStyle = kindColor;
        ctx.font = 'bold ' + (22 * m.sY).toFixed(1) + 'px ' + monoFont;
        const label = signalPacket ? signalPacket.text : 'NO SIGNAL';
        ctx.fillText(label, m.xrayX + 14 * m.sX, m.xrayY + 84 * m.sY);
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
                ctx.fillStyle = p.resolved
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
            const color = packet.resolved
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

    _drawRightClassifierBox(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const signalPacket = this._signalPacket(m);
        const bx = m.panelX + m.panelW * 0.792;
        const by = m.midY + m.midH * 0.185;
        const bw = m.panelW * 0.165;
        const bh = m.midH * 0.245;
        const bg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        bg.addColorStop(0, '#0D1723');
        bg.addColorStop(1, '#09111B');
        ctx.fillStyle = bg;
        this._fillChamferRect(ctx, bx, by, bw, bh, 9 * m.sX);
        ctx.strokeStyle = '#3B5F83';
        ctx.lineWidth = 2 * m.sX;
        this._strokeChamferRect(ctx, bx, by, bw, bh, 9 * m.sX);

        const activeClass = this.classOrder[this.selectedClassIndex];
        ctx.fillStyle = '#DAE9FF';
        ctx.font = 'bold ' + (12 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('ACTIVE TUNNEL', bx + 12 * m.sX, by + 22 * m.sY);

        ctx.fillStyle = this.classColors[activeClass];
        ctx.font = 'bold ' + (30 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.fillText('CLASS ' + activeClass, bx + 12 * m.sX, by + 56 * m.sY);

        if (signalPacket) {
            const expected = signalPacket.className;
            const kind = signalPacket.kind === 'MASK' ? 'SUBNET MASK' : 'IP ADDRESS';
            ctx.fillStyle = '#98B8D8';
            ctx.font = 'bold ' + (10.8 * m.sY).toFixed(1) + 'px ' + monoFont;
            ctx.fillText('EXPECTED: ' + expected, bx + 12 * m.sX, by + 78 * m.sY);
            ctx.fillStyle = signalPacket.kind === 'MASK' ? '#FFE066' : '#63EDFF';
            ctx.fillText(kind, bx + 12 * m.sX, by + 94 * m.sY);
        }
    }

    _drawUpcomingPacketBox(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const bx = m.panelX + m.panelW * 0.792;
        const by = m.midY + m.midH * 0.685;
        const bw = m.panelW * 0.165;
        const bh = m.midH * 0.225;
        const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        g.addColorStop(0, '#101D2D');
        g.addColorStop(1, '#0A1320');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, bx, by, bw, bh, 9 * m.sX);
        this._strokeChamferRect(ctx, bx, by, bw, bh, 9 * m.sX, '#3F658A', 2 * m.sX);

        ctx.fillStyle = '#DDF0FF';
        ctx.font = 'bold ' + (11.4 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('UPCOMING PACKETS', bx + 11 * m.sX, by + 20 * m.sY);

        const signalPacket = this._signalPacket(m);
        const upcoming = this._preTunnelQueue(m)
            .filter((packet) => !signalPacket || packet.serial !== signalPacket.serial)
            .slice(0, 3);
        const rowH = 24 * m.sY;
        for (let i = 0; i < 3; i++) {
            const y = by + 28 * m.sY + i * rowH;
            const row = upcoming[i] || null;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(24, 38, 54, 0.5)' : 'rgba(15, 24, 35, 0.55)';
            this._fillChamferRect(ctx, bx + 8 * m.sX, y, bw - 16 * m.sX, 20 * m.sY, 4 * m.sX);

            if (!row) {
                ctx.fillStyle = '#5F7897';
                ctx.font = 'bold ' + (11.6 * m.sY).toFixed(1) + 'px ' + monoFont;
                ctx.fillText('QUEUE EMPTY', bx + 14 * m.sX, y + 13.5 * m.sY);
                continue;
            }

            const color = row.kind === 'MASK' ? '#FFE066' : '#63EDFF';
            ctx.fillStyle = color;
            ctx.font = 'bold ' + (11.8 * m.sY).toFixed(1) + 'px ' + monoFont;
            const type = row.kind === 'MASK' ? 'MASK' : 'IP';
            ctx.fillText(type + '  ' + row.text, bx + 14 * m.sX, y + 13.5 * m.sY);
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

    _drawHudStats(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const x = m.panelX + 24 * m.sX;
        const y = m.panelY + m.panelH - m.footH - 4 * m.sY;
        const w = m.panelW * 0.25;
        const h = m.footH - 28 * m.sY;
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#0D1927');
        g.addColorStop(1, '#08111B');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, x, y, w, h, 8 * m.sX);
        this._strokeChamferRect(ctx, x, y, w, h, 8 * m.sX, '#385678', 2 * m.sX);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (13.5 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'left';
        ctx.fillText('ROUTING STATUS', x + 14 * m.sX, y + 22 * m.sY);

        ctx.fillStyle = '#AFC3D9';
        ctx.font = 'bold ' + (11.5 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText('SCORE      : ' + this.score + ' / ' + this.targetScore, x + 14 * m.sX, y + 45 * m.sY);
        ctx.fillText('DELIVERED  : ' + this.delivered + ' / ' + this.totalPackets, x + 14 * m.sX, y + 63 * m.sY);
        ctx.fillText('MISROUTES  : ' + this.mistakes, x + 14 * m.sX, y + 81 * m.sY);
        ctx.fillText('AUTO RETRY : ' + this.autoRestartCount, x + 14 * m.sX, y + 99 * m.sY);
    }

    _drawControlHints(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        const x = m.panelX + m.panelW * 0.37;
        const y = m.panelY + m.panelH - m.footH + 44 * m.sY;
        const w = m.panelW * 0.33;
        const h = m.footH - 66 * m.sY;
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, '#0F1B2A');
        g.addColorStop(1, '#0A1320');
        ctx.fillStyle = g;
        this._fillChamferRect(ctx, x, y, w, h, 8 * m.sX);
        this._strokeChamferRect(ctx, x, y, w, h, 8 * m.sX, '#3B5E84', 2 * m.sX);

        ctx.fillStyle = '#DDE8F7';
        ctx.font = 'bold ' + (11.5 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.fillText('KEYBOARD / CLICK CLASS CONTROL', x + w * 0.5, y + 18 * m.sY);
        ctx.fillStyle = '#88A9C9';
        ctx.font = 'bold ' + (8.8 * m.sY).toFixed(1) + 'px ' + monoFont;
        ctx.fillText('A-B-C-D OR ARROW KEYS', x + w * 0.5, y + 28 * m.sY);

        this.classButtonRects = [];
        const keys = ['A', 'B', 'C', 'D'];
        const keyW = 52 * m.sX;
        const keyH = 30 * m.sY;
        const gap = 14 * m.sX;
        const totalKeysW = keyW * keys.length + gap * (keys.length - 1);
        const rowX = x + (w - totalKeysW) * 0.5;
        const rowY = y + 31 * m.sY;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const keyX = rowX + i * (keyW + gap);
            const keyY = rowY;
            const active = this.classOrder[this.selectedClassIndex] === key;
            const flash = this.keyFlash[key] || 0;
            ctx.fillStyle = active ? this.classColors[key] : '#16202B';
            if (flash > 0) ctx.fillStyle = '#FFFFFF';
            this._fillChamferRect(ctx, keyX, keyY, keyW, keyH, 6 * m.sX);
            ctx.strokeStyle = active ? '#FFFFFF' : '#45556D';
            ctx.lineWidth = 1.6 * m.sX;
            this._strokeChamferRect(ctx, keyX, keyY, keyW, keyH, 6 * m.sX);

            ctx.fillStyle = active ? '#0D1016' : '#D2E0F0';
            ctx.font = 'bold ' + (15 * m.sY).toFixed(1) + 'px ' + primaryFont;
            ctx.fillText(key, keyX + keyW * 0.5, keyY + 21 * m.sY);

            this.classButtonRects.push({
                key,
                x: keyX,
                y: keyY,
                w: keyW,
                h: keyH,
            });
        }
    }

    _drawProgressRail(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const w = m.panelW * 0.33;
        const x = m.panelX + (m.panelW - w) * 0.5;
        const y = m.panelY + m.panelH - m.footH + 10 * m.sY;
        const h = 20 * m.sY;

        ctx.fillStyle = '#0E1825';
        this._fillChamferRect(ctx, x, y, w, h, 6 * m.sX);
        ctx.strokeStyle = '#3A5679';
        ctx.lineWidth = 1.6 * m.sX;
        this._strokeChamferRect(ctx, x, y, w, h, 6 * m.sX);

        const done = Math.min(1, this.delivered / this.totalPackets);
        if (done > 0) {
            const fillW = (w - 12 * m.sX) * done;
            const g = ctx.createLinearGradient(x, y, x + w, y);
            g.addColorStop(0, '#FF374E');
            g.addColorStop(0.55, '#9967FF');
            g.addColorStop(1, '#13C4FF');
            ctx.fillStyle = g;
            this._fillChamferRect(ctx, x + 6 * m.sX, y + 4 * m.sY, fillW, h - 8 * m.sY, 4 * m.sX);
        }

        ctx.fillStyle = '#F4F8FF';
        ctx.font = 'bold ' + (11 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.fillText('PACKET FLOW PROGRESS', x + 12 * m.sX, y - 7 * m.sY);
    }

    _drawBanner(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        if (this.bannerTimer <= 0 || !this.bannerText) return;
        const x = m.panelX + m.panelW * 0.29;
        const y = m.panelY + 62 * m.sY;
        const w = m.panelW * 0.4;
        const h = 34 * m.sY;

        const bg = ctx.createLinearGradient(x, y, x + w, y);
        if (this.bannerTone === 'success') {
            bg.addColorStop(0, '#0C4B2C');
            bg.addColorStop(1, '#1B8B49');
        } else if (this.bannerTone === 'danger') {
            bg.addColorStop(0, '#5A1220');
            bg.addColorStop(1, '#8D1D32');
        } else {
            bg.addColorStop(0, '#1A2634');
            bg.addColorStop(1, '#223D57');
        }
        ctx.fillStyle = bg;
        this._fillChamferRect(ctx, x, y, w, h, 8 * m.sX);
        this._strokeChamferRect(ctx, x, y, w, h, 8 * m.sX, '#FFFFFF', 1.8 * m.sX);

        ctx.fillStyle = '#F7FCFF';
        ctx.font = 'bold ' + (14.5 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.fillText(this.bannerText, x + w * 0.5, y + h * 0.67);
    }

    _drawPhaseOverlay(ctx, m) {
        const primaryFont = this._uiPrimaryFont();
        const monoFont = this._uiMonoFont();
        if (this.phase !== 'retry' && this.phase !== 'success') return;

        const alpha = this.phase === 'success' ? 0.2 : 0.26;
        ctx.fillStyle = this.phase === 'success'
            ? 'rgba(45, 255, 138, ' + alpha + ')'
            : 'rgba(255, 51, 82, ' + alpha + ')';
        ctx.fillRect(0, 0, m.cW, m.cH);

        const text = this.phase === 'success'
            ? 'SECURITY TUNNEL LOCKED'
            : 'RESTARTING PACKET STREAM';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (32 * m.sY).toFixed(1) + 'px ' + primaryFont;
        ctx.textAlign = 'center';
        ctx.fillText(text, m.cW * 0.5, m.cH * 0.5);

        if (this.phase === 'retry') {
            ctx.font = 'bold ' + (16 * m.sY).toFixed(1) + 'px ' + monoFont;
            ctx.fillText(
                'SCORE ' + this.score + ' / ' + this.targetScore + '  ::  ROUND ' + this.roundNumber + ' RETRY',
                m.cW * 0.5,
                m.cH * 0.56
            );
        }
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
    VERSION: 'ip-patchpanel-gameplay-manager-20260530-01',
    _active: false,
    _introShown: false,
    _activeAttempt: null,
    _registeredQuestIds: {},
    _triggerLocks: {},

    PATCH_PANEL_QUESTS: [
        {
            id: 'stage.4.ip_patch_panel.01.tutorial',
            objectiveId: 'route_ip_patch_panel_01',
            title: 'SECURE PATCH PANEL NODE',
            label: 'Patch Panel Node',
            targetTile: { x: 3, y: 0, z: 29 },
            tutorial: true,
        },
        {
            id: 'stage.4.ip_patch_panel.02',
            objectiveId: 'route_ip_patch_panel_02',
            title: 'SECURE PATCH PANEL NODE',
            label: 'Patch Panel Node',
            targetTile: { x: 21, y: 0, z: 31 },
        },
        {
            id: 'stage.4.ip_patch_panel.03',
            objectiveId: 'route_ip_patch_panel_03',
            title: 'SECURE PATCH PANEL NODE',
            label: 'Patch Panel Node',
            targetTile: { x: 21, y: 0, z: 26 },
        },
        {
            id: 'stage.4.ip_patch_panel.04',
            objectiveId: 'route_ip_patch_panel_04',
            title: 'SECURE PATCH PANEL NODE',
            label: 'Patch Panel Node',
            targetTile: { x: 21, y: 0, z: 17 },
        },
        {
            id: 'stage.4.ip_patch_panel.05',
            objectiveId: 'route_ip_patch_panel_05',
            title: 'SECURE PATCH PANEL NODE',
            label: 'Patch Panel Node',
            targetTile: { x: 12, y: 0, z: 6 },
        },
        {
            id: 'stage.4.ip_patch_panel.06',
            objectiveId: 'route_ip_patch_panel_06',
            title: 'SECURE PATCH PANEL NODE',
            label: 'Patch Panel Node',
            targetTile: { x: 19, y: 0, z: 6 },
        },
        {
            id: 'stage.4.ip_patch_panel.07',
            objectiveId: 'route_ip_patch_panel_07',
            title: 'SECURE PATCH PANEL NODE',
            label: 'Patch Panel Node',
            targetTile: { x: 33, y: 0, z: 1 },
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
        const opts = options || {};
        const questId = String(opts.questId || s.id || '');
        const objectiveId = String(opts.objectiveId || s.objectiveId || '');
        return !!s.tutorial ||
            questId === 'stage.4.ip_patch_panel.01.tutorial' ||
            objectiveId === 'route_ip_patch_panel_01';
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
                speedMultiplier: opts.speedMultiplier,
                baseSpeed: opts.baseSpeed,
                guidedTutorial: guidedTutorial,
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
                opts.onComplete(result);
            }

            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
                IP2Live.GameManager.handleGameplayCompleted('ip_patch_panel_classes', {
                    gameplayId: 'ip_patch_panel_classes',
                    result,
                });
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Returning to Stage 1 Level 2',
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
                IP2Live.GameManager.handleGameplayFailed('ip_patch_panel_classes', {
                    gameplayId: 'ip_patch_panel_classes',
                    reason: 'cancelled',
                });
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        };

        if (!this._showLoadingScreen2({
            mode: 'replace',
            status: 'Loading Stage',
            detail: 'Returning to Stage 1 Level 2',
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
