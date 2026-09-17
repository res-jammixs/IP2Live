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
        VERSION: 'neural-life-force-20260915-06',
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
            const wantedQuestId = String(questId || '');
            const wantedObjectiveId = String(objectiveId || '');
            if (!wantedQuestId || !wantedObjectiveId) return null;
            const assignments = gm && typeof gm.getAllGameplayAssignments === 'function'
                ? gm.getAllGameplayAssignments()
                : [];
            for (let i = 0; i < assignments.length; i++) {
                const spec = assignments[i] || {};
                if (String(spec.id || '') !== wantedQuestId) continue;
                if (String(spec.objectiveId || '') !== wantedObjectiveId) continue;
                return spec.gameplayId ? String(spec.gameplayId) : null;
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
            const wanted = String(gameplayId || '');
            const candidates = [];
            const specs = gm && typeof gm.getGameplayQuestSpecs === 'function'
                ? gm.getGameplayQuestSpecs(wanted)
                : [];
            for (let i = 0; i < specs.length; i++) {
                const spec = specs[i] || {};
                if (!(spec.tutorial || spec.harderIntro)) continue;
                candidates.push({
                    gameplayId: wanted,
                    mapId: Number(spec.mapId),
                    questId: spec.id,
                    objectiveId: spec.objectiveId,
                    label: spec.label || spec.title || wanted,
                    specIndex: i,
                });
            }
            candidates.sort((a, b) => a.mapId - b.mapId || a.specIndex - b.specIndex);
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

        _shouldDrawWithQuestPanel() {
            const qm = IP2Live.QuestManager;
            if (!qm) return false;
            if (typeof qm.isHudVisible === 'function') return qm.isHudVisible();
            if (qm.visible !== true || qm.suppressedByDialogue) return false;

            const quest = typeof qm.currentQuest === 'function'
                ? qm.currentQuest()
                : (qm.activeQuestId ? { id: qm.activeQuestId } : null);
            const objective = typeof qm.currentObjective === 'function'
                ? qm.currentObjective()
                : (qm.activeObjectiveId ? { id: qm.activeObjectiveId } : null);
            return !!((quest && objective) || qm._showFinishedPanel === true);
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

        // Persona-inspired upward shield used for a quest win streak.
        _drawWinStreakIcon(ctx, cx, cy, radius, count, sX, sY) {
            ctx.save();
            const r = radius;
            ctx.shadowColor = 'rgba(0, 255, 210, 0.82)';
            ctx.shadowBlur = 12 * sX;

            // An offset black extrusion and cyan diamond make the emblem feel
            // stamped into the quest-chain hardware instead of printed on it.
            ctx.beginPath();
            ctx.moveTo(cx, cy - r * 1.18 + 3 * sY);
            ctx.lineTo(cx + r * 1.02 + 3 * sX, cy + 3 * sY);
            ctx.lineTo(cx + 3 * sX, cy + r * 1.18 + 3 * sY);
            ctx.lineTo(cx - r * 1.02 + 3 * sX, cy + 3 * sY);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 3, 7, 0.92)';
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(cx, cy - r * 1.18);
            ctx.lineTo(cx + r * 1.02, cy);
            ctx.lineTo(cx, cy + r * 1.18);
            ctx.lineTo(cx - r * 1.02, cy);
            ctx.closePath();
            const badgeGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
            badgeGrad.addColorStop(0, '#00D7BE');
            badgeGrad.addColorStop(0.16, '#052F35');
            badgeGrad.addColorStop(0.72, '#03161E');
            badgeGrad.addColorStop(1, '#00DDEB');
            ctx.fillStyle = badgeGrad;
            ctx.fill();
            ctx.strokeStyle = '#73FFE0';
            ctx.lineWidth = 1.15 * sX;
            ctx.stroke();

            // Upward-pointing shield silhouette.
            ctx.beginPath();
            ctx.moveTo(cx, cy - r * 0.84);
            ctx.lineTo(cx + r * 0.73, cy - r * 0.23);
            ctx.lineTo(cx + r * 0.56, cy + r * 0.5);
            ctx.lineTo(cx, cy + r * 0.82);
            ctx.lineTo(cx - r * 0.56, cy + r * 0.5);
            ctx.lineTo(cx - r * 0.73, cy - r * 0.23);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 18, 24, 0.98)';
            ctx.fill();
            ctx.strokeStyle = '#54FFD2';
            ctx.lineWidth = 1.7 * sX;
            ctx.stroke();

            // Small circuit prongs give the badge a more mechanical outline.
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(84,255,210,0.72)';
            ctx.lineWidth = Math.max(0.8, 0.9 * sX);
            for (let side = -1; side <= 1; side += 2) {
                ctx.beginPath();
                ctx.moveTo(cx + side * r * 0.88, cy - r * 0.34);
                ctx.lineTo(cx + side * r * 1.17, cy - r * 0.48);
                ctx.lineTo(cx + side * r * 1.28, cy - r * 0.34);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx + side * r * 0.82, cy + r * 0.36);
                ctx.lineTo(cx + side * r * 1.12, cy + r * 0.48);
                ctx.stroke();
            }

            // Twin rising chevrons make the state readable without color.
            ctx.strokeStyle = '#00EFFF';
            ctx.lineWidth = 1.4 * sX;
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.42, cy - r * 0.14);
            ctx.lineTo(cx, cy - r * 0.5);
            ctx.lineTo(cx + r * 0.42, cy - r * 0.14);
            ctx.moveTo(cx - r * 0.34, cy + r * 0.12);
            ctx.lineTo(cx, cy - r * 0.18);
            ctx.lineTo(cx + r * 0.34, cy + r * 0.12);
            ctx.stroke();

            const numberFont = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded
                ? 'Oxanium-Medium'
                : 'sans-serif';
            ctx.font = '900 ' + Math.round(11 * sY) + 'px ' + numberFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#F4FFFC';
            ctx.fillText(String(count), cx, cy + r * 0.48);

            ctx.restore();
        },

        // Broken hazard core used for a quest loss streak.
        _drawVirusIcon(ctx, cx, cy, radius, count, sX, sY, pulse) {
            ctx.save();
            const r = radius;
            ctx.shadowColor = 'rgba(255, 25, 75, 0.9)';
            ctx.shadowBlur = (8 + pulse * 5) * sX;

            // Fixed spikes remain legible while the glow supplies motion.
            const spikes = 6;
            ctx.strokeStyle = '#FF244E';
            ctx.lineWidth = 1.5 * sX;
            for (let i = 0; i < spikes; i++) {
                const angle = (Math.PI * 2 / spikes) * i - Math.PI / 2;
                const innerX = cx + r * 0.7 * Math.cos(angle);
                const innerY = cy + r * 0.7 * Math.sin(angle);
                const outerX = cx + r * 1.18 * Math.cos(angle);
                const outerY = cy + r * 1.18 * Math.sin(angle);

                ctx.beginPath();
                ctx.moveTo(innerX, innerY);
                ctx.lineTo(outerX, outerY);
                ctx.stroke();
            }

            // Broken octagonal core.
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i - Math.PI / 8;
                const px = cx + r * 0.78 * Math.cos(angle);
                const py = cy + r * 0.78 * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(55, 3, 20, 0.98)';
            ctx.fill();
            ctx.strokeStyle = '#FF5275';
            ctx.lineWidth = 1.7 * sX;
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#FF244E';
            ctx.lineWidth = 1.4 * sX;
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.35, cy - r * 0.42);
            ctx.lineTo(cx + r * 0.35, cy + r * 0.08);
            ctx.moveTo(cx + r * 0.35, cy - r * 0.42);
            ctx.lineTo(cx - r * 0.35, cy + r * 0.08);
            ctx.stroke();

            const numberFont = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded
                ? 'Oxanium-Medium'
                : 'sans-serif';
            ctx.font = '900 ' + Math.round(11 * sY) + 'px ' + numberFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFE5EC';
            ctx.fillText(String(count), cx, cy + r * 0.48);

            ctx.restore();
        },

        // Low-contrast cable run borrowed from the physical wiring language of Gameplay 1.
        _drawHudConduit(ctx, startX, startY, endX, endY, bend, color, width, unit) {
            const controlA = startX + (endX - startX) * 0.32;
            const controlB = startX + (endX - startX) * 0.68;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.bezierCurveTo(controlA, startY + bend, controlB, endY - bend, endX, endY);
            ctx.strokeStyle = 'rgba(0, 2, 6, 0.78)';
            ctx.lineWidth = width + 3 * unit;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.bezierCurveTo(controlA, startY + bend, controlB, endY - bend, endX, endY);
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(startX, startY - 0.7 * unit);
            ctx.bezierCurveTo(controlA, startY + bend - 0.7 * unit, controlB, endY - bend - 0.7 * unit, endX, endY - 0.7 * unit);
            ctx.strokeStyle = 'rgba(205, 225, 229, 0.12)';
            ctx.lineWidth = Math.max(0.7, 0.65 * unit);
            ctx.stroke();
            ctx.restore();
        },

        _drawHudRivet(ctx, x, y, radius, unit) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, radius + unit, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 2, 6, 0.92)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#46545B';
            ctx.fill();
            ctx.strokeStyle = 'rgba(187, 207, 211, 0.34)';
            ctx.lineWidth = Math.max(0.7, 0.7 * unit);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - radius * 0.46, y + radius * 0.25);
            ctx.lineTo(x + radius * 0.46, y - radius * 0.25);
            ctx.strokeStyle = 'rgba(6, 11, 15, 0.82)';
            ctx.stroke();
            ctx.restore();
        },

        _drawQuestChainCard(ctx, x, y, w, h, state, sX, sY, pulse) {
            const losing = Number(state.failureStreak) > 0;
            const winning = !losing && Number(state.successStreak) > 0;
            const count = losing ? Number(state.failureStreak) : (winning ? Number(state.successStreak) : 0);
            const iconX = x + w * 0.5;
            const iconY = y + h * 0.5;
            const iconRadius = Math.min(18 * sY, h * 0.34);
            const numberFont = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded
                ? 'Oxanium-Medium'
                : 'sans-serif';

            ctx.save();
            if (losing) {
                this._drawVirusIcon(ctx, iconX, iconY, iconRadius, count, sX, sY, pulse);
            } else if (winning) {
                this._drawWinStreakIcon(ctx, iconX, iconY, iconRadius, count, sX, sY);
            } else {
                ctx.beginPath();
                ctx.moveTo(iconX, iconY - iconRadius);
                ctx.lineTo(iconX + iconRadius * 0.86, iconY);
                ctx.lineTo(iconX, iconY + iconRadius);
                ctx.lineTo(iconX - iconRadius * 0.86, iconY);
                ctx.closePath();
                ctx.fillStyle = 'rgba(8, 21, 29, 0.94)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(105, 221, 235, 0.6)';
                ctx.lineWidth = 1.2 * sX;
                ctx.stroke();
                ctx.font = 'bold ' + Math.round(12 * sY) + 'px ' + numberFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#BDECF2';
                ctx.fillText('0', iconX, iconY);
            }
            ctx.restore();
        },

        /**
         * Futuristic Canvas HUD Renderer
         */
        drawHUD(ctx) {
            if (!ctx || !ctx.canvas || this.isRunOver() || !this._shouldDrawWithQuestPanel()) return false;
            const cW = ctx.canvas.width;
            const cH = ctx.canvas.height;
            const sX = cW / 1280;
            const sY = cH / 720;
            const unit = Math.min(sX, sY);
            const hudFont = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded
                ? 'Oxanium-Medium'
                : 'sans-serif';
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
            const warning = !critical && this._animHp <= 50;
            const x = panel.x;
            const y = Math.max(8 * sY, panel.y - 80 * sY);
            const w = Math.min(panel.w, 460 * sX);
            const h = 70 * sY;
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 160);
            const change = state.lastChange;
            const accent = critical ? '#FF315F' : (warning ? '#FFE04A' : '#FF174D');
            const streakW = Math.min(64 * sX, w * 0.18);
            const streakX = x + w - streakW;
            const contentLeft = x + 18 * sX;
            const contentRight = streakX - 8 * sX;

            ctx.save();

            // Offset Persona-style shards give the plate an asymmetric silhouette.
            ctx.beginPath();
            ctx.moveTo(x + 14 * sX, y - 3 * sY);
            ctx.lineTo(x + w - 36 * sX, y - 3 * sY);
            ctx.lineTo(x + w - 26 * sX, y + 2 * sY);
            ctx.lineTo(x + 9 * sX, y + 2 * sY);
            ctx.closePath();
            ctx.fillStyle = critical ? '#FF315F' : '#FFE04A';
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(x - 4 * sX, y + 14 * sY);
            ctx.lineTo(x + 5 * sX, y + 4 * sY);
            ctx.lineTo(x + 5 * sX, y + h - 5 * sY);
            ctx.lineTo(x - 4 * sX, y + h - 14 * sY);
            ctx.closePath();
            ctx.fillStyle = '#FF174D';
            ctx.fill();

            // A heavy offset body gives the whole HUD tangible depth.
            this._drawCyberPlate(ctx, x + 5 * sX, y + 6 * sY, w, h, 7 * sX);
            ctx.fillStyle = 'rgba(0, 2, 7, 0.88)';
            ctx.fill();

            // Main dark plate.
            this._drawCyberPlate(ctx, x, y, w, h, 7 * sX);
            const bgGrad = ctx.createLinearGradient(x, y, x + w, y + h);
            if (critical) {
                bgGrad.addColorStop(0, 'rgba(48, 3, 17, 0.98)');
                bgGrad.addColorStop(0.58, 'rgba(16, 7, 18, 0.99)');
                bgGrad.addColorStop(1, 'rgba(5, 8, 14, 0.99)');
            } else {
                bgGrad.addColorStop(0, 'rgba(39, 3, 17, 0.98)');
                bgGrad.addColorStop(0.55, 'rgba(15, 4, 13, 0.99)');
                bgGrad.addColorStop(1, 'rgba(5, 5, 12, 0.99)');
            }
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Restrained scan texture and diagonal interference marks.
            ctx.save();
            this._drawCyberPlate(ctx, x, y, w, h, 7 * sX);
            ctx.clip();
            for (let lineY = y + 5 * sY; lineY < y + h; lineY += 4 * sY) {
                ctx.fillStyle = 'rgba(220, 250, 255, 0.025)';
                ctx.fillRect(x, lineY, w, Math.max(1, 0.5 * sY));
            }
            ctx.strokeStyle = 'rgba(255,23,77,0.09)';
            ctx.lineWidth = 5 * unit;
            for (let slashX = x + w * 0.58; slashX < streakX; slashX += 18 * sX) {
                ctx.beginPath();
                ctx.moveTo(slashX, y + h);
                ctx.lineTo(slashX + 28 * sX, y);
                ctx.stroke();
            }

            // Submerged cable routes add depth without crossing the telemetry copy.
            this._drawHudConduit(
                ctx,
                x + 8 * sX,
                y + 50 * sY,
                streakX - 12 * sX,
                y + 47 * sY,
                -8 * sY,
                critical ? 'rgba(111, 38, 55, 0.34)' : 'rgba(112, 18, 48, 0.34)',
                2.2 * unit,
                unit
            );
            this._drawHudConduit(
                ctx,
                x + 34 * sX,
                y + 65 * sY,
                streakX - 10 * sX,
                y + 60 * sY,
                7 * sY,
                warning ? 'rgba(132, 95, 49, 0.30)' : 'rgba(82, 20, 39, 0.30)',
                1.5 * unit,
                unit
            );
            ctx.restore();

            // High-contrast outer keyline.
            this._drawCyberPlate(ctx, x, y, w, h, 7 * sX);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.4 * unit;
            ctx.shadowColor = 'rgba(255,23,77,0.68)';
            ctx.shadowBlur = critical ? (6 + pulse * 5) * unit : 5 * unit;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Top rail and hard-stop marker.
            ctx.fillStyle = accent;
            ctx.fillRect(x + 16 * sX, y + 4 * sY, contentRight - x - 23 * sX, Math.max(1, 1.2 * sY));
            ctx.fillStyle = critical ? '#FFE04A' : '#FF315F';
            ctx.beginPath();
            ctx.moveTo(x + 16 * sX, y + 4 * sY);
            ctx.lineTo(x + 40 * sX, y + 4 * sY);
            ctx.lineTo(x + 34 * sX, y + 8 * sY);
            ctx.lineTo(x + 12 * sX, y + 8 * sY);
            ctx.closePath();
            ctx.fill();

            // Compact status glyph replaces the old explanatory labels.
            ctx.fillStyle = accent;
            for (let glyph = 0; glyph < 3; glyph++) {
                const gx = contentLeft + glyph * 8 * sX;
                ctx.beginPath();
                ctx.moveTo(gx + 3 * sX, y + 11 * sY);
                ctx.lineTo(gx + 9 * sX, y + 11 * sY);
                ctx.lineTo(gx + 6 * sX, y + 21 * sY);
                ctx.lineTo(gx, y + 21 * sY);
                ctx.closePath();
                ctx.fill();
            }

            const displayVal = Math.round(this._animHp);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'alphabetic';
            ctx.font = '900 ' + Math.round(12 * sY) + 'px ' + hudFont;
            ctx.fillStyle = critical ? '#FF6B8C' : (warning ? '#FFE04A' : '#FF7899');
            ctx.fillText(String(displayVal).padStart(3, '0') + ' / ' + MAX_LIFE_FORCE, contentRight, y + 20 * sY);

            // Layered life-force rail.
            const barX = contentLeft;
            const barY = y + 27 * sY;
            const barW = contentRight - contentLeft;
            const barH = 17 * sY;
            const activeRatio = Math.max(0, Math.min(1, this._animHp / MAX_LIFE_FORCE));
            const ghostRatio = Math.max(0, Math.min(1, this._ghostHp / MAX_LIFE_FORCE));

            // Red-black recessed housing matches the Quest Area without a metallic finish.
            this._drawCyberPlate(ctx, barX - 3 * sX, barY - 3 * sY, barW + 6 * sX, barH + 6 * sY, 4 * sX);
            const housingGrad = ctx.createLinearGradient(barX, barY - 3 * sY, barX, barY + barH + 3 * sY);
            housingGrad.addColorStop(0, '#240510');
            housingGrad.addColorStop(0.38, '#12040B');
            housingGrad.addColorStop(1, '#050308');
            ctx.fillStyle = housingGrad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 49, 95, 0.38)';
            ctx.lineWidth = Math.max(1, unit);
            ctx.stroke();

            this._drawCyberPlate(ctx, barX, barY, barW, barH, 3 * sX);
            ctx.fillStyle = 'rgba(9, 1, 7, 0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 88, 126, 0.34)';
            ctx.lineWidth = Math.max(1, unit);
            ctx.stroke();

            if (ghostRatio > activeRatio) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(barX + barW * activeRatio, barY, barW * (ghostRatio - activeRatio), barH);
                ctx.clip();
                ctx.fillStyle = 'rgba(255, 207, 49, 0.46)';
                ctx.fillRect(barX, barY, barW * ghostRatio, barH);
                ctx.restore();
            }

            if (activeRatio > 0) {
                ctx.save();
                const fillW = Math.max(7 * sX, barW * activeRatio);
                this._drawCyberPlate(ctx, barX, barY, fillW, barH, 3 * sX);
                ctx.clip();

                const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
                barGrad.addColorStop(0, '#FF174D');
                barGrad.addColorStop(0.52, '#FF8A00');
                barGrad.addColorStop(1, '#FFE600');
                ctx.fillStyle = barGrad;
                ctx.fillRect(barX, barY, fillW, barH);

                // Horizontal light bands give the fill depth without diagonal marks.
                ctx.fillStyle = 'rgba(255, 210, 221, 0.13)';
                ctx.fillRect(barX, barY + 2 * sY, fillW, 1.5 * sY);
                ctx.fillStyle = 'rgba(74, 7, 16, 0.2)';
                ctx.fillRect(barX, barY + barH - 3 * sY, fillW, 2 * sY);

                const edgeX = barX + barW * activeRatio;
                ctx.fillStyle = critical ? '#FF8BA4' : (warning ? '#C3AD7A' : '#FF8AA7');
                ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
                ctx.shadowBlur = 2 * unit;
                ctx.fillRect(edgeX - 2 * sX, barY + 1 * sY, 2.5 * sX, barH - 2 * sY);
                ctx.fillStyle = 'rgba(8, 15, 18, 0.62)';
                ctx.fillRect(edgeX - 5 * sX, barY + 2 * sY, 1.2 * sX, barH - 4 * sY);
                ctx.fillRect(edgeX - 8 * sX, barY + 3 * sY, 1.2 * sX, barH - 6 * sY);

                ctx.restore();
            }

            // Straight vertical divisions create a clean segmented energy readout.
            ctx.fillStyle = 'rgba(16, 2, 8, 0.42)';
            const segmentStep = barW / 12;
            for (let seg = barX + segmentStep; seg < barX + barW - 1; seg += segmentStep) {
                ctx.fillRect(seg, barY + 2 * sY, Math.max(1, 1 * sX), barH - 4 * sY);
            }

            // Critical and transient feedback stays available; the quiet state
            // is intentionally label-free to keep the compact HUD clean.
            ctx.font = 'bold ' + Math.round(7.5 * sY) + 'px ' + hudFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            if (critical) {
                ctx.fillStyle = '#FF7896';
                ctx.fillText('DANGER // LIFE FORCE CRITICAL', barX, y + 59 * sY);
            } else if (change && Date.now() - Number(change.at || 0) < 6000) {
                const deltaPos = change.delta >= 0;
                ctx.fillStyle = deltaPos ? '#54FFD2' : '#FF7896';
                ctx.fillText(
                    (deltaPos ? 'RECOVERY +' : 'DAMAGE ') + change.delta + ' // ' + String(change.kind || '').toUpperCase(),
                    barX,
                    y + 59 * sY
                );
            } else {
                ctx.fillStyle = 'rgba(255,23,77,0.32)';
                ctx.fillRect(barX, y + 55 * sY, barW * 0.34, Math.max(1, 1 * sY));
                ctx.fillStyle = 'rgba(255,230,0,0.4)';
                ctx.fillRect(barX, y + 58 * sY, barW * 0.13, Math.max(1, 0.7 * sY));
            }

            // Standalone streak icon; the count is rendered inside the symbol.
            this._drawQuestChainCard(ctx, streakX, y + 5 * sY, streakW, h - 10 * sY, state, sX, sY, pulse);

            // Critical tint never covers text or the quest-chain card.
            if (critical) {
                ctx.globalAlpha = 0.05 + pulse * 0.05;
                ctx.fillStyle = '#FF315F';
                this._drawCyberPlate(ctx, x, y, streakX - x - 8 * sX, h, 7 * sX);
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
