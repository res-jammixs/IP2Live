const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../Plugins/IP2Live_Core');
const gameplays = [
    'gameplay1/IPWires/ip_wires_gameplay',
    'gameplay2/IPPatchPanel/ip_patchpanel_gameplay',
    'gameplay3/CIDRPanel/ip_cidrpanel_gameplay',
    'gameplay4/SubnetSimulator/ip_subnetsim_gameplay',
    'gameplay4_5/HostPowerReactor/ip_host_power_gameplay',
    'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay',
    'gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay',
    'gameplay7/NetworkRepair/gameplay',
    'gameplay8/VLSMAllocator/ip_vlsm_allocator_gameplay',
    'gameplay1/IPWires/ip_wires_gameplay_harder',
    'gameplay3/CIDRPanel/ip_cidrpanel_gameplay_harder',
];

function harness() {
    let now = 100000;
    const texts = [], frames = [], warnings = [];
    function canvas(width = 1280, height = 720) {
        const canvas = { width, height };
        const ctx = new Proxy({ canvas,
            fillText: value => texts.push(String(value)), measureText: value => ({ width: String(value).length * 7 }),
            createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
            getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }) },
            { get: (target, key) => key in target ? target[key] : () => {} });
        canvas.getContext = () => ctx; return canvas;
    }
    const ctx = canvas().getContext('2d');
    const c = {
        console: { log() {}, warn: (...args) => warnings.push(args) }, window: {},
        Date: class extends Date { static now() { return now; } }, Math, setTimeout, clearTimeout,
        document: { hidden: false, hasFocus: () => true, createElement: () => canvas() },
        Common: { Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        Core: { Game: { current: { currentMapID: 18, ip2liveGameStates: { sentinel: true } } } },
        Data: { Systems: {}, Keyboards: { checkCancelMenu: key => key === 'Escape', checkActionMenu: key => key === 'Enter', menuControls: {} } },
        Manager: { GL: {}, Stack: { get top() { return frames.at(-1); }, push: screen => frames.push(screen),
            pop: () => { const screen = frames.pop(); if (screen && screen.close) screen.close(); return screen; }, replace: screen => { frames.pop(); frames.push(screen); } } },
        Scene: { Base: class { constructor(initialize) { if (initialize && this.initialize) this.initialize(); } },
            Map: class { drawHUD() {} onMouseUp() { return false; } onMouseDown() { return false; } } },
        IP2Live: { Assets: { oxaniumMediumLoaded: true, nebulaLoaded: true },
            CIDRGameplayState: { campaign: 'preserve' },
            DialogueManager: { isActive: () => false }, QuestManager: { completedObjectives: { campaign: true } },
            QuestMinimap: { destroy() {}, update() {} } },
        Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {},
    };
    vm.createContext(c);
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    for (const file of ['modules/game_manager.js', 'gameplay/common/ip_class_ranges.js', 'gameplay/common/ip_cidr_tools.js',
        'gameplay/common/gameplay_timer.js', 'gameplay/common/gameplay_completion_popup.js',
        'gameplay/gameplay1/IPWires/ip_wires_core.js', ...gameplays.map(file => 'gameplay/' + file + '.js'),
        'gameplay/gameplay4_5/HostPowerReactor/ip_host_power_tool.js', 'gameplay/common/windowed_gameplay.js',
        ...gameplays.map(file => 'gameplay/' + file + '_windowed_version.js'), 'gameplay/combined/combined_art.js', 'gameplay/combined/combined_gameplay.js',
        'modules/screens/gameplay-pause.js']) load(file);
    const map = c.Scene.Map.current = new c.Scene.Map(); map.id = 18; frames.push(map);
    const ip = c.IP2Live, service = ip.CombinedGameplay;
    function launch() { assert.equal(service.launch(), true); return service.desktop; }
    async function open(desktop, index) {
        const win = desktop.openTool(index);
        for (let i = 0; i < 12; i++) await Promise.resolve();
        assert.equal(win.status, 'ready', win.definition.id + ': ' + warnings.map(w => w.join(' ')).join('\n'));
        return win;
    }
    return { c, ctx, ip, service, launch, open, frames, map, texts, warnings, load, advance: ms => { now += ms; } };
}

test('all stage floors have a toggle; only Stage 4 Level 4 shows the toolkit, with launch guards', () => {
    const h = harness(), gm = h.ip.GameManager;
    let renderedCases = 0;
    const drawCase = h.ip.CombinedArtwork.toolbox;
    h.ip.CombinedArtwork.toolbox = function (...args) { renderedCases++; return drawCase.apply(this, args); };
    const maps = Object.values(gm.flowConfig.maps).filter(map => map.stage);
    assert.equal(maps.length, 16);
    for (const map of maps) assert.equal(h.service.isEnabled(map.id), map.stage === 4 && map.level === 4);
    h.ip.DialogueManager.isActive = () => true;
    assert.equal(h.service.launch(), false);
    h.ip.DialogueManager.isActive = () => false;
    gm._activeGameplayNode = 'campaign'; assert.equal(h.service.launch(), false); gm._activeGameplayNode = null;
    h.c.Core.Game.current.currentMapID = 17; h.map.id = 17; h.map.drawHUD();
    assert.equal(renderedCases, 0);
    assert.equal(h.service.launch(), false);
    h.c.Core.Game.current.currentMapID = 18; h.map.id = 18; h.map.drawHUD();
    assert.ok(renderedCases > 0);
    assert.ok(!h.texts.includes('Tools'), 'the equipment icon has no text label');
    const rect = h.service.toolRect(h.ctx);
    assert.ok(rect.y > 88 + 126 + 8 + 72, 'toolkit is below the distance bar');
    assert.equal(h.map.onMouseUp(rect.x + 10, rect.y + 10), true);
    assert.equal(h.frames.length, 2);
});

test('all 11 real windowed gameplays load, render and update without changing campaign state or stack', async () => {
    const h = harness(), desktop = h.launch(), game = h.c.Core.Game.current;
    const cidr = h.ip.CIDRGameplayState, quests = JSON.stringify(h.ip.QuestManager);
    const stack = { push: h.c.Manager.Stack.push, pop: h.c.Manager.Stack.pop, replace: h.c.Manager.Stack.replace };
    h.ip.VLSMAllocatorGameplayManager._state = { campaign: true };
    const allocatorState = h.ip.VLSMAllocatorGameplayManager._state;
    assert.equal(h.ip.WindowedGameplay.definitions.length, 11);
    for (let i = 0; i < 11; i++) {
        const win = await h.open(desktop, i);
        desktop.drawHUD();
        h.advance(16); desktop.update();
        win.run(() => h.ip.GameManager.handleGameplayMistake(win.definition.id, { mistakes: [{}] }));
        assert.equal(h.c.Core.Game.current, game);
        assert.equal(h.ip.CIDRGameplayState, cidr);
        assert.equal(h.c.Common.Platform.ctx, h.ctx);
        assert.equal(h.ip.GameplayPause.activeScreen, null);
        assert.equal(h.frames.at(-1), desktop);
        assert.equal(h.ip.GameplayPause._canRetainSession(win.screen.options), false);
    }
    assert.equal(h.ip.VLSMAllocatorGameplayManager._state, allocatorState);
    assert.equal(game.currentMapID, 18);
    assert.equal(game.ip2liveGameStates.sentinel, true);
    assert.ok(game.ip2liveGameStates.combinedGameplayFloors[18], 'tool state is retained in its own save namespace');
    assert.equal(JSON.stringify(h.ip.QuestManager), quests);
    for (const [key, method] of Object.entries(stack)) assert.equal(h.c.Manager.Stack[key], method);
    assert.equal(h.warnings.length, 0);
    assert.equal(desktop.windows.length, 11);
    const win = desktop.focused;
    assert.throws(() => win.run(() => { throw new Error('context test'); }), /context test/);
    assert.equal(h.c.Core.Game.current, game, 'exception restores campaign context');
    assert.equal(h.c.Common.Platform.ctx, h.ctx);
});

test('windows keep a 16:9 content ratio, clamp dragging and resize, and translate captured input', async () => {
    const h = harness(), desktop = h.launch(), win = await h.open(desktop, 0);
    desktop.drawHUD();
    const original = { x: win.x, y: win.y };
    desktop.onMouseDown(win.x + 100, win.y + 10);
    desktop.onMouseMove(win.x + 200, win.y + 50);
    desktop.onMouseUp(win.x + 200, win.y + 50);
    assert.notEqual(win.x, original.x); assert.notEqual(win.y, original.y);
    desktop.onMouseDown(win.x + 100, win.y + 10); desktop.onMouseMove(-10000, -10000); desktop.onMouseUp(-10000, -10000);
    assert.ok(win.x >= 0 && win.y >= 0);
    for (const [width, height] of [[1280, 720], [800, 480], [1920, 1080], [1024, 768]]) {
        h.ctx.canvas.width = width; h.ctx.canvas.height = height; desktop.drawHUD();
        assert.ok(Math.abs(win.bounds.body.w / win.bounds.body.h - 16 / 9) < 1e-9);
        assert.ok(win.x + win.bounds.w <= width && win.y + win.bounds.h <= height);
    }
    const events = [];
    win.screen.onMouseDown = (x, y) => events.push(['down', x, y]);
    win.screen.onMouseMove = (x, y) => events.push(['move', x, y]);
    win.screen.onMouseUp = (x, y) => events.push(['up', x, y]);
    const body = win.bounds.body;
    desktop.onMouseDown(body.x + body.w / 2, body.y + body.h / 2);
    assert.equal(events[0][0], 'down');
    assert.ok(Math.abs(events[0][1] - 640) < 1e-9 && Math.abs(events[0][2] - 360) < 1e-9);
    desktop.onMouseMove(-30, -40); desktop.onMouseUp(-30, -40);
    assert.equal(events.at(-1)[0], 'up', 'release outside window still reaches the captured puzzle');
    assert.equal(win.pointerCaptured, false);
});

test('smaller windows minimize to clickable bottom tabs; hidden timers continue and closing discards the tool', async () => {
    const h = harness(), desktop = h.launch(), first = await h.open(desktop, 2);
    desktop.drawHUD(); desktop.update(); h.advance(200); desktop.update();
    assert.ok(first.screen.solveTimerTicks < first.screen.solveTimerMaxTicks);
    const second = await h.open(desktop, 3), firstTicks = first.screen.solveTimerTicks;
    h.advance(200); desktop.update(); assert.ok(first.screen.solveTimerTicks < firstTicks, 'unfocused timers keep running');
    desktop.minimize(second); const secondTicks = second.screen.solveTimerTicks;
    h.advance(200); desktop.update(); assert.ok(second.screen.solveTimerTicks < secondTicks);
    assert.equal(desktop.openTool(2), first);
    assert.equal(desktop.windows.length, 2);
    assert.ok(first.bounds.body.w <= 800, 'window is smaller than the previous 1000px version');
    desktop.minimize(first);
    assert.equal(h.frames.at(-1), h.map, 'minimizing all windows returns control to the world');
    const before = first.screen.solveTimerTicks;
    h.advance(200); h.map.update(); assert.ok(first.screen.solveTimerTicks < before, 'minimized timers run from the world scene');
    h.map.drawHUD();
    const tab = h.service.dockLayout(h.ctx).tabs.find(tab => tab.win === first);
    assert.ok(tab.y > h.ctx.canvas.height * .8);
    assert.equal(h.map.onMouseUp(tab.x + 50, tab.y + 20), true);
    assert.equal(h.service.desktop.focused, first);
    assert.equal(first.minimized, false);
    const close = first.bounds.close;
    desktop.onMouseUp(close.x + close.w / 2, close.y + close.h / 2);
    assert.equal(first.disposed, true);
    assert.equal(desktop.windows.length, 1);
    assert.equal(h.frames.length, 1);
    const reopened = h.launch();
    assert.equal(reopened.openTool(3), second, 'tool state survives closing the toolkit');
    reopened.minimize(second);
    const lastTab = h.service.dockLayout(h.ctx).tabs[0];
    h.map.onMouseUp(lastTab.close.x + 2, lastTab.close.y + 2);
    assert.equal(second.disposed, true);
    assert.equal(h.service.session.windows.length, 0, 'closing a bottom tab removes its state and timer');
});

test('pending badges update and consume successes once; failures and dismissal leave campaign quests alone', async () => {
    const h = harness(), desktop = h.launch(), id = h.ip.WindowedGameplay.definitions[0].id;
    h.service.setPendingCounts({ [id]: 3, ip_cidr_binary_panel: 120 });
    desktop.drawHUD(); assert.ok(h.texts.includes('3')); assert.ok(h.texts.includes('99+'));
    assert.equal(h.service.setPendingCount(id, -1), false);
    assert.equal(h.service.setPendingCount('unknown', 4), false);
    const win = await h.open(desktop, 0);
    win.run(() => { win.screen.options.onComplete({ passed: true }); win.screen.options.onComplete({ passed: true }); });
    assert.equal(h.service.getPendingCount(id), 2);
    assert.equal(h.service.session.results.length, 1);
    const failed = await h.open(desktop, 2); failed.run(() => failed.screen.options.onFailed({ passed: false }));
    assert.equal(h.service.getPendingCount('ip_cidr_binary_panel'), 120);
    assert.deepEqual(h.ip.QuestManager.completedObjectives, { campaign: true });
    desktop.minimize(failed); desktop.dismiss();
    assert.equal(h.service.desktop, null);
    h.c.Core.Game.current = { currentMapID: 18 };
    h.service.ensureSession();
    assert.equal(h.service.getPendingCount(id), 0, 'a new campaign cannot inherit testing badges');
    assert.equal(h.service.session.windows.length, 0);
});

test('native calculator overlays stay within each window and never pop the world stack', async () => {
    const h = harness(), desktop = h.launch(), win = await h.open(desktop, 6);
    win.run(() => assert.equal(win.screen._openCalculator(), true));
    assert.equal(win.overlays.length, 1);
    assert.equal(h.frames.at(-1), desktop);
    desktop.drawHUD();
    desktop.onKeyPressed('Escape');
    assert.equal(win.overlays.length, 0);
    assert.equal(win.screen.calculatorOpen, false);
    assert.equal(h.frames.at(-1), desktop);
    assert.equal(h.ip.HostPowerToolManager._active, false);
});

test('the production loader includes every windowed adapter after the shared host', () => {
    const source = fs.readFileSync(path.join(root, 'code.js'), 'utf8');
    for (const file of gameplays) assert.ok(source.includes("'" + file + "_windowed_version.js'"), file);
    assert.ok(source.indexOf("'windowed_gameplay.js'") < source.indexOf("'combined/combined_gameplay.js'"));
});

test('all 11 windowed puzzles round-trip through the shared Story snapshot with their budgets and state intact', async () => {
    const h = harness(), desktop = h.launch(), game = h.c.Core.Game.current;
    game.infiltratorName = 'NOVA'; game.profileId = 'combined-profile'; game._ip2liveStoryRunId = 'combined-story';
    game.hero = { position: { x: 6, y: 0, z: 17 } };
    h.ip.QuestManager.activeMapId = 18;
    const expected = [];
    for (let index = 0; index < 11; index++) {
        const win = await h.open(desktop, index);
        win.screen.animTick = 70 + index;
        win.x = 80 + index; win.y = 40 + index;
        expected.push(win.snapshot());
    }
    h.service.setPendingCounts({ ip_class_wires: 3, ip_vlsm_allocator: 2 });
    const snapshot = h.ip.GameManager.buildStoryProgressSnapshot(game, { slot: 1, checkpointReason: 'manual_save' });
    assert.equal(snapshot.gameStates.combinedGameplayFloors[18].windows.length, 11);
    const loaded = h.c.Core.Game.current = { currentMapID: 18, infiltratorName: 'NOVA', profileId: 'combined-profile', hero: { position: { x: 0, y: 0, z: 0 } } };
    h.advance(3600000);
    h.ip.GameManager.restoreProgressFromSnapshot(JSON.parse(JSON.stringify(snapshot)), loaded, 1);
    const session = h.service.ensureSession();
    for (let i = 0; i < 24; i++) await Promise.resolve();
    assert.equal(session.windows.length, 11);
    assert.equal(h.service.getPendingCount('ip_class_wires'), 3);
    assert.equal(h.service.getPendingCount('ip_vlsm_allocator'), 2);
    for (let index = 0; index < 11; index++) {
        const win = session.windows[index], saved = expected[index];
        assert.equal(win.status, 'ready', win.definition.id);
        assert.equal(win.minimized, true, 'loaded tools return as bottom tabs');
        assert.equal(win.screen.animTick, 70 + index);
        assert.equal(win.x, 80 + index);
        assert.equal(win.y, 40 + index);
        for (const key of ['problem', 'scenario', 'leftItems', 'targetMask', 'selectedPrefix', 'solveTimerTicks', 'roundRemainingMs', 'questElapsedMs']) {
            if (saved.state[key] !== undefined) assert.equal(JSON.stringify(win.screen[key]), JSON.stringify(saved.state[key]), win.definition.id + '.' + key);
        }
        if (saved.state.state) assert.equal(JSON.stringify(win.screen.state.allocations), JSON.stringify(saved.state.state.allocations));
        if ('tools' in win.screen) assert.equal(win.screen.tools, h.ip.CIDRTools, 'restore reconnects the live formula helpers');
        win.paint();
        win.update(false);
    }
    assert.equal(h.ip.CIDRGameplayState.campaign, 'preserve');
    assert.equal(h.warnings.length, 0);
});

test('Stage 4 levels 1–4 retain separate tool floors in manual and transactional autosave payloads', async () => {
    const h = harness(), gm = h.ip.GameManager, game = h.c.Core.Game.current;
    game.infiltratorName = 'NOVA'; game.profileId = 'stage-four'; game._ip2liveStoryRunId = 'stage-four-story';
    game.hero = { position: { x: 6, y: 0, z: 17 } };
    game.playTime = { time: 8000 };
    const disk = new Map(), autosaves = [];
    const clone = value => JSON.parse(JSON.stringify(value));
    h.c.Common.Platform.registerSave = async (slot, unused, payload) => disk.set(slot, clone(payload));
    h.c.Common.Platform.loadSave = async slot => clone(disk.get(slot) || null);
    game.save = async function (slot) {
        await h.c.Common.Platform.registerSave(slot, '', { currentMapId: this.currentMapID, heroPosition: [6, 0, 17] });
    };
    h.ip.DBManager = { initDB: async () => ({ transaction() {
        const tx = { objectStore: () => ({ put(record) { Promise.resolve().then(() => { autosaves.push(clone(record)); tx.oncomplete(); }); } }) };
        return tx;
    } }) };
    h.load('modules/story_persistence.js'); h.load('modules/story_autosave.js');
    const autosave = h.ip.StoryAutosave;
    autosave.beginStory(game, { checkpoint: false, preserveId: true, scene: h.map });
    for (const mapId of [15, 16, 17, 18]) {
        // Other floor toggles stay off in production; enable them only in this test.
        gm.flowConfig.maps[mapId].combinedGameplayEnabled = true;
        game.currentMapID = h.map.id = h.ip.QuestManager.activeMapId = mapId;
        autosave._destination = mapId;
        const desktop = h.launch(), win = await h.open(desktop, 2);
        win.screen.solveTimerTicks = (40 + mapId) * 60;
        win.screen.cidrInput = String(mapId);
        desktop.minimize(win);
        const snapshot = gm.buildStoryProgressSnapshot(game, { slot: mapId - 14, checkpointReason: 'manual_save' });
        h.ip.StoryPersistence.prepareSave(mapId - 14, snapshot, game);
        await game.save(mapId - 14);
        assert.equal(disk.get(mapId - 14)._ip2liveProgress.gameStates.combinedGameplayFloors[mapId].windows[0].state.cidrInput, String(mapId));
        const pending = autosave.checkpoint('combined_stage_four'); autosave.tick(h.map);
        assert.equal((await pending).saved, true);
        const record = autosaves.at(-1);
        assert.equal(record.snapshot.mapId, mapId);
        for (let floor = 15; floor <= mapId; floor++) {
            const saved = record.snapshot.gameStates.combinedGameplayFloors[floor];
            assert.equal(saved.windows[0].state.cidrInput, String(floor));
            assert.equal(saved.windows[0].state.solveTimerTicks, (40 + floor) * 60);
        }
        // The Combined overlay itself must remain eligible for periodic autosaves.
        h.service.launch();
        assert.equal(autosave._periodicReady(h.map), true);
        h.service.desktop.returnToWorld();
    }
    assert.equal(Object.keys(game.ip2liveGameStates.combinedGameplayFloors).length, 4);
});

test('regular Stage 4 Network Repair and VLSM terminals retain their puzzle state through Story saves', () => {
    const h = harness(), gm = h.ip.GameManager, pause = h.ip.GameplayPause;
    const game = h.c.Core.Game.current;
    game.infiltratorName = 'NOVA'; game.profileId = 'normal-stage-four';
    game.hero = { position: { x: 6, y: 0, z: 17 } };
    for (const [mapId, name, id] of [[15, 'NetworkRepairGameplayScreen', 'ip_network_repair'], [16, 'NetworkRepairGameplayScreen', 'ip_network_repair'], [17, 'VLSMAllocatorGameplayScreen', 'ip_vlsm_allocator']]) {
        game.currentMapID = h.map.id = mapId;
        const options = { gameplayId: id, mapId, questId: 'stage-four.' + mapId, objectiveId: 'repair', spec: { terminalType: 'branch', branchId: 'hq' } };
        const screen = new h.ip[name](options);
        screen.loading = false;
        if (id === 'ip_network_repair') { screen.catcherLane = 4; screen.chances = 2; }
        else { screen.selectedPrefix = 23; screen.state.allocations.hq = vm.runInContext('({ start: 2887655424, prefix: 23 })', h.c); }
        pause._registerScreen(screen, id);
        const snapshot = gm.buildStoryProgressSnapshot(game, { slot: 1, checkpointReason: 'periodic' });
        assert.ok(Object.values(snapshot.gameStates.gameplaySessions).some(session => session.gameplayId === id && session.mapId === mapId));
        const fresh = h.c.Core.Game.current = { currentMapID: mapId, infiltratorName: 'NOVA', profileId: 'normal-stage-four', hero: { position: { x: 0, y: 0, z: 0 } } };
        gm.restoreProgressFromSnapshot(snapshot, fresh, 1);
        const restored = new h.ip[name](options);
        pause._restoreIntoScreen(restored, id);
        if (id === 'ip_network_repair') { assert.equal(restored.catcherLane, 4); assert.equal(restored.chances, 2); }
        else { assert.equal(restored.selectedPrefix, 23); assert.equal(restored.state.allocations.hq.prefix, 23); }
        h.c.Core.Game.current = game;
        pause.activeScreen = null;
    }
});

test('the native Cancel button exits fully without popping the world through the local calculator bridge', async () => {
    const h = harness(), desktop = h.launch(), win = await h.open(desktop, 0);
    win.run(() => win.screen.options.onCancel());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(h.frames.at(-1), h.map);
    assert.equal(win.disposed, true);
    assert.equal(h.service.session.windows.length, 0);
});

test('grid opening ignores accidental clicks until its transition finishes and honors reduced motion', async () => {
    const h = harness(), desktop = h.launch();
    desktop.drawHUD();
    const tile = desktop.tiles[0];
    desktop.onMouseUp(tile.x + tile.w / 2, tile.y + tile.h / 2);
    assert.equal(desktop.windows.length, 0);
    h.advance(240);
    desktop.onMouseUp(tile.x + tile.w / 2, tile.y + tile.h / 2);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(desktop.windows.length, 1);
    desktop.toggleGrid();
    desktop.onKeyPressed('Enter');
    assert.equal(desktop.gridOpen, true, 'opening by keyboard also waits for the reveal');
    desktop.motionPreference = { matches: true };
    desktop.onKeyPressed('Enter');
    assert.equal(desktop.gridOpen, false, 'reduced motion opens immediately');
});

test('minimizing travels into the bottom tab while timers continue; restoring cancels the visual', async () => {
    const h = harness(), desktop = h.launch(), win = await h.open(desktop, 2);
    desktop.drawHUD(); desktop.update();
    h.advance(100); desktop.update();
    desktop.minimize(win);
    const animation = h.service.session.animations[0];
    assert.equal(animation.kind, 'minimize');
    assert.ok(animation.canvas.width <= 960 && animation.canvas.height <= 600, 'animation snapshots stay bounded');
    const before = win.screen.solveTimerTicks, draws = [];
    h.ctx.drawImage = (...args) => draws.push(args);
    h.advance(170); h.map.update(); h.map.drawHUD();
    assert.ok(win.screen.solveTimerTicks < before);
    const frame = draws.find(args => args[0] === animation.canvas), tab = h.service.dockLayout(h.ctx).tabs[0];
    assert.ok(frame[2] > animation.from.y && frame[2] < tab.y, 'the window travels down toward its tab');
    assert.ok(frame[3] < animation.from.w && frame[3] > tab.w, 'the window shrinks during the journey');
    h.service.captureState();
    assert.equal(h.c.Core.Game.current.ip2liveGameStates.combinedGameplayFloors[18].animations, undefined);
    h.map.onMouseUp(tab.x + 50, tab.y + 20);
    assert.equal(h.service.desktop.focused, win);
    assert.equal(h.service.session.animations.length, 0);
    assert.equal(animation.canvas.width, 0, 'interrupted animation releases its snapshot');
});

test('closing fades the last frame while immediately removing the tool from timers and saves', async () => {
    const h = harness(), desktop = h.launch(), win = await h.open(desktop, 2);
    desktop.drawHUD();
    desktop.remove(win);
    const animation = h.service.session.animations[0];
    assert.equal(animation.kind, 'close');
    assert.equal(win.disposed, true);
    assert.equal(h.service.session.windows.length, 0);
    const before = win.screen.solveTimerTicks, draws = [];
    h.ctx.drawImage = (...args) => draws.push(args);
    h.advance(95); h.map.update(); h.map.drawHUD();
    assert.equal(win.screen.solveTimerTicks, before);
    assert.ok(draws.some(args => args[0] === animation.canvas && args[3] < animation.from.w));
    h.service.captureState();
    assert.equal(h.c.Core.Game.current.ip2liveGameStates.combinedGameplayFloors[18].windows.length, 0);
    h.advance(100); h.map.drawHUD();
    assert.equal(h.service.session.animations.length, 0);
    assert.equal(animation.canvas.width, 0);
});

test('minimized tabs and the grid animate closing, while reduced motion removes the effects', async () => {
    const h = harness(), desktop = h.launch(), win = await h.open(desktop, 0);
    desktop.minimize(win);
    const tab = h.service.dockLayout(h.ctx).tabs[0];
    h.map.onMouseUp(tab.close.x + 3, tab.close.y + 3);
    assert.equal(h.service.session.animations.length, 1, 'closing replaces the in-flight minimize visual');
    assert.equal(h.service.session.animations[0].from.w, tab.w, 'the minimized tab itself fades away');
    const grid = h.launch(); h.advance(240); grid.drawHUD();
    grid.onMouseUp(grid.gridClose.x + 3, grid.gridClose.y + 3);
    assert.equal(h.frames.at(-1), h.map);
    assert.equal(h.service.session.animations.length, 1);
    assert.equal(h.service.session.animations[0].win, null, 'the grid close leaves only its own visual');
    h.advance(200); h.map.drawHUD();
    const reduced = h.launch(); reduced.motionPreference = { matches: true };
    const tool = await h.open(reduced, 0);
    reduced.minimize(tool);
    assert.equal(h.service.session.animations.length, 0);
    h.service.session.host.remove(tool);
    assert.equal(h.service.session.animations.length, 0);
});
