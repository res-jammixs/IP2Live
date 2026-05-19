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
        this.VERSION = 'quest-manager-20260518-02';

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
        if (!ctx || !this.visible || this.suppressedByDialogue) return;

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
        const font = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const tick = this.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);

        const panelRect = this._questPanelRect(ctx);
        const qW = panelRect.w;
        const qH = panelRect.h;
        const qX = panelRect.x;
        const qY = panelRect.y;
        const slant = 28 * sX;
        const red = '255,0,60';
        const cyan = '0,240,255';

        ctx.save();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(qX + slant, qY);
        ctx.lineTo(qX + qW, qY);
        ctx.lineTo(qX + qW - 12 * sX, qY + qH);
        ctx.lineTo(qX, qY + qH);
        ctx.lineTo(qX, qY + 18 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3, 7, 20, 0.94)';
        ctx.fill();

        ctx.save();
        ctx.clip();
        const scanY = qY + ((tick * 1.35) % qH);
        for (let sy = qY; sy < qY + qH; sy += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.035)';
            ctx.fillRect(qX, sy, qW, Math.max(1, sY));
        }
        ctx.fillStyle = 'rgba(0,240,255,0.06)';
        ctx.fillRect(qX, scanY, qW, 7 * sY);
        ctx.restore();

        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 12 + pulse * 8;
        ctx.strokeStyle = 'rgba(' + red + ',' + (0.65 + pulse * 0.25) + ')';
        ctx.lineWidth = 2 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(qX, qY + 8 * sY);
        ctx.lineTo(qX + 168 * sX, qY);
        ctx.lineTo(qX + 145 * sX, qY + 37 * sY);
        ctx.lineTo(qX, qY + 45 * sY);
        ctx.closePath();
        ctx.fillStyle = '#FF003C';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(qX + 156 * sX, qY);
        ctx.lineTo(qX + 222 * sX, qY);
        ctx.lineTo(qX + 199 * sX, qY + 37 * sY);
        ctx.lineTo(qX + 140 * sX, qY + 37 * sY);
        ctx.closePath();
        ctx.fillStyle = '#FFE600';
        ctx.fill();

        ctx.font = 'bold ' + Math.round(16 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(quest.title || 'QUEST AREA', qX + 14 * sX, qY + 27 * sY);

        ctx.font = 'bold ' + Math.round(8 * sX) + 'px monospace';
        ctx.fillStyle = '#111111';
        ctx.fillText('REQUIRED', qX + 154 * sX, qY + 24 * sY);

        ctx.font = Math.round(8 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(' + cyan + ',0.72)';
        ctx.textAlign = 'right';
        ctx.fillText(this.preview ? 'OBJECTIVE_PREVIEW' : 'LIVE_TRACKING', qX + qW - 18 * sX, qY + 22 * sY);

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

        const hero = this._questHero(this._sceneRef);
        const dist = this.distanceToObjective(objective, hero);
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

        const progress = this._progressLabel(quest, objective);
        ctx.font = Math.round(8.5 * sX) + 'px monospace';
        ctx.fillStyle = '#00F0FF';
        ctx.textAlign = 'right';
        ctx.fillText(
            (dist === null ? 'DIST: --' : 'DIST: ' + dist.toFixed(1) + ' tiles') + '  ' + progress,
            qX + qW - 18 * sX,
            qY + 120 * sY
        );

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
        this._resetMapEntryQuests(mapId);
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

    _progressLabel(quest, objective) {
        if (!quest || !objective) return '';
        let index = 0;
        for (let i = 0; i < quest.objectives.length; i++) {
            if (quest.objectives[i].id === objective.id) index = i + 1;
        }
        return 'OBJ ' + String(index).padStart(2, '0') + '/' + String(quest.objectives.length).padStart(2, '0');
    }

    _drawObjectiveRow(ctx, options) {
        const o = options;
        ctx.fillStyle = 'rgba(255,255,255,0.055)';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = 'rgba(0,240,255,0.22)';
        ctx.lineWidth = Math.max(1, o.sX);
        ctx.strokeRect(o.x, o.y, o.w, o.h);

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
        ctx.fillText(o.objective.title || 'OBJECTIVE', o.x + 36 * o.sX, o.y + 20 * o.sY);

        ctx.font = Math.round(8.5 * o.sX) + 'px monospace';
        ctx.fillStyle = 'rgba(218,238,255,0.68)';
        ctx.fillText(o.objective.detail || this._objectiveTargetText(o.objective), o.x + 36 * o.sX, o.y + 36 * o.sY);
    }

    _drawFinishedPanel(ctx) {
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const font = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const tick = this.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
        const panelRect = this._questPanelRect(ctx);
        const qX = panelRect.x;
        const qY = panelRect.y;
        const qW = panelRect.w;
        const qH = panelRect.h;
        const slant = 28 * sX;

        ctx.save();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(qX + slant, qY);
        ctx.lineTo(qX + qW, qY);
        ctx.lineTo(qX + qW - 12 * sX, qY + qH);
        ctx.lineTo(qX, qY + qH);
        ctx.lineTo(qX, qY + 18 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3, 7, 20, 0.94)';
        ctx.fill();

        ctx.save();
        ctx.clip();
        for (let sy = qY; sy < qY + qH; sy += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.035)';
            ctx.fillRect(qX, sy, qW, Math.max(1, sY));
        }
        ctx.fillStyle = 'rgba(0,240,255,0.055)';
        ctx.fillRect(qX, qY + ((tick * 1.35) % qH), qW, 7 * sY);
        ctx.restore();

        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 10 + pulse * 8;
        ctx.strokeStyle = 'rgba(0,240,255,' + (0.62 + pulse * 0.24) + ')';
        ctx.lineWidth = 2 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(qX, qY + 8 * sY);
        ctx.lineTo(qX + 168 * sX, qY);
        ctx.lineTo(qX + 145 * sX, qY + 37 * sY);
        ctx.lineTo(qX, qY + 45 * sY);
        ctx.closePath();
        ctx.fillStyle = '#00F0FF';
        ctx.fill();

        ctx.font = 'bold ' + Math.round(16 * sX) + 'px ' + font;
        ctx.fillStyle = '#07101C';
        ctx.textAlign = 'left';
        ctx.fillText('QUEST AREA', qX + 14 * sX, qY + 27 * sY);

        const rowX = qX + 18 * sX;
        const rowY = qY + 56 * sY;
        const rowW = qW - 36 * sX;
        const rowH = 44 * sY;
        ctx.fillStyle = 'rgba(255,255,255,0.055)';
        ctx.fillRect(rowX, rowY, rowW, rowH);
        ctx.strokeStyle = 'rgba(0,240,255,0.22)';
        ctx.lineWidth = Math.max(1, sX);
        ctx.strokeRect(rowX, rowY, rowW, rowH);

        ctx.font = 'bold ' + Math.round(15 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        ctx.fillText('ALL QUESTS FINISHED', rowX + 18 * sX, rowY + 21 * sY);

        ctx.font = Math.round(8.5 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(218,238,255,0.68)';
        ctx.fillText('NO ACTIVE OBJECTIVES IN THIS WORLD', rowX + 18 * sX, rowY + 37 * sY);

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
        const marginY = 18 * sY;
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
