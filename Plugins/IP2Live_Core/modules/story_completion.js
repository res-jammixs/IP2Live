/** Earned story endings belong to a named run and survive returning to the title. */
(function () {
    const KEY = 'IP2Live.story-completions.v1';
    const completion = {
        _records: new Map(), activeScene: null,
        isRecord(record) {
            return !!(record && record.version === 1 && record.mode === 'story' && record.status === 'completed' &&
                typeof record.id === 'string' && record.id && typeof record.name === 'string' && record.name.trim() &&
                Number.isFinite(record.completedAt) && record.completedAt > 0 && Number(record.finalMapId) > 0);
        },
        _merge(records) {
            for (const record of Array.isArray(records) ? records : []) {
                if (this.isRecord(record)) this._records.set(record.id, { ...record });
            }
        },
        async list() {
            try { this._merge(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) {}
            let error = null;
            try {
                if (IP2Live.DBManager) {
                    const profiles = await IP2Live.DBManager.getAllRecords('profiles');
                    for (const profile of profiles || []) this._merge(profile.storyCompletions);
                }
            } catch (cause) { error = cause; }
            // Read errors remain retryable rather than looking like an empty archive.
            if (error && !this._records.size) throw error;
            return [...this._records.values()].sort((a, b) => b.completedAt - a.completedAt);
        },
        async persist(record) {
            this._merge([record]);
            let saved = false;
            try {
                this._merge(JSON.parse(localStorage.getItem(KEY) || '[]'));
                localStorage.setItem(KEY, JSON.stringify([...this._records.values()])); saved = true;
            } catch (error) { console.warn('[IP2Live] Completion cache could not be saved:', error); }
            try {
                const db = IP2Live.DBManager;
                if (db) {
                    const profile = await db.getRecord('profiles', record.name) || { infiltratorName: record.name };
                    const records = new Map((profile.storyCompletions || []).filter(r => this.isRecord(r)).map(r => [r.id, r]));
                    records.set(record.id, { ...record });
                    await db.saveRecord('profiles', { ...profile, storyCompletions: [...records.values()] }); saved = true;
                }
            } catch (error) { console.warn('[IP2Live] Completion profile could not be saved:', error); }
            return saved;
        },
        canComplete(stage, game = Core.Game.current) {
            const gm = IP2Live.GameManager, maps = IP2Live.MapManager;
            if (!game || !gm || gm.isStorySaveExcluded(game) || !stage || !maps) return false;
            const route = maps.stages.filter(s => s && !s.tutorial && s.questEnabled !== false);
            const last = route[route.length - 1];
            if (!last || Number(stage.id) !== last.id || Number(game.currentMapID) !== last.id) return false;
            const done = IP2Live.QuestManager && IP2Live.QuestManager.completedObjectives || {};
            return route.every(s => done['stage.default_exit.' + s.id] && done['stage.default_exit.' + s.id].reach_stage_exit === true);
        },
        start(stage) {
            const game = Core.Game.current;
            if (this.activeScene || !this.canComplete(stage, game) || !IP2Live.StoryEndingScreen) return false;
            const gm = IP2Live.GameManager;
            const name = gm._resolveProfileName(game);
            if (!name) return false;
            const states = game.ip2liveGameStates || (game.ip2liveGameStates = {});
            let record = states.storyCompletion;
            if (!this.isRecord(record) || record.name !== name || record.storyRunId !== game._ip2liveStoryRunId) {
                const runId = game._ip2liveStoryRunId || ('story-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
                game._ip2liveStoryRunId = runId;
                record = { version: 1, id: runId, storyRunId: runId, profileId: gm._resolveProfileId(game),
                    mode: 'story', status: 'completed', name, completedAt: Date.now(), finalMapId: Number(stage.id),
                    floors: IP2Live.MapManager.stages.filter(s => s && !s.tutorial && s.questEnabled !== false).length };
                if (gm.getStoryCompletionSummary) record.curriculum = gm.getStoryCompletionSummary(game);
                states.storyCompletion = record;
                gm._logTelemetryEvent?.('story_completed', { infiltratorName: name, profileId: record.profileId,
                    mapId: record.finalMapId, timestamp: record.completedAt, outcome: 'completed',
                    payload: { record: gm._clonePlain(record) } });
            }
            this._merge([record]);
            // Freeze the world immediately; save after all synchronous quest handlers finish.
            const scene = this._open(record, false);
            scene.saveTask = Promise.resolve().then(() => this.save(record, game)).then(result => {
                scene.saveResult = result; Manager.Stack.requestPaintHUD = true; return result;
            }).catch(error => {
                console.warn('[IP2Live] Story completion save failed:', error);
                scene.saveResult = { archived: false, storySaved: false }; Manager.Stack.requestPaintHUD = true;
                return scene.saveResult;
            });
            return true;
        },
        async save(record, game) {
            const gm = IP2Live.GameManager, autosave = IP2Live.StoryAutosave;
            const tasks = [];
            if (Core.Game.current === game) {
                if (autosave) tasks.push(Promise.resolve().then(() => autosave.checkpoint('story_completed')));
                if (gm && gm.saveProgressToActiveSlot) tasks.push(Promise.resolve().then(() => gm.saveProgressToActiveSlot(null, null, { checkpointReason: 'story_completed' })));
            }
            const results = await Promise.allSettled(tasks);
            // Numbered saves also write profiles. Merge the award after those writes.
            const archived = await this.persist(record);
            const storySaved = results.some(r => r.status === 'fulfilled' && r.value && r.value.saved);
            return { archived, storySaved };
        },
        _open(record, certificateOnly) {
            IP2Live.InputGuard?.reset();
            IP2Live.DialogueManager?.resetTransitionState?.({ stopActive: true, discardActive: true });
            const qm = IP2Live.QuestManager;
            if (qm && qm.hideQuest) qm.hideQuest();
            if (IP2Live.QuestMinimap && IP2Live.QuestMinimap.destroy) IP2Live.QuestMinimap.destroy();
            const scene = new IP2Live.StoryEndingScreen(record, { certificateOnly });
            Manager.Stack.push(scene); this.activeScene = scene;
            return scene;
        },
        resumeIfCompleted(scene) {
            const game = Core.Game.current, gm = IP2Live.GameManager;
            if (!game || !gm || gm.isStorySaveExcluded(game) || scene.loading || Manager.Stack.top !== scene || this.activeScene) return false;
            const record = game.ip2liveGameStates && game.ip2liveGameStates.storyCompletion;
            // Older completed saves have the finished route but no award record yet.
            if (!this.isRecord(record)) return this.start(IP2Live.MapManager.stageFor(game.currentMapID));
            if (!this.isRecord(record) || record.storyRunId !== game._ip2liveStoryRunId || record.name !== gm._resolveProfileName(game) ||
                Number(record.finalMapId) !== Number(game.currentMapID)) return false;
            const ending = this._open(record, true);
            ending.saveTask = this.persist(record).then(archived => (ending.saveResult = { archived, storySaved: true }));
            return true;
        },
        release(scene) {
            if (this.activeScene === scene) this.activeScene = null;
            if (IP2Live.MapManager) IP2Live.MapManager._stageRouteLocked = false;
        },
    };
    IP2Live.StoryCompletion = completion;
})();
