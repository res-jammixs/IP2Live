const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'music_manager.js'),
    'utf8'
);

class FakeHowl {
    constructor(src) {
        this._src = [src];
        this._playing = false;
        this._volume = 1;
        this._nextId = 1;
        this._listeners = new Map();
    }
    state() { return 'loaded'; }
    once(name, fn) {
        if (!this._listeners.has(name)) this._listeners.set(name, []);
        this._listeners.get(name).push(fn);
    }
    off(name, fn) {
        if (!this._listeners.has(name)) return;
        this._listeners.set(name, this._listeners.get(name).filter((item) => item !== fn));
    }
    _emit(name, ...args) {
        const listeners = this._listeners.get(name) || [];
        this._listeners.set(name, []);
        for (const listener of listeners) listener(...args);
    }
    play() {
        const id = this._nextId++;
        this._playing = true;
        setTimeout(() => this._emit('play', id), 0);
        return id;
    }
    playing() { return this._playing; }
    stop() { this._playing = false; }
    pause() { this._playing = false; }
    seek() { return 0; }
    loop() { return true; }
    fade(from, to) { this._volume = to; }
    volume(value) {
        if (typeof value === 'number') this._volume = value;
        return this._volume;
    }
}

function song(id, name, kind) {
    const howl = new FakeHowl(`data:audio/mp3;base64,${name}`);
    return {
        id,
        name,
        kind,
        base64: `data:audio/mp3;base64,${name}`,
        howl,
        load() {},
        getPath() { return this.base64; },
    };
}

async function main() {
    const musicNames = [
        'Main Menu.mp3',
        'Tutorial.mp3',
        'Stage 1 Music.mp3',
        'Stage 2 Music.mp3',
        'Stage 3 Music.mp3',
        'Stage 4 Music.mp3',
        'Gameplay 1.mp3',
        'Gameplay 2.mp3',
        'Gameplay 5 & 6.mp3',
    ];
    const music = new Map(musicNames.map((name, index) => [index + 9, song(index + 9, name, 1)]));
    const effects = new Map([
        [2, song(2, 'Typing.mp3', 4)],
        [3, song(3, 'Glitch01.mp3', 4)],
    ]);
    const nativeCalls = [];
    let replaceOnNextPlay = null;
    const managerSongs = {
        current: [],
        volumes: [],
        starts: [],
        ends: [],
        isMusicNone: true,
        isProgressionMusicEnd: true,
        playMusic(kind, id, volume, start, end) {
            nativeCalls.push({ kind, id, volume, start, end });
            if (replaceOnNextPlay) {
                context.Data.Songs.list.get(kind).set(id, replaceOnNextPlay);
                replaceOnNextPlay = null;
            }
            const registered = context.Data.Songs.list.get(kind).get(id);
            registered.load();
            registered.howl.volume(volume);
            registered.howl.seek(start);
            registered.howl.play();
            this.current[kind] = registered.howl;
            this.volumes[kind] = volume;
            this.starts[kind] = start;
            this.ends[kind] = end;
            this.isMusicNone = false;
        },
        playSound() {},
    };
    const howler = {
        state: 'suspended',
        ctx: {
            state: 'suspended',
            resume() {
                this.state = 'running';
                howler.state = 'running';
                return Promise.resolve();
            },
        },
        _autoResume() {},
        volume(value) { return value === undefined ? 1 : this; },
    };
    const quietConsole = {
        log() {}, info() {}, warn() {}, error() {}, table() {},
    };
    const context = vm.createContext({
        Common: { SONG_KIND: { MUSIC: 1, MUSIC_EFFECT: 4 } },
        Core: { Game: { current: null } },
        Data: {
            Songs: { list: new Map([[1, music], [4, effects]]) },
            Settings: { isProtected: true },
        },
        Manager: { Songs: managerSongs },
        Scene: { Map: { current: null } },
        IP2Live: {},
        Howler: howler,
        window: {},
        console: quietConsole,
        setTimeout,
        clearTimeout,
        Promise,
        Map,
        Date,
        Number,
        String,
        Math,
        Array,
        Object,
        isFinite,
    });

    vm.runInContext(source, context, { filename: 'music_manager.js' });
    const musicManager = context.IP2Live.MusicManager;

    assert.equal(await musicManager.play(musicManager.ZONE.MAIN_MENU), true);
    assert.equal(nativeCalls.at(-1).id, 9);
    assert.equal(nativeCalls.at(-1).kind, 1);
    assert.equal(nativeCalls.at(-1).start, 0);
    assert.equal(musicManager.currentZone(), musicManager.ZONE.MAIN_MENU);
    assert.equal(musicManager.isPlaying(), true);
    assert.equal(howler.ctx.state, 'running');

    assert.equal(await musicManager.play(musicManager.ZONE.TUTORIAL), true);
    assert.equal(nativeCalls.at(-1).id, 10);
    assert.equal(musicManager.currentZone(), musicManager.ZONE.TUTORIAL);

    const reloadedStage2 = song(12, 'Stage 2 Music.mp3', 1);
    replaceOnNextPlay = reloadedStage2;
    assert.equal(await musicManager.play(musicManager.ZONE.STAGE_2), true);
    assert.equal(nativeCalls.at(-1).id, 12);
    assert.equal(musicManager._howl, reloadedStage2.howl, 'manager must follow Data.Songs after full registry reload');

    music.delete(11);
    assert.equal(await musicManager.play(musicManager.ZONE.STAGE_1), false);
    assert.equal(nativeCalls.at(-1).id, 12, 'missing registered BGM must not call the engine with a bad ID');

    console.log('music_runtime.test.cjs: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
