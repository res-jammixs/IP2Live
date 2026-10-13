/** Original offline synthesis; no samples, services, packages or generated AI audio.
 * Run: node tools/generate-story-prologue-audio.cjs
 * All loop material is rendered onto a circular buffer, including reverb tails.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const RATE = 44100, TAU = Math.PI * 2;
const TITLES = ['01-arrival', '02-taking', '03-fortress', '04-our-way-inside'];
function random(seed) {
    let s = seed >>> 0;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
function buffer(seconds, loop) {
    const length = Math.round(seconds * RATE);
    return { seconds, loop, length, left: new Float32Array(length), right: new Float32Array(length) };
}
function voice(out, start, duration, pan, sample) {
    const first = Math.round(start * RATE), length = Math.round(duration * RATE);
    const l = Math.sqrt((1 - pan) / 2), r = Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < length; i++) {
        let n = first + i;
        if (out.loop) n = ((n % out.length) + out.length) % out.length;
        else if (n < 0 || n >= out.length) continue;
        const v = sample(i / RATE, i / length, i);
        out.left[n] += v * l; out.right[n] += v * r;
    }
}
function pad(out, midi, start, duration, gain, pan, color = 0) {
    const f = hz(midi);
    voice(out, start, duration, pan, (t, p) => {
        const env = Math.sin(Math.PI * p) ** 2;
        const core = Math.sin(TAU * f * t + .14 * Math.sin(TAU * .23 * t));
        const air = Math.sin(TAU * f * 1.002 * t + .8) * .28;
        const overtone = Math.sin(TAU * f * 2 * t) * (.06 + color * .08);
        return gain * env * (core + air + overtone) / 1.4;
    });
}
function bell(out, midi, start, gain, pan, duration = 3, bright = false) {
    const f = hz(midi);
    voice(out, start, duration, pan, (t, p) => gain * Math.min(1, t / .025) * Math.exp(-t * (bright ? 2.5 : 1.3)) *
        (1 - p) ** 2 * (Math.sin(TAU * f * t + Math.sin(TAU * f * 2 * t) * Math.exp(-t * 4) * .45) +
        .16 * Math.sin(TAU * f * 3 * t)));
}
function pulse(out, midi, start, gain, pan, duration = 1.7) {
    const f = hz(midi);
    voice(out, start, duration, pan, (t, p) => gain * Math.min(1, t / .06) * Math.exp(-t * 3.5) *
        (1 - p) ** 2 * (Math.sin(TAU * f * t) + .14 * Math.sin(TAU * 2 * f * t)));
}
function drone(out, midi, gain, phase, pan) {
    // Integer cycles and periodic breathing give continuous phase at the seam.
    const f = Math.round(hz(midi) * out.seconds) / out.seconds;
    voice(out, 0, out.seconds, pan, t => gain * (.75 + .16 * Math.sin(TAU * t / 16 + phase)) *
        (Math.sin(TAU * f * t + phase) + .18 * Math.sin(TAU * f * 2 * t + phase)));
}
function atmosphere(out, seed, gain, cutoff, pan = 0) {
    const rng = random(seed), raw = new Float32Array(out.length);
    for (let i = 0; i < raw.length; i++) raw[i] = rng() * 2 - 1;
    let state = 0;
    const alpha = 1 - Math.exp(-TAU * cutoff / RATE);
    // Warm the low-pass filter over the same circular material before writing it.
    for (let i = 0; i < raw.length; i++) state += alpha * (raw[i] - state);
    voice(out, 0, out.seconds, pan, (t, p, i) => {
        state += alpha * (raw[i] - state);
        return gain * state * (.75 + .15 * Math.sin(TAU * t / (out.seconds / 4)));
    });
}
function space(out, wet = .3) {
    const left = out.left.slice(), right = out.right.slice();
    const delays = [.137, .283, .419, .613, .877, 1.191];
    for (let j = 0; j < delays.length; j++) {
        const delay = Math.round(delays[j] * RATE), gain = wet * .55 ** (j / 2 + 1);
        for (let i = 0; i < out.length; i++) {
            let source = i - delay;
            if (source < 0 && !out.loop) continue;
            source = (source + out.length) % out.length;
            out.left[i] += (j % 2 ? right[source] : left[source]) * gain;
            out.right[i] += (j % 2 ? left[source] : right[source]) * gain;
        }
    }
}
function score(scene) {
    const out = buffer(32, true), rng = random(900 + scene);
    const progressions = [
        [[50,57,62,65,69], [46,53,58,62,65], [53,60,65,69,72], [45,52,57,62,64]],
        [[38,45,50,53,57], [38,46,50,53,58], [41,48,53,57,60], [38,45,50,52,57]],
        [[38,45,50,57,62], [38,46,50,58,65], [41,48,53,60,65], [45,52,57,62,64]],
        [[50,57,62,65,69], [53,60,65,69,72], [48,55,60,64,67], [46,53,58,62,65]],
    ][scene];
    drone(out, scene === 3 ? 50 : 38, .075, .4, -.2);
    drone(out, 45, .035, 1.7, .35);
    atmosphere(out, 400 + scene, .035, 350, .15);
    for (let bar = 0; bar < 4; bar++) {
        const chord = progressions[bar];
        chord.forEach((note, i) => pad(out, note, bar * 8 - 2, 12, i < 2 ? .07 : .045,
            (i - 2) * .28, scene === 3 ? .7 : .15));
        if (scene === 2) for (let beat = 0; beat < 8; beat++) {
            pulse(out, chord[0], bar * 8 + beat, beat % 2 ? .055 : .095, Math.sin(beat) * .2);
            if (beat % 2 === 0) bell(out, chord[3] + 12, bar * 8 + beat + .5, .018, .6, 2.5);
        }
        if (scene === 3) for (let beat = 0; beat < 8; beat++) {
            const note = chord[[2, 3, 4, 3, 2, 4, 3, 1][beat]] + 12;
            bell(out, note, bar * 8 + beat + .25, .038, Math.sin(beat * 1.8) * .6, 3.6);
            if (beat % 2 === 0) pulse(out, chord[0] - 12, bar * 8 + beat, .045, 0, 2);
        }
        if (scene < 2) {
            bell(out, chord[3] + 12, bar * 8 + 2, .03, -.5, 5);
            bell(out, chord[4] + 12, bar * 8 + 5.5, .024, .55, 4.5);
            if (scene === 1) pulse(out, chord[0], bar * 8 + 1, .055, -.25, 3);
        }
        for (let i = 0; i < 2; i++) bell(out, chord[2 + i] + 24, bar * 8 + 1 + rng() * 6, .006, rng() * 1.4 - .7, 4);
    }
    space(out, .55);
    return out;
}
function effects(scene) {
    const out = buffer(scene === 0 ? 4.6 : 16, scene !== 0), rng = random(1510 + scene);
    if (scene === 0) {
        // Same delay/duration/pan as the five ship poses in story-prologue-art.js.
        const ships = [[.2,3.1,.28,1], [.45,2.6,-.45,.22], [.05,2.9,-.14,.3], [.65,3.1,.75,.25], [0,2.5,.64,.16]];
        for (const [delay, duration, pan, size] of ships) {
            let smooth = 0;
            voice(out, delay, duration + .6, pan, (t, p) => {
                smooth += .035 * (rng() * 2 - 1 - smooth);
                const env = Math.sin(Math.PI * p) ** 1.6;
                const engine = Math.sin(TAU * (95 * t - 7 * t * t)) + .25 * Math.sin(TAU * 43 * t);
                return size * env * (engine * .14 + smooth * .6);
            });
        }
        space(out, .2);
        // One-shot tails must settle to silence, including the final reverb.
        for (let i = 0; i < out.length; i++) {
            const t = i / RATE, fade = Math.min(1, t / .06, (out.seconds - t) / .35);
            out.left[i] *= fade; out.right[i] *= fade;
        }
        return out;
    }
    if (scene === 1 || scene === 2) {
        atmosphere(out, 31 + scene, .35, 1700, -.45);
        atmosphere(out, 79 + scene, .27, 2400, .55);
        drone(out, scene === 1 ? 33 : 38, .085, .2, 0);
        // Sparse droplets and sheltered, low rain rather than a loud noise wash.
        for (let i = 0; i < 34; i++) {
            const f = 650 + rng() * 1550, pan = rng() * 1.7 - .85, gain = .008 + rng() * .014;
            voice(out, rng() * 16, .17, pan, (t, p) => gain * Math.min(1, t / .002) * Math.exp(-t * 45) *
                (1 - p) ** 2 * Math.sin(TAU * (f * t - 240 * t * t)));
        }
        if (scene === 1) {
            for (let i = 0; i < 4; i++) {
                pulse(out, 45, i * 4 + .2, .06, -.45, .8);
                let low = 0;
                voice(out, i * 4 + 1.2, 1.7, .4, (t, p) => {
                    low += .025 * (rng() * 2 - 1 - low);
                    return .18 * low * Math.sin(Math.PI * p) ** 2;
                });
            }
        } else {
            for (let i = 0; i < 4; i++) {
                bell(out, 74, i * 4 + .35, .02, i % 2 ? -.6 : .6, 1.2, true);
                bell(out, 69, i * 4 + .75, .012, i % 2 ? -.55 : .55, 1.2, true);
            }
        }
    } else {
        drone(out, 62, .035, .1, -.3); drone(out, 69, .022, 1.2, .3);
        atmosphere(out, 303, .065, 2200, .1);
        for (let i = 0; i < 8; i++) {
            const pan = Math.sin(i * 1.6) * .65;
            bell(out, [86,81,89,84][i % 4], i * 2 + .4, .035, pan, .28, true);
            bell(out, [89,84,93,88][i % 4], i * 2 + .56, .018, pan, .25, true);
            if (i % 2 === 1) bell(out, 93, i * 2 + .8, .012, -pan, .5, true);
        }
    }
    space(out, .23);
    return out;
}
function write(out, file, targetRms, peakLimit) {
    let energy = 0, peak = 0;
    for (const channel of [out.left, out.right]) {
        if (out.loop) {
            // Noise is circular, but its boundary samples can still differ. Blend
            // 12 ms around the join to a shared value without fading the loop out.
            const width = Math.round(.012 * RATE), join = (channel[0] + channel[channel.length - 1]) / 2;
            const headCorrection = join - channel[0], tailCorrection = join - channel[channel.length - 1];
            for (let i = 0; i < width; i++) {
                const weight = .5 + .5 * Math.cos(Math.PI * i / width);
                channel[i] += headCorrection * weight;
                channel[channel.length - 1 - i] += tailCorrection * weight;
            }
        }
        const mean = channel.reduce((a, b) => a + b, 0) / channel.length;
        let weightSum = channel.length;
        const weightAt = i => Math.min(1, i / (RATE * .02), (channel.length - 1 - i) / (RATE * .03));
        if (!out.loop) {
            weightSum = 0; for (let i = 0; i < channel.length; i++) weightSum += weightAt(i);
        }
        for (let i = 0; i < channel.length; i++) {
            // A one-shot's DC correction tapers at the edges, preserving silence.
            channel[i] -= mean * (out.loop ? 1 : weightAt(i) * channel.length / weightSum);
            energy += channel[i] ** 2; peak = Math.max(peak, Math.abs(channel[i]));
        }
    }
    const gain = Math.min(targetRms / Math.sqrt(energy / (out.length * 2)), peakLimit / peak);
    const wav = Buffer.alloc(44 + out.length * 4);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(out.length * 4, 40);
    for (let i = 0; i < out.length; i++) {
        wav.writeInt16LE(Math.round(out.left[i] * gain * 32767), 44 + i * 4);
        wav.writeInt16LE(Math.round(out.right[i] * gain * 32767), 46 + i * 4);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, wav);
    return { file: path.relative(ROOT, file).replaceAll('\\', '/'), seconds: out.seconds, loop: out.loop,
        rmsDb: +(20 * Math.log10(Math.sqrt(energy / (out.length * 2)) * gain)).toFixed(2),
        peakDb: +(20 * Math.log10(peak * gain)).toFixed(2) };
}
function generate() {
    const files = [];
    for (let i = 0; i < 4; i++) {
        files.push(write(score(i), path.join(ROOT, 'Songs/Musics/StoryPrologue', TITLES[i] + '-ost.wav'), .105, .66));
        files.push(write(effects(i), path.join(ROOT, 'Songs/MusicEffects/StoryPrologue', TITLES[i] + '-sfx.wav'), i === 0 ? .115 : .07, .55));
        console.log('Rendered ' + TITLES[i]);
    }
    fs.writeFileSync(path.join(ROOT, 'Songs/Musics/StoryPrologue/manifest.json'), JSON.stringify({
        format: 'PCM WAV, stereo, 44100 Hz, 16 bit', synthesis: 'Original procedural composition; no external samples.', files,
    }, null, 2) + '\n');
    // Ship native WAV copies with the plugin as a portable recovery source.
    const bundleDirectory = path.join(ROOT, 'Plugins/IP2Live_Core/assets/audio/story-prologue');
    fs.mkdirSync(bundleDirectory, { recursive: true });
    const bundledEntries = files.map((entry, i) => {
        const file = path.basename(entry.file), source = path.join(ROOT, entry.file);
        fs.copyFileSync(source, path.join(bundleDirectory, file));
        return { kind: i % 2 ? 4 : 1, id: i % 2 ? 4 + Math.floor(i / 2) : 18 + i / 2,
            name: 'StoryPrologue/' + file, file, sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') };
    });
    fs.writeFileSync(path.join(bundleDirectory, 'manifest.json'), JSON.stringify({ version: 1, entries: bundledEntries }, null, 2) + '\n');
    const registryFile = path.join(ROOT, 'songs.json');
    const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    for (const [kind, firstId, suffix] of [[1, 18, '-ost.wav'], [4, 4, '-sfx.wav']]) {
        const group = registry.list.find(group => group.k === kind);
        for (let i = 0; i < 4; i++) {
            const entry = { id: firstId + i, name: 'StoryPrologue/' + TITLES[i] + suffix, br: false };
            const existing = group.v.find(song => song.id === entry.id);
            if (existing && existing.name !== entry.name) throw new Error('Song ID conflict: ' + kind + '/' + entry.id);
            if (!existing) group.v.push(entry);
        }
    }
    fs.writeFileSync(registryFile, JSON.stringify(registry));
    return files;
}
if (require.main === module) console.log(JSON.stringify(generate(), null, 2));
// Shared, dependency-free synthesis primitives for the gameplay soundtrack.
module.exports = { generate, TITLES, RATE, TAU, random, hz, buffer, voice, pad, bell, pulse, drone, space, write };
