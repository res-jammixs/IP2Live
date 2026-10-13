const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pauseSource = fs.readFileSync(path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'screens', 'gameplay-pause.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'game_manager.js'), 'utf8');
const loaderSource = fs.readFileSync(path.join(root, 'Plugins', 'IP2Live_Core', 'code.js'), 'utf8');

class BaseScene {
    constructor() {}
}

class WireScreen extends BaseScene {
    constructor(options) {
        super(true);
        this.options = options || {};
        this.gameplayId = 'ip_class_wires';
        this.connections = {};
        this.lockedCorrect = {};
        this.score = 0;
        this.startedAt = 0;
        this.endsAt = 0;
        this.tutorialStep = 'done';
        this.tutorialDialogueOpen = false;
        this.tutorialPaused = false;
        this.buttonRects = [{ x: 1, y: 2, w: 3, h: 4 }];
        this.cancelled = false;
    }
    initialize() {}
    async load() { this.loading = false; }
    update() { this.ticks = (this.ticks || 0) + 1; }
    drawHUD() {}
    onKeyPressed() { this.oldEscapeHandlerReached = true; }
    onMouseDown() { this.oldMouseHandlerReached = true; }
    onMouseUp() { this.oldMouseHandlerReached = true; }
    _cancel() { this.cancelled = true; }
}

function harness() {
    const stack = {
        pushed: [],
        popCount: 0,
        requestPaintHUD: false,
        push(scene) { this.pushed.push(scene); },
        pop() { this.popCount++; },
    };
    const Core = {
        Game: {
            current: {
                currentMapID: 3,
                ip2liveGameStates: {},
            },
        },
    };
    const Data = {
        Keyboards: {
            checkCancelMenu(key) { return String(key).toUpperCase() === 'ESCAPE'; },
            checkActionMenu(key) { return String(key).toUpperCase() === 'ENTER'; },
            isKeyEqual(key, expected) { return key === expected; },
            menuControls: { Up: 'UP', Down: 'DOWN' },
        },
        Systems: {
            soundConfirmation: { playSound() {} },
            soundCancel: { playSound() {} },
            soundCursor: { playSound() {} },
        },
    };
    const IP2Live = {
        WiresGameplayScreen: WireScreen,
        Assets: { oxaniumMediumLoaded: true },
        GameManager: {
            saveCalls: [],
            saveProgressToActiveSlot(slot, name, options) {
                this.saveCalls.push(options);
                return Promise.resolve({ saved: true, slot: 1 });
            },
        },
        DialogueManager: { discardActive() {} },
    };
    const Common = {
        Platform: {
            ctx: {
                canvas: { width: 1280, height: 720 },
                save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
                fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, fillText() {},
                createLinearGradient() { return { addColorStop() {} }; },
            },
        },
    };
    const windowObject = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        pauseSource + '\nreturn { system: IP2Live.GameplayPause, Menu: window.IP2LiveGameplayPauseMenu };'
    );
    const loaded = load(Common, Core, Data, {}, { Stack: stack }, { Base: BaseScene }, {}, {}, {}, IP2Live, function () {}, windowObject);
    loaded.system._capturePauseBackdrop = () => null;
    return { ...loaded, Common, Core, Data, IP2Live, stack };
}

async function testPauseInputAndDurableRestore() {
    const h = harness();
    const options = { mapId: 3, questId: 'quest.one', objectiveId: 'wire.one' };
    const original = new WireScreen(options);
    original.connections = { sourceA: 'A', sourceB: 'B' };
    original.lockedCorrect = { sourceA: true };
    original.score = 7;
    original.startedAt = Date.now() - 5000;
    original.endsAt = Date.now() + 5000;
    original.tutorialStep = 'controls_dialogue';
    original.tutorialDialogueOpen = true;
    original.tutorialPaused = true;
    original.buttonRects = [{ transient: true }];

    original.drawHUD();
    assert.ok(original._ip2livePauseButtonRect, 'every gameplay should draw the shared top-center pause button');
    let overlayOpen = true;
    let resumed = false;
    original._closeGameplayOverlay = () => {
        if (!overlayOpen) return false;
        overlayOpen = false;
        return true;
    };
    original.onGameplayResume = () => { resumed = true; };
    original.onKeyPressed('Escape');
    assert.equal(overlayOpen, false, 'Escape closes a gameplay popup first');
    assert.equal(h.stack.pushed.length, 0, 'closing a popup must not open Pause');
    original.onKeyPressed('Escape');
    assert.equal(original.oldEscapeHandlerReached, undefined, 'Escape must not reach the old immediate-cancel handler');
    assert.equal(h.stack.pushed.length, 1);
    h.stack.pushed[0].initialize();
    assert.deepEqual(h.stack.pushed[0].menuItems.map(item => item.title), ['RESUME', 'SETTINGS', 'EXIT QUEST']);

    const sessions = h.Core.Game.current.ip2liveGameStates.gameplaySessions;
    const keys = Object.keys(sessions);
    assert.equal(keys.length, 1);
    const saved = sessions[keys[0]];
    assert.deepEqual(saved.state.connections, { sourceA: 'A', sourceB: 'B' });
    assert.equal(saved.state.score, 7);
    assert.equal(saved.state.buttonRects, undefined, 'draw-only hit rectangles should not inflate durable saves');

    h.system.closeMenu();
    assert.equal(resumed, true, 'live resume notifies gameplay clocks');
    const restoredClock = { lastUpdateAt: 1000, questElapsedMs: 2000 };
    h.system._shiftWallClockFields(restoredClock, 5000);
    assert.equal(restoredClock.lastUpdateAt, 6000);
    assert.equal(restoredClock.questElapsedMs, 2000, 'saved elapsed quest time stays unchanged on restore');
    const restored = new WireScreen(options);
    await restored.load();
    assert.deepEqual(restored.connections, { sourceA: 'A', sourceB: 'B' });
    assert.deepEqual(restored.lockedCorrect, { sourceA: true });
    assert.equal(restored.score, 7);
    assert.ok(restored.endsAt >= saved.state.endsAt, 'wall-clock deadlines should move forward by the offline pause duration');
    assert.equal(restored.tutorialStep, 'controls_intro', 'an interrupted tutorial dialogue should safely resume its current lesson');
    assert.equal(restored.tutorialDialogueOpen, false);
    assert.equal(restored.tutorialPaused, false);
    assert.equal(restored._ip2liveRestoredSession, true);

    assert.equal(h.system.hasSession('ip_class_wires', options), true);
    h.system.clearSession('ip_class_wires', options);
    assert.equal(h.system.hasSession('ip_class_wires', options), false);
}

function testSubnetBlasterDurableRestoreAndStoryOwnership() {
    const h = harness();
    h.Core.Game.current.currentMapID = 13;
    const source = fs.readFileSync(path.join(root, 'Plugins/IP2Live_Core/gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js'), 'utf8');
    const load = new Function('Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'window',
        source + '\nreturn IP2Live.CIDRQuarantineMatrixGameplayScreen;');
    const Screen = load(h.Common, h.Core, h.Data, {}, { Stack: h.stack }, { Base: BaseScene }, {}, {}, {}, h.IP2Live, {});
    const options = { mapId: 13, questId: 'stage.13.blaster', objectiveId: 'blaster.one' };
    const original = new Screen(options);
    original.phase = 'boss';
    original.hearts = 2;
    original.bossHP = 2;
    original.bossImpactCount = 4;
    original.weapon = { operator: '-', blockSize: original.problem.blockSize };
    original.barrierHits = [4, 7, 2];
    original.projectiles = [{ x: 640, y: 250, previousY: 260, speed: 850 }];
    original.thinkRemainingMs = 32100;
    original.activeElapsedMs = 6400;
    original.decisionHistory = [{ stepKey: 'operator', correct: true, timestamp: 1234, startedAt: 1000 }];
    original.roundHistory = [{ passed: true, activeElapsedMs: 3500, completedAt: 2000 }];
    original.calculatorOpen = true;
    original.calculatorOpenedAt = Date.now() - 1000;
    original.helpOpen = true;
    original.skipHoverStartedAt = Date.now() - 500;
    original.learningTelemetryClock = { version: 1, activeElapsedMs: 6400, preparationMs: 1200,
        assistanceElapsedMs: 2500, calculatorElapsedMs: 2000, calculatorUses: 2, helpElapsedMs: 500,
        lastFrameAt: Date.now() - 50000, calculatorOverlayActive: true, calculatorWasOpen: true };
    h.system._registerScreen(original, original.gameplayId);
    const session = h.system.captureScreen(original, 'durable_restore_test');
    session.capturedAt -= 86400000;
    h.Core.Game.current.ip2liveGameStates = JSON.parse(JSON.stringify(h.Core.Game.current.ip2liveGameStates));
    const restored = new Screen(options);
    assert.equal(h.system._restoreIntoScreen(restored, restored.gameplayId), true);
    assert.equal(restored.phase, 'boss');
    assert.equal(restored.hearts, 2);
    assert.equal(restored.bossHP, 2);
    assert.equal(restored.bossImpactCount, 4);
    assert.equal(restored.problem.id, original.problem.id);
    assert.deepEqual(restored.weapon, original.weapon);
    assert.deepEqual(restored.barrierHits, original.barrierHits);
    assert.deepEqual(restored.projectiles, original.projectiles);
    assert.equal(restored.thinkRemainingMs, 32100);
    assert.equal(restored.activeElapsedMs, 6400);
    assert.deepEqual(restored.decisionHistory, original.decisionHistory, 'historical observations retain their recorded dates');
    assert.deepEqual(restored.roundHistory, original.roundHistory);
    assert.equal(restored.calculatorOpen, false, 'a separate calculator scene cannot survive a durable restore');
    assert.equal(restored.helpOpen, false);
    assert.equal(restored.calculatorOpenedAt, null, 'offline time cannot become calculator dwell');
    assert.equal(restored.skipHoverStartedAt, null);
    assert.equal(restored.lastUpdateAt, null, 'the gameplay resume hook resets its frame clock');
    assert.equal(restored.learningTelemetryClock.activeElapsedMs, 6400);
    assert.equal(restored.learningTelemetryClock.calculatorElapsedMs, 2000);
    assert.equal(restored.learningTelemetryClock.calculatorUses, 2);
    assert.equal(restored.learningTelemetryClock.calculatorOverlayActive, false);
    assert.equal(restored.learningTelemetryClock.calculatorWasOpen, false);
    assert.ok(Date.now() - restored.learningTelemetryClock.lastFrameAt < 1000);
    restored.update();
    assert.equal(restored.activeElapsedMs, 6400, 'the first frame after loading excludes the offline gap');
    assert.equal(restored.bossImpactCount, 4);

    const newStory = { currentMapID: 13, ip2liveGameStates: {} };
    h.Core.Game.current = newStory;
    assert.equal(h.system.captureActiveSession('new_story'), null);
    assert.equal(h.system.captureScreen(restored, 'stale_screen'), null);
    assert.equal(h.system._registerScreen(restored, restored.gameplayId), false);
    assert.deepEqual(newStory.ip2liveGameStates, {}, 'an old scene cannot write its puzzle into a different story');
    const fresh = new Screen(options);
    assert.equal(h.system._registerScreen(fresh, fresh.gameplayId), true);
    assert.ok(h.system.captureScreen(fresh, 'new_story'));
}

function testVLSMRestoresSharedCampaignAllocations() {
    const h = harness();
    h.IP2Live.VLSMAllocatorGameplayManager = {_state:{allocations:{}}};
    const options={mapId:3,questId:'vlsm.branch',objectiveId:'branch.hq'};
    const source=new WireScreen(options);source.gameplayId='ip_vlsm_allocator';
    source.state={allocations:{hq:{cidr:'172.30.32.0/23'}},visitOrder:['hq']};
    h.system._registerScreen(source,source.gameplayId);
    h.system.captureScreen(source,'checkpoint');
    h.Core.Game.current.ip2liveGameStates=JSON.parse(JSON.stringify(h.Core.Game.current.ip2liveGameStates));
    const restored=new WireScreen(options);restored.gameplayId='ip_vlsm_allocator';restored.state={allocations:{}};
    assert.equal(h.system._restoreIntoScreen(restored,restored.gameplayId),true);
    assert.equal(h.IP2Live.VLSMAllocatorGameplayManager._state,restored.state,'restored screen and campaign manager share allocation state');
    restored.state.allocations.eugene={cidr:'172.30.34.0/24'};
    assert.equal(h.IP2Live.VLSMAllocatorGameplayManager._state.allocations.eugene.cidr,'172.30.34.0/24');
}

async function testPauseCheckpointsStoryWithoutNumberedSlot() {
    const h = harness();
    const reasons = [];
    h.IP2Live.StoryAutosave = { checkpoint(reason) { reasons.push(reason); return Promise.resolve({ saved: true }); } };
    const screen = new WireScreen({ mapId: 3, questId: 'story.unslotted', objectiveId: 'wire.one' });
    assert.equal(h.system.open(screen, screen.gameplayId), true);
    assert.deepEqual(reasons, [], 'durable serialization must not block the opening animation');
    assert.ok(h.system.findSession(screen.gameplayId, screen.options));
    const menu = h.stack.pushed.at(-1); menu.initialize();
    for (let i = 0; i < 11; i++) menu.update();
    assert.deepEqual(reasons, [], 'the opening frames do not serialize saves');
    menu.update();
    assert.deepEqual(reasons, [], 'the fully open frame can paint before the save task');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(reasons, ['gameplay_paused']);
    assert.equal(h.IP2Live.GameManager.saveCalls.length, 1);
    menu.close();
    assert.equal(h.IP2Live.GameManager.saveCalls.length, 1, 'closing does not duplicate an already completed pause checkpoint');
    h.system.closeMenu();
    const developer = new WireScreen({ mapId: 3, developerTest: true, questId: 'developer.test', objectiveId: 'wire.test' });
    h.system.open(developer, developer.gameplayId);
    h.stack.pushed.at(-1).close();
    assert.deepEqual(reasons, ['gameplay_paused'], 'developer pauses never checkpoint the story');

    const quick = harness(), quickScreen = new WireScreen({ mapId: 3, questId: 'story.quick', objectiveId: 'wire.quick' });
    quick.system.open(quickScreen, quickScreen.gameplayId);
    quick.stack.pushed.at(-1).close();
    assert.equal(quick.IP2Live.GameManager.saveCalls.length, 1, 'quick resume still checkpoints before removing the pause');
    quick.system.closeMenu(); quick.system.open(quickScreen, quickScreen.gameplayId);
    quick.Core.Game.current = { currentMapID: 5, ip2liveGameStates: {} };
    quick.stack.pushed.at(-1).close();
    assert.equal(quick.IP2Live.GameManager.saveCalls.length, 1, 'a deferred pause never writes into a replacement story');
}

function testGameplayPausePopupResume() {
    const h = harness();
    const screen = new WireScreen({ mapId: 3, questId: 'quest.popup', objectiveId: 'wire.popup' });
    let resumed = 0;
    const animation = [];
    screen.onGameplayResume = () => { resumed++; };
    h.IP2Live.PopupChrome = { animate(_ctx, _rect, progress) { animation.push(progress); } };
    h.Common.Platform.ctx.createRadialGradient = () => ({ addColorStop() {} });
    h.IP2Live.MenuTransition = {
        open() { throw new Error('Pause must not use the TV transition'); },
        back() { throw new Error('Resume must not use the TV transition'); },
    };

    assert.equal(h.system.open(screen), true);
    const menu = h.stack.pushed.at(-1);
    menu.initialize();
    menu._drawPanel = () => {};
    menu._drawSectionRail = () => {};
    menu._drawMenuButton = () => {};
    menu.drawHUD();
    assert.equal(animation.at(-1), 0, 'the pause panel starts at the beginning of the popup animation');
    for (let i = 0; i < 12; i++) menu.update();
    assert.equal(menu.fadeIn, 1, 'pause panel finishes its popup entrance');
    menu.drawHUD();
    assert.equal(animation.at(-1), 1);

    assert.equal(menu._resume(), true);
    assert.equal(h.stack.popCount, 0, 'resume keeps gameplay covered during the popup exit');
    assert.equal(resumed, 0, 'gameplay clock stays paused during the exit animation');
    menu.update();
    menu.drawHUD();
    assert.ok(animation.at(-1) < 1, 'the popup reverses before gameplay resumes');
    for (let i = 0; i < 8; i++) menu.update();
    assert.equal(h.stack.popCount, 1);
    assert.equal(resumed, 1);
    assert.equal(h.system.menuOpen, false);
}

async function testExitQuestCheckpointsBeforeCancel() {
    const h = harness();
    const options = { mapId: 3, questId: 'quest.exit', objectiveId: 'wire.exit' };
    const screen = new WireScreen(options);
    screen.connections = { sourceC: 'C' };
    screen.drawHUD();
    h.system.open(screen, 'ip_class_wires');
    const menu = h.stack.pushed.at(-1);
    menu.initialize();
    await menu._exitQuest();
    await new Promise((resolve) => setTimeout(resolve, 5));

    assert.equal(screen.cancelled, true, 'Exit Quest should call the gameplay cancellation path after saving');
    assert.equal(h.stack.popCount, 1, 'the gameplay pause overlay should close before the gameplay exits');
    assert.equal(h.IP2Live.GameManager.saveCalls.at(-1).checkpointReason, 'gameplay_exit_quest');
    assert.equal(h.system.activeScreen, null);
    assert.equal(h.system.hasSession('ip_class_wires', options), true, 'Exit Quest must retain resumable state');
}

async function testDeveloperExitDiscardsSession() {
    const h = harness();
    const storyOptions = { mapId: 3, questId: 'quest.story', objectiveId: 'wire.story' };
    const story = new WireScreen(storyOptions);
    story.connections = { sourceA: 'A' };
    h.system.captureScreen(story, 'story_checkpoint');
    // Simulate a session captured by an older build, before developer runs were excluded.
    const options = { mapId: 3, questId: 'test.legacy', objectiveId: 'wire.test' };
    const screen = new WireScreen(options);
    screen.connections = { sourceB: 'B' };
    assert.ok(h.system.captureScreen(screen, 'legacy_test'));
    options.spec = { developerTest: true };
    assert.equal(h.system.findSession('ip_class_wires', options), null);
    assert.equal(h.system.captureScreen(screen, 'test_checkpoint'), null);
    const fresh = new WireScreen(options);
    assert.equal(h.system._restoreIntoScreen(fresh, 'ip_class_wires'), false);
    await fresh.load();
    assert.deepEqual(fresh.connections, {}, 'developer tests cannot restore an old session');
    h.system.open(screen, 'ip_class_wires');
    const menu = h.stack.pushed.at(-1);
    menu.initialize();
    await menu._exitQuest();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(screen.cancelled, true);
    assert.equal(h.IP2Live.GameManager.saveCalls.length, 0, 'quitting a test must not checkpoint campaign state');
    assert.equal(h.system.hasSession('ip_class_wires', { mapId: 3, questId: 'test.legacy', objectiveId: 'wire.test' }), false,
        'quitting clears legacy testing progress');
    assert.equal(h.system.hasSession('ip_class_wires', storyOptions), true, 'story progress is still retained');
}

function testGameManagerResumesWithoutReplayingIntro() {
    const IP2Live = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        managerSource + '\nreturn IP2Live.GameManager;'
    );
    const manager = load(
        {},
        { Game: { current: { currentMapID: 3 } } },
        { Systems: { saveSlots: 9 } },
        {},
        { Stack: {} },
        { Map: { current: null } },
        {}, {}, {}, IP2Live, function () {}, {}
    );
    let launchOptions = null;
    let dialogueRuns = 0;
    IP2Live.GameplayPause = {
        findSession() { return { capturedAt: 123, state: { connections: { sourceA: 'A' } } }; },
    };
    IP2Live.GameplayManager = {
        launchWireGameplay(options) { launchOptions = options; return true; },
    };
    manager._ensureQuestMinimap = function () {};
    manager._openReportAttempt = function () {};
    manager._runTimingDialogues = function () { dialogueRuns++; return true; };

    assert.equal(manager.startGameplayNode('ip_class_wires', {
        mapId: 3,
        questId: 'quest.resume',
        objectiveId: 'wire.resume',
        spec: { id: 'quest.resume', objectiveId: 'wire.resume', mapId: 3, tutorial: true },
    }), true);
    assert.equal(dialogueRuns, 0, 'a resumed gameplay must not replay its before-gameplay briefing');
    assert.equal(launchOptions._ip2liveResumeGameplay, true);
    assert.equal(launchOptions._ip2liveResumeCapturedAt, 123);
    manager._activeGameplayNode = null;
    manager._runTimingDialogues = () => false;
    let staleTestsCleared = 0;
    IP2Live.GameplayPause.clearSession = () => { staleTestsCleared++; };
    IP2Live.GameplayPause.findSession = () => { throw new Error('Developer launch must not request a saved session'); };
    assert.equal(manager.startGameplayNode('ip_class_wires', {
        developerTest: true,
        spec: { id: 'developer.gameplay_test.wires', objectiveId: 'wire.test', developerTest: true },
    }), true);
    assert.equal(launchOptions._ip2liveResumeGameplay, false, 'developer launches always begin fresh');
    assert.equal(staleTestsCleared, 1);
}

async function main() {
    await testPauseInputAndDurableRestore();
    testSubnetBlasterDurableRestoreAndStoryOwnership();
    testVLSMRestoresSharedCampaignAllocations();
    await testPauseCheckpointsStoryWithoutNumberedSlot();
    testGameplayPausePopupResume();
    await testExitQuestCheckpointsBeforeCancel();
    await testDeveloperExitDiscardsSession();
    testGameManagerResumesWithoutReplayingIntro();
    assert.match(managerSource, /opts\.skipBeforeDialogues \|\| resumeSession/);
    assert.match(managerSource, /clearSession\(gameplayId, data\)/);
    assert.match(loaderSource, /'gameplay-pause\.js'/);
    console.log('gameplay_pause_persistence.test.cjs: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
