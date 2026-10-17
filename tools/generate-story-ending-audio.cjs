/** Original ending compositions, rendered offline without samples or services.
 * Run: node tools/generate-story-ending-audio.cjs
 * Sustains and stereo delay tails wrap around each complete musical phrase.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { RATE, TAU, random, hz, buffer, voice, bell, space, write } = require('./generate-story-prologue-audio.cjs');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'Songs/Musics/StoryEnding');
const BUNDLE = path.join(ROOT, 'Plugins/IP2Live_Core/assets/audio/story-ending');
const TRACKS = [
    { id: 29, file: '01-a-network-restored.wav', title: 'A Network Restored', screen: 'Four epilogue slides',
        bpm: 80, bars: 32, key: 'D minor / F major',
        idea: 'A quiet, determined pulse opens into warm strings, felt electric piano and a hopeful melody as Neo-Gaia is restored.' },
    { id: 30, file: '02-open-skies.wav', title: 'Open Skies', screen: 'Story Complete / victory',
        bpm: 112, bars: 32, key: 'F major',
        idea: 'A celebratory synth theme with a rising melody, rounded bass, shimmering arpeggios and a light, steady drum groove.' },
];
// Close voicings leave room for the bass and keep the narrative score gentle.
const CHORDS = {
    dm: { bass: 38, notes: [57, 60, 64, 65, 69] },
    bb: { bass: 34, notes: [53, 57, 60, 62, 65] },
    f:  { bass: 41, notes: [57, 60, 64, 67, 69] },
    c:  { bass: 36, notes: [55, 60, 62, 64, 67] },
    gm: { bass: 43, notes: [58, 62, 65, 69, 70] },
    fa: { bass: 33, notes: [53, 57, 60, 64, 67] },
    ce: { bass: 40, notes: [55, 60, 62, 64, 67] },
};

function strings(out, note, start, duration, gain, pan) {
    const f = hz(note);
    voice(out, start, duration, pan, (t, p) => {
        const attack = Math.min(1, t / 1.1), release = Math.min(1, (duration - t) / 1.6);
        const swell = .78 + .16 * Math.sin(Math.PI * p);
        const phase = TAU * f * t + .06 * Math.sin(TAU * 4.7 * t);
        let tone = 0;
        for (let n = 1; n <= 5; n++) {
            const amount = Math.exp(-n * .24) / n ** 1.6;
            tone += amount * (Math.sin(phase * n) + .35 * Math.sin(TAU * f * 1.0017 * n * t + .6));
        }
        return gain * attack * release * swell * tone;
    });
}

function piano(out, note, start, duration, gain, pan) {
    const f = hz(note);
    voice(out, start, duration, pan, (t, p) => {
        const env = Math.min(1, t / .009) * Math.exp(-t * 1.25) * Math.min(1, (1 - p) * 10);
        const tine = Math.sin(TAU * f * 2 * t) * .9 * Math.exp(-t * 4.8);
        return gain * env * (Math.sin(TAU * f * t + tine) + .18 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 2));
    });
}

function lead(out, note, start, duration, gain, pan, bright = false) {
    const f = hz(note);
    voice(out, start, duration + .28, pan, t => {
        const env = Math.min(1, t / .045) * Math.min(1, Math.max(0, (duration + .28 - t) / .34));
        const phase = TAU * f * t + .035 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / .4);
        return gain * env * (.70 * Math.sin(phase) + .20 * Math.sin(phase * 2) +
            (bright ? .10 : .04) * Math.sin(phase * 3) + .12 * Math.sin(TAU * f * .999 * t + .25));
    });
}

function bass(out, note, start, duration, gain) {
    const f = hz(note);
    voice(out, start, duration, 0, (t, p) => gain * Math.min(1, t / .018) * Math.min(1, (1 - p) * 6) *
        (.78 * Math.sin(TAU * f * t) + .17 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 2)));
}

function kick(out, start, gain) {
    voice(out, start, .46, 0, (t, p) => gain * Math.min(1, t / .003) * Math.exp(-t * 12) * (1 - p) *
        Math.sin(TAU * (48 * t + 55 * .025 * (1 - Math.exp(-t / .025)))));
}

function snare(out, start, gain, rng, soft = false) {
    let low = 0;
    voice(out, start, soft ? .30 : .22, .08, (t, p) => {
        const noise = rng() * 2 - 1;
        low += .12 * (noise - low);
        return gain * Math.min(1, t / .004) * Math.exp(-t * (soft ? 16 : 22)) * (1 - p) *
            ((noise - low) * .60 + .24 * Math.sin(TAU * 185 * t));
    });
}

function hat(out, start, gain, rng, pan, open = false) {
    let low = 0;
    voice(out, start, open ? .26 : .075, pan, (t, p) => {
        const noise = rng() * 2 - 1;
        low += .45 * (noise - low);
        return gain * Math.min(1, t / .002) * Math.exp(-t * (open ? 18 : 55)) * (1 - p) * (noise - low);
    });
}

function shimmer(out, start, gain, rng) {
    let low = 0;
    voice(out, start, 3.2, .45, (t, p) => {
        const noise = rng() * 2 - 1; low += .18 * (noise - low);
        return gain * Math.min(1, t / .08) * Math.exp(-t * 1.8) * (1 - p) * (noise - low);
    });
}

function epilogue(track) {
    const beat = 60 / track.bpm, bar = 4 * beat;
    const out = buffer(track.bars * bar, true), rng = random(0x4e454f);
    const progression = ['dm','bb','f','c', 'dm','bb','gm','c', 'bb','c','dm','f', 'f','ce','bb','c'];
    // Each two-bar phrase answers the previous one. The final C gently leads
    // back into D minor, so lingering on a slide never produces a hard restart.
    const melodies = [
        [[0,69,1.5],[2,72,1],[3,74,2],[6,69,1]],
        [[0,65,2],[3,69,1],[4,67,1.5],[6,65,1]],
        [[0,69,1],[1.5,72,1],[3,76,2],[6,74,1]],
        [[0,72,2],[3,67,1],[4.5,64,2]],
        [[0,74,1.5],[2,76,1],[3,77,2],[6,76,1]],
        [[0,77,1.5],[2,74,1],[3.5,72,2]],
        [[0,74,1.5],[2,77,1],[3,81,2],[6,79,1]],
        [[0,76,2],[3,74,1],[4.5,72,2]],
        [[0,77,2],[3,74,1],[4.5,72,2]],
        [[0,76,1.5],[2,79,1],[3,76,2],[6,74,1]],
        [[0,77,1],[1.5,76,1],[3,74,2],[6,72,1]],
        [[0,72,1.5],[2,76,1],[3,77,3]],
        [[0,77,2],[3,79,1],[4.5,81,2]],
        [[0,79,2],[3,76,1],[4.5,74,2]],
        [[0,77,1.5],[2,74,1],[3,72,2],[6,69,1]],
        [[0,67,2],[3,64,1],[4.5,67,2]],
    ];
    for (let phrase = 0; phrase < progression.length; phrase++) {
        const chord = CHORDS[progression[phrase]], start = phrase * bar * 2;
        const act = Math.floor(phrase / 4), lift = [.65, .80, 1, .90][act];
        chord.notes.forEach((note, i) => strings(out, note, start - .48, bar * 2 + 1.1,
            .040 * lift, -.64 + i * .32));
        bass(out, chord.bass, start, bar * 1.85, .11 * lift);
        for (let step = 0; step < 8; step++) {
            const order = [0,2,3,4,1,2,4,3];
            piano(out, chord.notes[order[step]] + (step % 4 === 3 ? 12 : 0),
                start + (step + .06) * beat, 2.4, .055 * lift, -.38 + step / 7 * .65);
        }
        for (const [offset, note, length] of melodies[phrase]) {
            const at = start + (offset + .18) * beat;
            if (act === 0) piano(out, note, at, length * beat + .8, .062, .12);
            else lead(out, note, at, length * beat, .051 * lift, .07);
        }
        if (act > 0) for (let b = 0; b < 8; b++) {
            if (b % 4 === 0 || (act === 2 && b % 4 === 2)) kick(out, start + b * beat, .075 * lift);
            if (b % 4 === 2) snare(out, start + b * beat, .040 * lift, rng, true);
            hat(out, start + (b + .5) * beat, .018 * lift, rng, b % 2 ? -.28 : .3);
        }
        if (phrase % 4 === 0) shimmer(out, start, .025, rng);
        if (act >= 2) bell(out, chord.notes[3] + 12, start + beat * 5.5, .020, .58, 3.6);
    }
    space(out, .51);
    return out;
}

function victory(track) {
    const beat = 60 / track.bpm, bar = 4 * beat;
    const out = buffer(track.bars * bar, true), rng = random(0x534b5946);
    const progression = ['f','c','dm','bb','f','ce','bb','c'];
    const themes = [
        [[0,77,1],[1.5,81,.5],[2,84,1],[3.5,81,.5],[4,79,1],[5.5,77,.5],[6,81,1.5]],
        [[0,79,1],[1.5,76,.5],[2,72,1.5],[4,74,1],[5.5,76,.5],[6,79,1.5]],
        [[0,77,1],[1.5,76,.5],[2,74,1],[3.5,72,.5],[4,74,1.5],[6,77,1.5]],
        [[0,77,1],[1.5,74,.5],[2,72,1.5],[4,74,1],[5,77,1],[6,79,1.5]],
    ];
    for (let b = 0; b < track.bars; b++) {
        const chord = CHORDS[progression[Math.floor(b / 2) % 8]], start = b * bar;
        const section = Math.floor(b / 8), lift = [1, .90, 1.08, .92][section];
        if (b % 2 === 0) chord.notes.forEach((note, i) =>
            strings(out, note, start - .22, bar * 2 + .55, .028 * lift, -.60 + i * .30));
        for (let eighth = 0; eighth < 8; eighth++) {
            const at = start + eighth * beat / 2;
            const bassNote = chord.bass + ([0,0,7,12,0,7,0,12][eighth]);
            bass(out, bassNote, at, beat * .38, .105 * (eighth % 2 ? .80 : 1));
            const note = chord.notes[[0,2,3,4,2,1,3,4][(eighth + b % 2 * 3) % 8]] + 12;
            piano(out, note, at + beat * .025, .85, .035 * lift, -.50 + eighth / 7);
            hat(out, at + beat * .012, eighth % 2 ? .042 : .026, rng, eighth % 2 ? .28 : -.30,
                eighth === 7 && b % 4 === 3);
        }
        for (let q = 0; q < 4; q++) {
            if (q === 0 || q === 2 || (q === 3 && b % 4 === 3)) kick(out, start + q * beat, .18);
            if (q === 1 || q === 3) snare(out, start + q * beat, .105, rng);
        }
        // A more spacious middle eight makes the second theme entrance count.
        if (b % 2 === 0 && !(section === 1 && b % 8 < 4)) {
            const phrase = Math.floor(b / 2) % 4;
            for (const [offset, note, length] of themes[phrase]) {
                const melodyNote = section === 2 && offset === 0 ? note + 12 : note;
                lead(out, melodyNote, start + offset * beat, length * beat * .9, .067 * lift, .02, true);
                if (section === 2) piano(out, melodyNote - 12, start + offset * beat, 1.5, .025, -.22);
            }
        }
        if (b % 8 === 0) shimmer(out, start, .062, rng);
        if (b % 8 === 7) for (let step = 0; step < 4; step++)
            snare(out, start + (3 + step / 4) * beat, .033 + step * .010, rng);
        if (section === 1 && b % 2 === 0) {
            bell(out, chord.notes[2] + 24, start + beat, .031, -.55, 2.8);
            bell(out, chord.notes[4] + 12, start + beat * 3, .025, .55, 2.8);
        }
    }
    space(out, .30);
    return out;
}

function generate() {
    const files = [], entries = [];
    for (const track of TRACKS) {
        const source = path.join(SOURCE, track.file);
        const stats = write(track.id === 29 ? epilogue(track) : victory(track), source,
            track.id === 29 ? .105 : .120, .72);
        fs.mkdirSync(BUNDLE, { recursive: true });
        fs.copyFileSync(source, path.join(BUNDLE, track.file));
        const sha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
        files.push({ ...stats, title: track.title, screen: track.screen, bpm: track.bpm, bars: track.bars,
            key: track.key, idea: track.idea, sha256 });
        entries.push({ kind: 1, id: track.id, name: 'StoryEnding/' + track.file, file: track.file, sha256 });
        console.log(`Rendered ${track.title}: ${stats.seconds.toFixed(2)} seconds, ${stats.rmsDb} dB RMS`);
    }
    fs.writeFileSync(path.join(SOURCE, 'manifest.json'), JSON.stringify({
        format: 'PCM WAV, stereo, 44100 Hz, 16 bit',
        synthesis: 'Original procedural composition; no external samples or AI audio.', files,
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(BUNDLE, 'manifest.json'), JSON.stringify({ version: 1, entries }, null, 2) + '\n');
    // The editor can remove externally added song IDs. Restore every existing
    // plugin-owned registration too, without replacing editor-authored songs.
    const registryPath = path.join(ROOT, 'songs.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    for (const directory of ['story-prologue', 'gameplay', 'story-ending']) {
        const manifestPath = path.join(ROOT, 'Plugins/IP2Live_Core/assets/audio', directory, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        for (const entry of JSON.parse(fs.readFileSync(manifestPath, 'utf8')).entries) {
            const group = registry.list.find(group => group.k === entry.kind).v;
            const existing = group.find(song => song.id === entry.id);
            if (existing && existing.name !== entry.name) throw new Error(`Song ID conflict: ${entry.kind}/${entry.id} (${existing.name})`);
            if (!existing) group.push({ id: entry.id, name: entry.name, br: false });
        }
    }
    fs.writeFileSync(registryPath, JSON.stringify(registry));
    return files;
}
if (require.main === module) generate();
module.exports = { generate, TRACKS, epilogue, victory };
