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

function harness(storage = new Map(), developerUnlock = false) {
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
    gm.unlockPracticeAndEndlessForTesting = developerUnlock;
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
            const lesson = (...args) => {
                assert.equal(kind, 'tutorial', id + ' opened tutorial prompts during free practice'); calls.lessons++;
                if (practice.course) { const done = args.find(arg => typeof arg === 'function'); if (done) done(); }
                return true;
            };
            context.IP2Live[helper] = { showIntro: lesson, activateGuidedSession: lesson };
        }
        for (const helper of ['IPPatchPanelTutorial', 'IPHostPowerReactorTutorial', 'IPCIDRPanelHarderTutorial']) {
            context.IP2Live[helper] = { showIntro(...args) {
                assert.ok(practice.course, 'ordinary practice must not open a pre-game intro'); calls.lessons++;
                const done = args.find(arg => typeof arg === 'function'); if (done) done(); return true;
            } };
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

function dialogueInputHarness(h) {
    const listeners = {};
    const canvas = { width: 1280, height: 720,
        getBoundingClientRect: () => ({ left: 80, top: 40, width: 960, height: 540 }) };
    const ctx = new Proxy({ canvas }, { get(target, key) {
        if (key in target) return target[key];
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (key === 'measureText') return value => ({ width: String(value).length * 8 });
        return () => {};
    } });
    h.context.Common.Platform.ctx = ctx;
    h.context.document = {
        addEventListener: (type, listener) => { listeners[type] = listener; },
        createElement: () => ({ width: 1280, height: 720, getContext: () => ctx }),
    };
    h.load('modules/dialogue_manager.js');
    const dm = h.context.IP2Live.DialogueManager;
    function dispatch(type, properties, deliver) {
        const event = { ...properties, prevented: false, stopped: false,
            preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
        listeners[type](event);
        if (!event.stopped && deliver) deliver();
        return event;
    }
    return { dm, dispatch, click: (x, y, deliver) => dispatch('mousedown', { clientX: 80 + x * .75, clientY: 40 + y * .75 }, deliver) };
}

async function main() {
    // The developer override unlocks every exercise without persisting Story rewards.
    {
        const h = harness(new Map(), true);
        assert.equal(h.practice.isUnlocked(), true);
        assert.equal(h.practice.isUnlocked('not-a-gameplay'), false);
        for (const entry of h.practice.entries) {
            assert.equal(h.practice.isUnlocked(entry.id), true);
            h.loadGameplay(entry.id, 'gameplay');
            assert.equal(h.practice.launch(entry.id, 'gameplay', h.frames[0]), true);
            assert.equal(h.context.IP2Live.TutorialReplay.session.gameplayId, entry.id);
            h.context.IP2Live.TutorialReplay.finishScreen(h.frames.at(-1));
            h.finishLoading();
            assert.equal(h.practice.active, false);
        }
        assert.deepEqual(Object.keys(h.practice.unlocks), []);
        assert.equal(h.storage.has('ip2live.practice.unlocks.v1'), false);
        h.gm.unlockPracticeAndEndlessForTesting = false;
        assert.equal(h.practice.isUnlocked(), false);
        assert.equal(h.practice.launch('ip_class_wires', 'gameplay', h.frames[0]), false);
        h.practice.unlock('ip_class_wires', false);
        h.gm.unlockPracticeAndEndlessForTesting = true;
        h.gm.unlockPracticeAndEndlessForTesting = false;
        assert.equal(h.practice.isUnlocked('ip_class_wires'), true, 'earned unlocks survive disabling the override');
    }
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
        let now = 100000; h.context.Date = { now: () => now };
        const menu = new h.context.Scene.TitleScreen(); menu.initialize(); menu._showMenuPage('play');
        menu.hoverIndex = 2; assert.equal(menu._lockedModeAlertState(), null, 'hover alone does not show a locked-mode alert');
        menu.selectedIndex = 2; menu._confirmSelection(); assert.equal(menu.menuPage, 'play');
        assert.match(menu._lockedModeAlert.message, /Complete your first networking tutorial in Story Mode/);
        assert.equal(menu._lockedModeAlertState().slide, 1, 'alert starts offscreen on the right');
        now += 160; assert.ok(menu._lockedModeAlertState().slide > 0 && menu._lockedModeAlertState().slide < 1);
        now += 160; assert.equal(menu._lockedModeAlertState().slide, 0);
        now += 4999; assert.equal(menu._lockedModeAlertState().alpha, 1, 'the alert stays fully visible for five seconds');
        now += 131; assert.ok(menu._lockedModeAlertState().slide > 0, 'alert slides back out after its hold');
        now += 130; assert.equal(menu._lockedModeAlertState(), null);
        menu.selectedIndex = 1; menu._confirmSelection(); assert.match(menu._lockedModeAlert.message, /finish Story Mode/);
        now += 2000; menu.selectedIndex = 2; menu._confirmSelection();
        assert.equal(menu._lockedModeAlert.title, 'PRACTICE MODE'); assert.equal(menu._lockedModeAlert.startedAt, now, 'a new locked choice replaces the alert and restarts its timer');
        menu.hoverIndex = 1; assert.equal(menu._lockedModeAlertState().alert.title, 'PRACTICE MODE', 'moving the pointer cannot change an active alert');
        h.practice.unlock('ip_class_wires', false); menu._confirmSelection(); assert.equal(menu.menuPage, 'practice');
        assert.equal(menu._lockedModeAlertState(), null, 'successful navigation clears the alert');
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
    // The walkthrough advances through all lessons without a hub or completion screen.
    {
        const h = harness(), originalGame = h.context.Core.Game.current, originalJson = JSON.stringify(originalGame);
        const originalQuest = JSON.stringify(h.context.IP2Live.QuestManager), originalState = h.gm.state;
        for (const entry of h.practice.entries) h.loadGameplay(entry.id, 'tutorial');
        h.context.IP2Live.PVPMode = { active: false, bridge: () => null };
        h.load('modules/pvp_rules.js'); h.load('modules/screens/pvp.js');
        assert.equal(h.practice.isUnlocked(), false);
        const menu = new h.context.IP2Live.PVPMenu(); menu.initialize(); h.frames[0] = menu;
        menu._activate('tutorials'); assert.equal(h.practice.active, true);
        const course = h.practice.course; assert.equal(course.entries.length, 11);
        assert.equal(h.practice.launchCourse(menu), false);
        await settle();
        for (let index = 0; index < course.entries.length; index++) {
            const replay = h.context.IP2Live.TutorialReplay.session;
            assert.equal(course.index, index); assert.equal(replay.gameplayId, course.entries[index].id);
            assert.equal(replay.options.tutorialCourse, true); assert.equal(replay.options.showIntro, false);
            assert.equal(replay.options.guidedTutorial, true); assert.equal(replay.options.practiceGameplay, false);
            assert.deepEqual(h.frames, [menu, replay.screen], 'only the menu and interactive gameplay are stacked');
            replay.screen.options.onComplete({ passed: true });
            assert.equal(course.busy, true, 'automatic progression immediately locks duplicate navigation');
            assert.equal(h.practice.playCourseLesson(index), false);
            await settle();
            h.gm.finishTutorialReplay(replay.gameplayId, replay.options, 'completed');
            if (index + 1 < course.entries.length) {
                assert.equal(h.context.IP2Live.TutorialReplay.session.gameplayId, course.entries[index + 1].id, 'stale callbacks cannot complete the next tutorial');
                assert.equal(h.context.Core.Game.current, null);
            }
        }
        assert.ok(h.calls.lessons >= 3, 'authored in-game guidance remains included');
        assert.equal(h.frames.length, 1); assert.equal(h.practice.active, false); assert.equal(h.practice.course, null);
        assert.equal(h.calls.loaders.length, 0, 'no loading or lesson-choice screen interrupts progression');
        assert.equal(h.context.Core.Game.current, originalGame); assert.equal(JSON.stringify(originalGame), originalJson);
        assert.equal(JSON.stringify(h.context.IP2Live.QuestManager), originalQuest); assert.equal(h.gm.state, originalState);
        assert.equal(h.practice.isUnlocked(), false);
    }
    {
        const h = harness();
        for (const entry of h.practice.entries.slice(0, 3)) h.loadGameplay(entry.id, 'tutorial');
        h.context.IP2Live.PVPMode = { active: false, bridge: () => null };
        h.load('modules/pvp_rules.js'); h.load('modules/screens/pvp.js'); h.load('modules/screens/gameplay-pause.js');
        const originalGame = h.context.Core.Game.current;
        h.practice.launchCourse(h.frames[0]); await settle();
        assert.equal(h.practice.playCourseLesson(-1), false);
        h.practice.playCourseLesson(1); await settle();
        let replay = h.context.IP2Live.TutorialReplay.session;
        let pause = new h.context.window.IP2LiveGameplayPauseMenu(replay.screen); pause.initialize(); h.frames.push(pause);
        pause.selectedIndex = pause.menuItems.findIndex(item => item.action === 'previous'); assert.ok(pause.selectedIndex >= 0);
        assert.equal(pause.selectionMix.length, pause.menuItems.length);
        pause._activate(); await settle(); assert.equal(h.practice.course.index, 0); assert.equal(h.frames.length, 2);
        assert.equal(replay.screen._ip2liveGameplayExited, true);
        replay = h.context.IP2Live.TutorialReplay.session;
        pause = new h.context.window.IP2LiveGameplayPauseMenu(replay.screen); pause.initialize(); h.frames.push(pause);
        assert.ok(!pause.menuItems.some(item => item.action === 'previous'));
        pause.selectedIndex = pause.menuItems.findIndex(item => item.action === 'replay'); pause._activate(); await settle();
        assert.notEqual(h.context.IP2Live.TutorialReplay.session.options.questId, replay.options.questId);
        replay = h.context.IP2Live.TutorialReplay.session;
        pause = new h.context.window.IP2LiveGameplayPauseMenu(replay.screen); pause.initialize(); h.frames.push(pause);
        assert.equal(pause.menuItems.find(item => item.action === 'finish').title, 'NEXT TUTORIAL');
        const system = h.context.IP2Live.GameplayPause;
        assert.equal((await system.exitQuest(replay.screen)).finished, true);
        await settle(); assert.equal(h.practice.course.index, 1); assert.equal(h.frames.length, 2);
        replay = h.context.IP2Live.TutorialReplay.session;
        replay.screen.options.onFailed({}); await settle();
        assert.equal(h.practice.course.index, 1, 'a failed tutorial retries the same gameplay');
        assert.notEqual(h.context.IP2Live.TutorialReplay.session.options.questId, replay.options.questId);
        replay = h.context.IP2Live.TutorialReplay.session;
        pause = new h.context.window.IP2LiveGameplayPauseMenu(replay.screen); pause.initialize(); h.frames.push(pause);
        pause.selectedIndex = pause.menuItems.findIndex(item => item.action === 'course-exit'); pause._activate(); await settle();
        assert.equal(h.context.Core.Game.current, originalGame); assert.equal(h.frames.length, 1);
        assert.equal(h.context.IP2Live.TutorialReplay.session, null); assert.equal(h.practice.course, null);
    }
    for (const id of Object.keys(files)) {
        const h = harness(), index = h.practice.entries.findIndex(entry => entry.id === id);
        h.loadGameplay('ip_class_wires', 'tutorial'); h.loadGameplay(id, 'tutorial', true);
        h.context.IP2Live.PVPMode = { active: false, bridge: () => null };
        h.load('modules/pvp_rules.js'); h.load('modules/screens/pvp.js'); h.load('modules/screens/gameplay-pause.js');
        dialogueInputHarness(h);
        h.practice.launchCourse(h.frames[0]); await settle();
        if (index !== 0) { h.practice.playCourseLesson(index); await settle(); }
        const replay = h.context.IP2Live.TutorialReplay.session;
        assert.ok(replay && replay.screen, id + ' constructs its real guided screen');
        assert.equal(replay.options.guidedTutorial, true); assert.equal(replay.screen.options.tutorialCourse, true);
        assert.equal(replay.screen.maxAttempts, Infinity);
        const pause = h.context.IP2Live.GameplayPause, screen = replay.screen;
        screen.onKeyPressed('escape');
        let menu = h.frames.at(-1);
        assert.ok(menu instanceof h.context.window.IP2LiveGameplayPauseMenu, id + ' pauses from Escape');
        menu.initialize(); menu._resume(); menu.update(); assert.equal(h.frames.at(-1), screen);
        pause.drawPauseButton(screen); screen.onMouseDown(640, 17);
        menu = h.frames.at(-1);
        assert.ok(menu instanceof h.context.window.IP2LiveGameplayPauseMenu, id + ' pauses from its button');
        menu.initialize(); menu._resume(); menu.update(); assert.equal(h.frames.at(-1), screen);
        assert.equal(pause.captureScreen(screen, 'pause'), null);
        h.practice.exitCourse(); await settle(); assert.equal(h.frames.length, 1);
    }
    // Real gameplay dialogue remains inside the puzzle and yields to Pause/Settings.
    {
        const h = harness();
        h.loadGameplay('ip_class_wires', 'tutorial'); h.loadGameplay('ip_cidr_binary_panel', 'tutorial');
        h.loadGameplay('ip_patch_panel_classes', 'tutorial', true);
        const input = dialogueInputHarness(h), dm = input.dm;
        h.load('gameplay/gameplay2/IPPatchPanel/ip_patchpanel_tutorial.js');
        h.context.IP2Live.PVPMode = { active: false, bridge: () => null };
        h.load('modules/pvp_rules.js'); h.load('modules/screens/pvp.js'); h.load('modules/screens/gameplay-pause.js');
        const originalGame = h.context.Core.Game.current, originalJson = JSON.stringify(originalGame);
        h.practice.launchCourse(h.frames[0]); await settle(); h.practice.playCourseLesson(1); await settle();
        const screen = h.context.IP2Live.TutorialReplay.session.screen, pause = h.context.IP2Live.GameplayPause;
        assert.equal(h.frames.at(-1), screen); assert.equal(dm.isActive(), false, 'standalone briefing is omitted');
        screen._showGuidedPacketDialogue(screen.roundPackets[0]);
        assert.match(dm._active.id, /guided\.packet\./, 'authored packet teaching still runs in the gameplay');
        dm._active.typeChars = 3; const active = dm._active;
        pause.drawPauseButton(screen);
        assert.equal(input.click(640, 17, () => screen.onMouseDown(640, 17)).prevented, false);
        let menu = h.frames.at(-1); menu.initialize();
        assert.ok(menu instanceof h.context.window.IP2LiveGameplayPauseMenu); assert.equal(pause.activeScreen, screen);
        assert.equal(input.dispatch('keydown', { code: 'ArrowDown' }).prevented, false);
        input.dispatch('keydown', { code: 'Enter' }); input.click(100, 100);
        assert.equal(dm.advance(), false); dm.drawOverlay(h.context.Common.Platform.ctx);
        assert.equal(active.animTick, 0); assert.equal(active.typeChars, 3); assert.equal(active.slideIndex, 0);
        const slide = active.slides[0]; active.slides[0] = { focusOnly: true, focus: { x: 0, y: 0, w: 100, h: 100 } };
        assert.equal(dm.drawHudFocusOverlay(h.context.Common.Platform.ctx), false); active.slides[0] = slide;
        h.context.IP2LiveSettingsMenu = h.context.window.IP2LiveSettingsMenu = class { constructor(options) { this.options = options; } };
        menu._settings(); assert.equal(h.frames.at(-1).options.popupTransition, true);
        assert.equal(input.dispatch('keydown', { code: 'Enter' }).prevented, false); h.frames.pop();
        input.dispatch('keydown', { code: 'Enter' }, () => menu.onKeyPressed('enter')); menu.update();
        assert.equal(h.frames.at(-1), screen); assert.equal(pause.menuOpen, false); assert.equal(dm._active, active);
        assert.equal(active.typeChars, 3); screen.onMouseUp(640, 17);
        input.click(100, 100); assert.ok(active.typeChars > 3);
        input.dispatch('keydown', { code: 'Escape' }, () => screen.onKeyPressed('escape'));
        menu = h.frames.at(-1); menu.initialize();
        menu.selectedIndex = menu.menuItems.findIndex(item => item.action === 'previous'); menu._activate(); await settle();
        assert.equal(h.practice.course.index, 0); assert.equal(pause.menuOpen, false); assert.equal(dm.isActive(), false);
        assert.equal(pause.open(screen), false);
        const replacement = h.context.IP2Live.TutorialReplay.session.screen; replacement.options.pvpMode = true;
        assert.equal(pause.open(replacement), false); replacement.options.pvpMode = false;
        h.practice.exitCourse(); await settle();
        assert.equal(h.frames.length, 1); assert.equal(h.context.Core.Game.current, originalGame);
        assert.equal(JSON.stringify(originalGame), originalJson);
    }
    // Run the actual transition: old puzzle survives until black, new puzzle stays
    // covered until ready, and no teaching input/timers run during the reveal.
    {
        const h = harness(); let now = 0;
        h.context.Date = class extends Date { static now() { return now; } };
        h.context.Manager.Stack.pop = () => { const scene = h.frames.pop(); if (scene && scene.close) scene.close(); return scene; };
        h.loadGameplay('ip_class_wires', 'tutorial'); h.loadGameplay('ip_patch_panel_classes', 'tutorial');
        const input = dialogueInputHarness(h), dm = input.dm;
        h.load('modules/screens/menu-transition.js'); h.load('modules/screens/gameplay-pause.js');
        const originalGame = h.context.Core.Game.current;
        const finishTransition = () => {
            const overlay = h.frames.at(-1); assert.equal(h.context.IP2Live.MenuTransition.active, overlay);
            assert.equal(overlay.phase, 'out'); now += 520; overlay.update(); overlay.drawHUD(); now++; overlay.update();
            const target = overlay.target; target.loading = true; now += 100; overlay.update();
            assert.equal(overlay.phase, 'hold'); target.loading = false; overlay.update(); assert.equal(overlay.phase, 'in');
            let updates = 0; const originalUpdate = target.update; target.update = () => updates++;
            now += 230; overlay.update(); assert.equal(updates, 0, 'transition freezes the new puzzle');
            target.update = originalUpdate;
            dm.registerDialogue('transition.lesson', { slides: [['Read the packet.']] }); dm.start('transition.lesson');
            const active = dm._active; active.typeChars = 2;
            input.dispatch('keydown', { code: 'Enter' }); assert.equal(active.typeChars, 2, 'hidden teaching cannot be skipped');
            now += 230; overlay.update(); assert.equal(h.context.IP2Live.MenuTransition.active, null);
            assert.equal(h.frames.at(-1), target); if (h.practice.course) assert.equal(h.practice.course.busy, false);
            dm.discardActive(); return target;
        };
        h.practice.launchCourse(h.frames[0]); await settle();
        let screen = finishTransition(); assert.equal(h.frames.length, 2);
        h.practice.playCourseLesson(1); assert.equal(h.frames.at(-1), screen, 'navigation waits for callbacks to unwind'); await settle();
        assert.equal(screen._ip2liveGameplayExited, undefined, 'old tutorial remains alive until fade-out ends');
        finishTransition(); assert.equal(screen._ip2liveGameplayExited, true); assert.equal(h.practice.course.index, 1);
        h.practice.playCourseLesson(0); await settle(); finishTransition(); assert.equal(h.practice.course.index, 0);
        screen = h.context.IP2Live.TutorialReplay.session.screen; screen.options.onComplete({}); await settle();
        finishTransition(); assert.equal(h.practice.course.index, 1, 'completion automatically transitions to the next lesson');
        h.practice.exitCourse(); await settle(); finishTransition();
        assert.equal(h.frames.length, 1); assert.equal(h.practice.active, false); assert.equal(h.context.Core.Game.current, originalGame);
        const node = h.gm.flowConfig.gameplayNodes.ip_class_wires;
        h.context.IP2Live[node.manager][node.method] = () => false;
        h.practice.launchCourse(h.frames[0]); await settle(); finishTransition();
        assert.equal(h.frames.length, 1); assert.equal(h.practice.active, false);
        assert.match(h.frames[0].notice, /could not be opened/, 'a failed launcher reveals the menu instead of leaving a black frame');
    }
    {
        const h = harness(), originalGame = h.context.Core.Game.current;
        assert.equal(h.practice.launchCourse(h.frames[0]), true); await settle();
        assert.equal(h.practice.active, false); assert.equal(h.practice.course, null);
        assert.equal(h.frames.length, 1); assert.match(h.frames[0].notice, /could not be opened/);
        assert.equal(h.context.Core.Game.current, originalGame, 'unavailable tutorials recover to the menu');
    }
    console.log('practice_mode.test.cjs: PASS (22 practice paths, 11 automatic tutorials, in-game teaching, pause controls, transitions, isolation and recovery)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
