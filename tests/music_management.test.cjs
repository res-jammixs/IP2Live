const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function harness() {
    let now = 100000, serial = 0;
    const timers = new Map(), gestures = {}, nativeCalls = [], warnings = [], errors = [];
    function later(fn, ms = 0) { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; }
    function advance(ms) {
        const end = now + ms;
        for (let guard = 0; guard < 1000; guard++) {
            const task = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!task) { now = end; return; }
            now = task[1].at; timers.delete(task[0]); task[1].fn();
        }
        throw new Error('Runaway audio timer');
    }
    class Howl {
        constructor() { this._playing = false; this._volume = 1; this._seek = 0; this._at = now; this._loop = true; this.events = []; this.id = 0; this.defer = false; }
        state() { return 'loaded'; }
        duration() { return 180; }
        on(event, fn) { this.events.push({ event, fn }); return this; }
        once(event, fn) { this.events.push({ event, fn, once: true }); return this; }
        off(event, fn) { this.events = this.events.filter(row => row.event !== event || row.fn !== fn); return this; }
        emit(event, ...args) { for (const row of this.events.filter(row => row.event === event)) { if (row.once) this.off(event, row.fn); row.fn(...args); } }
        play(id) {
            this.id = id ?? this.id + 1; this._at = now;
            if (!this.defer) { this._playing = true; later(() => this.emit('play', this.id)); }
            return this.id;
        }
        playing() { return this._playing; }
        stop() { this._playing = false; this._seek = 0; }
        pause() { this._seek = this.seek(); this._at = now; this._playing = false; }
        resume() { this._at = now; this._playing = true; this.emit('play', this.id); }
        seek(value) {
            if (typeof value !== 'number') return this._seek + (this._playing ? (now - this._at) / 1000 : 0);
            this._seek = value; this._at = now; this.emit('seek', this.id); return this;
        }
        loop(value) { if (typeof value === 'boolean') this._loop = value; return this._loop; }
        fade(from, to) { this._volume = to; }
        volume(value) { if (typeof value === 'number') this._volume = value; return this._volume; }
    }
    const registry = JSON.parse(fs.readFileSync(path.join(root, '../../songs.json'), 'utf8'));
    const entries = kind => registry.list.find(group => group.k === kind).v.filter(song => song.id > 0);
    const registered = row => [row.id, { ...row, base64: 'data:audio/wav;base64,test', howl: new Howl(), load() {} }];
    const music = new Map(entries(1).map(registered));
    const effects = new Map(entries(4).map(registered));
    // Seed a complete baseline independently of the editor's mutable database;
    // recovery tests below deliberately remove/reuse these IDs afterwards.
    for (const directory of ['story-prologue', 'gameplay']) {
        const bundled = JSON.parse(fs.readFileSync(path.join(root, `assets/audio/${directory}/manifest.json`), 'utf8'));
        for (const entry of bundled.entries) {
            const target = entry.kind === 1 ? music : effects;
            const [id, value] = registered({ id: entry.id, name: entry.name, br: false }); target.set(id, value);
        }
    }
    class MapScene { constructor(id) { this.id = id; this.loading = false; MapScene.current = this; } update() {} }
    const env = vm.createContext({
        console: { log() {}, info() {}, warn(...args) { warnings.push(args.join(' ')); }, error(...args) { errors.push(args.join(' ')); }, table() {} },
        setTimeout: later, clearTimeout: id => timers.delete(id), window: {},
        Date: class extends Date { static now() { return now; } },
        document: { addEventListener(name, fn) { gestures[name] = fn; } },
        Common: { SONG_KIND: { MUSIC: 1, MUSIC_EFFECT: 4 }, Platform: {} },
        Core: { Game: { current: { currentMapID: 1, ip2liveGameStates: {} } } },
        Data: { Songs: { list: new Map([[1, music], [4, effects]]) } },
        Manager: { Stack: {}, Songs: {
            current: [], volumes: [], starts: [], ends: [], playSound() {},
            playMusic(kind, id, volume, start, end) {
                nativeCalls.push({ kind, id, volume, start, end });
                const song = env.Data.Songs.list.get(kind).get(id); song.load(); const howl = song.howl;
                // Deliberately leave the old BGM running: the plugin must retire it.
                this.current[kind] = howl; howl.volume(volume); howl.seek(start); howl.play();
            },
        } },
        Scene: { Map: MapScene },
        IP2Live: {}, Howler: { state: 'running', ctx: { state: 'running' }, volume() {} },
    });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), env, { filename: file });
    load('modules/music_manager.js'); load('modules/map_manager.js');
    const manager = env.IP2Live.MusicManager;
    const finish = async promise => { await settle(); advance(0); await settle(); return promise; };
    const play = zone => finish(manager.play(zone));
    const enableBundledRecovery = () => {
        env.Common.Platform.ROOT_DIRECTORY = 'build/';
        env.Model = { Song: class {
            constructor(json) { Object.assign(this, json); }
            getPath() { return 'unused-native-project-path'; }
            load() { if (!this.howl) { this.howl = new Howl(); this.howl._src = this.getPath(); } }
        } };
    };
    return { env, manager, music, effects, nativeCalls, gestures, timers, advance, play, finish, load, MapScene,
        warnings, errors, enableBundledRecovery };
}

test('missing prologue registrations recover from shipped plugin assets, including in protected builds', async () => {
    const h = harness(); h.enableBundledRecovery(); h.env.Data.Settings = { isProtected: true };
    for (let id = 18; id <= 21; id++) h.music.delete(id);
    for (let id = 4; id <= 7; id++) h.effects.delete(id);
    const zones = ['STORY_PROLOGUE', 'PROLOGUE_TAKING', 'PROLOGUE_FORTRESS', 'PROLOGUE_UPLINK'];
    const effects = ['PROLOGUE_ARRIVAL', 'PROLOGUE_TAKING', 'PROLOGUE_FORTRESS', 'PROLOGUE_UPLINK'];
    for (let i = 0; i < 4; i++) {
        assert.equal(await h.play(zones[i]), true); assert.equal(h.nativeCalls.at(-1).id, 18 + i);
        assert.match(h.music.get(18 + i).howl._src, /^build\/Plugins\/IP2Live_Core\/assets\/audio\/story-prologue\/.+-ost\.wav$/);
        const layer = h.env.IP2Live.SoundFX.createLayer(effects[i]); layer.sync(.5, true, 1);
        assert.equal(await layer.ready, true); assert.equal(layer.howl.playing(), true);
        assert.match(layer.howl._src, /assets\/audio\/story-prologue\/.+-sfx\.wav$/); layer.stop();
    }
    const audit = h.manager.auditRegistry(false); assert.equal(audit.valid, true);
    assert.equal(audit.rows.filter(row => row.transport === 'bundled-plugin-asset').length, 8);
    assert.equal(h.errors.length, 0); assert.equal(h.warnings.length, 0);
    await h.play('TUTORIAL');
    for (let id = 18; id <= 21; id++) assert.equal(h.music.get(id).howl.playing(), false);
});

test('gameplays 3–8 use seven distinct full-volume BGM profiles and bundled recovery', async () => {
    const h = harness(); h.enableBundledRecovery(); h.env.Data.Settings = { isProtected: true };
    const targets = [
        ['ip_cidr_binary_panel', 22], ['ip_subnet_simulator', 23],
        ['ip_host_power_reactor', 24], ['ip_cidr_quarantine', 25],
        ['ip_cidr_quarantine_matrix', 26], ['ip_network_repair', 27],
        ['ip_vlsm_allocator', 28],
    ];
    for (let id = 22; id <= 28; id++) h.music.delete(id);
    h.manager.setVolume(0.5);
    for (const [gameplay, expectedId] of targets) {
        assert.equal(await h.finish(h.manager.playGameplay(gameplay)), true, gameplay);
        assert.equal(h.nativeCalls.at(-1).id, expectedId, gameplay);
        assert.ok(Math.abs(h.music.get(expectedId).howl.volume() - 0.5) < 1e-9, gameplay);
        assert.match(h.music.get(expectedId).howl._src, /^build\/Plugins\/IP2Live_Core\/assets\/audio\/gameplay\/.+\.wav$/);
    }
    assert.equal(h.manager.auditRegistry(false).valid, true);
    assert.equal(h.manager.getZoneConfig('GAMEPLAY_56').id, 25, 'legacy shared zone follows the new Gameplay 5 cue');
    assert.equal(await h.play('PVP_RACE'), true);
    assert.equal(h.nativeCalls.at(-1).id, 17, 'the PvP race retains its separate mix');
    assert.equal(h.warnings.length, 0); assert.equal(h.errors.length, 0);
});

test('bundled recovery preserves existing audio and follows a registry reload during playback startup', async () => {
    const h = harness(); h.enableBundledRecovery();
    const embedded = h.music.get(18); await h.play('STORY_PROLOGUE');
    assert.equal(h.manager._howl, embedded.howl); assert.equal(embedded._ip2liveBundledSource, undefined);
    await h.play('MAIN_MENU'); h.music.delete(18);
    let resume; h.manager.unlock = () => new Promise(resolve => { resume = resolve; });
    const pending = h.manager.play('STORY_PROLOGUE'), prepared = h.music.get(18);
    const nextMusic = new Map([...h.music].filter(([id]) => id < 18));
    h.env.Data.Songs.list = new Map([[1, nextMusic], [4, new Map([...h.effects].filter(([id]) => id < 4))]]);
    resume(true); assert.equal(await h.finish(pending), true);
    assert.notEqual(nextMusic.get(18), prepared); assert.equal(h.manager._howl, nextMusic.get(18).howl);
    assert.equal(prepared.howl.playing(), false);
});

test('prologue recovery avoids reused song IDs and reuses matching songs at a different ID', async () => {
    const h = harness(); h.enableBundledRecovery();
    const existing = h.music.get(18); existing.name = 'Another authored song.wav';
    for (let id = 19; id <= 21; id++) h.music.delete(id);
    const report = h.manager.auditRegistry(false); assert.equal(report.valid, true);
    for (const zone of ['STORY_PROLOGUE', 'PROLOGUE_TAKING', 'PROLOGUE_FORTRESS', 'PROLOGUE_UPLINK']) {
        assert.equal(await h.play(zone), true); assert.notEqual(h.nativeCalls.at(-1).id, 18);
    }
    assert.equal(h.music.get(18), existing); assert.equal(existing.name, 'Another authored song.wav');
    const elsewhere = harness(); elsewhere.enableBundledRecovery();
    const moved = elsewhere.music.get(18); elsewhere.music.delete(18); moved.id = 38; elsewhere.music.set(38, moved);
    assert.equal(await elsewhere.play('STORY_PROLOGUE'), true); assert.equal(elsewhere.nativeCalls.at(-1).id, 38);
    assert.equal(elsewhere.music.has(18), false);
});

test('a missing non-bundled song warns once, ignores input retries, and recovers when the registry changes', async () => {
    const h = harness(), original = h.music.get(11); h.music.delete(11);
    assert.equal(await h.play('STAGE_1'), false);
    let unlocks = 0; h.manager.unlock = async () => { unlocks++; return true; };
    for (let i = 0; i < 12; i++) {
        h.advance(300); h.gestures.keydown(); assert.equal(await h.manager.retry(), false);
        assert.equal(await h.play('STAGE_1'), false);
    }
    assert.equal(unlocks, 0); assert.equal(h.warnings.filter(message => message.includes('Song ID 11')).length, 1);
    assert.equal(h.errors.length, 0);
    h.music.set(11, original); assert.equal(await h.play('STAGE_1'), true);
    assert.equal(h.manager._registryFailures.has('STAGE_1'), false);
});

test('four prologue profiles use distinct registered tracks and transition cleanly to tutorial', async () => {
    const h = harness(), zones = ['STORY_PROLOGUE', 'PROLOGUE_TAKING', 'PROLOGUE_FORTRESS', 'PROLOGUE_UPLINK'];
    h.env.Data.Settings = { isProtected: true };
    assert.equal(h.manager.auditRegistry(false).valid, true);
    for (let i = 0; i < zones.length; i++) {
        await h.play(zones[i]); assert.equal(h.nativeCalls.at(-1).id, 18 + i);
        h.advance(2000); assert.equal(h.music.get(18 + i).howl.playing(), true);
        h.manager.stop(550); h.advance(600);
        assert.equal(h.music.get(18 + i).howl.playing(), false);
        assert.equal(h.manager._lastRequestedZone, null, 'gestures cannot revive a faded slide');
    }
    await h.play('TUTORIAL'); assert.equal(h.manager.currentZone(), 'TUTORIAL');
    for (let id = 18; id <= 21; id++) assert.equal(h.music.get(id).howl.playing(), false);
});

test('ambient SFX follow foreground time, loop, fade and the independent SFX slider', async () => {
    const h = harness(), fx = h.env.IP2Live.SoundFX, howl = h.effects.get(5).howl;
    howl.duration = () => 16;
    await h.play('PROLOGUE_TAKING'); const musicVolume = h.music.get(19).howl.volume();
    const layer = fx.createLayer('PROLOGUE_TAKING'); layer.sync(1.2, true, .5); await layer.ready;
    assert.equal(howl.playing(), true); assert.equal(howl.seek(), 1.2); assert.equal(howl.loop(), true);
    assert.equal(howl.volume(), .38 * .5);
    fx.setMasterVolume(.25); assert.equal(howl.volume(), .38 * .5 * .25);
    assert.equal(h.music.get(19).howl.volume(), musicVolume, 'SFX does not alter BGM gain');
    layer.sync(1.4, false, .8); assert.equal(howl.playing(), false);
    h.advance(5000); layer.sync(1.4, true, .8);
    assert.equal(howl.seek(), 1.4, 'focus resume seeks to the frozen visual clock');
    layer.sync(17.4, false, 1); layer.sync(17.4, true, 1); assert.ok(Math.abs(howl.seek() - 1.4) < 1e-8);
    layer.sync(18, true, 0); assert.equal(howl.volume(), 0);
    layer.stop(); layer.stop(); assert.equal(howl.playing(), false); assert.equal(fx._layers.size, 0);
    layer.sync(0, true, 1); assert.equal(howl.playing(), false);
});

test('arrival one-shot skips expired/closed cues and late decoding cannot resurrect audio', async () => {
    const h = harness(), fx = h.env.IP2Live.SoundFX, howl = h.effects.get(4).howl;
    howl.duration = () => 4.6;
    const expired = fx.createLayer('PROLOGUE_ARRIVAL'); expired.sync(6, true, 1); await expired.ready;
    assert.equal(howl.playing(), false); expired.stop();
    howl.state = () => 'loading';
    const closed = fx.createLayer('PROLOGUE_ARRIVAL'); closed.sync(.2, true, 1); closed.stop();
    assert.equal(howl.events.filter(event => ['load', 'loaderror'].includes(event.event)).length, 0, 'closing cancels decoder listeners immediately');
    howl.state = () => 'loaded'; howl.emit('load'); await closed.ready;
    assert.equal(howl.playing(), false); assert.equal(fx._layers.size, 0);
    assert.equal(howl.events.filter(event => ['load', 'loaderror', 'unlock'].includes(event.event)).length, 0);
    howl.state = () => 'loading';
    const late = fx.createLayer('PROLOGUE_ARRIVAL'); late.sync(2.4, true, .75);
    howl.state = () => 'loaded'; howl.emit('load'); await late.ready;
    assert.equal(howl.seek(), 2.4, 'late load starts at the current ship descent position');
    assert.equal(howl.loop(), false); late.sync(4.7, true, 1); assert.equal(howl.playing(), false); late.stop();
});

test('ambient autoplay waits for unlock and removing its scene releases unlock listeners', async () => {
    const h = harness(), fx = h.env.IP2Live.SoundFX, howl = h.effects.get(7).howl;
    h.manager.unlock = async () => false;
    const layer = fx.createLayer('PROLOGUE_UPLINK'); layer.sync(2, true, 1); await layer.ready;
    assert.equal(howl.playing(), false);
    howl.emit('unlock'); assert.equal(howl.playing(), true); assert.equal(howl.seek(), 2);
    layer.stop(); assert.equal(howl.events.filter(event => event.event === 'unlock').length, 0);
    const closed = fx.createLayer('PROLOGUE_UPLINK'); closed.sync(3, true, 1); await closed.ready; closed.stop();
    howl.emit('unlock'); assert.equal(howl.playing(), false);
    assert.equal(howl.events.filter(event => ['unlock', 'resume'].includes(event.event)).length, 0);
});

test('resumed tutorial replaces native title BGM without replaying entry dialogue', async () => {
    const h = harness();
    await h.play('MAIN_MENU');
    h.load('modules/game_manager.js');
    const gm = h.env.IP2Live.GameManager;
    const scene = new h.MapScene(1);
    scene._ip2liveStageIntroStarted = true;
    h.env.Manager.Stack.top = scene;
    // The autosave and manual-save paths both call this preparation method.
    gm.getPendingSlotRestoreForMap = () => ({ mapId: 1, slot: 0, suppressMapEntryDialogue: true });
    assert.equal(gm.prepareLoadedMapScene(scene, 1), true);
    await h.finish(h.manager._pendingPlay);
    scene.update(); await h.finish(h.manager._pendingPlay);
    assert.equal(h.manager.currentZone(), 'TUTORIAL');
    assert.equal(h.music.get(9).howl.playing(), false);
    assert.equal(h.music.get(10).howl.playing(), true);
    assert.equal(scene._ip2liveEntryDialogueSuppressedForRestore, true);
    const count = h.nativeCalls.length;
    scene.update(); scene.update(); await settle();
    assert.equal(h.nativeCalls.length, count, 'map updates never restart installed music');
    await h.play('MAIN_MENU');
    scene.update(); await h.finish(h.manager._pendingPlay);
    assert.equal(h.manager.currentZone(), 'TUTORIAL', 'a stale scene music guard repairs the wrong active zone');
});

test('map lifecycle selects tutorial BGM even without a new-game or save callback', async () => {
    const h = harness(); await h.play('MAIN_MENU');
    const scene = new h.MapScene(1); h.env.Manager.Stack.top = scene;
    scene.update(); await h.finish(h.manager._pendingPlay);
    assert.equal(h.manager.currentZone(), 'TUTORIAL');
    await h.play('GAMEPLAY_1'); h.env.Manager.Stack.top = { puzzle: true };
    scene.update(); await settle();
    assert.equal(h.manager.currentZone(), 'GAMEPLAY_1', 'underlying maps cannot steal gameplay music');
    h.env.Manager.Stack.top = scene;
    scene.update(); await h.finish(h.manager._pendingPlay);
    // A native title/map command can also replace the engine channel behind us.
    h.music.get(9).howl.play(); h.env.Manager.Songs.current[1] = h.music.get(9).howl;
    scene.update(); await h.finish(h.manager._pendingPlay);
    assert.equal(h.manager.currentZone(), 'TUTORIAL');
    assert.equal(h.music.get(9).howl.playing(), false, 'repair removes overlapping native music');
});

test('floor overrides, gameplay profiles and PVP profiles have independent volume', async () => {
    const h = harness(), m = h.manager;
    m.setVolume(0.5); m.configureZone('STAGE_1', { volume: 0.8 });
    m.configureFloor(4, { volume: 0.3, startAt: 2, loopStart: 12, loopEnd: 60 });
    await h.finish(m.playMap(4));
    assert.equal(m.currentZone(), 'FLOOR_4'); assert.equal(h.nativeCalls.at(-1).start, 2);
    assert.equal(h.music.get(11).howl.volume(), 0.15);
    m.setVolume(0.2); assert.equal(h.music.get(11).howl.volume(), 0.06);
    assert.equal(m.getZoneConfig('STAGE_1').volume, 0.8);
    await h.finish(m.playMap(3)); assert.equal(m.currentZone(), 'STAGE_1');
    assert.ok(Math.abs(h.music.get(11).howl.volume() - 0.16) < 1e-9);
    m.configureZone('GAMEPLAY_3', { volume: 0.25 });
    await h.finish(m.playGameplay('ip_cidr_binary_panel'));
    assert.equal(m.currentZone(), 'GAMEPLAY_3'); assert.equal(h.music.get(22).howl.volume(), 0.05);
    await h.finish(m.playGameplay('ip_cidr_quarantine')); assert.equal(m.currentZone(), 'GAMEPLAY_5');
    await h.finish(m.playGameplay('ip_cidr_quarantine_matrix')); assert.equal(m.currentZone(), 'GAMEPLAY_6');
    m.configureZone('PVP_MENU', { volume: 0.1 }); await h.play('PVP_MENU');
    assert.ok(Math.abs(h.music.get(9).howl.volume() - 0.02) < 1e-9);
    assert.equal(m.getZoneConfig('MAIN_MENU').volume, 0.95);
    m.mute(); assert.equal(h.music.get(9).howl.volume(), 0);
    m.unmute(); assert.ok(Math.abs(h.music.get(9).howl.volume() - 0.02) < 1e-9);
    m.stop(0);
});

test('pause mix keeps playback and loops running while respecting live volume and mute', async () => {
    const h = harness(), m = h.manager, owner = {};
    m.setVolume(0.5);
    m.configureZone('TUTORIAL', { volume: 0.8, loopStart: 2, loopEnd: 10 });
    await h.play('TUTORIAL');
    const howl = h.music.get(10).howl, id = howl.id, calls = h.nativeCalls.length;
    h.advance(3000);
    m.setPaused(true, owner);
    assert.equal(m.getState(), m.STATE.PAUSED);
    assert.ok(Math.abs(howl.volume() - 0.28) < 1e-9);
    assert.equal(m.getVolume(), 0.5, 'pause does not change the player preference');
    assert.equal(howl.seek(), 3, 'entering pause does not seek or restart');
    h.advance(7000);
    assert.equal(howl.seek(), 2, 'the music loops even while gameplay is paused');
    m.setVolume(0.25);
    assert.ok(Math.abs(howl.volume() - 0.14) < 1e-9);
    m.mute(); assert.equal(howl.volume(), 0);
    m.unmute(); assert.ok(Math.abs(howl.volume() - 0.14) < 1e-9);
    m.setPauseVolume(0.6);
    assert.equal(howl.volume(), 0.12);
    h.advance(1000);
    m.setPaused(false, owner);
    assert.equal(m.getState(), m.STATE.NORMAL);
    assert.equal(howl.volume(), 0.2, 'resume uses the latest master volume');
    assert.equal(howl.seek(), 3, 'resume retains the live playback position');
    assert.equal(howl.id, id); assert.equal(h.nativeCalls.length, calls);
    assert.equal(howl.playing(), true);
    assert.equal(h.env.Manager.Songs.volumes[1], 0.2);
});

test('pause requests compose and apply to pending or replacement tracks without starting idle music', async () => {
    const h = harness(), m = h.manager, first = {}, second = {};
    m.setPaused(true, first); m.setPaused(true, first); m.setPaused(true, second);
    assert.equal(h.nativeCalls.length, 0, 'pausing silence stays silent');
    m.setPaused(false, {}); m.setPaused(false, first);
    assert.equal(m.getState(), m.STATE.PAUSED, 'another owner still holds pause');
    m.setVolume(0.5);
    const pending = m.play('TUTORIAL');
    await h.finish(pending);
    assert.ok(Math.abs(h.music.get(10).howl.volume() - 0.35 * 0.5 * 0.7) < 1e-9);
    await h.play('GAMEPLAY_1');
    assert.ok(Math.abs(h.music.get(15).howl.volume() - 0.58 * 0.5 * 0.7) < 1e-9);
    m.setPaused(false, second); m.setPaused(false, second);
    assert.equal(m.getState(), m.STATE.NORMAL);
    assert.equal(h.music.get(15).howl.volume(), 0.29);
});

test('world and gameplay pause scenes retain ducking under settings and release it when removed', async () => {
    const h = harness(), m = h.manager;
    h.env.Scene.Base = class { close() {} };
    h.env.inject = () => {};
    h.load('modules/screens/pause-menu.js');
    h.load('modules/screens/gameplay-pause.js');
    const stack = h.env.Manager.Stack;
    stack.content = [];
    stack.push = scene => stack.content.push(scene);
    stack.pop = () => stack.content.pop().close();
    stack.popAll = () => { while (stack.content.length) stack.pop(); };
    await h.play('GAMEPLAY_1');
    const howl = h.music.get(15).howl, id = howl.id;
    const world = new h.env.window.IP2LivePauseMenu(); stack.push(world);
    const gameplay = new h.env.window.IP2LiveGameplayPauseMenu({ options: {} }); stack.push(gameplay);
    assert.equal(m.getState(), m.STATE.PAUSED);
    stack.push({ close() {} }); // Settings pushed over Pause.
    m.setVolume(0.4); stack.pop();
    assert.ok(Math.abs(howl.volume() - 0.58 * 0.4 * 0.7) < 1e-9);
    stack.pop();
    assert.equal(m.getState(), m.STATE.PAUSED, 'removing gameplay pause preserves world pause');
    stack.popAll();
    assert.equal(m.getState(), m.STATE.NORMAL, 'leaving for another screen releases pause');
    assert.equal(howl.volume(), 0.58 * 0.4);
    assert.equal(howl.id, id); assert.equal(howl.playing(), true);
    world.close(); gameplay.close();
    assert.equal(m.getState(), m.STATE.NORMAL, 'repeated cleanup is harmless');
});

test('intro plays once and custom loops return to the configured second, including pause and seek', async () => {
    const h = harness(), m = h.manager;
    m.configureZone('TUTORIAL', { startAt: 2, loopStart: 12, loopEnd: 20 });
    await h.play('TUTORIAL'); const howl = h.music.get(10).howl;
    assert.equal(howl.seek(), 2); h.advance(18000); assert.equal(howl.seek(), 12);
    h.advance(8000); assert.equal(howl.seek(), 12);
    howl.pause(); h.advance(10000); assert.equal(howl.seek(), 12);
    howl.resume(); h.advance(8000); assert.equal(howl.seek(), 12);
    howl.seek(19); h.advance(1000); assert.equal(howl.seek(), 12);
    await h.play('MAIN_MENU'); h.advance(60000);
    assert.equal(howl.playing(), false); assert.equal(howl.events.length, 0, 'old loop and playback listeners are detached');
    assert.equal(m.currentZone(), 'MAIN_MENU');
});

test('natural end loops skip the intro, and non-looping tracks stay finished', async () => {
    const h = harness(), m = h.manager;
    m.configureZone('TUTORIAL', { loopStart: 12 }); await h.play('TUTORIAL');
    const howl = h.music.get(10).howl; howl.seek(0); howl.emit('end', howl.id);
    assert.equal(howl.seek(), 12);
    m.configureZone('PVP_RACE', { loop: false, loopEnd: 5 }); await h.play('PVP_RACE');
    const race = h.music.get(17).howl; assert.equal(race.loop(), false);
    h.advance(5000); assert.equal(race.playing(), false);
    assert.equal(m.isZoneActive('PVP_RACE'), true, 'a completed one-shot is still the installed zone');
    assert.equal(await m.retry(), false);
    m.configureZone('TUTORIAL', { loop: false, loopStart: 0 }); await h.play('TUTORIAL');
    howl._playing = false; howl.emit('end', howl.id);
    assert.equal(await m.retry(), false); assert.equal(howl.events.length, 0);
});

test('duplicate and superseded requests cannot restart old music or leak listeners', async () => {
    const h = harness(), m = h.manager;
    h.music.get(9).howl.defer = true;
    const first = m.play('MAIN_MENU'), duplicate = m.play('MAIN_MENU');
    assert.equal(first, duplicate); await settle();
    assert.equal(h.nativeCalls.length, 1);
    await h.play('TUTORIAL'); assert.equal(await first, false);
    assert.equal(h.music.get(9).howl.events.length, 0);
    assert.equal(h.music.get(9).howl.playing(), false);
    const before = h.nativeCalls.length;
    const pending = m.play('STAGE_1');
    const back = m.play('TUTORIAL'); await h.finish(back);
    assert.equal(await pending, false); assert.equal(m.currentZone(), 'TUTORIAL');
    assert.equal(h.nativeCalls.length, before + 1, 'superseded unlock never reaches native playback');
});

test('stale fade cleanup cannot stop a reused Howl and transition gestures stay silent', async () => {
    const h = harness(), m = h.manager;
    await h.play('MAIN_MENU'); m.stop(1000); await h.play('PVP_MENU');
    h.advance(1040); assert.equal(h.music.get(9).howl.playing(), true);
    assert.equal(m._fadeTimers.size, 0);
    m.fadeOutForTransition(0); h.gestures.pointerup(); await settle(); h.advance(0);
    assert.equal(h.music.get(9).howl.playing(), false);
    await h.play('TUTORIAL'); assert.equal(m.currentZone(), 'TUTORIAL');
});

test('live timing changes replace pending starts and volume changes preserve the new loop configuration', async () => {
    const h = harness(), m = h.manager, howl = h.music.get(10).howl;
    howl.defer = true;
    const pending = m.play('TUTORIAL'); await settle();
    howl.defer = false;
    m.configureZone('TUTORIAL', { startAt: 4, loopStart: 12, loopEnd: 20 });
    await h.finish(m._pendingPlay);
    assert.equal(await pending, false);
    assert.equal(h.nativeCalls.at(-1).start, 4); assert.equal(howl.seek(), 4);
    m.setVolume(0.4);
    assert.equal(h.env.Manager.Songs.ends[1], null, 'engine updates do not compete with custom loops');
    h.advance(16000); assert.equal(howl.seek(), 12);
    m.stop(0); assert.equal(howl.events.length, 0);
});

test('editor fallback confirms playback and follows the same configured loop boundaries', async () => {
    const h = harness(), m = h.manager;
    delete h.env.Manager.Songs.playMusic;
    m.configureZone('TUTORIAL', { startAt: 1, loopStart: 3, loopEnd: 5 });
    assert.equal(await h.play('TUTORIAL'), true);
    assert.equal(h.nativeCalls.length, 0);
    const howl = h.music.get(10).howl;
    assert.equal(howl.seek(), 1); h.advance(4000); assert.equal(howl.seek(), 3);
    m.stop(0); assert.equal(howl.playing(), false); assert.equal(howl.events.length, 0);
});

test('invalid settings are rejected atomically and timing is checked against decoded duration', async () => {
    const h = harness(), m = h.manager, before = JSON.stringify(m.getZoneConfig('TUTORIAL'));
    for (const patch of [{ volume: NaN }, { volume: 1.1 }, { startAt: -1 }, { loopStart: Infinity }, { loopEnd: 0 }, { loopStart: 20, loopEnd: 10 }, { loop: 'yes' }]) {
        assert.throws(() => m.configureZone('TUTORIAL', patch));
        assert.equal(JSON.stringify(m.getZoneConfig('TUTORIAL')), before);
    }
    assert.throws(() => m.configureFloor(999, { volume: 0.5 }));
    assert.throws(() => m.configureZone('TUTORIAL', { loopEnd: 200 }));
    assert.equal(JSON.stringify(m.getZoneConfig('TUTORIAL')), before);
    // Configuration before decoding is validated again once duration is known.
    const howl = h.music.get(10).howl;
    howl.duration = () => 0;
    m.configureZone('TUTORIAL', { loopEnd: 200 });
    howl.duration = () => 180;
    assert.equal(await m.play('TUTORIAL'), false); assert.equal(h.nativeCalls.length, 0);
    const config = m.getConfiguration(); config.zones.MAIN_MENU.volume = 0;
    assert.equal(m.getZoneConfig('MAIN_MENU').volume, 0.95, 'inspection cannot mutate live profiles');
});
