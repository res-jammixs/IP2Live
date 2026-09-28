/** A single, transactional recovery save, independent of the numbered save slots. */
IP2Live.StoryAutosave = {
    SLOT: -2,
    _generation: 0,
    _game: null,
    _pending: null,
    _writing: false,
    _switching: false,
    _transaction: null,
    _status: null,
    _capture: null,
    _restore: null,

    _clone(value) { return JSON.parse(JSON.stringify(value)); },
    _id() {
        return typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID() : 'story-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    },
    _valid(record) {
        return !!(record && record.version === 1 && typeof record.storyRunId === 'string' && record.storyRunId && record.coreSave &&
            Number.isInteger(record.coreSave.currentMapId) && record.coreSave.currentMapId > 0 &&
            Array.isArray(record.coreSave.heroPosition) && record.coreSave.heroPosition.length === 3 && record.coreSave.heroPosition.every(Number.isFinite) &&
            record.snapshot && record.snapshot.storyRunId === record.storyRunId && Number.isFinite(record.snapshot.savedAt) && record.snapshot.savedAt > 0 &&
            Number(record.snapshot.mapId) === Number(record.coreSave.currentMapId));
    },
    async getSummary() {
        const record = await IP2Live.DBManager.getRecord('storyAutosaves', 'current');
        if (!this._valid(record)) return null;
        const s = record.snapshot;
        const stage = IP2Live.MapManager && IP2Live.MapManager.stageFor(s.mapId);
        return { storyRunId: record.storyRunId, profileName: s.profileName || 'Infiltrator',
            savedAt: s.savedAt, mapId: s.mapId, playTimeMs: s.playTimeMs,
            location: stage && stage.name ? stage.name : 'Map ' + s.mapId };
    },
    _excluded(result) {
        const node = IP2Live.GameManager && IP2Live.GameManager._activeGameplayNode;
        return !!((IP2Live.PracticeMode && IP2Live.PracticeMode.active) ||
            (IP2Live.TutorialReplay && IP2Live.TutorialReplay.session) ||
            (result && (result.developerTest || result.tutorialReplay || result.practiceMode)) ||
            (node && (node.developerTest || (node.spec && node.spec.developerTest))));
    },
    _invalidate() {
        this._generation++;
        if (this._transaction) {
            try { this._transaction.abort(); } catch (_) {}
        }
        if (this._pending) this._pending.waiters.forEach(resolve => resolve({saved:false, reason:'story-changed'}));
        this._pending = null;
        this._status = null;
    },
    beginStory(game, options = {}) {
        this._invalidate();
        this._game = game;
        this._switching = false;
        if (!options.preserveId || !game._ip2liveStoryRunId) game._ip2liveStoryRunId = this._id();
        this._blockedScene = options.scene ? null : Scene.Map.current;
        this._destination = Number(game.currentMapID);
        if (options.checkpoint !== false) this.checkpoint(options.reason || 'story_started');
    },
    checkpoint(reason = 'quest_completed', result) {
        const game = Core.Game.current;
        if (this._excluded(result) || !game || game !== this._game || this._switching) {
            return Promise.resolve({saved:false, reason:'not-active-story'});
        }
        return new Promise(resolve => {
            if (!this._pending) this._pending = {game, generation:this._generation, reason, waiters:[]};
            this._pending.reason = reason;
            this._pending.waiters.push(resolve);
            Manager.Stack.requestPaintHUD = true;
            // Quest completion can be followed immediately by a pause popup.
            // Flush after synchronous completion handlers, even if the map stops updating.
            setTimeout(() => this.tick(Scene.Map.current), 0);
        });
    },
    _ready(scene, game) {
        if (this._switching || this._excluded() || Core.Game.current !== game || this._game !== game) return false;
        if (!scene || scene !== Scene.Map.current || scene === this._blockedScene || scene.loading) return false;
        const mapId = Number(scene.id || scene.mapID);
        if (mapId !== Number(game.currentMapID) || (this._destination && mapId !== this._destination)) return false;
        const qm = IP2Live.QuestManager;
        if (qm && Number(qm.activeMapId) !== mapId) return false;
        return !(IP2Live.GameManager && IP2Live.GameManager._activeGameplayNode);
    },
    tick(scene) {
        if (this._status) Manager.Stack.requestPaintHUD = true;
        if (!this._pending || this._writing || !this._ready(scene, this._pending.game)) return;
        const request = this._pending;
        this._pending = null;
        this._writing = true;
        IP2Live.GameManager.enqueueSaveTask(async () => {
            if (request.generation !== this._generation || !this._ready(scene, request.game)) {
                // A map changed while a manual save held the queue. Keep the request for its destination.
                if (request.generation === this._generation && this._game === request.game) {
                    if (this._pending) this._pending.waiters.push(...request.waiters);
                    else this._pending = request;
                    return null;
                }
                return {saved:false, reason:'story-changed'};
            }
            this._setStatus('Saving story...', true);
            const record = await this._serialize(request);
            await this._commit(record, request);
            if (request.generation === this._generation) this._setStatus('Story autosaved');
            return {saved:true, snapshot:record.snapshot};
        }).then(result => {
            if (result) request.waiters.forEach(resolve => resolve(result));
        }).catch(error => {
            if (error.retryAfterMap && request.generation === this._generation) {
                if (this._pending) this._pending.waiters.push(...request.waiters);
                else this._pending = request;
                return;
            }
            if (request.generation === this._generation) {
                console.warn('[IP2Live] Story autosave failed:', error);
                this._setStatus('Autosave failed. Use Save Story; retrying at the next checkpoint.', false, true);
            }
            request.waiters.forEach(resolve => resolve({saved:false, reason:'storage-error'}));
        }).finally(() => {
            this._writing = false;
            if (this._pending && this._ready(Scene.Map.current,this._pending.game)) setTimeout(() => this.tick(Scene.Map.current),0);
        });
    },
    async _serialize(request) {
        // Save a shallow engine instance so save() cannot change the live slot or save counter.
        // The engine still builds its normal complete payload; the reserved route never touches a slot file.
        const shadow = Object.assign(Object.create(Object.getPrototypeOf(request.game)), request.game);
        const capture = {request, record:null};
        this._capture = capture;
        try {
            await shadow.save(this.SLOT);
            if (!capture.record) throw new Error('The engine did not produce an autosave payload.');
            return capture.record;
        } finally { if (this._capture === capture) this._capture = null; }
    },
    _record(coreSave, request) {
        if (request.generation !== this._generation || Core.Game.current !== request.game) throw new Error('Story changed during capture.');
        if (!this._ready(Scene.Map.current,request.game) || Number(coreSave.currentMapId) !== Number(request.game.currentMapID)) {
            const error = new Error('Map changed during capture.'); error.retryAfterMap = true; throw error;
        }
        const gm = IP2Live.GameManager, game = request.game;
        const snapshot = {
            storyRunId:game._ip2liveStoryRunId, profileName:gm._resolveProfileName(game), profileId:gm._resolveProfileId(game),
            mapId:Number(coreSave.currentMapId), heroPosition:gm._captureHeroPosition(game),
            questState:gm._buildQuestSnapshot(), gameStates:game.ip2liveGameStates || null,
            playTimeMs:gm.getPlayTimeMs(game), savedAt:Date.now(), checkpointReason:request.reason,
        };
        const record = this._clone({id:'current', version:1, storyRunId:game._ip2liveStoryRunId, coreSave, snapshot});
        if (!this._valid(record)) throw new Error('Incomplete story autosave payload.');
        return record;
    },
    async _commit(record, request) {
        const db = await IP2Live.DBManager.initDB();
        if (request.generation !== this._generation || Core.Game.current !== request.game) throw new Error('Stale autosave.');
        return new Promise((resolve, reject) => {
            let tx;
            try { tx = db.transaction(['storyAutosaves'], 'readwrite', {durability:'strict'}); }
            catch (_) { tx = db.transaction(['storyAutosaves'], 'readwrite'); }
            this._transaction = tx;
            const clear = () => { if (this._transaction === tx) this._transaction = null; };
            tx.oncomplete = () => { clear(); resolve(); };
            tx.onerror = () => { clear(); reject(tx.error || new Error('Autosave write failed.')); };
            tx.onabort = () => { clear(); reject(tx.error || new Error('Autosave write aborted.')); };
            tx.objectStore('storyAutosaves').put(record);
        });
    },
    _setStatus(text, saving = false, failed = false) {
        this._status = {text, saving, failed, until:Date.now() + (failed ? 9000 : 3500)};
        Manager.Stack.requestPaintHUD = true;
    },
    drawStatus(ctx) {
        const status = this._status;
        if (!ctx || !status || Core.Game.current !== this._game || this._excluded()) return;
        if (!status.saving && Date.now() > status.until) { this._status = null; return; }
        const s = Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720);
        ctx.save(); ctx.font = (12*s) + 'px Oxanium-Medium, sans-serif'; ctx.textAlign = 'right';
        const w = Math.min(ctx.canvas.width - 32*s, ctx.measureText(status.text).width + 28*s);
        ctx.fillStyle = 'rgba(3,10,17,0.88)'; ctx.fillRect(ctx.canvas.width-w-16*s,ctx.canvas.height-45*s,w,28*s);
        ctx.fillStyle = status.failed ? '#ef9a9f' : '#d8d79a';
        ctx.fillText(status.text,ctx.canvas.width-30*s,ctx.canvas.height-27*s,w-20*s); ctx.restore();
    },
    _describe(summary) {
        return summary.profileName + ' | ' + summary.location + ' | ' + new Date(summary.savedAt).toLocaleString();
    },
    _error(message) {
        IP2Live.confirPopup.show({title:'STORY AUTOSAVE', message, detail:'Your existing autosave has been kept.',
            cancelLabel:'BACK', confirmLabel:'OK'});
    },
    async confirmResume() {
        if (this._promptPending) return;
        this._promptPending = true;
        try {
            const summary = await this.getSummary();
            if (!summary) { this._error('No recoverable story autosave is available.'); return; }
            IP2Live.confirPopup.show({title:'RESUME AUTOSAVED STORY?', message:'Continue from your last completed quest.',
                detail:this._describe(summary), cancelLabel:'BACK', confirmLabel:'RESUME', onConfirm:()=>this.resume()});
        } catch (_) { this._error('Could not read the story autosave. Please try again.'); }
        finally { this._promptPending = false; }
    },
    async confirmNewStory(start) {
        if (this._promptPending) return;
        this._promptPending = true;
        try {
            const summary = await this.getSummary();
            if (!summary) return start();
            IP2Live.confirPopup.show({title:'AUTOSAVED STORY FOUND',
                message:'An autosaved story is available. Resume it and use Save Story to keep a permanent save before starting again.',
                detail:this._describe(summary), cancelLabel:'RESUME AUTOSAVE', confirmLabel:'START NEW STORY', danger:true,
                onCancel:()=>this.resume(), onConfirm:start, onDismiss:()=>{}});
        } catch (_) { this._error('Could not check the previous autosave. Please try again before starting a new story.'); }
        finally { this._promptPending = false; }
    },
    async confirmManualLoad(game, slot, proceed) {
        try {
            const summary = await this.getSummary();
            const snapshot = await IP2Live.GameManager.getSlotProgressSnapshot(slot, {loadedGame:game});
            if (snapshot && snapshot.storyRunId) game._ip2liveStoryRunId = snapshot.storyRunId;
            if (!summary || summary.storyRunId === game._ip2liveStoryRunId) return proceed();
            IP2Live.confirPopup.show({title:'SWITCH AUTOSAVED STORY?',
                message:'Loading this save will move autosave protection to that story. Resume the previous autosave and use Save Story first if you want to keep it.',
                detail:this._describe(summary), cancelLabel:'BACK', confirmLabel:'LOAD STORY', danger:true, onConfirm:proceed});
        } catch (_) { this._error('Could not check autosave protection. Please try loading again.'); }
    },
    replaceWithStory(factory, options = {}) {
        if (this._switching || !IP2Live.MenuTransition || IP2Live.MenuTransition.active) return false;
        const oldGame = Core.Game.current, oldMap = Scene.Map.current, gm = IP2Live.GameManager;
        const oldSlot = gm.getActiveSaveSlot(oldGame), oldQuest = gm._buildQuestSnapshot();
        let failed = false;
        this._invalidate(); this._switching = true;
        const failure = () => {
            failed = true;
            Core.Game.current = oldGame; Scene.Map.current = oldMap; this._switching = false;
            if (oldSlot) gm.setActiveSaveSlot(oldSlot, oldGame); else gm.clearActiveSaveSlot();
            if (oldQuest && IP2Live.QuestManager && oldGame) IP2Live.QuestManager.restoreProgress(oldQuest, {mapId:oldGame.currentMapID});
            this._setStatus('Story could not be loaded. Your autosave is unchanged.', false, true);
        };
        const generation = this._generation;
        const started = IP2Live.MenuTransition.replace(async () => {
            const target = await factory(() => {
                if (generation !== this._generation || !this._switching) throw new Error('Story load was cancelled.');
            });
            if (generation !== this._generation || !this._switching) throw new Error('Story load was cancelled.');
            return target;
        }, {
            replaceStack:scene => {
                const loadedGame = Core.Game.current;
                // Map.close() reads Game.current; close the old map against its own save state.
                try { Core.Game.current = oldGame; Scene.Map.current = oldMap; Manager.Stack.popAll(); }
                finally { Core.Game.current = loadedGame; Scene.Map.current = scene; }
            },
            onReady:scene => this.beginStory(Core.Game.current, {preserveId:true, scene,
                checkpoint:!options.resuming, reason:'manual_story_loaded'}),
            onFailure:failure,
            onClosed:() => { if (failed) this._error('Could not load the story. Please try again.'); },
        });
        if (!started) failure();
        return started;
    },
    async resume() {
        try {
            const record = await IP2Live.DBManager.getRecord('storyAutosaves','current');
            if (!this._valid(record)) throw new Error('Invalid autosave');
            return this.replaceWithStory(async assertActive => {
                if (Main && Main.waitForGameData) await Main.waitForGameData();
                assertActive();
                const game = new Core.Game(this.SLOT);
                // The native loader rehydrates variables, characters, inventory and map state.
                await IP2Live.GameManager.enqueueSaveTask(async () => {
                    assertActive();
                    Core.Game.current = game;
                    this._restore = record;
                    try { await game.load(); } finally { this._restore = null; }
                });
                assertActive();
                if (game.isEmpty) throw new Error('Autosave could not be decoded.');
                Core.Game.current = game;
                await game.loadPositions(); game.hero.initializeProperties();
                assertActive();
                const gm = IP2Live.GameManager;
                gm.clearActiveSaveSlot(); game.slot = -1;
                gm.restoreProgressFromSnapshot(record.snapshot,game,0);
                const scene = new Scene.Map(game.currentMapID);
                gm.prepareLoadedMapScene(scene,game.currentMapID);
                return scene;
            }, {resuming:true});
        } catch (error) { this._error('Could not restore the autosaved story. Please try again.'); return false; }
    },
    install() {
        const service = this, platform = Common.Platform;
        const register = platform.registerSave, load = platform.loadSave;
        platform.registerSave = async function(slot, path, json) {
            if (slot !== service.SLOT) return register.call(this,slot,path,json);
            if (!service._capture) throw new Error('Autosave capture is not active.');
            service._capture.record = service._record(json,service._capture.request);
        };
        platform.loadSave = async function(slot, path) {
            if (slot !== service.SLOT) return load.call(this,slot,path);
            if (!service._restore) throw new Error('Autosave restore is not active.');
            return service._clone(service._restore.coreSave);
        };
        const proto = Scene.Map.prototype, update = proto.update, draw = proto.drawHUD;
        proto.update = function(...args) { const result = update && update.apply(this,args); service.tick(this); return result; };
        proto.drawHUD = function(...args) { if (draw) draw.apply(this,args); service.drawStatus(Common.Platform.ctx); };
        const maps = IP2Live.MapManager;
        if (maps && maps.goTo) {
            const goTo = maps.goTo;
            maps.goTo = function(mapId, ...args) {
                if (Core.Game.current === service._game) {
                    service._destination = Number(mapId); service._blockedScene = Scene.Map.current;
                    if (service._writing) service.checkpoint('map_transition');
                }
                return goTo.call(this,mapId,...args);
            };
        }
    },
};
IP2Live.StoryAutosave.install();
