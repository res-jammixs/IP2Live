'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Songs/Musics/StoryPrologue/manifest.json'), 'utf8'));

for (const entry of manifest.files) test(entry.file + ': playable stereo PCM, headroom and a clean boundary', () => {
    const wav = fs.readFileSync(path.join(root, entry.file));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(4), wav.length - 8); assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2); assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(24), 44100); assert.equal(wav.readUInt32LE(40), wav.length - 44);
    const frames = (wav.length - 44) / 4; assert.equal(frames / 44100, entry.seconds);
    let energy = 0, difference = 0, sum = 0, peak = 0;
    for (let i = 0; i < frames; i++) {
        const left = wav.readInt16LE(44 + i * 4) / 32768, right = wav.readInt16LE(46 + i * 4) / 32768;
        energy += left * left + right * right; difference += (left - right) ** 2; sum += left + right;
        peak = Math.max(peak, Math.abs(left), Math.abs(right));
    }
    const rms = Math.sqrt(energy / (frames * 2));
    assert.ok(rms > .04 && rms < .14, 'useful listening level');
    assert.ok(peak < .7 && peak > .1, 'headroom, with no clipping');
    assert.ok(Math.abs(sum / (frames * 2)) < 1e-5, 'no DC offset');
    assert.ok(difference / energy > .001, 'audible stereo detail');
    assert.ok(Math.abs(20 * Math.log10(rms) - entry.rmsDb) < .02);
    for (let channel = 0; channel < 2; channel++) {
        const first = wav.readInt16LE(44 + channel * 2) / 32768;
        const last = wav.readInt16LE(wav.length - 4 + channel * 2) / 32768;
        if (entry.loop) assert.ok(Math.abs(first - last) < .02, 'loop seam has no abrupt step');
        else { assert.ok(Math.abs(first) < .001); assert.ok(Math.abs(last) < .001, 'one-shot ends in silence'); }
    }
});

test('each slide has an original OST and matching effects; only ship descent is a one-shot', () => {
    assert.equal(manifest.files.length, 8);
    assert.equal(new Set(manifest.files.map(entry => entry.file)).size, 8);
    assert.deepEqual(manifest.files.filter(entry => !entry.loop).map(entry => path.basename(entry.file)), ['01-arrival-sfx.wav']);
    for (const prefix of ['01-arrival', '02-taking', '03-fortress', '04-our-way-inside']) {
        const entries = manifest.files.filter(entry => path.basename(entry.file).startsWith(prefix));
        assert.equal(entries.length, 2); assert.ok(entries.some(entry => entry.file.endsWith('-ost.wav')));
        assert.ok(entries.some(entry => entry.file.endsWith('-sfx.wav')));
    }
});

test('all eight recovery assets are bundled with the plugin and match the original Songs files', () => {
    const bundleRoot = path.join(root, 'Plugins/IP2Live_Core/assets/audio/story-prologue');
    const bundle = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'manifest.json'), 'utf8'));
    assert.equal(bundle.version, 1); assert.equal(bundle.entries.length, 8);
    for (const entry of bundle.entries) {
        assert.equal(path.basename(entry.file), entry.file);
        const original = manifest.files.find(source => path.basename(source.file) === entry.file);
        assert.ok(original); assert.equal(entry.name, 'StoryPrologue/' + entry.file);
        assert.equal(entry.kind, entry.file.endsWith('-ost.wav') ? 1 : 4);
        const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        assert.equal(digest(path.join(root, original.file)), entry.sha256);
        assert.equal(digest(path.join(bundleRoot, entry.file)), entry.sha256);
    }
});
