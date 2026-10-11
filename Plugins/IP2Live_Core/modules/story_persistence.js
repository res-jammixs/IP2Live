/** Keep story progress inside the same native save record as the engine state. */
(function () {
    const persistence = {
        VERSION: 'story-persistence-20261011-01',
        _pending: new Map(),
        _loading: new Map(),
        _loadQueues: new Map(),

        prepareSave(slot, snapshot, game) {
            this._pending.set(Number(slot), {snapshot: JSON.parse(JSON.stringify(snapshot)), game});
        },
        clearPendingSave(slot) { this._pending.delete(Number(slot)); },

        install() {
            if (this._installed) return;
            this._installed = true;
            const service = this, platform = Common.Platform;
            const register = platform.registerSave, load = platform.loadSave;
            platform.registerSave = async function (slot, path, json) {
                if (Number(slot) < 1) return register.call(this, slot, path, json);
                const gm = IP2Live.GameManager;
                const pending = service._pending.get(Number(slot));
                const game = pending ? pending.game : Core.Game.current;
                if (!game || gm.isStorySaveExcluded(game)) throw new Error('Only Story Mode can write a story save.');
                if (Core.Game.current !== game) throw new Error('The story changed before saving.');
                const snapshot = pending ? pending.snapshot : gm.buildStoryProgressSnapshot(game, {slot, checkpointReason: 'engine_save'});
                if (!gm.validateStoryProgressSnapshot(snapshot, game) || Number(snapshot.mapId) !== Number(json.currentMapId)) {
                    throw new Error('Story progress does not match the engine save.');
                }
                // Browser IndexedDB and desktop integrity records now commit one payload.
                // Profile/localStorage copies are compatibility caches, never newer authority.
                const record = Object.assign({}, json, {_ip2liveProgress: JSON.parse(JSON.stringify(snapshot))});
                try { return await register.call(this, slot, path, record); }
                finally {
                    if (service._pending.get(Number(slot)) === pending) service._pending.delete(Number(slot));
                }
            };
            platform.loadSave = async function (slot, path) {
                const json = await load.call(this, slot, path);
                const game = service._loading.get(Number(slot));
                if (!game) return json;
                const autosave = IP2Live.StoryAutosave;
                const raw = json && json._ip2liveProgress ||
                    (autosave && Number(slot) === autosave.SLOT && autosave._restore && autosave._restore.snapshot);
                game._ip2liveCoreSnapshotChecked = true;
                delete game._ip2liveLoadedSnapshot;
                if (raw) {
                    const snapshot = JSON.parse(JSON.stringify(raw));
                    if (!IP2Live.GameManager.validateStoryProgressSnapshot(snapshot) ||
                        Number(snapshot.mapId) !== Number(json.currentMapId)) {
                        throw new Error('The saved story snapshot is invalid or uses an unsupported version.');
                    }
                    game._ip2liveLoadedSnapshot = snapshot;
                }
                return json;
            };
            const proto = Core.Game && Core.Game.prototype;
            if (!proto || typeof proto.load !== 'function') return;
            const nativeLoad = proto.load;
            proto.load = function (...args) {
                const game = this;
                const slot = Number(game.slot !== undefined ? game.slot :
                    game.slotID !== undefined ? game.slotID : game.currentSlot);
                const previous = service._loadQueues.get(slot) || Promise.resolve();
                const operation = previous.catch(() => {}).then(async () => {
                    service._loading.set(slot, game);
                    try {
                        const result = await nativeLoad.apply(game, args);
                        const autosave = IP2Live.StoryAutosave;
                        if (!game._ip2liveLoadedSnapshot && autosave && slot === autosave.SLOT && autosave._restore) {
                            game._ip2liveLoadedSnapshot = JSON.parse(JSON.stringify(autosave._restore.snapshot));
                        }
                        const snapshot = game._ip2liveLoadedSnapshot;
                        if (snapshot && !game.isEmpty) {
                            if (!IP2Live.GameManager.validateStoryProgressSnapshot(snapshot) || Number(snapshot.mapId) !== Number(game.currentMapID)) {
                                throw new Error('The loaded engine state does not match its story snapshot.');
                            }
                            if (snapshot.profileName) game.infiltratorName = game._ip2liveProfileName = snapshot.profileName;
                            if (snapshot.profileId) game.profileId = game._ip2liveProfileId = snapshot.profileId;
                            if (snapshot.storyRunId) game._ip2liveStoryRunId = snapshot.storyRunId;
                            await IP2Live.GameManager.prepareStoryReportRestore(snapshot);
                        }
                        return result;
                    } finally { if (service._loading.get(slot) === game) service._loading.delete(slot); }
                });
                service._loadQueues.set(slot, operation);
                const clear = () => { if (service._loadQueues.get(slot) === operation) service._loadQueues.delete(slot); };
                operation.then(clear, clear);
                return operation;
            };
        },
    };
    IP2Live.StoryPersistence = persistence;
    persistence.install();
}());
