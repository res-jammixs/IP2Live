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
    TUTORIAL:   { id: 10, name: 'Tutorial.mp3',       volume: 0.35 },
    STAGE_1:    { id: 11, name: 'Stage 1 Music.mp3',  volume: 0.92 },
    STAGE_2:    { id: 12, name: 'Stage 2 Music.mp3',  volume: 0.72 },
    STAGE_3:    { id: 13, name: 'Stage 3 Music.mp3',  volume: 0.72 },
    STAGE_4:    { id: 14, name: 'Stage 4 Music.mp3',  volume: 0.72 },
    GAMEPLAY_1: { id: 15, name: 'Gameplay 1.mp3',     volume: 0.58 },
    GAMEPLAY_2: { id: 16, name: 'Gameplay 2.mp3',     volume: 0.58 },
    // Gameplay 4.5 is the host-power reactor; each challenge owns its loop.
    GAMEPLAY_56:{ id: 25, name: 'Gameplay/05-quarantine-breach.wav', volume: 1.00, bundled: '05-quarantine-breach.wav', bundle: 'gameplay' }, // legacy zone alias
    GAMEPLAY_3: { id: 22, name: 'Gameplay/03-bitstream-decoder.wav', volume: 1.00, bundled: '03-bitstream-decoder.wav', bundle: 'gameplay' },
    GAMEPLAY_4: { id: 23, name: 'Gameplay/04-subnet-relay.wav', volume: 1.00, bundled: '04-subnet-relay.wav', bundle: 'gameplay' },
    GAMEPLAY_45:{ id: 24, name: 'Gameplay/04_5-reactor-lattice.wav', volume: 1.00, bundled: '04_5-reactor-lattice.wav', bundle: 'gameplay' },
    GAMEPLAY_5: { id: 25, name: 'Gameplay/05-quarantine-breach.wav', volume: 1.00, bundled: '05-quarantine-breach.wav', bundle: 'gameplay' },
    GAMEPLAY_6: { id: 26, name: 'Gameplay/06-matrix-lockdown.wav', volume: 1.00, bundled: '06-matrix-lockdown.wav', bundle: 'gameplay' },
    GAMEPLAY_7: { id: 27, name: 'Gameplay/07-repair-uplink.wav', volume: 1.00, bundled: '07-repair-uplink.wav', bundle: 'gameplay' },
    GAMEPLAY_8: { id: 28, name: 'Gameplay/08-allocation-protocol.wav', volume: 1.00, bundled: '08-allocation-protocol.wav', bundle: 'gameplay' },
    PVP_MENU:   { id: 9,  name: 'Main Menu.mp3',      volume: 0.70 },
    PVP_RACE:   { id: 17, name: 'Gameplay 5 & 6.mp3', volume: 0.58 },
    STORY_ENDING: { id: 14, name: 'Stage 4 Music.mp3', volume: 0.55 },
    STORY_PROLOGUE: { id: 18, name: 'StoryPrologue/01-arrival-ost.wav', volume: 0.88, bundled: '01-arrival-ost.wav' },
    PROLOGUE_TAKING: { id: 19, name: 'StoryPrologue/02-taking-ost.wav', volume: 0.88, bundled: '02-taking-ost.wav' },
    PROLOGUE_FORTRESS: { id: 20, name: 'StoryPrologue/03-fortress-ost.wav', volume: 0.88, bundled: '03-fortress-ost.wav' },
    PROLOGUE_UPLINK: { id: 21, name: 'StoryPrologue/04-our-way-inside-ost.wav', volume: 0.88, bundled: '04-our-way-inside-ost.wav' },
};

// Designer settings: times are seconds; volume multiplies the player's master slider.
// Override any of these defaults on a MUSIC_TRACKS entry or in MUSIC_FLOORS.
var MUSIC_DEFAULTS = { startAt: 0, loop: true, loopStart: 0, loopEnd: null };
// Pause is a mix state: keep the track and loop running, with a modest volume reduction.
var MUSIC_STATES = { NORMAL: { volume: 1 }, PAUSED: { volume: 0.7 } };
// Keys are map IDs, not stage numbers. Example: 4: { volume: 0.5, loopStart: 12 }.
var MUSIC_FLOORS = {};
var MUSIC_GAMEPLAYS = {
    ip_class_wires: 'GAMEPLAY_1', ip_patch_panel_classes: 'GAMEPLAY_2',
    ip_cidr_binary_panel: 'GAMEPLAY_3', ip_subnet_simulator: 'GAMEPLAY_4',
    ip_host_power_reactor: 'GAMEPLAY_45', ip_cidr_quarantine: 'GAMEPLAY_5',
    ip_cidr_quarantine_matrix: 'GAMEPLAY_6', ip_network_repair: 'GAMEPLAY_7',
    ip_vlsm_allocator: 'GAMEPLAY_8',
};

var AUDIO_SETTINGS_STORAGE_KEY = 'IP2Live.audio-settings.v1';

function _clampVolume(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    var parsed = Number(value);
    if (!isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(1, parsed));
}

function _readSavedAudioSettings() {
    try {
        if (typeof localStorage === 'undefined') return null;
        var raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
        if (!raw) return null;
        var saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return null;
        return {
            musicVolume: _clampVolume(saved.musicVolume, null),
            sfxVolume: _clampVolume(saved.sfxVolume, null),
        };
    } catch (error) {
        return null;
    }
}

var SAVED_AUDIO_SETTINGS = _readSavedAudioSettings();

var EFFECT_TRACKS = {
    TYPING: { id: 2, name: 'Typing.mp3',   volume: 0.35, halfOnly: true },
    GLITCH: { id: 3, name: 'Glitch01.mp3', volume: 0.10, halfOnly: false },
    PROLOGUE_ARRIVAL: { id: 4, name: 'StoryPrologue/01-arrival-sfx.wav', volume: 0.36, loop: false, ambient: true, bundled: '01-arrival-sfx.wav' },
    PROLOGUE_TAKING: { id: 5, name: 'StoryPrologue/02-taking-sfx.wav', volume: 0.38, loop: true, ambient: true, bundled: '02-taking-sfx.wav' },
    PROLOGUE_FORTRESS: { id: 6, name: 'StoryPrologue/03-fortress-sfx.wav', volume: 0.32, loop: true, ambient: true, bundled: '03-fortress-sfx.wav' },
    PROLOGUE_UPLINK: { id: 7, name: 'StoryPrologue/04-our-way-inside-sfx.wav', volume: 0.30, loop: true, ambient: true, bundled: '04-our-way-inside-sfx.wav' },
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

/** Recover plugin-owned audio assets if the editor overwrites externally
 * added registrations from its cached songs database. Prefer embedded songs;
 * the portable plugin copies also exist when a protected export omits Songs.
 */
function _resolveManagedSong(kind, entry) {
    var song = _registeredSong(kind, entry.id);
    if (song && String(song.name || '') === entry.name) return song;
    var bundleDirectory = entry.bundle === 'gameplay' ? 'gameplay' : 'story-prologue';
    var songDirectory = entry.bundle === 'gameplay' ? 'Gameplay' : 'StoryPrologue';
    if (!entry.bundled || entry.name !== songDirectory + '/' + entry.bundled) return song;
    var list = _kindList(kind);
    if (!list || typeof list.set !== 'function' || typeof list.forEach !== 'function') return song;
    var existing = null;
    list.forEach(function (candidate) {
        if (candidate && candidate.name === entry.name && candidate.id > 0) existing = candidate;
    });
    if (existing) { entry.id = existing.id; return existing; }
    if (typeof Model === 'undefined' || typeof Model.Song !== 'function' ||
        typeof Common === 'undefined' || !Common.Platform || typeof Common.Platform.ROOT_DIRECTORY !== 'string') return song;
    var id = entry.id;
    // An editor-authored song may now own the old ID. Never replace it.
    while (list.has(id)) id++;
    try {
        var root = Common.Platform.ROOT_DIRECTORY.replace(/\\/g, '/');
        if (root && root.slice(-1) !== '/') root += '/';
        var recovered = new Model.Song({ id: id, name: entry.name, br: false });
        recovered.kind = kind;
        recovered._ip2liveBundledSource = root + 'Plugins/IP2Live_Core/assets/audio/' + bundleDirectory + '/' + entry.bundled;
        recovered.getPath = function () { return this._ip2liveBundledSource; };
        list.set(id, recovered); entry.id = id;
        return recovered;
    } catch (error) { return song; }
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
    if (song && song._ip2liveBundledSource === value) return 'bundled-plugin-asset';
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
    var song = _resolveManagedSong(kind, entry);
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

function _loadRegisteredHowl(kind, entry, label, cancellation) {
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
            if (cancellation) cancellation.cancel = null;
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
        if (cancellation) cancellation.cancel = function () { finish({ ok: false, cancelled: true }); };

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
    VERSION: 'managed-bgm-20261014-07',
    _howl: null,
    _soundId: null,
    _currentZone: null,
    _requestedZone: null,
    _lastRequestedZone: null,
    _requestToken: 0,
    _registryFailures: new Map(),
    _masterVolume: SAVED_AUDIO_SETTINGS && SAVED_AUDIO_SETTINGS.musicVolume !== null
        ? SAVED_AUDIO_SETTINGS.musicVolume
        : 0.55,
    _muted: false,
    _fadeDuration: 1200,
    _registryAuditScheduled: false,
    _warnedAudioLock: false,
    _gestureRetryInstalled: false,
    _lastGestureRetryAt: 0,
    _pendingPlay: null,
    _cancelPending: null,
    _loopCleanup: null,
    _fadeTimers: new Map(),
    _suspendedForTransition: false,
    _completedZone: null,
    _pauseOwners: new Set(),

    STATE: { NORMAL: 'NORMAL', PAUSED: 'PAUSED' },

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
        GAMEPLAY_3: 'GAMEPLAY_3', GAMEPLAY_4: 'GAMEPLAY_4', GAMEPLAY_45: 'GAMEPLAY_45',
        GAMEPLAY_5: 'GAMEPLAY_5', GAMEPLAY_6: 'GAMEPLAY_6',
        GAMEPLAY_7: 'GAMEPLAY_7', GAMEPLAY_8: 'GAMEPLAY_8',
        PVP_MENU: 'PVP_MENU', PVP_RACE: 'PVP_RACE',
        STORY_ENDING: 'STORY_ENDING',
        STORY_PROLOGUE: 'STORY_PROLOGUE',
        PROLOGUE_TAKING: 'PROLOGUE_TAKING', PROLOGUE_FORTRESS: 'PROLOGUE_FORTRESS', PROLOGUE_UPLINK: 'PROLOGUE_UPLINK',
    },

    /**
     * Play a logical music zone. Returns a promise resolving to true only when
     * the requested Howl actually starts. Callers that do not need the result
     * can continue calling this method without awaiting it.
     */
    play: function (zone) {
        zone = this._resolveDynamicZone(zone);
        var track = this._trackFor(zone);
        if (!track) {
            console.warn('[MusicManager] Unknown zone: ' + zone);
            return Promise.resolve(false);
        }

        this._lastRequestedZone = zone;
        this._suspendedForTransition = false;
        this._scheduleRegistryAudit();

        if (this._isRegistryBlocked(zone, track)) return Promise.resolve(false);

        if (this._requestedZone === zone && this._pendingPlay) return this._pendingPlay;
        var requestToken = ++this._requestToken;
        if (this._cancelPending) this._cancelPending();
        if (this._currentZone === zone && this.isPlaying()) {
            this._applyCurrentVolume();
            return Promise.resolve(true);
        }

        var self = this;
        this._requestedZone = zone;
        var prepared = _prepareRegisteredHowl(_musicKind(), track, 'music zone ' + zone);
        if (!prepared.ok) {
            this._requestedZone = null;
            var failedSong = _registeredSong(_musicKind(), track.id);
            this._registryFailures.set(zone, { list: _kindList(_musicKind()), id: track.id, name: track.name,
                song: failedSong, actualName: failedSong && failedSong.name });
            console.warn('[MusicManager] ' + prepared.error +
                ' Playback will retry when the registry changes. Check the project songs database or rebuild an export missing these assets.');
            return Promise.resolve(false);
        }
        try { this._validateTrack(track, prepared.howl); }
        catch (error) {
            this._requestedZone = null;
            console.error('[MusicManager] Invalid timing for ' + zone + ': ' + error.message);
            return Promise.resolve(false);
        }
        // Retire both our previous BGM and any title/map BGM owned by the engine.
        // This also cancels queued playback, so a late menu load cannot overlap a floor.
        this._retirePlayback();

        // Resume first when possible, but always let RPG Paper Maker perform
        // the actual play. Its native Howler path safely queues playback while
        // decoding and reports playerror when a user gesture is required.
        this._pendingPlay = this.unlock()
            .then(function () {
                if (requestToken !== self._requestToken || self._requestedZone !== zone) return false;
                return self._startNativePlayback(prepared, zone, self._targetVolume(zone), requestToken);
            })
            .catch(function (error) {
                if (requestToken === self._requestToken) self._requestedZone = null;
                console.error('[MusicManager] Failed to play zone ' + zone + ':', error);
                return false;
            });
        return this._pendingPlay;
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
        if (this._suspendedForTransition || this._completedZone === this._currentZone && this._completedZone) return Promise.resolve(false);
        var zone = this._lastRequestedZone;
        if (!zone) return Promise.resolve(false);
        if (this._isRegistryBlocked(zone)) return Promise.resolve(false);
        var self = this;
        return this.unlock().then(function () { return self.play(zone); });
    },

    /** Retry the active logical zone from the next genuine input gesture. */
    installGestureRetry: function () {
        if (this._gestureRetryInstalled || typeof document === 'undefined') return false;
        this._gestureRetryInstalled = true;
        var self = this;
        var retryFromGesture = function () {
            if (self._suspendedForTransition || !self._lastRequestedZone || (self._currentZone === self._lastRequestedZone && self.isPlaying())) return;
            if (self._isRegistryBlocked(self._lastRequestedZone)) return;
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

    // Each pause scene owns its request until it closes. Nested settings and
    // overlapping overlays cannot accidentally restore another pause's volume.
    setPaused: function (paused, owner) {
        owner = owner || this;
        if (paused) this._pauseOwners.add(owner);
        else this._pauseOwners.delete(owner);
        this._applyCurrentVolume();
    },

    getState: function () {
        return this._pauseOwners.size ? this.STATE.PAUSED : this.STATE.NORMAL;
    },

    setPauseVolume: function (volume) {
        MUSIC_STATES.PAUSED.volume = _clampVolume(volume, MUSIC_STATES.PAUSED.volume);
        this._applyCurrentVolume();
    },

    setTrackVolume: function (zone, vol) {
        return this.configureZone(zone, { volume: vol });
    },

    getZoneConfig: function (zone) {
        var track = this._trackFor(zone);
        return track ? Object.assign({}, track) : null;
    },

    getConfiguration: function () {
        return JSON.parse(JSON.stringify({ defaults: MUSIC_DEFAULTS, states: MUSIC_STATES, zones: MUSIC_TRACKS, floors: MUSIC_FLOORS, gameplays: MUSIC_GAMEPLAYS }));
    },

    configureZone: function (zone, settings) {
        if (/^FLOOR_\d+$/.test(zone)) return this.configureFloor(Number(zone.slice(6)), settings);
        if (!MUSIC_TRACKS[zone]) throw new Error('Unknown music zone: ' + zone);
        var next = Object.assign({}, MUSIC_DEFAULTS, MUSIC_TRACKS[zone], settings);
        var song = _registeredSong(_musicKind(), next.id);
        this._validateTrack(next, song && song.howl);
        MUSIC_TRACKS[zone] = next;
        this._refreshConfiguration(zone, settings);
        return true;
    },

    configureFloor: function (mapId, settings) {
        mapId = Number(mapId);
        var base = this._baseZoneForMap(mapId);
        if (!Number.isInteger(mapId) || mapId <= 0 || !base) throw new Error('Unknown music floor: ' + mapId);
        var next = Object.assign({}, MUSIC_FLOORS[mapId], settings);
        var effective = Object.assign({}, MUSIC_DEFAULTS, MUSIC_TRACKS[base], next);
        var song = _registeredSong(_musicKind(), effective.id);
        this._validateTrack(effective, song && song.howl);
        MUSIC_FLOORS[mapId] = next;
        this._refreshConfiguration('FLOOR_' + mapId, settings);
        return true;
    },

    _refreshConfiguration: function (zone, settings) {
        var current = this._currentZone || this._requestedZone;
        var inherited = current && /^FLOOR_\d+$/.test(current) && this._baseZoneForMap(Number(current.slice(6))) === zone;
        if (current !== zone && !inherited) return;
        if (Object.keys(settings || {}).some(function (key) { return key !== 'volume'; })) {
            this.stop(0);
            this.play(current);
        } else this._applyCurrentVolume();
    },

    _validateTrack: function (track, howl) {
        if (!Number.isInteger(track.id) || track.id <= 0 || typeof track.name !== 'string' || !track.name) throw new Error('A registered song ID and name are required.');
        if (typeof track.volume !== 'number' || !isFinite(track.volume) || track.volume < 0 || track.volume > 1) throw new Error('Volume must be between 0 and 1.');
        if (typeof track.loop !== 'boolean') throw new Error('Loop must be true or false.');
        for (var key of ['startAt', 'loopStart']) {
            if (typeof track[key] !== 'number' || !isFinite(track[key]) || track[key] < 0) throw new Error(key + ' must be a non-negative number of seconds.');
        }
        if (track.loopEnd !== null && (typeof track.loopEnd !== 'number' || !isFinite(track.loopEnd) || track.loopEnd <= track.loopStart || track.loopEnd <= track.startAt)) {
            throw new Error('loopEnd must be after startAt and loopStart, or null for the full track.');
        }
        var duration = howl && typeof howl.duration === 'function' ? howl.duration() : 0;
        if (duration > 0 && (track.startAt >= duration || track.loopStart >= duration || (track.loopEnd !== null && track.loopEnd > duration))) {
            throw new Error('Music timing exceeds the audio duration (' + duration + ' seconds).');
        }
    },

    _baseZoneForMap: function (mapId) {
        var stage = this._stageForMap(mapId);
        if (Number(mapId) === 1 || (stage && stage.tutorial)) return this.ZONE.TUTORIAL;
        return stage && MUSIC_TRACKS['STAGE_' + stage.stage] ? 'STAGE_' + stage.stage : null;
    },

    zoneForMap: function (mapId) {
        mapId = Number(mapId) || this._currentMapId();
        var base = this._baseZoneForMap(mapId);
        return base && MUSIC_FLOORS[mapId] ? 'FLOOR_' + mapId : base;
    },

    playMap: function (mapId) {
        var zone = this.zoneForMap(mapId);
        return zone ? this.play(zone) : Promise.resolve(false);
    },

    playGameplay: function (gameplayId) {
        var zone = MUSIC_GAMEPLAYS[gameplayId];
        if (!zone) { console.warn('[MusicManager] Unknown gameplay: ' + gameplayId); return Promise.resolve(false); }
        return this.play(zone);
    },

    restoreContext: function () {
        if (IP2Live.PVPMode && IP2Live.PVPMode.active) return this.play(this.ZONE.PVP_RACE);
        if (IP2Live.PracticeMode && IP2Live.PracticeMode.active) return this.play(this.ZONE.MAIN_MENU);
        return this.playMap();
    },

    isZoneActive: function (zone) {
        var nativeHowl = this._engineCurrentHowl();
        return this._requestedZone === zone || (this._currentZone === zone &&
            (!nativeHowl || nativeHowl === this._howl) && (this.isPlaying() || this._completedZone === zone));
    },

    _isRegistryBlocked: function (zone, track) {
        var failure = this._registryFailures.get(zone);
        if (!failure) return false;
        track = track || this._trackFor(zone);
        var song = track && _registeredSong(_musicKind(), track.id);
        if (track && failure.list === _kindList(_musicKind()) && failure.id === track.id &&
            failure.name === track.name && failure.song === song && failure.actualName === (song && song.name)) return true;
        this._registryFailures.delete(zone);
        return false;
    },

    _trackFor: function (zone) {
        var track = MUSIC_TRACKS[zone];
        if (!track && /^FLOOR_\d+$/.test(zone)) {
            var mapId = Number(zone.slice(6)), base = this._baseZoneForMap(mapId);
            if (base) track = Object.assign({}, MUSIC_TRACKS[base], MUSIC_FLOORS[mapId]);
        }
        if (!track) return null;
        track = Object.assign({}, MUSIC_DEFAULTS, track);
        if (track.bundled) _resolveManagedSong(_musicKind(), track);
        return track;
    },

    _retirePlayback: function () {
        if (this._loopCleanup) this._loopCleanup();
        var howls = new Set([this._howl, this._engineCurrentHowl()]);
        this._fadeTimers.forEach(function (timer, howl) { howls.add(howl); });
        var registry = _kindList(_musicKind());
        if (registry && typeof registry.forEach === 'function') registry.forEach(function (song) { if (song.howl) howls.add(song.howl); });
        var self = this;
        howls.forEach(function (howl) {
            if (!howl) return;
            self._cancelFade(howl);
            try { howl.stop(); } catch (e) { }
            self._clearEngineState(howl);
        });
        this._howl = null; this._soundId = null; this._currentZone = null; this._completedZone = null;
    },

    _cancelFade: function (howl) {
        if (this._fadeTimers.has(howl)) clearTimeout(this._fadeTimers.get(howl));
        this._fadeTimers.delete(howl);
    },

    // Full-track loops stay in Howler. Custom boundaries use one cancellable
    // timer, rechecked against the actual seek position (including pauses).
    _installLoop: function (howl, zone, soundId) {
        if (this._loopCleanup) this._loopCleanup();
        var self = this, track = this._trackFor(zone), timer = null;
        this._validateTrack(track, howl);
        var active = function () { return self._howl === howl && self._currentZone === zone && self._soundId === soundId; };
        var position = function () { return Number(howl.seek(undefined, soundId === null ? undefined : soundId)) || 0; };
        var completed = function () {
            if (!active()) return;
            self._completedZone = zone;
            self._lastRequestedZone = null;
            self._clearEngineState(howl);
            cleanup();
        };
        var schedule = function () {
            if (timer !== null) clearTimeout(timer);
            if (!active() || track.loopEnd === null) return;
            var remaining = Math.max(0, track.loopEnd - position());
            timer = setTimeout(check, Math.max(10, remaining * 1000));
            if (timer && timer.unref) timer.unref();
        };
        var check = function () {
            if (!active()) return;
            if (!self.isPlaying()) {
                timer = setTimeout(check, 250);
                if (timer && timer.unref) timer.unref();
                return;
            }
            if (position() >= track.loopEnd - 0.01) {
                if (!track.loop) { howl.stop(soundId === null ? undefined : soundId); completed(); return; }
                howl.seek(track.loopStart, soundId === null ? undefined : soundId);
            }
            schedule();
        };
        var onEnd = function (id) {
            if (!active() || (soundId !== null && id !== soundId)) return;
            if (!track.loop) { completed(); return; }
            if (track.loopStart > 0) howl.seek(track.loopStart, soundId === null ? undefined : soundId);
            schedule();
        };
        var cleanup = function () {
            if (timer !== null) clearTimeout(timer);
            if (typeof howl.off === 'function') {
                howl.off('end', onEnd); howl.off('seek', schedule); howl.off('play', schedule);
            }
            if (self._loopCleanup === cleanup) self._loopCleanup = null;
        };
        this._loopCleanup = cleanup;
        if (typeof howl.loop === 'function') howl.loop(track.loop, soundId === null ? undefined : soundId);
        if (typeof howl.on === 'function') {
            howl.on('end', onEnd); howl.on('seek', schedule); howl.on('play', schedule);
        }
        schedule();
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
        var nativeHowl = this._engineCurrentHowl();
        if (nativeHowl && nativeHowl !== this._howl) return false;
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
        var track = this._trackFor(zone);
        var kind = _musicKind();

        var nativePlayback = typeof Manager !== 'undefined' && Manager.Songs && typeof Manager.Songs.playMusic === 'function';

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
                if (self._cancelPending === cancel) self._cancelPending = null;

                if (requestToken !== self._requestToken || self._requestedZone !== zone) {
                    resolve(false);
                    return;
                }
                if (!started) {
                    self._requestedZone = null;
                    self._pendingPlay = null;
                    try { listeningHowl.stop(); } catch (e) { }
                    self._clearEngineState(listeningHowl);
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
                self._pendingPlay = null;
                targetVolume = self._targetVolume(zone);
                try { self._installLoop(howl, zone, self._soundId); }
                catch (timingError) {
                    self._retirePlayback();
                    console.error('[MusicManager] ' + timingError.message);
                    resolve(false); return;
                }
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
            var cancel = function () {
                try { listeningHowl.stop(); } catch (e) { }
                finish(false, null, 'Playback superseded.');
            };
            self._cancelPending = cancel;
            self._cancelFade(howl);

            attachListeners(listeningHowl);

            try {
                // Keep the registered Howl at the requested channel level
                // before the engine starts it. This prevents a full-volume
                // frame when a persisted setting has music muted.
                if (typeof howl.volume === 'function') howl.volume(targetVolume);
                if (nativePlayback) Manager.Songs.playMusic(kind, track.id, targetVolume, track.startAt, null);
                else { howl.seek(track.startAt); howl.play(); }
            } catch (error) {
                finish(false, null, error && error.message ? error.message : error);
                return;
            }

            // Main.loadGameData() replaces Data.Songs.list shortly after the
            // title screen appears. If that happens between prepare and play,
            // the native manager may correctly start the equivalent Howl from
            // the new registry. Follow the actual native current object so the
            // play confirmation and later volume controls stay accurate.
            var nativeHowl = nativePlayback && Manager.Songs.current && Manager.Songs.current[kind];
            if (nativeHowl && nativeHowl !== listeningHowl) {
                detachListeners(listeningHowl);
                listeningHowl = nativeHowl;
                howl = nativeHowl;
                attachListeners(listeningHowl);
            }
            try {
                if (typeof howl.volume === 'function') howl.volume(targetVolume);
            } catch (e) { }

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

    _stopActive: function (fadeDurationMs, transition) {
        ++this._requestToken;
        if (this._cancelPending) this._cancelPending();
        if (this._loopCleanup) this._loopCleanup();
        this._requestedZone = null;
        this._pendingPlay = null;
        this._completedZone = null;
        this._suspendedForTransition = !!transition;

        var howl = this._howl || this._engineCurrentHowl();
        var nativeHowl = this._engineCurrentHowl();
        if (nativeHowl && nativeHowl !== howl) {
            try { nativeHowl.stop(); } catch (e) { }
            this._clearEngineState(nativeHowl);
        }
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
        this._cancelFade(howl);
        var self = this;
        var stop = function () {
            self._fadeTimers.delete(howl);
            if (self._howl === howl) return;
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
        var timer = setTimeout(stop, duration + 40);
        this._fadeTimers.set(howl, timer);
        if (timer && timer.unref) timer.unref();
    },

    _applyCurrentVolume: function () {
        if (!this._howl || !this._currentZone) return;
        var target = this._targetVolume(this._currentZone);
        try {
            if (this._soundId === null || this._soundId === undefined) this._howl.volume(target);
            else this._howl.volume(target, this._soundId);
        } catch (e) { }
        if (this._completedZone !== this._currentZone) this._syncEngineState(this._howl, target);
    },

    _targetVolume: function (zone) {
        var track = this._trackFor(zone);
        if (!track || this._muted) return 0;
        return Math.max(0, Math.min(1, track.volume * this._masterVolume * MUSIC_STATES[this.getState()].volume));
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
        var track = this._trackFor(this._currentZone);
        if (Manager.Songs.starts) Manager.Songs.starts[kind] = track ? track.startAt : 0;
        // The manager owns custom boundaries; the engine must not also rewind.
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
        return String(zone || '');
    },

    _resolveStageZoneFromMap: function () {
        return this.zoneForMap(this._currentMapId()) || this.ZONE.STAGE_1;
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
     * custom entries are embedded-data-url or explicitly bundled plugin assets.
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
                var song = _resolveManagedSong(kind, expected);
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
                        (!protectedBuild || transport === 'embedded-data-url' || transport === 'bundled-plugin-asset'),
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
    _layers: new Set(),
    _masterVolume: SAVED_AUDIO_SETTINGS && SAVED_AUDIO_SETTINGS.sfxVolume !== null
        ? SAVED_AUDIO_SETTINGS.sfxVolume
        : 1,
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
        this._layers.forEach(function (layer) { layer.applyVolume(); });
    },

    getMasterVolume: function () {
        return this._masterVolume;
    },

    preload: function () {
        // Long cinematic beds load on demand, never during ordinary UI warmup.
        return Promise.all(Object.keys(this._registry).filter(function (key) { return !EFFECT_TRACKS[key].ambient; }).map(function (key) {
            return _loadRegisteredHowl(_musicEffectKind(), EFFECT_TRACKS[key], 'custom effect ' + key);
        }));
    },

    /** A scene owns this layer until stop(). sync() uses its foreground clock.
     * No timers/listeners survive the scene, and late decoding cannot restart it.
     * Music effects use their own Howl IDs, independent of the native BGM slot.
     */
    createLayer: function (key) {
        var self = this, effect = this._registry[key];
        if (!effect) return null;
        var layer = {
            howl: null, soundId: null, stopped: false, unlocked: false, active: false, seconds: 0, gain: 0, loadTicket: {},
            onUnlock: function () {
                if (layer.stopped) return;
                layer.howl.off('unlock', layer.onUnlock); layer.howl.off('resume', layer.onUnlock);
                layer.unlocked = true; layer.sync(layer.seconds, layer.active, layer.gain);
            },
            applyVolume: function () {
                if (this.howl && this.soundId !== null) this.howl.volume(effect.volume * self._masterVolume * this.gain, this.soundId);
            },
            sync: function (seconds, active, gain) {
                this.seconds = Math.max(0, Number(seconds) || 0); this.active = !!active;
                this.gain = _clampVolume(gain, 1);
                if (this.stopped || !this.howl || !this.unlocked) return;
                var duration = this.howl.duration(), playing = this.soundId !== null && this.howl.playing(this.soundId);
                if (!(duration > 0)) return;
                // A delayed decode past the end of a one-shot must remain silent.
                if (!this.active || (!effect.loop && this.seconds >= duration)) {
                    if (playing) this.howl.pause(this.soundId);
                    return;
                }
                var position = effect.loop ? this.seconds % duration : this.seconds;
                if (!playing) {
                    this.soundId = this.soundId === null ? this.howl.play() : this.howl.play(this.soundId);
                    this.applyVolume();
                    this.howl.loop(!!effect.loop, this.soundId);
                    this.howl.seek(position, this.soundId);
                }
                // Let Web Audio run smoothly between pauses rather than seeking per frame.
                this.applyVolume();
            },
            stop: function () {
                if (this.stopped) return;
                this.stopped = true; self._layers.delete(this);
                if (this.loadTicket.cancel) this.loadTicket.cancel();
                if (this.howl) { this.howl.off('unlock', this.onUnlock); this.howl.off('resume', this.onUnlock); }
                if (this.howl && this.soundId !== null) this.howl.stop(this.soundId);
                this.howl = null; this.soundId = null;
            },
        };
        self._layers.add(layer);
        layer.ready = _loadRegisteredHowl(_musicEffectKind(), effect, 'ambient effect ' + key, layer.loadTicket).then(function (loaded) {
            if (layer.stopped) return false;
            if (!loaded.ok) { console.warn('[SoundFX] ' + loaded.error); layer.stop(); return false; }
            return MusicManager.unlock().then(function (ready) {
                if (layer.stopped) return false;
                layer.howl = loaded.howl; layer.unlocked = ready;
                if (ready) layer.sync(layer.seconds, layer.active, layer.gain);
                else { layer.howl.once('unlock', layer.onUnlock); layer.howl.once('resume', layer.onUnlock); }
                return ready;
            });
        }).catch(function (error) {
            layer.stop(); console.warn('[SoundFX] Ambient layer:', error); return false;
        });
        return layer;
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
IP2Live.musicVolume = MusicManager.getVolume();
IP2Live.sfxVolume = SoundFX.getMasterVolume();
SoundFX.installEngineAdapter();
MusicManager.installGestureRetry();
window.IP2LiveMusic = MusicManager;
window.IP2LiveSoundFX = SoundFX;

console.log(
    '[IP2Live] music_manager.js loaded (' + MusicManager.VERSION +
    ', RPG Paper Maker Manager.Songs / Data.Songs mode).'
);
