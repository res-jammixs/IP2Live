const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const files = {
    ip_class_wires: 'gameplay1/IPWires/ip_wires_gameplay.js',
    ip_class_wires_harder: 'gameplay1/IPWires/ip_wires_gameplay_harder.js',
    ip_patch_panel_classes: 'gameplay2/IPPatchPanel/ip_patchpanel_gameplay.js',
    ip_cidr_binary_panel: 'gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js',
    ip_cidr_binary_panel_harder: 'gameplay3/CIDRPanel/ip_cidrpanel_gameplay_harder.js',
    ip_subnet_simulator: 'gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js',
    ip_host_power_reactor: 'gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js',
    ip_cidr_quarantine: 'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js',
    ip_cidr_quarantine_matrix: 'gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js',
    ip_network_repair: 'gameplay7/NetworkRepair/gameplay.js',
    ip_vlsm_allocator: 'gameplay8/VLSMAllocator/ip_vlsm_allocator_gameplay.js',
};

function harness(storage = new Map()) {
    const frames = [{ id: 'grid' }], calls = { lessons: 0, loaders: [], transitions: [] };
    const context = vm.createContext({
        console: { log() {}, warn: console.warn, error: console.error }, window: {}, inject() {}, setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 }, Platform: { ctx: { canvas: { width: 1280, height: 720 } } } },
        Core: { Game: { current: { currentMapID: 18, ip2liveGameStates: { campaign: { solved: true } } } } },
        Data: { Systems: { soundConfirmation: { playSound() {} }, soundCursor: { playSound() {} }, soundImpossible: { playSound() {} } },
            Keyboards: { menuControls: { Left: 'left', Right: 'right', Up: 'up', Down: 'down' },
                isKeyEqual: (a, b) => a === b, checkCancelMenu: key => key === 'escape', checkActionMenu: key => key === 'enter' } },
        Graphic: {}, Model: {}, Main: {}, THREE: {},
        Scene: { Base: class {}, TitleScreen: class {}, Map: { current: { id: 18 } } },
        Manager: { Stack: { get top() { return frames.at(-1); }, push: screen => frames.push(screen), pop: () => frames.pop(),
            replace() { assert.fail('practice must not replace its grid'); } } },
        IP2Live: {
            Assets: { loadAll: async () => {} },
            QuestManager: { activeQuestId: 'story', activeObjectiveId: 'objective', completedObjectives: { prior: { objective: true } },
                startQuest() { assert.fail('practice changed the story quest'); }, completeObjective() { assert.fail('practice completed a story objective'); } },
            QuestMinimap: { destroy() {}, create() {}, update() {}, isActive: () => false },
            MusicManager: { currentZone: () => 'menu', play() {}, ZONE: { MAIN_MENU: 'menu', GAMEPLAY_1: 'gameplay', GAMEPLAY_2: 'gameplay' } },
            NeuralLifeForce: { isRunOver: () => true }, // A lost story must not block practice.
            ARDiagnosticRewind: { show() { assert.fail('practice opened diagnostic rewind'); } },
            DialogueManager: { queueByTiming() { assert.fail('practice queued campaign dialogue'); }, resetTransitionState() {} },
            LoadingScreen: { show(options) { const scene = { options }; frames.push(scene); calls.loaders.push(scene); return scene; } },
            MenuTransition: { open(factory) { calls.transitions.push(factory); }, back() { calls.transitions.push('back'); } },
        },
        PracticeScreenStub: class { constructor(options) { this.options = options; this.scenario = options.scenario; } },
    });
    const load = (relative, transform = s => s) => vm.runInContext(transform(fs.readFileSync(path.join(root, relative), 'utf8')), context, { filename: relative });
    load('modules/tutorial_replay.js'); load('modules/game_manager.js');
    load('modules/achievements.js'); load('modules/practice_mode.js');
    const gm = context.IP2Live.GameManager, practice = context.IP2Live.PracticeMode;
    gm._logTelemetryEvent = () => assert.fail('practice wrote campaign telemetry');
    gm._ensureQuestMinimap = () => assert.fail('practice restored campaign HUD');
    gm._openReportAttempt = () => assert.fail('practice opened an assessed attempt');
    gm.startMapFlow = () => assert.fail('practice changed map');
    function loadGameplay(id, kind, real = false) {
        if (real) {
            load('gameplay/common/ip_class_ranges.js'); load('gameplay/common/ip_cidr_tools.js');
            load('gameplay/gameplay1/IPWires/ip_wires_core.js');
            Object.assign(context.Common.ScreenResolution, { CANVAS_WIDTH: 1280, CANVAS_HEIGHT: 720, getScreenX: x => x, getScreenY: y => y });
            if (id === 'ip_class_wires_harder') load('gameplay/' + files.ip_class_wires);
            if (id === 'ip_cidr_binary_panel_harder') load('gameplay/' + files.ip_cidr_binary_panel);
        } else {
            context.IP2Live.WiresGameplayScreen = context.PracticeScreenStub;
            context.IP2Live.CIDRPanelGameplayScreen = context.PracticeScreenStub;
        }
        load('gameplay/' + files[id], source => real ? source : source.replace(/new IP2Live\w+(?:Gameplay|Connector)Screen\(/g, 'new PracticeScreenStub(').replace(/new HarderScreenClass\(/g, 'new PracticeScreenStub('));
        const owner = context.IP2Live[gm.flowConfig.gameplayNodes[id].manager];
        if (!real && owner._freshProblem) owner._freshProblem = () => ({});
        for (const helper of ['IPWiresTutorial', 'IPWiresHarderTutorial', 'IPNetworkRepairTutorial', 'IPVLSMAllocatorTutorial']) {
            const lesson = () => { assert.equal(kind, 'tutorial', id + ' opened tutorial prompts during free practice'); calls.lessons++; };
            context.IP2Live[helper] = { showIntro: lesson, activateGuidedSession: lesson };
        }
        for (const helper of ['IPPatchPanelTutorial', 'IPHostPowerReactorTutorial', 'IPCIDRPanelHarderTutorial']) {
            context.IP2Live[helper] = { showIntro() { assert.fail('practice opened a pre-game intro'); } };
        }
        return owner;
    }
    function finishLoading() {
        const loader = frames.at(-1);
        assert.ok(calls.loaders.includes(loader));
        loader.options.onComplete(loader);
    }
    return { context, frames, gm, practice, calls, load, loadGameplay, finishLoading, storage };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

async function main() {
    // Unlocks require completion of that exact tutorial variant, persist across
    // application instances, and never cascade from standard to harder versions.
    {
        const h = harness(), id = 'ip_class_wires';
        assert.equal(h.practice.isUnlocked(), false);
        assert.equal(h.practice.launch(id, 'tutorial', h.frames[0]), false);
        const specs = h.gm.getGameplayQuestSpecs(id), tutorial = specs.find(s => s.tutorial), regular = specs.find(s => !s.tutorial);
        assert.equal(h.practice.recordCompletion(id, { spec: regular }), false);
        assert.equal(h.practice.recordCompletion(id, { spec: tutorial, developerTest: true }), false);
        assert.equal(h.practice.recordCompletion(id, { spec: { ...tutorial, tutorialReplay: true } }), false);
        h.gm._ensureQuestMinimap = () => {};
        h.gm._closeReportAttempt = () => {};
        h.gm._runTimingDialogues = () => false;
        assert.equal(h.gm.handleGameplayCompleted(id, { spec: tutorial }), true);
        assert.equal(h.practice.isUnlocked(id), true);
        assert.equal(h.practice.isUnlocked('ip_class_wires_harder'), false);
        const achievements = h.context.IP2Live.Achievements;
        assert.equal(achievements.queue.length, 2);
        assert.equal(achievements.queue[0].title, 'Practice Mode unlocked');
        assert.equal(achievements.queue[1].title, 'Practice mode for Gameplay 1 unlocked');
        achievements.update(0);
        assert.equal(achievements.active.id, 'practice-mode');
        achievements.update(4199); assert.equal(achievements.active.id, 'practice-mode');
        achievements.update(4200); assert.equal(achievements.active, null);
        achievements.update(4201); assert.equal(achievements.active.id, 'practice-' + id);
        assert.equal(h.practice.recordCompletion(id, { spec: tutorial }), false);
        assert.equal(harness(h.storage).practice.isUnlocked(id), true);
        for (const entry of h.practice.entries) {
            const spec = h.gm.getGameplayQuestSpecs(entry.id).find(s => s.tutorial || s.harderIntro);
            assert.ok(spec, entry.id + ' has a tutorial');
            h.practice.recordCompletion(entry.id, { spec });
            assert.equal(h.practice.isUnlocked(entry.id), true);
        }
    }
    // Existing campaign completions can grant access without replaying them.
    {
        const h = harness(), spec = h.gm.getGameplayQuestSpecs('ip_cidr_binary_panel_harder').find(s => s.tutorial || s.harderIntro);
        h.context.IP2Live.QuestManager.completedObjectives[spec.id] = { [spec.objectiveId]: true };
        h.practice.syncFromCampaign();
        assert.equal(h.practice.isUnlocked('ip_cidr_binary_panel_harder'), true);
        assert.equal(h.practice.isUnlocked('ip_cidr_binary_panel'), false);
        assert.equal(h.context.IP2Live.Achievements.queue.length, 0);
    }
    // Universal notifications remain below a letterboxed minimap, slide in/out,
    // and never leave more than one visible DOM card at a time.
    {
        const h = harness(), nodes = [];
        h.context.window.innerWidth = 1280; h.context.window.innerHeight = 720;
        h.context.document = {
            body: { appendChild: node => nodes.push(node) },
            createElement() { return { style: {}, children: [], setAttribute() {},
                appendChild(child) { this.children.push(child); },
                getBoundingClientRect: () => ({ height: 130 }),
                remove() { nodes.splice(nodes.indexOf(this), 1); } }; },
        };
        const minimapBounds = { width: 220, height: 200, bottom: 230, right: 1080 };
        h.context.IP2Live.QuestMinimap._container = { getBoundingClientRect: () => minimapBounds };
        const a = h.context.IP2Live.Achievements;
        a.show({ id: 'first', title: 'First' }); a.show({ id: 'second', title: 'Second' });
        assert.equal(a.show({ id: 'first', title: 'Duplicate' }), false);
        a.update(0); assert.equal(nodes.length, 1); assert.equal(nodes[0].style.transform, 'translateX(120%)');
        a.update(450); assert.equal(nodes[0].style.transform, 'translateX(0%)');
        assert.equal(nodes[0].style.top, '242px'); assert.equal(nodes[0].style.right, '200px');
        assert.equal(nodes[0].style.width, '220px');
        Object.assign(minimapBounds, { width: 330, right: 1270, bottom: 320 });
        a.update(600);
        assert.equal(nodes[0].style.width, '330px', 'tracks the rendered minimap width after resizing');
        assert.equal(nodes[0].style.right, '10px', 'uses the same right edge as the minimap');
        assert.equal(nodes[0].style.top, '332px');
        minimapBounds.height = 0;
        a.update(700);
        assert.equal(nodes[0].style.width, '220px', 'hidden minimap uses a compact fallback');
        assert.equal(nodes[0].style.top, '24px');
        a.update(4100); assert.equal(nodes[0].style.transform, 'translateX(120%)');
        a.update(4200); assert.equal(nodes.length, 0);
        a.update(4201); assert.equal(nodes.length, 1); assert.equal(a.active.id, 'second');
        a.update(8401); assert.equal(nodes.length, 0); assert.equal(a.active, null);
    }
    // Exercise all 22 real launch paths and real completion/cancel callbacks.
    for (const id of Object.keys(files)) for (const kind of ['tutorial', 'gameplay']) {
        const h = harness(), owner = h.loadGameplay(id, kind);
        h.load('modules/screens/gameplay-pause.js');
        h.practice.unlock(id, false);
        const originalGame = h.context.Core.Game.current, originalJson = JSON.stringify(originalGame);
        const originalQuest = JSON.stringify(h.context.IP2Live.QuestManager);
        h.context.IP2Live.CIDRGameplayState = { prior: true };
        assert.equal(h.practice.launch(id, kind, h.frames[0]), true, id + '/' + kind);
        assert.notEqual(h.context.Core.Game.current, originalGame);
        assert.equal(h.practice.launch(id, kind, h.frames[0]), false, 'no duplicate sessions');
        let screen = h.frames.at(-1);
        assert.equal(screen.options.practiceMode, true);
        assert.equal(screen.options.practiceGameplay, kind === 'gameplay');
        assert.equal(screen.options.spec.tutorial, kind === 'tutorial');
        assert.equal(screen.maxAttempts, Infinity);
        assert.equal(screen.enforceAttemptLimit, false);
        if (kind === 'gameplay') {
            assert.equal(!!screen.options.guidedTutorial, false);
            assert.equal(!!screen.options.tutorialMode, false);
        }
        const pause = h.context.IP2Live.GameplayPause;
        assert.equal(pause.captureScreen(screen, 'pause'), null);
        assert.equal(pause.findSession(id, screen.options), null);
        assert.equal((await h.gm.saveProgressToActiveSlot()).reason, 'practice-mode');
        assert.equal(h.gm._queueCheckpoint('test'), false);
        const pauseMenu = new h.context.window.IP2LiveGameplayPauseMenu(screen); pauseMenu.initialize();
        assert.equal(pauseMenu.menuItems[2].title, kind === 'tutorial' ? 'FINISH TUTORIAL' : 'FINISH PRACTICE');
        const oldOptions = h.context.IP2Live.TutorialReplay.session.options;
        screen.options.onComplete({ passed: true });
        await settle();
        if (kind === 'gameplay') {
            assert.equal(h.practice.active, true);
            assert.equal(h.frames.length, 2, 'rounds reuse the same grid without stacking screens');
            assert.notEqual(h.frames.at(-1), screen);
            assert.equal(h.calls.loaders.length, 0, 'free practice continues directly');
            h.gm.finishTutorialReplay(id, oldOptions, 'completed');
            for (let failure = 0; failure < 5; failure++) {
                screen = h.frames.at(-1);
                screen.options.onFailed({ reason: 'attempts_exhausted' });
                await settle();
                assert.equal(h.frames.length, 2);
                assert.equal(h.practice.active, true);
                assert.equal(h.frames.at(-1).maxAttempts, Infinity);
            }
            screen = h.frames.at(-1);
            const pauseMenu = new h.context.window.IP2LiveGameplayPauseMenu(screen); pauseMenu.initialize();
            h.frames.push(pauseMenu);
            await pause.exitQuest(screen);
        }
        assert.equal(h.calls.loaders.length, 1, 'return uses the standard loading screen');
        h.finishLoading();
        assert.equal(h.frames.length, 1);
        assert.equal(h.practice.active, false);
        assert.equal(h.context.Core.Game.current, originalGame);
        assert.equal(JSON.stringify(originalGame), originalJson);
        assert.equal(JSON.stringify(h.context.IP2Live.QuestManager), originalQuest);
        assert.equal(h.context.IP2Live.CIDRGameplayState.prior, true);
        assert.equal(h.context.IP2Live.TutorialReplay.session, null);
        assert.equal(h.gm._activeGameplayNode, null);
        assert.equal(h.practice.launch(id, kind, h.frames[0]), true, 're-entry starts a new session');
        assert.equal(h.practice.round, 1);
        h.frames.at(-1).options.onCancel(); h.finishLoading();
        assert.equal(h.context.Core.Game.current, originalGame);
    }
    // Real screen construction: free practice must actually disable guided state
    // and every budget, including Network Repair's separate chances counter.
    for (const id of Object.keys(files)) {
        const h = harness(); h.loadGameplay(id, 'gameplay', true);
        h.load('modules/screens/gameplay-pause.js');
        h.context.Core.Game.current = null; // Real title screens have no active story.
        h.practice.unlock(id, false);
        assert.equal(h.practice.launch(id, 'gameplay', h.frames[0]), true, id);
        const screen = h.context.IP2Live.TutorialReplay.session.screen;
        assert.ok(screen, id + ' real screen launched');
        assert.equal(screen.maxAttempts, Infinity);
        assert.equal(!!screen.guidedTutorial, false);
        assert.equal(!!screen.tutorialMode, false);
        if (id === 'ip_network_repair') {
            assert.equal(screen.chances, Infinity);
            for (let i = 0; i < 6; i++) screen._submitArrangement();
            assert.equal(screen.chances, Infinity);
            assert.equal(screen.finished, false);
        }
        if (id === 'ip_vlsm_allocator') {
            for (let i = 0; i < 6; i++) screen._recordValidationFailure({ issueType: 'invalid-prefix' });
            assert.equal(screen.validationFailures, 6);
            assert.equal(screen.finished, false);
        }
        if (id === 'ip_cidr_binary_panel' || id === 'ip_cidr_binary_panel_harder') {
            screen.maskFailures = 10;
            assert.equal(screen._attemptLimitReached(), false);
        }
        screen.options.onCancel(); h.finishLoading();
        assert.equal(h.context.Core.Game.current, null);
    }
    // Main menu gating, TV navigation, five-column layout, keyboard and pointer.
    {
        const h = harness(); h.load('modules/screens/practice-grid.js'); h.load('modules/screens/main-menu.js');
        const menu = new h.context.Scene.TitleScreen(); menu.initialize(); menu._showMenuPage('play');
        menu.selectedIndex = 2; menu._confirmSelection(); assert.equal(menu.menuPage, 'play');
        assert.ok(menu._practiceHintUntil > Date.now());
        h.practice.unlock('ip_class_wires', false); menu._confirmSelection(); assert.equal(menu.menuPage, 'practice');
        assert.deepEqual(Array.from(menu.menuItems), ['TUTORIAL', 'GAMEPLAY']);
        menu.selectedIndex = 0; menu._confirmSelection(); assert.equal(h.calls.transitions.length, 1);
        const grid = h.calls.transitions[0](); grid.initialize();
        assert.equal(grid.kind, 'tutorial');
        const layout = grid._layout();
        assert.equal(layout.cells.slice(0, 5).every(c => c.y === layout.cells[0].y), true);
        assert.ok(layout.cells[5].y > layout.cells[0].y);
        assert.ok(layout.harderY > layout.cells[8].y + layout.cells[8].h);
        grid.onKeyPressedAndRepeat('down'); assert.equal(grid.selectedIndex, 5);
        grid.onKeyPressed('enter'); assert.equal(h.practice.active, false); assert.match(grid.notice, /Complete/);
        const locked = layout.cells[10]; grid.onMouseUp(locked.x + 10, locked.y + 10); assert.equal(grid.selectedIndex, 10);
        grid.onKeyPressed('escape'); assert.equal(h.calls.transitions.at(-1), 'back');
        menu._backMenuPage(); assert.equal(menu.menuPage, 'play');
    }
    // Launch through the real CRT overlay: wait for black, retain the grid and
    // the one created puzzle, reveal it, then finish back into the same library.
    for (const kind of ['tutorial', 'gameplay']) for (const id of ['ip_class_wires', 'ip_cidr_binary_panel_harder']) {
        const h = harness(); h.loadGameplay(id, kind);
        let now = 0;
        h.context.Date = { now: () => now };
        Object.assign(h.context.Common.Platform.ctx, { save() {}, restore() {}, setTransform() {}, fillRect() {} });
        h.context.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, clearRect() {} }) }) };
        h.context.Manager.Stack.pop = () => { const scene = h.frames.pop(); if (scene.close) scene.close(); return scene; };
        h.load('modules/screens/menu-transition.js'); h.load('modules/screens/practice-grid.js');
        h.load('modules/screens/gameplay-pause.js');
        const grid = new h.context.IP2Live.PracticeGrid(kind); grid.initialize();
        h.frames[0] = grid; h.practice.unlock(id, false);
        grid.selectedIndex = h.practice.entries.findIndex(e => e.id === id);
        now = 40; grid.update();
        assert.ok(grid.folderOpen[grid.selectedIndex] > 0 && grid.folderOpen[grid.selectedIndex] < 1, 'folder eases open with keyboard focus');
        const before = grid.folderOpen[grid.selectedIndex];
        grid.onMouseMove(0, 0); now = 80; grid.update();
        assert.ok(grid.folderOpen[grid.selectedIndex] < before, 'folder closes when the pointer leaves it');
        grid.onKeyPressed('enter');
        const overlay = h.frames.at(-1);
        assert.equal(overlay.phase, 'out'); assert.equal(h.practice.active, false);
        grid.onKeyPressed('enter'); assert.equal(h.frames.length, 2, 'double activation creates no extra overlay');
        now += 520; overlay.update();
        overlay.update(); assert.equal(h.practice.active, false, 'launch waits until the black frame is painted');
        overlay.drawHUD(); now++; overlay.update();
        assert.equal(h.practice.active, true);
        const screen = h.context.IP2Live.TutorialReplay.session.screen;
        assert.deepEqual(h.frames, [grid, screen, overlay]);
        assert.equal(h.context.IP2Live.MenuTransition.active, overlay);
        screen.loading = true; now += 100; overlay.update();
        assert.equal(overlay.phase, 'hold', 'loading puzzle remains covered');
        screen.loading = false; overlay.update();
        assert.equal(overlay.phase, 'in');
        assert.deepEqual(h.frames, [grid, screen, overlay], 'reveal does not recreate or close the puzzle');
        now += 460; overlay.update();
        assert.deepEqual(h.frames, [grid, screen]);
        assert.equal(h.context.IP2Live.MenuTransition.active, null);
        const pauseMenu = new h.context.window.IP2LiveGameplayPauseMenu(screen); pauseMenu.initialize();
        h.frames.push(pauseMenu);
        const campaign = h.practice.savedGame;
        const finish = await h.context.IP2Live.GameplayPause.exitQuest(screen);
        assert.equal(finish.finished, true);
        const returning = h.frames.at(-1);
        assert.equal(returning.phase, 'out');
        assert.equal(h.practice.active, true, 'session survives until the TV closes');
        assert.equal((await h.context.IP2Live.GameplayPause.exitQuest(screen)).finished, false, 'duplicate finish cannot start another transition');
        now += 520; returning.update(); returning.update();
        assert.equal(h.context.IP2Live.TutorialReplay.session.screen, screen);
        returning.drawHUD(); now++; returning.update();
        assert.deepEqual(h.frames, [grid, returning], 'black frame clears pause and practice scenes together');
        assert.equal(h.context.IP2Live.TutorialReplay.session, null);
        assert.equal(h.context.Core.Game.current, campaign, 'return restores the original campaign');
        assert.equal(h.calls.loaders.length, 0, 'pause finish uses the TV instead of a loading screen');
        now += 100; returning.update(); assert.equal(returning.phase, 'in');
        now += 460; returning.update();
        assert.deepEqual(h.frames, [grid]); assert.equal(h.practice.active, false);
        assert.equal(h.context.IP2Live.MenuTransition.active, null);
        // A failed launcher reveals the existing library and releases the lock.
        h.context.console.error = () => {};
        assert.equal(h.context.IP2Live.MenuTransition.launch(() => false), true);
        const failed = h.frames.at(-1);
        now += 520; failed.update(); failed.drawHUD(); now++; failed.update();
        assert.equal(failed.phase, 'in'); now += 520; failed.update();
        assert.deepEqual(h.frames, [grid]); assert.equal(h.context.IP2Live.MenuTransition.active, null);
    }
    console.log('practice_mode.test.cjs: PASS (22 launch paths, unlocks, queue, looping, isolation, folders and TV navigation)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
