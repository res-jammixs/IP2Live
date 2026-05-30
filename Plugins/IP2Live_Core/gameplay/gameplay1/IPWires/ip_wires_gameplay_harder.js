/**
 * IP2Live - Gameplay1 IP Wires Harder Mode
 *
 * Stage 1 Level 3 strict-mode IP class wires with randomized class distribution.
 */

(function () {
    const HarderWiresGameplayManager = {
        VERSION: 'ip-wires-harder-gameplay-manager-20260530-05',
        _activeAttempt: null,
        _registeredQuestIds: {},
        _triggerLocks: {},
        _tutorialReturnCycles: 0,
        _musicRestoreTimer: null,

        HARDER_QUESTS: [
            {
                id: 'stage.5.ip_wires_harder.01.tutorial',
                objectiveId: 'repair_ip_wires_harder_01_tutorial',
                title: 'SECURITY BRIEFING LEVER',
                label: 'Strict Tutorial Lever',
                targetTile: { x: 2, y: 0, z: 32 },
                tutorial: true,
                wireCount: 5,
            },
            {
                id: 'stage.5.ip_wires_harder.02',
                objectiveId: 'repair_ip_wires_harder_02',
                title: 'STRICT IP WIRES CHALLENGE',
                label: 'Strict Gameplay Lever',
                targetTile: { x: 4, y: 0, z: 32 },
                wireCount: 6,
            },
            {
                id: 'stage.5.ip_wires_harder.03',
                objectiveId: 'repair_ip_wires_harder_03',
                title: 'STRICT IP WIRES CHALLENGE',
                label: 'Strict Gameplay Lever',
                targetTile: { x: 28, y: 0, z: 25 },
                wireCount: 7,
            },
            {
                id: 'stage.5.ip_wires_harder.04',
                objectiveId: 'repair_ip_wires_harder_04',
                title: 'STRICT IP WIRES CHALLENGE',
                label: 'Strict Gameplay Lever',
                targetTile: { x: 32, y: 0, z: 25 },
                wireCount: 8,
            },
        ],

        _questSpecs() {
            if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
                const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_class_wires_harder');
                if (Array.isArray(specs) && specs.length) return specs;
            }
            return this.HARDER_QUESTS;
        },

        _tutorialQuestSpec() {
            const specs = this._questSpecs();
            for (let i = 0; i < specs.length; i++) if (specs[i] && specs[i].tutorial) return specs[i];
            return specs[0] || this.HARDER_QUESTS[0];
        },

        _gameplayQuestSpec() {
            const specs = this._questSpecs();
            for (let i = 0; i < specs.length; i++) if (specs[i] && !specs[i].tutorial) return specs[i];
            return specs[1] || this.HARDER_QUESTS[1];
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
                    objectives: [{
                        id: spec.objectiveId,
                        title: spec.title,
                        detail: 'TARGET TILE  X:' + target.x + '  Y:' + (target.y || 0) + '  Z:' + target.z,
                        targetTile: target,
                        completionRadiusTiles: 0.55,
                        isComplete: (context, activeQuestManager) => HarderWiresGameplayManager._handleWireObjective(spec, context, activeQuestManager),
                    }],
                });
                this._registeredQuestIds[spec.id] = true;
            }
            return questIds;
        },

        _handleWireObjective(spec, context, questManager) {
            const qm = questManager || IP2Live.QuestManager;
            if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;

            const objective = qm.currentObjective();
            if (!objective || objective.id !== spec.objectiveId) return false;
            const dist = qm.distanceToObjective(objective, context && context.hero);
            const radius = typeof objective.completionRadiusTiles === 'number' ? objective.completionRadiusTiles : 0.55;

            this._refreshTriggerLock(spec, dist, radius);
            if (dist === null || dist > radius) return false;
            if (this._triggerLocks[spec.objectiveId]) return false;

            const attemptKey = spec.id + ':' + spec.objectiveId;
            if (this._activeAttempt === attemptKey) return false;

            if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
                this._activeAttempt = attemptKey;
                IP2Live.GameManager.startGameplayNode('ip_class_wires_harder', {
                    spec: spec,
                    questId: spec.id,
                    objectiveId: spec.objectiveId,
                    mapId: context && context.mapId,
                    tutorialFeedback: false,
                    wireCount: this._resolveWireCount(spec, spec.wireCount),
                    skipBeforeDialogues: !!spec.tutorial,
                });
                return false;
            }

            this.launchHarderWireGameplay({
                spec: spec,
                questId: spec.id,
                objectiveId: spec.objectiveId,
                mapId: context && context.mapId,
                wireCount: this._resolveWireCount(spec, spec.wireCount),
                skipBeforeDialogues: !!spec.tutorial,
            });
            return false;
        },

        _refreshTriggerLock(spec, distance, radius) {
            if (!this._triggerLocks[spec.objectiveId]) return;
            if (distance === null || distance > radius + 0.35) delete this._triggerLocks[spec.objectiveId];
        },

        _lockUntilStepOff(spec) {
            if (spec && spec.objectiveId) this._triggerLocks[spec.objectiveId] = true;
        },

        _catalogWireCount(spec) {
            if (!IP2Live.GameManager || typeof IP2Live.GameManager.getGameplayQuestSpecs !== 'function') return null;
            const objectiveId = spec && spec.objectiveId ? String(spec.objectiveId) : '';
            const questId = spec && spec.id ? String(spec.id) : '';
            const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_class_wires_harder') || [];
            for (let i = 0; i < specs.length; i++) {
                const item = specs[i] || {};
                const sameObjective = objectiveId && String(item.objectiveId || '') === objectiveId;
                const sameQuest = questId && String(item.id || '') === questId;
                if (!sameObjective && !sameQuest) continue;
                const n = Number(item.wireCount);
                if (Number.isFinite(n)) return n;
            }
            return null;
        },

        _resolveWireCount(spec, requestedCount) {
            const s = spec || {};
            const parseFinite = (value) => {
                if (value === null || value === undefined || value === '') return null;
                const n = Number(value);
                return Number.isFinite(n) ? n : null;
            };
            const requested = parseFinite(requestedCount);
            const fromCatalog = parseFinite(this._catalogWireCount(s));
            const fromSpec = parseFinite(s.wireCount);
            const fallback = s.tutorial ? 5 : 8;
            const raw = requested !== null
                ? requested
                : (fromCatalog !== null ? fromCatalog : (fromSpec !== null ? fromSpec : fallback));
            return Math.max(5, Math.min(8, Number.isFinite(raw) ? raw : fallback));
        },

        _isHarderScreen(screen) {
            return !!screen && String(screen.mode || '').toLowerCase() === 'harder';
        },

        _orderedClassSpecs(items) {
            const list = Array.isArray(items) ? items.slice() : [];
            list.sort((a, b) => {
                const left = String((a && a.className) || '');
                const right = String((b && b.className) || '');
                if (left < right) return -1;
                if (left > right) return 1;
                return 0;
            });
            return list;
        },

        _hasDuplicateClass(generated) {
            const counts = {};
            const list = Array.isArray(generated) ? generated : [];
            for (let i = 0; i < list.length; i++) {
                const className = list[i] && list[i].className ? String(list[i].className) : '';
                if (!className) continue;
                counts[className] = (counts[className] || 0) + 1;
                if (counts[className] >= 2) return true;
            }
            return false;
        },

        _fallbackGeneratedForClass(className) {
            const core = IP2Live.IPWiresCore || {};
            if (typeof core.generateIPForClass === 'function') {
                const generated = core.generateIPForClass(className || 'A');
                if (generated) return generated;
            }
            return {
                className: className || 'A',
                color: '#AEB7C2',
                ip: '1.1.1.1',
            };
        },

        _shuffle(items) {
            const copy = Array.isArray(items) ? items.slice() : [];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = copy[i];
                copy[i] = copy[j];
                copy[j] = tmp;
            }
            return copy;
        },

        _classNames() {
            const core = IP2Live.IPWiresCore || {};
            const specs = typeof core.cloneClassSpecs === 'function'
                ? core.cloneClassSpecs()
                : [
                    { className: 'A' },
                    { className: 'B' },
                    { className: 'C' },
                    { className: 'D' },
                    { className: 'E' },
                ];
            return this._orderedClassSpecs(specs).map((entry) => entry.className).filter(Boolean);
        },

        _randomInt(min, max) {
            return min + Math.floor(Math.random() * (max - min + 1));
        },

        _generateHarderClassPlan(wireCount) {
            const desiredCount = this._resolveWireCount({ tutorial: false }, wireCount);
            const classNames = this._classNames();
            const selectedClasses = this._shuffle(classNames);
            const maxDistinct = Math.max(2, Math.min(classNames.length - 1, desiredCount - 1));
            const distinctCount = this._randomInt(2, maxDistinct);
            const chosen = selectedClasses.slice(0, distinctCount);
            const plan = chosen.slice();

            // Fill only from already chosen classes so at least one visible class has duplicates
            // and at least one right-side class can be a trick connector.
            while (plan.length < desiredCount) {
                plan.push(chosen[this._randomInt(0, chosen.length - 1)]);
            }

            return this._shuffle(plan);
        },

        _generateHarderPuzzleEntries(wireCount) {
            const plan = this._generateHarderClassPlan(wireCount);
            const entries = [];
            for (let i = 0; i < plan.length; i++) {
                entries.push(this._fallbackGeneratedForClass(plan[i]));
            }
            return entries;
        },

        _normalizeGeneratedPuzzle(generated, desiredCount, classSpecs) {
            const list = Array.isArray(generated) ? generated.slice() : [];
            const classes = this._orderedClassSpecs(classSpecs || []).map((entry) => entry.className).filter(Boolean);
            const resolveClass = () => {
                if (classes.length) return classes[Math.floor(Math.random() * classes.length)];
                return 'A';
            };

            while (list.length > desiredCount) list.pop();
            while (list.length < desiredCount) {
                list.push(this._fallbackGeneratedForClass(resolveClass()));
            }

            if (!this._hasDuplicateClass(list) && list.length >= 2) {
                const pivotClass = list[0] && list[0].className ? String(list[0].className) : resolveClass();
                list[list.length - 1] = this._fallbackGeneratedForClass(pivotClass);
            }
            return list;
        },

        _installHarderScreenOverrides() {
            const ScreenClass = IP2Live.WiresGameplayScreen;
            if (!ScreenClass || !ScreenClass.prototype) return false;

            const proto = ScreenClass.prototype;
            if (proto._ip2liveHarderOverridesInstalled) return true;

            const self = this;
            const originalResetPuzzleState = proto._resetPuzzleState;
            const originalGeneratePuzzle = proto._generatePuzzle;

            proto._resetPuzzleState = function () {
                originalResetPuzzleState.call(this);
                if (!self._isHarderScreen(this)) return;
                const ordered = self._orderedClassSpecs(this.classSpecs).map((entry) => Object.assign({}, entry));
                this.rightItems = ordered;
                this.rightCount = ordered.length;
            };

            proto._generatePuzzle = function () {
                if (!self._isHarderScreen(this)) return originalGeneratePuzzle.call(this);

                const options = this.options || {};
                const desiredCount = self._resolveWireCount({ tutorial: false }, options.resolvedWireCount || options.wireCount);
                let generated = Array.isArray(options.harderPuzzleEntries)
                    ? options.harderPuzzleEntries.map((entry) => Object.assign({}, entry))
                    : [];
                if (!generated.length) generated = self._generateHarderPuzzleEntries(desiredCount);
                generated = self._normalizeGeneratedPuzzle(generated, desiredCount, this.classSpecs);
                const stamp = Date.now();
                const output = [];
                for (let i = 0; i < generated.length; i++) {
                    const item = generated[i] || {};
                    output.push({
                        id: 'hard_src_' + i + '_' + (item.className || 'A') + '_' + stamp + '_' + Math.floor(Math.random() * 100000),
                        className: item.className || 'A',
                        color: item.color || (typeof this._classColor === 'function' ? this._classColor(item.className || 'A') : '#AEB7C2'),
                        ip: item.ip || '1.1.1.1',
                    });
                }
                return output;
            };

            proto._ip2liveHarderOverridesInstalled = true;
            return true;
        },

        _ensureHarderScreenClass() {
            if (IP2Live.HarderWiresGameplayScreen) return IP2Live.HarderWiresGameplayScreen;
            if (!IP2Live.WiresGameplayScreen) return null;

            const manager = this;
            class IP2LiveHarderWiresGameplayScreen extends IP2Live.WiresGameplayScreen {
                constructor(options) {
                    super(Object.assign({}, options || {}, {
                        mode: 'harder',
                        gameplayId: 'ip_class_wires_harder',
                        allowDuplicateTargets: true,
                        tutorialFeedback: false,
                        guidedTutorial: false,
                    }));
                }

                _resetPuzzleState() {
                    super._resetPuzzleState();
                    const ordered = manager._orderedClassSpecs(this.classSpecs).map((entry) => Object.assign({}, entry));
                    this.rightItems = ordered;
                    this.rightCount = ordered.length;
                }

                _generatePuzzle() {
                    const options = this.options || {};
                    const desiredCount = manager._resolveWireCount({ tutorial: false }, options.resolvedWireCount || options.wireCount);
                    let generated = Array.isArray(options.harderPuzzleEntries)
                        ? options.harderPuzzleEntries.map((entry) => Object.assign({}, entry))
                        : [];
                    if (!generated.length) generated = manager._generateHarderPuzzleEntries(desiredCount);
                    generated = manager._normalizeGeneratedPuzzle(generated, desiredCount, this.classSpecs);
                    const stamp = Date.now();
                    const output = [];
                    for (let i = 0; i < generated.length; i++) {
                        const item = generated[i] || {};
                        const className = item.className || 'A';
                        output.push({
                            id: 'hard_src_' + i + '_' + className + '_' + stamp + '_' + Math.floor(Math.random() * 100000),
                            className: className,
                            color: item.color || (typeof this._classColor === 'function' ? this._classColor(className) : '#AEB7C2'),
                            ip: item.ip || '1.1.1.1',
                        });
                    }
                    return output;
                }
            }

            IP2Live.HarderWiresGameplayScreen = IP2LiveHarderWiresGameplayScreen;
            window.IP2LiveHarderWiresGameplayScreen = IP2LiveHarderWiresGameplayScreen;
            return IP2LiveHarderWiresGameplayScreen;
        },

        _playMusicZone(zoneName) {
            const music = IP2Live.MusicManager;
            if (!music || !music.ZONE || !music.ZONE[zoneName] || typeof music.play !== 'function') return false;
            music.play(music.ZONE[zoneName]);
            return true;
        },

        _restoreStageMusic() {
            const music = IP2Live.MusicManager;
            if (!music) return false;
            if (this._musicRestoreTimer) {
                clearTimeout(this._musicRestoreTimer);
                this._musicRestoreTimer = null;
            }
            if (typeof music.stop === 'function') music.stop(120);
            this._musicRestoreTimer = setTimeout(() => {
                this._musicRestoreTimer = null;
                this._playMusicZone('STAGE_1');
            }, 150);
            return true;
        },

        launchHarderWireGameplay(options) {
            const opts = options || {};
            const spec = opts.spec || this._gameplayQuestSpec();
            const attemptKey = (opts.questId || spec.id) + ':' + (opts.objectiveId || spec.objectiveId);
            const isReservedAttempt = opts._fromGameManager && opts._reservedAttempt === attemptKey;
            if (this._activeAttempt === attemptKey && !isReservedAttempt) return false;
            this._activeAttempt = attemptKey;
            this._installHarderScreenOverrides();

            const wireCount = this._resolveWireCount(spec, opts.wireCount);
            const harderPuzzleEntries = this._generateHarderPuzzleEntries(wireCount);
            const HarderScreenClass = this._ensureHarderScreenClass() || IP2Live.WiresGameplayScreen;
            const createScreen = () => new HarderScreenClass({
                mode: 'harder',
                gameplayId: 'ip_class_wires_harder',
                maxAttempts: 3,
                allowDuplicateTargets: true,
                tutorialFeedback: false,
                guidedTutorial: false,
                wireCount: wireCount,
                resolvedWireCount: wireCount,
                harderPuzzleEntries: harderPuzzleEntries.map((entry) => Object.assign({}, entry)),
                questLabel: spec.label,
                questId: opts.questId || spec.id,
                objectiveId: opts.objectiveId || spec.objectiveId,
                mapId: opts.mapId || 5,
                onComplete: (result) => this._completeHarderGameplay(opts, result),
                onFailed: (result) => this._failHarderGameplay(opts, result),
                onCancel: () => {
                    this._activeAttempt = null;
                    this._lockUntilStepOff(spec);
                    if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
                        IP2Live.GameManager.handleGameplayCancelled('ip_class_wires_harder', {
                            spec: spec,
                            questId: opts.questId || spec.id,
                            objectiveId: opts.objectiveId || spec.objectiveId,
                            mapId: opts.mapId || 5,
                            result: { cancelled: true },
                        });
                    }
                    Manager.Stack.pop();
                    this._restoreStageMusic();
                    if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                },
            });

            const openGameplay = () => {
                this._playMusicZone('GAMEPLAY_1');
                const screen = createScreen();
                Manager.Stack.replace(screen);
                if (spec.tutorial && IP2Live.IPWiresHarderTutorial && typeof IP2Live.IPWiresHarderTutorial.showIntro === 'function') {
                    setTimeout(() => {
                        IP2Live.IPWiresHarderTutorial.showIntro();
                    }, 0);
                }
            };

            const ScreenClass = IP2Live.LoadingScreen2 || IP2Live.LoadingScreen;
            if (ScreenClass && typeof ScreenClass.show === 'function') {
                ScreenClass.show({
                    mode: 'push',
                    status: 'Loading Gameplay',
                    detail: 'Opening ' + (spec.label || 'Strict IP wires panel'),
                    onComplete: openGameplay,
                });
            } else {
                this._playMusicZone('GAMEPLAY_1');
                Manager.Stack.push(createScreen());
            }
            return true;
        },

        _completeHarderGameplay(options, result) {
            const opts = options || {};
            const spec = opts.spec || this._gameplayQuestSpec();
            this._activeAttempt = null;
            delete this._triggerLocks[spec.objectiveId];
            Manager.Stack.pop();
            this._restoreStageMusic();

            if (!spec.tutorial) this._tutorialReturnCycles = 0;

            if (
                IP2Live.QuestManager &&
                IP2Live.QuestManager.activeQuestId === (opts.questId || spec.id) &&
                IP2Live.QuestManager.activeObjectiveId === (opts.objectiveId || spec.objectiveId)
            ) {
                IP2Live.QuestManager.completeObjective(opts.objectiveId || spec.objectiveId);
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
                IP2Live.GameManager.handleGameplayCompleted('ip_class_wires_harder', {
                    spec: spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || 5,
                    result: result,
                });
            }
            return result;
        },

        _failHarderGameplay(options, result) {
            const opts = options || {};
            const spec = opts.spec || this._gameplayQuestSpec();
            this._activeAttempt = null;
            this._lockUntilStepOff(spec);
            Manager.Stack.pop();
            this._restoreStageMusic();

            if (!spec.tutorial) {
                this._tutorialReturnCycles++;
                if (this._tutorialReturnCycles >= 3) {
                    this._tutorialReturnCycles = 0;
                    this._sendBackToFirstFloor();
                } else {
                    this._sendBackToHarderTutorial();
                }
            }

            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_class_wires_harder', {
                    spec: spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || 5,
                    result: result,
                });
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return result;
        },

        _sendBackToHarderTutorial() {
            const tutorialSpec = this._tutorialQuestSpec();
            const qm = IP2Live.QuestManager;
            if (qm) {
                qm.completedObjectives[tutorialSpec.id] = {};
                const specs = this._questSpecs();
                for (let i = 0; i < specs.length; i++) {
                    if (specs[i] && !specs[i].tutorial) {
                        qm.completedObjectives[specs[i].id] = {};
                    }
                }
                qm.startQuest(tutorialSpec.id, {
                    mapId: 5,
                    mapQuestMode: true,
                    keepLastCompletion: true,
                    visible: true,
                    preview: false,
                    guideActive: true,
                    allowCompletion: true,
                });
            }
            if (IP2Live.IPWiresHarderTutorial && typeof IP2Live.IPWiresHarderTutorial.showReturnToTutorial === 'function') {
                setTimeout(() => IP2Live.IPWiresHarderTutorial.showReturnToTutorial(), 220);
            }
        },

        _sendBackToFirstFloor() {
            const route = () => {
                if (IP2Live.GameManager && typeof IP2Live.GameManager.startMapFlow === 'function') {
                    IP2Live.GameManager.startMapFlow(3, { x: 6, y: 0, z: 17 }, {
                        mode: 'stage',
                        status: 'Returning to first floor',
                        detail: 'Relearning core lever wiring',
                    });
                } else if (IP2Live.MapManager && typeof IP2Live.MapManager.goTo === 'function') {
                    IP2Live.MapManager.goTo(3, { spawn: { x: 6, y: 0, z: 17 } });
                }
            };

            if (IP2Live.IPWiresHarderTutorial && typeof IP2Live.IPWiresHarderTutorial.showEliteEscalation === 'function') {
                setTimeout(() => {
                    IP2Live.IPWiresHarderTutorial.showEliteEscalation(route);
                }, 220);
                return;
            }
            route();
        },
    };

    IP2Live.HarderWiresGameplayManager = HarderWiresGameplayManager;
    window.IP2LiveHarderWiresGameplayManager = HarderWiresGameplayManager;
    console.log('[IP2Live] ip_wires_gameplay_harder.js module loaded.');
}());
