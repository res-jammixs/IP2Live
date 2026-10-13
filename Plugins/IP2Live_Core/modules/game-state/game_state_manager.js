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

    const GameStateManager = {
        VERSION: 'game-state-manager-20261013-floor-progress',
        states: {},
        activeStates: {},
        _boundGameManager: null,
        _unsubscribers: [],
        _fallbackStore: {},
        _sceneHooksInstalled: false,
        floorConfig: IP2Live.FloorStateConfig || {
            gameplayStates: { ip_class_wires: ['darklights'], ip_class_wires_harder: ['darklights'] },
            stateDefaults: { darklights: { baselineBrightnessStep: 1 } }, levels: {},
        },
        _floorConfigCache: new Map(),
        _appliedFloorStates: {},

        /** Rebuild after changing assignments/configuration at runtime. No frame polling. */
        invalidateFloorStateConfig(mapId) {
            if (Number(mapId)) this._floorConfigCache.delete(Number(mapId));
            else this._floorConfigCache.clear();
        },

        /** Public, detached view: level -> gameplay -> state names and objective totals. */
        getFloorDefinition(mapId) {
            const floor = this._floorDefinitionForMap(mapId);
            return this._clonePlain({ mapId: floor.mapId, name: floor.name, gameplays: floor.gameplays,
                states: Object.fromEntries(Object.entries(floor.states).map(([name, config]) =>
                    [name, { gameplayIds: config.gameplayIds, totalObjectives: config.quests.length, objectives: config.quests }])) });
        },

        getFloorStateCatalog() {
            const gm = IP2Live.GameManager;
            return Object.keys(gm?.mapGameplayAssignments || this.floorConfig.levels || {}).map(Number)
                .sort((a, b) => a - b).map(id => this.getFloorDefinition(id));
        },

        _floorDefinitionForMap(mapId) {
            const id = Number(mapId) || 0, gm = IP2Live.GameManager;
            const assignment = gm?.mapGameplayAssignments?.[id], level = this.floorConfig.levels?.[id] || null;
            const cached = this._floorConfigCache.get(id);
            if (cached && cached.manager === gm && cached.assignment === assignment && cached.level === level) return cached.floor;
            const floor = { mapId: id, name: level?.name || gm?.flowConfig?.maps?.[id]?.name || 'Map ' + id, gameplays: {}, states: {} };
            const bindings = Object.assign({}, this.floorConfig.gameplayStates, level?.gameplays);
            const quests = gm?.getMapQuestSpecs ? gm.getMapQuestSpecs(id) : [];
            for (const quest of quests) for (const objective of quest.objectives?.length ? quest.objectives : [quest]) {
                const gameplayId = objective.gameplayId || quest.gameplayId;
                if (!gameplayId) continue;
                const names = Array.isArray(bindings[gameplayId]) ? bindings[gameplayId] : [];
                floor.gameplays[gameplayId] = names.slice();
                for (const stateName of names) {
                    const objectiveId = objective.objectiveId;
                    if (!objectiveId) continue;
                    const config = floor.states[stateName] || (floor.states[stateName] = Object.assign({},
                        this.floorConfig.stateDefaults?.[stateName], level?.states?.[stateName], {
                            mapId: id, name: floor.name, stateName, gameplayIds: [], objectives: [], quests: [],
                            entryReason: 'floor-entry', successReason: 'floor-objective-completed', clearReason: 'floor-state-completed',
                        }));
                    if (!config.gameplayIds.includes(gameplayId)) config.gameplayIds.push(gameplayId);
                    if (config.quests.some(item => item.questId === quest.id && item.objectiveId === objectiveId)) continue;
                    config.objectives.push(objectiveId);
                    config.quests.push({ questId: quest.id, objectiveId, gameplayId });
                }
            }
            for (const config of Object.values(floor.states)) config.maxBrightnessStep = this._maxBrightnessStep(config);
            // Do not cache an empty pre-GameManager bootstrap result.
            if (gm?.getMapQuestSpecs) this._floorConfigCache.set(id, { manager: gm, assignment, level, floor });
            return floor;
        },

        _isIsolatedContext(payload) {
            const data = payload || {}, spec = data.spec || {};
            return !Core?.Game?.current || !!(data.developerTest || spec.developerTest || data.tutorialReplay || spec.tutorialReplay ||
                data.practiceMode || spec.practiceMode || data.endlessMode || data.pvpMode || IP2Live.TutorialReplay?.session ||
                IP2Live.PracticeMode?.active || IP2Live.EndlessMode?.active || IP2Live.PVPMode?.active);
        },

        /** Quest completion is authoritative once that floor's quests are registered. */
        _completedFloorObjectives(config, store) {
            const qm = IP2Live.QuestManager, done = {}, completed = qm?.completedObjectives || {};
            const authoritative = config.quests.some(item => qm?.quests?.[item.questId] ||
                Object.prototype.hasOwnProperty.call(completed, item.questId));
            for (const item of config.quests) {
                if (authoritative ? completed[item.questId]?.[item.objectiveId] === true
                    : store.completedObjectives?.[item.objectiveId] === true || store.cleared) done[item.objectiveId] = true;
            }
            return done;
        },

        _floorStateStore(config) {
            if (config.stateName === DARKLIGHTS_KEY) return this._darklightsStore(config.mapId);
            const root = this._rootStore();
            if (!root.floorStates || typeof root.floorStates !== 'object') root.floorStates = { maps: {} };
            if (!root.floorStates.maps || typeof root.floorStates.maps !== 'object') root.floorStates.maps = {};
            const maps = root.floorStates.maps, key = String(config.mapId);
            if (!maps[key]) maps[key] = {};
            return maps[key][config.stateName] || (maps[key][config.stateName] = { completedObjectives: {} });
        },

        /** Event-driven reconciliation; repeated notifications never add light twice. */
        syncFloorStates(mapId, options) {
            const opts = options || {};
            if (this._isIsolatedContext(opts)) return false;
            const id = Number(mapId) || this._currentMapId(), floor = this._floorDefinitionForMap(id);
            const scene = opts.scene || this._currentScene(), current = this._currentMapId() === id;
            if (current) for (const [name, applied] of Object.entries(this._appliedFloorStates)) {
                if (!floor.states[name] || applied.mapId !== id || applied.scene !== scene || applied.game !== Core.Game.current) {
                    if (this.activeStates[name]) this.clear(name, { mapId: applied.mapId, scene: applied.scene, temporary: true });
                    delete this._appliedFloorStates[name];
                }
            }
            for (const [name, config] of Object.entries(floor.states)) {
                const store = this._floorStateStore(config), done = this._completedFloorObjectives(config, store);
                const count = Object.keys(done).length, total = config.objectives.length, progress = count / total;
                const brightnessStep = (Number(config.baselineBrightnessStep) || 0) + count;
                const changed = store.completedCount !== count || store.totalObjectives !== total || store.progress !== progress ||
                    store.cleared !== (count === total) || (name === DARKLIGHTS_KEY && store.brightnessStep !== brightnessStep) ||
                    config.objectives.some(objectiveId => !!store.completedObjectives?.[objectiveId] !== !!done[objectiveId]);
                if (changed) {
                    store.completedObjectives = done; store.completedCount = count; store.totalObjectives = total;
                    store.progress = progress; store.cleared = count === total; store.progressInitialized = true;
                    store.lastReason = opts.reason || 'floor-progress-sync';
                    if (name === DARKLIGHTS_KEY) this._setBrightnessStep(store, brightnessStep, store.lastReason, config);
                    this._syncStore();
                }
                if (!current || !this.states[name]) continue;
                const applied = this._appliedFloorStates[name];
                if (!opts.force && !changed && applied?.mapId === id && applied.scene === scene && applied.game === Core.Game.current) continue;
                const context = Object.assign({}, opts, { mapId: id, scene, progress, completedCount: count,
                    totalObjectives: total, completedObjectives: done, config });
                if (store.cleared) this.clear(name, Object.assign(context, { fullRestore: true }));
                else this.activate(name, context);
                this._appliedFloorStates[name] = { mapId: id, scene, game: Core.Game.current };
            }
            return true;
        },

        resetStoryState(game) {
            const target = game || (Core && Core.Game && Core.Game.current);
            if (!target) return false;

            // Detach first: never mutate a previous game's state or a restored
            // snapshot through a shared reference during runtime cleanup.
            target.ip2liveGameStates = {};
            this._fallbackStore = {};
            for (const key of new Set([DARKLIGHTS_KEY, SECURITY_LIGHT_KEY, ...Object.keys(this._appliedFloorStates)])) {
                if (this.activeStates[key]) this.clear(key, { newStory: true });
            }
            this._appliedFloorStates = {};
            const lighting = IP2Live.LightingManager;
            if (lighting) {
                // Darklights creates per-map presets, including for maps that
                // are no longer active. Keep authored ambience presets intact.
                for (const id of Object.keys(lighting.presets || {})) {
                    if (/^Darklights - /.test(lighting.presets[id].name || '')) {
                        lighting.clearPreset(id);
                    }
                }
                if (typeof lighting.clearLighting === 'function') lighting.clearLighting();
            }
            // State clear hooks may create empty records; start with no progress.
            target.ip2liveGameStates = {};
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

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
            if (this._isIsolatedContext()) return null;
            const config = this._darklightsConfigForMap(mapId || this._currentMapId() || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;

            const store = this._darklightsStore(config.mapId);
            const done = this._completedFloorObjectives(config, store);
            const item = objectiveId ? config.quests.find(row => row.objectiveId === String(objectiveId))
                : config.quests.slice().reverse().find(row => done[row.objectiveId]);
            if (!item || !done[item.objectiveId]) return store;
            store.cleared = false;
            delete store.completedObjectives[item.objectiveId];
            const completed = IP2Live.QuestManager?.completedObjectives;
            if (completed?.[item.questId]) delete completed[item.questId][item.objectiveId];
            this.syncFloorStates(config.mapId, { reason: reason || 'gameplay-rollback' });
            return store;
        },

        resetDarklightsProgress(mapId, reason) {
            if (this._isIsolatedContext()) return null;
            const config = this._darklightsConfigForMap(mapId || this._currentMapId() || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;

            const root = this._darklightsRoot();
            const completed = IP2Live.QuestManager?.completedObjectives;
            for (const item of config.quests) if (completed?.[item.questId]) delete completed[item.questId][item.objectiveId];
            const store = this._newDarklightsStore(config.mapId);
            store.lastReason = reason || 'darklights-progress-reset';
            root.maps[String(config.mapId)] = store;
            if (config.mapId === STAGE_ONE_LEVEL_ONE_MAP_ID) this._mirrorLegacyDarklightsRoot(root, store);
            this._syncStore();
            this.syncFloorStates(config.mapId, { reason: store.lastReason, force: true });
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
            if (this._isIsolatedContext()) return null;
            const config = this._darklightsConfigForMap(mapId || this._activeDarklightsMapId() || this._currentMapId() || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;

            const store = this._darklightsStore(config.mapId);
            this._setBrightnessStep(store, this._maxBrightnessStep(config), config.clearReason, config);
            store.cleared = true;
            store.completedObjectives = Object.fromEntries(config.objectives.map(id => [id, true]));
            store.completedCount = store.totalObjectives = config.objectives.length;
            store.progress = 1;
            store.progressInitialized = true;
            store.lastReason = config.clearReason;
            this._syncStore();
            if (this._currentMapId() === config.mapId) this.clear(DARKLIGHTS_KEY, { fullRestore: true, mapId: config.mapId });
            return store;
        },

        bindGameManager(gameManager) {
            const gm = gameManager || IP2Live.GameManager;
            if (!gm || typeof gm.on !== 'function') return false;
            if (this._boundGameManager === gm) return true;

            this._unbindGameManager();
            this._boundGameManager = gm;
            this.invalidateFloorStateConfig();

            const events = gm.EVENT || {};
            this._unsubscribers.push(gm.on(events.MAP_ENTERED || 'map.entered', (payload) => this._onMapEntered(payload)));
            this._unsubscribers.push(gm.on(events.GAMEPLAY_COMPLETED || 'gameplay.completed', (payload) => this._onGameplayCompleted(payload)));
            this._unsubscribers.push(gm.on(events.GAMEPLAY_FAILED || 'gameplay.failed', (payload) => this._onGameplayFailed(payload)));
            this._unsubscribers.push(gm.on(events.QUEST_OBJECTIVE_COMPLETED || 'quest.objectiveCompleted', (payload) => this._onQuestObjectiveCompleted(payload)));
            this._unsubscribers.push(gm.on(events.QUEST_PROGRESS_CHANGED || 'quest.progressChanged', (payload) => {
                if (!this._isIsolatedContext(payload)) this.syncFloorStates(payload?.mapId, payload);
            }));
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
            if (this._isIsolatedContext(data)) return;
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

            this.syncFloorStates(mapId, Object.assign({}, context, { scene: data.scene || this._currentScene(),
                reason: context.restoreFromSave ? 'save-restore' : 'floor-entry', force: true }));
        },

        _onGameplayFailed(payload) {
            const data = payload || {};
            if (this._isIsolatedContext(data)) return false;
            // NeuralLifeForce has already reopened/reset the previous quest.
            // A failure in any gameplay can therefore remove a wire completion.
            return this.syncFloorStates(data.mapId || data.spec?.mapId, { reason: 'quest-setback' });
        },

        _onGameplayCompleted(payload) {
            const data = payload || {};
            if (this._isIsolatedContext(data)) return;
            const spec = data.spec || {};
            const mapId = Number(data.mapId || spec.mapId || this._currentMapId());
            // Gameplay completion can precede QuestManager committing its objective.
            // Read the quest table; QUEST_OBJECTIVE_COMPLETED will reconcile again.
            this.syncFloorStates(mapId, { reason: 'gameplay-completed' });
        },

        _onQuestObjectiveCompleted(payload) {
            const data = payload || {};
            if (this._isIsolatedContext(data)) return;
            const mapId = Number(data.mapId || this._currentMapId());
            this.syncFloorStates(mapId, { reason: 'quest-objective-completed' });
        },

        _markDarklightsObjective(mapId, objectiveId) {
            if (this._isIsolatedContext()) return false;
            const config = this._darklightsConfigForMap(mapId);
            if (!config) return false;

            const id = String(objectiveId || '');
            if (config.objectives.indexOf(id) === -1) return false;

            const store = this._darklightsStore(config.mapId);
            // Legacy callers can record evidence before the quest table is ready.
            store.completedObjectives[id] = true;
            this.syncFloorStates(config.mapId, { reason: config.successReason });
            return true;
        },

        _darklightsObjectivesComplete(mapId) {
            const config = this._darklightsConfigForMap(mapId);
            if (!config) return false;

            const store = this._darklightsStore(config.mapId);
            return Object.keys(this._completedFloorObjectives(config, store)).length === config.objectives.length;
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
            if (gm && typeof gm.getQuestSpec === 'function') {
                const spec = gm.getQuestSpec(questId);
                if (spec) return spec.questLabel || spec.label || spec.title || questId;
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
            return this._floorDefinitionForMap(Number(mapId) || STAGE_ONE_LEVEL_ONE_MAP_ID).states[DARKLIGHTS_KEY] || null;
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
            if (!resolvedConfig) return this._newDarklightsStore(mapId);
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
