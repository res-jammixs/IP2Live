const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const source = path.join(root, 'Songs/Musics/Gameplay');
const bundle = path.join(root, 'Plugins/IP2Live_Core/assets/audio/gameplay');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const recovery = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));

test('seven gameplay cues are registered, distinct, and have exact bundled copies', () => {
    assert.equal(manifest.files.length, 7);
    assert.equal(recovery.entries.length, 7);
    assert.equal(new Set(manifest.files.map(file => file.sha256)).size, 7);
    const songs = JSON.parse(fs.readFileSync(path.join(root, 'songs.json'), 'utf8'));
    const music = songs.list.find(group => group.k === 1).v;
    for (let i = 0; i < 7; i++) {
        const file = manifest.files[i], entry = recovery.entries[i], basename = path.basename(file.file);
        assert.equal(entry.id, 22 + i);
        assert.equal(entry.name, 'Gameplay/' + basename);
        assert.equal(music.find(song => song.id === entry.id)?.name, entry.name);
        assert.equal(entry.sha256, file.sha256);
        const original = fs.readFileSync(path.join(source, basename));
        const portable = fs.readFileSync(path.join(bundle, basename));
        assert.equal(crypto.createHash('sha256').update(original).digest('hex'), file.sha256);
        assert.deepEqual(original, portable);
    }
    const gameplay6 = fs.readFileSync(path.join(root, 'Plugins/IP2Live_Core/gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js'), 'utf8');
    assert.match(gameplay6, /this\._playMusicZone\('GAMEPLAY_6'\)/);
});

for (const entry of manifest.files) test(`${entry.title} is a clean stereo loop with safe level`, () => {
    const wav = fs.readFileSync(path.join(root, entry.file));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    const samples = (wav.length - 44) / 4;
    assert.ok(Math.abs(samples / 44100 - entry.seconds) < 1 / 44100);
    let peak = 0, energy = 0, stereoDifference = 0;
    for (let frame = 0; frame < samples; frame++) {
        const left = wav.readInt16LE(44 + frame * 4) / 32768;
        const right = wav.readInt16LE(46 + frame * 4) / 32768;
        peak = Math.max(peak, Math.abs(left), Math.abs(right));
        energy += left * left + right * right;
        stereoDifference += Math.abs(left - right);
    }
    const rms = Math.sqrt(energy / (samples * 2));
    assert.ok(rms >= .09 && rms <= .13, `RMS ${rms}`);
    assert.ok(peak < .72, `peak ${peak}`);
    assert.ok(stereoDifference / samples > .004, `stereo channels should contain different detail (${stereoDifference / samples})`);
    for (let channel = 0; channel < 2; channel++) {
        const first = wav.readInt16LE(44 + channel * 2) / 32768;
        const last = wav.readInt16LE(wav.length - 4 + channel * 2) / 32768;
        assert.ok(Math.abs(first - last) < .02, 'loop join should avoid a click');
    }
});
