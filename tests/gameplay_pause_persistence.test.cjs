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
}

async function main() {
    await testPauseInputAndDurableRestore();
    await testExitQuestCheckpointsBeforeCancel();
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
