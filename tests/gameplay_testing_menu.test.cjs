const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'Plugins', 'IP2Live_Core');

function read(relativePath) {
    return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function loadGameManager() {
    const IP2Live = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        read('modules/game_manager.js') + '\nreturn IP2Live.GameManager;'
    );
    const manager = load(
        {},
        { Game: { current: { currentMapID: 3 } } },
        { Systems: { saveSlots: 9 } },
        {},
        { Stack: {} },
        { Map: { current: null } },
        {},
        {},
        {},
        IP2Live,
        function () {},
        {}
    );
    return { manager, IP2Live };
}

function testCatalogCoverageAndNames() {
    const { manager } = loadGameManager();
    const tests = manager.getGameplayTestCatalog();
    assert.equal(manager.enableGameplayTestingButton, true);
    assert.equal(tests.length, 22);
    assert.deepEqual(Array.from(tests, (entry) => entry.name), [
        'Gameplay 1 Tutorial',
        'Gameplay 1',
        'Gameplay 1 Harder Tutorial',
        'Gameplay 1 Harder',
        'Gameplay 2 Tutorial',
        'Gameplay 2',
        'Gameplay 3 Tutorial',
        'Gameplay 3',
        'Gameplay 3 Harder Tutorial',
        'Gameplay 3 Harder',
        'Gameplay 4 Tutorial',
        'Gameplay 4',
        'Gameplay 4.5 Tutorial',
        'Gameplay 4.5',
        'Gameplay 5 Tutorial',
        'Gameplay 5',
        'Gameplay 6 Tutorial',
        'Gameplay 6',
        'Gameplay 7 Tutorial',
        'Gameplay 7',
        'Gameplay 8 Tutorial',
        'Gameplay 8',
    ]);

    for (let i = 0; i < tests.length; i += 2) {
        assert.equal(tests[i].tutorial, true, tests[i].name + ' should be a tutorial target');
        assert.equal(tests[i].spec.tutorial, true, tests[i].name + ' should carry tutorial mode into its gameplay');
        assert.equal(tests[i + 1].tutorial, false, tests[i + 1].name + ' should be a standard target');
        assert.equal(tests[i + 1].spec.tutorial, false, tests[i + 1].name + ' should disable tutorial mode');
    }
    assert.equal(
        tests.find((entry) => entry.id === 'gameplay-1-harder-tutorial').dialogueObjectiveId,
        'repair_ip_wires_harder_01_tutorial',
        'the harder tutorial should retain its authored dialogue binding'
    );
}

function testLaunchIsIsolatedFromQuestProgress() {
    const { manager, IP2Live } = loadGameManager();
    let captured = null;
    manager.startGameplayNode = function (gameplayId, options) {
        captured = { gameplayId, options };
        return true;
    };
    IP2Live.GameplayManager = { _introShown: true };

    assert.equal(manager.launchGameplayTest('gameplay-1-tutorial'), true);
    assert.equal(captured.gameplayId, 'ip_class_wires');
    assert.match(captured.options.questId, /^developer\.gameplay_test\./);
    assert.equal(captured.options.objectiveId, 'repair_ip_wires_01', 'the original objective binding is needed for tutorial dialogue lookup');
    assert.equal(captured.options.spec.developerTest, true);
    assert.equal(captured.options.spec.developerTestSourceQuestId, 'stage.3.ip_wires.01.tutorial');
    assert.equal(captured.options.skipBeforeDialogues, false, 'test runs should include normal pre-gameplay dialogue');
    assert.equal(captured.options.tutorialMode, true);
    assert.equal(IP2Live.GameplayManager._introShown, false, 'tutorial launches should reset one-time intro guards');

    manager.enableGameplayTestingButton = false;
    captured = null;
    assert.equal(manager.launchGameplayTest('gameplay-1'), false);
    assert.equal(captured, null);
}

function testDeveloperRunsBypassPersistentSystems() {
    const { manager, IP2Live } = loadGameManager();
    let neuralPrepareCalls = 0;
    let gameplayLaunchCalls = 0;
    let reportCalls = 0;
    let completionCalls = 0;
    const dialogueTimings = [];
    IP2Live.NeuralLifeForce = {
        prepareLaunchOptions() { neuralPrepareCalls++; return { neuralRunBlocked: true }; },
        handleCompletion() { completionCalls++; },
    };
    IP2Live.GameplayManager = {
        launchWireGameplay() { gameplayLaunchCalls++; return true; },
    };
    manager._openReportAttempt = function () { reportCalls++; };
    manager._runTimingDialogues = function (scope, timing, onComplete) {
        dialogueTimings.push({ scope, timing });
        if (typeof onComplete === 'function') onComplete();
        return true;
    };

    const spec = {
        id: 'developer.gameplay_test.gameplay_1',
        objectiveId: 'repair_ip_wires_01',
        gameplayId: 'ip_class_wires',
        mapId: 3,
        developerTest: true,
    };
    assert.equal(manager.startGameplayNode('ip_class_wires', {
        spec,
        questId: spec.id,
        objectiveId: spec.objectiveId,
        developerTest: true,
        skipBeforeDialogues: false,
    }), true);
    assert.equal(neuralPrepareCalls, 0, 'developer runs must still open after a normal run is over');
    assert.equal(gameplayLaunchCalls, 1);
    assert.equal(reportCalls, 0, 'developer runs must not create report attempts');
    assert.equal(dialogueTimings[0].timing, 'before', 'developer runs should resolve the gameplay opening dialogue');
    assert.equal(dialogueTimings[0].scope.objectiveId, 'repair_ip_wires_01');

    manager.handleGameplayCompleted('ip_class_wires', { spec, result: { passed: true } });
    assert.equal(completionCalls, 0, 'developer completion must not alter Neural Life Force');
    assert.equal(dialogueTimings[1].timing, 'after', 'developer runs should also resolve completion dialogue');
}

function testPauseHeaderButtonPlacementAndFlag() {
    const { manager } = loadGameManager();
    const IP2Live = {
        GameManager: manager,
        Assets: { abnesLoaded: true, nebulaLoaded: true },
        BgFx: { create() { return {}; } },
        TextScramble: { create() { return {}; } },
    };
    const Common = {
        ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 },
        Platform: { ctx: { canvas: { width: 1280, height: 720 } } },
    };
    const Scene = { Base: class {} };
    const windowObject = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        read('modules/screens/pause-menu.js') + '\nreturn window.IP2LivePauseMenu;'
    );
    const PauseMenu = load(Common, { Game: {} }, {}, {}, {}, Scene, {}, {}, {}, IP2Live, function () {}, windowObject);
    const menu = new PauseMenu();
    menu.initialize();
    const testButton = menu._gameplayTestButtonLayout(1280, 720);
    const settingsButton = menu._settingsButtonLayout(1280, 720);
    assert.ok(testButton.x < settingsButton.x, 'testing belongs on the upper-left side of the header');
    assert.equal(testButton.y, settingsButton.y, 'testing and settings must share the same header line');
    assert.equal(menu._isGameplayTestButtonAt(testButton.x + 1, testButton.y + 1), true);

    const gradient = { addColorStop() {} };
    const ctx = {
        fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0, lineWidth: 1,
        font: '', textAlign: '', textBaseline: '',
        save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {},
        moveTo() {}, lineTo() {}, rect() {}, fill() {}, stroke() {},
        fillRect() {}, fillText() {}, createLinearGradient() { return gradient; },
    };
    menu.gameplayTestMode = true;
    menu._drawGameplayTestOverlay(ctx, 1280, 720);
    assert.ok(menu.gameplayTestItemRects.length > 0, 'the selector should render clickable gameplay rows');

    manager.enableGameplayTestingButton = false;
    assert.equal(menu._isGameplayTestButtonAt(testButton.x + 1, testButton.y + 1), false);
}

testCatalogCoverageAndNames();
testLaunchIsIsolatedFromQuestProgress();
testDeveloperRunsBypassPersistentSystems();
testPauseHeaderButtonPlacementAndFlag();
console.log('gameplay testing menu tests passed');
