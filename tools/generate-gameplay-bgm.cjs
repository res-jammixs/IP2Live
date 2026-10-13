/** Original mechanical / network soundtrack for Gameplays 3–8 (including 4.5).
 * Run: node tools/generate-gameplay-bgm.cjs
 * Deterministic offline synthesis; no samples, services, or dependencies.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    RATE, TAU, random, hz, buffer, voice, pad, bell, pulse, space, write,
} = require('./generate-story-prologue-audio.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'Songs/Musics/Gameplay');
const BUNDLE = path.join(ROOT, 'Plugins/IP2Live_Core/assets/audio/gameplay');
const TRACKS = [
    { id: 22, gameplay: '3', zone: 'GAMEPLAY_3', file: '03-bitstream-decoder.wav', title: 'Bitstream Decoder', bpm: 126,
      idea: 'Precise binary clicks and two alternating data tones for the CIDR panel.',
      chords: [[40, 47, 52, 55], [36, 43, 48, 52], [43, 50, 55, 59], [38, 45, 50, 54]],
      bass: [0, 0, 1, 0, 2, 0, 1, 0], lead: [0, 1, 2, 1, 3, 2, 1, 0], seed: 311 },
    { id: 23, gameplay: '4', zone: 'GAMEPLAY_4', file: '04-subnet-relay.wav', title: 'Subnet Relay', bpm: 112,
      idea: 'A left-to-right signal relay and measured packet pulses for the subnet simulator.',
      chords: [[45, 52, 57, 60], [41, 48, 53, 57], [38, 45, 50, 53], [43, 50, 55, 59]],
      bass: [0, 1, 0, 2, 0, 3, 1, 2], lead: [0, 1, 2, 3, 0, 2, 1, 3], seed: 419 },
    { id: 24, gameplay: '4.5', zone: 'GAMEPLAY_45', file: '04_5-reactor-lattice.wav', title: 'Reactor Lattice', bpm: 96,
      idea: 'Slow turbine rhythm and a rising charge sequence for the host-power reactor.',
      chords: [[38, 45, 50, 53], [39, 46, 51, 54], [41, 48, 53, 57], [45, 52, 57, 60]],
      bass: [0, 0, 0, 1, 0, 2, 0, 3], lead: [0, 1, 2, 3, 1, 2, 3, 3], seed: 451 },
    { id: 25, gameplay: '5', zone: 'GAMEPLAY_5', file: '05-quarantine-breach.wav', title: 'Quarantine Breach', bpm: 122,
      idea: 'Dark, gated bass and scanning alarm fragments for the quarantine route.',
      chords: [[41, 48, 53, 56], [42, 49, 54, 57], [38, 45, 50, 53], [36, 43, 48, 52]],
      bass: [0, 0, 2, 0, 1, 0, 3, 0], lead: [3, 2, 1, 0, 3, 1, 2, 0], seed: 517 },
    { id: 26, gameplay: '6', zone: 'GAMEPLAY_6', file: '06-matrix-lockdown.wav', title: 'Matrix Lockdown', bpm: 136,
      idea: 'Crossing two rhythmic grids and sharper machine accents for the quarantine matrix.',
      chords: [[39, 46, 51, 54], [36, 43, 48, 51], [42, 49, 54, 58], [37, 44, 49, 52]],
      bass: [0, 2, 0, 1, 3, 0, 2, 1], lead: [0, 3, 1, 2, 3, 0, 2, 1], seed: 631 },
    { id: 27, gameplay: '7', zone: 'GAMEPLAY_7', file: '07-repair-uplink.wav', title: 'Repair Uplink', bpm: 108,
      idea: 'Broken clockwork that resolves into a brighter connection motif for network repair.',
      chords: [[43, 50, 55, 59], [40, 47, 52, 55], [45, 52, 57, 60], [38, 45, 50, 53]],
      bass: [0, 1, 0, 0, 2, 1, 0, 3], lead: [0, 2, 1, 3, 2, 1, 3, 0], seed: 727 },
    { id: 28, gameplay: '8', zone: 'GAMEPLAY_8', file: '08-allocation-protocol.wav', title: 'Allocation Protocol', bpm: 116,
      idea: 'Ordered block-allocation arpeggios, confirmation chimes, and a deliberate pulse for VLSM.',
      chords: [[45, 52, 57, 60], [40, 47, 52, 55], [41, 48, 53, 57], [43, 50, 55, 59]],
      bass: [0, 1, 2, 0, 3, 1, 2, 0], lead: [0, 1, 2, 3, 2, 1, 3, 0], seed: 829 },
];

function kick(out, time, gain) {
    voice(out, time, .29, 0, (t, p) => {
        const phase = TAU * (47 * t + 34 * (1 - Math.exp(-t * 35)) / 35);
        return gain * Math.exp(-t * 16) * (Math.sin(phase) + .16 * Math.sin(2 * phase));
    });
}
function snare(out, time, gain, rng, pan = 0) {
    let low = 0;
    voice(out, time, .21, pan, (t) => {
        const noise = rng() * 2 - 1; low += .09 * (noise - low);
        return gain * Math.exp(-t * 19) * (.43 * Math.sin(TAU * 175 * t) + .5 * (noise - low));
    });
}
function hat(out, time, gain, rng, pan = 0) {
    let low = 0;
    voice(out, time, .075, pan, t => {
        const noise = rng() * 2 - 1; low += .15 * (noise - low);
        return gain * Math.exp(-t * 76) * (noise - low);
    });
}
function bass(out, midi, time, length, gain, bite = .2) {
    const f = hz(midi);
    voice(out, time, length, 0, (t, p) => {
        const env = Math.min(1, t / .014) * Math.min(1, (1 - p) * 7) * (.72 + .28 * Math.exp(-t * 5));
        const overtone = bite * Math.exp(-t * 5);
        return gain * env * (Math.sin(TAU * f * t) + overtone * Math.sin(TAU * f * 2 * t));
    });
}
function dataTone(out, midi, time, length, gain, pan, edge = .4) {
    const f = hz(midi);
    voice(out, time, length, pan, (t, p) => {
        const env = Math.min(1, t / .006) * Math.min(1, (1 - p) * 9) * Math.exp(-t * .7);
        return gain * env * (Math.sin(TAU * f * t + edge * Math.exp(-t * 14) * Math.sin(TAU * f * 2.01 * t)) +
            .14 * Math.sin(TAU * f * 2 * t));
    });
}
function metal(out, midi, time, gain, pan, tail = .46) {
    const f = hz(midi);
    voice(out, time, tail, pan, t => gain * Math.exp(-t * 15) *
        (Math.sin(TAU * f * t + 1.5 * Math.exp(-t * 13) * Math.sin(TAU * f * 2.13 * t)) +
         .27 * Math.sin(TAU * f * 3.97 * t)));
}
function machineTick(out, time, gain, pan, rng) {
    voice(out, time, .045, pan, t => gain * Math.exp(-t * 95) *
        (.6 * (rng() * 2 - 1) + .4 * Math.sin(TAU * 1300 * t)));
}

function render(track) {
    const bars = 16, beat = 60 / track.bpm, out = buffer(bars * 4 * beat, true);
    const rng = random(track.seed), index = TRACKS.indexOf(track);
    const sectionGain = bar => [0.75, 1, .87, 1.07][Math.floor(bar / 4)];
    for (let bar = 0; bar < bars; bar++) {
        const chord = track.chords[bar % 4], start = bar * 4 * beat, section = Math.floor(bar / 4);
        const lift = sectionGain(bar);
        // A quiet harmonic machine bed gives each track continuity while
        // individual patterns below describe that gameplay's rhythm.
        for (let i = 0; i < 3; i++) {
            pad(out, chord[i] + 12, start - beat * .4, beat * 4.8,
                (index === 2 ? .035 : .024) * lift, (i - 1) * .48, index === 6 ? .45 : .1);
        }
        for (let step = 0; step < 8; step++) {
            const t = start + step * beat / 2, b = track.bass[step], pitch = chord[b] - 12;
            const accent = step === 0 || step === 4;
            const lowGain = (index === 2 ? .18 : index === 4 ? .145 : .115) * (accent ? 1 : .74) * lift;
            if (index !== 2 || step % 2 === 0 || step === 7) bass(out, pitch, t, beat * (index === 2 ? .8 : .41), lowGain, index === 3 ? .7 : .34);
            if (step % 2 === 0 && !(index === 5 && step === 2)) kick(out, t, (index === 2 ? .28 : .20) * (accent ? 1 : .71) * lift);
            if (step === 2 || step === 6) snare(out, t, index === 2 ? .092 : .13, rng, step === 2 ? -.08 : .08);
            if (index !== 2 || step % 2 === 0) hat(out, t + (index === 4 && step % 2 ? beat * .11 : 0),
                (step % 2 ? .026 : .038) * lift, rng, step % 2 ? .42 : -.42);
        }
        if (index === 0) {
            // Gameplay 3: two alternating bit values, then a resolved CIDR code.
            for (let step = 0; step < 16; step++) {
                const t = start + step * beat / 4, bit = (step + bar * 3) % 7 < 3;
                machineTick(out, t, .021, bit ? -.66 : .66, rng);
                if (step % 2 === 0) dataTone(out, (bit ? chord[2] : chord[3]) + 24,
                    t + beat * .045, beat * .19, .032 * lift, bit ? -.55 : .55, .2);
            }
            if (bar % 4 === 3) bell(out, chord[3] + 24, start + beat * 3.2, .043, .36, 1.1, true);
        } else if (index === 1) {
            // Gameplay 4: signal packets traverse four relays left to right.
            for (let step = 0; step < 8; step++) {
                const note = chord[track.lead[step]] + 12, pan = -.72 + step / 7 * 1.44;
                dataTone(out, note, start + step * beat / 2, beat * .42, .068 * lift, pan, .7);
                if (step % 2 === 1) metal(out, note + 12, start + step * beat / 2 + beat * .25, .016, pan);
            }
            pulse(out, chord[0], start + beat * 3.5, .055, .4, beat * .48);
        } else if (index === 2) {
            // Gameplay 4.5: each bar charges upward, venting on the fourth beat.
            for (let step = 0; step < 4; step++) {
                const note = chord[track.lead[(step + bar) % 8]] + 12 + (step === 3 ? 12 : 0);
                metal(out, note, start + step * beat + beat * .1, (.055 + step * .013) * lift, -.3 + step * .2, .7);
                dataTone(out, chord[step] + 12, start + step * beat + beat * .44,
                    beat * .38, .047 * lift, -.5 + step / 3, .9);
            }
            if (bar % 4 === 3) bell(out, chord[3] + 24, start + beat * 3.1, .065, .1, 1.7, true);
        } else if (index === 3) {
            // Gameplay 5: restrictive gates and a low two-tone quarantine scan.
            for (let step = 0; step < 8; step++) {
                if ([0, 1, 3, 4, 6].includes(step)) dataTone(out, chord[track.lead[step]] + 12,
                    start + step * beat / 2, beat * .28, .07 * lift, step % 2 ? .35 : -.35, 1.15);
                if (step === 3 || step === 7) {
                    dataTone(out, chord[3] + 24, start + step * beat / 2 + beat * .24, beat * .19,
                        .032, -.7, 1.5);
                    dataTone(out, chord[2] + 24, start + step * beat / 2 + beat * .41, beat * .17,
                        .025, .7, 1.5);
                }
            }
        } else if (index === 4) {
            // Gameplay 6: two interlocking matrix rows and denser machine percussion.
            for (let step = 0; step < 16; step++) {
                const t = start + step * beat / 4, row = step % 3 === 0;
                machineTick(out, t, .017 * lift, row ? -.8 : .8, rng);
                if (row) dataTone(out, chord[track.lead[step % 8]] + 24,
                    t, beat * .17, .038 * lift, -.55, 1.0);
                if (step % 4 === 2) metal(out, chord[track.lead[(step / 2) % 8]] + 24,
                    t, .031 * lift, .62, .28);
            }
            snare(out, start + beat * 3.75, .075, rng, .3);
        } else if (index === 5) {
            // Gameplay 7: dropped packets return as a connected rising motif.
            for (let step = 0; step < 8; step++) {
                if (step === 2 && section < 2) continue;
                const note = chord[track.lead[step]] + 12;
                dataTone(out, note, start + step * beat / 2, beat * .34,
                    .055 * lift, -.48 + step * .14, .3);
                if (step === 3 || step === 7) bell(out, chord[3] + 24,
                    start + step * beat / 2, .022 * lift, .45, 1.25, true);
            }
            if (bar % 4 === 3) bell(out, chord[2] + 24, start + beat * 3.5, .05, -.15, 1.8);
        } else {
            // Gameplay 8: ascending block sizes, allocated in discrete groups.
            for (let group = 0; group < 4; group++) {
                const t = start + group * beat, order = group % 2 ? [3, 2, 1, 0] : [0, 1, 2, 3];
                for (let j = 0; j < 4; j++) dataTone(out, chord[order[j]] + 24,
                    t + j * beat / 4, beat * .19, (.036 + .009 * (j === 0)) * lift,
                    -.5 + j / 3, .53);
                if (group === 3) bell(out, chord[3] + 24, t + beat * .75, .046, .4, 1.5, true);
            }
        }
        if (bar % 4 === 3) metal(out, chord[0] + 24, start + beat * 3.75, .04, .02, .55);
    }
    // Circular, restrained cross-channel delay keeps the seam clean.
    space(out, index === 2 ? .22 : index === 5 ? .40 : .29);
    return out;
}

function generate() {
    fs.mkdirSync(SOURCE, { recursive: true });
    fs.mkdirSync(BUNDLE, { recursive: true });
    const files = [], entries = [];
    for (const track of TRACKS) {
        const source = path.join(SOURCE, track.file), bundled = path.join(BUNDLE, track.file);
        const stats = write(render(track), source, .118, .70);
        fs.copyFileSync(source, bundled);
        const sha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
        files.push({ ...stats, gameplay: track.gameplay, title: track.title, bpm: track.bpm, idea: track.idea, sha256 });
        entries.push({ kind: 1, id: track.id, name: 'Gameplay/' + track.file, file: track.file, sha256 });
        console.log(`Rendered Gameplay ${track.gameplay}: ${track.title} (${stats.seconds.toFixed(2)} s, ${stats.rmsDb} dB RMS)`);
    }
    fs.writeFileSync(path.join(SOURCE, 'manifest.json'), JSON.stringify({
        format: 'PCM WAV, stereo, 44100 Hz, 16 bit',
        synthesis: 'Original procedural composition; no external samples or AI audio.', files,
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(BUNDLE, 'manifest.json'), JSON.stringify({ version: 1, entries }, null, 2) + '\n');
    const registryPath = path.join(ROOT, 'songs.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const music = registry.list.find(group => group.k === 1).v;
    for (const entry of entries) {
        const existing = music.find(song => song.id === entry.id);
        if (existing && existing.name !== entry.name) throw new Error(`Song ID conflict: 1/${entry.id} (${existing.name})`);
        if (!existing) music.push({ id: entry.id, name: entry.name, br: false });
    }
    fs.writeFileSync(registryPath, JSON.stringify(registry));
    return files;
}
if (require.main === module) console.log(JSON.stringify(generate(), null, 2));
module.exports = { generate, TRACKS, render };
