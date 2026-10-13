const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const files = [
    'gameplay1/IPWires/ip_wires_gameplay.js', 'gameplay2/IPPatchPanel/ip_patchpanel_gameplay.js',
    'gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js', 'gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js',
    'gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js', 'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js',
    'gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js',
];
const plain = value => JSON.parse(JSON.stringify(value));
function harness(earlyInitialize = true, developerUnlock = false) {
    let now = 100000;
    const rows = [], texts = [], storage = new Map(), songs = [], downloads = [];
    const paint = canvas => new Proxy({ canvas, measureText: text => ({ width: String(text).length * 9 }),
        fillText: (value, x, y) => texts.push({ value: String(value), x, y }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
        { get: (target, key) => key in target ? target[key] : () => {} });
    const canvas = { width: 1280, height: 720, toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' };
    const frames = [];
    const story = { currentMapID: 18, infiltratorName: 'STORY PLAYER', _ip2liveProfileId: 'story-profile', ip2liveGameStates: { untouched: true } };
    const c = vm.createContext({ console: { log() {}, warn() {} }, Math: Object.create(Math), Blob, Uint8Array, atob, TextEncoder, TextDecoder,
        Date: class extends Date { static now() { return now; } },
        setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; }, clearTimeout,
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        document: { hidden: false, hasFocus: () => true, createElement(tag) {
            assert.equal(tag, 'canvas'); const surface = { ...canvas }; surface.getContext = () => paint(surface); return surface;
        } }, window: {}, Common: { Platform: { ctx: paint(canvas) }, ScreenResolution: {
            SCREEN_X: 1280, SCREEN_Y: 720, CANVAS_WIDTH: 1280, CANVAS_HEIGHT: 720, getScreenX: x => x, getScreenY: y => y } },
        Core: { Game: { current: story } }, Data: { Systems: {}, Keyboards: { checkActionMenu: k => k === 'Enter', checkCancelMenu: k => k === 'Escape' } },
        Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {},
        Scene: { Base: class { constructor(initialize) { if (earlyInitialize && initialize) this.initialize?.(); } close() {} }, Map: { current: { id: 18 } } },
        Manager: { GL: {}, Stack: { get top() { return frames.at(-1); }, push: scene => frames.push(scene),
            pop() { const scene = frames.pop(); scene?.close?.(); return scene; }, replace: scene => { frames.pop(); frames.push(scene); } } },
        IP2Live: { QuestManager: { activeQuestId: 'story-quest', activeObjectiveId: 'story-objective', completedObjectives: { untouched: true } },
            QuestMinimap: { destroy() {}, create() {}, update() {}, isActive: () => false },
            MusicManager: { play: zone => songs.push(zone), playGameplay: id => songs.push(id), currentZone: () => 'MAIN_MENU',
                ZONE: { MAIN_MENU: 'MAIN_MENU', GAMEPLAY_1: 'GAMEPLAY_1', GAMEPLAY_2: 'GAMEPLAY_2', GAMEPLAY_56: 'GAMEPLAY_56' } },
            NeuralLifeForce: { isRunOver: () => true }, DialogueManager: { resetTransitionState() {}, isActive: () => false },
            GameplayPause: { clearSession() {}, closeMenu() { this.menuOpen = false; } },
        },
    });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    for (const file of ['modules/game_manager.js', 'modules/tutorial_replay.js', 'modules/feature_telemetry.js',
        'modules/endless_rules.js', 'modules/endless_mode.js', 'modules/certificate_pdf.js', 'modules/story_completion.js',
        'modules/story_certificate.js', 'modules/screens/story-ending.js', 'modules/screens/endless.js',
        'gameplay/common/gameplay_timer.js', 'gameplay/common/ip_class_ranges.js', 'gameplay/common/ip_cidr_tools.js',
        'gameplay/gameplay1/IPWires/ip_wires_core.js', ...files.map(file => 'gameplay/' + file)]) load(file);
    const ip = c.IP2Live, gm = ip.GameManager, mode = ip.EndlessMode, rules = ip.EndlessRules;
    gm.unlockPracticeAndEndlessForTesting = developerUnlock;
    ip.ReportManager = { logTelemetryRecord: async row => { rows.push(plain(row)); return true; } };
    gm.state = 'campaign-state';
    gm._logTelemetryEvent = () => assert.fail('Endless wrote campaign telemetry');
    gm._openReportAttempt = () => assert.fail('Endless opened campaign assessment');
    gm._ensureQuestMinimap = () => assert.fail('Endless changed campaign HUD');
    const player = { version: 1, mode: 'story', status: 'completed', id: 'earned-story', name: 'NOVA', profileId: 'nova-id', completedAt: 99999, finalMapId: 18 };
    storage.set('IP2Live.story-completions.v1', JSON.stringify([player]));
    const lobby = new ip.EndlessScreen(); frames.push(lobby); lobby.loading = false;
    const start = async (id = 'ip_class_wires') => {
        await lobby.load();
        const seed = Array.from({ length: 1000 }, (_, i) => i + 1).find(seed => rules.sequence(seed)[0].id === id);
        assert.ok(seed, 'first gameplay seed for ' + id);
        let calls = 0;
        c.Math.random = () => ++calls <= 2 ? seed / 0x100000000 : Math.random();
        assert.equal(await mode.start(player, lobby), true);
        assert.ok(ip.TutorialReplay.session?.screen, 'real manager pushed the gameplay');
        frames.at(-1).loading = false;
        return frames.at(-1);
    };
    const advance = (ms, update = true) => { now += ms; if (update) frames.at(-1)?.update?.(); };
    const complete = async (extra = {}) => {
        const replay = ip.TutorialReplay.session, screen = replay.screen;
        if (replay.gameplayId === 'ip_cidr_binary_panel') screen._saveCIDRState('/' + screen.targetCIDR);
        screen.options.onComplete({ correctDecisions: 10, totalDecisions: 10, activeElapsedMs: 1000, durationMethod: 'test-active-v1', ...extra });
        await Promise.resolve(); await Promise.resolve();
        if (ip.TutorialReplay.session?.screen) ip.TutorialReplay.session.screen.loading = false;
    };
    return { c, ip, mode, rules, gm, frames, rows, songs, storage, player, lobby, story, texts, downloads, load, start, advance, complete };
}

test('shuffled cycles cover all seven games and every 4 immediately follows its matching 3', () => {
    const h = harness();
    for (let seed = 0; seed < 100; seed++) for (let cycle = 0; cycle < 10; cycle++) {
        const games = h.rules.sequence(seed, cycle);
        assert.equal(new Set(games.map(g => g.id)).size, 7);
        const four = games.findIndex(g => g.number === '4'); assert.equal(games[four - 1].number, '3');
    }
    assert.notDeepEqual(plain(h.rules.sequence(1)), plain(h.rules.sequence(2)));
});

test('timers begin at 180, drop at five active minutes, and harder games lose time more gently', () => {
    const { rules } = harness();
    for (const game of rules.games) assert.equal(rules.budget(game.id, 299999), 180);
    for (const ms of [300000, 360000, 600000, 1200000]) {
        const easy = rules.budget('ip_class_wires', ms), hard = rules.budget('ip_subnet_simulator', ms);
        assert.ok(easy < hard); assert.ok(easy >= 1);
    }
    assert.equal(rules.budget('ip_class_wires', 300000), 165);
    assert.equal(rules.budget('ip_cidr_quarantine', 300000), 172);
    assert.equal(rules.budget('ip_cidr_quarantine_matrix', 360000), 164);
    for (const game of rules.games) assert.equal(rules.budget(game.id, 36000000), 1, 'no indefinite plateau');
    const score = (mistakes, elapsed) => rules.reward('ip_class_wires', { mistakeCount: mistakes }, elapsed, 180).points;
    assert.ok(score(0, 10000) > score(2, 10000)); assert.ok(score(0, 10000) > score(0, 170000));
});

test('Story completion is revalidated, player identity is explicit, and busy feature sessions cannot start', async () => {
    const h = harness();
    h.storage.clear();
    assert.equal(await h.mode.start(h.player, h.lobby), false);
    h.storage.set('IP2Live.story-completions.v1', JSON.stringify([h.player]));
    assert.equal(await h.mode.start({ ...h.player, name: 'OTHER PLAYER' }, h.lobby), false);
    h.ip.PracticeMode = { active: true }; assert.equal(await h.mode.start(h.player, h.lobby), false);
    h.ip.PracticeMode.active = false;
    await h.start();
    assert.equal(h.rows[0].profileId, h.player.profileId);
    assert.ok(h.rows.every(r => r.infiltratorName === 'NOVA'), 'never attributes completion to previous cached Story player');
    assert.equal(h.c.Core.Game.current, null);
    assert.equal(await h.mode.start(h.player, h.lobby), false);
});

test('developer unlock opens both menus and starts Endless on a fresh installation without earning Story completion', async () => {
    const h = harness(true, true); h.storage.clear(); h.c.Core.Game.current = null;
    h.load('modules/practice_mode.js');
    h.c.Scene.TitleScreen = class extends h.c.Scene.Base {}; h.load('modules/screens/main-menu.js');
    const title = Object.create(h.c.Scene.TitleScreen.prototype);
    title._hasStoryCertificate = false;
    assert.equal(title._lockedModeMessage('ENDLESS MODE'), '');
    assert.equal(title._lockedModeMessage('PRACTICE MODE'), '');
    await h.lobby.load();
    const player = h.lobby.players[0];
    assert.equal(player.name, 'DEVELOPER'); assert.equal(player.developerTest, true);
    h.lobby.drawHUD(); assert.ok(h.texts.some(t => t.value === 'DEVELOPER TEST / UNLOCKED'));
    h.gm.unlockPracticeAndEndlessForTesting = false;
    assert.equal((await h.mode.players()).length, 0);
    assert.match(title._lockedModeMessage('ENDLESS MODE'), /finish Story Mode/);
    assert.match(title._lockedModeMessage('PRACTICE MODE'), /tutorial in Story Mode/);
    assert.equal(await h.mode.start(player, h.lobby), false, 'stale developer eligibility cannot bypass a disabled flag');
    h.gm.unlockPracticeAndEndlessForTesting = true;
    assert.equal(await h.mode.start(player, h.lobby), true);
    assert.equal(h.mode.run.storyCompletionId, null); assert.equal(h.mode.run.developerTest, true);
    assert.ok(h.ip.TutorialReplay.session?.screen);
    h.ip.TutorialReplay.finishScreen(h.frames.at(-1));
    assert.equal((await h.ip.StoryCompletion.list()).length, 0);
    assert.equal(title._hasStoryCertificate, false);
    assert.equal(h.storage.has('ip2live.practice.unlocks.v1'), false);
    const knownPlayer = harness(true, true); knownPlayer.storage.clear();
    const known = (await knownPlayer.mode.players())[0];
    assert.equal(known.name, knownPlayer.story.infiltratorName);
    assert.equal(known.profileId, knownPlayer.story._ip2liveProfileId);
    const earned = harness(true, true);
    assert.deepEqual(plain(await earned.mode.players()), [earned.player], 'earned players retain their real certificates');
});

test('real gameplay managers launch all seven screens at 180 seconds and preserve the exact CIDR handoff', async () => {
    for (const early of [true, false]) {
        const h = harness(early); await h.start();
        const visited = new Set(); let mask;
        for (let i = 0; i < 7; i++) {
            const replay = h.ip.TutorialReplay.session, s = replay.screen;
            visited.add(replay.gameplayId);
            assert.equal(s.options.endlessMode, true); assert.equal(s.options.practiceMode, false);
            assert.equal(s._endlessClockOwned, true); assert.equal(h.mode.round.timeLimitSeconds, 180);
            assert.equal(s.solveTimeSeconds ?? s.durationSeconds ?? s.timeLimitSeconds, 180);
            s.drawHUD();
            if (h.mode.round.number === '3') mask = s.targetMask;
            if (h.mode.round.number === '4') { assert.equal(s.cidrState.mask, mask); assert.equal(s.cidrState.handoffKey, h.mode.handoffKey); }
            await h.complete();
        }
        assert.equal(visited.size, 7);
        assert.equal(h.mode.run.completedRounds, 7); assert.ok(h.mode.run.score > 0);
        assert.equal(h.rows.filter(r => r.eventType === 'feature_round_end').length, 7);
        assert.ok(h.rows.filter(r => r.eventType === 'feature_round_end').every(r => r.payload.result.endlessPoints > 0));
        h.ip.TutorialReplay.finishScreen(h.ip.TutorialReplay.session.screen);
        assert.equal(h.mode.active, false);
        assert.equal(h.c.Core.Game.current, h.story); assert.equal(h.gm.state, 'campaign-state');
        assert.deepEqual(plain(h.story.ip2liveGameStates), { untouched: true });
        assert.deepEqual(plain(h.ip.QuestManager.completedObjectives), { untouched: true });
    }
});

test('all seven real screens immediately end their run at zero without timeout animation or duplicate callbacks', async () => {
    for (const id of harness().rules.games.filter(g => g.number !== '4').map(g => g.id)) {
        const h = harness(); let s = await h.start(id);
        const expire = () => {
            h.mode.round.timeLimitSeconds = 1;
            if (s.phase) s.phase = id === 'ip_cidr_quarantine' ? 'classify' : id === 'ip_cidr_quarantine_matrix' ? 'think' : 'build';
            if (s.roundState) s.roundState = 'active';
            s.update(); h.advance(500); h.advance(500);
            assert.equal(h.mode.active, false, id + ' ends immediately at deadline');
            assert.equal(h.lobby.record.reason, 'time_expired'); assert.equal(h.frames.at(-1), h.lobby);
            assert.equal(h.ip.TutorialReplay.session, null); assert.equal(h.gm._activeGameplayNode, null);
            s.options.onFailed?.({ reason: 'stale' }); s.options.onComplete?.({});
            assert.equal(h.rows.filter(r => r.eventType === 'feature_session_end').length, 1);
            assert.equal(h.lobby.record.rounds.at(-1).points, 0);
        };
        if (id === 'ip_cidr_binary_panel') {
            await h.complete(); s = h.frames.at(-1);
            assert.equal(h.mode.round.number, '4');
            h.mode.round.timeLimitSeconds = 1; s.phase = 'build'; s.update(); h.advance(500); h.advance(500);
            assert.equal(h.mode.active, false, 'gameplay 4 immediate timeout');
            const second = harness(); s = await second.start(id);
            second.mode.round.timeLimitSeconds = 1; s.phase = 'build'; s.update(); second.advance(500); second.advance(500);
            assert.equal(second.mode.active, false, 'gameplay 3 immediate timeout');
        } else expire();
    }
});

test('pause, focus, overlays and automatic animations do not consume the run, retries do not refill it', async () => {
    const h = harness(); const s = await h.start(); s.update(); h.advance(200);
    assert.equal(h.mode.round.elapsedMs, 200);
    h.ip.GameplayPause.menuOpen = true; h.advance(500); h.advance(500);
    h.ip.GameplayPause.menuOpen = false; h.ip.GameplayTimer.forget(s); h.advance(100); h.advance(200);
    assert.equal(h.mode.round.elapsedMs, 400);
    h.c.document.hidden = true; h.advance(500); h.advance(500); h.c.document.hidden = false; h.advance(100); h.advance(200);
    assert.equal(h.mode.round.elapsedMs, 600);
    s.helpOpen = true; h.advance(500); s.helpOpen = false; h.advance(100); h.advance(200);
    assert.equal(h.mode.round.elapsedMs, 800);
    s.phase = 'success'; h.advance(500); h.advance(500); assert.equal(h.mode.round.elapsedMs, 800);
    s.phase = 'build'; h.advance(100); h.advance(200); assert.equal(h.mode.round.elapsedMs, 1000);
    h.advance(10000); assert.equal(h.mode.round.elapsedMs, 1000, 'suspension gap excluded');
    h.ip.TutorialReplay.finishScreen(s);
    assert.equal(h.lobby.record.reason, 'retired'); assert.equal(h.lobby.record.score, 0);
    assert.equal(h.lobby.record.activeElapsedMs, 1000);
});

test('results show a named, scored certificate, download offline, retain last run, and allow another run', async () => {
    const h = harness(); await h.start(); await h.complete();
    h.ip.TutorialReplay.finishScreen(h.ip.TutorialReplay.session.screen);
    h.lobby.drawHUD();
    const r = h.lobby.record, cert = h.ip.EndlessCertificate.create(r);
    assert.match(cert.filename, /IP2Live_Endless_NOVA_\d+_/);
    assert.match(await cert.blob.text(), /^%PDF-1\.4/);
    assert.ok(h.texts.some(t => t.value.includes('PARTICIPATION')));
    assert.ok(h.texts.some(t => t.value.includes(r.score + ' POINTS')));
    assert.equal(h.mode.lastResult(h.player).score, r.score);
    assert.throws(() => h.ip.EndlessCertificate.create({ ...r, score: -1 }));
    h.ip.EndlessCertificate.download = async c => h.downloads.push(c.filename);
    h.advance(400, false); await h.lobby._activate('pdf'); assert.equal(h.downloads.length, 1);
    await h.lobby._activate('again'); assert.equal(h.lobby.view, 'lobby');
    await h.lobby._activate('start'); assert.equal(h.mode.active, true);
});

test('durable telemetry exports Endless scores and survival separately from matched learning evidence', async () => {
    const h = harness(); await h.start(); await h.complete({ correctDecisions: 8, totalDecisions: 10 });
    h.ip.TutorialReplay.finishScreen(h.ip.TutorialReplay.session.screen);
    const end = h.rows.find(r => r.eventType === 'feature_session_end');
    assert.equal(end.payload.score, h.lobby.record.score); assert.equal(end.payload.completedRounds, 1);
    h.load('modules/report_learning_analytics.js'); h.load('modules/report_manager.js');
    const catalog = h.rules.games.map(g => ({ gameplayId: g.id, label: g.name }));
    const features = h.ip.ReportLearningAnalytics._featureActivity(h.rows, Object.fromEntries(catalog.map(g => [g.gameplayId, g])), []);
    assert.equal(features.endless.runs.length, 1); assert.equal(features.endless.bestScore, end.payload.score);
    assert.equal(features.endless.roundCount, 2); assert.equal(features.practice.roundCount, 0);
    assert.equal(features.endless.improvement.status, 'insufficient_data');
    const report = { learning: { features } }, rm = h.ip.ReportManager;
    const sheets = rm._featureWorkbookSheets(report);
    assert.equal(sheets.find(s => s.name === 'Endless Runs').rows[1][4], end.payload.score);
    assert.ok(sheets.find(s => s.name === 'Feature Rounds').rows[0].includes('Endless Round Points'));
    assert.match(JSON.stringify(rm._featureDashboardRows(report, v => v)), /Best score/);
});

test('real pause overlay resumes the same budget and Finish Run opens results without saving Story', async () => {
    const h = harness(); h.load('modules/screens/gameplay-pause.js');
    const s = await h.start(); s.update(); h.advance(250);
    const pause = h.ip.GameplayPause;
    assert.equal(pause.open(s, 'ip_class_wires'), true);
    const menu = h.frames.at(-1);
    assert.equal(menu.menuItems[2].title, 'FINISH RUN');
    h.advance(300); assert.equal(h.mode.run.activeElapsedMs, 250);
    h.c.Manager.Stack.pop(); pause.closeMenu(); h.advance(50); h.advance(250);
    assert.equal(h.mode.round.elapsedMs, 500, 'short pause never charges the hidden interval');
    assert.equal(pause.open(s, 'ip_class_wires'), true);
    const exit = await pause.exitQuest(s); assert.equal(exit.finished, true);
    assert.equal(h.frames.at(-1), h.lobby); assert.equal(h.lobby.record.reason, 'retired');
    assert.equal(h.c.Core.Game.current, h.story); assert.equal(pause.menuOpen, false);
    assert.deepEqual(plain(h.story.ip2liveGameStates), { untouched: true });
    const roundEnd = h.rows.find(r => r.eventType === 'feature_round_end');
    assert.equal(roundEnd.outcome, 'cancelled'); assert.equal(roundEnd.payload.result.timerElapsedMs, 500);
    assert.ok(roundEnd.activeDurationMs > 0, 'actual learning clock is attached before replay cleanup');
});

test('real CIDR retry retains time and mistake evidence; pressure applies on the next round only', async () => {
    const h = harness(); const s = await h.start('ip_cidr_binary_panel'); s.phase = 'build'; s.update(); h.advance(250);
    s._evaluateConfirmResult(); assert.equal(s.phase, 'fail'); assert.ok(s.decisionHistory.some(d => !d.correct));
    s._resolveFailureReset(); s.update();
    assert.equal(h.mode.round.elapsedMs, 250); assert.ok(s.solveTimerTicks < 180 * 60);
    h.mode.run.activeElapsedMs = 299750; h.advance(250);
    assert.equal(h.mode.run.activeElapsedMs, 300000); assert.equal(h.mode.round.timeLimitSeconds, 180);
    const result = { ...s._assessmentResult(), passed: true }; s._saveCIDRState('/' + s.targetCIDR);
    s.options.onComplete(result); await Promise.resolve(); await Promise.resolve();
    assert.equal(h.mode.round.number, '4'); assert.equal(h.mode.round.timeLimitSeconds, 172);
    assert.equal(h.mode.run.rounds[0].mistakes, 1);
    assert.ok(h.mode.run.rounds[0].points < h.rules.reward('ip_cidr_binary_panel', { mistakeCount: 0 }, 500, 180).points);
});

test('Endless PDF shrinks very long Unicode names uniformly and keeps the score and participation labels', async () => {
    const h = harness(); const name = 'W'.repeat(120) + ' Zoë 王'; const sizes = [], labels = [];
    h.c.document.createElement = () => {
        const canvas = { width: 842, height: 595, toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' };
        const ctx = new Proxy({ canvas, measureText(value) { return { width: String(value).length * parseFloat(this.font) * 0.8 }; },
            fillText(value, x, y) { labels.push(value); if (value === name) sizes.push({ size: parseFloat(this.font), width: this.measureText(value).width, x, y }); },
            createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => k in o ? o[k] : () => {} });
        canvas.getContext = () => ctx; return canvas;
    };
    const r = { version: 1, id: 'endless-long-name', mode: 'endless', status: 'finished', name, score: 1234567, completedRounds: 234, completedAt: 123456 };
    const certificate = h.ip.EndlessCertificate.create(r);
    assert.equal(sizes.length, 1); assert.ok(sizes[0].size < 34); assert.ok(sizes[0].width <= 510.001);
    assert.ok(labels.includes('1,234,567 POINTS  /  234 GAMEPLAYS SOLVED')); assert.ok(labels.includes('O F   P A R T I C I P A T I O N'));
    const pdf = await certificate.blob.text(); assert.match(pdf, /\/MediaBox \[0 0 842 595\]/);
    assert.match(pdf, /\/Width 2526 \/Height 1785/);
});

test('the real main menu unlocks Endless from earned Story records and opens its lobby', async () => {
    const h = harness(); h.c.Scene.TitleScreen = class extends h.c.Scene.Base {};
    h.c.Data.Systems.soundConfirmation = { playSound() {} }; h.load('modules/screens/main-menu.js');
    const title = Object.create(h.c.Scene.TitleScreen.prototype);
    title.menuPage = 'play'; title.menuItems = ['ENDLESS MODE']; title.selectedIndex = 0;
    title._hasStoryCertificate = false;
    assert.match(title._lockedModeMessage('ENDLESS MODE'), /finish Story Mode/);
    title._confirmSelection(); assert.ok(title._lockedModeAlert);
    await title._refreshCertificates(); assert.equal(title._lockedModeMessage('ENDLESS MODE'), '');
    let opened;
    title._openMenu = factory => { opened = factory(); };
    title._confirmSelection(); assert.ok(opened instanceof h.ip.EndlessScreen);
});

test('CRT transitions cover launch and round changes without spending time or inserting another page', async () => {
    const h = harness(); h.load('modules/screens/menu-transition.js'); await h.lobby.load();
    const seed = Array.from({ length: 1000 }, (_, i) => i + 1).find(seed => {
        const games = h.rules.sequence(seed); return games[0].number === '1' && games[1].number === '2';
    });
    let randomCalls = 0; h.c.Math.random = () => ++randomCalls <= 2 ? seed / 0x100000000 : Math.random();
    assert.equal(await h.mode.start(h.player, h.lobby), true);
    const reveal = () => {
        const t = h.frames.at(-1); assert.equal(t, h.ip.MenuTransition.active);
        h.advance(520); assert.equal(t.phase, 'hold'); t.drawHUD(); t.update();
        const replay = h.ip.TutorialReplay.session; assert.ok(replay?.screen); replay.screen.loading = false;
        const update = replay.screen.update; let hiddenUpdates = 0;
        replay.screen.update = function () { hiddenUpdates++; return update.apply(this, arguments); };
        h.advance(100); assert.equal(t.phase, 'in'); h.advance(460);
        assert.equal(hiddenUpdates, 0, 'moving packets and combat stay frozen until fully visible');
        assert.equal(h.ip.MenuTransition.active, null); assert.equal(h.frames.at(-1), replay.screen);
        assert.equal(h.mode.round.elapsedMs, 0, 'hidden updates during reveal do not consume time');
        replay.screen.update(); h.advance(250); assert.equal(h.mode.round.elapsedMs, 250);
    };
    reveal(); await h.complete(); assert.equal(h.mode.run.completedRounds, 1);
    reveal(); assert.equal(h.mode.run.activeElapsedMs, 500);
    assert.equal(h.frames.length, 2, 'only the Endless lobby and current puzzle remain');
});

test('focus loss freezes real packet movement and neither clock charges the resume interval', async () => {
    const h = harness(); h.load('modules/screens/gameplay-pause.js');
    const s = await h.start('ip_patch_panel_classes'); s.update(); h.advance(250);
    const snapshot = { animation: s.animTick, run: h.mode.round.elapsedMs, learning: s.learningTelemetryClock.activeElapsedMs };
    h.c.document.hasFocus = () => false; h.advance(250); h.advance(250);
    assert.equal(s.animTick, snapshot.animation, 'unfocused game cannot move its packets or animations');
    h.c.document.hasFocus = () => true; h.advance(250);
    assert.equal(h.mode.round.elapsedMs, snapshot.run); assert.equal(s.learningTelemetryClock.activeElapsedMs, snapshot.learning);
    h.advance(250); assert.equal(h.mode.round.elapsedMs, snapshot.run + 250);
    assert.equal(s.learningTelemetryClock.activeElapsedMs, snapshot.learning + 250);
});
