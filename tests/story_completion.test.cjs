const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const copy = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function harness() {
    let now = Date.UTC(2026, 9, 12), titleCalls = 0;
    const storage = new Map(), profiles = new Map(), saves = [], drawn = [], downloads = [], songs = [], telemetry = [];
    const canvas = { width: 1920, height: 1080, toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' };
    const context2d = surface => new Proxy({ canvas: surface, fillText: value => drawn.push(value), measureText: value => ({ width: String(value).length * 9 }),
        createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o, key) => key in o ? o[key] : () => {} });
    const ctx = context2d(canvas), anchors = [];
    const document = { body: { appendChild() {} }, createElement(tag) {
        if (tag === 'a') { const anchor = { click() { downloads.push(this.download); }, remove() {} }; anchors.push(anchor); return anchor; }
        const surface = { width: 0, height: 0, toDataURL: canvas.toDataURL }; surface.getContext = () => context2d(surface); return surface;
    } };
    class Base { constructor() { this.initialize(); } initialize() {} close() {} }
    class MapScene extends Base { constructor() { super(); this.id = 18; this.loading = false; MapScene.current = this; } update() {} }
    const map = new MapScene();
    const stack = { content: [map], get top() { return this.content.at(-1); },
        push(scene) { this.content.push(scene); }, pop() { const s = this.content.pop(); if (s.close) s.close(); return s; },
        popAll() { while (this.content.length) this.pop(); }, pushTitleScreen() { titleCalls++; } };
    const game = { currentMapID: 18, infiltratorName: 'Zoë 王', _ip2liveProfileId: 'profile-one', _ip2liveStoryRunId: 'story-run-one', ip2liveGameStates: {} };
    const env = vm.createContext({ console: { log() {}, warn() {}, error() {} }, window: {}, document, Blob, atob, Uint8Array,
        Date: class extends Date { static now() { return now; } },
        setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        URL: { createObjectURL: () => 'blob:story', revokeObjectURL() {} },
        Common: { Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } }, Core: { Game: { current: game } },
        Data: { Systems: { saveSlots: 4, soundConfirmation: { playSound() {} } }, Keyboards: { checkActionMenu: k => k === 'Enter', checkCancelMenu: k => k === 'Escape' } },
        Scene: { Base, Map: MapScene }, Manager: { Stack: stack }, IP2Live: {},
    });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), env, { filename: file });
    load('modules/map_manager.js'); load('modules/game_manager.js');
    const ip = env.IP2Live, maps = ip.MapManager, gm = ip.GameManager;
    ip.QuestManager = { completedObjectives: {}, hideQuest() {} };
    for (const stage of maps.stages.filter(s => !s.tutorial)) ip.QuestManager.completedObjectives['stage.default_exit.' + stage.id] = { reach_stage_exit: true };
    gm.saveProgressToActiveSlot = async () => { saves.push(copy(game.ip2liveGameStates)); return { saved: true }; };
    ip.StoryAutosave = { checkpoint: async reason => { saves.push({ reason, ...copy(game.ip2liveGameStates) }); return { saved: true }; } };
    ip.DBManager = { getRecord: async (_, key) => profiles.get(key), saveRecord: async (store, value) => store === 'telemetry' ? telemetry.push(copy(value)) : profiles.set(value.infiltratorName, copy(value)),
        getAllRecords: async () => [...profiles.values()] };
    ip.MusicManager = { play: zone => songs.push(zone) };
    for(const file of ['modules/certificate_pdf.js','modules/story_completion.js','modules/story_certificate.js',
        'modules/story_lore.js','modules/screens/ar-diagnostic-rewind.js','modules/screens/story-prologue-art.js','modules/screens/story-prologue.js',
        'modules/screens/story-epilogue-art.js','modules/screens/story-epilogue.js','modules/screens/story-ending.js']) load(file);
    const tick=(ms,target=stack.top)=>{ while(ms>0) { const step=Math.min(100,ms); now+=step; target.update(); ms-=step; } };
    const finishEnding=ending=>{ tick(1400,ending); for(let i=0;i<4;i++) { tick(14000,ending); ending.onKeyPressed('Enter'); tick(700,ending); } };
    return { env, ip, maps, gm, game, map, stack, load, saves, profiles, storage, drawn, downloads, songs, telemetry,
        advance: ms => { now += ms; }, tick, finishEnding, titleCalls: () => titleCalls };
}

test('the final story exit creates one named award, saves it and plays the ending before completion', async () => {
    const h = harness();
    h.profiles.set(h.game.infiltratorName, { infiltratorName: h.game.infiltratorName, progressBySlot: { 2: { marker: 'preserve' } } });
    h.maps.goToNextStage(18);
    const ending = h.stack.top;
    assert.ok(ending instanceof h.ip.StoryEndingScreen); assert.equal(ending.phase, 'cutscene');
    await ending.load(); assert.deepEqual(h.songs, []);
    h.tick(1400); assert.deepEqual(h.songs, ['STORY_EPILOGUE'], 'epilogue score starts after the world fades to black');
    const record = h.game.ip2liveGameStates.storyCompletion;
    assert.equal(record.name, 'Zoë 王'); assert.equal(record.profileId, 'profile-one'); assert.equal(record.floors, 16);
    assert.ok(record.curriculum.gameplayCount > 0); assert.ok(record.curriculum.objectiveCount > 0);
    assert.equal(h.telemetry.filter(row => row.eventType === 'story_completed').length, 1);
    assert.equal(h.ip.StoryCompletion.start(h.maps.stageFor(18)), false, 'repeated final triggers do not stack endings');
    assert.equal(ending._actions().some(a => a.id === 'pdf'), false, 'the cutscene precedes the certificate screen');
    h.finishEnding(ending);
    assert.equal(ending.phase, 'complete');
    assert.deepEqual(h.songs, ['STORY_EPILOGUE', 'STORY_ENDING'], 'one uninterrupted slide score changes to victory only after the fourth chapter');
    ending._finishCutscene(); assert.equal(h.songs.length, 2, 'a repeated completion cannot restart victory music');
    assert.equal(ending.record.name, 'Zoë 王'); ending.drawHUD();
    assert.ok(h.drawn.includes('STORY COMPLETE'));
    assert.ok(h.drawn.includes(record.curriculum.floors+' FLOORS  /  '+record.curriculum.gameplayCount+' GAMEPLAY TYPES  /  '+record.curriculum.completedObjectives+' OBJECTIVES COMPLETED'));
    assert.ok(h.drawn.includes('Zoë 王'));
    await ending.saveTask;
    assert.ok(h.saves.every(s => s.storyCompletion.id === record.id));
    const profile = h.profiles.get(record.name);
    assert.equal(profile.progressBySlot[2].marker, 'preserve'); assert.equal(profile.storyCompletions.length, 1);
    assert.equal((await h.ip.StoryCompletion.list()).length, 1);
    h.advance(400); await ending._activate('menu'); h.tick(900,ending);
    assert.equal(h.titleCalls(), 1); assert.equal(h.ip.StoryCompletion.activeScene, null); assert.equal(h.maps._stageRouteLocked, false);
    assert.equal((await h.ip.StoryCompletion.list())[0].name, 'Zoë 王', 'returning to title retains the award');
});

test('unknown maps, unfinished routes, practice, PVP, tutorials and developer sessions cannot award completion', () => {
    const h = harness(), service = h.ip.StoryCompletion, stage = h.maps.stageFor(18);
    assert.equal(h.maps.goToNextStage(999), false); assert.equal(h.stack.top, h.map);
    h.game.currentMapID = 17; assert.equal(service.start(stage), false); h.game.currentMapID = 18;
    delete h.ip.QuestManager.completedObjectives['stage.default_exit.3']; assert.equal(service.start(stage), false);
    h.ip.QuestManager.completedObjectives['stage.default_exit.3'] = { reach_stage_exit: true };
    for (const key of ['PracticeMode', 'PVPMode']) {
        h.ip[key] = { active: true }; assert.equal(service.start(stage), false); h.ip[key].active = false;
    }
    h.ip.TutorialReplay = { session: {} }; assert.equal(service.start(stage), false); h.ip.TutorialReplay.session = null;
    h.ip.GameplayPause = { activeScreen: { options: { developerTest: true } } }; assert.equal(service.start(stage), false);
    h.ip.GameplayPause.activeScreen = null;
    assert.equal(service.canComplete(stage), true);
    assert.equal(h.game.ip2liveGameStates.storyCompletion, undefined);
});

test('completed saves reopen the final screen without changing the named run or awarding twice', async () => {
    const h = harness(); h.maps.goToNextStage(18); const first = h.stack.top;
    await first.saveTask; const record = copy(first.record); h.stack.pop();
    h.game.ip2liveGameStates.storyCompletion = record;
    assert.equal(h.ip.StoryCompletion.resumeIfCompleted(h.map), true);
    assert.equal(h.stack.top.phase, 'complete'); assert.equal(h.stack.top.record.completedAt, record.completedAt);
    await h.stack.top.load(); assert.deepEqual(h.songs, ['STORY_ENDING'], 'a completed save starts the victory theme directly');
    assert.equal(h.ip.StoryCompletion.resumeIfCompleted(h.map), false);
    await h.stack.top.saveTask; assert.equal((await h.ip.StoryCompletion.list()).length, 1);
    h.stack.pop(); h.game._ip2liveStoryRunId = 'another-story';
    assert.equal(h.ip.StoryCompletion.resumeIfCompleted(h.map), false, 'completion from a different run cannot leak into a new story');
});

test('a completed legacy route earns its award, and the real autosave captures completion while the ending covers the map', async () => {
    const h = harness();
    h.env.Common.Platform.registerSave = async () => {};
    h.env.Common.Platform.loadSave = async () => null;
    h.game.save = async function (slot) {
        await h.env.Common.Platform.registerSave(slot, '', { currentMapId: this.currentMapID, heroPosition: [0, 0, 0] });
    };
    h.ip.QuestManager.activeMapId = 18;
    h.load('modules/story_autosave.js');
    const autosave = h.ip.StoryAutosave;
    let committed;
    autosave._commit = async record => { committed = copy(record); };
    autosave.beginStory(h.game, { scene: h.map, preserveId: true, checkpoint: false });
    assert.equal(h.ip.StoryCompletion.resumeIfCompleted(h.map), true, 'an old completed route still gets the new ending');
    const ending = h.stack.top;
    assert.equal(ending.phase, 'cutscene');
    await settle(); autosave.tick(h.map); await settle();
    await ending.saveTask;
    assert.ok(committed, 'the overlay does not prevent a recovery save');
    assert.equal(committed.snapshot.gameStates.storyCompletion.name, 'Zoë 王');
    assert.equal(committed.snapshot.gameStates.storyCompletion.id, h.game._ip2liveStoryRunId);
    assert.equal(committed.snapshot.checkpointReason, 'story_completed');
    assert.equal(ending.saveResult.storySaved, true);
});

test('failed saves and archive storage leave the earned PDF available and report the archive failure', async () => {
    const h = harness();
    h.env.localStorage.setItem = () => { throw new Error('storage full'); };
    h.ip.DBManager.saveRecord = async () => { throw new Error('database unavailable'); };
    h.gm.saveProgressToActiveSlot = async () => { throw new Error('save failed'); };
    h.ip.StoryAutosave.checkpoint = async () => ({ saved: false, reason: 'storage-error' });
    h.maps.goToNextStage(18); const ending = h.stack.top;
    await ending.saveTask;
    assert.equal(ending.saveResult.archived, false); assert.equal(ending.saveResult.storySaved, false);
    ending._finishCutscene(); h.advance(400); ending.drawHUD();
    assert.ok(h.drawn.some(s => String(s).includes('archive could not be saved')));
    await ending._activate('pdf'); assert.equal(h.downloads.length, 1);
    await ending._activate('menu'); h.tick(900,ending); assert.equal(h.titleCalls(), 1, 'failed storage does not trap the player');
});

test('story certificates contain the saved Unicode name in a valid landscape PDF and download offline', async () => {
    const h = harness(); h.maps.goToNextStage(18); await h.stack.top.saveTask;
    const record = h.stack.top.record;
    assert.throws(() => h.ip.StoryCertificate.create({ ...record, status: 'playing' }), /Complete Story Mode/);
    const certificate = h.ip.StoryCertificate.create(record);
    assert.equal(certificate.blob.type, 'application/pdf');
    assert.match(certificate.filename, /^IP2Live_Story_Completion_.*\.pdf$/);
    const source = Buffer.from(await certificate.blob.arrayBuffer()).toString('latin1');
    assert.match(source, /^%PDF-1\.4/); assert.match(source, /\/MediaBox \[0 0 842 595\]/);
    assert.match(source, /\/Width 2526 \/Height 1785/);
    const xref = Number(/startxref\n(\d+)/.exec(source)[1]); assert.equal(source.slice(xref, xref + 4), 'xref');
    const unicode = 'FEFF' + Array.from(record.name + ' | ' + record.id).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    assert.ok(source.includes(unicode)); assert.ok(h.drawn.includes(record.name));
    assert.ok(h.drawn.includes('For successfully completing IP2Live Story Mode'));
    await h.ip.StoryCertificate.download(certificate); assert.equal(h.downloads[0], certificate.filename);
});

test('certificate names fit the reserved area at preview and PDF sizes without truncation or distortion', async () => {
    const h = harness(); h.maps.goToNextStage(18); await h.stack.top.saveTask;
    const names = ['NOVA', 'Alexandria Montgomery Wellington 王', 'W'.repeat(120) + ' Zoë 王'];
    for (const name of names) {
        const rendered = [];
        const makeCanvas = () => {
            const canvas = { width: 842, height: 595, toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' };
            const ctx = new Proxy({ canvas,
                measureText(text) {
                    const units = Array.from(String(text)).reduce((sum, c) => sum + (c === 'W' || c === '王' ? 1 : 0.55), 0);
                    return { width: units * parseFloat(this.font) };
                },
                fillText(text, x, y) {
                    if (text === name && y === 270) rendered.push({ text, x, size: parseFloat(this.font), width: this.measureText(text).width, align: this.textAlign });
                },
                createLinearGradient: () => ({ addColorStop() {} })
            }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
            canvas.getContext = () => ctx;
            return canvas;
        };
        h.env.document.createElement = makeCanvas;
        const record = { ...h.stack.top.record, name };
        h.ip.StoryCertificate.draw(makeCanvas().getContext('2d'), record);
        h.ip.StoryCertificate.create(record);
        assert.equal(rendered.length, 2, 'both preview and PDF render the complete name');
        for (const result of rendered) {
            assert.equal(result.text, name); assert.equal(result.x, 520); assert.equal(result.align, 'center');
            assert.ok(result.width <= 510.001, 'the actual font fits without relying on horizontal compression');
            assert.ok(result.size > 0 && result.size <= 34);
            assert.equal(result.size === 34, name === 'NOVA', 'short names retain their original size; long names shrink');
        }
    }
});

test('archive survives a fresh runtime and supports retrying a failed download', async () => {
    const h = harness(); h.maps.goToNextStage(18); await h.stack.top.saveTask;
    const name = h.stack.top.record.name;
    h.stack.popAll(); h.env.Core.Game.current = null;
    h.load('modules/story_completion.js'); // Lose all in-memory completion records.
    const archive = new h.ip.StoryEndingScreen(null, { archive: true }); h.stack.push(archive); await archive.load();
    assert.deepEqual(h.songs, [], 'browsing archived certificates keeps the existing menu music');
    assert.equal(archive.record.name, name); assert.equal(archive.phase, 'complete'); assert.equal(archive.records.length, 1);
    h.advance(400);
    const download = h.ip.StoryCertificate.download;
    h.ip.StoryCertificate.download = async () => { throw new Error('disk unavailable'); };
    await archive._activate('pdf'); assert.equal(archive.noticeError, true); assert.equal(archive.busy, false);
    h.ip.StoryCertificate.download = download;
    await archive._activate('pdf'); assert.equal(archive.noticeError, false); assert.equal(h.downloads.length, 1);
    await archive._activate('menu'); assert.equal(h.titleCalls(), 0, 'archive returns to its parent without replacing the title');
});

test('ending requires reading its four chapters, guards transition input and scales certificate mouse targets', async () => {
    const h = harness(); h.maps.goToNextStage(18); const ending = h.stack.top;
    await ending.load();
    ending.onKeyPressed('Escape'); assert.equal(ending.phase, 'cutscene');
    h.tick(1400); ending.onKeyPressed('Escape'); assert.equal(ending.phase, 'cutscene');
    ending.onKeyPressed('Enter'); assert.equal(ending.epilogue.index,0,'unread text cannot advance');
    h.finishEnding(ending); assert.equal(ending.phase,'complete');
    ending.onKeyPressed('Enter'); assert.equal(h.titleCalls(), 0, 'the final story press cannot also leave the completion screen');
    h.advance(400); await ending._activate('certificate'); h.advance(300);
    const pdf = ending._actions().find(action=>action.id==='pdf');
    ending.onMouseDown((pdf.x + 10) * 1.5, (pdf.y + 10) * 1.5);
    ending.onMouseUp(0, 0); await settle(); assert.equal(h.downloads.length, 0, 'dragging off a button does not activate it');
    ending.onMouseUp((pdf.x + 10) * 1.5, (pdf.y + 10) * 1.5); await settle();
    assert.equal(h.downloads.length, 1);
    await ending.saveTask;
});

test('completion offers three actions, saves progress again, and keeps failed saves retryable', async () => {
    const h=harness(); h.maps.goToNextStage(18); const ending=h.stack.top;
    await ending.load(); await ending.saveTask; ending._finishCutscene(); h.advance(400);
    assert.deepEqual(Array.from(ending._actions(),a=>a.id),['menu','save-story','certificate']);
    const initial=h.saves.length; await ending._activate('save-story');
    assert.ok(h.saves.length>initial); assert.equal(ending.noticeError,false); assert.match(ending.notice,/has been saved/);
    h.gm.saveProgressToActiveSlot=async()=>({saved:false}); h.ip.StoryAutosave.checkpoint=async()=>({saved:false});
    await ending._activate('save-story'); assert.equal(ending.noticeError,true); assert.equal(ending.busy,false);
    h.gm.saveProgressToActiveSlot=async()=>({saved:true});
    await ending._activate('save-story'); assert.equal(ending.noticeError,false);
    assert.equal((await h.ip.StoryCompletion.list()).length,1,'explicit saves do not award a second completion');
});

test('ending motion and typing freeze when hidden or covered, and closing releases its painting caches', async () => {
    const h=harness(); h.maps.goToNextStage(18); const ending=h.stack.top; await ending.load(); h.tick(2300);
    const epilogue=ending.epilogue, before=epilogue.ambientTime;
    h.env.document.hidden=true; h.tick(4000); assert.equal(epilogue.ambientTime,before);
    h.env.document.hidden=false; h.tick(100); assert.equal(epilogue.ambientTime,before);
    h.stack.push({}); h.tick(1000,ending); assert.equal(epilogue.ambientTime,before); h.stack.pop();
    h.tick(1000,ending); assert.ok(epilogue.ambientTime>before);
    h.stack.pop(); assert.equal(epilogue.closed,true); assert.equal(epilogue._cache.size,0);
    assert.equal(h.ip.StoryCompletion.activeScene,null);
});

test('certificate model reuses its texture sprites, reduced motion holds a pose, and close releases the textures', async () => {
    const h=harness(); h.maps.goToNextStage(18); const ending=h.stack.top; await ending.load();
    ending._finishCutscene(); h.tick(1000); ending.drawHUD();
    const faces=ending._modelFaces, surfaces=Object.values(faces).flatMap(face=>face.cells.map(cell=>cell.surface));
    assert.equal(surfaces.length,64);
    h.tick(1000); ending.drawHUD(); assert.equal(ending._modelFaces,faces);
    ending.reducedMotion=true; ending.drawHUD(); assert.equal(ending._modelFrame,0);
    h.tick(1000); ending.drawHUD(); assert.equal(ending._modelFrame,0);
    await ending._activate('certificate'); assert.equal(ending._certificateOpen,true);
    h.advance(300); await ending._activate('close-certificate'); assert.equal(ending._certificateOpen,false);
    h.stack.pop(); assert.ok(surfaces.every(surface=>surface.width===0 && surface.height===0));
});
