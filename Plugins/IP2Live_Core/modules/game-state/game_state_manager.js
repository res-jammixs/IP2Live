/**
 * IP2Live - Game State Manager
 *
 * Small runtime state layer for ambience/gameplay conditions that need to
 * react to map flow, quest progress, and performance.
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

(function () {
    const STAGE_ONE_LEVEL_ONE_MAP_ID = 3;
    const STAGE_ONE_LEVEL_TWO_MAP_ID = 4;
    const DARKLIGHTS_KEY = 'darklights';
    const SECURITY_LIGHT_KEY = 'securityLight';
    const SECURITY_FAILURE_LIMIT = 5;

    const DARKLIGHTS_CONFIGS = {
        3: {
            mapId: 3,
            name: 'Stage 1 Level 1',
            baselineBrightnessStep: 1,
            gameplayIds: ['ip_class_wires'],
            objectives: [
                'repair_ip_wires_01',
                'repair_ip_wires_02',
                'repair_ip_wires_03',
                'repair_ip_wires_04',
            ],
            quests: [
                { questId: 'stage.3.ip_wires.01.tutorial', objectiveId: 'repair_ip_wires_01' },
                { questId: 'stage.3.ip_wires.02', objectiveId: 'repair_ip_wires_02' },
                { questId: 'stage.3.ip_wires.03', objectiveId: 'repair_ip_wires_03' },
                { questId: 'stage.3.ip_wires.04', objectiveId: 'repair_ip_wires_04' },
            ],
            entryReason: 'stage-one-entry',
            successReason: 'stage-one-wire-success',
            clearReason: 'stage-one-levers-cleared',
        },
        4: {
            mapId: 4,
            name: 'Stage 1 Level 2',
            baselineBrightnessStep: 1,
            gameplayIds: ['ip_class_wires'],
            objectives: [
                'repair_stage4_ip_wires_01',
                'repair_stage4_ip_wires_02',
                'repair_stage4_ip_wires_04',
                'repair_stage4_ip_wires_05',
                'repair_stage4_ip_wires_07',
            ],
            quests: [
                { questId: 'stage.4.mixed.01.ip_wires', objectiveId: 'repair_stage4_ip_wires_01' },
                { questId: 'stage.4.mixed.02.ip_wires', objectiveId: 'repair_stage4_ip_wires_02' },
                { questId: 'stage.4.mixed.04.ip_wires', objectiveId: 'repair_stage4_ip_wires_04' },
                { questId: 'stage.4.mixed.05.ip_wires', objectiveId: 'repair_stage4_ip_wires_05' },
                { questId: 'stage.4.mixed.07.ip_wires', objectiveId: 'repair_stage4_ip_wires_07' },
            ],
            entryReason: 'stage-one-level-two-entry',
            successReason: 'stage-one-level-two-wire-success',
            clearReason: 'stage-one-level-two-wires-cleared',
        },
        5: {
            mapId: 5,
            name: 'Stage 1 Level 3',
            baselineBrightnessStep: 1,
            gameplayIds: ['ip_class_wires', 'ip_class_wires_harder'],
            objectives: [
                'repair_ip_wires_harder_01_tutorial',
                'repair_ip_wires_harder_02',
                'repair_ip_wires_harder_03',
                'repair_ip_wires_harder_04',
            ],
            quests: [
                { questId: 'stage.5.ip_wires_harder.01.tutorial', objectiveId: 'repair_ip_wires_harder_01_tutorial' },
                { questId: 'stage.5.ip_wires_harder.02', objectiveId: 'repair_ip_wires_harder_02' },
                { questId: 'stage.5.ip_wires_harder.03', objectiveId: 'repair_ip_wires_harder_03' },
                { questId: 'stage.5.ip_wires_harder.04', objectiveId: 'repair_ip_wires_harder_04' },
            ],
            entryReason: 'stage-one-level-three-entry',
            successReason: 'stage-one-level-three-wire-success',
            clearReason: 'stage-one-level-three-wires-cleared',
        },
    };

    const GameStateManager = {
        VERSION: 'game-state-manager-20260821-05',
        states: {},
        activeStates: {},
        _boundGameManager: null,
        _unsubscribers: [],
        _fallbackStore: {},
        _sceneHooksInstalled: false,

        registerState(name, definition) {
            const key = String(name || '').trim();
            if (!key || !definition) return false;
            this.states[key] = definition;
            return true;
        },

        activate(stateName, options) {
            const key = String(stateName || '').trim();
            const state = this.states[key];
            if (!key || !state) return false;
            this.activeStates[key] = true;
            if (key === DARKLIGHTS_KEY && options && options.mapId) {
                this._setActiveDarklightsMapId(options.mapId);
            }
            if (typeof state.activate === 'function') {
                state.activate(this, options || {});
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        clear(stateName, options) {
            const key = String(stateName || '').trim();
            const state = this.states[key];
            if (!key || !state) return false;
            delete this.activeStates[key];
            if (typeof state.clear === 'function') {
                state.clear(this, options || {});
            }
            if (key === DARKLIGHTS_KEY) {
                this._setActiveDarklightsMapId(null);
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        update(scene) {
            const keys = Object.keys(this.activeStates || {});
            for (let i = 0; i < keys.length; i++) {
                const state = this.states[keys[i]];
                if (!state || typeof state.update !== 'function') continue;
                state.update(this, scene || this._currentScene());
            }
        },

        drawHUD(ctx, scene) {
            const keys = Object.keys(this.activeStates || {});
            for (let i = 0; i < keys.length; i++) {
                const state = this.states[keys[i]];
                if (!state || typeof state.drawHUD !== 'function') continue;
                state.drawHUD(ctx, this, scene || this._currentScene());
            }
        },

        /**
         * Queue persistent ambience/gameplay state for a restored Scene.Map.
         * RPG Paper Maker builds maps asynchronously, so applying lighting in
         * the constructor would run before the native lights and fog exist.
         */
        queueMapStateRestore(scene, mapId, options) {
            const targetScene = scene || this._currentScene();
            const resolvedMapId = Number(mapId) || this._currentMapId();
            if (!targetScene || !resolvedMapId) return false;
            targetScene._ip2livePendingGameStateRestore = Object.assign({}, options || {}, {
                mapId: resolvedMapId,
                queuedAt: Date.now(),
                restoreFromSave: true,
                preservePersistentState: true,
            });
            return true;
        },

        _restoreQueuedMapState(scene) {
            const targetScene = scene || this._currentScene();
            const pending = targetScene && targetScene._ip2livePendingGameStateRestore;
            if (!targetScene || !pending) return false;
            if (targetScene.loading === true) return false;

            const mapId = Number(pending.mapId) || this._currentMapId();
            const sceneMapId = Number(
                targetScene.id ||
                targetScene.mapID ||
                (targetScene.currentMap && targetScene.currentMap.id) ||
                0
            ) || mapId;
            if (!mapId || (sceneMapId && sceneMapId !== mapId)) {
                delete targetScene._ip2livePendingGameStateRestore;
                return false;
            }

            delete targetScene._ip2livePendingGameStateRestore;
            const restored = this.restoreMapState(mapId, targetScene, pending);
            targetScene._ip2liveGameStateRestoreApplied = {
                mapId,
                restoredAt: Date.now(),
                restored: !!restored,
            };
            return restored;
        },

        /** Rebuild transient runtime effects from the durable per-game store. */
        restoreMapState(mapId, scene, options) {
            const resolvedMapId = Number(mapId) || this._currentMapId();
            if (!resolvedMapId) return false;
            const context = Object.assign({}, options || {}, {
                restoreFromSave: true,
                preservePersistentState: true,
            });

            this._onMapEntered({
                mapId: resolvedMapId,
                scene: scene || this._currentScene(),
                context,
            });

            // activeStates is process-local and is deliberately not serialized.
            // Reconcile the security overlay from its durable record as well.
            if (resolvedMapId === STAGE_ONE_LEVEL_TWO_MAP_ID) {
                const security = this._securityStore(resolvedMapId);
                if (security.triggered && this.states[SECURITY_LIGHT_KEY]) {
                    this.activate(SECURITY_LIGHT_KEY, {
                        mapId: resolvedMapId,
                        strikeCount: Number(security.strikes) || 0,
                        failedQuestId: security.lastQuestId || null,
                        restoredFromSave: true,
                    });
                } else if (this.activeStates[SECURITY_LIGHT_KEY] && this.states[SECURITY_LIGHT_KEY]) {
                    this.clear(SECURITY_LIGHT_KEY, { restoredFromSave: true });
                }
            } else if (this.activeStates[SECURITY_LIGHT_KEY] && this.states[SECURITY_LIGHT_KEY]) {
                this.clear(SECURITY_LIGHT_KEY, { restoredFromSave: true });
            }

            const lighting = IP2Live.LightingManager;
            if (lighting && typeof lighting.refresh === 'function') {
                lighting.refresh(scene || this._currentScene());
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        installSceneHooks() {
            if (this._sceneHooksInstalled || !Scene || !Scene.Map || !Scene.Map.prototype) return false;
            this._sceneHooksInstalled = true;
            const manager = this;
            const originalUpdate = Scene.Map.prototype.update;
            Scene.Map.prototype.update = function () {
                if (typeof originalUpdate === 'function') originalUpdate.call(this);
                manager._restoreQueuedMapState(this);
                manager.update(this);
            };

            const originalDrawHUD = Scene.Map.prototype.drawHUD;
            Scene.Map.prototype.drawHUD = function () {
                if (typeof originalDrawHUD === 'function') originalDrawHUD.call(this);
                manager.drawHUD(Common && Common.Platform ? Common.Platform.ctx : null, this);
            };
            return true;
        },

        recordTutorialReturn(reason, mapId) {
            const config = this._darklightsConfigForMap(mapId || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;
            return this.recordDarklightsRollback(
                reason || 'tutorial-return',
                config.mapId,
                config.objectives && config.objectives[0]
            );
        },

        recordDarklightsRollback(reason, mapId, objectiveId) {
            const config = this._darklightsConfigForMap(mapId || this._currentMapId() || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;

            const store = this._darklightsStore(config.mapId);
            store.cleared = false;
            store.progressInitialized = true;
            this._setBrightnessStep(store, store.brightnessStep - 1, reason || 'gameplay-rollback', config);
            if (objectiveId && store.completedObjectives) delete store.completedObjectives[String(objectiveId)];
            store.lastReason = reason || 'gameplay-rollback';
            this._syncStore();
            if (this._currentMapId() === config.mapId) {
                this._activateDarklights(config, {
                    scene: this._currentScene(),
                    reason: store.lastReason,
                });
            }
            return store;
        },

        resetDarklightsProgress(mapId, reason) {
            const config = this._darklightsConfigForMap(mapId || this._currentMapId() || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;

            const root = this._darklightsRoot();
            const store = this._newDarklightsStore(config.mapId);
            store.lastReason = reason || 'darklights-progress-reset';
            root.maps[String(config.mapId)] = store;
            if (config.mapId === STAGE_ONE_LEVEL_ONE_MAP_ID) this._mirrorLegacyDarklightsRoot(root, store);
            this._syncStore();
            if (this._currentMapId() === config.mapId) {
                this._setBrightnessStep(store, config.baselineBrightnessStep, config.entryReason, config);
                store.progressInitialized = true;
                this._activateDarklights(config, {
                    scene: this._currentScene(),
                    reason: store.lastReason,
                });
            }
            return store;
        },

        recordSecurityFailure(mapId, payload) {
            const resolvedMapId = Number(mapId) || STAGE_ONE_LEVEL_TWO_MAP_ID;
            const store = this._securityStore(resolvedMapId);
            store.strikes = Math.max(0, Number(store.strikes) || 0) + 1;
            store.lastFailureAt = Date.now();
            store.lastQuestId = payload && payload.questId ? payload.questId : null;
            store.triggered = store.strikes >= SECURITY_FAILURE_LIMIT;
            this._syncStore();
            return store;
        },

        resetSecurityState(mapId) {
            const resolvedMapId = Number(mapId) || STAGE_ONE_LEVEL_TWO_MAP_ID;
            const root = this._securityRoot();
            root.maps[String(resolvedMapId)] = {
                mapId: resolvedMapId,
                strikes: 0,
                triggered: false,
                lastFailureAt: null,
                lastQuestId: null,
            };
            this._syncStore();
            return root.maps[String(resolvedMapId)];
        },

        resetDarklights(mapId) {
            const config = this._darklightsConfigForMap(mapId || this._activeDarklightsMapId() || this._currentMapId() || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;

            const store = this._darklightsStore(config.mapId);
            this._setBrightnessStep(store, this._maxBrightnessStep(config), config.clearReason, config);
            store.cleared = true;
            store.completedObjectives = {};
            store.progressInitialized = true;
            store.lastReason = config.clearReason;
            this._syncStore();
            this.clear(DARKLIGHTS_KEY, { fullRestore: true, mapId: config.mapId });
            return store;
        },

        bindGameManager(gameManager) {
            const gm = gameManager || IP2Live.GameManager;
            if (!gm || typeof gm.on !== 'function') return false;
            if (this._boundGameManager === gm) return true;

            this._unbindGameManager();
            this._boundGameManager = gm;

            const events = gm.EVENT || {};
            this._unsubscribers.push(gm.on(events.MAP_ENTERED || 'map.entered', (payload) => this._onMapEntered(payload)));
            this._unsubscribers.push(gm.on(events.GAMEPLAY_FAILED || 'gameplay.failed', (payload) => this._onGameplayFailed(payload)));
            this._unsubscribers.push(gm.on(events.GAMEPLAY_COMPLETED || 'gameplay.completed', (payload) => this._onGameplayCompleted(payload)));
            this._unsubscribers.push(gm.on(events.QUEST_OBJECTIVE_COMPLETED || 'quest.objectiveCompleted', (payload) => this._onQuestObjectiveCompleted(payload)));
            return true;
        },

        _unbindGameManager() {
            for (let i = 0; i < this._unsubscribers.length; i++) {
                try {
                    if (typeof this._unsubscribers[i] === 'function') this._unsubscribers[i]();
                } catch (e) {
                    console.warn('[IP2Live] GameStateManager unbind failed:', e);
                }
            }
            this._unsubscribers = [];
            this._boundGameManager = null;
        },

        _onMapEntered(payload) {
            const data = payload || {};
            const mapId = Number(data.mapId) || this._currentMapId();
            const context = data.context || {};
            const config = this._darklightsConfigForMap(mapId);

            if (mapId !== STAGE_ONE_LEVEL_TWO_MAP_ID && !context.preservePersistentState) {
                this.resetSecurityState(STAGE_ONE_LEVEL_TWO_MAP_ID);
            }

            if (config && context.darklightsReturn) {
                this.recordTutorialReturn(context.source || 'map-flow-return', config.mapId);
                return;
            }

            if (config) {
                const store = this._darklightsStore(config.mapId);
                if (store.cleared || this._darklightsObjectivesComplete(config.mapId)) {
                    if (context.preservePersistentState) {
                        // A completed saved level should load with full light,
                        // but loading it must not erase the objective evidence
                        // that made it complete.
                        this.clear(DARKLIGHTS_KEY, {
                            fullRestore: true,
                            mapId: config.mapId,
                            preservePersistentState: true,
                        });
                    } else {
                        this.resetDarklights(config.mapId);
                    }
                } else {
                    if (!store.progressInitialized && store.brightnessStep <= 0) {
                        this._setBrightnessStep(store, config.baselineBrightnessStep, config.entryReason, config);
                    }
                    if (!store.progressInitialized) store.progressInitialized = true;
                    this._syncStore();
                    this._activateDarklights(config, {
                        scene: data.scene || this._currentScene(),
                        reason: context.restoreFromSave
                            ? (store.lastReason || 'save-restore')
                            : config.entryReason,
                    });
                }
                return;
            }

            if (this.activeStates[DARKLIGHTS_KEY]) {
                const activeMapId = this._activeDarklightsMapId();
                this.clear(DARKLIGHTS_KEY, { mapId: activeMapId || mapId, temporary: true });
            }
        },

        _onGameplayFailed(payload) {
            const data = payload || {};
            if (data.gameplayId !== 'ip_class_wires') return;

            const spec = data.spec || {};
            const mapId = Number(data.mapId || spec.mapId || this._currentMapId());
            const result = data.result || {};
            if (String(result.reason || '') !== 'attempts_exhausted') return;

            if (mapId === STAGE_ONE_LEVEL_TWO_MAP_ID) {
                const rollbackTarget = this._latestCompletedDarklightsQuestBefore(
                    mapId,
                    data.questId || spec.id
                );
                data.rollbackQuestId = rollbackTarget
                    ? rollbackTarget.questId
                    : (data.questId || spec.id || null);
                data.rollbackObjectiveId = rollbackTarget
                    ? rollbackTarget.objectiveId
                    : (data.objectiveId || spec.objectiveId || null);
                data.rollbackQuestLabel = rollbackTarget ? rollbackTarget.label : (spec.label || null);
                data.darklightsDimmed = !!rollbackTarget;
                if (rollbackTarget) {
                    this.recordDarklightsRollback(
                        'stage-one-level-two-wire-failure',
                        mapId,
                        rollbackTarget.objectiveId
                    );
                }
                const security = this.recordSecurityFailure(mapId, data);
                data.securityStrikeCount = Number(security.strikes) || 0;
                if (security.triggered) {
                    data.securityTriggered = this.activate(SECURITY_LIGHT_KEY, {
                        mapId,
                        strikeCount: data.securityStrikeCount,
                        failedQuestId: data.questId || spec.id || null,
                    });
                }
                return;
            }

            if (mapId !== STAGE_ONE_LEVEL_ONE_MAP_ID || spec.tutorial) return;
            this.recordTutorialReturn('stage-one-wire-failure', STAGE_ONE_LEVEL_ONE_MAP_ID);
        },

        _onGameplayCompleted(payload) {
            const data = payload || {};
            const spec = data.spec || {};
            const mapId = Number(data.mapId || spec.mapId || this._currentMapId());
            const config = this._darklightsConfigForMap(mapId);
            if (!config || !this._darklightsGameplayMatches(config, data.gameplayId)) return;
            this._markDarklightsObjective(config.mapId, data.objectiveId || spec.objectiveId);
        },

        _onQuestObjectiveCompleted(payload) {
            const data = payload || {};
            const mapId = Number(data.mapId || this._currentMapId());
            const config = this._darklightsConfigForMap(mapId);
            if (!config) return;
            this._markDarklightsObjective(config.mapId, data.objectiveId);
        },

        _markDarklightsObjective(mapId, objectiveId) {
            const config = this._darklightsConfigForMap(mapId);
            if (!config) return false;

            const id = String(objectiveId || '');
            if (config.objectives.indexOf(id) === -1) return false;

            const store = this._darklightsStore(config.mapId);
            if (store.cleared) return true;
            if (!store.completedObjectives) store.completedObjectives = {};
            if (store.completedObjectives[id]) return true;

            store.completedObjectives[id] = true;
            this._setBrightnessStep(store, store.brightnessStep + 1, config.successReason, config);
            store.progressInitialized = true;
            store.lastReason = config.successReason;
            this._syncStore();

            if (this._darklightsObjectivesComplete(config.mapId)) {
                this.resetDarklights(config.mapId);
            } else if (this._currentMapId() === config.mapId && !store.cleared) {
                this._activateDarklights(config, {
                    scene: this._currentScene(),
                    reason: 'darklights-progress',
                });
            }
            return true;
        },

        _darklightsObjectivesComplete(mapId) {
            const config = this._darklightsConfigForMap(mapId);
            if (!config) return false;

            const store = this._darklightsStore(config.mapId);
            const done = store.completedObjectives || {};
            let trackedComplete = true;
            for (let i = 0; i < config.objectives.length; i++) {
                if (!done[config.objectives[i]]) {
                    trackedComplete = false;
                    break;
                }
            }
            if (trackedComplete) return true;

            const qm = IP2Live.QuestManager;
            const completed = qm && qm.completedObjectives ? qm.completedObjectives : null;
            if (!completed) return false;
            for (let i = 0; i < config.quests.length; i++) {
                const item = config.quests[i];
                if (!completed[item.questId] || !completed[item.questId][item.objectiveId]) return false;
            }
            return true;
        },

        _latestCompletedDarklightsQuestBefore(mapId, failedQuestId) {
            const config = this._darklightsConfigForMap(mapId);
            if (!config || !Array.isArray(config.quests) || !config.quests.length) return null;

            const failedId = String(failedQuestId || '');
            let failedIndex = config.quests.findIndex(function (item) {
                return item && item.questId === failedId;
            });
            if (failedIndex < 0) failedIndex = config.quests.length;

            const store = this._darklightsStore(config.mapId);
            const stateDone = store.completedObjectives || {};
            const qm = IP2Live.QuestManager;
            const questDone = qm && qm.completedObjectives ? qm.completedObjectives : {};

            for (let i = failedIndex - 1; i >= 0; i--) {
                const item = config.quests[i];
                if (!item || !item.questId || !item.objectiveId) continue;
                const completedInState = !!stateDone[item.objectiveId];
                const completedInQuest = !!(
                    questDone[item.questId] &&
                    questDone[item.questId][item.objectiveId]
                );
                if (completedInState || completedInQuest) {
                    return {
                        questId: item.questId,
                        objectiveId: item.objectiveId,
                        label: this._darklightsQuestLabel(item.questId),
                    };
                }
            }
            return null;
        },

        _darklightsQuestLabel(questId) {
            const gm = IP2Live.GameManager;
            const catalog = gm && gm.gameplayCatalog ? gm.gameplayCatalog : {};
            const keys = Object.keys(catalog);
            for (let i = 0; i < keys.length; i++) {
                const quests = Array.isArray(catalog[keys[i]] && catalog[keys[i]].quests)
                    ? catalog[keys[i]].quests
                    : [];
                for (let q = 0; q < quests.length; q++) {
                    if (quests[q] && quests[q].id === questId) return quests[q].label || quests[q].title || questId;
                }
            }
            return questId;
        },

        _activateDarklights(config, options) {
            if (!config) return false;
            this._setActiveDarklightsMapId(config.mapId);
            return this.activate(DARKLIGHTS_KEY, Object.assign({}, options || {}, {
                mapId: config.mapId,
            }));
        },

        _darklightsConfigForMap(mapId) {
            const id = Number(mapId) || STAGE_ONE_LEVEL_ONE_MAP_ID;
            const base = DARKLIGHTS_CONFIGS[id];
            if (!base) return null;

            const config = {
                mapId: base.mapId,
                name: base.name,
                baselineBrightnessStep: Number(base.baselineBrightnessStep) || 0,
                gameplayIds: (base.gameplayIds || []).slice(),
                objectives: (base.objectives || []).slice(),
                quests: (base.quests || []).map((item) => Object.assign({}, item)),
                entryReason: base.entryReason || 'darklights-entry',
                successReason: base.successReason || 'darklights-success',
                clearReason: base.clearReason || 'darklights-cleared',
            };

            this._augmentDarklightsConfigFromCatalog(config);
            config.maxBrightnessStep = Math.max(1, config.baselineBrightnessStep + config.objectives.length);
            return config;
        },

        _augmentDarklightsConfigFromCatalog(config) {
            if (!config || !config.gameplayIds || !config.gameplayIds.length) return config;

            const gm = IP2Live.GameManager;
            const catalog = gm && gm.gameplayCatalog ? gm.gameplayCatalog : {};
            for (let i = 0; i < config.gameplayIds.length; i++) {
                const gameplayId = config.gameplayIds[i];
                const catalogEntry = catalog[gameplayId] || {};
                const specs = gm && typeof gm.getGameplayQuestSpecs === 'function'
                    ? gm.getGameplayQuestSpecs(gameplayId)
                    : [];
                for (let s = 0; s < specs.length; s++) {
                    this._addDarklightsSpec(config, gameplayId, specs[s], catalogEntry);
                }
            }
            return config;
        },

        _addDarklightsSpec(config, gameplayId, spec, catalogEntry) {
            if (!config || !spec) return false;
            const fallbackMapId = Number((catalogEntry && catalogEntry.mapId) || 0);
            const specMapId = Number(spec.mapId || fallbackMapId);

            if (Array.isArray(spec.objectives) && spec.objectives.length) {
                for (let i = 0; i < spec.objectives.length; i++) {
                    const objective = spec.objectives[i] || {};
                    const objectiveGameplayId = String(objective.gameplayId || spec.gameplayId || gameplayId);
                    if (!this._darklightsGameplayMatches(config, objectiveGameplayId)) continue;
                    this._addDarklightsObjective(config, {
                        mapId: Number(objective.mapId || specMapId),
                        questId: spec.id,
                        objectiveId: objective.objectiveId,
                    });
                }
                return true;
            }

            return this._addDarklightsObjective(config, {
                mapId: specMapId,
                questId: spec.id,
                objectiveId: spec.objectiveId,
            });
        },

        _addDarklightsObjective(config, item) {
            if (!config || !item || Number(item.mapId) !== config.mapId) return false;
            const objectiveId = String(item.objectiveId || '');
            if (!objectiveId) return false;

            if (config.objectives.indexOf(objectiveId) === -1) {
                config.objectives.push(objectiveId);
            }

            const questId = String(item.questId || '');
            if (!questId) return true;
            for (let i = 0; i < config.quests.length; i++) {
                if (config.quests[i].questId === questId && config.quests[i].objectiveId === objectiveId) return true;
            }
            config.quests.push({ questId, objectiveId });
            return true;
        },

        _darklightsGameplayMatches(config, gameplayId) {
            const id = String(gameplayId || '');
            return !!(config && config.gameplayIds && config.gameplayIds.indexOf(id) !== -1);
        },

        _darklightsRoot() {
            const root = this._rootStore();
            if (!root[DARKLIGHTS_KEY]) root[DARKLIGHTS_KEY] = {};
            const darklights = root[DARKLIGHTS_KEY];
            if (!darklights.maps || typeof darklights.maps !== 'object') darklights.maps = {};
            return darklights;
        },

        _securityRoot() {
            const root = this._rootStore();
            if (!root[SECURITY_LIGHT_KEY] || typeof root[SECURITY_LIGHT_KEY] !== 'object') {
                root[SECURITY_LIGHT_KEY] = {};
            }
            const security = root[SECURITY_LIGHT_KEY];
            if (!security.maps || typeof security.maps !== 'object') security.maps = {};
            return security;
        },

        _securityStore(mapId) {
            const resolvedMapId = Number(mapId) || STAGE_ONE_LEVEL_TWO_MAP_ID;
            const root = this._securityRoot();
            const key = String(resolvedMapId);
            if (!root.maps[key]) {
                root.maps[key] = {
                    mapId: resolvedMapId,
                    strikes: 0,
                    triggered: false,
                    lastFailureAt: null,
                    lastQuestId: null,
                };
            }
            return root.maps[key];
        },

        _darklightsStore(mapId) {
            const config = this._darklightsConfigForMap(mapId || this._currentMapId() || STAGE_ONE_LEVEL_ONE_MAP_ID);
            const resolvedConfig = config || this._darklightsConfigForMap(STAGE_ONE_LEVEL_ONE_MAP_ID);
            const root = this._darklightsRoot();
            const key = String(resolvedConfig.mapId);

            if (!root.maps[key]) {
                root.maps[key] = this._legacyStoreForMap(root, resolvedConfig.mapId) || this._newDarklightsStore(resolvedConfig.mapId);
            }

            const store = root.maps[key];
            store.mapId = resolvedConfig.mapId;
            this._ensureBrightnessStore(store, resolvedConfig);
            if (resolvedConfig.mapId === STAGE_ONE_LEVEL_ONE_MAP_ID) {
                this._mirrorLegacyDarklightsRoot(root, store);
            }
            return store;
        },

        _newDarklightsStore(mapId) {
            return {
                mapId: Number(mapId) || STAGE_ONE_LEVEL_ONE_MAP_ID,
                dimLevel: null,
                brightnessStep: 0,
                maxBrightnessStep: null,
                cleared: false,
                completedObjectives: {},
                lastReason: null,
                progressInitialized: false,
            };
        },

        _legacyStoreForMap(root, mapId) {
            if (Number(mapId) !== STAGE_ONE_LEVEL_ONE_MAP_ID || !root) return null;
            const hasLegacy =
                Object.prototype.hasOwnProperty.call(root, 'dimLevel') ||
                Object.prototype.hasOwnProperty.call(root, 'brightnessStep') ||
                Object.prototype.hasOwnProperty.call(root, 'cleared') ||
                Object.prototype.hasOwnProperty.call(root, 'completedObjectives') ||
                Object.prototype.hasOwnProperty.call(root, 'progressInitialized');
            if (!hasLegacy) return null;

            return {
                mapId: STAGE_ONE_LEVEL_ONE_MAP_ID,
                dimLevel: root.dimLevel,
                brightnessStep: root.brightnessStep,
                maxBrightnessStep: root.maxBrightnessStep,
                cleared: root.cleared,
                completedObjectives: this._clonePlain(root.completedObjectives || {}),
                lastReason: root.lastReason || null,
                progressInitialized: root.progressInitialized,
            };
        },

        _mirrorLegacyDarklightsRoot(root, store) {
            if (!root || !store) return false;
            root.dimLevel = store.dimLevel;
            root.brightnessStep = store.brightnessStep;
            root.maxBrightnessStep = store.maxBrightnessStep;
            root.cleared = store.cleared;
            root.completedObjectives = store.completedObjectives;
            root.lastReason = store.lastReason;
            root.progressInitialized = store.progressInitialized;
            return true;
        },

        _ensureBrightnessStore(store, config) {
            if (!store) return null;
            const cfg = config || this._darklightsConfigForMap(store.mapId);
            const maxStep = this._maxBrightnessStep(cfg);
            if (!store.completedObjectives) store.completedObjectives = {};
            store.cleared = !!store.cleared;
            store.progressInitialized = !!store.progressInitialized;
            store.maxBrightnessStep = maxStep;

            if (!Number.isFinite(Number(store.brightnessStep))) {
                if (store.dimLevel !== null && store.dimLevel !== undefined && Number.isFinite(Number(store.dimLevel))) {
                    const legacyDim = this._clampInt(store.dimLevel, 0, maxStep);
                    store.brightnessStep = maxStep - legacyDim;
                } else {
                    store.brightnessStep = 0;
                }
            }

            this._setBrightnessStep(store, store.brightnessStep, store.lastReason || 'sync', cfg);
            return store;
        },

        _setBrightnessStep(store, step, reason, config) {
            if (!store) return 0;
            const maxStep = this._maxBrightnessStep(config || this._darklightsConfigForMap(store.mapId));
            const next = this._clampInt(step, 0, maxStep);
            store.maxBrightnessStep = maxStep;
            store.brightnessStep = next;
            store.dimLevel = maxStep - next;
            if (reason) store.lastReason = reason;
            return next;
        },

        _maxBrightnessStep(config) {
            const cfg = config || {};
            const baseline = Number(cfg.baselineBrightnessStep) || 0;
            const objectiveCount = Array.isArray(cfg.objectives) ? cfg.objectives.length : 0;
            return Math.max(1, baseline + objectiveCount);
        },

        _setActiveDarklightsMapId(mapId) {
            const root = this._darklightsRoot();
            root.activeMapId = Number(mapId) || null;
            return root.activeMapId;
        },

        _activeDarklightsMapId() {
            const root = this._darklightsRoot();
            return Number(root.activeMapId) || 0;
        },

        _rootStore() {
            const game = Core && Core.Game && Core.Game.current ? Core.Game.current : null;
            if (game) {
                if (!game.ip2liveGameStates) game.ip2liveGameStates = {};
                return game.ip2liveGameStates;
            }
            if (!this._fallbackStore.ip2liveGameStates) this._fallbackStore.ip2liveGameStates = {};
            return this._fallbackStore.ip2liveGameStates;
        },

        _syncStore() {
            const game = Core && Core.Game && Core.Game.current ? Core.Game.current : null;
            if (game && !game.ip2liveGameStates) game.ip2liveGameStates = this._fallbackStore.ip2liveGameStates || {};

            const root = this._rootStore();
            const darklights = root && root[DARKLIGHTS_KEY];
            const legacy = darklights && darklights.maps && darklights.maps[String(STAGE_ONE_LEVEL_ONE_MAP_ID)];
            if (legacy) this._mirrorLegacyDarklightsRoot(darklights, legacy);
            return true;
        },

        _currentScene() {
            return (Scene && Scene.Map && Scene.Map.current) || null;
        },

        _currentMapId() {
            const scene = this._currentScene();
            return Number(
                (scene && (scene.id || scene.mapID)) ||
                (Core && Core.Game && Core.Game.current && Core.Game.current.currentMapID) ||
                0
            ) || 0;
        },

        _clampInt(value, min, max) {
            const number = Math.round(Number(value) || 0);
            return Math.max(min, Math.min(max, number));
        },

        _clonePlain(value) {
            if (!value || typeof value !== 'object') return value;
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (e) {
                return Object.assign({}, value);
            }
        },
    };

    IP2Live.GameStateManager = GameStateManager;
    window.IP2LiveGameStateManager = GameStateManager;
    GameStateManager.installSceneHooks();

    console.log('[IP2Live] game_state_manager.js module loaded.');
}());
