const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const songs = JSON.parse(fs.readFileSync(path.join(projectRoot, 'songs.json'), 'utf8'));
const bundled = JSON.parse(fs.readFileSync(path.join(projectRoot, 'Plugins/IP2Live_Core/assets/audio/story-prologue/manifest.json'), 'utf8'));
const gameplayBundle = JSON.parse(fs.readFileSync(path.join(projectRoot, 'Plugins/IP2Live_Core/assets/audio/gameplay/manifest.json'), 'utf8'));
const endingBundle = JSON.parse(fs.readFileSync(path.join(projectRoot, 'Plugins/IP2Live_Core/assets/audio/story-ending/manifest.json'), 'utf8'));
const title = JSON.parse(fs.readFileSync(path.join(projectRoot, 'titlescreenGameover.json'), 'utf8'));
const musicManager = fs.readFileSync(
    path.join(projectRoot, 'Plugins', 'IP2Live_Core', 'modules', 'music_manager.js'),
    'utf8'
);
const pluginLoader = fs.readFileSync(
    path.join(projectRoot, 'Plugins', 'IP2Live_Core', 'code.js'),
    'utf8'
);
const mapManager = fs.readFileSync(
    path.join(projectRoot, 'Plugins', 'IP2Live_Core', 'modules', 'map_manager.js'),
    'utf8'
);

const musicExpected = new Map([
    [9, 'Main Menu.mp3'],
    [10, 'Tutorial.mp3'],
    [11, 'Stage 1 Music.mp3'],
    [12, 'Stage 2 Music.mp3'],
    [13, 'Stage 3 Music.mp3'],
    [14, 'Stage 4 Music.mp3'],
    [15, 'Gameplay 1.mp3'],
    [16, 'Gameplay 2.mp3'],
    [17, 'Gameplay 5 & 6.mp3'],
    [18, 'StoryPrologue/01-arrival-ost.wav'],
    [19, 'StoryPrologue/02-taking-ost.wav'],
    [20, 'StoryPrologue/03-fortress-ost.wav'],
    [21, 'StoryPrologue/04-our-way-inside-ost.wav'],
    [22, 'Gameplay/03-bitstream-decoder.wav'],
    [23, 'Gameplay/04-subnet-relay.wav'],
    [24, 'Gameplay/04_5-reactor-lattice.wav'],
    [25, 'Gameplay/05-quarantine-breach.wav'],
    [26, 'Gameplay/06-matrix-lockdown.wav'],
    [27, 'Gameplay/07-repair-uplink.wav'],
    [28, 'Gameplay/08-allocation-protocol.wav'],
    [29, 'StoryEnding/01-a-network-restored.wav'],
    [30, 'StoryEnding/02-open-skies.wav'],
]);
const effectsExpected = new Map([
    [2, 'Typing.mp3'],
    [3, 'Glitch01.mp3'],
    [4, 'StoryPrologue/01-arrival-sfx.wav'],
    [5, 'StoryPrologue/02-taking-sfx.wav'],
    [6, 'StoryPrologue/03-fortress-sfx.wav'],
    [7, 'StoryPrologue/04-our-way-inside-sfx.wav'],
]);

function group(kind) {
    const entry = songs.list.find((item) => item.k === kind);
    assert.ok(entry, `songs.json kind ${kind} must exist`);
    return entry.v;
}

for (const [id, name] of musicExpected) {
    const record = group(1).find((item) => item.id === id);
    if (name.startsWith('StoryEnding/')) {
        assert.ok(endingBundle.entries.some(entry => entry.kind === 1 && entry.id === id && entry.name === name), 'ending scores remain available if the editor removes their IDs');
    } else if (name.startsWith('Gameplay/')) {
        assert.ok(gameplayBundle.entries.some(entry => entry.kind === 1 && entry.id === id && entry.name === name), 'gameplay BGM remains available if the editor removes its IDs');
    } else if (name.startsWith('StoryPrologue/')) {
        assert.ok(bundled.entries.some(entry => entry.kind === 1 && entry.name === name), 'prologue remains available if the editor removes its IDs');
    } else assert.deepEqual(record, { id, name, br: false });
    const asset = path.join(projectRoot, 'Songs', 'Musics', name);
    assert.ok(fs.statSync(asset).size > 0, `${name} must be a non-empty source asset`);
}
for (const [id, name] of effectsExpected) {
    const record = group(4).find((item) => item.id === id);
    if (name.startsWith('StoryPrologue/')) {
        assert.ok(bundled.entries.some(entry => entry.kind === 4 && entry.name === name));
    } else assert.deepEqual(record, { id, name, br: false });
    const asset = path.join(projectRoot, 'Songs', 'MusicEffects', name);
    assert.ok(fs.statSync(asset).size > 0, `${name} must be a non-empty source asset`);
}

assert.equal(title.tm.id, 9);
assert.equal(title.tm.name, 'Main Menu.mp3');
assert.equal(title.tm.vid.v, 9);
assert.doesNotMatch(musicManager, /fetch\s*\(/, 'music playback must not fetch omitted loose files');
assert.doesNotMatch(musicManager, /Songs[\\/]Musics/, 'music playback must use Data.Songs IDs');
assert.match(musicManager, /VERSION: 'managed-bgm-20261015-08'/, 'runtime should expose the managed BGM build version');
assert.match(musicManager, /Manager\.Songs\.playMusic\(kind, track\.id/, 'BGM must use RPG Paper Maker native playback');
assert.match(pluginLoader, /managed_bgm_08_[^\n]+Date\.now\(\)/, 'music loader must cache-bust updated exports');
assert.match(pluginLoader, /fetch\(versionedSrc, \{ cache: 'no-store' \}\)/, 'music loader must bypass Electron cache');
assert.match(mapManager, /if \(started\) \{[\s\S]*_ip2liveMusicZoneKey = musicKey/, 'map BGM guard must be committed only after playback');

console.log('music_registry.test.cjs: PASS');
