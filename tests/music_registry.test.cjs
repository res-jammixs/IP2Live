const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const songs = JSON.parse(fs.readFileSync(path.join(projectRoot, 'songs.json'), 'utf8'));
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
]);
const effectsExpected = new Map([
    [2, 'Typing.mp3'],
    [3, 'Glitch01.mp3'],
]);

function group(kind) {
    const entry = songs.list.find((item) => item.k === kind);
    assert.ok(entry, `songs.json kind ${kind} must exist`);
    return entry.v;
}

for (const [id, name] of musicExpected) {
    const record = group(1).find((item) => item.id === id);
    assert.deepEqual(record, { id, name, br: false });
    const asset = path.join(projectRoot, 'Songs', 'Musics', name);
    assert.ok(fs.statSync(asset).size > 0, `${name} must be a non-empty source asset`);
}
for (const [id, name] of effectsExpected) {
    const record = group(4).find((item) => item.id === id);
    assert.deepEqual(record, { id, name, br: false });
    const asset = path.join(projectRoot, 'Songs', 'MusicEffects', name);
    assert.ok(fs.statSync(asset).size > 0, `${name} must be a non-empty source asset`);
}

assert.equal(title.tm.id, 9);
assert.equal(title.tm.name, 'Main Menu.mp3');
assert.equal(title.tm.vid.v, 9);
assert.doesNotMatch(musicManager, /fetch\s*\(/, 'music playback must not fetch omitted loose files');
assert.doesNotMatch(musicManager, /Songs[\\/]Musics/, 'music playback must use Data.Songs IDs');
assert.match(musicManager, /VERSION: 'native-bgm-20260821-03'/, 'runtime should expose the native BGM build version');
assert.match(musicManager, /Manager\.Songs\.playMusic\(kind, track\.id/, 'BGM must use RPG Paper Maker native playback');
assert.match(pluginLoader, /native_bgm_03_[^\n]+Date\.now\(\)/, 'music loader must cache-bust updated exports');
assert.match(pluginLoader, /fetch\(versionedSrc, \{ cache: 'no-store' \}\)/, 'music loader must bypass Electron cache');
assert.match(mapManager, /if \(started\) \{[\s\S]*_ip2liveMusicZoneKey = musicKey/, 'map BGM guard must be committed only after playback');

console.log('music_registry.test.cjs: PASS');
