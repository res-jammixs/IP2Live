const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const plain = value => JSON.parse(JSON.stringify(value));

function harness(width = 1280, height = 720, earlyInitialize = true) {
    let now = 10000, focused = true, resets = 0, paintings = 0;
    const texts = [], songs = [], frames = [], created = [];
    const contextFor = canvas => new Proxy({ canvas, measureText: text => ({ width: String(text).length * 11 }),
        fillText: (text, x, y) => texts.push({ text: String(text), x, y }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => ({}) }, { get: (target, key) => key in target ? target[key] : () => {} });
    const canvas = { width, height }, paint = contextFor(canvas);
    class MapScene { update() {} drawHUD() {} }
    const game = { currentMapID: 1, infiltratorName: 'NOVA', ip2liveGameStates: {} };
    const c = vm.createContext({ console: { log() {}, warn() {} }, window: { matchMedia: () => ({ matches: false }) },
        Date: class extends Date { static now() { return now; } }, setTimeout: () => 1, clearTimeout() {},
        document: { hidden: false, hasFocus: () => focused, addEventListener() {}, removeEventListener() {},
            createElement() { const surface = { width: 1, height: 1, getContext() { return contextFor(this); } }; created.push(surface); return surface; } },
        Common: { Platform: { ctx: paint }, ScreenResolution: { SCREEN_X: width, SCREEN_Y: height } }, Core: { Game: { current: game } },
        Data: { Systems: {}, Keyboards: { checkActionMenu: key => key === 'Enter', checkCancelMenu: key => key === 'Escape' } },
        Scene: { Base: class { constructor(initialize) { if (initialize && earlyInitialize) this.initialize?.(); } close() {} }, Map: MapScene },
        Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {},
        Manager: { Stack: { get top() { return frames.at(-1); }, push: s => frames.push(s),
            replace(s) { frames.pop()?.close?.(); frames.push(s); }, requestPaintHUD: false } },
        IP2Live: { Assets: { loadPauseFonts: async () => {} }, InputGuard: { reset() { resets++; } },
            MusicManager: { zone: null, stops: [], play(zone) { songs.push(zone); this.zone = zone; },
                currentZone() { return this.zone; }, stop(ms) { this.stops.push(ms); this.zone = null; } },
            SoundFX: { layers: [], createLayer(key) {
                const layer = { key, stopped: false, calls: [], sync(...args) { this.calls.push(args); }, stop() { this.stopped = true; } };
                this.layers.push(layer); return layer;
            } } },
    });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    for (const file of ['modules/story_lore.js', 'modules/screens/story-prologue-art.js', 'modules/screens/story-prologue.js', 'modules/game_manager.js']) load(file);
    const art = c.IP2Live.PrologueArt.paint;
    c.IP2Live.PrologueArt.paint = (...args) => { paintings++; return art(...args); };
    const screen = new c.IP2Live.StoryPrologueScreen(() => {}); frames.push(screen);
    const advance = (ms, target = screen) => { while (ms > 0) { const step = Math.min(100, ms); now += step; target.update(); ms -= step; } };
    const reading = async () => { await screen.load(); advance(800); assert.equal(screen.phase, 'reading'); };
    return { c, ip: c.IP2Live, screen, frames, game, texts, songs, created, load, advance, reading,
        setFocused(value) { focused = value; }, get resets() { return resets; }, get paintings() { return paintings; } };
}

test('the four prologue scenes introduce the invaders, the resource monopoly, APEX and the subnetting mission', () => {
    const h = harness(), lore = h.ip.StoryLore;
    assert.equal(lore.prologue.length, 4);
    assert.match(lore.prologue[0].text, /another galaxy/);
    assert.match(lore.prologue[1].text, /food, medicine, water and power/);
    assert.match(lore.prologue[2].text, /APEX artificial intelligence/);
    assert.match(lore.prologue[3].text, /subnetting/); assert.match(lore.prologue[3].text, /everyone/);
    const maps = Object.keys(h.ip.GameManager.flowConfig.maps).map(Number).filter(id => id !== 1);
    for (const id of maps) {
        const d = lore.floorDialogue(id); assert.ok(d, 'floor ' + id + ' has an authored briefing');
        assert.equal(d.bindings.mapId, id); assert.equal(d.bindings.trigger, 'worldTitle.finished');
        assert.equal(d.speaker, 'NEURAL LINK'); assert.equal(d.slides.length, 2);
        assert.match(d.slides.flat().join(' '), /APEX|occupiers/);
        assert.doesNotMatch(d.slides.flat().join(' '), /placeholder|being prepared|world-to-world connectivity/i);
    }
});

test('each slide owns matching audio, freezes effects on focus loss and releases them before tutorial music', async () => {
    const h = harness(), s = h.screen; await h.reading();
    const zones = ['STORY_PROLOGUE', 'PROLOGUE_TAKING', 'PROLOGUE_FORTRESS', 'PROLOGUE_UPLINK'];
    const keys = ['PROLOGUE_ARRIVAL', 'PROLOGUE_TAKING', 'PROLOGUE_FORTRESS', 'PROLOGUE_UPLINK'];
    for (let i = 0; i < 4; i++) {
        assert.equal(h.songs.at(-1), zones[i]); const layer = h.ip.SoundFX.layers.at(-1);
        assert.equal(layer.key, keys[i]); h.advance(300);
        const before = s._audioTime;
        h.setFocused(false); h.advance(5000);
        assert.equal(s._audioTime, before); assert.equal(layer.calls.at(-1)[1], false);
        h.setFocused(true); h.advance(100);
        assert.equal(layer.calls.at(-1)[0], before / 1000, 'effects resume at their foreground time');
        h.advance(16000); s.onKeyPressed('Enter'); h.advance(300);
        assert.equal(h.ip.MusicManager.stops.at(-1), 550);
        assert.ok(layer.calls.at(-1)[2] > 0 && layer.calls.at(-1)[2] < 1, 'SFX fade with the illustration');
        h.advance(300); assert.equal(layer.stopped, true);
        if (i < 3) h.advance(800);
    }
    assert.equal(s.phase, 'leaving'); assert.ok(h.ip.SoundFX.layers.every(layer => layer.stopped));
    h.ip.MusicManager.play('TUTORIAL'); const stops = h.ip.MusicManager.stops.length;
    s.close(); assert.equal(h.ip.MusicManager.currentZone(), 'TUTORIAL');
    assert.equal(h.ip.MusicManager.stops.length, stops, 'closing an old prologue cannot stop new tutorial music');
});

test('closing before audio starts leaves menu music alone; reduced motion skips the ship descent cue', async () => {
    const early = harness(); early.ip.MusicManager.play('MAIN_MENU'); early.screen.close();
    assert.equal(early.ip.MusicManager.currentZone(), 'MAIN_MENU'); assert.equal(early.ip.MusicManager.stops.length, 0);
    const h = harness(); h.screen.reducedMotion = true; await h.screen.load();
    assert.equal(h.songs[0], 'STORY_PROLOGUE'); assert.equal(h.ip.SoundFX.layers.length, 0);
    h.advance(16000); h.screen.onKeyPressed('Enter'); h.advance(300);
    assert.equal(h.ip.SoundFX.layers.at(-1).key, 'PROLOGUE_TAKING');
    h.screen.close(); assert.equal(h.ip.SoundFX.layers.at(-1).stopped, true);
    assert.equal(h.ip.MusicManager.currentZone(), null);
});

test('captions finish typing before Space or Enter advances, then fade through all four scenes', async () => {
    const h = harness(); await h.reading();
    const s = h.screen; h.advance(500); assert.ok(s.visibleChars > 0 && !s._revealed());
    for (let i = 0; i < 4; i++) {
        assert.equal(s.index, i); assert.equal(s.phase, 'reading');
        const before = s.visibleChars;
        for (const key of ['Enter', ' ', 13, 32, { key: 'Enter' }]) s.onKeyPressed(key);
        assert.equal(s.visibleChars, before, 'early presses do not reveal or skip the caption');
        s.onKeyPressedAndRepeat('Enter'); assert.equal(s.phase, 'reading');
        h.advance(15000); assert.equal(s._revealed(), true);
        h.advance(5000); assert.equal(s.phase, 'reading', 'reading has no automatic timeout');
        s.onKeyPressed({ key: 'Enter', repeat: true }); s.onKeyPressedAndRepeat('Enter');
        assert.equal(s.phase, 'reading', 'holding a key cannot advance a finished caption');
        s.drawHUD(); assert.ok(s._textRows(h.c.Common.Platform.ctx).length <= 4);
        s.onKeyPressed(i % 2 ? 32 : 'Enter'); assert.equal(s.phase, 'fadeOut');
        s.onKeyPressed('Enter'); h.advance(400); assert.equal(s.index, i);
        h.advance(200);
        if (i < 3) { assert.equal(s.index, i + 1); assert.equal(s.phase, 'fadeIn'); h.advance(800); }
    }
    assert.equal(s.phase, 'leaving'); assert.equal(s.launched, true); assert.equal(h.paintings, 4);
    assert.ok(s._cache.size <= 2);
});

test('hidden/unfocused windows and background overlays suspend both text and fades', async () => {
    const h = harness(); await h.reading(); h.advance(200);
    const before = h.screen.visibleChars;
    h.setFocused(false); h.advance(5000); assert.equal(h.screen.visibleChars, before);
    h.setFocused(true); h.advance(100); assert.equal(h.screen.visibleChars, before, 'resume frame does not charge the suspended interval');
    h.frames.push({}); h.advance(1000); assert.equal(h.screen.visibleChars, before); h.frames.pop(); h.advance(100);
    h.c.document.hidden = true; h.advance(2000); assert.equal(h.screen.visibleChars, before); h.c.document.hidden = false; h.advance(100);
    h.advance(15000); h.screen.onKeyPressed('Enter'); assert.equal(h.screen.phase, 'fadeOut'); const fade = h.screen.elapsed;
    h.setFocused(false); h.advance(2000); assert.equal(h.screen.elapsed, fade);
});

test('loading and fades block input, and Escape never skips the story', async () => {
    const h = harness();
    h.screen.onKeyPressed('Escape'); assert.equal(h.screen.phase, 'fadeIn');
    await h.screen.load(); h.advance(300);
    for (const key of ['Escape', 'Enter', ' ', 13, 32]) h.screen.onKeyPressed(key);
    assert.equal(h.screen.phase, 'fadeIn'); assert.equal(h.screen.index, 0);
    h.advance(500); assert.equal(h.screen.phase, 'reading'); h.advance(15000);
    for (const key of ['Escape', 27, 'Tab', 'ArrowRight']) h.screen.onKeyPressed(key);
    assert.equal(h.screen.phase, 'reading'); assert.equal(h.screen.index, 0);
});

test('fresh Story creation waits for the prologue, starts autosave/tutorial once, and clears held input', async () => {
    for (const early of [true, false]) {
        const h = harness(1280, 720, early), gm = h.ip.GameManager, starts = [], saves = [];
        h.frames.length = 0; h.frames.push({ id: 'name-loader' });
        h.ip.StoryAutosave = { beginStory(game) { saves.push(game); } };
        gm.startTutorialFlow = options => { starts.push(options); h.c.Manager.Stack.replace({ id: 'tutorial-map' }); return true; };
        assert.equal(gm.startNewGameFlow('NOVA'), true);
        const screen = h.frames.at(-1); assert.ok(screen instanceof h.ip.StoryPrologueScreen);
        assert.equal(starts.length, 0); assert.equal(saves.length, 0);
        assert.equal(gm.startNewGameFlow('NOVA'), false, 'duplicate new-story input is ignored');
        await screen.load();
        for (let i = 0; i < 4; i++) {
            h.advance(16000, screen); assert.equal(screen._revealed(), true);
            screen.onKeyPressed('Enter'); h.advance(600, screen);
            if (i < 3) { assert.equal(starts.length, 0); assert.equal(saves.length, 0); }
        }
        assert.equal(starts.length, 1); assert.equal(saves.length, 1); assert.equal(saves[0], h.game);
        assert.equal(starts[0].cleanMapSession, true); assert.equal(starts[0].useLoading, false);
        assert.equal(h.frames.at(-1).id, 'tutorial-map'); assert.equal(h.ip.StoryPrologue.active, null);
        assert.equal(screen.closed, true); assert.equal(screen._cache.size, 0); assert.ok(h.resets >= 3);
        screen.onKeyPressed('Enter'); screen.update(); assert.equal(starts.length, 1);
        assert.equal(h.songs[0], 'STORY_PROLOGUE');
    }
});

test('the removed buttons cannot be clicked and the only visible control is the centered keyboard prompt', async () => {
    const h = harness(1024, 768); await h.reading(); let calls = 0;
    h.screen.onComplete = () => calls++;
    const s = .8, offsetY = (768 - 720 * s) / 2;
    const next = { x: 1080 * s, y: offsetY + 656 * s }, skip = { x: 1145 * s, y: offsetY + 43 * s };
    h.screen.onMouseDown(next.x, next.y); h.screen.onMouseUp(skip.x, skip.y);
    assert.equal(h.screen.phase, 'reading'); assert.equal(calls, 0);
    h.advance(15000);
    for (const point of [next, skip, { x: 512, y: 640 }]) {
        h.screen.onMouseMove(point.x, point.y); h.screen.onMouseDown(point.x, point.y); h.screen.onMouseUp(point.x, point.y);
    }
    assert.equal(h.screen.phase, 'reading'); assert.equal(calls, 0);
    h.screen.drawHUD();
    const hint = h.texts.find(text => text.text === 'Space / Enter to continue story');
    assert.ok(hint); assert.equal(hint.x, 640); assert.ok(hint.y < 689);
    assert.ok(!h.texts.some(text => /SKIP|CONTINUE|REVEAL TEXT/.test(text.text)));
});

test('ambient motion reuses paintings and the textured housing without growing the bounded canvas cache', async () => {
    const h = harness(); await h.reading(); h.advance(15000);
    assert.equal(h.paintings, 2); h.screen.drawHUD();
    h.c.Manager.Stack.requestPaintHUD = false;
    h.advance(10000); assert.equal(h.c.Manager.Stack.requestPaintHUD, true, 'ambient motion continues after the full caption');
    assert.equal(h.paintings, 2, 'motion never repaints the expensive architecture');
    const panel = h.screen._panel.surface, created = h.created.length;
    for (let i = 0; i < 20; i++) h.screen.drawHUD(); assert.equal(h.paintings, 2);
    assert.equal(h.created.length, created, 'the textured housing is cached');
    const cache = Array.from(h.screen._cache.values()), fleet = h.screen._arrivalFleet.slice(); h.screen.close();
    assert.equal(h.screen._cache.size, 0); assert.ok(cache.every(surface => surface.width === 0));
    assert.equal(panel.width, 0, 'closing also releases the caption texture');
    assert.ok(fleet.every(sprite => sprite.surface.width === 0), 'closing releases every cached ship');
    const afterClose = h.created.length; h.screen.drawHUD();
    assert.equal(h.created.length, afterClose, 'a departed screen cannot recreate its released art');
});

test('arrival ships descend from above, settle at their authored positions and remain still with reduced motion', async () => {
    const h = harness(); await h.reading(); const art = h.ip.PrologueArt;
    const expected = [[810, 207, 1.15], [355, 156, .24], [550, 244, .32], [1121, 288, .29], [1050, 96, .16]];
    const start = art.arrivalFleetPose(0), settled = art.arrivalFleetPose(6);
    assert.equal(start.length, 5);
    for (let i = 0; i < 5; i++) {
        assert.ok(start[i].y + h.screen._arrivalFleet[i].y + h.screen._arrivalFleet[i].h < 0, 'the whole ship begins above the screen');
        let previous = start[i].y;
        for (let t = .1; t <= 6; t += .1) {
            const current = art.arrivalFleetPose(t)[i];
            assert.ok(current.y >= previous && current.y <= settled[i].y, 'descent is smooth without bouncing or overshooting');
            assert.equal(current.x, expected[i][0]); assert.equal(current.scale, expected[i][2]); previous = current.y;
        }
        assert.deepEqual(plain(settled[i]), { x: expected[i][0], y: expected[i][1], scale: expected[i][2] });
    }
    assert.deepEqual(plain(art.arrivalFleetPose(100)), plain(settled), 'the entrance never loops');
    assert.deepEqual(plain(art.arrivalFleetPose(0, { reducedMotion: true })), plain(settled));
    const fleet = h.screen._arrivalFleet.slice(); h.advance(15000); h.screen.onKeyPressed('Enter'); h.advance(600);
    assert.equal(h.screen.index, 1); assert.equal(h.screen._arrivalFleet, null);
    assert.ok(fleet.every(sprite => sprite.surface.width === 0), 'ships are released after the first slide');
});

test('ambient motion is capped at 24 fps, suspends when hidden or covered, and honors reduced motion', async () => {
    const h = harness(); await h.reading(); h.advance(15000); const s = h.screen;
    let repaints = 0;
    for (let i = 0; i < 100; i++) {
        h.c.Manager.Stack.requestPaintHUD = false; h.advance(10);
        if (h.c.Manager.Stack.requestPaintHUD) repaints++;
    }
    assert.ok(repaints >= 23 && repaints <= 25, 'small effects request only 24 frames per second');
    const time = s.ambientTime;
    h.c.document.hidden = true; h.advance(5000); assert.equal(s.ambientTime, time);
    h.c.document.hidden = false; h.advance(100); assert.equal(s.ambientTime, time, 'resuming never catches up hidden wall time');
    h.frames.push({}); h.advance(5000); assert.equal(s.ambientTime, time); h.frames.pop(); h.advance(100);
    h.setFocused(false); h.advance(5000); assert.equal(s.ambientTime, time); h.setFocused(true); h.advance(100);
    s.reducedMotion = true; h.c.Manager.Stack.requestPaintHUD = false; h.advance(10000);
    assert.equal(s.ambientTime, time); assert.equal(h.c.Manager.Stack.requestPaintHUD, false);
    s.close(); h.advance(10000); assert.equal(s.ambientTime, time, 'closed scenes cannot leave an animation running');
});

test('each illustration has deterministic ambient motion and reduced motion holds the same pose', async () => {
    const h = harness(); await h.reading(); const ctx = h.c.Common.Platform.ctx;
    const sample = (index, time, reducedMotion = false) => {
        const marks = []; ctx.globalAlpha = 1;
        ctx.fillRect = (...args) => marks.push(args);
        h.ip.PrologueArt.paintAmbient(ctx, index, time, { reducedMotion });
        return marks;
    };
    for (let index = 0; index < 4; index++) {
        h.ip.PrologueArt.paint(ctx, index);
        const first = sample(index, 0), later = sample(index, 2);
        assert.ok(first.length > 20); assert.notDeepEqual(first, later, 'scene ' + (index + 1) + ' has motion');
        assert.deepEqual(sample(index, 2), later, 'the same time renders deterministically');
        assert.deepEqual(sample(index, 0, true), sample(index, 100, true), 'reduced motion never drifts');
    }
});

test('the caption housing fits the full text, stays steady while typing, and places the diamonds above it', async () => {
    const h = harness(); await h.reading(); const s = h.screen, ctx = h.c.Common.Platform.ctx;
    const initial = s._captionGeometry(ctx);
    h.advance(1000); assert.deepEqual(plain(s._captionGeometry(ctx)), plain(initial), 'typing never changes the wrap or height');
    assert.ok(initial.textY > initial.y && initial.promptY < initial.y + initial.h);
    assert.ok(initial.textY + (initial.rows.length - 1) * 30 + 11 < initial.promptY - 6, 'body and footer do not overlap');
    s.beats = [{ text: 'A short caption.' }, { text: 'A longer caption. '.repeat(24) }, {}, {}];
    s._layout = null; const short = s._captionGeometry(ctx);
    s.index = 1; const long = s._captionGeometry(ctx);
    assert.ok(long.h > short.h, 'longer captions expand the housing');
    assert.equal(long.y + long.h, short.y + short.h, 'the bottom anchor is consistent');
    const translations = [], rotations = [], fills = [];
    s._drawDiamonds({ save() {}, restore() {}, translate: (x, y) => translations.push({ x, y }),
        rotate: angle => rotations.push(angle), fillRect: (...args) => fills.push(args) }, long);
    assert.equal(fills.length, 4); assert.ok(rotations.every(angle => angle === Math.PI / 4));
    assert.ok(translations.every(point => point.x > long.x + long.w * .9 && point.y < long.textY - 11));
    assert.ok(fills[1][2] > fills[0][2], 'the current chapter diamond matches the larger in-game indicator');
});

test('a failed tutorial handoff leaves a readable retry action instead of a black dead end', async () => {
    const h = harness(); await h.reading(); let calls = 0;
    h.screen.onComplete = () => ++calls > 1;
    for (let i = 0; i < 4; i++) { h.advance(16000); h.screen.onKeyPressed('Enter'); h.advance(600); }
    assert.equal(h.screen.phase, 'error'); assert.match(h.screen.notice, /Space or Enter/);
    h.screen.drawHUD(); assert.ok(h.texts.some(text => text.text === 'Space / Enter to retry'));
    h.advance(400); h.screen.onKeyPressed('Enter'); assert.equal(calls, 2); assert.equal(h.screen.phase, 'leaving');
});

test('canonical lore survives JSON loading, and every floor has exactly one world-title briefing', () => {
    const h = harness(); h.load('modules/dialogue_manager.js');
    const dm = h.ip.DialogueManager;
    assert.equal(dm.loadDialogueLibrary(JSON.parse(fs.readFileSync(path.join(root, 'modules/dialogues.json'), 'utf8'))), true);
    for (let id = 3; id <= 18; id++) {
        const ids = dm.queueByTiming({ mapId: id, trigger: 'worldTitle.finished' }, 'after');
        assert.deepEqual(plain(ids), ['stage.' + id + '.intro']);
        assert.deepEqual(plain(dm.getSlides(ids[0])), plain(h.ip.StoryLore.floorDialogue(id).slides));
    }
    assert.deepEqual(plain(dm.getSlides('tutorial.intro')), plain(h.ip.StoryLore.dialogues['tutorial.intro'].slides));
    assert.match(dm.getTutorialSteps()[0].body, /infiltration/);
});

test('first gameplay context persists per Story, keeps spotlight indices intact and does not decorate optional replays', () => {
    const h = harness(); h.load('modules/dialogue_manager.js'); const dm = h.ip.DialogueManager;
    const definition = { title: 'WIRE PATCH', bindings: { gameplayId: 'ip_class_wires' },
        slides: [['Teaching controls.'], ['Next teaching step.']], hideQuestPanel: false };
    const id = 'stage1.ipwires.guided.welcome.test'; dm.registerDialogue(id, definition);
    assert.equal(dm.start(id), true);
    assert.equal(dm._active.slides.length, 2); assert.match(dm._active.slides[0][0], /APEX/);
    assert.deepEqual(plain(definition.slides), [['Teaching controls.'], ['Next teaching step.']]);
    assert.equal(h.game.ip2liveGameStates.gameplayLoreSeen.ip_class_wires, true);
    dm.stop(); dm.start(id); assert.deepEqual(plain(dm._active.slides), plain(definition.slides)); dm.stop();
    const saved = plain(h.game.ip2liveGameStates);
    for (const mode of ['PracticeMode', 'EndlessMode', 'PVPMode']) {
        h.ip[mode] = { active: true }; delete h.game.ip2liveGameStates.gameplayLoreSeen.ip_class_wires;
        dm.start(id); assert.deepEqual(plain(dm._active.slides), plain(definition.slides)); dm.stop();
        assert.equal(h.game.ip2liveGameStates.gameplayLoreSeen.ip_class_wires, undefined); h.ip[mode].active = false;
    }
    h.game.ip2liveGameStates = saved;
    const nextGame = h.c.Core.Game.current = { ip2liveGameStates: {} };
    dm.start(id); assert.match(dm._active.slides[0][0], /APEX/);
    assert.equal(nextGame.ip2liveGameStates.gameplayLoreSeen.ip_class_wires, true);
});
