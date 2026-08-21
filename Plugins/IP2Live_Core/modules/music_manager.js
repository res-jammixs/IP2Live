/**
 * IP2Live music and custom sound-effect manager.
 *
 * Audio files are registered in RPG Paper Maker's songs database and are
 * resolved through Data.Songs. This is important for protected Windows
 * exports: RPG Paper Maker embeds registered audio as data URLs in songs.json
 * and does not copy the loose Songs directory into resources/app/build.
 *
 * This module intentionally keeps the existing zone API used by the maps,
 * gameplay screens, settings screen, credits, and main menu.
 */

// Stable IDs from the project's songs.json database.
var MUSIC_TRACKS = {
    MAIN_MENU:  { id: 9,  name: 'Main Menu.mp3',      volume: 0.95 },
    TUTORIAL:   { id: 10, name: 'Tutorial.mp3',       volume: 0.65 },
    STAGE_1:    { id: 11, name: 'Stage 1 Music.mp3',  volume: 0.72 },
    STAGE_2:    { id: 12, name: 'Stage 2 Music.mp3',  volume: 0.72 },
    STAGE_3:    { id: 13, name: 'Stage 3 Music.mp3',  volume: 0.72 },
    STAGE_4:    { id: 14, name: 'Stage 4 Music.mp3',  volume: 0.72 },
    GAMEPLAY_1: { id: 15, name: 'Gameplay 1.mp3',     volume: 0.58 },
    GAMEPLAY_2: { id: 16, name: 'Gameplay 2.mp3',     volume: 0.58 },
    GAMEPLAY_56:{ id: 17, name: 'Gameplay 5 & 6.mp3', volume: 0.58 },
};

var EFFECT_TRACKS = {
    TYPING: { id: 2, name: 'Typing.mp3',   volume: 0.35, halfOnly: true },
    GLITCH: { id: 3, name: 'Glitch01.mp3', volume: 0.10, halfOnly: false },
};

function _songKind(name, fallback) {
    if (
        typeof Common !== 'undefined' &&
        Common.SONG_KIND &&
        typeof Common.SONG_KIND[name] === 'number'
    ) {
        return Common.SONG_KIND[name];
    }
    return fallback;
}

function _musicKind() {
    return _songKind('MUSIC', 1);
}

function _musicEffectKind() {
    return _songKind('MUSIC_EFFECT', 4);
}

function _kindList(kind) {
    if (
        typeof Data === 'undefined' ||
        !Data.Songs ||
        !Data.Songs.list ||
        typeof Data.Songs.list.get !== 'function'
    ) {
        return null;
    }
    return Data.Songs.list.get(kind) || null;
}

function _registeredSong(kind, id) {
    var list = _kindList(kind);
    return list && typeof list.get === 'function' ? (list.get(id) || null) : null;
}

function _sourceValue(song) {
    if (!song) return '';
    if (typeof song.base64 === 'string' && song.base64) return song.base64;
    if (song.howl && song.howl._src) {
        return Array.isArray(song.howl._src) ? String(song.howl._src[0] || '') : String(song.howl._src);
    }
    try {
        return typeof song.getPath === 'function' ? String(song.getPath() || '') : '';
    } catch (e) {
        return '';
    }
}

function _sourceTransport(song) {
    var value = _sourceValue(song);
    if (/^data:audio\//i.test(value)) return 'embedded-data-url';
    if (/^blob:/i.test(value)) return 'blob-url';
    if (value) return 'project-file';
    return 'missing';
}

/**
 * Resolve a registered RPG Paper Maker song and create its Howl immediately.
 *
 * Music intentionally does not wait for decoding before asking the engine to
 * play it. Manager.Songs.playMusic() and Howler already queue playback while
 * an MP3 is loading; waiting here used to separate the eventual play() call
 * from the user's keyboard/mouse gesture and could leave BGM silent even
 * though short UI sound effects worked.
 */
function _prepareRegisteredHowl(kind, entry, label) {
    var song = _registeredSong(kind, entry.id);
    if (!song) {
        return {
            ok: false,
            error: 'Song ID ' + entry.id + ' is not available in Data.Songs (' + label + ').',
        };
    }
    if (String(song.name || '') !== entry.name) {
        return {
            ok: false,
            error: 'Song ID ' + entry.id + ' expected "' + entry.name + '" but found "' + String(song.name || '') + '".',
        };
    }

    var transport = _sourceTransport(song);
    try {
        if (typeof song.load === 'function') song.load();
    } catch (error) {
        return { ok: false, error: 'Could not create the Howl for ' + entry.name + ': ' + error.message };
    }
    if (!song.howl) {
        return { ok: false, error: 'RPG Paper Maker did not create a Howl for ' + entry.name + '.' };
    }
    return { ok: true, song: song, howl: song.howl, transport: transport };
}

function _loadRegisteredHowl(kind, entry, label) {
    return new Promise(function (resolve) {
        var prepared = _prepareRegisteredHowl(kind, entry, label);
        if (!prepared.ok) {
            resolve(prepared);
            return;
        }
        var song = prepared.song;
        var howl = prepared.howl;
        var transport = prepared.transport;
        if (typeof howl.state !== 'function' || howl.state() === 'loaded') {
            resolve({ ok: true, song: song, howl: howl, transport: transport });
            return;
        }

        var settled = false;
        var timer = null;
        var finish = function (result) {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            if (typeof howl.off === 'function') {
                howl.off('load', onLoad);
                howl.off('loaderror', onLoadError);
            }
            resolve(result);
        };
        var onLoad = function () {
            finish({ ok: true, song: song, howl: howl, transport: transport });
        };
        var onLoadError = function (soundId, error) {
            finish({
                ok: false,
                error: 'Howler could not load ' + entry.name + ': ' + String(error || soundId || 'unknown load error'),
            });
        };

        howl.once('load', onLoad);
        howl.once('loaderror', onLoadError);
        timer = setTimeout(function () {
            finish({ ok: false, error: 'Timed out while decoding ' + entry.name + '.' });
        }, 30000);

        try {
            if (howl.state() === 'unloaded' && typeof howl.load === 'function') howl.load();
        } catch (error) {
            finish({ ok: false, error: 'Could not load ' + entry.name + ': ' + error.message });
        }
    });
}

var MusicManager = {
    VERSION: 'native-bgm-20260821-03',
    _howl: null,
    _soundId: null,
    _currentZone: null,
    _requestedZone: null,
    _lastRequestedZone: null,
    _requestToken: 0,
    _masterVolume: 0.55,
    _muted: false,
    _fadeDuration: 1200,
    _registryAuditScheduled: false,
    _warnedAudioLock: false,
    _gestureRetryInstalled: false,
    _lastGestureRetryAt: 0,

    ZONE: {
        MAIN_MENU: 'MAIN_MENU',
        TUTORIAL: 'TUTORIAL',
        STAGE_1: 'STAGE_1',
        STAGE_2: 'STAGE_2',
        STAGE_3: 'STAGE_3',
        STAGE_4: 'STAGE_4',
        GAMEPLAY_1: 'GAMEPLAY_1',
        GAMEPLAY_2: 'GAMEPLAY_2',
        GAMEPLAY_56: 'GAMEPLAY_56',
    },

    /**
     * Play a logical music zone. Returns a promise resolving to true only when
     * the requested Howl actually starts. Callers that do not need the result
     * can continue calling this method without awaiting it.
     */
    play: function (zone) {
        zone = this._resolveDynamicZone(zone);
        var track = MUSIC_TRACKS[zone];
        if (!track) {
            console.warn('[MusicManager] Unknown zone: ' + zone);
            return Promise.resolve(false);
        }

        this._lastRequestedZone = zone;
        this._scheduleRegistryAudit();

        if (this._currentZone === zone && this.isPlaying()) {
            this._applyCurrentVolume();
            return Promise.resolve(true);
        }

        var self = this;
        var requestToken = ++this._requestToken;
        this._requestedZone = zone;
        var prepared = _prepareRegisteredHowl(_musicKind(), track, 'music zone ' + zone);
        if (!prepared.ok) {
            this._requestedZone = null;
            console.error(
                '[MusicManager] ' + prepared.error +
                ' This is normally a stale export: create a fresh protected Windows export after registering the custom songs.'
            );
            return Promise.resolve(false);
        }

        // Resume first when possible, but always let RPG Paper Maker perform
        // the actual play. Its native Howler path safely queues playback while
        // decoding and reports playerror when a user gesture is required.
        return this.unlock()
            .then(function () {
                if (requestToken !== self._requestToken || self._requestedZone !== zone) return false;
                return self._startNativePlayback(prepared, zone, self._targetVolume(zone), requestToken);
            })
            .catch(function (error) {
                if (requestToken === self._requestToken) self._requestedZone = null;
                console.error('[MusicManager] Failed to play zone ' + zone + ':', error);
                return false;
            });
    },

    /** Resume Howler's shared AudioContext. Safe to call directly from input. */
    unlock: function () {
        if (typeof Howler === 'undefined') {
            console.error('[MusicManager] Howler is unavailable.');
            return Promise.resolve(false);
        }
        var ctx = Howler.ctx;
        // Howler tracks both AudioContext.state and its own state. Calling its
        // resume helper keeps those two values synchronized before native RPG
        // Paper Maker playback starts.
        try {
            if (typeof Howler._autoResume === 'function') Howler._autoResume();
        } catch (e) { }
        if (!ctx) return Promise.resolve(true);
        if (ctx.state === 'running' && Howler.state !== 'suspended') return Promise.resolve(true);
        if (typeof ctx.resume !== 'function') return Promise.resolve(ctx.state === 'running');
        try {
            return Promise.resolve(ctx.resume())
                .then(function () {
                    try {
                        if (typeof Howler._autoResume === 'function') Howler._autoResume();
                    } catch (e) { }
                    return ctx.state === 'running';
                })
                .catch(function () { return false; });
        } catch (e) {
            return Promise.resolve(false);
        }
    },

    /** Retry the last requested zone after a user gesture. */
    retry: function () {
        var zone = this._lastRequestedZone;
        if (!zone) return Promise.resolve(false);
        var self = this;
        return this.unlock().then(function () { return self.play(zone); });
    },

    /** Retry the active logical zone from the next genuine input gesture. */
    installGestureRetry: function () {
        if (this._gestureRetryInstalled || typeof document === 'undefined') return false;
        this._gestureRetryInstalled = true;
        var self = this;
        var retryFromGesture = function () {
            if (!self._lastRequestedZone || self.isPlaying()) return;
            var now = Date.now();
            if (now - self._lastGestureRetryAt < 250) return;
            self._lastGestureRetryAt = now;
            // Call resume synchronously in the event callback, then replace a
            // stale pending autoplay request with native playback for the most
            // recently assigned menu/tutorial/stage/gameplay zone.
            self.unlock();
            self.retry().catch(function (error) {
                console.warn('[MusicManager] Gesture retry failed:', error);
            });
        };
        document.addEventListener('keydown', retryFromGesture, true);
        document.addEventListener('pointerup', retryFromGesture, true);
        document.addEventListener('mousedown', retryFromGesture, true);
        return true;
    },

    stop: function (fadeDurationMs) {
        return this._stopActive(fadeDurationMs, false);
    },

    fadeOutForTransition: function (fadeDurationMs) {
        return this._stopActive(fadeDurationMs, true);
    },

    setVolume: function (vol) {
        this._masterVolume = Math.max(0, Math.min(1, Number(vol) || 0));
        this._applyCurrentVolume();
    },

    getVolume: function () {
        return this._masterVolume;
    },

    setTrackVolume: function (zone, vol) {
        if (!MUSIC_TRACKS[zone]) {
            console.warn('[MusicManager] Unknown zone: ' + zone);
            return;
        }
        MUSIC_TRACKS[zone].volume = Math.max(0, Math.min(1, Number(vol) || 0));
        if (this._currentZone === zone) this._applyCurrentVolume();
    },

    mute: function () {
        this._muted = true;
        this._applyCurrentVolume();
    },

    unmute: function () {
        this._muted = false;
        this._applyCurrentVolume();
    },

    toggleMute: function () {
        if (this._muted) this.unmute();
        else this.mute();
    },

    isMuted: function () {
        return this._muted;
    },

    currentZone: function () {
        return this._currentZone;
    },

    isPlaying: function () {
        if (!this._howl || typeof this._howl.playing !== 'function') return false;
        try {
            return this._soundId === null || this._soundId === undefined
                ? !!this._howl.playing()
                : !!this._howl.playing(this._soundId);
        } catch (e) {
            return false;
        }
    },

    /**
     * Start BGM through RPG Paper Maker's own song manager. This is the same
     * path used by map music and title music and is therefore compatible with
     * protected base64 exports as well as ordinary project playback.
     */
    _startNativePlayback: function (prepared, zone, targetVolume, requestToken) {
        var self = this;
        var howl = prepared.howl;
        var track = MUSIC_TRACKS[zone];
        var kind = _musicKind();

        if (
            typeof Manager === 'undefined' ||
            !Manager.Songs ||
            typeof Manager.Songs.playMusic !== 'function'
        ) {
            // Editor/runtime compatibility fallback. Packaged builds should
            // always take the native branch above.
            return Promise.resolve(this._startPlayback(howl, zone, targetVolume, requestToken));
        }

        return new Promise(function (resolve) {
            var settled = false;
            var timer = null;
            var listeningHowl = howl;
            var detachListeners = function (target) {
                if (!target || typeof target.off !== 'function') return;
                target.off('play', onPlay);
                target.off('playerror', onPlayError);
                target.off('loaderror', onLoadError);
            };
            var attachListeners = function (target) {
                if (!target || typeof target.once !== 'function') return;
                target.once('play', onPlay);
                target.once('playerror', onPlayError);
                target.once('loaderror', onLoadError);
            };
            var finish = function (started, soundId, error) {
                if (settled) return;
                settled = true;
                if (timer !== null) clearTimeout(timer);
                detachListeners(listeningHowl);

                if (requestToken !== self._requestToken || self._requestedZone !== zone) {
                    resolve(false);
                    return;
                }
                if (!started) {
                    self._requestedZone = null;
                    if (!self._warnedAudioLock) {
                        self._warnedAudioLock = true;
                        console.warn(
                            '[MusicManager] Could not start ' + track.name + '. ' +
                            String(error || 'Use a keyboard or mouse input to retry audio playback.')
                        );
                    }
                    resolve(false);
                    return;
                }

                self._warnedAudioLock = false;
                self._howl = howl;
                self._soundId = soundId === undefined ? null : soundId;
                self._currentZone = zone;
                self._requestedZone = null;
                self._syncEngineState(howl, targetVolume);
                try {
                    if (self._soundId === null) howl.volume(targetVolume);
                    else howl.volume(targetVolume, self._soundId);
                } catch (e) { }
                console.log(
                    '[MusicManager] Now playing ' + zone +
                    ' through Manager.Songs.playMusic (song ID ' + track.id +
                    ', ' + track.name + ', volume=' + targetVolume.toFixed(2) + ').'
                );
                resolve(true);
            };
            var onPlay = function (soundId) { finish(true, soundId); };
            var onPlayError = function (soundId, error) { finish(false, soundId, error); };
            var onLoadError = function (soundId, error) { finish(false, soundId, error || 'Audio decode failed.'); };

            attachListeners(listeningHowl);

            try {
                Manager.Songs.playMusic(kind, track.id, targetVolume, 0, null);
            } catch (error) {
                finish(false, null, error && error.message ? error.message : error);
                return;
            }

            // Main.loadGameData() replaces Data.Songs.list shortly after the
            // title screen appears. If that happens between prepare and play,
            // the native manager may correctly start the equivalent Howl from
            // the new registry. Follow the actual native current object so the
            // play confirmation and later volume controls stay accurate.
            var nativeHowl = Manager.Songs.current && Manager.Songs.current[kind];
            if (nativeHowl && nativeHowl !== listeningHowl) {
                detachListeners(listeningHowl);
                listeningHowl = nativeHowl;
                howl = nativeHowl;
                attachListeners(listeningHowl);
            }

            // Howler emits play asynchronously. The immediate check also
            // supports lightweight editor/test shims that omit that event.
            try {
                if (typeof howl.playing === 'function' && howl.playing()) {
                    setTimeout(function () { finish(true, null); }, 0);
                }
            } catch (e) { }

            if (!settled) {
                timer = setTimeout(function () {
                    var playing = false;
                    try { playing = typeof howl.playing === 'function' && howl.playing(); } catch (e) { }
                    finish(playing, null, playing ? null : 'Playback did not begin within 15 seconds.');
                }, 15000);
            }
        });
    },

    _startPlayback: function (howl, zone, targetVolume, requestToken) {
        if (requestToken !== this._requestToken || this._requestedZone !== zone) return false;

        var oldHowl = this._howl || this._engineCurrentHowl();
        var oldSoundId = this._howl ? this._soundId : null;
        if (oldHowl === howl && typeof howl.playing === 'function' && howl.playing()) {
            this._howl = howl;
            this._soundId = null;
            this._currentZone = zone;
            this._requestedZone = null;
            howl.volume(targetVolume);
            this._syncEngineState(howl, targetVolume);
            return true;
        }

        var newSoundId;
        try {
            // Set the group default before play so no audible full-volume frame
            // escapes before the per-instance fade starts.
            howl.volume(0);
            newSoundId = howl.play();
            if (newSoundId === null || newSoundId === undefined) {
                throw new Error('Howler did not return a playback ID.');
            }
            if (typeof howl.loop === 'function') howl.loop(true, newSoundId);
            howl.volume(0, newSoundId);
        } catch (error) {
            this._requestedZone = null;
            console.error('[MusicManager] Could not start ' + zone + ':', error);
            return false;
        }

        if (oldHowl && oldHowl !== howl) {
            this._fadeAndStop(oldHowl, oldSoundId, this._fadeDuration);
        }

        this._howl = howl;
        this._soundId = newSoundId;
        this._currentZone = zone;
        this._requestedZone = null;
        this._syncEngineState(howl, targetVolume);

        try {
            if (this._fadeDuration > 0 && typeof howl.fade === 'function') {
                howl.fade(0, targetVolume, this._fadeDuration, newSoundId);
            } else {
                howl.volume(targetVolume, newSoundId);
            }
        } catch (e) {
            howl.volume(targetVolume, newSoundId);
        }

        console.log(
            '[MusicManager] Now playing ' + zone +
            ' (song ID ' + MUSIC_TRACKS[zone].id + ', ' + MUSIC_TRACKS[zone].name +
            ', volume=' + targetVolume.toFixed(2) + ').'
        );
        return true;
    },

    _stopActive: function (fadeDurationMs, transition) {
        ++this._requestToken;
        this._requestedZone = null;

        var howl = this._howl;
        var soundId = this._soundId;
        var duration = typeof fadeDurationMs === 'number'
            ? Math.max(0, fadeDurationMs)
            : this._fadeDuration;

        this._howl = null;
        this._soundId = null;
        this._currentZone = null;
        this._clearEngineState(howl);
        if (howl) this._fadeAndStop(howl, soundId, duration);

        if (!transition) this._lastRequestedZone = null;
        return !!howl;
    },

    _fadeAndStop: function (howl, soundId, duration) {
        if (!howl) return;
        var stop = function () {
            try {
                if (soundId === null || soundId === undefined) howl.stop();
                else howl.stop(soundId);
            } catch (e) { }
        };
        if (duration <= 0 || typeof howl.fade !== 'function') {
            stop();
            return;
        }

        var from = 0;
        try {
            from = soundId === null || soundId === undefined
                ? howl.volume()
                : howl.volume(undefined, soundId);
            if (typeof from !== 'number' || !isFinite(from)) from = 0;
            howl.fade(from, 0, duration, soundId === null ? undefined : soundId);
        } catch (e) {
            stop();
            return;
        }

        // Use a timeout rather than a shared fade listener. A Howl can be
        // reused for a later zone before an older instance finishes fading;
        // stopping by sound ID prevents that stale cleanup from killing it.
        setTimeout(stop, duration + 40);
    },

    _applyCurrentVolume: function () {
        if (!this._howl || !this._currentZone) return;
        var target = this._targetVolume(this._currentZone);
        try {
            if (this._soundId === null || this._soundId === undefined) this._howl.volume(target);
            else this._howl.volume(target, this._soundId);
        } catch (e) { }
        this._syncEngineState(this._howl, target);
    },

    _targetVolume: function (zone) {
        var track = MUSIC_TRACKS[zone];
        if (!track || this._muted) return 0;
        return Math.max(0, Math.min(1, track.volume * this._masterVolume));
    },

    _engineCurrentHowl: function () {
        var kind = _musicKind();
        if (
            typeof Manager !== 'undefined' &&
            Manager.Songs &&
            Manager.Songs.current
        ) {
            return Manager.Songs.current[kind] || null;
        }
        return null;
    },

    _syncEngineState: function (howl, volume) {
        var kind = _musicKind();
        if (typeof Manager === 'undefined' || !Manager.Songs) return;
        if (Manager.Songs.current) Manager.Songs.current[kind] = howl;
        if (Manager.Songs.volumes) Manager.Songs.volumes[kind] = volume;
        if (Manager.Songs.starts) Manager.Songs.starts[kind] = 0;
        if (Manager.Songs.ends) Manager.Songs.ends[kind] = null;
        Manager.Songs.isMusicNone = false;
        Manager.Songs.isProgressionMusicEnd = true;
    },

    _clearEngineState: function (howl) {
        var kind = _musicKind();
        if (
            howl &&
            typeof Manager !== 'undefined' &&
            Manager.Songs &&
            Manager.Songs.current &&
            Manager.Songs.current[kind] === howl
        ) {
            Manager.Songs.current[kind] = null;
        }
    },

    _resolveDynamicZone: function (zone) {
        var key = String(zone || '');
        if (key === this.ZONE.STAGE_1) return this._resolveStageZoneFromMap() || key;
        if (key === this.ZONE.GAMEPLAY_1) return this._resolveGameplayZoneFromMap() || key;
        return key;
    },

    _resolveStageZoneFromMap: function () {
        var stage = this._stageForMap(this._currentMapId());
        if (!stage) return this.ZONE.STAGE_1;
        if (stage.stage === 1) return this.ZONE.STAGE_1;
        if (stage.stage === 2) return this.ZONE.STAGE_2;
        if (stage.stage === 3) return this.ZONE.STAGE_3;
        if (stage.stage === 4) return this.ZONE.STAGE_4;
        return this.ZONE.STAGE_1;
    },

    _resolveGameplayZoneFromMap: function () {
        var mapId = this._currentMapId();
        if (mapId === 11 || mapId === 12) return this.ZONE.GAMEPLAY_56;
        return this.ZONE.GAMEPLAY_1;
    },

    _currentMapId: function () {
        var scene = typeof Scene !== 'undefined' && Scene.Map ? Scene.Map.current : null;
        var mapId = scene && (
            scene.id ||
            scene.mapID ||
            (scene.currentMap && scene.currentMap.id) ||
            (typeof Core !== 'undefined' && Core.Game && Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || (
            typeof Core !== 'undefined' && Core.Game && Core.Game.current
                ? Number(Core.Game.current.currentMapID)
                : 0
        ) || 0;
    },

    _stageForMap: function (mapId) {
        if (
            !mapId ||
            typeof IP2Live === 'undefined' ||
            !IP2Live.MapManager ||
            typeof IP2Live.MapManager.stageFor !== 'function'
        ) {
            return null;
        }
        return IP2Live.MapManager.stageFor(Number(mapId)) || null;
    },

    /**
     * Inspect the live RPG Paper Maker registry. In a protected packaged build,
     * every custom entry should report embedded-data-url rather than project-file.
     */
    auditRegistry: function (logResult) {
        var shouldLog = logResult !== false;
        var protectedBuild = !!(
            typeof Data !== 'undefined' &&
            Data.Settings &&
            Data.Settings.isProtected
        );
        var rows = [];
        var addRows = function (kind, registry, category) {
            Object.keys(registry).forEach(function (key) {
                var expected = registry[key];
                var song = _registeredSong(kind, expected.id);
                var transport = _sourceTransport(song);
                rows.push({
                    category: category,
                    zone: key,
                    id: expected.id,
                    expected: expected.name,
                    registered: !!song,
                    actual: song ? String(song.name || '') : '',
                    transport: transport,
                    valid: !!song && String(song.name || '') === expected.name &&
                        (!protectedBuild || transport === 'embedded-data-url'),
                });
            });
        };
        addRows(_musicKind(), MUSIC_TRACKS, 'music');
        addRows(_musicEffectKind(), EFFECT_TRACKS, 'effect');
        var valid = rows.every(function (row) { return row.valid; });
        if (shouldLog) {
            var logger = valid ? console.info : console.error;
            logger.call(console,
                '[MusicManager] RPG Paper Maker registry audit ' + (valid ? 'passed' : 'failed') +
                ' (' + rows.filter(function (row) { return row.valid; }).length + '/' + rows.length + ').'
            );
            if (typeof console.table === 'function') console.table(rows);
            else console.log(rows);
        }
        return { valid: valid, protectedBuild: protectedBuild, rows: rows };
    },

    _scheduleRegistryAudit: function () {
        if (this._registryAuditScheduled) return;
        this._registryAuditScheduled = true;
        var self = this;
        var attempts = 0;
        var check = function () {
            attempts++;
            var report = self.auditRegistry(false);
            var allRegistered = report.rows.every(function (row) { return row.registered; });
            if (allRegistered || attempts >= 120) {
                self.auditRegistry(true);
                return;
            }
            setTimeout(check, 250);
        };
        setTimeout(check, 0);
    },
};

var SoundFX = {
    _registry: EFFECT_TRACKS,
    _masterVolume: 1,
    _engineAdapterInstalled: false,

    /**
     * RPG Paper Maker routes normal UI sounds through Manager.Songs.playSound.
     * Scale that one channel instead of using Howler.volume(), whose global
     * gain also changes music and background audio.
     */
    installEngineAdapter: function () {
        if (
            this._engineAdapterInstalled ||
            typeof Manager === 'undefined' ||
            !Manager.Songs ||
            typeof Manager.Songs.playSound !== 'function'
        ) {
            return this._engineAdapterInstalled;
        }

        var current = Manager.Songs.playSound;
        if (current.__ip2LiveScopedSfxAdapter) {
            this._engineAdapterInstalled = true;
            this._normalizeGlobalHowlerVolume();
            return true;
        }

        var original = current;
        var wrapped = function (id, volume) {
            var controller = typeof IP2Live !== 'undefined' ? IP2Live.SoundFX : null;
            var multiplier = controller && typeof controller.getMasterVolume === 'function'
                ? controller.getMasterVolume()
                : 1;
            var baseVolume = Number(volume);
            if (!isFinite(baseVolume)) baseVolume = 1;
            return original.call(this, id, Math.max(0, Math.min(1, baseVolume * multiplier)));
        };
        wrapped.__ip2LiveScopedSfxAdapter = true;
        wrapped.__ip2LiveOriginalPlaySound = original;
        Manager.Songs.playSound = wrapped;
        this._engineAdapterInstalled = true;
        this._normalizeGlobalHowlerVolume();
        return true;
    },

    _normalizeGlobalHowlerVolume: function () {
        // Older settings builds used the global Howler gain for SFX. Restore
        // it once so the per-channel music and effect controls are independent.
        try {
            if (typeof Howler !== 'undefined' && typeof Howler.volume === 'function') {
                Howler.volume(1);
            }
        } catch (e) { }
    },

    setMasterVolume: function (vol) {
        this._masterVolume = Math.max(0, Math.min(1, Number(vol) || 0));
        this.installEngineAdapter();
        this._normalizeGlobalHowlerVolume();
    },

    getMasterVolume: function () {
        return this._masterVolume;
    },

    preload: function () {
        return Promise.all(Object.keys(this._registry).map(function (key) {
            return _loadRegisteredHowl(_musicEffectKind(), EFFECT_TRACKS[key], 'custom effect ' + key);
        }));
    },

    _play: function (key) {
        var self = this;
        var effect = this._registry[key];
        if (!effect) return Promise.resolve(false);
        return _loadRegisteredHowl(_musicEffectKind(), effect, 'custom effect ' + key)
            .then(function (loaded) {
                if (!loaded.ok) {
                    console.error('[SoundFX] ' + loaded.error);
                    return false;
                }
                return MusicManager.unlock().then(function (ready) {
                    if (!ready) return false;
                    var soundId;
                    try {
                        soundId = loaded.howl.play();
                        loaded.howl.volume(effect.volume * self._masterVolume, soundId);
                    } catch (error) {
                        console.error('[SoundFX] Could not play ' + effect.name + ':', error);
                        return false;
                    }

                    if (effect.halfOnly) {
                        var duration = 0;
                        try { duration = Number(loaded.howl.duration(soundId)) || 0; } catch (e) { }
                        if (duration > 0) {
                            setTimeout(function () {
                                try { loaded.howl.stop(soundId); } catch (e) { }
                            }, (duration * 500) + 20);
                        }
                    }
                    return true;
                });
            })
            .catch(function (error) {
                console.error('[SoundFX] Failed to play ' + effect.name + ':', error);
                return false;
            });
    },

    playTyping: function () { return this._play('TYPING'); },
    playGlitch: function () { return this._play('GLITCH'); },
};

IP2Live.MusicManager = MusicManager;
IP2Live.SoundFX = SoundFX;
SoundFX.installEngineAdapter();
MusicManager.installGestureRetry();
window.IP2LiveMusic = MusicManager;
window.IP2LiveSoundFX = SoundFX;

console.log(
    '[IP2Live] music_manager.js loaded (' + MusicManager.VERSION +
    ', RPG Paper Maker Manager.Songs / Data.Songs mode).'
);
