/**
 * IP2Live - Neural Life Force Manager
 *
 * Owns the cross-gameplay survivability loop. Gameplay screens only report
 * their normal completed / terminal-failed lifecycle events; this module
 * applies Life Force, rollback, tutorial recovery, critical pressure, and
 * persistent HUD state in one place.
 */

(function () {
    const STORE_KEY = 'neuralLifeForce';
    const HUD_STATE_KEY = 'neuralLifeForce';
    const DEFAULT_LIFE_FORCE = 100;
    const MAX_LIFE_FORCE = 100;
    const CRITICAL_LIFE_FORCE = 35;
    const QUEST_FAILURE_TUTORIAL_LIMIT = 3;
    const GAMEPLAY_FAILURE_TUTORIAL_LIMIT = 10;

    function clone(value) {
        try { return JSON.parse(JSON.stringify(value || null)); }
        catch (e) { return value || null; }
    }

    const NeuralLifeForce = {
        VERSION: 'neural-life-force-20260826-02',
        SETTINGS: {
            defaultLifeForce: DEFAULT_LIFE_FORCE,
            maxLifeForce: MAX_LIFE_FORCE,
            criticalLifeForce: CRITICAL_LIFE_FORCE,
            exactQuestTutorialLimit: QUEST_FAILURE_TUTORIAL_LIMIT,
            gameplayTypeTutorialLimit: GAMEPLAY_FAILURE_TUTORIAL_LIMIT,
            criticalTimerMultiplier: 0.75,
            criticalPatchSpeedMultiplier: 1.25,
        },
        _fallbackStore: null,

        // Internal HUD animation cache
        _animHp: undefined,
        _ghostHp: undefined,
        _lastFrameTs: 0,

        boot() {
            this._state();
            this._registerHudState();
            return true;
        },

        reset() {
            const root = this._root(true);
            if (!root) return false;
            root[STORE_KEY] = this._newState();
            this._animHp = DEFAULT_LIFE_FORCE;
            this._ghostHp = DEFAULT_LIFE_FORCE;
            this._requestHudPaint();
            return true;
        },

        getState() {
            return clone(this._state());
        },

        isCritical() {
            const state = this._state();
            return !state.runOver && Number(state.lifeForce) <= CRITICAL_LIFE_FORCE;
        },

        isRunOver() {
            return !!this._state().runOver;
        },

        /**
         * Adds the current critical-mode options immediately before a gameplay
         * screen is created. Unsupported gameplays still receive the marker so
         * they can display critical UI without a per-level rule.
         */
        prepareLaunchOptions(gameplayId, options) {
            const opts = Object.assign({}, options || {});
            const state = this._state();
            const tutorial = this._isTutorial(opts);
            opts.neuralLifeForce = Number(state.lifeForce);
            opts.neuralCritical = !tutorial && this.isCritical();
            opts.neuralRunBlocked = !!state.runOver;
            if (!opts.neuralCritical || opts.neuralRunBlocked) return opts;

            if (gameplayId === 'ip_patch_panel_classes') {
                const baseSpeed = Number(opts.speedMultiplier);
                opts.speedMultiplier = (Number.isFinite(baseSpeed) && baseSpeed > 0 ? baseSpeed : 0.88)
                    * this.SETTINGS.criticalPatchSpeedMultiplier;
            }
            if (gameplayId === 'ip_host_power_reactor') {
                const baseSeconds = Number(opts.durationSeconds);
                opts.durationSeconds = Math.max(
                    10,
                    (Number.isFinite(baseSeconds) && baseSeconds > 0 ? baseSeconds : 60)
                        * this.SETTINGS.criticalTimerMultiplier
                );
            }
            return opts;
        },

        /** Record a successfully completed quest. */
        handleCompletion(payload) {
            const data = payload || {};
            const state = this._state();
            if (state.runOver) return { handled: false, reason: 'run-over' };

            state.successStreak = Math.max(0, Number(state.successStreak) || 0) + 1;
            state.failureStreak = 0;
            const reward = Math.min(15, 9 + state.successStreak);
            state.lifeForce = Math.min(MAX_LIFE_FORCE, Math.max(0, Number(state.lifeForce) || 0) + reward);
            delete state.questTerminalFailures[this._questFailureKey(data)];
            state.lastChange = this._changeRecord('success', reward, data);

            this._attachState(data, state, reward);
            this._requestHudPaint();
            return { handled: true, delta: reward, state: this.getState() };
        },

        /**
         * Record one final failure (attempts exhausted). Tutorials are allowed
         * to coach/retry normally and therefore do not consume Life Force.
         */
        handleTerminalFailure(payload) {
            const data = payload || {};
            const result = data.result || {};
            const state = this._state();
            if (state.runOver) return { handled: true, gameOver: true, reason: 'run-over' };
            if (String(result.reason || '') !== 'attempts_exhausted') return { handled: false, reason: 'not-terminal' };
            if (this._isTutorial(data)) {
                const tutorialRecovery = this._retryTutorial(data);
                data.neuralRecovery = tutorialRecovery.kind;
                data.neuralRecoveryHandled = !!tutorialRecovery.handled;
                if (data.neuralRecoveryHandled) data.recoveryAction = 'neural_tutorial_retry';
                this._requestHudPaint();
                return Object.assign({ handled: !!data.neuralRecoveryHandled, state: this.getState() }, tutorialRecovery);
            }

            const gameplayId = this._canonicalGameplayId(data);
            if (gameplayId) data.neuralGameplayId = gameplayId;

            state.failureStreak = Math.max(0, Number(state.failureStreak) || 0) + 1;
            state.successStreak = 0;
            const loss = Math.min(16, 8 + state.failureStreak * 2);
            state.lifeForce = Math.max(0, (Number(state.lifeForce) || 0) - loss);

            const questKey = this._questFailureKey(data, gameplayId);
            state.questTerminalFailures[questKey] = Math.max(0, Number(state.questTerminalFailures[questKey]) || 0) + 1;
            state.gameplayTerminalFailures[gameplayId] = Math.max(0, Number(state.gameplayTerminalFailures[gameplayId]) || 0) + 1;
            state.lastChange = this._changeRecord('failure', -loss, data);
            this._attachState(data, state, -loss);

            if (state.lifeForce <= 0) {
                state.runOver = true;
                data.neuralGameOver = true;
                data.neuralRecoveryHandled = true;
                this._requestHudPaint();
                this._showGameOver();
                return { handled: true, gameOver: true, delta: -loss, state: this.getState() };
            }

            const exactFailures = state.questTerminalFailures[questKey];
            const gameplayFailures = state.gameplayTerminalFailures[gameplayId];
            let recovery = null;
            if (exactFailures >= QUEST_FAILURE_TUTORIAL_LIMIT || gameplayFailures >= GAMEPLAY_FAILURE_TUTORIAL_LIMIT) {
                const reason = exactFailures >= QUEST_FAILURE_TUTORIAL_LIMIT
                    ? 'exact-quest-limit'
                    : 'gameplay-type-limit';
                recovery = this._beginTutorialRecovery(data, reason);
                delete state.questTerminalFailures[questKey];
                if (gameplayFailures >= GAMEPLAY_FAILURE_TUTORIAL_LIMIT) {
                    state.gameplayTerminalFailures[gameplayId] = 0;
                }
            } else {
                recovery = this._applyRollback(data);
            }

            this._dimRollbackLighting(data, recovery);
            data.neuralRecovery = recovery && recovery.kind ? recovery.kind : null;
            if (!data.recoveryAction && data.neuralRecovery) {
                data.recoveryAction = data.neuralRecovery === 'tutorial-recovery'
                    ? 'neural_tutorial_recovery'
                    : 'neural_matching_gameplay_rollback';
            }
            data.neuralRecoveryHandled = !!(recovery && recovery.handled);
            this._requestHudPaint();
            return Object.assign({ handled: !!data.neuralRecoveryHandled, delta: -loss, state: this.getState() }, recovery || {});
        },

        handleMapEntered(mapId, context) {
            const state = this._state();
            const pending = state.pendingTutorialRecovery;
            if (!pending || Number(pending.mapId) !== Number(mapId)) return false;
            const applied = this._applyPendingTutorialRecovery(pending);
            if (applied) {
                state.pendingTutorialRecovery = null;
                this._requestHudPaint();
                setTimeout(() => this._showRecoveryOverlay(pending), 180);
            }
            return applied;
        },

        _newState() {
            return {
                version: this.VERSION,
                lifeForce: DEFAULT_LIFE_FORCE,
                successStreak: 0,
                failureStreak: 0,
                questTerminalFailures: {},
                gameplayTerminalFailures: {},
                lastChange: null,
                pendingTutorialRecovery: null,
                runOver: false,
            };
        },

        _root(create) {
            const game = Core && Core.Game ? Core.Game.current : null;
            if (game) {
                if (!game.ip2liveGameStates && create !== false) game.ip2liveGameStates = {};
                return game.ip2liveGameStates || null;
            }
            if (!this._fallbackStore && create !== false) this._fallbackStore = {};
            return this._fallbackStore;
        },

        _state() {
            const root = this._root(true);
            if (!root[STORE_KEY] || typeof root[STORE_KEY] !== 'object') root[STORE_KEY] = this._newState();
            const state = root[STORE_KEY];
            state.lifeForce = Math.max(0, Math.min(MAX_LIFE_FORCE, Number(state.lifeForce)));
            if (!Number.isFinite(state.lifeForce)) state.lifeForce = DEFAULT_LIFE_FORCE;
            state.successStreak = Math.max(0, Number(state.successStreak) || 0);
            state.failureStreak = Math.max(0, Number(state.failureStreak) || 0);
            if (!state.questTerminalFailures || typeof state.questTerminalFailures !== 'object') state.questTerminalFailures = {};
            if (!state.gameplayTerminalFailures || typeof state.gameplayTerminalFailures !== 'object') state.gameplayTerminalFailures = {};
            state.runOver = !!state.runOver;
            return state;
        },

        _isTutorial(data) {
            const source = data || {};
            const spec = source.spec || {};
            return !!(source.tutorial || spec.tutorial || spec.harderIntro || source.harderIntro);
        },

        _questFailureKey(data, gameplayId) {
            const source = data || {};
            const spec = source.spec || {};
            return [
                String(gameplayId || this._canonicalGameplayId(source) || source.gameplayId || spec.gameplayId || 'unknown'),
                String(source.questId || spec.id || 'quest'),
                String(source.objectiveId || spec.objectiveId || 'objective'),
            ].join('::');
        },

        _changeRecord(kind, delta, data) {
            return {
                kind,
                delta,
                lifeForce: this._state().lifeForce,
                gameplayId: data.gameplayId || null,
                questId: data.questId || null,
                objectiveId: data.objectiveId || null,
                at: Date.now(),
            };
        },

        _attachState(data, state, delta) {
            data.neuralLifeForce = Number(state.lifeForce);
            data.neuralLifeForceDelta = Number(delta);
            data.neuralCritical = Number(state.lifeForce) <= CRITICAL_LIFE_FORCE;
            data.neuralSuccessStreak = Number(state.successStreak) || 0;
            data.neuralFailureStreak = Number(state.failureStreak) || 0;
        },

        _entriesForMap(mapId) {
            const qm = IP2Live.QuestManager;
            const queue = qm && qm.mapQuestQueues ? qm.mapQuestQueues[Number(mapId)] : null;
            const ids = queue && Array.isArray(queue.questIds) ? queue.questIds : [];
            const entries = [];
            for (let i = 0; i < ids.length; i++) {
                const quest = qm && qm.quests ? qm.quests[ids[i]] : null;
                if (!quest || !Array.isArray(quest.objectives)) continue;
                for (let o = 0; o < quest.objectives.length; o++) {
                    const objective = quest.objectives[o];
                    if (!objective || !objective.id) continue;
                    entries.push({
                        questId: quest.id,
                        objectiveId: objective.id,
                        gameplayId: this._gameplayIdForQuestObjective(quest.id, objective.id) ||
                            objective.neuralGameplayId || objective.gameplayId || null,
                        tutorial: !!(objective.neuralTutorial || objective.tutorial || objective.harderIntro),
                        questIndex: i,
                        objectiveIndex: o,
                    });
                }
            }
            return entries;
        },

        _isObjectiveCompleted(questId, objectiveId) {
            const qm = IP2Live.QuestManager;
            return !!(qm && qm.completedObjectives && qm.completedObjectives[questId] && qm.completedObjectives[questId][objectiveId]);
        },

        _clearObjective(questId, objectiveId) {
            const qm = IP2Live.QuestManager;
            if (!qm || !questId || !objectiveId) return false;
            if (!qm.completedObjectives[questId]) qm.completedObjectives[questId] = {};
            delete qm.completedObjectives[questId][objectiveId];
            return true;
        },

        _startQuest(questId, mapId) {
            const qm = IP2Live.QuestManager;
            if (!qm || typeof qm.startQuest !== 'function' || !questId) return false;
            return qm.startQuest(questId, {
                mapId: Number(mapId) || qm.activeMapId,
                mapQuestMode: true,
                keepLastCompletion: true,
                visible: true,
                preview: false,
                guideActive: true,
                allowCompletion: true,
            });
        },

        _applyRollback(data) {
            const mapId = Number(data.mapId || (data.spec && data.spec.mapId));
            const gameplayId = this._canonicalGameplayId(data);
            const questId = data.questId || (data.spec && data.spec.id);
            const objectiveId = data.objectiveId || (data.spec && data.spec.objectiveId);
            if (!mapId || !gameplayId || !questId || !objectiveId) return { handled: false, reason: 'rollback-context-missing' };

            const entries = this._entriesForMap(mapId);
            let failedIndex = entries.findIndex((entry) => entry.questId === questId && entry.objectiveId === objectiveId);
            if (failedIndex < 0) failedIndex = entries.length;
            let rollback = null;
            for (let i = failedIndex - 1; i >= 0; i--) {
                const entry = entries[i];
                if (entry.gameplayId !== gameplayId) continue;
                if (this._isObjectiveCompleted(entry.questId, entry.objectiveId)) {
                    rollback = entry;
                    break;
                }
            }
            if (!rollback) rollback = { questId, objectiveId, gameplayId };

            this._clearObjective(questId, objectiveId);
            this._clearObjective(rollback.questId, rollback.objectiveId);
            const started = this._startQuest(rollback.questId, mapId);
            data.rollbackQuestId = rollback.questId;
            data.rollbackObjectiveId = rollback.objectiveId;
            data.rollbackQuestLabel = this._questLabel(rollback.questId, rollback.objectiveId);
            return {
                handled: !!started,
                kind: 'rollback',
                rollbackQuestId: rollback.questId,
                rollbackObjectiveId: rollback.objectiveId,
            };
        },

        _retryTutorial(data) {
            const source = data || {};
            const spec = source.spec || {};
            const mapId = Number(source.mapId || spec.mapId);
            const questId = source.questId || spec.id;
            const objectiveId = source.objectiveId || spec.objectiveId;
            if (!mapId || !questId || !objectiveId) {
                return { handled: false, kind: 'tutorial-retry', reason: 'tutorial-context-missing' };
            }
            this._clearObjective(questId, objectiveId);
            const started = this._startQuest(questId, mapId);
            source.rollbackQuestId = questId;
            source.rollbackObjectiveId = objectiveId;
            source.rollbackQuestLabel = this._questLabel(questId, objectiveId);
            return {
                handled: !!started,
                kind: 'tutorial-retry',
                rollbackQuestId: questId,
                rollbackObjectiveId: objectiveId,
            };
        },

        _canonicalGameplayId(data) {
            const source = data || {};
            const spec = source.spec || {};
            const questId = source.questId || spec.id;
            const objectiveId = source.objectiveId || spec.objectiveId;
            return this._gameplayIdForQuestObjective(questId, objectiveId) ||
                String(source.gameplayId || spec.gameplayId || '');
        },

        _gameplayIdForQuestObjective(questId, objectiveId) {
            const gm = IP2Live.GameManager;
            const catalog = gm && typeof gm.getGameplayCatalog === 'function' ? gm.getGameplayCatalog() : [];
            const wantedQuestId = String(questId || '');
            const wantedObjectiveId = String(objectiveId || '');
            if (!wantedQuestId || !wantedObjectiveId) return null;
            for (let i = 0; i < catalog.length; i++) {
                const gameplay = catalog[i] || {};
                const quests = Array.isArray(gameplay.quests) ? gameplay.quests : [];
                for (let q = 0; q < quests.length; q++) {
                    const spec = quests[q] || {};
                    if (String(spec.id || '') !== wantedQuestId) continue;
                    const objectives = Array.isArray(spec.objectives) && spec.objectives.length ? spec.objectives : [spec];
                    for (let o = 0; o < objectives.length; o++) {
                        const objective = objectives[o] || {};
                        if (String(objective.objectiveId || spec.objectiveId || '') !== wantedObjectiveId) continue;
                        const resolved = objective.gameplayId || spec.gameplayId || gameplay.gameplayId;
                        return resolved ? String(resolved) : null;
                    }
                }
            }
            return null;
        },

        _beginTutorialRecovery(data, reason) {
            const target = this._tutorialTargetForGameplay(this._canonicalGameplayId(data));
            if (!target) return this._applyRollback(data);
            const state = this._state();
            const pending = {
                kind: 'tutorial-recovery',
                reason,
                gameplayId: target.gameplayId,
                mapId: target.mapId,
                questId: target.questId,
                objectiveId: target.objectiveId,
                label: target.label || this._questLabel(target.questId, target.objectiveId),
                failedQuestId: data.questId || null,
                failedObjectiveId: data.objectiveId || null,
                requestedAt: Date.now(),
            };
            state.pendingTutorialRecovery = pending;
            data.neuralTutorialRecovery = true;
            data.neuralTutorialReason = reason;
            data.rollbackQuestId = target.questId;
            data.rollbackObjectiveId = target.objectiveId;

            const currentMapId = this._currentMapId();
            if (Number(currentMapId) === Number(target.mapId)) {
                const applied = this._applyPendingTutorialRecovery(pending);
                if (applied) {
                    state.pendingTutorialRecovery = null;
                    setTimeout(() => this._showRecoveryOverlay(pending), 180);
                }
                return { handled: applied, kind: 'tutorial-recovery', tutorialTarget: clone(pending) };
            }

            const gm = IP2Live.GameManager;
            const transitioned = !!(gm && typeof gm.startMapFlow === 'function' && gm.startMapFlow(target.mapId, null, {
                mode: 'stage',
                status: 'APEX Countermeasure',
                detail: 'Routing to ' + (target.label || 'tutorial relay'),
                neuralTutorialRecovery: true,
                skipStageIntro: true,
                cleanMapSession: true,
                discardDialogue: true,
            }));
            return { handled: transitioned, kind: 'tutorial-recovery', tutorialTarget: clone(pending) };
        },

        _applyPendingTutorialRecovery(pending) {
            const recovery = pending || this._state().pendingTutorialRecovery;
            const qm = IP2Live.QuestManager;
            if (!recovery || !qm || !qm.mapQuestQueues || !qm.quests) return false;
            const queue = qm.mapQuestQueues[Number(recovery.mapId)];
            const ids = queue && Array.isArray(queue.questIds) ? queue.questIds : [];
            const tutorialQuestIndex = ids.indexOf(recovery.questId);
            const tutorialQuest = qm.quests[recovery.questId];
            if (tutorialQuestIndex < 0 || !tutorialQuest || !Array.isArray(tutorialQuest.objectives)) return false;

            for (let i = tutorialQuestIndex; i < ids.length; i++) {
                const id = ids[i];
                const quest = qm.quests[id];
                if (!quest || !Array.isArray(quest.objectives)) continue;
                qm.completedObjectives[id] = {};
                if (i !== tutorialQuestIndex) continue;
                for (let o = 0; o < quest.objectives.length; o++) {
                    if (quest.objectives[o] && quest.objectives[o].id === recovery.objectiveId) break;
                    if (quest.objectives[o] && quest.objectives[o].id) {
                        qm.completedObjectives[id][quest.objectives[o].id] = true;
                    }
                }
            }
            return this._startQuest(recovery.questId, recovery.mapId);
        },

        _tutorialTargetForGameplay(gameplayId) {
            const gm = IP2Live.GameManager;
            const catalog = gm && typeof gm.getGameplayCatalog === 'function' ? gm.getGameplayCatalog() : [];
            const wanted = String(gameplayId || '');
            const candidates = [];
            for (let i = 0; i < catalog.length; i++) {
                const gameplay = catalog[i] || {};
                const quests = Array.isArray(gameplay.quests) ? gameplay.quests : [];
                for (let q = 0; q < quests.length; q++) {
                    const spec = quests[q] || {};
                    const objectives = Array.isArray(spec.objectives) && spec.objectives.length ? spec.objectives : [spec];
                    for (let o = 0; o < objectives.length; o++) {
                        const objective = objectives[o] || {};
                        const objectiveGameplayId = String(objective.gameplayId || spec.gameplayId || gameplay.gameplayId || '');
                        if (objectiveGameplayId !== wanted) continue;
                        if (!(objective.tutorial || spec.tutorial || spec.harderIntro)) continue;
                        candidates.push({
                            gameplayId: wanted,
                            mapId: Number(spec.mapId || gameplay.mapId),
                            questId: spec.id,
                            objectiveId: objective.objectiveId || spec.objectiveId,
                            label: objective.label || spec.label || objective.title || spec.title || wanted,
                            catalogIndex: i,
                            questIndex: q,
                            objectiveIndex: o,
                        });
                    }
                }
            }
            candidates.sort((a, b) => a.mapId - b.mapId || a.catalogIndex - b.catalogIndex || a.questIndex - b.questIndex || a.objectiveIndex - b.objectiveIndex);
            return candidates[0] || null;
        },

        _dimRollbackLighting(data, recovery) {
            if (!recovery || !recovery.handled || recovery.kind === 'tutorial-recovery') return false;
            const gsm = IP2Live.GameStateManager;
            if (!gsm || typeof gsm.recordDarklightsRollback !== 'function') return false;
            const mapId = Number(data.mapId || (data.spec && data.spec.mapId));
            const objectiveId = recovery.rollbackObjectiveId || data.objectiveId;
            const stored = gsm.recordDarklightsRollback('neural-life-force-rollback', mapId, objectiveId);
            data.darklightsDimmed = !!stored;
            return !!stored;
        },

        _questLabel(questId, objectiveId) {
            const qm = IP2Live.QuestManager;
            const quest = qm && qm.quests ? qm.quests[questId] : null;
            const objective = quest && Array.isArray(quest.objectives)
                ? quest.objectives.find((entry) => entry && entry.id === objectiveId)
                : null;
            return (objective && objective.title) || (quest && quest.title) || questId || 'the active relay';
        },

        _currentMapId() {
            const scene = Scene && Scene.Map ? Scene.Map.current : null;
            return Number(
                scene && (scene.id || scene.mapID || (scene.currentMap && scene.currentMap.id)) ||
                (Core && Core.Game && Core.Game.current && Core.Game.current.currentMapID) ||
                0
            ) || 0;
        },

        _showRecoveryOverlay(recovery) {
            const overlay = IP2Live.ARDiagnosticRewind;
            const targetLabel = recovery && recovery.label ? recovery.label : 'the tutorial relay';
            const title = recovery && recovery.kind === 'tutorial-recovery'
                ? 'APEX COUNTERMEASURE // TUTORIAL ROUTE'
                : 'APEX COUNTERMEASURE // ROLLBACK';
            const lines = recovery && recovery.kind === 'tutorial-recovery'
                ? [
                    'APEX has traced repeated failures in this breach pattern.',
                    'Control is falling back to ' + targetLabel + '.',
                    'Relearn the compromised gameplay, then rebuild this route.',
                ]
                : [
                    'APEX detected the unstable breach path.',
                    'A prior matching relay has been reclaimed: ' + targetLabel + '.',
                    'Stabilize it again before advancing.',
                ];
            if (overlay && typeof overlay.show === 'function') {
                return overlay.show({ title, lines, onComplete: function () {} });
            }
            return false;
        },

        _showGameOver() {
            setTimeout(() => {
                const screen = IP2Live.NeuralLifeForceGameOver;
                if (screen && typeof screen.show === 'function') {
                    screen.show({ lifeForce: 0 });
                }
            }, 0);
        },

        _requestHudPaint() {
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        },

        _registerHudState() {
            const gsm = IP2Live.GameStateManager;
            if (!gsm || typeof gsm.registerState !== 'function') return false;
            const owner = this;
            gsm.registerState(HUD_STATE_KEY, {
                drawHUD(ctx) { owner.drawHUD(ctx); },
            });
            if (!gsm.activeStates || !gsm.activeStates[HUD_STATE_KEY]) {
                gsm.activate(HUD_STATE_KEY, { persistent: true });
            }
            return true;
        },

        // Helper: Cyber chamfered plate path
        _drawCyberPlate(ctx, x, y, w, h, cut) {
            const c = cut || 8;
            ctx.beginPath();
            ctx.moveTo(x + c, y);
            ctx.lineTo(x + w - c, y);
            ctx.lineTo(x + w, y + c);
            ctx.lineTo(x + w, y + h - c);
            ctx.lineTo(x + w - c, y + h);
            ctx.lineTo(x + c, y + h);
            ctx.lineTo(x, y + h - c);
            ctx.lineTo(x, y + c);
            ctx.closePath();
        },

        // Helper: Futuristic Winged Chevron / Shield Win Streak Icon
        _drawWinStreakIcon(ctx, cx, cy, radius, count, sX, sY) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 255, 170, 0.7)';
            ctx.shadowBlur = 8 * sX;

            // Shield / Hex plate
            ctx.beginPath();
            const r = radius;
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const px = cx + r * Math.cos(angle);
                const py = cy + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 38, 28, 0.92)';
            ctx.fill();
            ctx.strokeStyle = '#00FF99';
            ctx.lineWidth = 1.8 * sX;
            ctx.stroke();

            // Accent wings
            ctx.strokeStyle = '#00F0FF';
            ctx.lineWidth = 1.2 * sX;
            ctx.beginPath();
            ctx.moveTo(cx - r * 1.25, cy - r * 0.4);
            ctx.lineTo(cx - r * 0.85, cy);
            ctx.lineTo(cx - r * 1.25, cy + r * 0.4);
            ctx.moveTo(cx + r * 1.25, cy - r * 0.4);
            ctx.lineTo(cx + r * 0.85, cy);
            ctx.lineTo(cx + r * 1.25, cy + r * 0.4);
            ctx.stroke();

            // Number inside
            ctx.shadowBlur = 0;
            ctx.font = '900 ' + Math.round(11 * sY) + 'px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#E8FFF5';
            ctx.fillText(String(count), cx, cy);

            ctx.restore();
        },

        // Helper: Cyber Virus / Hazard Lose Streak Icon
        _drawVirusIcon(ctx, cx, cy, radius, count, sX, sY, pulse) {
            ctx.save();
            ctx.shadowColor = 'rgba(255, 30, 80, 0.85)';
            ctx.shadowBlur = 9 * sX;

            // Radiating spike antennas
            const spikes = 6;
            ctx.strokeStyle = '#FF244E';
            ctx.lineWidth = 1.6 * sX;
            for (let i = 0; i < spikes; i++) {
                const angle = (Math.PI * 2 / spikes) * i + (Date.now() / 900);
                const innerX = cx + radius * 0.65 * Math.cos(angle);
                const innerY = cy + radius * 0.65 * Math.sin(angle);
                const outerX = cx + (radius * 1.28 + pulse * 2) * Math.cos(angle);
                const outerY = cy + (radius * 1.28 + pulse * 2) * Math.sin(angle);

                ctx.beginPath();
                ctx.moveTo(innerX, innerY);
                ctx.lineTo(outerX, outerY);
                ctx.stroke();

                // Spike node
                ctx.fillStyle = '#FF94A8';
                ctx.beginPath();
                ctx.arc(outerX, outerY, 1.6 * sX, 0, Math.PI * 2);
                ctx.fill();
            }

            // Central Virus Core
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.78, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(48, 4, 16, 0.95)';
            ctx.fill();
            ctx.strokeStyle = '#FF0055';
            ctx.lineWidth = 1.8 * sX;
            ctx.stroke();

            // Number inside
            ctx.shadowBlur = 0;
            ctx.font = '900 ' + Math.round(11 * sY) + 'px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFE5EC';
            ctx.fillText(String(count), cx, cy);

            ctx.restore();
        },

        /**
         * Futuristic Canvas HUD Renderer
         */
        drawHUD(ctx) {
            if (!ctx || !ctx.canvas || this.isRunOver()) return false;
            const cW = ctx.canvas.width;
            const cH = ctx.canvas.height;
            const sX = cW / 1280;
            const sY = cH / 720;
            const qm = IP2Live.QuestManager;
            const panel = qm && typeof qm._questPanelRect === 'function'
                ? qm._questPanelRect(ctx)
                : { x: 18 * sX, y: 88 * sY, w: 430 * sX };

            const state = this._state();
            const targetHp = Number(state.lifeForce) || 0;

            // Initialize or smoothly interpolate animated HP values
            if (this._animHp === undefined) this._animHp = targetHp;
            if (this._ghostHp === undefined) this._ghostHp = targetHp;

            const hpDelta = targetHp - this._animHp;
            let animating = false;
            if (Math.abs(hpDelta) > 0.08) {
                this._animHp += hpDelta * 0.14;
                animating = true;
            } else {
                this._animHp = targetHp;
            }

            // Ghost bar trailing down for damage feedback
            const ghostDelta = this._animHp - this._ghostHp;
            if (ghostDelta < -0.08) {
                this._ghostHp += ghostDelta * 0.045;
                animating = true;
            } else {
                this._ghostHp = this._animHp;
            }

            if (animating) {
                this._requestHudPaint();
            }

            const critical = this.isCritical();
            const x = panel.x;
            const y = Math.max(12 * sY, panel.y - 70 * sY);
            const w = Math.min(panel.w, 440 * sX);
            const h = 58 * sY;
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 160);
            const change = state.lastChange;

            ctx.save();

            // 1. Base Futuristic Outer Plate
            this._drawCyberPlate(ctx, x, y, w, h, 7 * sX);
            const bgGrad = ctx.createLinearGradient(x, y, x + w, y + h);
            if (critical) {
                bgGrad.addColorStop(0, 'rgba(40, 4, 12, 0.96)');
                bgGrad.addColorStop(1, 'rgba(18, 2, 7, 0.98)');
            } else {
                bgGrad.addColorStop(0, 'rgba(6, 20, 30, 0.95)');
                bgGrad.addColorStop(1, 'rgba(2, 10, 16, 0.98)');
            }
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Glowing Outer Stroke
            ctx.strokeStyle = critical ? (pulse > 0.5 ? '#FF003C' : '#FF577B') : '#00F0FF';
            ctx.lineWidth = 1.4 * sX;
            ctx.shadowColor = critical ? 'rgba(255, 0, 60, 0.7)' : 'rgba(0, 240, 255, 0.5)';
            ctx.shadowBlur = critical ? 10 * sX : 6 * sX;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 2. Cyber Accent Notch / Corner Brackets
            ctx.fillStyle = critical ? '#FF003C' : '#FFE600';
            ctx.beginPath();
            ctx.moveTo(x + 12 * sX, y);
            ctx.lineTo(x + 56 * sX, y);
            ctx.lineTo(x + 50 * sX, y + 4 * sY);
            ctx.lineTo(x + 16 * sX, y + 4 * sY);
            ctx.closePath();
            ctx.fill();

            // Grid / Circuit scanlines
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
            ctx.lineWidth = 1;
            for (let lineY = y + 8 * sY; lineY < y + h - 6 * sY; lineY += 5 * sY) {
                ctx.beginPath();
                ctx.moveTo(x + 8 * sX, lineY);
                ctx.lineTo(x + w - 8 * sX, lineY);
                ctx.stroke();
            }

            // Streak Area Layout (Right Wing)
            const badgeW = 54 * sX;
            const contentW = w - badgeW - 20 * sX;
            const badgeCenterX = x + w - (badgeW / 2) - 8 * sX;
            const badgeCenterY = y + (h / 2) + 2 * sY;

            // 3. Header Texts
            ctx.font = '900 ' + Math.round(9.5 * sY) + 'px "Courier New", monospace';
            ctx.textAlign = 'left';
            ctx.fillStyle = critical ? '#FFAAB7' : '#00F0FF';
            ctx.fillText('SYS::NEURAL LIFE FORCE', x + 14 * sX, y + 16 * sY);

            // Life Force Numeric Display
            const displayVal = Math.round(this._animHp);
            ctx.textAlign = 'right';
            ctx.font = 'bold ' + Math.round(11 * sY) + 'px monospace';
            ctx.fillStyle = critical ? '#FF4D6D' : (displayVal > 50 ? '#00FFAA' : '#FFE600');
            ctx.fillText(String(displayVal).padStart(3, '0') + ' / ' + MAX_LIFE_FORCE, x + contentW + 6 * sX, y + 16 * sY);

            // 4. Multi-layered Decreasing Animated Bar
            const barX = x + 14 * sX;
            const barY = y + 22 * sY;
            const barW = contentW - 8 * sX;
            const barH = 12 * sY;
            const activeRatio = Math.max(0, Math.min(1, this._animHp / MAX_LIFE_FORCE));
            const ghostRatio = Math.max(0, Math.min(1, this._ghostHp / MAX_LIFE_FORCE));

            // Bar Track Background
            this._drawCyberPlate(ctx, barX, barY, barW, barH, 3 * sX);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Ghost Bar (Lagging Damage / Decreasing Red Trail)
            if (ghostRatio > activeRatio) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(barX + barW * activeRatio, barY, barW * (ghostRatio - activeRatio), barH);
                ctx.clip();
                ctx.fillStyle = 'rgba(255, 48, 80, 0.85)';
                ctx.fillRect(barX, barY, barW * ghostRatio, barH);
                ctx.restore();
            }

            // Active Animated Fill Bar
            if (activeRatio > 0) {
                ctx.save();
                this._drawCyberPlate(ctx, barX, barY, Math.max(6 * sX, barW * activeRatio), barH, 3 * sX);
                ctx.clip();

                const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
                if (critical) {
                    barGrad.addColorStop(0, '#FF003C');
                    barGrad.addColorStop(1, '#FF5E7E');
                } else if (activeRatio < 0.5) {
                    barGrad.addColorStop(0, '#FF9900');
                    barGrad.addColorStop(1, '#FFE600');
                } else {
                    barGrad.addColorStop(0, '#00CC88');
                    barGrad.addColorStop(0.7, '#00F0FF');
                    barGrad.addColorStop(1, '#66FFFF');
                }
                ctx.fillStyle = barGrad;
                ctx.fill();

                // Animated cyber bar glow edge
                const edgeX = barX + barW * activeRatio;
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(edgeX - 2 * sX, barY, 2 * sX, barH);

                ctx.restore();
            }

            // Tech Segment Overlay Lines
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.lineWidth = 1.5 * sX;
            const segmentStep = 8 * sX;
            for (let seg = barX + segmentStep; seg < barX + barW; seg += segmentStep) {
                ctx.beginPath();
                ctx.moveTo(seg, barY);
                ctx.lineTo(seg, barY + barH);
                ctx.stroke();
            }

            // 5. Subtitle / Status Telemetry
            ctx.font = 'bold ' + Math.round(8.5 * sY) + 'px "Courier New", monospace';
            ctx.textAlign = 'left';
            if (critical) {
                ctx.fillStyle = '#FF758F';
                ctx.fillText('CRITICAL // APEX COUNTERMEASURE ACTIVE', barX, y + 48 * sY);
            } else if (change && Date.now() - Number(change.at || 0) < 6000) {
                const deltaPos = change.delta >= 0;
                ctx.fillStyle = deltaPos ? '#00FFAA' : '#FF5E7E';
                ctx.fillText((deltaPos ? '+' : '') + change.delta + ' // ' + String(change.kind || '').toUpperCase(), barX, y + 48 * sY);
            } else {
                ctx.fillStyle = 'rgba(180, 240, 255, 0.7)';
                ctx.fillText('LINK: STABLE // OPERATIONAL DECK READY', barX, y + 48 * sY);
            }

            // 6. Streak Badge on the Right Side
            // Separator line
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + contentW + 8 * sX, y + 8 * sY);
            ctx.lineTo(x + contentW + 8 * sX, y + h - 8 * sY);
            ctx.stroke();

            // Label above badge
            ctx.font = 'bold ' + Math.round(7.5 * sY) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.fillText('STREAK', badgeCenterX, y + 14 * sY);

            // Render Win/Lose Streak Icon
            const iconRadius = 13 * sY;
            if (state.failureStreak > 0) {
                this._drawVirusIcon(ctx, badgeCenterX, badgeCenterY + 4 * sY, iconRadius, state.failureStreak, sX, sY, pulse);
            } else if (state.successStreak > 0) {
                this._drawWinStreakIcon(ctx, badgeCenterX, badgeCenterY + 4 * sY, iconRadius, state.successStreak, sX, sY);
            } else {
                // Neutral idle core badge
                ctx.beginPath();
                ctx.arc(badgeCenterX, badgeCenterY + 4 * sY, iconRadius * 0.75, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
                ctx.stroke();
                ctx.font = 'bold ' + Math.round(9 * sY) + 'px monospace';
                ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
                ctx.fillText('0', badgeCenterX, badgeCenterY + 5 * sY);
            }

            // 7. Critical Alert Red Overlay
            if (critical) {
                ctx.globalAlpha = 0.12 + pulse * 0.14;
                ctx.fillStyle = '#FF003C';
                this._drawCyberPlate(ctx, x, y, w, h, 7 * sX);
                ctx.fill();
            }

            ctx.restore();
            return true;
        },
    };

    IP2Live.NeuralLifeForce = NeuralLifeForce;
    IP2Live.NeuralDeckManager = NeuralLifeForce;
    window.IP2LiveNeuralLifeForce = NeuralLifeForce;
    NeuralLifeForce.boot();
    console.log('[IP2Live] neural_life_force_manager.js module loaded.');
}());