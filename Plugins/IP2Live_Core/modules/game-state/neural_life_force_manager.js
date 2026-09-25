/**
 * IP2Live - Neural Life Force Manager
 *
 * Owns the cross-gameplay survivability loop. Gameplay screens only report
 * their normal completed / terminal-failed lifecycle events; this module
 * applies Life Force, level-local quest rollback, optional tutorial support,
 * critical pressure, and persistent HUD state in one place.
 */

(function () {
    const STORE_KEY = 'neuralLifeForce';
    const HUD_STATE_KEY = 'neuralLifeForce';
    const DEFAULT_LIFE_FORCE = 100;
    const MAX_LIFE_FORCE = 100;
    const CRITICAL_LIFE_FORCE = 35;
    const RECOVERY_WIN_STREAK = 3;
    const GAMEPLAY_WARNING_INTERVAL = 5;

    function clone(value) {
        try { return JSON.parse(JSON.stringify(value || null)); }
        catch (e) { return value || null; }
    }

    const NeuralLifeForce = {
        VERSION: 'neural-life-force-20260925-developer-failure-rollback',
        SETTINGS: {
            defaultLifeForce: DEFAULT_LIFE_FORCE,
            maxLifeForce: MAX_LIFE_FORCE,
            criticalLifeForce: CRITICAL_LIFE_FORCE,
            recoveryWinStreak: RECOVERY_WIN_STREAK,
            gameplayWarningInterval: GAMEPLAY_WARNING_INTERVAL,
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
            if (this._isTutorial(data)) {
                this._attachState(data, state, 0);
                return { handled: true, delta: 0, reason: 'tutorial', state: this.getState() };
            }

            state.successStreak = Math.max(0, Number(state.successStreak) || 0) + 1;
            state.failureStreak = 0;
            const reward = state.successStreak >= RECOVERY_WIN_STREAK
                ? Math.min(15, 9 + state.successStreak)
                : 0;
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
            // Actual tutorials stay penalty-free. The developer button explicitly
            // simulates a campaign failure, including at tutorial quest locations.
            // Optional replays remain isolated even if a caller sets the dev flag.
            const tutorialReplay = data.tutorialReplay || (data.spec && data.spec.tutorialReplay);
            if (this._isTutorial(data) && (!data.developerQuestFail || tutorialReplay)) {
                this._attachState(data, state, 0);
                data.neuralRecovery = 'tutorial-retry';
                data.neuralRecoveryHandled = true;
                data.recoveryAction = 'neural_tutorial_retry';
                return { handled: true, kind: 'tutorial-retry', delta: 0, state: this.getState() };
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

            const count = state.gameplayTerminalFailures[gameplayId];
            const rollback = this._rollbackToPreviousQuest(data);
            data.neuralRecovery = rollback.rolledBack ? 'rollback-previous-quest' : 'retry-first-quest';
            data.neuralRecoveryHandled = true;
            data.recoveryAction = rollback.rolledBack
                ? 'neural_previous_quest_rollback'
                : 'neural_retry_first_quest';
            const milestone = Math.floor(count / GAMEPLAY_WARNING_INTERVAL) * GAMEPLAY_WARNING_INTERVAL;
            if (count % GAMEPLAY_WARNING_INTERVAL === 0 && milestone > (state.acknowledgedFailureMilestones[gameplayId] || 0)) {
                state.acknowledgedFailureMilestones[gameplayId] = milestone;
                data.recoveryAction = rollback.rolledBack
                    ? 'neural_previous_quest_rollback_with_tutorial_offer'
                    : 'neural_first_quest_retry_with_tutorial_offer';
                // Finish the failed screen's lifecycle before opening another screen.
                const root = this._root(false);
                setTimeout(() => {
                    if (this._root(false) === root && !this.isRunOver()) this._showTutorialOffer(data, count);
                }, 0);
            }
            this._requestHudPaint();
            return {
                handled: true,
                kind: data.neuralRecovery,
                delta: -loss,
                rollbackQuestId: data.rollbackQuestId || null,
                rollbackObjectiveId: data.rollbackObjectiveId || null,
                state: this.getState(),
            };
        },

        /**
         * Reopen the immediately preceding quest in the current map queue.
         * Each later failure therefore walks backward one quest at a time and
         * stops at the first quest without changing maps or stages.
         */
        _rollbackToPreviousQuest(data) {
            const qm = IP2Live.QuestManager;
            if (!qm) return { rolledBack: false, reason: 'quest-manager-unavailable' };
            const spec = data.spec || {};
            const mapId = Number(data.mapId || spec.mapId || qm.activeMapId || this._currentMapId()) || 0;
            const queue = qm.mapQuestQueues && qm.mapQuestQueues[mapId];
            const questIds = queue && Array.isArray(queue.questIds) ? queue.questIds.slice() : [];
            const failedQuestId = String(qm.activeQuestId || data.questId || spec.id || '');
            const failedIndex = questIds.indexOf(failedQuestId);
            if (failedIndex < 0) {
                data.rollbackQuestId = null;
                data.rollbackObjectiveId = qm.activeObjectiveId || data.objectiveId || spec.objectiveId || null;
                return { rolledBack: false, reason: 'quest-not-in-map-queue', questId: null, objectiveId: data.rollbackObjectiveId };
            }

            // At the level boundary, restart quest one itself. This also resets
            // partial objective completion in multi-gameplay quests.
            const rolledBack = failedIndex > 0;
            const rollbackQuestId = questIds[Math.max(0, failedIndex - 1)];
            const rollbackQuest = qm.quests && qm.quests[rollbackQuestId];
            if (!rollbackQuest) return { rolledBack: false, reason: 'previous-quest-unavailable' };
            const objectives = Array.isArray(rollbackQuest.objectives) ? rollbackQuest.objectives : [];
            const rollbackObjectiveId = objectives.length ? objectives[0].id : null;
            if (!qm.completedObjectives || typeof qm.completedObjectives !== 'object') qm.completedObjectives = {};
            qm.completedObjectives[rollbackQuestId] = {};

            const options = {
                mapId,
                mapQuestMode: true,
                keepLastCompletion: true,
                visible: true,
                preview: false,
                guideActive: true,
                allowCompletion: true,
                restart: true,
                completedObjectives: {},
            };
            let started = false;
            if (typeof qm.startQuest === 'function') started = qm.startQuest(rollbackQuestId, options) !== false;
            if (!started) {
                qm.activeQuestId = rollbackQuestId;
                qm.activeObjectiveId = rollbackObjectiveId;
                qm.activeMapId = mapId || qm.activeMapId;
            }
            data.rollbackQuestId = rolledBack ? rollbackQuestId : null;
            data.rollbackObjectiveId = rollbackObjectiveId;
            data.rollbackQuestLabel = rollbackQuest.title || rollbackQuest.label || rollbackQuest.questLabel || rollbackQuestId;
            return { rolledBack, questId: rollbackQuestId, objectiveId: rollbackObjectiveId };
        },

        handleMapEntered() {
            // Normalize older saves without following their obsolete tutorial route.
            this._state();
            return false;
        },

        _showTutorialOffer(data, count) {
            const gm = IP2Live.GameManager;
            const overlay = IP2Live.ARDiagnosticRewind;
            if (!overlay || typeof overlay.show !== 'function') return false;
            const gameplayId = this._canonicalGameplayId(data);
            const catalog = gm && gm.gameplayCatalog && gm.gameplayCatalog[gameplayId];
            const stage = gm && typeof gm._stageFor === 'function' ? gm._stageFor(data.mapId) : null;
            const log = (choice) => {
                if (gm && typeof gm._logTelemetryEvent === 'function') gm._logTelemetryEvent('neural_tutorial_offer', {
                    gameplayId, mapId: data.mapId, questId: data.questId, objectiveId: data.objectiveId,
                    payload: { failureCount: count, choice },
                });
                if (gm && typeof gm._queueCheckpoint === 'function') gm._queueCheckpoint('neural_tutorial_offer');
            };
            log('shown');
            return overlay.show({
                title: 'APEX SECURITY ALERT',
                eyebrow: 'NEURAL DECK / AR DIAGNOSTIC',
                gameplayLabel: catalog ? catalog.label : gameplayId,
                statusLabel: stage && stage.name ? stage.name : 'SECURITY LEVEL ' + data.mapId,
                failureCount: count,
                lines: ["We've made repeated mistakes in this APEX security level. If we keep making mistakes, APEX could detect us. Review this gameplay's tutorial, or continue and try again."],
                tutorialSection: true,
                actions: [
                    { id: 'tutorial', label: 'See Tutorial Again', onSelect: () => {
                        log('tutorial');
                        if (!gm || typeof gm.launchTutorialReplay !== 'function' || !gm.launchTutorialReplay(gameplayId, data)) {
                            overlay.show({ title: 'TUTORIAL UNAVAILABLE', lines: ['Your current quest is ready to retry. The tutorial could not be opened right now.'] });
                        }
                    } },
                    { id: 'continue', label: 'Continue', onSelect: () => log('continue') },
                ],
            });
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
                acknowledgedFailureMilestones: {},
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
            if (!state.acknowledgedFailureMilestones || typeof state.acknowledgedFailureMilestones !== 'object') {
                state.acknowledgedFailureMilestones = {};
                for (const id of Object.keys(state.gameplayTerminalFailures)) {
                    state.acknowledgedFailureMilestones[id] = Math.floor((Number(state.gameplayTerminalFailures[id]) || 0) / GAMEPLAY_WARNING_INTERVAL) * GAMEPLAY_WARNING_INTERVAL;
                }
            }
            state.pendingTutorialRecovery = null;
            state.version = this.VERSION;
            state.runOver = !!state.runOver;
            return state;
        },

        _isTutorial(data) {
            const source = data || {};
            const spec = source.spec || {};
            return !!(source.tutorialReplay || spec.tutorialReplay || source.tutorialMode || source.tutorial || spec.tutorial || spec.harderIntro || source.harderIntro);
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

        _currentMapId() {
            const scene = Scene && Scene.Map ? Scene.Map.current : null;
            return Number(
                scene && (scene.id || scene.mapID || (scene.currentMap && scene.currentMap.id)) ||
                (Core && Core.Game && Core.Game.current && Core.Game.current.currentMapID) ||
                0
            ) || 0;
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
            ctx.shadowColor = 'rgba(255, 230, 0, 0.4)';
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
            ctx.strokeStyle = '#FFE600';
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
            const winning = !losing && Number(state.successStreak) >= RECOVERY_WIN_STREAK;
            const count = losing ? Number(state.failureStreak) : (Number(state.successStreak) || 0);
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
                ctx.strokeStyle = '#625765';
                ctx.lineWidth = 1.2 * sX;
                ctx.stroke();
                ctx.font = 'bold ' + Math.round(12 * sY) + 'px ' + numberFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#BDECF2';
                ctx.fillText(String(count), iconX, iconY);
            }
            ctx.restore();
        },

        /**
         * Futuristic Canvas HUD Renderer
         */
        drawHUD(ctx) {
            if (!ctx || !ctx.canvas || this.isRunOver() || !this._shouldDrawWithQuestPanel()) return false;
            const sX = ctx.canvas.width / 1280, sY = ctx.canvas.height / 720;
            const state = this._state();
            const target = Number(state.lifeForce) || 0;
            const panel = IP2Live.QuestManager._questPanelRect
                ? IP2Live.QuestManager._questPanelRect(ctx) : { x: 18 * sX, y: 88 * sY, w: 430 * sX };
            const x = panel.x, y = Math.max(8 * sY, panel.y - 78 * sY), w = panel.w, h = 70 * sY;
            const body = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
            const critical = this.isCritical();
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 550);
            if (this._animHp === undefined) this._animHp = target;
            if (this._ghostHp === undefined) this._ghostHp = target;
            this._animHp += (target - this._animHp) * 0.16;
            if (Math.abs(target - this._animHp) < 0.1) this._animHp = target;
            this._ghostHp = this._ghostHp < this._animHp ? this._animHp : this._ghostHp + (this._animHp - this._ghostHp) * 0.045;
            if (Math.abs(this._ghostHp - target) > 0.1 || critical) this._requestHudPaint();
            const badgeW = 58 * sX;
            const barX = x + 16 * sX, barY = y + 29 * sY;
            const barW = w - badgeW - 36 * sX, barH = 11 * sY;
            ctx.save();
            this._drawCyberPlate(ctx, x, y, w, h, 8 * sX);
            ctx.fillStyle = '#11121D'; ctx.fill();
            ctx.strokeStyle = critical ? '#FF3158' : '#373541'; ctx.lineWidth = 1.5 * sX; ctx.stroke();
            ctx.fillStyle = '#FF174D'; ctx.fillRect(x, y + 14 * sY, 3 * sX, h - 28 * sY);
            ctx.fillStyle = '#FFE600'; ctx.fillRect(x + w - 28 * sX, y, 18 * sX, 2 * sY);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.font = 'bold ' + Math.round(9 * sY) + 'px ' + body;
            ctx.fillStyle = '#D8D3E2'; ctx.fillText('NEURAL DECK', barX, y + 19 * sY);
            ctx.textAlign = 'right'; ctx.font = 'bold ' + Math.round(12 * sY) + 'px ' + body;
            ctx.fillStyle = critical ? '#FF7896' : '#FFFFFF';
            ctx.fillText(String(Math.round(target)).padStart(3, '0') + ' / 100', barX + barW, y + 19 * sY);
            ctx.fillStyle = '#29232F'; ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#FF8DA6'; ctx.fillRect(barX, barY, barW * this._ghostHp / 100, barH);
            const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
            barGrad.addColorStop(0, '#FF174D');
            barGrad.addColorStop(0.52, '#FF8A00');
            barGrad.addColorStop(1, '#FFE600');
            ctx.fillStyle = barGrad; ctx.fillRect(barX, barY, barW * this._animHp / 100, barH);
            ctx.fillStyle = '#11121D';
            for (let i = 1; i < 10; i++) ctx.fillRect(barX + barW * i / 10, barY, 2 * sX, barH);
            ctx.fillStyle = '#34303F'; ctx.fillRect(x + w - badgeW - 7 * sX, y + 13 * sY, sX, 43 * sY);
            this._drawQuestChainCard(ctx, x + w - badgeW, y + 6 * sY, badgeW, h - 12 * sY, state, sX, sY, pulse);
            ctx.textAlign = 'left'; ctx.font = 'bold ' + Math.round(7.5 * sY) + 'px ' + body;
            const change = state.lastChange;
            if (critical) {
                ctx.fillStyle = '#FF7896';
                ctx.fillText('DANGER // LIFE FORCE CRITICAL', barX, y + 57 * sY);
            } else if (change && change.delta !== 0 && Date.now() - Number(change.at || 0) < 6000) {
                ctx.fillStyle = change.delta > 0 ? '#FFE600' : '#FF7896';
                ctx.fillText((change.delta > 0 ? 'RECOVERY +' : 'DAMAGE ') + change.delta + ' // ' + String(change.kind || '').toUpperCase(), barX, y + 57 * sY);
            } else {
                ctx.fillStyle = '#B6B5C6';
                const wins = Number(state.successStreak) || 0;
                ctx.fillText(wins >= RECOVERY_WIN_STREAK ? 'RECOVERY ACTIVE' : 'RECOVERY AT 3 WINS / ' + wins + ' OF 3', barX, y + 57 * sY);
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
