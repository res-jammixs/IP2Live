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
    const STAGE_ONE_LEVER_OBJECTIVES = [
        'repair_ip_wires_01',
        'repair_ip_wires_02',
        'repair_ip_wires_03',
        'repair_ip_wires_04',
    ];
    const STAGE_ONE_LEVER_QUESTS = [
        { questId: 'stage.3.ip_wires.01.tutorial', objectiveId: 'repair_ip_wires_01' },
        { questId: 'stage.3.ip_wires.02', objectiveId: 'repair_ip_wires_02' },
        { questId: 'stage.3.ip_wires.03', objectiveId: 'repair_ip_wires_03' },
        { questId: 'stage.3.ip_wires.04', objectiveId: 'repair_ip_wires_04' },
    ];
    const MAX_BRIGHTNESS_STEP = 5;
    const BASELINE_BRIGHTNESS_STEP = 1;

    const GameStateManager = {
        VERSION: 'game-state-manager-20260602-01',
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
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        recordTutorialReturn(reason) {
            const store = this._darklightsStore();
            if (store.cleared) return store;
            this._setBrightnessStep(store, store.brightnessStep - 1, reason || 'tutorial-return');
            store.lastReason = reason || 'tutorial-return';
            store.completedObjectives = {};
            this._syncStore();
            if (this._currentMapId() === STAGE_ONE_LEVEL_ONE_MAP_ID) {
                this.activate(DARKLIGHTS_KEY, {
                    mapId: STAGE_ONE_LEVEL_ONE_MAP_ID,
                    scene: this._currentScene(),
                    reason: reason || 'tutorial-return',
                });
            }
            return store;
        },

        resetDarklights() {
            const store = this._darklightsStore();
            this._setBrightnessStep(store, MAX_BRIGHTNESS_STEP, 'stage-one-levers-cleared');
            store.cleared = true;
            store.completedObjectives = {};
            store.lastReason = 'stage-one-levers-cleared';
            this._syncStore();
            this.clear(DARKLIGHTS_KEY, { fullRestore: true, mapId: STAGE_ONE_LEVEL_ONE_MAP_ID });
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

            if (mapId === STAGE_ONE_LEVEL_ONE_MAP_ID && context.darklightsReturn) {
                this.recordTutorialReturn(context.source || 'map-flow-return');
                return;
            }

            if (mapId === STAGE_ONE_LEVEL_ONE_MAP_ID) {
                const store = this._darklightsStore();
                if (store.cleared || this._stageOneLeversComplete()) {
                    this.resetDarklights();
                } else {
                    if (!store.progressInitialized && store.brightnessStep <= 0) {
                        this._setBrightnessStep(store, BASELINE_BRIGHTNESS_STEP, 'stage-one-baseline');
                    }
                    if (!store.progressInitialized) store.progressInitialized = true;
                    this._syncStore();
                    this.activate(DARKLIGHTS_KEY, {
                        mapId,
                        scene: data.scene || this._currentScene(),
                        reason: 'stage-one-entry',
                    });
                }
                return;
            }

            if (this.activeStates[DARKLIGHTS_KEY]) {
                this.clear(DARKLIGHTS_KEY, { mapId, temporary: true });
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
            this.recordTutorialReturn('stage-one-wire-failure');
        },

        _onGameplayCompleted(payload) {
            const data = payload || {};
            if (data.gameplayId !== 'ip_class_wires') return;
            const spec = data.spec || {};
            const mapId = Number(data.mapId || spec.mapId || this._currentMapId());
            if (mapId !== STAGE_ONE_LEVEL_ONE_MAP_ID) return;
            this._markLeverObjective(data.objectiveId || spec.objectiveId);
        },

        _onQuestObjectiveCompleted(payload) {
            const data = payload || {};
            const mapId = Number(data.mapId || this._currentMapId());
            if (mapId !== STAGE_ONE_LEVEL_ONE_MAP_ID) return;
            this._markLeverObjective(data.objectiveId);
        },

        _markLeverObjective(objectiveId) {
            const id = String(objectiveId || '');
            if (STAGE_ONE_LEVER_OBJECTIVES.indexOf(id) === -1) return false;

            const store = this._darklightsStore();
            if (!store.completedObjectives) store.completedObjectives = {};
            if (store.completedObjectives[id]) return true;
            store.completedObjectives[id] = true;
            this._setBrightnessStep(store, store.brightnessStep + 1, 'stage-one-wire-success');
            store.progressInitialized = true;
            store.lastReason = 'stage-one-wire-success';
            this._syncStore();

            if (this._stageOneLeversComplete()) {
                this.resetDarklights();
            } else if (this._currentMapId() === STAGE_ONE_LEVEL_ONE_MAP_ID && !store.cleared) {
                this.activate(DARKLIGHTS_KEY, {
                    mapId: STAGE_ONE_LEVEL_ONE_MAP_ID,
                    scene: this._currentScene(),
                    reason: 'lever-progress',
                });
            }
            return true;
        },

        _stageOneLeversComplete() {
            const store = this._darklightsStore();
            const done = store.completedObjectives || {};
            let trackedComplete = true;
            for (let i = 0; i < STAGE_ONE_LEVER_OBJECTIVES.length; i++) {
                if (!done[STAGE_ONE_LEVER_OBJECTIVES[i]]) {
                    trackedComplete = false;
                    break;
                }
            }
            if (trackedComplete) return true;

            const qm = IP2Live.QuestManager;
            const completed = qm && qm.completedObjectives ? qm.completedObjectives : null;
            if (!completed) return false;
            for (let i = 0; i < STAGE_ONE_LEVER_QUESTS.length; i++) {
                const item = STAGE_ONE_LEVER_QUESTS[i];
                if (!completed[item.questId] || !completed[item.questId][item.objectiveId]) return false;
            }
            return true;
        },

        _darklightsStore() {
            const root = this._rootStore();
            if (!root[DARKLIGHTS_KEY]) {
                root[DARKLIGHTS_KEY] = {
                    dimLevel: 0,
                    brightnessStep: null,
                    cleared: false,
                    completedObjectives: {},
                    lastReason: null,
                    progressInitialized: false,
                };
            }
            const store = root[DARKLIGHTS_KEY];
            this._ensureBrightnessStore(store);
            return store;
        },

        _ensureBrightnessStore(store) {
            if (!store) return null;
            if (!store.completedObjectives) store.completedObjectives = {};
            store.cleared = !!store.cleared;
            store.progressInitialized = !!store.progressInitialized;

            if (!Number.isFinite(Number(store.brightnessStep))) {
                const legacyDim = this._clampInt(store.dimLevel || 0, 0, MAX_BRIGHTNESS_STEP);
                store.brightnessStep = MAX_BRIGHTNESS_STEP - legacyDim;
            }

            this._setBrightnessStep(store, store.brightnessStep, store.lastReason || 'sync');
            return store;
        },

        _setBrightnessStep(store, step, reason) {
            if (!store) return 0;
            const next = this._clampInt(step, 0, MAX_BRIGHTNESS_STEP);
            store.brightnessStep = next;
            store.dimLevel = MAX_BRIGHTNESS_STEP - next;
            if (reason) store.lastReason = reason;
            return next;
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
    };

    IP2Live.GameStateManager = GameStateManager;
    window.IP2LiveGameStateManager = GameStateManager;

    console.log('[IP2Live] game_state_manager.js module loaded.');
}());
