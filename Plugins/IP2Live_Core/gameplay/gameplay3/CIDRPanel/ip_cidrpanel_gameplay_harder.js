/**
 * IP2Live - Gameplay 3 CIDR Panel Harder Mode
 *
 * Stage 2 Levels 3-4 adaptive CIDR panel. A wrong binary mask or CIDR prefix
 * rotates the target before the player may try again.
 */

(function () {
    const BaseScreen = IP2Live.CIDRPanelGameplayScreen;
    if (!BaseScreen) {
        console.warn('[IP2Live] CIDR harder gameplay requires ip_cidrpanel_gameplay.js first.');
        return;
    }

    class IP2LiveCIDRPanelHarderGameplayScreen extends BaseScreen {
        constructor(options) {
            super(Object.assign({}, options || {}, {
                gameplayId: 'ip_cidr_binary_panel_harder',
                tutorialMode: false,
                guidedTutorial: false,
            }));
        }

        _configure() {
            super._configure();
            this.gameplayId = 'ip_cidr_binary_panel_harder';
            this.harderMode = true;
            this.initialTargetMask = this.targetMask;
            this.adaptiveRerollCount = 0;
            this.adaptiveFailureKind = null;
            this.lastAdaptiveRekey = null;
            this.statusText = 'ADAPTIVE LOCK ACTIVE. ANY ERROR ROTATES THE TARGET MASK.';
        }

        _adaptiveCIDRRange() {
            const configuredMin = Number(this.options && this.options.adaptiveMinCIDR);
            const configuredMax = Number(this.options && this.options.adaptiveMaxCIDR);
            const min = Number.isInteger(configuredMin) ? Math.max(1, Math.min(30, configuredMin)) : 25;
            const max = Number.isInteger(configuredMax) ? Math.max(min, Math.min(31, configuredMax)) : 31;
            return { min, max };
        }

        _randomAdaptiveTargetMask(excludedMask) {
            if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
            if (!IP2Live.CIDRGameplayState.generatedMasks) IP2Live.CIDRGameplayState.generatedMasks = {};
            const range = this._adaptiveCIDRRange();
            const excluded = String(excludedMask || this.targetMask || '');
            const fresh = [];
            const reusable = [];

            for (let cidr = range.min; cidr <= range.max; cidr++) {
                const mask = this._cidrToMask(cidr);
                if (!mask || mask === excluded) continue;
                reusable.push(mask);
                if (!IP2Live.CIDRGameplayState.generatedMasks[mask]) fresh.push(mask);
            }

            const pool = fresh.length ? fresh : reusable;
            if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
            return this._randomUniqueTargetMask();
        }

        _applyAdaptiveTargetMask(mask) {
            const parsed = this._parseMask(mask);
            if (!parsed) return false;
            this.targetMask = parsed.join('.');
            this.targetOctets = parsed;
            this.targetBits = this._octetsToBits(this.targetOctets);
            this.targetCIDR = this._maskToCIDR(this.targetBits);
            this.targetClass = this._classForCIDR(this.targetCIDR);
            if (!IP2Live.CIDRGameplayState) IP2Live.CIDRGameplayState = {};
            if (!IP2Live.CIDRGameplayState.generatedMasks) IP2Live.CIDRGameplayState.generatedMasks = {};
            IP2Live.CIDRGameplayState.lastGeneratedMask = this.targetMask;
            IP2Live.CIDRGameplayState.generatedMasks[this.targetMask] = true;
            return true;
        }

        _adaptiveRekey(reason) {
            const previousMask = this.targetMask;
            const previousCIDR = this.targetCIDR;
            this._applyAdaptiveTargetMask(this._randomAdaptiveTargetMask(previousMask));
            this.adaptiveRerollCount++;
            this.lastAdaptiveRekey = {
                reason: reason || 'wrong_answer',
                previousMask,
                previousCIDR,
                nextMask: this.targetMask,
                nextCIDR: this.targetCIDR,
                sequence: this.adaptiveRerollCount,
                mapId: Number(this.options && this.options.mapId) || 9,
            };
            this._resetBulbs();
            this.iconUnlocked = false;
            this.iconAnim = null;
            this.miniWidgetVisible = false;
            this.statusText = 'APEX RE-KEY COMPLETE. MATCH NEW TARGET: ' + this.targetMask;
            return Object.assign({}, this.lastAdaptiveRekey);
        }

        _evaluateConfirmResult() {
            const failuresBefore = this.maskFailures;
            super._evaluateConfirmResult();
            if (this.maskFailures <= failuresBefore) return;
            this.adaptiveFailureKind = 'mask';
            this.statusText = 'MASK REJECTED. APEX IS RANDOMIZING A NEW TARGET.';
        }

        _verifyCIDRInput() {
            const failuresBefore = this.cidrFailures;
            super._verifyCIDRInput();
            if (this.cidrFailures <= failuresBefore || this.finished || this.phase === 'icon_popup') return;
            this.adaptiveFailureKind = 'cidr';
            this.statusText = 'CIDR REJECTED. APEX IS RANDOMIZING A NEW TARGET.';
            this.phase = 'fail';
            this.phaseTimer = 34;
            this.failResetQueued = false;
            this.failCorrectionActive = false;
            this.failJitter = 34;
            for (let r = 0; r < this.totalRows; r++) this.rowErrorGlow[r] = 75;
            this._emitFailureSparks();
        }

        _resolveFailureReset() {
            if (this.failCorrectionActive) return;
            this.failCorrectionActive = true;
            const rekey = this._adaptiveRekey(this.adaptiveFailureKind || 'wrong_answer');
            const resume = () => {
                if (this.phase !== 'fail') return;
                this.phase = 'build';
                this.phaseTimer = 0;
                this.failReason = '';
                this.failResetQueued = false;
                this.failCorrectionActive = false;
                this.adaptiveFailureKind = null;
                this.postCorrectionInputLockTicks = 10;
            };
            const tutorial = IP2Live.IPCIDRPanelHarderTutorial;
            if (tutorial && typeof tutorial.showAdaptiveRekey === 'function') {
                const started = tutorial.showAdaptiveRekey(rekey, resume);
                if (!started) resume();
            } else {
                resume();
            }
        }

        _reportCIDRMistake(mistake) {
            if (!IP2Live.GameManager || typeof IP2Live.GameManager.handleGameplayMistake !== 'function') return false;
            IP2Live.GameManager.handleGameplayMistake('ip_cidr_binary_panel_harder', {
                gameplayId: 'ip_cidr_binary_panel_harder',
                mapId: this.options.mapId || 9,
                questId: this.options.questId,
                objectiveId: this.options.objectiveId,
                mistakes: [mistake],
                attemptsRemaining: 0,
            });
            return true;
        }

        _saveCIDRState(enteredCIDRText) {
            super._saveCIDRState(enteredCIDRText);
            const metadata = {
                gameplayId: 'ip_cidr_binary_panel_harder',
                harderMode: true,
                adaptiveRerollCount: this.adaptiveRerollCount,
                initialMask: this.initialTargetMask,
                lastAdaptiveRekey: this.lastAdaptiveRekey ? Object.assign({}, this.lastAdaptiveRekey) : null,
            };
            const stateStore = IP2Live.CIDRGameplayState || {};
            if (stateStore.latest) Object.assign(stateStore.latest, metadata);
            const handoffKey = this.options && this.options.handoffKey ? String(this.options.handoffKey) : null;
            if (handoffKey && stateStore.handoffs && stateStore.handoffs[handoffKey]) {
                Object.assign(stateStore.handoffs[handoffKey], metadata);
            }
            if (this.lastResult) Object.assign(this.lastResult, metadata);
        }

        _drawHeader(ctx, m) {
            super._drawHeader(ctx, m);
            const x = m.panelX + m.panelW - 310 * m.sX;
            const y = m.panelY + 12 * m.sY;
            const w = 282 * m.sX;
            const h = 18 * m.sY;
            ctx.save();
            ctx.fillStyle = 'rgba(181,0,50,0.96)';
            this._fillChamferRect(ctx, x, y, w, h, 5 * m.sX);
            ctx.strokeStyle = '#FFE600';
            ctx.lineWidth = 1.2 * m.sX;
            this._strokeChamferRect(ctx, x, y, w, h, 5 * m.sX);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold ' + (7.1 * m.sY).toFixed(1) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SYS::CIDR_ADAPTIVE_REKEY // ERROR ROTATES MASK', x + w * 0.5, y + h * 0.54);
            ctx.restore();
        }
    }

    const CIDRPanelHarderGameplayManager = {
        VERSION: 'ip-cidrpanel-harder-gameplay-manager-20260816-02',
        _active: false,
        _activeAttempt: null,
        _introShownMaps: {},
        _registeredQuestIds: {},
        _triggerLocks: {},

        HARDER_QUESTS: [
            { id: 'stage.9.cidr_chain.01', label: 'Adaptive CIDR Chain 01', handoffKey: 'stage9-cidr-chain-01', mapId: 9, targetClass: 'C', randomizeTarget: true, harderIntro: true, objectives: [
                { gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_chain_01_panel', title: 'BREACH ADAPTIVE CIDR PANEL 01', label: 'Adaptive CIDR Panel 01', targetTile: { x: 5, y: 0, z: 28 } },
                { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_harder_cidr_chain_01_subnet', title: 'SOLVE SUBNET SIMULATOR 01', label: 'Subnet Simulator 01', targetTile: { x: 7, y: 0, z: 28 } },
            ] },
            { id: 'stage.9.cidr_chain.02', label: 'Adaptive CIDR Chain 02', handoffKey: 'stage9-cidr-chain-02', mapId: 9, targetClass: 'C', randomizeTarget: true, objectives: [
                { gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_chain_02_panel', title: 'BREACH ADAPTIVE CIDR PANEL 02', label: 'Adaptive CIDR Panel 02', targetTile: { x: 12, y: 0, z: 30 } },
                { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_harder_cidr_chain_02_subnet', title: 'SOLVE SUBNET SIMULATOR 02', label: 'Subnet Simulator 02', targetTile: { x: 12, y: 0, z: 28 } },
            ] },
            { id: 'stage.9.cidr_chain.03', label: 'Adaptive CIDR Chain 03', handoffKey: 'stage9-cidr-chain-03', mapId: 9, targetClass: 'C', randomizeTarget: true, objectives: [
                { gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_chain_03_panel', title: 'BREACH ADAPTIVE CIDR PANEL 03', label: 'Adaptive CIDR Panel 03', targetTile: { x: 24, y: 0, z: 28 } },
                { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_harder_cidr_chain_03_subnet', title: 'SOLVE SUBNET SIMULATOR 03', label: 'Subnet Simulator 03', targetTile: { x: 26, y: 0, z: 28 } },
            ] },
            { id: 'stage.9.cidr_chain.04', label: 'Adaptive CIDR Chain 04', handoffKey: 'stage9-cidr-chain-04', mapId: 9, targetClass: 'C', randomizeTarget: true, objectives: [
                { gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_chain_04_panel', title: 'BREACH ADAPTIVE CIDR PANEL 04', label: 'Adaptive CIDR Panel 04', targetTile: { x: 8, y: 0, z: 18 } },
                { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_harder_cidr_chain_04_subnet', title: 'SOLVE SUBNET SIMULATOR 04', label: 'Subnet Simulator 04', targetTile: { x: 10, y: 0, z: 18 } },
            ] },
            { id: 'stage.9.cidr_chain.05', label: 'Adaptive CIDR Chain 05', handoffKey: 'stage9-cidr-chain-05', mapId: 9, targetClass: 'C', randomizeTarget: true, objectives: [
                { gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_chain_05_panel', title: 'BREACH ADAPTIVE CIDR PANEL 05', label: 'Adaptive CIDR Panel 05', targetTile: { x: 22, y: 0, z: 18 } },
                { gameplayId: 'ip_subnet_simulator', objectiveId: 'solve_harder_cidr_chain_05_subnet', title: 'SOLVE SUBNET SIMULATOR 05', label: 'Subnet Simulator 05', targetTile: { x: 24, y: 0, z: 18 } },
            ] },
            { id: 'stage.10.ip_cidr_harder.01', gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_panel_01', title: 'BREACH ADAPTIVE CIDR PANEL 01', label: 'Adaptive CIDR Panel 01', mapId: 10, targetClass: 'C', randomizeTarget: true, harderIntro: true, targetTile: { x: 4, y: 0, z: 28 } },
            { id: 'stage.10.ip_cidr_harder.02', gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_panel_02', title: 'BREACH ADAPTIVE CIDR PANEL 02', label: 'Adaptive CIDR Panel 02', mapId: 10, targetClass: 'C', randomizeTarget: true, targetTile: { x: 10, y: 0, z: 30 } },
            { id: 'stage.10.ip_cidr_harder.03', gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_panel_03', title: 'BREACH ADAPTIVE CIDR PANEL 03', label: 'Adaptive CIDR Panel 03', mapId: 10, targetClass: 'C', randomizeTarget: true, targetTile: { x: 18, y: 0, z: 27 } },
            { id: 'stage.10.ip_cidr_harder.04', gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_panel_04', title: 'BREACH ADAPTIVE CIDR PANEL 04', label: 'Adaptive CIDR Panel 04', mapId: 10, targetClass: 'C', randomizeTarget: true, targetTile: { x: 27, y: 0, z: 30 } },
            { id: 'stage.10.ip_cidr_harder.05', gameplayId: 'ip_cidr_binary_panel_harder', objectiveId: 'solve_harder_cidr_panel_05', title: 'BREACH ADAPTIVE CIDR PANEL 05', label: 'Adaptive CIDR Panel 05', mapId: 10, targetClass: 'C', randomizeTarget: true, targetTile: { x: 31, y: 0, z: 21 } },
        ],

        _questSpecs() {
            if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
                const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_cidr_binary_panel_harder');
                if (Array.isArray(specs) && specs.length) return specs;
            }
            return this.HARDER_QUESTS;
        },

        _defaultQuestSpec() {
            const chain = this._questSpecs()[0] || this.HARDER_QUESTS[0];
            const objective = chain && Array.isArray(chain.objectives) ? chain.objectives[0] : null;
            return objective ? Object.assign({}, chain, objective, { id: chain.id }) : chain;
        },

        _isFirstPanel(options) {
            const opts = options || {};
            const spec = opts.spec || {};
            return !!spec.harderIntro;
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

        _handleCIDRObjective(spec, context, questManager) {
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
            const mapId = Number(context && context.mapId) || Number(spec.mapId) || 9;
            const launchOptions = {
                spec,
                questId: spec.id,
                objectiveId: spec.objectiveId,
                mapId,
                targetMask: spec.targetMask,
                targetClass: spec.targetClass || 'C',
                randomizeTarget: spec.randomizeTarget !== false,
                handoffKey: spec.handoffKey,
                _fromObjective: true,
            };
            if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
                IP2Live.GameManager.startGameplayNode('ip_cidr_binary_panel_harder', Object.assign({}, launchOptions, {
                    showIntro: this._isFirstPanel(launchOptions) && !this._introShownMaps[mapId],
                    _reservedAttempt: attemptKey,
                }));
                return false;
            }
            this.launchHarderCIDRGameplay(Object.assign({}, launchOptions, { mode: 'replace' }));
            return false;
        },

        registerStageGameplayQuests(questManager, mapManager, stage) {
            const qm = questManager || IP2Live.QuestManager;
            const stageId = Number(stage && stage.id);
            if (!qm || (stageId !== 9 && stageId !== 10) || typeof qm.registerQuest !== 'function') return [];
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
                        detail: 'TARGET TILE  X:' + target.x + '  Y:' + (target.y || 0) + '  Z:' + target.z,
                        targetTile: target,
                        completionRadiusTiles: 0.55,
                        isComplete: (context, activeQuestManager) => {
                            if (objectiveSpec.gameplayId === 'ip_subnet_simulator') {
                                const simulator = IP2Live.SubnetSimulatorGameplayManager;
                                return simulator && typeof simulator._handleObjective === 'function'
                                    ? simulator._handleObjective(merged, context, activeQuestManager)
                                    : false;
                            }
                            return CIDRPanelHarderGameplayManager._handleCIDRObjective(merged, context, activeQuestManager);
                        },
                    };
                });
                qm.registerQuest({ id: questSpec.id, title: 'QUEST AREA', stageMapId: stageId, resetOnMapEnter: true, objectives });
                this._registeredQuestIds[questSpec.id] = true;
            }
            return questIds;
        },

        launchHarderCIDRGameplay(options) {
            const opts = options || {};
            if (IP2Live.QuestMinimap) {
                if (!IP2Live.QuestMinimap.isActive()) IP2Live.QuestMinimap.create();
                else IP2Live.QuestMinimap.update();
            }
            const spec = opts.spec || this._defaultQuestSpec();
            const attemptKey = this._resolveAttemptKey({ spec, questId: opts.questId, objectiveId: opts.objectiveId });
            const isReservedAttempt = !!(opts._reservedAttempt && opts._reservedAttempt === attemptKey);
            if (this._active) return false;
            if (this._activeAttempt === attemptKey && !isReservedAttempt && opts.questId) return false;
            this._active = true;
            this._activeAttempt = attemptKey;
            const mapId = Number(opts.mapId || spec.mapId) || 9;
            const shouldShowIntro = opts.showIntro !== false && !this._introShownMaps[mapId];
            if (shouldShowIntro) this._introShownMaps[mapId] = true;

            const open = () => {
                const screen = new IP2LiveCIDRPanelHarderGameplayScreen({
                    targetMask: opts.targetMask || spec.targetMask,
                    targetClass: opts.targetClass || spec.targetClass || 'C',
                    randomizeTarget: opts.randomizeTarget !== false,
                    handoffKey: opts.handoffKey || spec.handoffKey,
                    adaptiveMinCIDR: opts.adaptiveMinCIDR,
                    adaptiveMaxCIDR: opts.adaptiveMaxCIDR,
                    mapId,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    onComplete: (result) => this._onComplete(opts, result),
                    onCancel: () => this._onCancel(opts),
                });
                const openGameplay = () => {
                    this._playMusicZone('GAMEPLAY_1');
                    if (Manager && Manager.Stack && typeof Manager.Stack.replace === 'function') Manager.Stack.replace(screen);
                    else if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') Manager.Stack.push(screen);
                };
                if (opts.useLoading !== false && this._showLoadingScreen2({
                    mode: 'push',
                    status: 'Loading Harder Gameplay',
                    detail: 'Opening Adaptive CIDR Panel',
                    onComplete: openGameplay,
                })) return;
                openGameplay();
            };

            const openSafely = () => {
                try { open(); }
                catch (e) {
                    this._active = false;
                    this._activeAttempt = null;
                    console.warn('[IP2Live] CIDRPanelHarderGameplayManager failed to open gameplay:', e);
                }
            };
            const tutorial = IP2Live.IPCIDRPanelHarderTutorial;
            if (shouldShowIntro && tutorial && typeof tutorial.showIntro === 'function') {
                tutorial.showIntro({ mapId, level: mapId === 10 ? 4 : 3 }, openSafely);
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
                    opts.questId && opts.objectiveId && IP2Live.QuestManager &&
                    IP2Live.QuestManager.activeQuestId === opts.questId &&
                    IP2Live.QuestManager.activeObjectiveId === opts.objectiveId
                ) IP2Live.QuestManager.completeObjective(opts.objectiveId);
                if (typeof opts.onComplete === 'function') opts.onComplete(result);
                if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
                    IP2Live.GameManager.handleGameplayCompleted('ip_cidr_binary_panel_harder', {
                        gameplayId: 'ip_cidr_binary_panel_harder', spec,
                        questId: opts.questId || spec.id,
                        objectiveId: opts.objectiveId || spec.objectiveId,
                        mapId: opts.mapId || spec.mapId || 9, result,
                    });
                }
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            };
            if (!this._showLoadingScreen2({ mode: 'replace', status: 'Loading Stage', detail: 'Returning to adaptive CIDR sector', onComplete: finalizeExit })) finalizeExit();
        },

        _onCancel(options) {
            const opts = options || {};
            const spec = opts.spec || this._defaultQuestSpec();
            this._active = false;
            this._activeAttempt = null;
            this._lockUntilStepOff(spec);
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this._restoreStageMusic();
            if (typeof opts.onCancel === 'function') opts.onCancel();
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
                IP2Live.GameManager.handleGameplayCancelled('ip_cidr_binary_panel_harder', {
                    gameplayId: 'ip_cidr_binary_panel_harder', spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || spec.mapId || 9,
                    result: { cancelled: true },
                });
            }
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

        _playMusicZone(zoneName) {
            const music = IP2Live.MusicManager;
            if (!music || !music.ZONE || !music.ZONE[zoneName] || typeof music.play !== 'function') return false;
            music.play(music.ZONE[zoneName]);
            return true;
        },

        _restoreStageMusic() {
            return this._playMusicZone('STAGE_1');
        },
    };

    IP2Live.CIDRPanelHarderGameplayScreen = IP2LiveCIDRPanelHarderGameplayScreen;
    IP2Live.CIDRPanelHarderGameplayManager = CIDRPanelHarderGameplayManager;
    window.IP2LiveCIDRPanelHarderGameplayScreen = IP2LiveCIDRPanelHarderGameplayScreen;
    window.IP2LiveCIDRPanelHarderGameplayManager = CIDRPanelHarderGameplayManager;
    console.log('[IP2Live] ip_cidrpanel_gameplay_harder.js module loaded.');
}());
