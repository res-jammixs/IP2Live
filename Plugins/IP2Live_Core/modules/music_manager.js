/**
 * ================================================================
 *  IP2Live — Music Manager  (music_manager.js)
 * ================================================================
 *  Uses Web Audio API (AudioContext + BufferSource) instead of
 *  HTMLAudioElement. This works around Electron's CSP restriction
 *  that blocks new Audio() / <audio> for local file:// media while
 *  still allowing fetch() for binary data.
 *
 *  Architecture:
 *    fetch(url) → ArrayBuffer → AudioContext.decodeAudioData()
 *    → AudioBufferSourceNode (looping) → GainNode → destination
 *
 *  Zones defined:
 *    MAIN_MENU  — used by: Main Menu, Load Game, Settings, Credits
 *    TUTORIAL   — used by: Tutorial intro + tutorial steps
 *
 *  NOTE: No import/export — loaded via new Function() same as code.js.
 * ================================================================
 */

// ── TRACK REGISTRY ──────────────────────────────────────────────
// Edit volume (0.0–1.0) per track here.
var MUSIC_TRACKS = {
    MAIN_MENU: { src: 'Songs/Musics/Main Menu.mp3', volume: 0.95 },
    TUTORIAL: { src: 'Songs/Musics/Tutorial.mp3', volume: 0.65 },
    STAGE_1: { src: 'Songs/Musics/Stage 1 Music.mp3', volume: 0.72 },
    GAMEPLAY_1: { src: 'Songs/Musics/Gameplay 1.mp3', volume: 0.58 },
};

// ── SHARED AudioContext ──────────────────────────────────────────
// One context for the whole session — creating multiple is wasteful.
var _audioCtx = null;
function _getAudioCtx() {
    if (!_audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { console.error('[MusicManager] Web Audio API not available.'); return null; }
        _audioCtx = new AC();
    }
    // Resume if suspended (browser autoplay policy)
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
}

// ── MANAGER OBJECT ──────────────────────────────────────────────
var MusicManager = {

    // ── State ────────────────────────────────────────────────────
    _source: null,    // active AudioBufferSourceNode
    _gainNode: null,    // active GainNode for the current track
    _currentZone: null,
    _masterVolume: 0.55,
    _muted: false,
    _fadeDuration: 1200,    // crossfade ms
    _fadeTimer: null,
    _bufferCache: {},      // zone → decoded AudioBuffer (cached after first load)

    // ── Zone Constants ───────────────────────────────────────────
    ZONE: {
        MAIN_MENU: 'MAIN_MENU',
        TUTORIAL: 'TUTORIAL',
        STAGE_1: 'STAGE_1',
        GAMEPLAY_1: 'GAMEPLAY_1',
    },

    // ────────────────────────────────────────────────────────────
    //  play(zone)
    // ────────────────────────────────────────────────────────────
    play: function (zone) {
        if (!MUSIC_TRACKS[zone]) {
            console.warn('[MusicManager] Unknown zone: ' + zone);
            return;
        }
        if (this._currentZone === zone && this._source) return;

        var self = this;
        var track = MUSIC_TRACKS[zone];
        var targetVol = this._muted ? 0 : Math.min(track.volume, 1) * this._masterVolume;

        // If buffer already cached, play immediately
        if (this._bufferCache[zone]) {
            self._startPlayback(this._bufferCache[zone], zone, targetVol);
            return;
        }

        // Otherwise fetch → decode → cache → play
        var root = (typeof Common !== 'undefined' && Common.Platform)
            ? Common.Platform.ROOT_DIRECTORY : '';
        var fetchUrl = root + track.src;

        fetch(fetchUrl)
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status + ' — ' + fetchUrl);
                return resp.arrayBuffer();
            })
            .then(function (arrayBuffer) {
                var ctx = _getAudioCtx();
                if (!ctx) throw new Error('No AudioContext');
                return new Promise(function (resolve, reject) {
                    ctx.decodeAudioData(arrayBuffer, resolve, reject);
                });
            })
            .then(function (audioBuffer) {
                self._bufferCache[zone] = audioBuffer;
                self._startPlayback(audioBuffer, zone, targetVol);
            })
            .catch(function (err) {
                console.error('[MusicManager] Failed to load zone: ' + zone, err);
            });
    },

    // ────────────────────────────────────────────────────────────
    //  stop(fadeDuration?)
    // ────────────────────────────────────────────────────────────
    stop: function (fadeDurationMs) {
        if (!this._gainNode) return;
        if (this._fadeTimer) {
            clearInterval(this._fadeTimer);
            this._fadeTimer = null;
        }
        var dur = (fadeDurationMs !== undefined) ? fadeDurationMs : this._fadeDuration;
        var fadingGain = this._gainNode;
        var fadingSource = this._source;
        var self = this;
        this._fadeGain(fadingGain, fadingGain.gain.value, 0, dur, function () {
            self._stopSource(fadingSource, fadingGain);
        });
    },

    fadeOutForTransition: function (fadeDurationMs) {
        if (!this._gainNode) return;
        if (this._fadeTimer) {
            clearInterval(this._fadeTimer);
            this._fadeTimer = null;
        }

        var dur = (fadeDurationMs !== undefined) ? fadeDurationMs : 2200;
        var fadingGain = this._gainNode;
        var fadingSource = this._source;
        this._source = null;
        this._gainNode = null;
        this._currentZone = null;

        var self = this;
        this._fadeGain(fadingGain, fadingGain.gain.value, 0, dur, function () {
            self._stopSource(fadingSource, fadingGain);
        });
    },

    // ────────────────────────────────────────────────────────────
    //  setVolume(vol)  —  global master (0.0–1.0)
    // ────────────────────────────────────────────────────────────
    setVolume: function (vol) {
        this._masterVolume = Math.max(0, Math.min(1, vol));
        if (this._gainNode && !this._muted && this._currentZone) {
            var tv = Math.min(MUSIC_TRACKS[this._currentZone].volume, 1) * this._masterVolume;
            this._gainNode.gain.setTargetAtTime(tv, _getAudioCtx().currentTime, 0.1);
        }
    },

    getVolume: function () {
        return this._masterVolume;
    },

    // ────────────────────────────────────────────────────────────
    //  setTrackVolume(zone, vol)  —  per-track volume
    // ────────────────────────────────────────────────────────────
    setTrackVolume: function (zone, vol) {
        if (!MUSIC_TRACKS[zone]) { console.warn('[MusicManager] Unknown zone: ' + zone); return; }
        MUSIC_TRACKS[zone].volume = Math.max(0, Math.min(1, vol));
        if (this._currentZone === zone && this._gainNode && !this._muted) {
            var tv = MUSIC_TRACKS[zone].volume * this._masterVolume;
            this._gainNode.gain.setTargetAtTime(tv, _getAudioCtx().currentTime, 0.1);
        }
        console.log('[MusicManager] Track volume for ' + zone + ' → ' + MUSIC_TRACKS[zone].volume);
    },

    // ────────────────────────────────────────────────────────────
    //  mute / unmute / toggleMute
    // ────────────────────────────────────────────────────────────
    mute: function () {
        this._muted = true;
        if (this._gainNode) this._gainNode.gain.setTargetAtTime(0, _getAudioCtx().currentTime, 0.05);
    },
    unmute: function () {
        this._muted = false;
        if (this._gainNode && this._currentZone) {
            var tv = Math.min(MUSIC_TRACKS[this._currentZone].volume, 1) * this._masterVolume;
            this._gainNode.gain.setTargetAtTime(tv, _getAudioCtx().currentTime, 0.05);
        }
    },
    toggleMute: function () { if (this._muted) this.unmute(); else this.mute(); },

    isMuted: function () { return this._muted; },
    currentZone: function () { return this._currentZone; },
    isPlaying: function () { return !!(this._source); },

    // ── Private ──────────────────────────────────────────────────

    _startPlayback: function (audioBuffer, zone, targetVol) {
        var self = this;
        var ctx = _getAudioCtx();
        if (!ctx) return;

        // Resume suspended context (autoplay policy)
        var doStart = function () {
            var oldGain = self._gainNode;
            var oldSource = self._source;

            // New gain node starting at 0 — will be faded in
            var newGain = ctx.createGain();
            newGain.gain.setValueAtTime(0, ctx.currentTime);
            newGain.connect(ctx.destination);

            var newSource = ctx.createBufferSource();
            newSource.buffer = audioBuffer;
            newSource.loop = true;
            newSource.connect(newGain);
            newSource.start(0);

            self._source = newSource;
            self._gainNode = newGain;
            self._currentZone = zone;

            // Crossfade: fade old out, fade new in
            if (self._fadeTimer) clearInterval(self._fadeTimer);

            var steps = 30;
            var interval = Math.round(self._fadeDuration / steps);
            var step = 0;
            var startOld = oldGain ? oldGain.gain.value : 0;

            self._fadeTimer = setInterval(function () {
                step++;
                var t = step / steps;
                newGain.gain.setValueAtTime(targetVol * t, ctx.currentTime);
                if (oldGain) oldGain.gain.setValueAtTime(startOld * (1 - t), ctx.currentTime);

                if (step >= steps) {
                    clearInterval(self._fadeTimer);
                    self._fadeTimer = null;
                    newGain.gain.setValueAtTime(targetVol, ctx.currentTime);
                    if (oldGain) {
                        oldGain.disconnect();
                        if (oldSource) { try { oldSource.stop(); } catch (e) { } }
                    }
                    console.log('[MusicManager] Now playing: ' + zone + ' vol=' + targetVol.toFixed(2));
                }
            }, interval);
        };

        if (ctx.state === 'suspended') {
            ctx.resume().then(doStart).catch(function (err) {
                console.warn('[MusicManager] AudioContext resume failed, queuing.', err);
                var handler = function () {
                    document.removeEventListener('click', handler);
                    document.removeEventListener('keydown', handler);
                    ctx.resume().then(doStart);
                };
                document.addEventListener('click', handler, { once: true });
                document.addEventListener('keydown', handler, { once: true });
            });
        } else {
            doStart();
        }
    },

    _stopSource: function (source, gainNode) {
        var targetSource = source || this._source;
        var targetGain = gainNode || this._gainNode;
        if (targetSource) { try { targetSource.stop(); } catch (e) { } }
        if (targetGain) { try { targetGain.disconnect(); } catch (e) { } }
        if (!source || this._source === source) this._source = null;
        if (!gainNode || this._gainNode === gainNode) this._gainNode = null;
        if ((!source || this._source === null) && (!gainNode || this._gainNode === null)) this._currentZone = null;
    },

    // Linear gain ramp via setInterval (for stop fade-out)
    _fadeGain: function (gainNode, fromVol, toVol, duration, onDone) {
        var steps = 20;
        var interval = Math.round(duration / steps);
        var step = 0;
        var ctx = _getAudioCtx();
        var timer = setInterval(function () {
            step++;
            var v = fromVol + (toVol - fromVol) * (step / steps);
            gainNode.gain.setValueAtTime(v, ctx.currentTime);
            if (step >= steps) {
                clearInterval(timer);
                if (typeof onDone === 'function') onDone();
            }
        }, interval);
    },
};

// ── ATTACH TO IP2Live NAMESPACE ──────────────────────────────────
IP2Live.MusicManager = MusicManager;
window.IP2LiveMusic = MusicManager;

// ================================================================
//  SOUND FX MANAGER
//  Uses AudioContext too — same fetch → decodeAudioData pattern.
//  Buffers are cached after first load for zero-latency replay.
// ================================================================
var SoundFX = {

    // Edit volume (0.0–1.0) and halfOnly per effect here.
    _registry: {
        TYPING: { src: 'Songs/MusicEffects/Typing.mp3', volume: 0.35, halfOnly: true },
        GLITCH: { src: 'Songs/MusicEffects/Glitch01.mp3', volume: 0.10, halfOnly: false },
    },
    _masterVolume: 1,
    _buffers: {},   // key → decoded AudioBuffer

    setMasterVolume: function (vol) {
        this._masterVolume = Math.max(0, Math.min(1, vol));
    },

    getMasterVolume: function () {
        return this._masterVolume;
    },

    // ── Preload ──────────────────────────────────────────────────
    preload: function () {
        var self = this;
        var root = (typeof Common !== 'undefined' && Common.Platform)
            ? Common.Platform.ROOT_DIRECTORY : '';
        var keys = Object.keys(this._registry);
        keys.forEach(function (key) {
            var fx = self._registry[key];
            var fetchUrl = root + fx.src;
            fetch(fetchUrl)
                .then(function (resp) {
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    return resp.arrayBuffer();
                })
                .then(function (buf) {
                    var ctx = _getAudioCtx();
                    if (!ctx) return;
                    return new Promise(function (resolve, reject) {
                        ctx.decodeAudioData(buf, resolve, reject);
                    });
                })
                .then(function (audioBuffer) {
                    self._buffers[key] = audioBuffer;
                })
                .catch(function (err) {
                    console.error('[SoundFX] Failed to preload: ' + fx.src, err);
                });
        });
    },

    // ── One-shot play ────────────────────────────────────────────
    _play: function (key) {
        var ctx = _getAudioCtx();
        if (!ctx) return;
        var buf = this._buffers[key];
        if (!buf) return;   // not decoded yet — silently skip
        var fx = this._registry[key];

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(fx.volume * this._masterVolume, ctx.currentTime);
        gain.connect(ctx.destination);

        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);

        if (fx.halfOnly) {
            // Stop at half the buffer duration to play only first effect
            var halfDur = buf.duration / 2;
            src.start(0, 0, halfDur);
        } else {
            src.start(0);
        }

        // Clean up nodes when done
        src.onended = function () { gain.disconnect(); };
    },

    playTyping: function () { this._play('TYPING'); },
    playGlitch: function () { this._play('GLITCH'); },
};

// Preload effects immediately
SoundFX.preload();

// ── ATTACH TO IP2Live NAMESPACE ──────────────────────────────────
IP2Live.SoundFX = SoundFX;
window.IP2LiveSoundFX = SoundFX;

console.log('[IP2Live] music_manager.js loaded (Web Audio API mode).');
