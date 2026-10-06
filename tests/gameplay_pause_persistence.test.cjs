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
    testGameplayPausePopupResume();
    await testExitQuestCheckpointsBeforeCancel();
    await testDeveloperExitDiscardsSession();
    testGameManagerResumesWithoutReplayingIntro();
    assert.match(managerSource, /opts\.skipBeforeDialogues \|\| resumeSession/);
    assert.match(managerSource, /captureActiveSession\(\(options && options\.checkpointReason\)/);
    assert.match(managerSource, /clearSession\(gameplayId, data\)/);
    assert.match(loaderSource, /'gameplay-pause\.js'/);
    console.log('gameplay_pause_persistence.test.cjs: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
