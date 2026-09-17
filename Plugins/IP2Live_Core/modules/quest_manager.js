/**
 * IP2Live - Quest Manager Module
 *
 * Reusable quest/objective manager. It owns active objective state,
 * completion advancement, the fixed upper-left quest panel, and delegates
 * world arrows/path visuals to assets/quest_arrow.js.
 *
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

class IP2LiveQuestManager {
    constructor() {
        this.VERSION = 'quest-manager-20260918-10';

        this.quests = {};
        this.mapQuestQueues = {};
        this.activeQuestId = null;
        this.activeObjectiveId = null;
        this.activeMapId = null;
        this.completedObjectives = {};
        this.visible = false;
        this.preview = false;
        this.guideActive = false;
        this.allowCompletion = false;
        this.suppressedByDialogue = false;
        this._mapQuestMode = false;
        this._showFinishedPanel = false;
        this.animTick = 0;
        this._sceneRef = null;
        this._lastHeroRef = null;
        this._lastHeroPath = '';
        this._lastCompletion = null;
        this._stageFoundationSynced = false;
        this._arrowGuide = IP2Live.QuestArrowAsset ? IP2Live.QuestArrowAsset.create() : null;

        this._registerDefaultQuests();
        this._injectMapHooks();
    }

    _registerDefaultQuests() {
        this.registerQuest({
            id: 'tutorial.navigation',
            title: 'QUEST AREA',
            objectives: [
                {
                    id: 'go_to_spot',
                    title: 'GO TO THE SPOT',
                    detail: 'TARGET TILE  X:23  Y:0  Z:2',
                    targetTile: { x: 23, y: 0, z: 2 },
                    routeTiles: [
                        { x: 23, z: 14 },
                        { x: 23, z: 10 },
                        { x: 23, z: 6 },
                        { x: 23, z: 2 },
                    ],
                    completionRadiusTiles: 0.55,
                },
            ],
        });

        this.registerMapQuests(1, ['tutorial.navigation'], {
            autoStart: false,
            showFinished: false,
        });

        // Stage 1 is ready for ordered quest arrays. It currently has no
        // registered quests, so the panel will show the completed empty state.
        this.registerMapQuests(3, [], {
            autoStart: true,
            showFinished: true,
        });
    }

    registerQuest(quest) {
        if (!quest || !quest.id) return false;
        const copy = Object.assign({}, quest);
        copy.objectives = (quest.objectives || []).map((objective) => {
            const objectiveCopy = Object.assign({}, objective);
            if (objective.targetTile) objectiveCopy.targetTile = Object.assign({}, objective.targetTile);
            if (objective.routeTiles) {
                objectiveCopy.routeTiles = objective.routeTiles.map((tile) => Object.assign({}, tile));
            }
            return objectiveCopy;
        });
        this.quests[quest.id] = copy;
        const mapId = copy.mapId || copy.worldId;
        if (mapId) {
            this.registerMapQuests(mapId, [copy.id], { append: true });
        }
        return true;
    }

    registerMapQuests(mapId, quests, options) {
        const key = Number(mapId);
        if (!key) return false;

        const opts = options || {};
        const incoming = Array.isArray(quests) ? quests : [];
        const ids = [];

        for (let i = 0; i < incoming.length; i++) {
            const entry = incoming[i];
            if (!entry) continue;

            if (typeof entry === 'string') {
                ids.push(entry);
                continue;
            }

            if (entry.id) {
                if (!this.quests[entry.id]) this.registerQuest(entry);
                ids.push(entry.id);
            }
        }

        const previous = this.mapQuestQueues[key] || {};
        const previousIds = previous.questIds || [];
        const nextIds = opts.append ? previousIds.slice() : [];
        for (let i = 0; i < ids.length; i++) {
            if (nextIds.indexOf(ids[i]) === -1) nextIds.push(ids[i]);
        }

        this.mapQuestQueues[key] = {
            questIds: nextIds,
            autoStart: opts.autoStart !== undefined ? !!opts.autoStart : previous.autoStart !== false,
            showFinished: opts.showFinished !== undefined ? !!opts.showFinished : previous.showFinished !== false,
        };
        return true;
    }

    registerWorldQuests(mapId, quests, options) {
        return this.registerMapQuests(mapId, quests, options);
    }

    startQuest(questId, options) {
        const quest = this.quests[questId];
        if (!quest) {
            console.warn('[IP2Live] QuestManager: unknown quest', questId);
            return false;
        }

        const opts = options || {};
        if (this.activeQuestId !== questId || opts.restart) {
            this.activeQuestId = questId;
            if (opts.restart) {
                this.completedObjectives[questId] = opts.completedObjectives || {};
            } else if (opts.completedObjectives) {
                this.completedObjectives[questId] = opts.completedObjectives;
            } else if (!this.completedObjectives[questId]) {
                this.completedObjectives[questId] = {};
            }
            if (!opts.keepLastCompletion) this._lastCompletion = null;
        }

        if (opts.mapQuestMode !== undefined) this._mapQuestMode = !!opts.mapQuestMode;
        if (opts.mapId !== undefined) this.activeMapId = Number(opts.mapId) || this.activeMapId;
        this._showFinishedPanel = false;
        this.visible = opts.visible !== undefined ? !!opts.visible : true;
        this.preview = !!opts.preview;
        this.guideActive = !!opts.guideActive;
        this.allowCompletion = !!opts.allowCompletion;
        this.activeObjectiveId = this._firstOpenObjective(questId);

        if (this._arrowGuide) this._arrowGuide.setObjective(this.currentObjective());
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    }

    setQuestState(options) {
        const opts = options || {};
        if (opts.visible !== undefined) this.visible = !!opts.visible;
        if (opts.preview !== undefined) this.preview = !!opts.preview;
        if (opts.guideActive !== undefined) this.guideActive = !!opts.guideActive;
        if (opts.allowCompletion !== undefined) this.allowCompletion = !!opts.allowCompletion;
        if (!this.guideActive && this._arrowGuide) this._arrowGuide.clear();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    setDialogueSuppressed(isSuppressed) {
        this.suppressedByDialogue = !!isSuppressed;
        if (this.suppressedByDialogue && this._arrowGuide) this._arrowGuide.clear();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    isHudVisible() {
        if (!this.visible || this.suppressedByDialogue) return false;
        return !!((this.currentQuest() && this.currentObjective()) || this._showFinishedPanel);
    }

    snapshotProgress() {
        return {
            version: 'quest-progress-20260529-01',
            activeQuestId: this.activeQuestId || null,
            activeObjectiveId: this.activeObjectiveId || null,
            activeMapId: this.activeMapId || null,
            mapQuestMode: !!this._mapQuestMode,
            visible: !!this.visible,
            preview: !!this.preview,
            guideActive: !!this.guideActive,
            allowCompletion: !!this.allowCompletion,
            completedObjectives: this._clonePlain(this.completedObjectives || {}),
            capturedAt: Date.now(),
        };
    }

    restoreProgress(snapshot, options) {
        const state = snapshot || {};
        const opts = options || {};
        if (!state || typeof state !== 'object') return false;

        this._syncStageFoundation();
        this.completedObjectives = this._clonePlain(state.completedObjectives || {});
        this.activeMapId = Number(state.activeMapId || opts.mapId || this.activeMapId || 0) || 0;
        this._mapQuestMode = state.mapQuestMode !== undefined ? !!state.mapQuestMode : true;
        this._showFinishedPanel = false;
        this._pendingSlotRestore = opts.restoreContext || this._pendingSlotRestore || null;

        let restoredQuestId = state.activeQuestId || null;
        if (!restoredQuestId || !this.quests[restoredQuestId]) restoredQuestId = null;
        if (restoredQuestId && this._isQuestFinished(restoredQuestId)) restoredQuestId = null;

        this.activeQuestId = restoredQuestId;
        this.activeObjectiveId = null;
        if (this.activeQuestId) {
            const firstOpen = this._firstOpenObjective(this.activeQuestId);
            const done = this.completedObjectives[this.activeQuestId] || {};
            const requestedObjective = state.activeObjectiveId || null;
            this.activeObjectiveId = (requestedObjective && !done[requestedObjective]) ? requestedObjective : firstOpen;
        }

        if (!this.activeQuestId && this.activeMapId) {
            this._startNextQuestForMap(this.activeMapId);
        }

        const hasActiveObjective = !!(this.activeQuestId && this.activeObjectiveId);
        this.visible = hasActiveObjective ? state.visible !== false : !!state.visible;
        this.preview = state.preview !== undefined ? !!state.preview : false;
        this.guideActive = hasActiveObjective ? state.guideActive !== false : !!state.guideActive;
        this.allowCompletion = hasActiveObjective ? state.allowCompletion !== false : !!state.allowCompletion;
        if (!this.guideActive && this._arrowGuide) this._arrowGuide.clear();
        if (this._arrowGuide) this._arrowGuide.setObjective(this.currentObjective());
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    }

    hideQuest(questId) {
        if (!questId || questId === this.activeQuestId) {
            this.visible = false;
            this.preview = false;
            this.guideActive = false;
            this.allowCompletion = false;
            this._mapQuestMode = false;
            this._showFinishedPanel = false;
            if (this._arrowGuide) this._arrowGuide.clear();
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        }
    }

    ensureMapQuestFor(mapId, scene) {
        this._syncStageFoundation();
        if (scene) this._setSceneContext(scene);

        const resolvedMapId = Number(mapId) || this._getMapId(scene);
        if (!resolvedMapId) return false;

        const queue = this._mapQuestQueue(resolvedMapId);
        if (!queue.autoStart) return false;

        const resetForScene = this._resetMapEntryQuestsForScene(scene, resolvedMapId);
        const resetBypassed = !!(scene && scene._ip2liveQuestEntryResetBypassed);
        if (resetForScene && !resetBypassed) {
            this.activeQuestId = null;
            this.activeObjectiveId = null;
            this._showFinishedPanel = false;
        }
        const questIds = queue.questIds || [];
        const hasCurrentQuest = !!(
            this.activeQuestId &&
            this.activeObjectiveId &&
            questIds.indexOf(this.activeQuestId) !== -1
        );

        if (this.activeMapId !== resolvedMapId) {
            this.activeMapId = resolvedMapId;
            this._lastCompletion = null;
            this._showFinishedPanel = false;
            if (!resetForScene) this._resetMapEntryQuests(resolvedMapId);
            if (this._arrowGuide) this._arrowGuide.clear();
        } else if (hasCurrentQuest && this.visible) {
            return true;
        } else if (this._queueHasOpenQuest(queue)) {
            this._showFinishedPanel = false;
        }

        return this._startNextQuestForMap(resolvedMapId);
    }

    clearGuide() {
        if (this._arrowGuide) this._arrowGuide.clear();
    }

    resetTransitionState(options) {
        const opts = options || {};
        this.activeQuestId = null;
        this.activeObjectiveId = null;
        this.activeMapId = null;
        this.visible = false;
        this.preview = false;
        this.guideActive = false;
        this.allowCompletion = false;
        this.suppressedByDialogue = false;
        this._mapQuestMode = false;
        this._showFinishedPanel = false;
        this._lastCompletion = null;
        this._sceneRef = null;
        this._lastHeroRef = null;
        this._lastHeroPath = '';
        if (opts.clearPendingRestore) this._pendingSlotRestore = null;
        if (this._arrowGuide) this._arrowGuide.clear();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    }

    skipToStageExitQuest(mapId, options) {
        const resolvedMapId = Number(mapId) || this.activeMapId || this._getMapId(this._sceneRef);
        if (!resolvedMapId) return false;

        const opts = options || {};
        const exitQuestId = opts.exitQuestId || ('stage.default_exit.' + resolvedMapId);
        const queue = this._mapQuestQueue(resolvedMapId);
        const questIds = Array.isArray(queue.questIds) ? queue.questIds.slice() : [];
        if (!questIds.length) return false;

        let changed = false;
        for (let i = 0; i < questIds.length; i++) {
            const questId = questIds[i];
            if (!questId || questId === exitQuestId) continue;
            const quest = this.quests[questId];
            if (!quest || !Array.isArray(quest.objectives) || !quest.objectives.length) continue;

            if (!this.completedObjectives[questId]) this.completedObjectives[questId] = {};
            const done = this.completedObjectives[questId];
            for (let o = 0; o < quest.objectives.length; o++) {
                const objectiveId = quest.objectives[o] && quest.objectives[o].id;
                if (!objectiveId) continue;
                if (!done[objectiveId]) changed = true;
                done[objectiveId] = true;
            }
        }

        const hasExitQuest = questIds.indexOf(exitQuestId) !== -1 && !!this.quests[exitQuestId];
        if (hasExitQuest) {
            this.mapQuestQueues[resolvedMapId] = Object.assign({}, queue, {
                questIds: [exitQuestId],
                autoStart: true,
                showFinished: false,
            });
            changed = true;
        }

        this._showFinishedPanel = false;
        this.activeMapId = resolvedMapId;

        if (hasExitQuest) {
            this.startQuest(exitQuestId, {
                mapId: resolvedMapId,
                mapQuestMode: true,
                keepLastCompletion: true,
                visible: true,
                preview: false,
                guideActive: true,
                allowCompletion: true,
            });
        } else {
            this.activeQuestId = null;
            this.activeObjectiveId = null;
            this._startNextQuestForMap(resolvedMapId);
        }

        if (this._arrowGuide) this._arrowGuide.setObjective(this.currentObjective());
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return changed;
    }

    currentQuest() {
        return this.activeQuestId ? this.quests[this.activeQuestId] || null : null;
    }

    currentObjective() {
        const quest = this.currentQuest();
        if (!quest || !this.activeObjectiveId) return null;
        for (let i = 0; i < quest.objectives.length; i++) {
            if (quest.objectives[i].id === this.activeObjectiveId) return quest.objectives[i];
        }
        return null;
    }

    update(sceneOrContext) {
        this.animTick++;

        const context = this._buildContext(sceneOrContext);
        this._syncMapQuestQueue(context);

        const objective = this.currentObjective();
        if (!this.visible || this.suppressedByDialogue || !objective || this._stageSpawnPending(context.scene)) {
            if (this._arrowGuide) this._arrowGuide.clear();
            return null;
        }

        if (this._arrowGuide) {
            this._arrowGuide.setObjective(objective);
            this._arrowGuide.update(Object.assign({}, context, {
                tick: this.animTick,
                guideActive: this.guideActive,
                distanceTiles: this.distanceToObjective(objective, context.hero),
            }));
        }

        if (this.allowCompletion && this._isObjectiveComplete(objective, context)) {
            return this.completeObjective(objective.id);
        }

        return null;
    }

    drawHUD(ctx) {
        if (!ctx || !this.isHudVisible()) return;

        const objective = this.currentObjective();
        const quest = this.currentQuest();
        if (!objective || !quest) {
            if (this._showFinishedPanel) this._drawFinishedPanel(ctx);
            return;
        }

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        const headerFont = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : font;
        const tick = this.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);

        const panelRect = this._questPanelRect(ctx);
        const qW = panelRect.w;
        const qH = panelRect.h;
        const qX = panelRect.x;
        const qY = panelRect.y;
        const red = '255,0,60';

        ctx.save();
        ctx.shadowBlur = 0;
        this._drawQuestPanelShell(ctx, {
            x: qX,
            y: qY,
            w: qW,
            h: qH,
            sX,
            sY,
            tick,
            pulse,
            accent: '#FF003C',
        });
        this._drawQuestHeaderPlates(ctx, {
            x: qX,
            y: qY,
            w: qW,
            sX,
            sY,
            tick,
            leftColor: '#FF003C',
            rightColor: '#FFE600',
        });

        ctx.font = 'bold ' + Math.round(14 * sX) + 'px ' + headerFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        this._drawTrackedText(ctx, quest.title || 'QUEST AREA', qX + 18 * sX, qY + 28 * sY, 0.7 * sX);

        ctx.font = 'bold ' + Math.round(12.5 * sX) + 'px ' + headerFont;
        ctx.fillStyle = '#111111';
        this._drawTrackedText(ctx, 'REQUIRED', qX + 204 * sX, qY + 28 * sY, 0.4 * sX);

        this._drawObjectiveRow(ctx, {
            x: qX + 18 * sX,
            y: qY + 56 * sY,
            w: qW - 36 * sX,
            h: 44 * sY,
            sX,
            sY,
            font,
            objective,
            tick,
            red,
        });

        const meterX = qX + 18 * sX;
        const meterY = qY + 108 * sY;
        const meterW = qW - 36 * sX;

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo(meterX, meterY);
        ctx.lineTo(meterX + meterW, meterY);
        ctx.stroke();

        const dashOffset = (tick * 2) % (18 * sX);
        ctx.strokeStyle = 'rgba(' + red + ',0.92)';
        ctx.lineWidth = 3 * sX;
        ctx.setLineDash([10 * sX, 8 * sX]);
        ctx.lineDashOffset = -dashOffset;
        ctx.beginPath();
        ctx.moveTo(meterX, meterY);
        ctx.lineTo(meterX + meterW * 0.58, meterY);
        ctx.stroke();
        ctx.setLineDash([]);

        this._drawPanelCorners(ctx, qX, qY, qW, qH, sX);
        ctx.restore();
    }

    drawGuide2D(ctx) {
        const objective = this.currentObjective();
        if (!ctx || !objective || !this.visible || this.suppressedByDialogue || !this.guideActive || !this._arrowGuide) return;

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const context = this._buildContext();
        this._arrowGuide.setObjective(objective);
        this._arrowGuide.draw2D(ctx, cW, cH, Object.assign({}, context, {
            tick: this.animTick,
            guideActive: this.guideActive,
            distanceTiles: this.distanceToObjective(objective, context.hero),
            panelRect: this._questPanelRect(ctx),
        }));
    }

    completeObjective(objectiveId) {
        const quest = this.currentQuest();
        if (!quest || !objectiveId) return null;
        const resultMapId = this.activeMapId;

        if (!this.completedObjectives[quest.id]) this.completedObjectives[quest.id] = {};
        this.completedObjectives[quest.id][objectiveId] = true;

        const completedObjective = this._objectiveById(quest, objectiveId);
        this.activeObjectiveId = this._firstOpenObjective(quest.id);

        const result = {
            questId: quest.id,
            objectiveId,
            mapId: resultMapId,
            completedObjective,
            nextObjective: this.currentObjective(),
            questCompleted: !this.activeObjectiveId,
        };
        this._lastCompletion = result;

        if (!this.activeObjectiveId) {
            if (this._mapQuestMode && this.activeMapId) {
                this._startNextQuestForMap(this.activeMapId);
            } else {
                this.guideActive = false;
                this.allowCompletion = false;
                this.visible = false;
                if (this._arrowGuide) this._arrowGuide.clear();
            }
        } else if (this._arrowGuide) {
            this._arrowGuide.setObjective(this.currentObjective());
        }

        this._runCompletionHandlers(quest, completedObjective, result);
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleQuestObjectiveCompleted === 'function') {
            IP2Live.GameManager.handleQuestObjectiveCompleted(result);
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return result;
    }

    _runCompletionHandlers(quest, objective, result) {
        const handlers = [];
        if (objective && typeof objective.onComplete === 'function') handlers.push(objective.onComplete);
        if (quest && result && result.questCompleted && typeof quest.onComplete === 'function') handlers.push(quest.onComplete);

        for (let i = 0; i < handlers.length; i++) {
            try {
                handlers[i](result, this);
            } catch (e) {
                console.warn('[IP2Live] QuestManager completion handler failed:', e);
            }
        }
    }

    consumeCompletion(questId) {
        if (!this._lastCompletion) return null;
        if (questId && this._lastCompletion.questId !== questId) return null;
        const result = this._lastCompletion;
        this._lastCompletion = null;
        return result;
    }

    distanceToObjective(objective, hero) {
        const h = hero || this._questHero(this._sceneRef);
        if (!objective || !h) return null;
        const pos = this._heroEditorPosition(h);
        if (!pos) return null;
        const target = this._targetEditorCenter(objective);
        return Math.hypot(pos.x - target.x, pos.z - target.z);
    }

    _injectMapHooks() {
        if (!Scene || !Scene.Map || !Scene.Map.prototype) return;
        if (Scene.Map.prototype._ip2liveQuestManagerInjected) return;
        Scene.Map.prototype._ip2liveQuestManagerInjected = true;

        const manager = this;
        const dialogueManager = IP2Live.DialogueManager;
        if (dialogueManager) dialogueManager._hudFocusTopLayerAvailable = true;
        const originalUpdate = Scene.Map.prototype.update;
        Scene.Map.prototype.update = function () {
            originalUpdate.call(this);
            manager._setSceneContext(this);
            manager.update({ scene: this });
        };

        const originalDrawHUD = Scene.Map.prototype.drawHUD;
        Scene.Map.prototype.drawHUD = function () {
            originalDrawHUD.call(this);
            manager.drawGuide2D(Common.Platform.ctx);
            manager.drawHUD(Common.Platform.ctx);
            if (dialogueManager && typeof dialogueManager.drawHudFocusOverlay === 'function') {
                dialogueManager.drawHudFocusOverlay(Common.Platform.ctx);
            }
        };
    }

    _buildContext(sceneOrContext) {
        const input = sceneOrContext || null;
        let scene = this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        if (input) {
            scene = input.scene || (input.hero || input.camera ? scene : input);
        }
        this._setSceneContext(scene);
        const hero = input && input.hero ? input.hero : this._questHero(scene);
        return {
            scene,
            hero,
            tileSize: this._tileSize(),
            positionUsesEditorUnits: (position) => this._positionUsesEditorUnits(position),
            camera: this._getActiveThreeCamera(scene),
        };
    }

    _syncMapQuestQueue(context) {
        this._syncStageFoundation();

        const mapId = this._getMapId(context && context.scene);
        if (!mapId) return;

        const resetForScene = this._resetMapEntryQuestsForScene(context && context.scene, mapId);
        const resetBypassed = !!(context && context.scene && context.scene._ip2liveQuestEntryResetBypassed);
        if (resetForScene && !resetBypassed) {
            this.activeQuestId = null;
            this.activeObjectiveId = null;
            this._showFinishedPanel = false;
        }
        if (this.activeMapId !== mapId) {
            this.activeMapId = mapId;
            this._lastCompletion = null;
            this._showFinishedPanel = false;
            if (!resetForScene) this._resetMapEntryQuests(mapId);
            if (this._arrowGuide) this._arrowGuide.clear();
            this._startNextQuestForMap(mapId);
            return;
        }

        const queue = this._mapQuestQueue(mapId);
        if (!queue.autoStart) return;
        if (this.activeQuestId && this.activeObjectiveId) return;
        if (this._showFinishedPanel && !this._queueHasOpenQuest(queue)) return;
        this._showFinishedPanel = false;
        this._startNextQuestForMap(mapId);
    }

    _syncStageFoundation() {
        if (IP2Live.MapManager && typeof IP2Live.MapManager.registerStageQuests === 'function') {
            this._stageFoundationSynced = !!IP2Live.MapManager.registerStageQuests(this) || this._stageFoundationSynced;
        }
    }

    _stageSpawnPending(scene) {
        return !!(
            IP2Live.MapManager &&
            typeof IP2Live.MapManager.isStageSpawnPending === 'function' &&
            IP2Live.MapManager.isStageSpawnPending(scene)
        );
    }

    _mapQuestQueue(mapId) {
        const key = Number(mapId);
        return this.mapQuestQueues[key] || {
            questIds: [],
            autoStart: true,
            showFinished: true,
        };
    }

    _startNextQuestForMap(mapId) {
        const queue = this._mapQuestQueue(mapId);
        if (!queue.autoStart) return false;

        const questIds = queue.questIds || [];
        for (let i = 0; i < questIds.length; i++) {
            const questId = questIds[i];
            if (!this.quests[questId]) continue;
            if (this._isQuestFinished(questId)) continue;

            return this.startQuest(questId, {
                mapId,
                mapQuestMode: true,
                keepLastCompletion: true,
                visible: true,
                preview: false,
                guideActive: true,
                allowCompletion: true,
            });
        }

        this.activeQuestId = null;
        this.activeObjectiveId = null;
        this._mapQuestMode = true;
        this._showFinishedPanel = !!queue.showFinished;
        this.visible = !!queue.showFinished;
        this.preview = false;
        this.guideActive = false;
        this.allowCompletion = false;
        if (this._arrowGuide) this._arrowGuide.clear();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return false;
    }

    _queueHasOpenQuest(queue) {
        const questIds = queue && queue.questIds ? queue.questIds : [];
        for (let i = 0; i < questIds.length; i++) {
            const questId = questIds[i];
            if (this.quests[questId] && !this._isQuestFinished(questId)) return true;
        }
        return false;
    }

    _resetMapEntryQuestsForScene(scene, mapId) {
        if (!scene || scene._ip2liveQuestEntryReset) return false;
        const queue = this._mapQuestQueue(mapId);
        if (!queue.questIds || queue.questIds.length === 0) return false;
        scene._ip2liveQuestEntryReset = true;
        if (this._consumeSlotRestoreResetBypass(scene, mapId)) {
            scene._ip2liveQuestEntryResetBypassed = true;
            return true;
        }
        scene._ip2liveQuestEntryResetBypassed = false;
        this._resetMapEntryQuests(mapId);
        return true;
    }

    _pendingSlotRestoreContext(scene) {
        const game = Core && Core.Game ? Core.Game.current : null;
        return (scene && scene._ip2livePendingSlotRestore) ||
            (game && game._ip2livePendingSlotRestore) ||
            this._pendingSlotRestore ||
            null;
    }

    _consumeSlotRestoreResetBypass(scene, mapId) {
        const context = this._pendingSlotRestoreContext(scene);
        if (!context || context.resetBypassConsumed) return false;
        const restoreMapId = Number(context.mapId) || 0;
        if (restoreMapId && restoreMapId !== Number(mapId)) return false;
        if (!context.questState || typeof context.questState !== 'object') return false;

        context.resetBypassConsumed = true;
        if (scene) scene._ip2livePendingSlotRestore = context;
        this._pendingSlotRestore = context;
        return true;
    }

    _resetMapEntryQuests(mapId) {
        const queue = this._mapQuestQueue(mapId);
        const questIds = queue.questIds || [];
        for (let i = 0; i < questIds.length; i++) {
            const quest = this.quests[questIds[i]];
            if (quest && quest.resetOnMapEnter) {
                this.completedObjectives[quest.id] = {};
            }
        }
    }

    _isQuestFinished(questId) {
        return this._firstOpenObjective(questId) === null;
    }

    _getMapId(scene) {
        const current = scene || this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const mapId = current && (
            current.id ||
            current.mapID ||
            (current.currentMap && current.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || 0;
    }

    _setSceneContext(scene) {
        if (!scene) return;
        this._sceneRef = scene;
        const hero = this._getLiveHeroObject(scene) || this._findHeroInScene(scene);
        if (hero && hero.position) this._lastHeroRef = hero;
    }

    _firstOpenObjective(questId) {
        const quest = this.quests[questId];
        if (!quest) return null;
        const done = this.completedObjectives[questId] || {};
        for (let i = 0; i < quest.objectives.length; i++) {
            if (!done[quest.objectives[i].id]) return quest.objectives[i].id;
        }
        return null;
    }

    _objectiveById(quest, objectiveId) {
        if (!quest) return null;
        for (let i = 0; i < quest.objectives.length; i++) {
            if (quest.objectives[i].id === objectiveId) return quest.objectives[i];
        }
        return null;
    }

    _clonePlain(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return {};
        }
    }

    _measureTrackedText(ctx, value, tracking) {
        const text = String(value || '');
        const gap = Math.max(0, Number(tracking) || 0);
        let width = 0;
        for (let i = 0; i < text.length; i++) width += ctx.measureText(text[i]).width;
        return width + Math.max(0, text.length - 1) * gap;
    }

    _drawTrackedText(ctx, value, x, y, tracking) {
        const text = String(value || '');
        if (!text) return 0;
        const gap = Math.max(0, Number(tracking) || 0);
        const width = this._measureTrackedText(ctx, text, gap);
        const oldAlign = ctx.textAlign || 'left';
        let cursorX = x;
        if (oldAlign === 'center') cursorX -= width / 2;
        else if (oldAlign === 'right' || oldAlign === 'end') cursorX -= width;
        ctx.textAlign = 'left';
        for (let i = 0; i < text.length; i++) {
            const glyph = text[i];
            ctx.fillText(glyph, cursorX, y);
            cursorX += ctx.measureText(glyph).width + gap;
        }
        ctx.textAlign = oldAlign;
        return width;
    }

    _traceQuestPanel(ctx, x, y, w, h, sX, sY) {
        const topCut = 27 * sX;
        const sideCut = 10 * sX;
        ctx.beginPath();
        ctx.moveTo(x + topCut, y);
        ctx.lineTo(x + w - sideCut, y);
        ctx.lineTo(x + w, y + 10 * sY);
        ctx.lineTo(x + w - 9 * sX, y + h);
        ctx.lineTo(x + 7 * sX, y + h);
        ctx.lineTo(x, y + h - 8 * sY);
        ctx.lineTo(x, y + 18 * sY);
        ctx.closePath();
    }

    _drawQuestPanelShell(ctx, options) {
        const o = options;

        // Offset extrusion, then a layered graphite face.
        this._traceQuestPanel(ctx, o.x + 6 * o.sX, o.y + 7 * o.sY, o.w, o.h, o.sX, o.sY);
        ctx.fillStyle = 'rgba(0,2,7,0.9)';
        ctx.fill();

        this._traceQuestPanel(ctx, o.x, o.y, o.w, o.h, o.sX, o.sY);
        const panelGrad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
        panelGrad.addColorStop(0, 'rgba(8,22,35,0.98)');
        panelGrad.addColorStop(0.46, 'rgba(3,10,20,0.985)');
        panelGrad.addColorStop(1, 'rgba(8,7,13,0.99)');
        ctx.fillStyle = panelGrad;
        ctx.fill();

        ctx.save();
        this._traceQuestPanel(ctx, o.x, o.y, o.w, o.h, o.sX, o.sY);
        ctx.clip();

        // A restrained scan texture keeps depth without competing with copy.
        for (let sy = o.y + 5 * o.sY; sy < o.y + o.h; sy += 7 * o.sY) {
            ctx.fillStyle = 'rgba(232,250,255,0.018)';
            ctx.fillRect(o.x, sy, o.w, Math.max(0.7, 0.65 * o.sY));
        }
        ctx.fillStyle = 'rgba(0,240,255,0.032)';
        ctx.fillRect(o.x, o.y + ((o.tick * 1.35) % o.h), o.w, 5 * o.sY);
        ctx.restore();

        this._traceQuestPanel(ctx, o.x, o.y, o.w, o.h, o.sX, o.sY);
        ctx.shadowColor = o.accent;
        ctx.shadowBlur = (4 + o.pulse * 2) * Math.min(o.sX, o.sY);
        ctx.strokeStyle = o.accent;
        ctx.lineWidth = Math.max(1.2, 1.5 * o.sX);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(o.x + 29 * o.sX, o.y + 3 * o.sY);
        ctx.lineTo(o.x + o.w - 18 * o.sX, o.y + 3 * o.sY);
        ctx.strokeStyle = 'rgba(224,255,255,0.28)';
        ctx.lineWidth = Math.max(0.7, o.sY);
        ctx.stroke();
    }

    _drawQuestHeaderPlates(ctx, options) {
        const o = options;
        const leftW = 190 * o.sX;
        const rightX = o.x + 190 * o.sX;
        const rightW = 124 * o.sX;
        const plateH = 42 * o.sY;
        const rightCut = 16 * o.sX;

        // Dialogue-style offset extrusions keep the plates raised from the panel.
        ctx.fillStyle = 'rgba(0,0,0,0.74)';
        ctx.fillRect(o.x + 6 * o.sX, o.y + 6 * o.sY, leftW, plateH + 2 * o.sY);

        ctx.beginPath();
        ctx.moveTo(rightX + 6 * o.sX, o.y + 7 * o.sY);
        ctx.lineTo(rightX + rightW + 6 * o.sX, o.y + 7 * o.sY);
        ctx.lineTo(rightX + rightW - rightCut + 6 * o.sX, o.y + plateH + 7 * o.sY);
        ctx.lineTo(rightX + 6 * o.sX, o.y + plateH + 7 * o.sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fill();

        // Straight red plate with the same gradient, hatch, and scan texture as dialogue.
        const leftGrad = ctx.createLinearGradient(o.x, o.y, o.x + leftW, o.y + plateH);
        leftGrad.addColorStop(0, '#FF164D');
        leftGrad.addColorStop(0.42, '#C90042');
        leftGrad.addColorStop(1, '#47001F');
        ctx.fillStyle = leftGrad;
        ctx.shadowColor = 'rgba(255,0,60,0.48)';
        ctx.shadowBlur = 8 * o.sX;
        ctx.fillRect(o.x, o.y, leftW, plateH);
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.beginPath();
        ctx.rect(o.x, o.y, leftW, plateH);
        ctx.clip();
        for (let hx = o.x - plateH; hx < o.x + leftW + plateH; hx += 14 * o.sX) {
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = Math.max(1, 2 * o.sX);
            ctx.beginPath();
            ctx.moveTo(hx, o.y + plateH);
            ctx.lineTo(hx + 38 * o.sX, o.y);
            ctx.stroke();
        }
        for (let hy = o.y + 5 * o.sY; hy < o.y + plateH; hy += 5 * o.sY) {
            ctx.fillStyle = 'rgba(8,0,18,0.08)';
            ctx.fillRect(o.x, hy, leftW, Math.max(1, o.sY));
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.46)';
        ctx.lineWidth = Math.max(1, 1.1 * o.sX);
        ctx.beginPath();
        ctx.moveTo(o.x + 2 * o.sX, o.y + 2 * o.sY);
        ctx.lineTo(o.x + leftW - 3 * o.sX, o.y + 2 * o.sY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(22,0,14,0.72)';
        ctx.beginPath();
        ctx.moveTo(o.x + 2 * o.sX, o.y + plateH - 2 * o.sY);
        ctx.lineTo(o.x + leftW - 2 * o.sX, o.y + plateH - 2 * o.sY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightX, o.y);
        ctx.lineTo(rightX + rightW, o.y);
        ctx.lineTo(rightX + rightW - rightCut, o.y + plateH);
        ctx.lineTo(rightX, o.y + plateH);
        ctx.closePath();
        const rightGrad = ctx.createLinearGradient(rightX, o.y, rightX, o.y + plateH);
        rightGrad.addColorStop(0, '#FFF21A');
        rightGrad.addColorStop(0.58, '#FFD900');
        rightGrad.addColorStop(1, '#D89300');
        ctx.fillStyle = rightGrad;
        ctx.shadowColor = 'rgba(255,230,0,0.38)';
        ctx.shadowBlur = 7 * o.sX;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.clip();
        for (let hx = rightX + rightW * 0.62; hx < rightX + rightW + 26 * o.sX; hx += 12 * o.sX) {
            ctx.strokeStyle = 'rgba(25,13,0,0.14)';
            ctx.lineWidth = 5 * o.sX;
            ctx.beginPath();
            ctx.moveTo(hx, o.y + plateH);
            ctx.lineTo(hx + 30 * o.sX, o.y);
            ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.72)';
        ctx.lineWidth = Math.max(1, 1.1 * o.sX);
        ctx.beginPath();
        ctx.moveTo(rightX + 2 * o.sX, o.y + 2 * o.sY);
        ctx.lineTo(rightX + rightW - 3 * o.sX, o.y + 2 * o.sY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(82,42,0,0.72)';
        ctx.beginPath();
        ctx.moveTo(rightX + 2 * o.sX, o.y + plateH - 2 * o.sY);
        ctx.lineTo(rightX + rightW - rightCut - 2 * o.sX, o.y + plateH - 2 * o.sY);
        ctx.stroke();

    }

    _drawObjectiveRow(ctx, options) {
        const o = options;
        ctx.beginPath();
        ctx.moveTo(o.x + 7 * o.sX, o.y);
        ctx.lineTo(o.x + o.w - 5 * o.sX, o.y);
        ctx.lineTo(o.x + o.w, o.y + 5 * o.sY);
        ctx.lineTo(o.x + o.w - 7 * o.sX, o.y + o.h);
        ctx.lineTo(o.x, o.y + o.h);
        ctx.lineTo(o.x, o.y + 7 * o.sY);
        ctx.closePath();
        const rowGrad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
        rowGrad.addColorStop(0, 'rgba(14,35,49,0.78)');
        rowGrad.addColorStop(0.55, 'rgba(8,15,27,0.86)');
        rowGrad.addColorStop(1, 'rgba(20,7,17,0.74)');
        ctx.fillStyle = rowGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.34)';
        ctx.lineWidth = Math.max(1, o.sX);
        ctx.stroke();

        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(o.x + 5 * o.sX, o.y + 6 * o.sY, 2 * o.sX, o.h - 12 * o.sY);

        const dotPulse = 0.7 + 0.3 * Math.sin(o.tick * 0.2);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + o.red + ',' + (0.75 + dotPulse * 0.25) + ')';
        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 8;
        ctx.arc(o.x + 18 * o.sX, o.y + 22 * o.sY, 6 * o.sX, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = 'bold ' + Math.round(15 * o.sX) + 'px ' + o.font;
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        this._drawTrackedText(
            ctx,
            o.objective.title || 'OBJECTIVE',
            o.x + 36 * o.sX,
            o.y + 20 * o.sY,
            0.55 * o.sX
        );

        ctx.font = Math.round(8.5 * o.sX) + 'px ' + o.font;
        ctx.fillStyle = 'rgba(218,238,255,0.68)';
        this._drawTrackedText(
            ctx,
            o.objective.detail || this._objectiveTargetText(o.objective),
            o.x + 36 * o.sX,
            o.y + 36 * o.sY,
            0.4 * o.sX
        );
    }

    _drawFinishedPanel(ctx) {
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        const headerFont = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : font;
        const tick = this.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
        const panelRect = this._questPanelRect(ctx);
        const qX = panelRect.x;
        const qY = panelRect.y;
        const qW = panelRect.w;
        const qH = panelRect.h;

        ctx.save();
        ctx.shadowBlur = 0;
        this._drawQuestPanelShell(ctx, {
            x: qX,
            y: qY,
            w: qW,
            h: qH,
            sX,
            sY,
            tick,
            pulse,
            accent: '#00F0FF',
        });
        this._drawQuestHeaderPlates(ctx, {
            x: qX,
            y: qY,
            w: qW,
            sX,
            sY,
            tick,
            leftColor: '#FF003C',
            rightColor: '#FFE600',
        });

        ctx.font = 'bold ' + Math.round(14 * sX) + 'px ' + headerFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        this._drawTrackedText(ctx, 'QUEST AREA', qX + 18 * sX, qY + 28 * sY, 0.7 * sX);

        ctx.font = 'bold ' + Math.round(12.5 * sX) + 'px ' + headerFont;
        ctx.fillStyle = '#111111';
        this._drawTrackedText(ctx, 'COMPLETE', qX + 204 * sX, qY + 28 * sY, 0.4 * sX);

        this._drawObjectiveRow(ctx, {
            x: qX + 18 * sX,
            y: qY + 56 * sY,
            w: qW - 36 * sX,
            h: 44 * sY,
            sX,
            sY,
            font,
            objective: {
                title: 'ALL QUESTS FINISHED',
                detail: 'NO ACTIVE OBJECTIVES IN THIS WORLD',
            },
            tick,
            red: '0,240,255',
        });

        this._drawPanelCorners(ctx, qX, qY, qW, qH, sX);
        ctx.restore();
    }

    _questPanelRect(ctx) {
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const marginX = 18 * sX;
        // Neural Life Force occupies the upper-left HUD strip.
        const marginY = 88 * sY;
        return {
            x: marginX,
            y: marginY,
            w: Math.min(430 * sX, cW - marginX * 2),
            h: 126 * sY,
        };
    }

    _drawPanelCorners(ctx, qX, qY, qW, qH, sX) {
        const cr = 12 * sX;
        ctx.beginPath();
        ctx.moveTo(qX, qY + cr); ctx.lineTo(qX, qY); ctx.lineTo(qX + cr, qY);
        ctx.moveTo(qX + qW - cr, qY); ctx.lineTo(qX + qW, qY); ctx.lineTo(qX + qW, qY + cr);
        ctx.moveTo(qX + qW, qY + qH - cr); ctx.lineTo(qX + qW, qY + qH); ctx.lineTo(qX + qW - cr, qY + qH);
        ctx.moveTo(qX, qY + qH - cr); ctx.lineTo(qX, qY + qH); ctx.lineTo(qX + cr, qY + qH);
        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 5;
        ctx.lineWidth = 2 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    _objectiveTargetText(objective) {
        const tile = objective && objective.targetTile ? objective.targetTile : null;
        if (!tile) return '';
        return 'TARGET TILE  X:' + tile.x + '  Y:' + (tile.y || 0) + '  Z:' + tile.z;
    }

    _isObjectiveComplete(objective, context) {
        if (!objective) return false;
        if (typeof objective.isComplete === 'function') {
            return !!objective.isComplete(context, this);
        }
        if (!objective.targetTile) return false;

        const hero = context && context.hero ? context.hero : this._questHero(this._sceneRef);
        const dist = this.distanceToObjective(objective, hero);
        if (dist === null) return false;
        const radius = typeof objective.completionRadiusTiles === 'number'
            ? objective.completionRadiusTiles
            : 0.6;
        return dist <= radius;
    }

    _targetEditorCenter(objective) {
        const tile = objective && objective.targetTile ? objective.targetTile : { x: 0, y: 0, z: 0 };
        return {
            x: Number(tile.x) + 0.5,
            y: Number(tile.y) || 0,
            z: Number(tile.z) + 0.5,
        };
    }

    _tileSize() {
        return (Common && Common.Datas && Common.Datas.Systems && Common.Datas.Systems.SQUARE_SIZE) ||
            (Data && Data.Systems && Data.Systems.SQUARE_SIZE) ||
            16;
    }

    _positionUsesEditorUnits(position) {
        if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') return false;
        const scene = this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const map = scene && scene.currentMap;
        const props = map && map.mapProperties;
        if (props && props.length && props.width) {
            return Math.abs(position.x) <= props.length + 4 &&
                Math.abs(position.z) <= props.width + 4;
        }
        return Math.abs(position.x) < 96 && Math.abs(position.z) < 96;
    }

    _heroWorldPosition(hero) {
        if (!hero || !hero.position) return null;
        const p = hero.position;
        if (typeof p.x !== 'number' || typeof p.z !== 'number') return null;
        return { x: p.x, y: typeof p.y === 'number' ? p.y : 0, z: p.z };
    }

    _heroEditorPosition(hero) {
        const pos = this._heroWorldPosition(hero);
        if (!pos) return null;
        if (this._positionUsesEditorUnits(pos)) return pos;
        const tileSize = this._tileSize();
        return {
            x: pos.x / tileSize,
            y: pos.y / tileSize,
            z: pos.z / tileSize,
        };
    }

    _questHero(scene) {
        const current = scene || this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const hero = this._getLiveHeroObject(current) || this._findHeroInScene(current);
        if (hero && hero.position) {
            this._lastHeroRef = hero;
            return hero;
        }
        return this._lastHeroRef || null;
    }

    _getLiveHeroObject(scene) {
        const current = scene || this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const candidates = [
            current && current.heroMapObject,
            Scene.Map.current && Scene.Map.current.heroMapObject,
            current && current.hero,
            current && current.player,
            Scene.Map.current && Scene.Map.current.hero,
            Scene.Map.current && Scene.Map.current.player,
            Core.Game.current && Core.Game.current.heroMapObject,
            Core.Game.current && Core.Game.current.hero,
            Core.Game.current && Core.Game.current.player,
        ];
        for (let i = 0; i < candidates.length; i++) {
            if (this._hasPosition(candidates[i])) {
                this._lastHeroPath = i === 0 ? 'scene.heroMapObject'
                    : i === 1 ? 'Scene.Map.current.heroMapObject'
                    : i === 2 ? 'scene.hero'
                    : i === 3 ? 'scene.player'
                    : i === 4 ? 'Scene.Map.current.hero'
                    : i === 5 ? 'Scene.Map.current.player'
                    : i === 6 ? 'Core.Game.current.heroMapObject'
                    : i === 7 ? 'Core.Game.current.hero'
                    : 'Core.Game.current.player';
                return candidates[i];
            }
        }
        return null;
    }

    _hasPosition(obj) {
        return obj &&
            !(obj.name && String(obj.name).indexOf('IP2Live_') === 0) &&
            obj.position &&
            typeof obj.position.x === 'number' &&
            typeof obj.position.z === 'number';
    }

    _looksLikeHero(obj, keyHint) {
        if (!this._hasPosition(obj)) return false;
        const hint = (keyHint || '').toLowerCase();
        if (hint.indexOf('hero') !== -1 || hint.indexOf('player') !== -1) return true;
        if (obj === (Core.Game.current && Core.Game.current.hero)) return true;
        if (obj === (Core.Game.current && Core.Game.current.heroMapObject)) return true;
        if (obj.isHero || obj.isPlayer || obj.isCurrentHero) return true;
        if (obj.kind === 'hero' || obj.kind === 'player') return true;
        if (obj.name === 'Hero' || obj.name === 'Player') return true;
        return false;
    }

    _findHeroInScene(scene) {
        const direct = [
            scene && scene.heroMapObject,
            Scene.Map.current && Scene.Map.current.heroMapObject,
            scene && scene.hero,
            scene && scene.player,
            Scene.Map.current && Scene.Map.current.hero,
            Scene.Map.current && Scene.Map.current.player,
            Core.Game.current && Core.Game.current.heroMapObject,
            Core.Game.current && Core.Game.current.hero,
            Core.Game.current && Core.Game.current.player,
        ];
        for (let i = 0; i < direct.length; i++) {
            if (this._hasPosition(direct[i])) return direct[i];
        }

        const roots = [];
        const push = (obj, label) => { if (obj) roots.push({ obj, label }); };
        push(scene, 'scene');
        push(Scene.Map.current, 'Scene.Map.current');
        push(Core.Game.current, 'Core.Game.current');
        push(Manager.Stack, 'Manager.Stack');

        const visited = [];
        const fallback = [];
        const queue = roots.map((root) => ({ obj: root.obj, path: root.label, depth: 0 }));

        while (queue.length > 0 && visited.length < 700) {
            const entry = queue.shift();
            const obj = entry.obj;
            if (!obj || typeof obj !== 'object') continue;
            if (visited.indexOf(obj) !== -1) continue;
            visited.push(obj);

            if (this._looksLikeHero(obj, entry.path)) {
                this._lastHeroPath = entry.path;
                return obj;
            }
            if (this._hasPosition(obj)) fallback.push({ obj, path: entry.path });
            if (entry.depth >= 4) continue;

            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length && i < 80; i++) {
                    queue.push({ obj: obj[i], path: entry.path + '[' + i + ']', depth: entry.depth + 1 });
                }
                continue;
            }

            let keys = [];
            try { keys = Object.keys(obj); } catch (e) { keys = []; }
            for (let i = 0; i < keys.length && i < 90; i++) {
                const key = keys[i];
                if (key === 'parent' || key === 'mesh' || key === 'geometry' || key === 'material') continue;
                let value = null;
                try { value = obj[key]; } catch (e) { value = null; }
                if (value && typeof value === 'object') {
                    queue.push({ obj: value, path: entry.path + '.' + key, depth: entry.depth + 1 });
                }
            }
        }

        if (fallback.length > 0) {
            for (let i = 0; i < fallback.length; i++) {
                const path = String(fallback[i].path || '').toLowerCase();
                if (path.indexOf('mapobjects[') !== -1 || path.indexOf('currentmap') !== -1) continue;
                this._lastHeroPath = fallback[i].path;
                return fallback[i].obj;
            }
        }
        return null;
    }

    _getActiveThreeCamera(scene) {
        const current = scene || this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        if (current && current.camera) {
            if (typeof current.camera.getThreeCamera === 'function') return current.camera.getThreeCamera();
            if (current.camera.threeCamera) return current.camera.threeCamera;
        }
        if (Manager && Manager.GL && Manager.GL.camera) return Manager.GL.camera;
        if (Manager && Manager.Camera && Manager.Camera.camera) return Manager.Camera.camera;
        return null;
    }
}

const QuestManager = new IP2LiveQuestManager();
IP2Live.QuestManager = QuestManager;
window.IP2LiveQuestManager = QuestManager;

console.log('[IP2Live] quest_manager.js module loaded.');
