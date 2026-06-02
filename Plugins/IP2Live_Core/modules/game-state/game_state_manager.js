/**
 * IP2Live - Game State Manager
 *
 * Small runtime state layer for ambience/gameplay conditions that need to
 * react to map flow, quest progress, and performance.
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

(function () {
    const STAGE_ONE_LEVEL_ONE_MAP_ID = 3;
    const DARKLIGHTS_KEY = 'darklights';

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
        VERSION: 'game-state-manager-20260602-02',
        states: {},
        activeStates: {},
        _boundGameManager: null,
        _unsubscribers: [],
        _fallbackStore: {},

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

        recordTutorialReturn(reason, mapId) {
            const config = this._darklightsConfigForMap(mapId || STAGE_ONE_LEVEL_ONE_MAP_ID);
            if (!config) return null;

            const store = this._darklightsStore(config.mapId);
            if (store.cleared) return store;
            this._setBrightnessStep(store, store.brightnessStep - 1, reason || 'tutorial-return', config);
            store.lastReason = reason || 'tutorial-return';
            store.completedObjectives = {};
            this._syncStore();
            if (this._currentMapId() === config.mapId) {
                this._activateDarklights(config, {
                    scene: this._currentScene(),
                    reason: reason || 'tutorial-return',
                });
            }
            return store;
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

            if (config && context.darklightsReturn) {
                this.recordTutorialReturn(context.source || 'map-flow-return', config.mapId);
                return;
            }

            if (config) {
                const store = this._darklightsStore(config.mapId);
                if (store.cleared || this._darklightsObjectivesComplete(config.mapId)) {
                    this.resetDarklights(config.mapId);
                } else {
                    if (!store.progressInitialized && store.brightnessStep <= 0) {
                        this._setBrightnessStep(store, config.baselineBrightnessStep, config.entryReason, config);
                    }
                    if (!store.progressInitialized) store.progressInitialized = true;
                    this._syncStore();
                    this._activateDarklights(config, {
                        scene: data.scene || this._currentScene(),
                        reason: config.entryReason,
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
            if (mapId !== STAGE_ONE_LEVEL_ONE_MAP_ID || spec.tutorial) return;
            const result = data.result || {};
            if (String(result.reason || '') !== 'attempts_exhausted') return;
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

    console.log('[IP2Live] game_state_manager.js module loaded.');
}());
