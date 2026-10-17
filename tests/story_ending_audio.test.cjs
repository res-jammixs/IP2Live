'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Songs/Musics/StoryEnding/manifest.json'), 'utf8'));
const bundleRoot = path.join(root, 'Plugins/IP2Live_Core/assets/audio/story-ending');
const bundle = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'manifest.json'), 'utf8'));

test('two distinct ending scores are registered and ship exact recovery copies', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'songs.json'), 'utf8')).list.find(group => group.k === 1).v;
    assert.equal(manifest.files.length, 2); assert.equal(bundle.version, 1); assert.equal(bundle.entries.length, 2);
    assert.equal(new Set(manifest.files.map(file => file.sha256)).size, 2);
    for (let i = 0; i < manifest.files.length; i++) {
        const source = manifest.files[i], entry = bundle.entries[i];
        assert.equal(source.loop, true); assert.equal(source.bars, 32);
        assert.equal(entry.id, 29 + i); assert.equal(entry.kind, 1);
        assert.equal(entry.file, path.basename(source.file)); assert.equal(entry.name, 'StoryEnding/' + entry.file);
        assert.deepEqual(registry.find(song => song.id === entry.id), { id: entry.id, name: entry.name, br: false });
        const original = fs.readFileSync(path.join(root, source.file));
        assert.deepEqual(fs.readFileSync(path.join(bundleRoot, entry.file)), original);
        assert.equal(crypto.createHash('sha256').update(original).digest('hex'), source.sha256);
        assert.equal(entry.sha256, source.sha256);
    }
    assert.ok(manifest.files[0].bpm < manifest.files[1].bpm, 'victory has a distinct, brighter tempo');
});

for (const entry of manifest.files) test(entry.title + ': decodable stereo PCM, safe levels and continuous loop', () => {
    const wav = fs.readFileSync(path.join(root, entry.file));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(4), wav.length - 8); assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2); assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(24), 44100); assert.equal(wav.readUInt32LE(40), wav.length - 44);
    const frames = (wav.length - 44) / 4;
    assert.ok(Math.abs(frames / 44100 - entry.seconds) < 1 / 44100);
    assert.ok(Math.abs(entry.seconds - entry.bars * 4 * 60 / entry.bpm) < 1 / 44100, 'loop ends on a complete musical phrase');
    let energy = 0, difference = 0, sum = 0, peak = 0;
    const sections = [0, 0, 0, 0];
    for (let i = 0; i < frames; i++) {
        const left = wav.readInt16LE(44 + i * 4) / 32768, right = wav.readInt16LE(46 + i * 4) / 32768;
        const power = left ** 2 + right ** 2;
        energy += power; difference += (left - right) ** 2; sum += left + right;
        sections[Math.min(3, Math.floor(i / frames * 4))] += power;
        peak = Math.max(peak, Math.abs(left), Math.abs(right));
    }
    const rms = Math.sqrt(energy / (frames * 2));
    assert.ok(rms > .08 && rms < .14, 'comfortable background music level');
    assert.ok(peak > .15 && peak <= .721, 'no clipping and at least 2.8 dB of headroom');
    assert.ok(Math.abs(sum / (frames * 2)) < 1e-5, 'no DC offset');
    assert.ok(difference / energy > .005, 'stereo ambience is present');
    assert.ok(Math.abs(20 * Math.log10(rms) - entry.rmsDb) < .02);
    for (const power of sections) assert.ok(Math.sqrt(power / (frames / 2)) > .035, 'no silent arrangement sections');
    for (let channel = 0; channel < 2; channel++) {
        const first = wav.readInt16LE(44 + channel * 2), last = wav.readInt16LE(wav.length - 4 + channel * 2);
        assert.ok(Math.abs(first - last) <= 1, 'no discontinuity at the loop join');
    }
});
