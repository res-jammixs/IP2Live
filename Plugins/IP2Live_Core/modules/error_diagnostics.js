/** Story-owned, durable mistake recaps. Acknowledgement never changes assessment data. */
(function () {
    'use strict';
    const journal = IP2Live.ErrorDiagnostics = {
        VERSION: 1, _ui: null, _stateRef: null, _pendingState: null, _pendingCount: 0,
        _game() { return Core && Core.Game && Core.Game.current; },
        _clone(value) { return JSON.parse(JSON.stringify(value)); },
        getState(create = true) {
            const game = this._game();
            if (!game) return null;
            if (!game.ip2liveGameStates) { if (!create) return null; game.ip2liveGameStates = {}; }
            let state = game.ip2liveGameStates.errorDiagnostics;
            const profile = game._ip2liveProfileId || game.profileId || null;
            if (!state || state.version !== this.VERSION || !Array.isArray(state.entries) ||
                (profile && state.profileId && state.profileId !== profile)) {
                if (!create) return null;
                state = game.ip2liveGameStates.errorDiagnostics = { version: this.VERSION, profileId: profile, entries: [], seen: {}, sequence: 0 };
            }
            if (!state.seen || typeof state.seen !== 'object') state.seen = {};
            if (state.groupingVersion !== 2) this._upgradeState(state);
            return state;
        },
        entries() { const state = this.getState(false); return state ? state.entries : []; },
        _questKey(questId, mapId) { return questId ? JSON.stringify([Number(mapId) || 0, String(questId)]) : null; },
        _isolated() {
            return ['PracticeMode', 'PVPMode', 'EndlessMode'].some(name => IP2Live[name] && IP2Live[name].active) ||
                !!(IP2Live.TutorialReplay && IP2Live.TutorialReplay.session);
        },
        _errorKey(gameplayId, row) {
            const step = row.stepKey || row.concept || row.type || 'unknown';
            const submitted = row.submitted !== undefined ? row.submitted : row.submittedText;
            const expected = row.expected !== undefined ? row.expected : row.expectedText;
            if (row.terminal) return JSON.stringify([gameplayId, 'terminal', row.reason || 'failed']);
            // Different addresses of the same class teach the same correction; keep distinct class confusions.
            if (['ip_classification', 'mask_classification', 'classify'].includes(step) || row.concept === 'ipv4_classification') {
                return JSON.stringify([gameplayId, step === 'mask_classification' ? 'mask_classification' : 'ip_classification',
                    String(submitted == null ? '' : submitted).trim().toUpperCase(), String(expected || row.sourceClass || '').trim().toUpperCase()]);
            }
            let issue = row.issueType;
            if (!issue || issue === 'wrong_answer') {
                issue = submitted == null || submitted === '' ? 'missing_answer' :
                    typeof expected === 'number' && typeof submitted === 'string' && !/^\/?\d+$/.test(submitted.trim()) ? 'invalid_input' : 'wrong_answer';
                if (step === 'borrow_bits' && Number.isFinite(Number(submitted)) && Number.isFinite(Number(expected))) {
                    issue = Number(submitted) < Number(expected) ? 'too_few_bits' : 'too_many_bits';
                }
            }
            return JSON.stringify([gameplayId, step, issue,
                step === 'address_operator' ? expected : null, row.taskType || null]);
        },
        _upgradeState(state) {
            const groups = new Map(), compact = [];
            // Old journals are already newest-first. Preserve the newest example and any existing pin.
            for (const entry of state.entries) {
                if (!entry || !entry.id) continue;
                entry.row = entry.row || {};
                entry.errorKey = this._errorKey(entry.gameplayId, entry.row || {});
                entry.occurrences = Math.max(1, Number(entry.occurrences) || 1);
                entry.pinned = !!entry.pinned;
                const existing = groups.get(entry.errorKey);
                if (existing) { existing.occurrences += entry.occurrences; existing.pinned ||= entry.pinned; }
                else { groups.set(entry.errorKey, entry); compact.push(entry); }
            }
            state.entries = compact; state.groupingVersion = 2;
            state.sequence = compact.reduce((max, entry) => Math.max(max, Number(entry.sequence) || 0), Number(state.sequence) || 0);
            state.revision = (Number(state.revision) || 0) + 1;
        },
        beginQuest(questId, mapId) {
            if (!questId || this._isolated()) return 0;
            const state = this.getState(false), key = this._questKey(questId, mapId);
            if (!state || state.questKey === key) return 0;
            const previousQuest = state.questKey;
            state.questKey = key;
            const before = state.entries.length;
            state.entries = state.entries.filter(entry => entry.pinned || (!previousQuest && this._questKey(entry.questId, entry.mapId) === key));
            state.revision = (Number(state.revision) || 0) + 1;
            this._pendingCount = 0; this._pendingState = null;
            if (this._ui) { this._ui.dismissNotification(); this._ui.refresh(); }
            this._checkpoint('diagnostic_quest_changed');
            return before - state.entries.length;
        },
        _syncQuest() {
            const quests = IP2Live.QuestManager;
            if (quests && quests.activeQuestId) this.beginQuest(quests.activeQuestId, quests.activeMapId || this._game() && this._game().currentMapID);
        },
        setPinned(id, pinned) {
            const state = this.getState(false), entry = state && state.entries.find(item => item.id === id);
            if (!entry || entry.pinned === !!pinned) return false;
            entry.pinned = !!pinned; state.revision = (Number(state.revision) || 0) + 1;
            this._checkpoint('diagnostic_pin_changed');
            return true;
        },
        _allowed(attempt) {
            const game = this._game(), spec = attempt.spec || {}, result = attempt.result || attempt.payload && attempt.payload.result || {};
            const gm = IP2Live.GameManager;
            if (gm && typeof gm._excludeAssessmentTelemetry === 'function' && gm._excludeAssessmentTelemetry(attempt)) return false;
            if (!game || !attempt.gameplayId || !attempt.attemptId || attempt.tutorial || attempt.tutorialReplay || attempt.guidedTutorial || attempt.tutorialMode ||
                attempt.developerTest || attempt.simulated || attempt.developerQuestFail || attempt.developerQuestSkip || spec.developerTest ||
                result.developerTest || result.developerSkip || result.developerFail || result.practiceMode ||
                (IP2Live.PracticeMode && IP2Live.PracticeMode.active) || (IP2Live.PVPMode && IP2Live.PVPMode.active) ||
                (IP2Live.EndlessMode && IP2Live.EndlessMode.active) || (IP2Live.TutorialReplay && IP2Live.TutorialReplay.session)) return false;
            const profile = game._ip2liveProfileId || game.profileId;
            return !profile || !attempt.profileId || profile === attempt.profileId;
        },
        recordAttempt(attempt) {
            if (!attempt || !this._allowed(attempt)) return 0;
            const payload = attempt.payload || {}, result = attempt.result || payload.result || {};
            const history = Array.isArray(result.decisionHistory) ? result.decisionHistory : Array.isArray(payload.decisionHistory) ? payload.decisionHistory : [];
            const mistakes = Array.isArray(payload.mistakes) ? payload.mistakes : Array.isArray(attempt.mistakes) ? attempt.mistakes : [];
            const observations = history.length ? history.map((row, index) => ({ row, key: 'decision-' + index })).filter(item => item.row && item.row.correct === false) :
                mistakes.map((row, index) => ({ row, key: 'mistake-' + index })).filter(item => item.row && item.row.correct !== true);
            const reason = attempt.failureReason || result.reason;
            if (reason === 'timeout' || reason === 'time_expired' || reason === 'time_limit' ||
                (!observations.length && attempt.outcome === 'failed' && !attempt.cancelled)) {
                observations.push({ key: 'terminal', row: { terminal: true, reason: reason || 'failed', submitted: 'Activity unfinished', expected: 'Complete the quest checks' } });
            }
            if (!observations.length) return 0;
            const state = this.getState(), registry = IP2Live.GameplayDiagnostics;
            if (!state || !registry) return 0;
            this._syncQuest();
            const attemptQuest = this._questKey(attempt.questId, attempt.mapId);
            if (!state.questKey && attemptQuest) state.questKey = attemptQuest;
            const staleQuest = !!(attemptQuest && state.questKey && attemptQuest !== state.questKey);
            // Terminal failure moves the player to a recovery quest before its result is closed.
            // Those mistakes belong in the returning world's recap, with their original quest context.
            const recoveryFailure = attempt.outcome === 'failed' && attempt.neuralRecovery === 'rollback-previous-quest' &&
                ['attempts_exhausted', 'hearts_exhausted'].includes(reason) && !!attempt.rollbackQuestId &&
                this._questKey(attempt.rollbackQuestId, attempt.mapId) === state.questKey;
            const adapter = registry.get(attempt.gameplayId);
            let added = 0, changed = false; const occurrences = Object.create(null);
            for (const item of observations) {
                // Use observed values plus occurrence order, not the mirrored telemetry source.
                const r = item.row;
                const fingerprint = r.terminal ? 'terminal' : JSON.stringify([r.stepKey || r.concept || '',
                    r.submitted !== undefined ? r.submitted : r.submittedText,
                    r.expected !== undefined ? r.expected : r.expectedText, r.sourceId || null, r.slot == null ? null : r.slot, r.branchId || null]);
                const ordinal = occurrences[fingerprint] || 0; occurrences[fingerprint] = ordinal + 1;
                const key = attempt.attemptId + ':' + fingerprint + ':' + ordinal;
                if (Object.prototype.hasOwnProperty.call(state.seen, key)) continue;
                state.seen[key] = true; changed = true;
                const row = this._clone(item.row);
                const errorKey = this._errorKey(attempt.gameplayId, row);
                const existing = state.entries.find(entry => entry.errorKey === errorKey);
                // Quest completion can advance the queue before its final result arrives.
                // Never re-add expired recaps from that previous quest.
                if (staleQuest && !recoveryFailure && (!existing || !existing.pinned)) continue;
                const explanation = row.terminal ? {
                    title: /time/.test(row.reason) ? 'Time ran out before completion' : 'Quest attempt ended before completion',
                    submitted: 'Activity unfinished', expected: 'Complete the quest checks',
                    why: /time/.test(row.reason) ? 'The activity’s **time limit expired**. This is an unfinished attempt, not evidence of a particular calculation error.' :
                        'The activity ended with **' + row.reason + '**. No more specific incorrect answer was recorded for this recap.',
                    hint: 'Review the task and any recorded mistakes, practice the prerequisites, then retry. Acknowledging this recap does not complete the quest.',
                } : adapter.explain(row, attempt);
                const data = { gameplayId: attempt.gameplayId,
                    gameplayLabel: adapter.label, attemptId: attempt.attemptId, questId: attempt.questId || null,
                    objectiveId: attempt.objectiveId || null, stageId: attempt.stageId || 0, levelId: attempt.levelId || 0,
                    mapId: attempt.mapId || 0, loggedAt: Date.now(), row, ...explanation };
                if (existing) {
                    Object.assign(existing, data, { occurrences: (Number(existing.occurrences) || 1) + 1 });
                    state.entries.splice(state.entries.indexOf(existing), 1); state.entries.unshift(existing);
                } else {
                    state.sequence = (Number(state.sequence) || 0) + 1;
                    state.entries.unshift({ id: key, sequence: state.sequence, errorKey, occurrences: 1, pinned: false, ...data });
                    added++;
                }
            }
            if (changed) { state.revision = (Number(state.revision) || 0) + 1; this._checkpoint('diagnostic_errors_logged'); }
            if (added) {
                if (this._pendingState !== state) this._pendingCount = 0;
                this._pendingState = state;
                this._pendingCount += added;
            }
            if (changed && this._ui) this._ui.refresh();
            return added;
        },
        acknowledge(id) {
            const state = this.getState(false);
            if (!state) return false;
            const index = state.entries.findIndex(entry => entry.id === id);
            if (index < 0) return false;
            state.entries.splice(index, 1);
            state.revision = (Number(state.revision) || 0) + 1;
            this._checkpoint('diagnostic_error_acknowledged');
            return true;
        },
        _checkpoint(reason) {
            const gm = IP2Live.GameManager;
            if (gm && typeof gm._queueCheckpoint === 'function') gm._queueCheckpoint(reason);
            const autosave = IP2Live.StoryAutosave;
            if (autosave && typeof autosave.checkpoint === 'function') {
                const pending = autosave.checkpoint(reason);
                if (pending && typeof pending.catch === 'function') pending.catch(error => console.warn('[IP2Live] Diagnostic autosave failed:', error));
            }
        },
        updateHUD() {
            this._syncQuest();
            if (typeof document === 'undefined' || !document.body || !IP2Live.ErrorDiagnosticUI) return;
            const state = this.getState(false), map = IP2Live.QuestMinimap, game = this._game();
            if (this._stateRef !== state || this._owner !== game) {
                if (this._ui) this._ui.destroy();
                this._ui = null; this._stateRef = state; this._owner = game;
            }
            if (!game || !map || !map._container) { if (this._ui) this._ui.setVisible(false); return; }
            if (!this._ui) this._ui = new IP2Live.ErrorDiagnosticUI(this);
            const screen = this._ui.screen;
            const visible = !(IP2Live.PracticeMode && IP2Live.PracticeMode.active) && !(IP2Live.PVPMode && IP2Live.PVPMode.active) &&
                !(IP2Live.EndlessMode && IP2Live.EndlessMode.active) &&
                (Manager.Stack.top === Scene.Map.current || Manager.Stack.top === screen) && !map._shouldHide();
            this._ui.setVisible(visible);
            if (!visible) { this._ui.close(); return; }
            this._ui.place(map._container.getBoundingClientRect());
            if (!this._ui.visible) return;
            this._ui.refresh();
            if (!screen && this._pendingState === state && this._pendingCount) {
                this._ui.notify(this._pendingCount); this._pendingCount = 0;
            }
        },
        getHudBounds() {
            return this._ui && this._ui.visible ? this._ui.root.getBoundingClientRect() : null;
        },
        hideHUD() { if (this._ui) { this._ui.setVisible(false); this._ui.close(); } },
        resetUI() {
            if (this._ui) this._ui.destroy();
            this._ui = null; this._owner = null; this._stateRef = null; this._pendingState = null; this._pendingCount = 0;
        },
    };
})();
